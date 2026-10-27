# Frontend Portal — hướng dẫn Dev

React 18 + Vite 6 + TypeScript strict. UI có Projects demo/local, source/profile/mapping PF05 và Start/Cancel/Retry/lịch sử run qua API/SQLite thật. Demo dùng executor fixture; local đọc thư mục đã đăng ký để tạo snapshot bất biến và hiển thị “Đã chụp nguồn”. Chưa chạy analyzer inventory/artifact (B08/B07), Claude, Review/Export. Phần bảo vệ HTTP/instance đã có; kiểm thử source local chỉ dùng fixture sạch, chưa nghiệm thu LIVE/MS1 toàn bộ.

UI chỉ dùng giao diện sáng; bộ chọn ngôn ngữ Việt/Nhật ở header. Mặc định tiếng Việt, nhớ lựa chọn trong localStorage (`portal.locale`); nếu storage bị chặn thì vẫn đổi ngôn ngữ trong phiên. Xem [mẫu đa ngôn ngữ](../../docs/engineering/patterns/localization.md) để thêm bản dịch đúng type và giữ state khi chuyển locale.

## Chạy local

Tại root repo, Node 24.16.0/npm 12.0.2:

```sh
npm ci
npm run dev
# Terminal thứ hai, cũng tại root repo:
npm run dev:web
```

PowerShell dùng `npm.cmd` nếu cần. Mở `http://127.0.0.1:5173`. API mặc định port 4310; Vite proxy `/api` sang API để browser dùng URL tương đối. Nếu đổi port API, cập nhật proxy trong `vite.config.ts`. API chỉ tin Host/Origin của port UI mặc định 5173/4173; dùng port UI khác thì đặt cùng `PORTAL_WEB_PORT` cho cả API và Vite. Hai dev server bind loopback, strict port; nếu port bị dùng thì báo lỗi, không tự nhảy port. Không dùng backend thật cho dữ liệu khách hàng trước gate LIVE.

```sh
npm run check
npm run preview:web
```

`check` chạy format/lint/typecheck/test/build cho FE + BE + contracts. `preview:web` phục vụ build đã có tại `http://127.0.0.1:4173`; vẫn cần API chạy ở 4310, chỉ để xem thử local, chưa phải đóng gói release. Khi sửa contracts, chạy lại build contracts/restart consumer theo README root.

## Tham khảo FE prototype

Đã đọc bản FE Dev cung cấp trước khi init. Phần dùng lại: React/Vite, chia theo feature, palette sáng, ý tưởng header + stepper và card/form. Đã bỏ lựa chọn sáng/tối theo yêu cầu; không cần prototype để clone/build repo này.

Phần chưa mang sang:

- DTO `@rikai/contracts` của prototype khác API hiện tại; dùng schema/DTO `@portal/contracts` đang chạy, không ghi đè contracts backend.
- Upload, timer/log/counter giả lập phân tích và các kết quả review/estimate hardcode. Path input hiện thuộc form source PF05, qua API bảo vệ; các bước inventory/report/review chưa có vẫn ghi chưa khả dụng.
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
- [projects-api.ts](src/shared/api/projects-api.ts): endpoint/DTO Projects. [api-client.ts](src/shared/api/api-client.ts): transport chung, validate success/error body từ `unknown`, timeout 15 giây bao gồm đọc body và cleanup cancellation; gửi credential local chỉ trong header `Authorization`, không có credential thì không gửi request, không tự retry POST. [local-session.ts](src/shared/api/local-session.ts): bootstrap credential dùng chung, trạng thái pending/failed/expired hiển thị ở [session-status.tsx](src/app/session-status.tsx). Policy: [local-http-security](../../docs/engineering/specs/local-http-security.md). [api-error.ts](src/shared/api/api-error.ts): kind/method/status/code/requestId và kết quả ghi chưa xác nhận; không chứa UI copy hoặc raw server message. [project-messages.ts](src/features/projects/project-messages.ts): resolver chọn thông báo từ catalog đang dùng theo code và thao tác; thiếu/code mới dùng fallback an toàn. Policy tên/fixture/default pagination lấy từ contracts.
- [analyze-run-panel.tsx](src/features/jobs/analyze-run-panel.tsx), [use-analyze-runs.ts](src/features/jobs/use-analyze-runs.ts) (PF03/F02): Start/Cancel/Retry/lịch sử run của project đang chọn, nhãn demo. Effect chỉ GET (current + lịch sử, polling có backoff khi run active); mutation chỉ từ thao tác người dùng. Start giữ một idempotency key cho cùng ý định: lỗi chưa xác nhận kết quả (network/timeout/5xx/response hỏng) gửi lại đúng key và body; câu trả lời rõ ràng kết thúc ý định, Retry nghiệp vụ dùng key mới + `retryOfRunId`. Cancel gửi `expectedStateVersion`; gặp `RUN_STATE_CONFLICT` thì GET lại và chỉ hủy lần nữa nếu run còn active; trạng thái “Đang hủy…” giữ tới khi backend báo terminal. Mất kết nối khi polling hiển thị thông báo riêng, không đổi trạng thái run. Response cũ bị bỏ theo run/`stateVersion`/`updatedAt`; panel keyed theo project nên đổi project hủy request cũ. [runs-api.ts](src/shared/api/runs-api.ts): endpoint run, header `Idempotency-Key` cùng credential.
- [source-panel.tsx](src/features/source/source-panel.tsx), [use-project-source.ts](src/features/source/use-project-source.ts), [sources-api.ts](src/shared/api/sources-api.ts) (PF05/F01): tạo project “Mã nguồn trên máy này”, đăng ký path/profile/schema; mapping assumed/confirmed có nhãn VI/JA. Path chỉ gửi trong body PUT, không URL/log; backend không trả path nên sửa source phải nhập lại. Lỗi forbidden/unreadable/stale giữ input; “Tải lại mã nguồn” đọc revision mới trước khi lưu lại. Đổi project abort/bỏ response cũ, đổi locale giữ state. PUT thành công vô hiệu hóa mọi GET khởi tạo trước thời điểm lưu xong (kể cả refresh trong lúc PUT chờ); response thành công/lỗi trả muộn không ghi đè revision vừa lưu. Start bị chặn khi source thiếu/không đọc được; source sẵn sàng chỉ xác nhận root, chưa xác nhận mọi file. Local run thành công chỉ được ghi “Đã chụp nguồn”.
- [assessment-overview.tsx](src/features/assessment/assessment-overview.tsx), [use-run-assessment.ts](src/features/assessment/use-run-assessment.ts), [assessment-summary.ts](src/features/assessment/assessment-summary.ts), [artifacts-api.ts](src/shared/api/artifacts-api.ts) (PF06/F03): khi run đang xem `succeeded`, đọc danh sách artifact của run rồi GET đúng version đã liệt kê (không có “latest”); envelope khác id/version/run/project bị coi là lỗi. Header: dữ liệu demo/local, artifact + version, snapshot ID/hash, phiên bản đếm, mapping tên bảng (kiểm kê cũ không có mapping ghi rõ). Tổng không trùng lấy từ `totals.uniqueCounters`; tổng theo program hiển thị riêng, ghi rõ file dùng chung được tính ở mỗi program. Program không phân tích được hiển thị “Chưa phân tích”, không phải 0. Cảnh báo partial/mapping/complexity draft/cần xem không bị lọc; độ phức tạp chỉ đọc từ inventory, nhãn tham khảo. Danh sách program có tìm kiếm, lọc trạng thái/độ phức tạp và chọn để xem file. Đổi run/project hủy request cũ; đổi locale không gọi lại API. Số theo `Intl.NumberFormat` của locale.
- [assessment-overview.spec.ts](../../tests/e2e/assessment-overview.spec.ts): demo run → artifact → overview, tổng không trùng 655 vs theo program 775, partial/warning, tìm/chọn program, VI desktop + JA mobile không tràn ngang, reload đọc lại đúng version và không Start.
- [source-registration.spec.ts](../../tests/e2e/source-registration.spec.ts): browser tích hợp API/SQLite temp, validation/root forbidden/unreadable/stale, source revision, Start/snapshot/hash CP932/normalized, source không đổi, VI/JA/mobile và reload không tự Start. Harness tự tạo source sạch ngoài repo/data rồi dọn. Không dùng thư mục source cá nhân để smoke.
- [locale-provider.tsx](src/shared/i18n/locale-provider.tsx), [locale.ts](src/shared/i18n/locale.ts): preference đã validate, `html.lang` và formatter ngày giờ. [locale-context.ts](src/shared/i18n/locale-context.ts): context/hook riêng để giữ identity qua hot reload. [vi.ts](src/shared/i18n/vi.ts)/[ja.ts](src/shared/i18n/ja.ts): catalog typed cho toàn bộ màn hình và lỗi; thêm locale theo mẫu engineering. Font Nhật dùng fallback hệ thống, không tải font ngoài lúc chạy.
- [projects-page.test.tsx](src/features/projects/projects-page.test.tsx), [projects-api.test.ts](src/shared/api/projects-api.test.ts): luồng chính và failure/race path. [app.test.tsx](src/app/app.test.tsx): chuyển locale với state/pending/error đang tồn tại và preference không khả dụng.

Khi thêm feature, theo [engineering](../../docs/engineering/README.md), đặc biệt FE-01/02/04/06/07, CORE-04/09 và QA-05/06. Không dùng UI state hoặc nút disabled thay ràng buộc backend. Backend không đổi schema/API trong task init FE này.

Mẫu mới cho Dev: [policy và lỗi API](../../docs/engineering/patterns/api-errors-policy.md), CORE-11, BE-09, FE-08 và QA-10. Error envelope hiện giữ tương thích, producer code có type chung và client chấp nhận code mới để fallback; không suy diễn 404 luôn là mất dự án. [Message tests](src/features/projects/project-messages.test.ts) và API/UI tests là ví dụ failure path cần giữ khi mở rộng.

Nguồn tham khảo: [Vite server/proxy](https://vite.dev/config/server-options.html), [React Testing Library setup](https://testing-library.com/docs/react-testing-library/setup/), [Vitest environment](https://vitest.dev/config/environment).
