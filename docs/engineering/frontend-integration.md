# Đưa source FE vào repo

Ngày 15/10/2026 đã init `apps/web` (React/Vite + Projects UI) cùng `apps/api` và `packages/contracts`. Đọc [README FE](../../apps/web/README.md) trước khi tích hợp thêm source; không ghi đè workspace đang có. Stack UI đích là React/Vite/TypeScript; đọc [FE rules](rules/frontend.md) và [architecture](architecture.md) khi tích hợp.

## Tích hợp khi đã có source

1. Đưa source FE cùng `package.json`, assets, HTML entrypoint, Vite/framework config, TypeScript/JSX config và cấu hình test cần thiết vào `apps/web`. Không mang `.git`, `node_modules`, `dist`, secrets hoặc dữ liệu runtime. Trước sửa, đối chiếu config/lockfile cũ để giữ phiên bản và hành vi framework; nếu source dùng framework khác kiến trúc đã chốt thì nêu khác biệt trước khi chuyển đổi.
2. Đặt tên package trung lập, ví dụ `@portal/web`, `private: true`. Thêm `apps/web` vào mảng `workspaces` ở `package.json` root. Không thêm workspace khi thư mục/package chưa có.
3. Hợp nhất dependency FE vào `apps/web/package.json` với phiên bản đã đối chiếu lockfile cũ; không dùng cơ hội này để nâng dependency BE. Chỉ duy trì `package-lock.json` ở root. Chạy `npm install` từ root để sinh lockfile hợp nhất, kiểm diff dependency rồi chạy `npm ci` xác nhận cài sạch. Lockfile FE cũ giữ trong lịch sử/backup ngoài repo nếu cần, không dùng song song.
4. UI chỉ dùng public exports của `@portal/contracts` và HTTP API. Thêm dependency contracts khi FE thực sự import nó. Không import `apps/api/src`, SQLite, filesystem hoặc process vào UI.
5. Giữ `tsconfig.app.json`, `tsconfig.node.json`, project references, `jsx`, `lib`, `moduleResolution`, aliases và plugin framework cần thiết. Chỉ `extends` config chung khi tương thích; không áp tsconfig Node của API lên browser. Giữ ranh giới lint/test browser và server, kể cả ESLint/JSX/test DOM config riêng cần thiết.
6. Bổ sung scripts FE `dev`, `build`, `typecheck`, `lint`, `test` phù hợp framework. Root hiện đã build/test/lint FE/API/contracts; giữ cả ba trong checks và bảo đảm `typecheck --workspaces` chạy được. Build contracts trước các consumer. Không dùng `--if-present` để che check FE bị thiếu. Chưa có test thì nêu rõ và bổ sung kiểm chứng cần thiết cho scope tích hợp.
7. Giữ `npm run dev` hiện tại cho API; đã có `dev:web` trỏ tới workspace FE và chạy ở terminal thứ hai. Không tự thêm process orchestrator chỉ để gom hai terminal. Khi sửa contracts, build lại contracts/restart consumer theo README.
8. Khi dùng Vite, cấu hình dev proxy `/api` tới `http://127.0.0.1:4310` và gọi URL tương đối từ UI. Không nới CORS/Host/Origin để chữa lỗi tích hợp. Local HTTP security đã có theo [local-http-security](specs/local-http-security.md): UI bootstrap credential qua `POST /api/v1/session` và gửi header `Authorization`; port UI khác mặc định cần `PORTAL_WEB_PORT`. Dev proxy không phải bằng chứng đạt toàn bộ gate LIVE.

Lệnh sau chỉ dùng **sau khi đã thêm workspace và scripts FE**; chạy tại root repo, PowerShell dùng `npm.cmd` nếu cần:

```sh
npm install
npm ci
npm run check
npm run dev
# Terminal thứ hai:
npm run dev -w @portal/web
```

## Kiểm chứng trước bàn giao

- Một lockfile root, clean install thành công; không có import/path phụ thuộc workspace cá nhân.
- Format/lint/typecheck/test/build cả FE/API/contracts; giữ behavior API hiện tại.
- Smoke UI → API bằng fixture: create/list/detail Projects, loading/error/empty state. Kiểm proxy và restart, không gọi Claude thật.
- Kiểm skill/docs links sau khi thêm file; cập nhật [progress](progress.md) và trạng thái source trong README. Không ghi UI đã tồn tại trước khi được đưa vào repo.
