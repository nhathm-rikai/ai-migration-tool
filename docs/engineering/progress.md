# Tiến độ kỹ thuật Portal

Nhật ký độc lập của repo sản phẩm. Sau implement/quyết định kỹ thuật ghi scope, command/bằng chứng và giới hạn ở đây; review-only chỉ báo trong chat.

## Phạm vi hiện tại

- Gate init FE + BE; Projects/UI/API/storage, fixture + fake runner. Fastify → service → repository, SQLite thật, TypeBox contracts.
- Đã có [FE Projects](../../apps/web/README.md) gọi API thật. Chưa Analyze/Understand, Claude CLI, LIVE/MS1 hoặc conversion.
- Runtime mục tiêu Windows/macOS/Linux; hiện chỉ kiểm native trên Windows x64, Node 24.16.0/npm 12.0.2.

## 15/10/2026 — chuẩn hóa policy và lỗi API làm mẫu cho Dev

- Scope feature / Projects/API/UI / fixture + fake runner. Rà BE config, service/repository, error handler/catalog, platform/data guard, DB/migration/logging và fake adapter; sửa policy lặp và nhận diện lỗi sai, không coi catalog an toàn, protocol literal, loopback guard hoặc migration lịch sử là hardcode cần xóa. Không thêm LIVE/CLI, config động hoặc framework i18n.
- Contracts bổ sung policy tên/fixture/mode/default page size và type public error code. Service dùng lại schema sau normalize, query validation trước repository; UI sinh nội dung giới hạn từ policy chung. Producer catalog dùng `satisfies Record<ApiErrorCode, ...>`; giữ error envelope mở cho mã mới để client cũ fallback. HTTP payload/schema DB/dependencies không đổi; migration cũ giữ nguyên.
- BE handler nhận diện AppError và mã Fastify validation/JSON/body/content-type cụ thể; unknown dependency 4xx không còn bị biến thành INVALID_INPUT. Giữ status/message an toàn, request ID và log tại boundary.
- FE tách `api-client.ts`/`api-error.ts` khỏi endpoint Projects và `project-messages.ts`. Giữ kind/method/status/code/requestId, phân biệt HTTP/network/timeout/invalid-response và caller cancellation; timeout bao gồm đọc response body. Không render raw server message, không suy diễn business error chỉ từ status. Tạo gặp network/timeout/response hỏng/server failure có trạng thái chưa xác nhận kết quả và hướng dẫn kiểm tra danh sách; không tự retry POST. Form tách field/submit error, không đánh dấu tên invalid vì backend lỗi.
- Dùng `portal-implement`, `skill-creator` và `create-rule` để bổ sung CORE-11, BE-09, FE-08, QA-10 tại rule gốc; thêm [mẫu source/test cho Dev](patterns/api-errors-policy.md), nối README và workflow. Cập nhật đồng nhất bốn wrapper Codex/Claude cho implement/review, giữ review-only và `disable-model-invocation: true` của Claude; Cursor tiếp tục đọc cùng rule gốc.
- `npm.cmd run check` pass ngoài sandbox: format/lint/typecheck, **74 BE tests/10 files + 33 FE tests/3 files**, build contracts/API/Vite. Regression kiểm cùng status khác code, unknown/malformed body, success JSON/schema hỏng, hủy trước/trong fetch, timeout cả body, mutation uncertainty/no automatic retry, lỗi submit không đánh dấu field, shared Unicode/name policy và unknown dependency 4xx. Sửa các lỗi format/lint/type của test phát hiện trong quá trình chạy gate; không bỏ check để bàn giao.
- `node scripts/smoke-backend.mjs` pass: compiled startup từ cwd ngoài repo, migration/create/reopen SQLite và bốn protected path. Browser smoke IAB trên DB temp riêng: validation, tạo/mở dự án, dừng backend để kiểm hướng dẫn chưa xác nhận lưu và input vẫn valid; phục hồi backend, refresh và mở lại đúng ID. Screenshot ở `test-results/policy-errors/` (Git ignored); expected proxy error khi cố ý dừng backend không được coi là bug sản phẩm.
- `node scripts/verify-repository.mjs` pass: rule/docs links và wrapper metadata/behavior đồng nhất; `git diff --check` pass. Validator chung `quick_validate.py` không chạy được vì Python hệ thống và bundled thiếu PyYAML; dùng validator riêng của repo kiểm flat YAML và cả bốn wrapper. Chưa thử discovery/behavior của skill trong session mới hoặc review độc lập. Runtime thực kiểm Windows x64, Node 24.16.0; chưa native macOS/Linux, chưa LIVE/MS1.

## 15/10/2026 — chỉnh UI theo thiết kế demo01

- Dùng `portal-implement`; scope feature / Projects UI / API fixture + fake runner. Demo01 là thiết kế tham chiếu theo yêu cầu người dùng: bỏ bước Upload, bổ sung cây dự án. Không thay BE/contracts/storage, không đọc source hoặc chạy AI thật.
- Khôi phục palette, font Be Vietnam Pro (400–800), JetBrains Mono, body 15px/1.55, heading 22px, header gọn, stepper dạng ô riêng, panel/button/form theo thiết kế. Đóng gói font local cùng giấy phép SIL OFL từ Google Fonts; không gọi font CDN lúc chạy. Logo Rikai nằm trong asset branding riêng và được đọc qua `branding.ts`, không gắn vào định danh API/storage.
- Cây dự án bên trái dùng dữ liệu API hiện có, mở/thu nhánh và mở tổng quan bên phải. Tạo dự án mới dùng cùng vùng nội dung; sau tạo chọn và mở nhánh dự án vừa lưu. Giữ loading/empty/error/retry/pagination và cleanup request. Các nhánh và bốn bước đánh giá chưa triển khai đều disabled/có nhãn; không dựng file source hoặc kết quả giả. Dùng nav/list/button native, không khai báo ARIA tree thiếu keyboard model.
- `npm.cmd run check` pass ngoài sandbox: format, lint, typecheck, **68 BE tests/10 files + 11 FE tests/2 files**, build contracts/API/Vite. Thêm test luồng chọn/chuyển dự án, mở/thu nhánh, quay về tạo mới; giữ test pending/create/error/pagination/stale response. Lần check trong sandbox thất bại ở 5 test symlink và 1 HTTP loopback do EPERM/ENOENT/EACCES; không sửa code backend để né hạn chế môi trường.
- Browser smoke Codex IAB: empty state, form trống có lỗi, tạo dự án qua UI/proxy/API với SQLite temp riêng, mở/thu cây, reload rồi mở lại đúng project ID; font document loaded/check thành công; desktop 1280px và mobile 390px không tràn ngang, theme sáng/tối. Sửa accessible name của nút theme khi label chữ bị ẩn trên mobile. Console không có error/warn trong luồng đã kiểm. Bằng chứng local trong `test-results/fe-demo01/` (Git ignored).
- Sau chỉnh accessible name, chạy lại format check file, ESLint FE, 11 test FE và build FE: pass. `node scripts/verify-repository.mjs` pass với README FE đã cập nhật. Runtime thực kiểm: Windows x64, Node 24.16.0; chưa native macOS/Linux hoặc Safari/Firefox. Chưa LIVE/Analyze/Review/Export.

## 15/10/2026 — init FE từ tham khảo prototype

- Dùng `portal-implement`, scope init / Projects UI / fixture + fake runner. Đọc bản FE Dev cung cấp trước khi làm; giữ nguyên bản tham khảo ngoài repo. Tham khảo palette sáng/tối, header/stepper, bố cục feature; không mang DTO khác backend, timer/counter phân tích giả, upload hoặc cam kết xử lý dữ liệu chưa triển khai vào luồng sản phẩm.
- Thêm `apps/web` với React/React DOM 18.3.1, Vite 6.4.4, plugin React 4.7.0 theo lockfile prototype. TypeScript strict, ESM, JSX/DOM/Bundler config riêng, ESLint typed + React hooks. Package `@portal/web`, branding display riêng; không font ngoài, không mở LAN.
- UI → proxy `/api` → API hiện có: tạo/list/phân trang/detail Projects, loading/empty/error/pending, refresh/retry tường minh; kiểm schema TypeBox cho response unknown, abort/timeout 15 giây và bỏ response cũ. Không tự retry POST. Dữ liệu lưu SQLite thật; lựa chọn detail chỉ trong phiên UI. Các bước chưa triển khai ghi “Chưa khả dụng”. Source BE và HTTP contract không thay đổi.
- Một root lockfile và ba workspaces; root `dev` vẫn chạy API, `dev:web` chạy FE port 5173, `preview:web` xem build port 4173. Root checks bao gồm FE/API/contracts. Thêm allow postinstall đúng `esbuild@0.25.12` của Vite, giữ cấu hình SQLite. Dependency test FE thêm Testing Library/jsdom; Vitest 5.0.4 dùng chung.
- `npm.cmd install` hợp nhất lockfile, rồi `npm.cmd ci --offline` pass: 294 packages cài sạch; không lấy node_modules/dist từ prototype. Offline audit không phải bằng chứng tra advisory mới nhất.
- `npm.cmd run check` pass: format check, lint, typecheck ba workspaces, **68 BE tests/10 files + 10 FE tests/2 files**, build contracts/API/Vite. FE tests kiểm create/pending, validation trước POST, lỗi list/create, pagination, cancellation, stale detail, malformed response và không tự retry mutation.
- Browser smoke trên Codex IAB/Windows: form trống có lỗi; tạo dự án qua UI/proxy/API, mở detail, reload vẫn giữ project; theme sáng/tối, viewport 390px một cột và không tràn ngang. Console không có error trong luồng đã kiểm. DB fixture temp riêng đã được dọn và server smoke đã dừng; không đọc source khách hàng hay dùng DB cá nhân. Screenshot local trong `test-results/fe-init/` (Git ignored).
- `node scripts/verify-repository.mjs` pass: 32 tài liệu, 227 link nội bộ, 4 skill frontmatters, 3 Cursor frontmatters, workspace/root lockfile. README root/FE và trạng thái engineering/entrypoint đã cập nhật; repo không cần prototype để clone/build.
- Bằng chứng native hiện **Windows x64, Node 24.16.0/npm 12.0.2**. Chưa native Mac/Linux, chưa Safari/Firefox matrix, chưa kiểm discovery skills trong session mới hoặc tech lead review độc lập. Chưa LIVE/CLI/Analyze/Review/Export, không commit/remote/push.

## 14/10/2026 — tách repo sản phẩm

- Di chuyển source/tooling, engineering và wrapper Codex/Claude/Cursor vào repo này. Một npm lockfile; không đổi dependency hoặc HTTP contract.
- Không mang proposal/kế hoạch/demo/tài liệu cá nhân, customer source, DB/runtime hoặc bộ cài/build cũ. Repo không cần dữ liệu hoặc file cấu hình ở parent directory.
- Repo root vẫn xác định từ layout module `apps/api/src` hoặc `apps/api/dist`, độc lập cwd. Guard thêm thư mục `source_vb6` bên cạnh repo, kể cả chưa tồn tại và alias trỏ vào đó; không cấm toàn bộ parent workspace. Nơi clone không có thư mục sibling này vẫn hoạt động. Chưa hỗ trợ đăng ký arbitrary customer roots hoặc cô lập filesystem trước LIVE.
- Giữ explicit invocation của hai Claude skills và review-only. Convention duy nhất tại `docs/engineering/`; progress trong repo thay tham chiếu nhật ký cá nhân.
- Khởi tạo Git cục bộ tại repo này; chưa stage, commit, remote hoặc push. Lockfile giữ nguyên SHA-256 `FABA5405D966049E8BB829A4D28E8BD28C4B4CE48D92D3E338A02C9B21709EA7`; không đổi dependency.
- Sửa script `lint` build contracts trước ESLint: typed lint của clone sạch cần exports compiled của workspace contracts. Không phụ thuộc dist cũ. FE chưa có nên giữ hai workspaces hiện tại; hướng dẫn bổ sung workspace/scripts/lockfile khi có FE.

### Kiểm chứng tại repo root

- `npm.cmd ci --offline`: pass, 192 packages cài mới từ npm cache theo lockfile; không tái sử dụng node_modules cũ. Lần sandbox ban đầu bị EPERM khi tạo workspace junction; chạy ngoài sandbox pass. Không coi kết quả audit offline là bằng chứng tra cứu advisory mới nhất.
- `npm.cmd run check`: pass — format check, lint, typecheck, **68 tests/10 files**, build. Lần clean check đầu phát hiện lint thiếu build contracts; đã sửa script và toàn bộ check pass sau đó.
- `node scripts/verify-repository.mjs`: pass — 31 tài liệu, 210 link nội bộ, 4 skill frontmatters, 3 Cursor frontmatters và root workspace lockfile. Frontmatter hiện dùng subset YAML phẳng; validator kiểm đúng cấu trúc đó. Nội dung wrapper cùng workflow, khác ví dụ invocation theo tool.
- `node scripts/smoke-backend.mjs`: pass — compiled server chạy từ cwd temp ngoài repo, migration tạo DB, POST project 201, restart/reopen trả cùng project; bốn path repo/source/descendant bị từ chối trước ghi DB. Validate parent workspace hợp lệ nhưng không ghi DB vào đó.
- `git rev-parse --show-toplevel`: đúng repo sản phẩm. `git remote -v`: rỗng. `git check-ignore` kiểm dependencies/build/secrets/runtime/tài liệu cá nhân bị loại. Không stage hoặc commit.
- Native filesystem/junction, SQLite và HTTP chạy trên **Windows x64, Node 24.16.0/npm 12.0.2**. Unit test kiểm lựa chọn path macOS/Linux và clone không có source sibling; chưa native smoke trên macOS/Linux.

### Giới hạn còn lại

- Chưa kiểm discovery trong session mới của Codex/Claude/Cursor tại đường dẫn mới; metadata/link đúng không thay runtime discovery.
- Chưa có review độc lập sau di chuyển, UI, CLI hoặc LIVE; Host/Origin protection, local credential, instance lock và source root registration vẫn theo gate.
- Chưa có remote/commit để team clone qua Git; khi được giao publish mới thực hiện. Source/tooling/docs ở đây không cần workspace cá nhân để build/chạy.
