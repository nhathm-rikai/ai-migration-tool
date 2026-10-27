# Backend MigrationPortal — hướng dẫn Dev

Mẫu cho Dev khi mở rộng Projects/API/UI: [policy và lỗi API](../../docs/engineering/patterns/api-errors-policy.md). Policy tên/default pagination/fixture dùng chung từ contracts; public error code có type chung, status/message an toàn nằm tại BE. Handler chỉ ánh xạ AppError và lỗi Fastify đã nhận diện; dependency error chưa biết dùng INTERNAL_ERROR, không biến mọi status 4xx thành INVALID_INPUT. Schema/HTTP response và DB hiện có giữ tương thích, migration cũ không sửa.

API hiện chạy ở gate **init**, feature **Projects/API/storage**. Fastify + TypeScript strict ESM, TypeBox contracts, SQLite thật và fake AgentRunner dùng trong test. API chỉ quản lý metadata project demo; `fixtureId: sample-vb6` là nhãn dữ liệu mẫu. Thư viện/CLI Analyze VB6 đã có riêng, chưa nối vào Projects/API/job. Tên project không unique: hai project được phép trùng tên, phân biệt bằng UUID.

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

Các biến được đọc duy nhất ở [config.ts](src/config.ts); không tự tải `.env`. `PORTAL_PORT` là số 1–65535; log level là `info`, `warn`, `error`, `silent`. Data directory phải là đường dẫn tuyệt đối riêng ngoài source/repo. `PORTAL_MODE` chỉ chấp nhận `fixture`, `PORTAL_RUNNER` chỉ chấp nhận `fake`; giá trị live/claude làm startup thất bại. Host được cố định loopback.

[data-directory.ts](src/platform/data-directory.ts) kiểm path theo từng segment và đường dẫn vật lý: từ chối root repo sản phẩm, mọi thư mục con và thư mục `source_vb6` nằm cạnh repo ở parent directory. Alias/junction/symlink trỏ vào các root đó cũng bị chặn, kể cả phần đuôi chưa tồn tại. Parent workspace không bị coi là repo; runtime ở thư mục khác ngoài các root bị cấm vẫn hợp lệ. Clone độc lập không cần có thư mục source sibling này; guard không tạo hoặc đọc nội dung source.

Không tạo DB khi config bị từ chối. DB boundary kiểm lại trước mở SQLite; root app xác định từ vị trí module, không phụ thuộc cwd. Bản phân phối hiện phải giữ layout `apps/api/dist` và `apps/api/migrations`; đổi layout cần cập nhật cách xác định root và test tương ứng. Chưa có cơ chế đăng ký mọi source root ngoài repo hoặc chống process khác đồng thời thay filesystem; các yêu cầu đó thuộc đường đọc source thật trước LIVE. Các default data path và schema DB giữ nguyên sau khi tách repo; không tự di chuyển DB cũ.

Naming hiện tại độc lập công ty: env `PORTAL_*`, package `@portal/*`, data directory `MigrationPortal/portal-dev`, temp prefix `portal-*`. Branding UI/export sau này đi qua config/asset/template; tên hiển thị không quyết định DB/path hoặc logic nghiệp vụ. Xem CORE-09 trong [rule chung](../../docs/engineering/rules/core.md).

**Nếu đã dùng bản init trước lần đổi naming:** cập nhật tên biến môi trường sang `PORTAL_*`; prefix cũ không còn được đọc. Default data directory đã đổi nên lần chạy mặc định có thể mở DB demo mới. Để tiếp tục dùng DB cũ, dừng backend cũ rồi đặt `PORTAL_DATA_DIR` tới đúng thư mục chứa `portal.db` đã dùng trước đó, sau đó khởi động lại. Schema DB không đổi; không cần đổi tên bảng hoặc chạy migration dữ liệu. Không tự move/xóa DB cũ, không mở hai instance trên cùng data directory. Package import đã chuyển đồng bộ sang `@portal/*`; chạy `npm ci` tại root để cập nhật workspace links.

Override tới DB cũ cũng phải nằm ngoài repo/source. Nếu DB cũ nằm trong repo, cấu hình đó sẽ bị từ chối; cần xử lý di chuyển dữ liệu nhất quán khi backend đã dừng trước khi dùng lại. App không tự move/xóa DB.

Chỉ dùng dữ liệu demo sạch. Chưa có local credential/Host/Origin protection, instance lock hay tính năng đọc source thật. Không expose backend này ra LAN. LIVE phải đạt gate trước khi bổ sung đường đọc source/CLI; đổi env không bật được các tính năng đó.

## Gọi thử một luồng

Mở PowerShell thứ hai khi server đang chạy:

```powershell
$base = 'http://127.0.0.1:4310/api/v1'
Invoke-RestMethod "$base/health"
$body = @{ name = 'Project demo'; fixtureId = 'sample-vb6' } | ConvertTo-Json
$project = Invoke-RestMethod "$base/projects" -Method Post -ContentType 'application/json' -Body $body
Invoke-RestMethod "$base/projects/$($project.id)"
Invoke-RestMethod "$base/projects?limit=20"
```

Endpoint đang có:

- `GET /api/v1/health`: 200, nhãn `mode: fixture`, `runner: fake`. Runner là chế độ được hỗ trợ; health không gọi AI.
- `POST /api/v1/projects`: 201 và `Location`. Body gồm `name` (1–120 ký tự, có nội dung sau trim), `fixtureId` đúng `sample-vb6`. Không nhận `sourcePath` hay field lạ.
- `GET /api/v1/projects/:projectId`: 200 hoặc 404; ID sai định dạng trả 400.
- `GET /api/v1/projects?limit=20&cursor=<nextCursor>`: `{ items, nextCursor }`; limit 1–100, mặc định 20. Dùng nguyên cursor từ response; thứ tự theo UUID tăng dần, **không phải ngày tạo**. Đây không phải snapshot pagination khi có request tạo project đồng thời.

Project trả `id`, `name`, `fixtureId`, `mode: demo`, `createdAt` UTC. Name không tự convert từ số; field không khai báo bị từ chối. Body tối đa 16 KiB. Error chung là `{ error: { code, message, requestId } }`: 400 input, 404 không tìm thấy, 413 body quá lớn, 415 Content-Type không được hỗ trợ, 500 lỗi nội bộ. Chưa có update/delete/job endpoint; không có conflict nghiệp vụ cần 409 trong slice này.

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

Ngày 15/10 đã bổ sung [UI Projects](../web/README.md) nối API fixture. Chưa nghiệm thu LIVE/MS1: Claude process, job state/queue/SSE, decoder CP932, LoC, BR/Design/evidence, review/export, local HTTP security và instance/recovery là các task tiếp theo. Không có VB6 → C# conversion trong source này.

Tham khảo API gốc khi mở rộng: [Fastify type provider](https://github.com/fastify/fastify-type-provider-typebox), [Fastify testing](https://fastify.dev/docs/latest/Guides/Testing/), [better-sqlite3](https://github.com/WiseLibs/better-sqlite3). Phiên bản thực tế được khóa trong package/lockfile, không copy API từ major khác.
