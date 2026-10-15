# Frontend Portal — hướng dẫn Dev

Gate **init / Projects UI / fixture + fake runner**. React 18 + Vite 6 + TypeScript strict. UI tạo, liệt kê/phân trang và xem chi tiết dự án qua API thật, dữ liệu lưu bằng SQLite ở backend. Không upload hoặc đọc source, không chạy Claude, không có Analyze/Review/Export thật.

UI chỉ dùng giao diện sáng; bộ chọn ngôn ngữ Việt/Nhật ở header. Mặc định tiếng Việt, nhớ lựa chọn trong localStorage (`portal.locale`); nếu storage bị chặn thì vẫn đổi ngôn ngữ trong phiên. Xem [mẫu đa ngôn ngữ](../../docs/engineering/patterns/localization.md) để thêm bản dịch đúng type và giữ state khi chuyển locale.

## Chạy local

Tại root repo, Node 24.16.0/npm 12.0.2:

```sh
npm ci
npm run dev
# Terminal thứ hai, cũng tại root repo:
npm run dev:web
```

PowerShell dùng `npm.cmd` nếu cần. Mở `http://127.0.0.1:5173`. API mặc định port 4310; Vite proxy `/api` sang API để browser dùng URL tương đối. Nếu đổi port API, cập nhật proxy trong `vite.config.ts`. Hai dev server bind loopback, strict port; nếu port bị dùng thì báo lỗi, không tự nhảy port. Không dùng backend thật cho dữ liệu khách hàng trước gate LIVE.

```sh
npm run check
npm run preview:web
```

`check` chạy format/lint/typecheck/test/build cho FE + BE + contracts. `preview:web` phục vụ build đã có tại `http://127.0.0.1:4173`; vẫn cần API chạy ở 4310, chỉ để xem thử local, chưa phải đóng gói release. Khi sửa contracts, chạy lại build contracts/restart consumer theo README root.

## Tham khảo FE prototype

Đã đọc bản FE Dev cung cấp trước khi init. Phần dùng lại: React/Vite, chia theo feature, palette sáng, ý tưởng header + stepper và card/form. Đã bỏ lựa chọn sáng/tối theo yêu cầu; không cần prototype để clone/build repo này.

Phần chưa mang sang:

- DTO `@rikai/contracts` của prototype khác API hiện tại; dùng schema/DTO `@portal/contracts` đang chạy, không ghi đè contracts backend.
- Upload/path input, timer/log/counter giả lập phân tích và các kết quả review/estimate hardcode. Bản này chỉ hiển thị các bước tương lai là “Chưa khả dụng”.
- Cam kết NDA/private/no-training trong mockup chưa có cơ chế thực thi. Không hiển thị các cam kết đó như hành vi hiện có.
- `host: true` và assets starter không dùng. Font được đóng gói local, không gọi Google Fonts khi chạy.
- Oxlint riêng của prototype: thống nhất ESLint typed với repo, thêm rule React hooks; giữ cấu hình JSX/DOM/Bundler của FE tách khỏi Node.

Phiên bản React/Vite/plugin/types lấy từ lockfile prototype: React/React DOM 18.3.1, Vite 6.4.4, plugin React 4.7.0, types React 18.3.31/React DOM 18.3.7. Không dùng range nâng version ngầm; chỉ có lockfile root. Vitest 5.0.4 dùng chung; thêm Testing Library và jsdom cho DOM tests. Postinstall esbuild 0.25.12 của Vite được allow đúng phiên bản, giữ chính sách SQLite cũ.

## Mở file nào?

- [app.tsx](src/app/app.tsx): header và bộ chọn ngôn ngữ, bọc UI bằng LocaleProvider. [branding.ts](src/app/branding.ts): tên sản phẩm/logo từ asset branding; không quyết định package/API/data path.
- [styles.css](src/app/styles.css): palette, typography và component style bám thiết kế demo01, layout desktop/mobile và focus states. Be Vietnam Pro (400/500/600/700/800) và JetBrains Mono được phục vụ từ `public/fonts`; không import font từ mạng. Giấy phép SIL OFL đi kèm mỗi họ font, lấy từ Google Fonts (`google/fonts`, `ofl/bevietnampro` và `ofl/jetbrainsmono`). Logo là asset branding riêng trong repo, không phụ thuộc file demo bên ngoài lúc build/chạy.
- [projects-page.tsx](src/features/projects/projects-page.tsx): cây điều hướng dự án với nút mở/thu nhánh, empty/loading/error, pagination, tạo mới và chọn detail ở vùng bên phải. Dùng danh sách/nút native cho điều hướng bàn phím; không giả lập ARIA tree khi chưa có keyboard model tương ứng. Thứ tự theo ID của API, không phải mới nhất trước. Đã bỏ bước Upload; bốn bước đánh giá còn lại dùng ô riêng và disabled với nhãn “Chưa khả dụng”. Cây điều hướng không giả lập file source hoặc kết quả chưa có API.
- [create-project-form.tsx](src/features/projects/create-project-form.tsx): kiểm input theo schema, khóa submit đang chờ, giữ tên khi lỗi; tách validation field và lỗi submit. Không tự retry POST; mất kết nối/timeout/server lỗi hoặc response tạo sai định dạng phải nhắc làm mới danh sách để kiểm trước khi tạo lại.
- [use-project-list.ts](src/features/projects/use-project-list.ts), [project-detail.tsx](src/features/projects/project-detail.tsx): request lifecycle, abort/ignore response cũ. Reload browser tải lại danh sách; lựa chọn detail chỉ sống trong phiên UI, chưa có deep link.
- [projects-api.ts](src/shared/api/projects-api.ts): endpoint/DTO Projects. [api-client.ts](src/shared/api/api-client.ts): transport chung, validate success/error body từ `unknown`, timeout 15 giây bao gồm đọc body và cleanup cancellation. [api-error.ts](src/shared/api/api-error.ts): kind/method/status/code/requestId và kết quả ghi chưa xác nhận; không chứa UI copy hoặc raw server message. [project-messages.ts](src/features/projects/project-messages.ts): resolver chọn thông báo từ catalog đang dùng theo code và thao tác; thiếu/code mới dùng fallback an toàn. Policy tên/fixture/default pagination lấy từ contracts.
- [locale-provider.tsx](src/shared/i18n/locale-provider.tsx), [locale.ts](src/shared/i18n/locale.ts): preference đã validate, `html.lang` và formatter ngày giờ. [locale-context.ts](src/shared/i18n/locale-context.ts): context/hook riêng để giữ identity qua hot reload. [vi.ts](src/shared/i18n/vi.ts)/[ja.ts](src/shared/i18n/ja.ts): catalog typed cho toàn bộ màn hình và lỗi; thêm locale theo mẫu engineering. Font Nhật dùng fallback hệ thống, không tải font ngoài lúc chạy.
- [projects-page.test.tsx](src/features/projects/projects-page.test.tsx), [projects-api.test.ts](src/shared/api/projects-api.test.ts): luồng chính và failure/race path. [app.test.tsx](src/app/app.test.tsx): chuyển locale với state/pending/error đang tồn tại và preference không khả dụng.

Khi thêm feature, theo [engineering](../../docs/engineering/README.md), đặc biệt FE-01/02/04/06/07, CORE-04/09 và QA-05/06. Không dùng UI state hoặc nút disabled thay ràng buộc backend. Backend không đổi schema/API trong task init FE này.

Mẫu mới cho Dev: [policy và lỗi API](../../docs/engineering/patterns/api-errors-policy.md), CORE-11, BE-09, FE-08 và QA-10. Error envelope hiện giữ tương thích, producer code có type chung và client chấp nhận code mới để fallback; không suy diễn 404 luôn là mất dự án. [Message tests](src/features/projects/project-messages.test.ts) và API/UI tests là ví dụ failure path cần giữ khi mở rộng.

Nguồn tham khảo: [Vite server/proxy](https://vite.dev/config/server-options.html), [React Testing Library setup](https://testing-library.com/docs/react-testing-library/setup/), [Vitest environment](https://vitest.dev/config/environment).
