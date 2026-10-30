# Backend MigrationPortal — hướng dẫn Dev

Mẫu cho Dev khi mở rộng Projects/API/UI: [policy và lỗi API](../../docs/engineering/patterns/api-errors-policy.md). Policy tên/default pagination/fixture dùng chung từ contracts; public error code có type chung, status/message an toàn nằm tại BE. Handler chỉ ánh xạ AppError và lỗi Fastify đã nhận diện; dependency error chưa biết dùng INTERNAL_ERROR, không biến mọi status 4xx thành INVALID_INPUT. Schema/HTTP response và DB hiện có giữ tương thích, migration cũ không sửa.

API có Projects demo/local, run lifecycle và source registration/snapshot (PF05). Fastify + TypeScript strict ESM, TypeBox contracts, SQLite thật; demo dùng executor fixture, local run đọc source đã đăng ký để tạo snapshot bất biến. Artifact store/read API (PF06/B07) đã có: demo run công bố inventory mẫu đi kèm; local run (PF07/B08) chạy thư viện Analyze VB6 trên bytes của snapshot trong worker thread rồi công bố inventory; chưa Claude CLI. Tên project không unique: hai project được phép trùng tên, phân biệt bằng UUID. Phần security/instance của LIVE đã có, chưa nghiệm thu LIVE/MS1 toàn bộ; chỉ dùng fixture sạch khi kiểm thử.

## Chạy và cấu hình

Chạy các lệnh tại **root workspace**, không cài package riêng ở `apps/api`:

```powershell
npm.cmd ci
npm.cmd run dev
```

Mặc định bind `127.0.0.1:4310`. DB tên `portal.db`, nằm trong thư mục dữ liệu theo OS:

- Windows: `%LOCALAPPDATA%\MigrationPortal\portal-dev`; thiếu LOCALAPPDATA tuyệt đối thì dùng `~/AppData/Local/MigrationPortal/portal-dev`.
- macOS: `~/Library/Application Support/MigrationPortal/portal-dev`.
- Linux: `$XDG_DATA_HOME/MigrationPortal/portal-dev` khi XDG_DATA_HOME tuyệt đối; còn lại dùng `~/.local/share/MigrationPortal/portal-dev`.

Test tự dùng thư mục temp riêng và dọn sau khi đóng kết nối. Logic chọn path đã có unit test cho ba OS; filesystem/native runtime hiện chỉ kiểm trên Windows x64. Các ví dụ lệnh dưới đây dành cho PowerShell; macOS/Linux dùng `npm` thay `npm.cmd`.

Ví dụ đổi port/data directory cho Dev:

```powershell
$env:PORTAL_PORT = '4311'
$env:PORTAL_DATA_DIR = Join-Path $env:LOCALAPPDATA 'MigrationPortal\portal-dev-2'
$env:PORTAL_LOG_LEVEL = 'info'
npm.cmd run dev
```

Các biến được đọc duy nhất ở [config.ts](src/config.ts); không tự tải `.env`. `PORTAL_PORT` là số 1–65535; log level là `info`, `warn`, `error`, `silent`. Data directory phải là đường dẫn tuyệt đối riêng ngoài source/repo. `PORTAL_MODE` chỉ chấp nhận `fixture`. `PORTAL_RUNNER` là `fake` (mặc định), `claude-cli` (môi trường thật) hoặc `codex-cli` (chỉ dev/test); chỉ ảnh hưởng run tạo tài liệu, xem mục Document run. Pack specification-design được đọc từ `docs/` của root ứng dụng (bản phân phối phải mang theo `docs/specification-design` và `docs/engineering/{rules,specs,contracts}`). Giá trị khác làm startup thất bại. `PORTAL_AGENT_CLI` (tuỳ chọn) là đường dẫn tuyệt đối tới Agent CLI; không đặt thì tìm `claude`/`codex` trên PATH. Host được cố định loopback.

[data-directory.ts](src/platform/data-directory.ts) kiểm path theo từng segment và đường dẫn vật lý: từ chối root repo sản phẩm, mọi thư mục con và thư mục `source_vb6` nằm cạnh repo ở parent directory. Alias/junction/symlink trỏ vào các root đó cũng bị chặn, kể cả phần đuôi chưa tồn tại. Parent workspace không bị coi là repo; runtime ở thư mục khác ngoài các root bị cấm vẫn hợp lệ. Clone độc lập không cần có thư mục source sibling này; guard không tạo hoặc đọc nội dung source.

Không tạo DB khi config bị từ chối. DB boundary kiểm lại trước mở SQLite; root app xác định từ vị trí module, không phụ thuộc cwd. Bản phân phối hiện phải giữ layout `apps/api/dist` và `apps/api/migrations`; đổi layout cần cập nhật cách xác định root và test tương ứng. Chưa có cơ chế đăng ký mọi source root ngoài repo hoặc chống process khác đồng thời thay filesystem; các yêu cầu đó thuộc đường đọc source thật trước LIVE. Các default data path và schema DB giữ nguyên sau khi tách repo; không tự di chuyển DB cũ.

Naming hiện tại độc lập công ty: env `PORTAL_*`, package `@portal/*`, data directory `MigrationPortal/portal-dev`, temp prefix `portal-*`. Branding UI/export sau này đi qua config/asset/template; tên hiển thị không quyết định DB/path hoặc logic nghiệp vụ. Xem CORE-09 trong [rule chung](../../docs/engineering/rules/core.md).

**Nếu đã dùng bản init trước lần đổi naming:** cập nhật tên biến môi trường sang `PORTAL_*`; prefix cũ không còn được đọc. Default data directory đã đổi nên lần chạy mặc định có thể mở DB demo mới. Để tiếp tục dùng DB cũ, dừng backend cũ rồi đặt `PORTAL_DATA_DIR` tới đúng thư mục chứa `portal.db` đã dùng trước đó, sau đó khởi động lại. Schema DB không đổi; không cần đổi tên bảng hoặc chạy migration dữ liệu. Không tự move/xóa DB cũ, không mở hai instance trên cùng data directory. Package import đã chuyển đồng bộ sang `@portal/*`; chạy `npm ci` tại root để cập nhật workspace links.

Override tới DB cũ cũng phải nằm ngoài repo/source. Nếu DB cũ nằm trong repo, cấu hình đó sẽ bị từ chối; cần xử lý di chuyển dữ liệu nhất quán khi backend đã dừng trước khi dùng lại. App không tự move/xóa DB.

Đã có bảo vệ Host/Origin và credential local theo [local-http-security](../../docs/engineering/specs/local-http-security.md), instance lock/recovery PF04 và đường đọc source local PF05. Không expose backend ra LAN. `mode: fixture`/`runner: fake` trên health không có nghĩa local project không đọc file: local run thực sự tạo snapshot, chỉ chưa gọi analyzer/AI. Chưa nghiệm thu source khách hàng; path/process smoke hiện chỉ có Windows với fixture sạch.

## Gọi thử một luồng

Mở PowerShell thứ hai khi server đang chạy:

```powershell
$base = 'http://127.0.0.1:4310/api/v1'
Invoke-RestMethod "$base/health"
# Bootstrap credential như UI tin cậy; token chỉ đi trong header Authorization.
$session = Invoke-RestMethod "$base/session" -Method Post -Headers @{ Origin = 'http://127.0.0.1:4310' }
$auth = @{ Authorization = "Bearer $($session.token)" }
$body = @{ name = 'Project demo'; fixtureId = 'sample-vb6' } | ConvertTo-Json
$project = Invoke-RestMethod "$base/projects" -Method Post -Headers $auth -ContentType 'application/json' -Body $body
Invoke-RestMethod "$base/projects/$($project.id)" -Headers $auth
Invoke-RestMethod "$base/projects?limit=20" -Headers $auth
```

Endpoint đang có:

- `GET /api/v1/health`: 200, nhãn `mode: fixture`, `runner: fake`. Runner là chế độ được hỗ trợ; health không gọi AI. Public nhưng vẫn kiểm Host/Origin.
- `POST /api/v1/session`: bootstrap credential, cần `Origin` tin cậy; trả `{ token }`. Mọi endpoint khác cần `Authorization: Bearer <token>`; 401 `CREDENTIAL_INVALID`, 403 `HOST_NOT_ALLOWED`/`ORIGIN_NOT_ALLOWED`. Policy đầy đủ, gồm request thiếu Origin và `PORTAL_WEB_PORT`: [local-http-security](../../docs/engineering/specs/local-http-security.md).
- `POST /api/v1/projects`: 201 và `Location`. Demo dùng `{ name, fixtureId: 'sample-vb6' }`; local dùng `{ name, mode: 'local' }` và đăng ký source bằng endpoint riêng. Name 1–120 Unicode code point, có nội dung sau trim; không nhận `sourcePath` hay field lạ.
- `GET /api/v1/projects/:projectId`: 200 hoặc 404; ID sai định dạng trả 400.
- `GET /api/v1/projects?limit=20&cursor=<nextCursor>`: `{ items, nextCursor }`; limit 1–100, mặc định 20. Dùng nguyên cursor từ response; thứ tự theo UUID tăng dần, **không phải ngày tạo**. Đây không phải snapshot pagination khi có request tạo project đồng thời.

Project demo trả `id`, `name`, `fixtureId`, `mode: demo`, `createdAt` UTC; local trả cùng metadata với `mode: local`, không có `fixtureId`. Name không tự convert từ số; field không khai báo bị từ chối. Body tối đa 16 KiB. Error chung là `{ error: { code, message, requestId } }`: 400 input, 404 không tìm thấy, 409 revision/state conflict, 413 body quá lớn, 415 Content-Type không được hỗ trợ, 422 source không dùng được, 500 lỗi nội bộ. Chưa có update/delete project.

### Source registration và snapshot (PF05: B03 + B06 + F01)

- [source-registration.routes.ts](src/modules/projects/source-registration.routes.ts): `GET/PUT /api/v1/projects/:projectId/source`, cần credential local. PUT gồm root tuyệt đối, `profileId: vb6-cp932-v1`, mapping `unconfigured|assumed|confirmed`, `expectedSourceRevision: null` lần đầu hoặc revision đã đọc khi sửa. Demo PUT trả 409 `PROJECT_MODE_CONFLICT`.
- [source-registration.service.ts](src/modules/projects/source-registration.service.ts) + repository: kiểm profile/root trước khi ghi, CAS revision trong transaction; mỗi revision bất biến. GET chỉ trả sourceId/displayName/profile/revision/status, không trả absolute path. Path không được dùng trả lỗi an toàn, không ghi DB.
- [local-source-root.ts](src/adapters/local/local-source-root.ts): canonicalize, kiểm containment theo segment/physical path, từ chối overlap repo/data và alias, path tương đối/UNC/device. Kiểm đọc/liệt kê root không walk source. Root thay bằng link sang nơi khác bị coi không đọc được. Native mapped drive và các mount mạng khác chưa được kiểm chứng.
- [snapshot.service.ts](src/modules/snapshots/snapshot.service.ts), [local-workspace.provider.ts](src/adapters/local/local-workspace.provider.ts): khi run chạy mới đọc revision đã khóa; copy vào `snapshots/.staging/<id>`, giữ raw/normalized/manifest, kiểm source đổi rồi atomic rename và ghi DB. Link không đi theo, file loại trừ/quá lớn/không đọc được có `skipped`; file decode lỗi có manifest lỗi. Reopen/reuse kiểm hash raw/normalized/manifest và đối chiếu ID, hash, profile, số file/tổng bytes với record DB; không dùng root hiện tại để thay snapshot cũ.
- [snapshot-storage.ts](src/adapters/local/snapshot-storage.ts) kiểm `lstat`/đường dẫn vật lý từ data directory trước đọc, ghi, publish và cleanup, kể cả thư mục con và cleanup sau lỗi. Junction/symlink hoặc file hard link trong storage bị từ chối (`SNAPSHOT_STORAGE_INVALID`); startup không cleanup qua link. Data directory phải do app kiểm soát: Node không có API portable để loại trừ hoàn toàn process khác cùng quyền đổi thư mục giữa hai filesystem syscall.
- [0003-local-sources.sql](migrations/0003-local-sources.sql) giữ demo/run cũ khi nâng DB từ 0001/0002. Migration runner tắt foreign keys chỉ quanh transaction migration và kiểm `foreign_key_check` trước commit; không sửa migration cũ. Hạ phiên bản không tự downgrade DB: dừng backend và dùng backup nhất quán nếu cần rollback.

Chi tiết contract/path/error/giới hạn: [analyze-run-contract §2](../../docs/engineering/specs/analyze-run-contract.md#2-source-registration-api-2). Source chỉ được mở read-only. Không chạy script/hooks/config trong source. Chỉ fixture sạch được dùng trong E2E; đây chưa phải bằng chứng nghiệm thu customer source, analyzer job hoặc CLI.

### Analyze run (PF03: B04 + B05, fixture)

Hợp đồng: [analyze-run-contract](../../docs/engineering/specs/analyze-run-contract.md) §3–5. Demo dùng `sample-vb6` revision 1. Local dùng revision hiện tại từ GET source; chưa đăng ký trả `SOURCE_NOT_REGISTERED`, revision cũ trả `SOURCE_REVISION_CONFLICT`. [source-run.executor.ts](src/adapters/local/source-run.executor.ts) chọn executor fixture cho demo hoặc snapshot service cho local. Local `succeeded` chỉ có nghĩa đã chụp nguồn, chưa tạo inventory/artifact.

- `POST /api/v1/projects/:projectId/runs` + header `Idempotency-Key`: lưu run `queued` rồi trả **202** + `Location` ngay; không chờ chạy. Cùng key + cùng body (không phụ thuộc thứ tự field) trả lại đúng run đó; cùng key khác body 409 `IDEMPOTENCY_KEY_CONFLICT`; project còn run active 409 `RUN_ACTIVE_CONFLICT`; retry (`retryOfRunId`) luôn là run mới; `reuse-snapshot` cần run cũ có snapshot (409 `SNAPSHOT_UNAVAILABLE`); runtime cần recovery 503 `RUNTIME_RECOVERY_REQUIRED`.
- `GET .../runs?limit&cursor` (mới nhất trước, cursor opaque), `GET .../runs/current`, `GET .../runs/:runId`: chỉ đọc, run của project khác trả 404 `RUN_NOT_FOUND`.
- `POST .../runs/:runId/cancel` `{ expectedStateVersion }`: queued → `cancelled` (200), running → `cancelling` (202) rồi dispatcher ghi `cancelled`; lặp lại idempotent, và cancel lặp trên run `cancelling` yêu cầu dispatcher đối chiếu lại (execution đã dừng thì ghi `cancelled`, 200); version lệch hoặc terminal 409 `RUN_STATE_CONFLICT`.
- `GET /api/v1/runtime/status`: `ready` hoặc `recovery_required`.

Ràng buộc nằm ở DB ([0002-runs.sql](migrations/0002-runs.sql)): unique run active mỗi project, unique một run đang chạy toàn runtime, unique `(project, idempotency key)`; mọi chuyển trạng thái là compare-and-set theo status + `stateVersion` ([run.repository.ts](src/modules/jobs/run.repository.ts), quyết định đích ở [job-state.ts](src/modules/jobs/job-state.ts)). [job-dispatcher.ts](src/modules/jobs/job-dispatcher.ts) claim nguyên tử và chạy một execution ngoài request/transaction: timeout → `failed/TIMEOUT`; executor không dừng trong hạn → `failed/STOP_UNCONFIRMED` và runtime `recovery_required` (chặn Start tới khi restart); không ghi được trạng thái kết thúc vào DB cũng chuyển runtime `recovery_required` (run còn `running` giữ slot, restart đánh dấu `interrupted`), cancel run đó vẫn kết thúc `cancelled` vì execution đã dừng; khởi động đánh dấu run running/cancelling cũ `interrupted`, không tự chạy lại; shutdown dừng dispatch và ghi `interrupted`. Executor hiện là [fixture-run.executor.ts](src/adapters/fake/fixture-run.executor.ts): đi qua các stage, không đọc source, không process/network; sau khi nó thành công, source run executor công bố inventory mẫu (mục dưới). Limits trong config run là số giữ chỗ (JOB-07).

### Artifact store và read API (PF06: B07)

Hợp đồng: [analyze-run-contract](../../docs/engineering/specs/analyze-run-contract.md) §6. Code: [artifact.service.ts](src/modules/artifacts/artifact.service.ts), [artifact.repository.ts](src/modules/artifacts/artifact.repository.ts), [artifact.routes.ts](src/modules/artifacts/artifact.routes.ts), port [artifact-store.ts](src/ports/artifact-store.ts), adapter [filesystem-artifact.store.ts](src/adapters/local/filesystem-artifact.store.ts), migration [0004-artifacts.sql](migrations/0004-artifacts.sql).

- Publish (DATA-05): validate payload theo `source-inventory-v1` và `snapshotHash` khớp snapshot của run → ghi `artifacts/.staging/<id>-v<version>/payload.json` → rename thư mục vào `artifacts/<id>-v<version>/` (cùng filesystem) → insert row. Chỉ row làm version public. Payload sai → run `failed/ANALYSIS_OUTPUT_INVALID`; ghi/rename/DB lỗi → `failed/ARTIFACT_WRITE_FAILED`, không còn bản dở dưới tên public. ID do server sinh; client không truyền path. Storage dùng cùng kiểm tra link/junction/hard link như snapshot (`ARTIFACT_STORAGE_INVALID`).
- Demo run: [source-run.executor.ts](src/adapters/local/source-run.executor.ts) công bố [demo-inventory.ts](src/adapters/fake/demo-inventory.ts) (bộ mẫu viết tay, 3 program, 1 module dùng chung, 1 program chưa đầy đủ, mapping `assumed`) ở stage `publish`. Local run (B08): snapshot (hoặc mở lại snapshot đã ghi khi `reuse-snapshot`) → `readSnapshotFiles` kiểm hash/size từng file raw → [worker-inventory.builder.ts](src/adapters/local/worker-inventory.builder.ts) chạy [run-inventory.ts](src/modules/analysis/run-inventory.ts) (`buildSourceInventory` với profile/mapping run đã khóa, kiểm phiên bản analyzer khớp `config.analyzer`, validate schema, serialize) trong worker → `publishPrepared` (staging → rename → row). Cancel/timeout terminate worker; cancel thắng sau publish để artifact cô lập như B07. `inventory.snapshotHash` là hash nội dung các entry, `sourceSnapshotHash` của artifact là hash bản ghi snapshot (gồm cả `skipped`). File bị snapshot bỏ qua (link, quá lớn, không đọc được, đặc biệt, tên không hợp lệ) vào `skipped` của inventory; file ngoài loại source của profile (`excluded`) không được copy nên không liệt kê. Run khóa phiên bản analyzer khác bản build đang chạy (queued qua nâng cấp) kết thúc `ANALYSIS_OUTPUT_INVALID`; bytes snapshot bị đổi → `INTERNAL_ERROR`, không publish.
- `GET .../runs/:runId/artifacts`: chỉ trả artifact khi run `succeeded`; run khác trạng thái trả `{ items: [] }`. `GET .../artifacts/:artifactId/versions/:version`: đúng version, project khác hoặc run không `succeeded` (cancel thắng sau khi đã publish) trả 404 `ARTIFACT_NOT_FOUND`, không lộ nội dung. Đọc kiểm lại `sha256`/`byteLength` và schema; lệch thì 500 `INTERNAL_ERROR`, không trả payload.

**Runbook orphan artifact.** Thư mục `artifacts/<id>-v<n>/` không có row trong bảng `artifacts` (log `ARTIFACT_ORPHANED`, hoặc crash giữa rename và insert) không bao giờ được đọc. `artifacts/.staging/` được dọn khi khởi động. Muốn thu hồi dung lượng: dừng backend, đối chiếu tên thư mục với `SELECT id, version FROM artifacts`, chỉ xóa thư mục không có row. Chưa có tự dọn orphan/retention (DATA-10, LATER).

### Instance lock và recovery (PF04: B02)

Mỗi data directory chỉ một backend. [server.ts](src/server.ts) khóa trước khi mở `portal.db` hoặc listen bằng [instance-lock.ts](src/platform/instance-lock.ts): file `instance.lock` cạnh `portal.db`, giữ lock EXCLUSIVE của SQLite, tức file lock của OS (Windows `LockFileEx`, POSIX `fcntl`). Process thứ hai cùng data directory thoát với `STARTUP_FAILED`/`DATA_DIR_LOCKED`, không mở DB; data directory khác độc lập. Shutdown đóng dispatcher và DB rồi mới nhả lock, ghi `released_at` vào owner record. Process crash/bị kill thì OS tự nhả lock, không có lock file cũ phải xóa tay; lần khởi động sau log `INSTANCE_PREVIOUS_UNRELEASED` và đánh dấu run running/cancelling cũ `interrupted` (không tự chạy lại).

Owner record (owner id, pid, thời điểm start/release) chỉ để chẩn đoán: không bao giờ kill hoặc xóa gì theo pid trong đó. Record không đọc được (format khác, cột thiếu/sai kiểu, bảng lạ) nghĩa là không xác định được process cũ và những gì nó đã chạy: backend vẫn khởi động, đánh dấu run cũ `interrupted`, nhưng runtime `recovery_required` (`PROCESS_CLEANUP_UNCONFIRMED`, Start 503, queue không dispatch), log `INSTANCE_OWNER_UNKNOWN`. Record giữ nguyên qua các lần restart tới khi người vận hành xác nhận. `instance.lock` phải là một file thường có đúng một tên: symlink, hard link (ví dụ trỏ tới `portal.db`), thư mục hoặc file không phải SQLite làm startup fail `INSTANCE_LOCK_INVALID` trước mọi thao tác ghi. Lock kiểm lại path sau khi đã giữ khóa OS; file bị tráo giữa lúc kiểm và lúc mở cũng bị từ chối.

**Runbook xử lý thủ công**

1. `DATA_DIR_LOCKED` khi khởi động: một backend khác đang dùng data directory. Dùng backend đó hoặc dừng nó bằng cách bình thường (Ctrl+C trong terminal của nó). Không xóa `instance.lock`; lock tự nhả khi process kết thúc.
2. Runtime `recovery_required` sau khởi động (log `INSTANCE_OWNER_UNKNOWN`), hoặc trong lúc chạy (log `RUN_STOP_UNCONFIRMED`/`RUN_STATE_WRITE_FAILED`): dừng backend. Kiểm bằng Task Manager (Windows), Activity Monitor hoặc `ps` (macOS/Linux) rằng không còn process backend/job nào của data directory này; tự xác định process bằng command line, không dựa vào pid trong owner record. Nếu còn, dừng nó theo cách bình thường của công cụ đó.
3. Với `INSTANCE_OWNER_UNKNOWN`, sau bước 2 chạy `PORTAL_DATA_DIR=<dir> node apps/api/dist/cli/confirm-recovery.js --confirm` (cần `npm run build`; PowerShell đặt `$env:PORTAL_DATA_DIR` trước). Lệnh lấy lock nên từ chối (`DATA_DIR_LOCKED`) nếu backend còn chạy; chỉ reset owner record, không đụng process, run hoặc `portal.db`. File lock là link hoặc chứa bảng khác ngoài owner record thì lệnh từ chối (`INSTANCE_LOCK_INVALID`) và không sửa gì; xử lý theo bước 4. Khởi động lại backend: runtime `ready`, queue tiếp tục. Với lỗi trong lúc chạy, khởi động lại là đủ.
4. `INSTANCE_LOCK_INVALID`: dừng mọi backend của data directory, đổi tên `instance.lock` sang tên khác để giữ lại phân tích rồi khởi động lại. Không xóa hoặc sửa file đó khi chưa rõ nó trỏ tới đâu: nếu là link tới `portal.db`, chỉ xóa đúng tên `instance.lock` (link), không xóa file đích.

Process ownership của job CLI (A03/A04) chưa có: executor fixture chạy trong process backend nên chết cùng nó. Khi có process con, record sẽ phải ghi các process con để restart chặn dispatch khi chúng có thể còn sống.

### Document run (bước 3: specification-design qua Agent CLI)

Theo [flow Portal của specification-design](../../docs/specification-design/README.md#flow-nghiệp-vụ-trên-portal) và [runbook 2.2](../../docs/specification-design/runbook.md).

- API ([documents](src/modules/documents)): `POST/GET /api/v1/projects/:projectId/document-runs`, `.../current`, `.../:runId`, `.../:runId/cancel`, `.../:runId/log?after=<sequence>`, `.../:runId/items/:item/files/:file`. Start cần `Idempotency-Key`, body `{ analysisRunId, programs: [projectPath], documents: [business-rules|basic-design|detail-design|db-design], model, outputLanguage }`; phase này đúng **1 program/lượt** (`MAX_PROGRAMS_PER_RUN = 1`, mảng giữ chỗ cho batch sau), TL chọn program ở màn Phân tích; program phải có trong inventory của analyze run `succeeded` (không có → 409 `ANALYSIS_REQUIRED`, program lạ/model sai runner → 400).
- Tập tài liệu sinh = chọn + sinh kèm SD-CT-07 (Basic kèm BR; Detail kèm BR, Basic, DB) theo thứ tự BR → DB → Basic → Detail, mỗi tài liệu một file Markdown (`documentsToGenerate`/`packageFileNames` trong contracts). Từ pack 0.9.0 không còn `coverage.md`/`open-questions.md`: trạng thái sinh, ngôn ngữ/runtime, phạm vi đã đọc nằm trong bảng phần đầu chung, câu hỏi mở trong section questions của từng tài liệu. Config run khoá program, tài liệu, model, ngôn ngữ, runner, version pack (đọc từ README pack) và `spec-design-task-v2`.
- Mỗi program một phiên Agent trong workspace riêng `spec-runs/<runId>/<item>/` ([spec-workspace.ts](src/adapters/local/spec-workspace.ts)): `context/docs/specification-design/**` + `context/docs/engineering/{rules,specs,contracts}` (bản sao để link tương đối hoạt động), `context/input-context.md` (phiếu input Portal điền: source, P1, phạm vi; mục 4 "Không có"), `context/p1/1.1-source-inventory.json`, `1.2-loc.json`, `1.3-dependency.json` (lọc theo program), `source/<path>` (file của program và module dùng chung, giải mã UTF-8 từ snapshot; dự án demo không có source → phiếu ghi "chưa được cung cấp"). Agent chạy với cwd là workspace.
- Agent **chỉ đọc**: trả cả gói trong câu trả lời theo khối `=== FILE: x.md ===` … `=== END FILE ===`; Portal kiểm đúng/đủ tên file, không trùng, dòng `| Trạng thái sinh | … |` của **mọi** tài liệu là `hoàn tất` (SD-CT-08), rồi mới ghi file (staging + rename dưới `documents/<packageId>-v<n>/`). Sai định dạng → `AGENT_OUTPUT_INVALID`; tài liệu chưa `hoàn tất` hoặc thiếu dòng trạng thái → `PACKAGE_INCOMPLETE`. Hash cây workspace trước/sau phiên phải trùng, khác → `AGENT_FAILED` (agent đã ghi). Workspace bị xoá khi run kết thúc và khi khởi động.
- Lỗi theo program: output sai/chưa hoàn tất chỉ làm program đó `failed`, program sau vẫn chạy; lỗi Agent không dùng được (unavailable/auth/quota/ghi file/internal) dừng các program còn lại (`skipped`). Run `succeeded` khi mọi program xong; file của program đã xong đọc được khi run kết thúc `succeeded`/`failed`.
- `claude-cli` (môi trường thật): `--tools Read,Glob,Grep` (không Bash/Write/Edit/web), `--effort medium`, `--setting-sources ""`, `--strict-mcp-config`, `--permission-mode dontAsk`, `--no-session-persistence`, prompt qua stdin. Sự kiện `init` phải chỉ có ba tool trên và không MCP; một `tool_use` ngoài ba tool đó cũng dừng phiên ngay. Log hiện từng lần `Read/Glob/Grep` và đường dẫn. Model: alias `opus`/`sonnet`/`haiku` (CLI chọn bản mới nhất lúc chạy; tên thật hiện trong dòng `init` của log) hoặc `default` (không truyền `--model`; vì `--setting-sources ""` nên là mặc định sẵn có của CLI/`ANTHROPIC_MODEL`, không phải settings người dùng).
- `codex-cli` (chỉ dev/test, dữ liệu demo/fixture sạch): `codex exec --json --sandbox read-only --ephemeral`, tắt hooks/plugins/apps/browser/computer use/skill search/multi-agent…, `web_search="disabled"`, `mcp_servers={}`. Spike codex-cli 0.164.0 (Windows): `read-only` chặn mọi ghi (workspace, ngoài workspace, %TEMP%) và web request qua shell; `workspace-write` **không** chặn ghi ra ngoài workspace nên không dùng. Tắt `code_mode_host` làm shell không đọc được file nên giữ bật; tool JavaScript của nó gọi được mạng, vì vậy mọi item không phải text/`command_execution` (vd. `mcp_tool_call`, `file_change`) dừng phiên ngay. Đọc file không bị giới hạn trong workspace — lý do chỉ dùng cho dev/test. Log hiện các lệnh shell agent đã chạy.
- Effort cố định `medium` (`DEFAULT_AGENT_EFFORT`), không chọn trên UI, ghi vào `config.effort` của run; Codex nhận `-c model_reasoning_effort="medium"`. Run cũ không có trường này đã chạy với effort mặc định của CLI.
- Giới hạn tạm (JOB-07): timeout 8 giờ/run, output 2 MiB/gói, dòng stream-json 4 MiB, log 2000 dòng/run. Cancel/timeout dừng cả cây process; ledger PID và recovery như trước. Chạy tiếp phiên dở (SD-CT-08) chưa làm: run bị dừng phải chạy lại.
- Tiến độ realtime theo tài liệu: Claude chạy với `--include-partial-messages`; text delta của câu trả lời đi qua `createPackageTracker` ([spec-context.ts](src/modules/documents/spec-context.ts)), mốc `=== FILE: x.md ===` → `writing`, `=== END FILE ===` → `written`, lưu vào `items[].documents` (UI đọc qua polling). Mỗi đầu message/content block được coi là xuống dòng để mốc không dính vào chữ trước. `written` chưa phải đã công bố: gói vẫn được kiểm và lưu ở cuối. Codex trả cả câu trả lời một lần nên chỉ thấy chuyển trạng thái ở cuối.
- Số bước (FE-02: đếm, không ước lượng): `items[].reading` = số file nhiệm vụ yêu cầu (phiếu input, README, analysis-method, artifacts, template của tài liệu sinh, P1 1.1–1.3, file `source/`) mà log cho thấy agent đã mở / tổng; `documents[].sections` = số heading (`#`–`###`) + dòng "Trạng thái sinh" đã stream / số đó trong template (giữ dưới tổng cho tới `END FILE`). UI: thanh program theo `reading`, thanh tài liệu theo `sections`, vòng % = tổng bước đã xong / tổng bước, có animation tăng dần.
- Khi run kết thúc không thành công (cancelled/interrupted/failed), cùng transaction chuyển program `running` → `stopped`, `pending` → `skipped`, tài liệu `writing` → `pending`; khởi động cũng dọn các run cũ còn program `running`. Log rút gọn đường dẫn workspace (so khớp không phân biệt hoa thường trên Windows).
- Dự án demo không có file source: với runner `claude-cli`/`codex-cli` Start trả 409 `PROJECT_MODE_CONFLICT` (UI khóa nút và giải thích); chỉ runner `fake` chạy trên dự án demo. Log không ghi các dòng nằm trong khối `=== FILE … === END FILE ===` (nội dung xem bằng nút Xem; log có trần 2000 dòng).
- `fake`: trả gói DEMO đúng tên file, `Trạng thái sinh` `hoàn tất`, stream câu trả lời thành từng đoạn; không network.

## Đọc source theo một request

1. [project.schema.ts](../../packages/contracts/src/project.schema.ts): JSON Schema + DTO suy ra. Shared contracts không phụ thuộc Fastify/Node/database.
2. [project.routes.ts](src/modules/projects/project.routes.ts): URL, validation, status và gọi service. Fastify tự validate trước side effect.
3. [project.service.ts](src/modules/projects/project.service.ts): normalize name, tạo ID/time từ dependency, not-found và pagination. Không biết HTTP hay SQL.
4. [project.repository.ts](src/modules/projects/project.repository.ts): SQL parameterized, map row thành DTO; không xử lý HTTP.
5. [composition.ts](src/composition.ts): nối DB → repository → service. Dependency thủ công, không DI framework.
6. [app.ts](src/app.ts): đăng ký module/error handler, sở hữu DB và đóng qua `onClose`; không tự listen. [server.ts](src/server.ts) load config, listen và xử lý SIGINT/SIGTERM.
7. [project.integration.test.ts](src/modules/projects/project.integration.test.ts): request thật qua Fastify inject + SQLite temp, đọc lại sau reopen và HTTP loopback.

[0001-initial.sql](migrations/0001-initial.sql) tạo bảng đầu tiên. [migrate.ts](src/db/migrate.ts) chạy migration có transaction, ghi tên/checksum trong `schema_migrations`, từ chối migration cũ bị đổi hoặc DB mới hơn source. Thêm migration mới khi đổi schema; không sửa file đã áp dụng. Không xóa DB đang dùng để né lỗi migration. Khi phân phối bản build phải giữ `apps/api/migrations` bên cạnh `dist`.

## Analyze tĩnh (thư viện, chưa có API)

`src/modules/analysis/` đọc bytes đã có sẵn trong bộ nhớ và trả inventory; không tự đọc filesystem, không gọi AI. Thứ tự đọc: `source-decoder.ts` → `source-text.ts` → `source-manifest.ts` → `vb6/vb6-line-lexer.ts` → `vb6/vb6-code-file.ts` → `source-inventory.ts`. Thêm ngôn ngữ: tạo analyzer theo `language-analyzer.ts`, đăng ký profile trong `source-profiles.ts`, thêm fixture/test; core không đổi. Metric và encoding theo [source-analysis](../../docs/engineering/specs/source-analysis.md); fixture ở `tests/fixtures/vb6-sample/`.

`buildSourceInventory` trong `source-inventory.ts` điều phối toàn bộ: parse project/member → scan từng file (gồm dựng chuỗi và trích SQL bằng `sql-access.ts`) → tìm reference → `program-analysis.ts` dựng call graph, CRUD, metrics và complexity v0 theo program. Mapping schema thêm góc nhìn normalized, giữ số liệu gốc. Hình dạng JSON/giới hạn theo [source-inventory](../../docs/engineering/specs/source-inventory.md), schema ở `@portal/contracts`. Lệnh dev/TL: `node apps/api/dist/cli/analyze-source.js --root <source> --out <inventory.json> [--summary <programs.csv>] [--default-schema <schema> [--schema-confirmed]]` (chỉ đọc source, chưa nối API/job).

## Sửa file nào khi có task mới?

- **Thêm description**: contract request/response → `0002-project-description.sql` → repository mapping → service nếu có policy → integration test, gồm upgrade DB có dữ liệu. Chưa cần tạo UI khi task chỉ BE.
- **Thêm điều kiện nghiệp vụ**: service và test service; nếu liên quan cạnh tranh dữ liệu, thêm constraint/transaction ở DB. Route chỉ ánh xạ HTTP.
- **Input bị 400**: kiểm contract/format/field lạ và body trước; không tắt validation để chữa lỗi.
- **Lỗi 500**: lần từ service tới repository/dependency và tái hiện bằng fixture. [error-handler.ts](src/plugins/error-handler.ts) ghi request ID, error code, route pattern và `reason` allowlist (ví dụ `SQLITE_BUSY`); client vẫn nhận lỗi chung. [logger.ts](src/plugins/logger.ts) bỏ raw URL/query/headers và raw error khỏi log; debug local trên dữ liệu sạch.
- **Không startup được**: stderr trả JSON `STARTUP_FAILED` cùng `reason` an toàn. `DATA_DIR_FORBIDDEN`: chọn thư mục ngoài repo/source; `INVALID_CONFIG`: kiểm env; `EADDRINUSE`: kiểm port; `EACCES`/`EPERM`: kiểm quyền; `MIGRATION_MODIFIED`/`SCHEMA_TOO_NEW`: kiểm phiên bản app và migration, không xóa DB để né lỗi. [error-diagnostics.ts](src/shared/error-diagnostics.ts) chỉ giữ mã đã allowlist, còn lại `UNEXPECTED_ERROR`; không log message/name/stack tùy ý từ dependency.
- **Thêm loại lỗi**: [app-error.ts](src/shared/app-error.ts) khai báo code, message an toàn và status; test route cho nhánh mới.
- **Thêm AI workflow**: [agent-runner.ts](src/ports/agent-runner.ts) là port. [fake-agent.runner.ts](src/adapters/fake/fake-agent.runner.ts) hỗ trợ success/failure/delay/cancel/invalid-output, hiện được dùng bởi test, chưa nối vào HTTP/dispatcher. Analysis service tương lai phải validate output; `completed` của runner chỉ nghĩa kết thúc vận chuyển, không có nghĩa artifact succeeded/approved.

Không tạo sẵn thư mục rỗng cho jobs/artifacts/reviews. Xem [engineering examples](../../docs/engineering/examples.md) khi thêm feature; các mục CLI/SSE/Analyze trong đó vẫn là thiết kế đích.

## Kiểm chứng và phần còn lại

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Từ repo root, `node scripts/verify-repository.mjs` kiểm tài liệu/skill/workspace; sau build, `node scripts/smoke-backend.mjs` chạy compiled server từ cwd tạm ngoài repo, kiểm data guard, migration và create/reopen project. Smoke chỉ tạo dữ liệu fixture trong temp riêng rồi dọn, không đọc source khách hàng hay chạy Claude.

Tests kiểm API success/input/not-found/pagination (cả limit mặc định), không ghi khi input sai/Content-Type không hỗ trợ, SQL injection dạng dữ liệu, lỗi JSON/body limit, reopen DB/migration guard, service storage failure, config và fake runner. Regression test kiểm containment/junction/path chưa tồn tại, resolver ba OS, log không lộ dữ liệu và startup từ chối repo/source trước khi mở DB. Có một test mở socket loopback thật; môi trường sandbox phải cho phép kết nối localhost.

Rule trọng tâm: CORE-01..10, BE-01..05/07, DATA-01/02/09, QA-01/02/06/07/09 và AI-01/05 cho fake port. Phạm vi reviewer cần xem: schema/validation trước side effect, ranh giới service/repo, DB lifecycle, containment và nhãn demo.

[UI Projects](../web/README.md), local HTTP security PF02, run lifecycle PF03, instance lock/recovery PF04 và source registration/snapshot PF05 đã có. Analyzer đã nối vào local run và artifact (B08/B07); chưa SSE, Claude process, BR/Design/evidence, review/export hoặc nghiệm thu LIVE/MS1. Process ownership/cleanup của CLI còn ở A03/A04. Không có VB6 → C# conversion trong source này.

Tham khảo API gốc khi mở rộng: [Fastify type provider](https://github.com/fastify/fastify-type-provider-typebox), [Fastify testing](https://fastify.dev/docs/latest/Guides/Testing/), [better-sqlite3](https://github.com/WiseLibs/better-sqlite3). Phiên bản thực tế được khóa trong package/lockfile, không copy API từ major khác.
