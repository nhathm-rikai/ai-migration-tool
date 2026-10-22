# Dev nên mở file nào?

Analyze tĩnh đã có ở thư viện/CLI độc lập. Các ví dụ Analysis job và Claude CLI trong trang này vẫn là thiết kế tích hợp tương lai.

Ngày 14/10/2026 đã init **backend Projects fixture**. Phần 1 dẫn file thật; các mục jobs/CLI/SSE/Analyze bên dưới vẫn là bản đồ thiết kế cho task tương lai. Cách chạy/API/edge case hiện có ở [README backend](../../apps/api/README.md). Không coi snippet hoặc module dự kiến là tính năng đã chạy.

Ngày 15/10 đã có [FE Projects](../../apps/web/README.md). Khi thêm API/UI, theo [mẫu policy và lỗi API](patterns/api-errors-policy.md) để lần theo policy chung, public error code, transport, thông báo theo feature và failure tests. Các ví dụ jobs/CLI/Analyze vẫn là thiết kế đích.

## 1. Luồng đọc source đầu tiên

Theo một request tạo project:

```text
PowerShell/client -> POST /api/v1/projects { name, fixtureId: "sample-vb6" }
  -> CreateProject schema -> project.routes.ts
  -> project.service.ts (trim name, ID/time, mode demo)
  -> project.repository.ts -> SQLite
  -> response schema -> client
```

Thứ tự đọc file thật: [schema](../../packages/contracts/src/project.schema.ts) → [route](../../apps/api/src/modules/projects/project.routes.ts) → [service](../../apps/api/src/modules/projects/project.service.ts) → [repository](../../apps/api/src/modules/projects/project.repository.ts) → [integration test](../../apps/api/src/modules/projects/project.integration.test.ts). Xem [composition](../../apps/api/src/composition.ts) để biết dependency nối ở đâu. UI Projects đã có; chưa có WorkspaceProvider. Request chứa `sourcePath` bị từ chối, không truy cập source khách hàng.

Ví dụ **tương lai khi bật source thật**, không phải implementation hiện tại: service chỉ giữ policy, được truyền dependency; các type dưới đây là tối giản để minh họa:

```ts
type Project = { id: string; name: string; rootId: string };
type CreateProjectInput = { name: string; sourcePath: string };
type ProjectDependencies = {
  workspace: { validateAndRegisterRoot(path: string): Promise<{ rootId: string }> };
  repository: { create(input: Project): Promise<Project> };
  nextId(): string;
};

export function createProjectService(deps: ProjectDependencies) {
  return {
    async create(input: CreateProjectInput): Promise<Project> {
      const root = await deps.workspace.validateAndRegisterRoot(input.sourcePath);
      return deps.repository.create({
        id: deps.nextId(), name: input.name, rootId: root.rootId,
      });
    },
  };
}
```

Input đã qua schema; adapter kiểm tra path thật theo DATA-03, không chỉ kiểm tra string có tồn tại. Repository chịu trách nhiệm parameterized SQL. Production service phải xử lý thêm invariant/rollback cho tài nguyên nó sở hữu; ví dụ này không thay bộ kiểm tra đó.

## 2. Thêm field mô tả project

1. `packages/contracts/src/project.schema.ts`: request/response, giới hạn chiều dài và optional/default rõ ràng.
2. `apps/api/migrations/<next>-project-description.sql`: thêm cột, giữ được project cũ; không sửa migration đã phát hành.
3. `project.repository.ts`: map/ghi/đọc field, parameter hóa SQL.
4. `project.service.ts`: normalize hoặc rule nghiệp vụ nếu có; route chỉ sửa nếu contract/response mapping cần.
5. `apps/web/src/features/projects/`: form, validation message và hiển thị.
6. Test API + migration với dữ liệu cũ. Rule: BE-02, DATA-01, DATA-02, FE-01.

Không thêm một interface DTO riêng bên UI giống schema backend.

## 3. Thêm điều kiện không được chạy trùng

1. `jobs/job.service.ts`: quy định active run theo project, idempotency semantics.
2. `jobs/job.repository.ts` + migration: unique/ràng buộc và insert/claim nguyên tử.
3. `jobs/job-dispatcher.ts`: bảo đảm slot toàn runtime chỉ dành cho một job AI.
4. `jobs/job.routes.ts`: map ACTIVE_RUN_EXISTS thành 409 theo error handler.
5. UI jobs: hiển thị run đang có; giữ key khi retry HTTP.
6. Test hai request đồng thời: cùng key → cùng run; khác key cùng project → chỉ một active run. Rule: JOB-01, JOB-02, FE-03.

Reviewer phải bắt được lỗi “SELECT không thấy active run → cả hai request cùng INSERT” dù test tuần tự pass.

## 4. CLI timeout hoặc cancel không dừng được

1. `adapters/claude/process-tree.ts`: ownership, stop cả cây, chờ exit và cleanup.
2. `adapters/claude/claude-cli.runner.ts`: timeout/cancellation signal và structured result.
3. `jobs/job.service.ts` + `job-state.ts`: reason/status, expected version, bỏ completion muộn.
4. `job-dispatcher.ts` + `job-recovery.ts`: giữ slot/RECOVERY_REQUIRED nếu chưa xác nhận process dừng.
5. UI jobs: thông báo cần phục hồi runtime, không chỉ đổi nút thành Start.
6. Test bằng process fixture có child process trên từng OS đích (Windows và POSIX adapter); fake runner test race riêng. Rule: JOB-02, JOB-04, JOB-05, QA-03.

Không chỉ tăng timeout hoặc gọi `child.kill()` rồi mặc định cả cây đã chết.

## 5. JSON AI bị chia giữa nhiều chunk

1. `adapters/claude/stream-parser.ts`: decoder streaming, buffer dòng dở, giới hạn kích thước.
2. `analysis/validators/`: schema business artifact; không để parser quyết định artifact approved.
3. Test split tại giữa ký tự UTF-8, JSON string, delimiter; output cuối thiếu dòng hoặc JSON lỗi phải có kết quả xác định.
4. Rule: JOB-07, JOB-08, AI-04. Không sửa React để che output lỗi của CLI.

## 6. Evidence sai hoặc source đã thay đổi

1. `adapters/local/local-workspace.provider.ts`: snapshot/encoding/hash thực tế.
2. `analysis/validators/`: quote, line range, hash và trạng thái cần xác minh.
3. `artifacts/artifact.service.ts`: version bất biến.
4. `reviews/review.service.ts`: expected version, stale review và audit.
5. UI artifacts/reviews: xem đúng source snapshot, nhãn draft/stale rõ.
6. Test quote đúng nhưng suy luận cần người duyệt; source mới không thừa hưởng approval cũ. Rule: DATA-04, DATA-06, DATA-07, FE-05.

## 7. Thêm bước phân tích hoặc thay prompt

1. `analysis/prompts/`: prompt có version và input được kiểm soát.
2. `packages/contracts/src/understanding.schema.ts` (dự kiến khi init): bám [payload schema](contracts/understanding-payload.schema.json) và [BR/Design contract](specs/understanding-contract.md); envelope artifact giữ metadata backend riêng.
3. `analysis/analysis.service.ts`: thứ tự bước, input/output và policy retry có giới hạn.
4. `analysis/validators/`: kiểm tra kết quả/evidence; fixture mẫu.
5. UI artifacts và exporter nếu output hiển thị đổi.
6. Adapter Claude chỉ thay khi giao thức thực thi đổi, không vì tên bước nghiệp vụ mới. Rule: AI-01, AI-04, AI-05.

## 8. Mất SSE hoặc xem nhầm run khi đổi trang

1. `apps/web/src/shared/api/`: cleanup kết nối, reconnect/backoff.
2. Hook jobs: filter runId, version/sequence; GET state sau reconnect.
3. Backend SSE plugin: listener cleanup và thông tin event.
4. Test mở run A rồi chuyển B khi response A đến trễ; B không nhận trạng thái A. Rule: FE-03, FE-04, JOB-06.

## 9. Ví dụ review có thể hành động

Ví dụ giả định, vị trí minh họa chưa phải finding của source hiện tại:

```text
[P1] Nhả slot khi process con chưa được xác nhận đã dừng
Vị trí: apps/api/src/modules/jobs/job.service.ts:<dòng cleanup thực tế>
Rule: JOB-04
Trigger: cancel job, child process vẫn sống nhưng finally đã release slot.
Tác động: job kế tiếp chạy cùng process cũ, phá giới hạn một job và có thể ghi artifact muộn.
Bằng chứng cần lấy: call path cleanup và process fixture trên OS đích theo platform-support.
Hướng sửa: chờ cleanup xác nhận; nếu thất bại chặn dispatcher bằng RECOVERY_REQUIRED.
Kiểm chứng: child còn sống thì Start mới không spawn; cleanup xong mới cho chạy.
```

Review thực phải thay placeholder bằng file/dòng và bằng chứng đã đọc/chạy; chưa có bằng chứng thì ghi cần xác minh.

## 10. Prompt giao task và review

```text
Dùng portal-implement. Thêm mô tả project tối đa 500 ký tự.
Mục tiêu: feature Projects/api/storage/ui, dữ liệu fixture, chưa chạy CLI thật.
Acceptance: project cũ vẫn mở được; tạo/sửa/đọc đúng mô tả;
input quá giới hạn trả lỗi; UI hiển thị lỗi và không mất dữ liệu đang nhập.
Theo convention hiện có, báo file thay đổi và kiểm tra đã chạy.
```

```text
Dùng portal-techlead-review. Review thay đổi của task mô tả project.
Phạm vi: <diff/commit hoặc danh sách file thật>.
Gate: feature Projects; không nghiệm thu toàn MS1.
Chỉ báo findings và kiểm chứng, không sửa code.
```

## 11. Phân biệt thiếu tính năng với vi phạm gate

- Task init + fake runner chưa có CLI cancel thật: ghi việc trước LIVE, không yêu cầu làm ngay (JOB-04).
- Task bật CLI thật mà cancel chỉ đổi UI: finding JOB-04/LIVE; phải dừng process thật và kiểm chứng.
- MS1 cô lập artifact orphan, không public kết quả dở, có hướng dẫn xử lý: đạt mức tối thiểu DATA-05. Thiếu auto-cleanup DATA-10/LATER không chặn.
- PR thêm scheduled backup chưa có task: yêu cầu quay về scope, không dùng MUST để tự mở rộng.
- Rule naming CORE-03 là SHOULD; review đưa suggestion. Query không parameter hóa là DATA-01/MUST khi repository được implement.

## 12. Thêm decoder và LoC

1. `adapters/local/` (dự kiến): raw snapshot, decoder CP932/BOM, normalized view và manifest theo [source-analysis](specs/source-analysis.md).
2. `analysis/inventory.ts`: phân loại physical lines, designer/metadata/comment/code; unsupported không được giả thành 0.
3. Contracts inventory: metric version, counters, coverage và lỗi per-file; giữ evidence theo toàn file.
4. Fixture sạch + expected do người review đối chiếu: CP932 extension, CRLF, designer, Rem/string/colon/continuation; không commit source BSN.
5. Acceptance: fixture exact; corpus KPI chỉ công bố khi có baseline cùng metric. Rule DATA-04/DATA-06/AI-04; đây là FEATURE:analysis, trước LIVE phải kiểm decoder thật.
