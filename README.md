# Migration Portal

Dev mở rộng nền tảng bắt đầu từ [mẫu policy và lỗi API](docs/engineering/patterns/api-errors-policy.md), lần theo source và test thật. Quy tắc này được dùng chung bởi skill implement/review; không copy validation hoặc suy diễn lỗi nghiệp vụ chỉ từ HTTP status.

Thư mục chứa file này là **root repo sản phẩm**. Backend đã init trong [apps/api](apps/api/README.md); schema/DTO dùng chung nằm trong `packages/contracts`. Đọc **README backend trước**, sau đó lần theo module Projects. Repo tự đủ: không cần proposal, demo HTML, source khách hàng hay tài liệu ở parent directory.

Phạm vi hiện tại: **Projects demo/local + SQLite, đăng ký source/profile/mapping và snapshot bất biến; thư viện/CLI Analyze VB6 độc lập; E2E browser fixture**. Local run đọc revision source đã khóa để chụp nguồn; UI ghi “Đã chụp nguồn”. Analyzer inventory/artifact chưa nối vào job (B08/B07). Chưa Understand/Claude CLI, review/export workflow hoặc conversion. Đây chưa phải bản release cho Sales; chỉ dùng fixture sạch để kiểm đường đọc source local.

## Chạy trên máy Dev

Runtime đã kiểm chứng: Windows, Node **24.16.0**, npm **12.0.2**. `.nvmrc` và `engines` ghi phiên bản; npm workspaces dùng một `package-lock.json` tại root.

Mở PowerShell tại thư mục chứa file này:

```powershell
npm.cmd ci
npm.cmd run dev
```

Trên macOS/Linux dùng `npm` thay `npm.cmd`; native runtime trên hai OS này chưa được kiểm chứng. Clone/checkout xong chỉ cài từ root repo; không copy `node_modules` hoặc `dist` từ máy khác. Runtime data mặc định nằm ngoài repo theo OS; `PORTAL_DATA_DIR` có thể giữ đường dẫn dữ liệu cũ hợp lệ. Xem [cấu hình và data guard](apps/api/README.md).

Chạy `npm.cmd run dev:web` ở terminal thứ hai và mở `http://127.0.0.1:5173`. Frontend proxy `/api` sang backend local, không cần cấu hình CORS. [README FE](apps/web/README.md) mô tả luồng và cách mở rộng.

API mặc định: `http://127.0.0.1:4310/api/v1/health`. Dừng bằng Ctrl+C. Không cần Claude, API key hoặc source khách hàng để chạy bản init.

```powershell
npm.cmd run check
npm.cmd run build
npm.cmd start
```

`check` chạy format check → lint → typecheck → test → build. `start` chạy bản đã build, không tự build lại. `dev` build contracts rồi watch backend; **sửa contracts thì dừng và chạy lại `dev`** để cập nhật bản compiled dùng chung.

### E2E browser (fixture)

```powershell
npx.cmd playwright install chromium
npm.cmd run e2e
npm.cmd run e2e:self-check
```

`playwright install` tải Chromium một lần vào cache của user (ngoài repo; Linux có thể cần `--with-deps`). `e2e` build toàn bộ, chạy API đã build và `vite preview` trên port loopback trống, SQLite trong thư mục temp riêng, seed một project demo qua API rồi chạy Playwright headless (`tests/e2e`). Kết thúc luôn dừng hai process, xóa thư mục temp, kiểm port đã đóng và DB trong data directory cá nhân không đổi. Report HTML ở `test-results/e2e/report`, trace/screenshot khi fail ở `test-results/e2e/artifacts` (đã ignore). `e2e:self-check` chạy smoke đối chứng (phải pass, nên thiếu browser/server làm self-check fail ngay), rồi hai kịch bản fail có chủ đích (assertion sai, API dừng trước test) và một regression thiếu browser. Trước khi mở browser, self-check tự kiểm bộ chấm trên kết quả giả lập. Rò port/temp/DB luôn làm self-check fail ở mọi kịch bản. Kết quả đọc từ JSON report (`test-results/e2e/results.json`): đúng test fail vì đúng nguyên nhân, không phải lỗi hạ tầng như `browserType.launch`, có trace/report và không rò. Không gọi Claude/AI, không dùng source khách hàng. `PORTAL_WEB_PORT` đổi port Vite; proxy dùng `PORTAL_PORT` như API.

`npm ci` cần kết nối tải package lần đầu. Postinstall của esbuild được cho phép theo đúng phiên bản trong `allowScripts`. `better-sqlite3@13.0.3` đã kèm binary Windows; cấu hình tắt install script của đúng phiên bản này để npm 12 không tự chạy `node-gyp rebuild` và yêu cầu C++ toolchain. Khi nâng driver cần kiểm lại chính sách này. Driver SQLite được kiểm chứng trực tiếp bằng integration test, không thay bằng mock.

## Tài liệu

- [Cách gọi API, đọc source và mở rộng từng lớp](apps/api/README.md).
- [Rule và workflow dùng skill](docs/engineering/README.md).
- [Bản đồ tìm file khi gặp edge case](docs/engineering/examples.md).
- [Tích hợp source FE vào apps/web](docs/engineering/frontend-integration.md).
- [Tiến độ và bằng chứng kỹ thuật](docs/engineering/progress.md).

## Cấu trúc repo

```text
apps/api/                 # Fastify, src, migrations, tests và README
apps/web/                 # React/Vite, Projects UI, DOM/API client tests
packages/contracts/      # TypeBox schema/DTO
docs/engineering/        # convention gốc, specs, workflow, progress
.agents/skills/          # portal-implement, portal-techlead-review
.claude/skills/          # cùng workflow; explicit invocation
.cursor/rules/           # wrapper theo scope
scripts/                 # kiểm cấu trúc repo, link và skill; harness E2E
tests/e2e/               # Playwright smoke trên fixture
AGENTS.md, CLAUDE.md      # hướng dẫn coding độc lập
package.json             # workspaces và scripts chung
package-lock.json        # lockfile duy nhất
```

`apps/web` đã init; dùng palette/shell của prototype làm tham khảo, Projects dùng contracts/API thật. Các bước chưa có backend được ghi “Chưa khả dụng”. API vẫn chạy độc lập với FE.

Repo đã có lịch sử Git cục bộ; trạng thái chia sẻ/CI không được suy ra từ việc có commit. `.gitignore` loại dependencies/build/cache, secrets, DB/log, source khách hàng và tài liệu cá nhân. Khi chia sẻ, chỉ dùng repo này; không thêm parent workspace vào repo. Kiểm cấu trúc/link/skill bằng `node scripts/verify-repository.mjs`; sau build chạy `node scripts/smoke-backend.mjs` để kiểm compiled startup/migration/reopen từ cwd bên ngoài.
