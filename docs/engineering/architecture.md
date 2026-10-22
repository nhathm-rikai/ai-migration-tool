# Kiến trúc Portal v1

**Bản 1.1.** Đây là kiến trúc đích của Portal v1, không phải checklist phải làm xong trong PR init. Theo [delivery-gates](delivery-gates.md) để chọn phần bắt buộc ở task hiện tại; triển khai phương án tối thiểu đã mô tả trước khi thêm tự động hóa.

## 1. Hành vi sản phẩm

Người dùng nhập đường dẫn source local → kiểm tra đầu vào → tạo snapshot → Analyze/Understand → đọc inventory, BR/Design/Rule draft kèm evidence → review → export JSON/HTML và in PDF từ browser. Có demo dữ liệu mẫu được gắn nhãn, dùng được khi không gọi AI.

Một project có nhiều run. Mỗi run khóa một snapshot source, cấu hình phân tích, phiên bản prompt/schema và bộ rule nghiệp vụ đã được duyệt. Kết quả thành công về mặt kỹ thuật vẫn là bản nháp cho đến khi con người review. Analyze theo [encoding/LoC spec](specs/source-analysis.md); Understand theo [BR/Design contract](specs/understanding-contract.md). Rule convert VB6 → C# là bộ riêng.

## 2. Stack và lý do

- React + Vite + TypeScript cho UI; tổ chức component/hook theo feature.
- Node.js + TypeScript + Fastify cho API và điều phối job; dùng ESM và TypeScript strict.
- Một repo, npm workspaces: `apps/web`, `apps/api`, `packages/contracts`. Một lockfile ở root; chưa cần monorepo build orchestrator.
- TypeBox cho schema JSON và suy ra DTO; dùng type provider tương thích của Fastify. Chọn cặp phiên bản TypeBox/provider lúc init, không trộn API từ các major khác nhau. [Tài liệu](https://fastify.dev/docs/latest/Reference/Type-Providers/).
- SQLite qua `better-sqlite3`, SQL có parameter và migration đánh số. Database chỉ lưu metadata vừa phải; artifact lớn nằm ở filesystem. Driver có native component nên phải smoke trên từng OS/CPU/Node được công bố hỗ trợ theo [platform-support](platform-support.md); bằng chứng init hiện chỉ có Windows. [Driver](https://github.com/WiseLibs/better-sqlite3).
- REST cho command/query; SSE cho thông báo tiến độ. UI lấy trạng thái chính thức qua API khi reconnect.
- Vitest cho unit/integration, Fastify `inject` cho HTTP test; Playwright cho các luồng browser quan trọng. [Fastify testing](https://fastify.dev/docs/latest/Guides/Testing/), [Vitest](https://vitest.dev/guide/).
- ESLint + Prettier + `tsc --noEmit`; khóa phiên bản runtime/dependency và scripts khi init.

Đây là một backend theo module, chạy một instance cho mỗi thư mục dữ liệu. Dispatcher nội bộ chỉ cho một job AI hoạt động. Chưa cần Redis, microservice, DI container, CQRS hoặc event bus tổng quát. Dependency truyền qua factory/constructor ở composition root.

## 3. Cấu trúc source đích

Ngày 14/10/2026 đã tạo `apps/api` và `packages/contracts`: Projects API/service/repository, config, DB/migrations, error handler và fake AgentRunner dùng trong test. [README backend](../../apps/api/README.md) chỉ rõ file thật và lệnh chạy. Cây bên dưới gồm cả các module **chưa triển khai**; UI Projects đã được thêm tại `apps/web` ngày 15/10; CLI/jobs/analysis/artifacts/reviews chưa được triển khai. Projects hiện chỉ nhận `fixtureId`, chưa đăng ký source root thật.

```text
apps/
  api/src/
    app.ts                       # tạo Fastify, đăng ký plugin/module; không listen
    server.ts                    # load config, khóa instance, recovery, listen/shutdown
    composition.ts               # nối service với repository/adapter thật
    config.ts                    # đọc/validate env đúng một nơi
    plugins/                     # HTTP security, error handler, logger, SSE plumbing
    modules/
      projects/                  # project.routes.ts, project.service.ts, project.repository.ts
      jobs/                      # job.routes.ts, job.service.ts, job.repository.ts
                                 # job-state.ts, job-dispatcher.ts, job-recovery.ts
      analysis/                  # analysis.service.ts, inventory.ts, prompts/, validators/
      artifacts/                 # artifact.service.ts, artifact.repository.ts, export.service.ts
      reviews/                   # review.routes.ts, review.service.ts, review.repository.ts
    ports/                       # agent-runner.ts, workspace-provider.ts, artifact-store.ts
    adapters/
      claude/                    # claude-cli.runner.ts, stream-parser.ts, process-tree.ts
      local/                     # local-workspace.provider.ts, filesystem-artifact.store.ts
    db/                          # SQLite connection và migration runner
    shared/                      # app-error.ts, clock/id contracts thật sự dùng chung
  api/migrations/                # 0001-initial.sql, 0002-...sql
  web/src/
    app/                         # router, app shell, providers
    features/                    # projects/, jobs/, artifacts/, reviews/
    shared/api/                  # api-client.ts, SSE client
    shared/ui/                   # component hiển thị dùng chung
packages/contracts/src/          # project/source-registration/run/artifact/error schema, analyze-api.ts, fixtures/
tests/e2e/                       # browser test bằng fixture sạch
tests/fixtures/                  # source giả lập và expected result nhỏ
docs/engineering/                # bộ hướng dẫn này
```

Test unit/integration đặt cạnh module dưới tên `*.test.ts` / `*.integration.test.ts`. Chưa tạo file rỗng cho module chưa làm. Một service đơn giản có thể ít dòng; chỉ tách thêm khi có trách nhiệm riêng, không tạo base class chung cho mọi feature.

## 4. Trách nhiệm và chiều dependency

- **Route** đọc params/body đã validate, gọi service và ánh xạ HTTP; không SQL, filesystem hay spawn process.
- **Service** quyết định nghiệp vụ; nhận DTO/domain value và dependency rõ ràng. Không nhận Fastify request/reply, không tự đọc env.
- **Repository** giữ SQL và transaction ngắn trong module. Interface và implementation có thể cùng file ở v1; service chỉ phụ thuộc type/interface.
- **Port/adapter** tách thao tác ngoài ứng dụng: AgentRunner chạy AI, WorkspaceProvider tạo/đọc snapshot, ArtifactStore lưu artifact. Adapter không quyết định approval hay chuyển trạng thái workflow.
- **Composition root** khởi tạo adapter/repository/service và truyền vào route. Fastify decorator dùng cho phần hạ tầng HTTP, không biến service thành dependency của Fastify.
- `packages/contracts` không import Node, database, Fastify hoặc React. UI chỉ import public DTO/schema; không import backend.
- Theo CORE-09, tên công ty không đi vào package/env/domain/storage identity. Branding UI/export nằm ở cấu hình trình bày/asset/template khi có feature; không dùng tên hiển thị hay logo để quyết định nghiệp vụ hoặc thư mục dữ liệu. Naming baseline hiện tại: `@portal/*`, `PORTAL_*`, `MigrationPortal/portal-dev`.
- Module gọi service/public interface của module khác, không truy cập trực tiếp repository nội bộ của nhau. Transaction liên module được thiết kế ở use case và nối qua composition, không lấy kết nối DB tùy tiện từ route.

Mẫu Fastify tham khảo là [official demo](https://github.com/fastify/demo). Ranh giới service, module job và các quy tắc dưới đây là thiết kế riêng của RIKAI, không tuyên bố demo đã có sẵn những phần này.

## 5. Luồng Start analysis

1. UI gửi project ID và `Idempotency-Key` mới cho một ý định chạy; gửi lại request do mất mạng dùng cùng key.
2. Service kiểm tra project, giới hạn đầu vào và tạo run `queued` trong transaction. Unique key + request fingerprint giúp request đồng thời trả cùng run; cùng key nhưng payload khác trả conflict.
3. Dispatcher claim một run bằng cập nhật nguyên tử. Nếu project còn run queued/running/cancelling, yêu cầu Start mới cho project đó bị từ chối; project khác có thể xếp hàng.
4. Khi run được claim, tạo snapshot bất biến từ file cho phép. Lưu manifest/hash/encoding; báo lỗi nếu phát hiện file thay đổi trong lúc copy, thay vì tạo evidence trên đầu vào không nhất quán.
5. Inventory tĩnh chạy trước; Analysis service dựng prompt và gọi AgentRunner với snapshot, giới hạn và cancellation signal.
6. Adapter parse stream có giới hạn, trả kết quả; service validate schema/evidence và lưu artifact, metadata, trạng thái. Sự kiện SSE chỉ phát sau khi trạng thái đã được ghi.
7. UI xem artifact và review phiên bản cụ thể. Refresh/trở lại trang đọc run hiện có, không tự Start lại.

Mỗi run có `id`, `projectId`, `retryOfRunId?`, `sourceSnapshotId?`, `status`, `stateVersion`, thời gian UTC, `errorCode?` và cấu hình đã khóa. Snapshot ID có thể chưa có khi queued; phải có trước khi gọi AI. Retry là run mới. Một retry có thể chọn snapshot cũ để tái lập hoặc snapshot mới để phân tích source mới; lựa chọn hiển thị rõ và được lưu.

## 6. Vòng đời job

```text
queued -> running -> succeeded
                  -> failed
                  -> cancelling -> cancelled
                                -> failed (không xác nhận được việc dừng process)
queued -> cancelled
running/cancelling -> interrupted (khởi động lại sau khi crash)
```

`succeeded`, `failed`, `cancelled`, `interrupted` là terminal. Timeout chạy qua nhánh dừng process và kết thúc `failed/TIMEOUT`; cancel của người dùng kết thúc `cancelled`. `stateVersion` và cập nhật có điều kiện giải quyết race finish/cancel: terminal đã commit thì không đổi; nếu cancellation đã thắng, completion muộn không được chuyển thành succeeded.

DB job terminal **không đủ để nhả slot** nếu process có thể còn sống. Khi không xác nhận được cleanup, runtime giữ trạng thái `RECOVERY_REQUIRED`, chặn job AI mới và hướng dẫn người vận hành xử lý. Startup giữ lock data directory, kiểm tra ownership của process trước khi dừng; không kill theo PID cũ đơn độc. Chỉ resume queue sau recovery thành công; không tự chạy lại job interrupted. LIVE/MS1 cho phép cleanup thủ công theo hướng dẫn đã test; tự động phục hồi mọi stale lock/process nằm ở LATER.

SSE chứa run ID, số thứ tự và trạng thái/progress; không phải nguồn sự thật. V1 không bắt buộc replay toàn bộ log: reconnect lấy snapshot API, bỏ event cũ theo version/sequence. Khi mất SSE, UI hiển thị mất kết nối và polling có backoff; ngắt kết nối browser không cancel job.

## 7. Dữ liệu, review và nguồn code khách hàng

- Thư mục dữ liệu riêng, ví dụ dưới LocalAppData trên Windows; không để trong source khách hàng hay trong Git. Path do config quyết định, không hardcode user/máy.
- SQLite lưu project/run/manifest index/artifact index/review/event metadata. Filesystem lưu snapshot và nội dung artifact theo ID do server sinh.
- Review append-only, khóa vào artifact version + source hash. Review cũ vẫn là lịch sử hợp lệ cho version cũ; không được áp dụng cho artifact/source mới.
- Evidence lưu relative path, dòng 1-based, quote, hash và trạng thái đã kiểm chứng/cần xác minh. Việc quote tồn tại không tự chứng minh suy luận nghiệp vụ đúng.
- Snapshot giữ raw bytes và decoded view theo profile CP932/BOM, line/quote không bị lệch do bỏ header/designer. Text allowlist `.bas/.frm/.vbp`; `.frx` là resource binary, không phải text. Không mang theo config agent, hook, plugin, MCP hoặc secrets từ source khách hàng.
- Runtime Claude CLI dùng cấu hình do app kiểm soát. Source, comment và tài liệu khách hàng là dữ liệu không đáng tin; không được trở thành instruction điều khiển tool. Chỉ đọc snapshot, không cấp shell/write tùy ý. Xác nhận cách giới hạn tool/settings theo phiên bản CLI trong spike trước khi nhận source thực.

## 8. Local runtime và hướng mở rộng

Portal local hướng tới Windows/macOS/Linux. Config/path/process/native adapter và gate kiểm chứng theo [platform-support](platform-support.md), CORE-10 và QA-09. Mục tiêu đa nền tảng không đồng nghĩa VB6 runtime hoặc target WinForms chạy đa nền tảng. Chưa chọn desktop shell/installer; không tự mở rộng scope task init.

Dev chạy Vite và API; Vite proxy API để UI dùng relative URL. Bản release Fastify phục vụ UI đã build và API trên cùng origin loopback. Trước LIVE phải có bảo vệ request local, Host/Origin và credential; nếu dùng session-cookie thì có CSRF protection. Chọn giải pháp local tối thiểu ở task tích hợp HTTP security, không bắt buộc account/login tổ chức hoặc session hoàn chỉnh ngay PR scaffold. CORS đơn độc không đủ, token không nằm trên URL/log. Trong giai đoạn chưa có bảo vệ, chỉ dùng fixture/fake và không expose source/CLI thật.

Claude chạy bằng child process; workload CPU nặng của parser cần worker khi đo thấy chặn API. Prompt/schema/workflow nằm ngoài Claude adapter. Sau này thay adapter AI không được coi là toàn bộ công việc chuyển lên web: vẫn cần auth/authorization, worker queue, source acquisition và storage dùng chung. Bản installer có thể tái sử dụng UI/API hiện tại.

## 9. Tiêu chí init source hoàn thành

Đây là tiêu chí init toàn Portal. Task ngày 14/10/2026 chỉ init BE theo yêu cầu; phần UI và pipeline/stream parser tương lai vẫn deferred, không tuyên bố hoàn thành toàn bộ checklist.

- Tạo workspace và lockfile, chốt runtime hỗ trợ máy đích; scripts dev/build/typecheck/lint/test chạy thật.
- Một luồng mẫu Projects đi qua UI → schema → route → service → SQLite; có test input lỗi, không tồn tại và reopen dữ liệu.
- Fake AgentRunner để Dev/QC chạy fixture không cần tài khoản/quota; test được fail/cancel/stream lỗi.
- Có smoke native SQLite trên OS/CPU/Node mục tiêu được công bố; hiện mới kiểm Windows. CLI/process cleanup là task LIVE tiếp theo; init chỉ fake runner không bị chặn vì chưa có tài khoản/CLI.
- Map hướng dẫn trong examples sang file code thật, ghi phiên bản đã kiểm chứng. AI reviewer báo findings; người phụ trách xác nhận trước khi lấy feature làm mẫu cho cả team.

Toàn luồng, decode/evidence trên source thật và các gate MS1 kiểm tra khi feature tương ứng đã được tích hợp. Backup tự động, UI restore và orphan cleanup nâng cao không thuộc tiêu chí init/MS1; không công khai dữ liệu ghi dở vẫn là yêu cầu khi triển khai storage.
