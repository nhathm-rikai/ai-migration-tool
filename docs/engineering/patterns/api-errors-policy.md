# Mẫu nền tảng: policy và lỗi API

Áp dụng cho Projects/UI/API fixture hiện tại và module mở rộng có cùng ranh giới. Rule gốc: CORE-11, BE-04/09, FE-08 và QA-10; tài liệu này chỉ dẫn tới implementation/test thật để Dev làm mẫu. Không phải yêu cầu dựng framework hoặc đưa mọi literal vào config.

## Giá trị cố định nằm ở đâu?

- Policy dùng bởi schema/service/UI nằm trong [project-policy.ts](../../../packages/contracts/src/project-policy.ts). Tên dự án tính theo Unicode code point; service dùng lại schema sau normalize, UI dùng policy để sinh nội dung hướng dẫn. Giới hạn page size nằm ở schema; giá trị mặc định dùng chung với service.
- [project.schema.ts](../../../packages/contracts/src/project.schema.ts) là contract runtime. Dùng lại validation tại các ranh giới cần bảo vệ không phải sao chép thuật toán/giới hạn. Test biên qua HTTP và SQLite nằm ở [project.integration.test.ts](../../../apps/api/src/modules/projects/project.integration.test.ts); test direct service ở [project.service.test.ts](../../../apps/api/src/modules/projects/project.service.test.ts).
- [0001-initial.sql](../../../apps/api/migrations/0001-initial.sql) là lịch sử schema bất biến. Literal `120`/`sample-vb6` ở đó phải giữ; đổi policy có ảnh hưởng DB thì thêm migration và test upgrade dữ liệu cũ, không sửa migration đã áp dụng để dùng hằng TypeScript.
- Default port, data directory, mode/runner được kiểm soát tại [config.ts](../../../apps/api/src/config.ts). Bind loopback là ràng buộc bảo vệ của gate hiện tại. [Vite config](../../../apps/web/vite.config.ts) là cấu hình dev riêng; nếu override API port cần đổi proxy theo README FE. Không thêm env cho mọi màu, label, timeout hoặc tên field chỉ để loại literal.
- Catalog public error trong [app-error.ts](../../../apps/api/src/shared/app-error.ts), runtime error và allowlist diagnostic là ánh xạ có chủ đích. Mã public lấy type từ contracts; không chia sẻ thông báo UI hoặc lỗi nội bộ sang domain/storage.

## Theo một lỗi từ BE tới UI

1. Service ném `AppError` với mã trong [error.schema.ts](../../../packages/contracts/src/error.schema.ts). BE định nghĩa status/message an toàn bằng catalog có kiểm tra type đầy đủ; không đọc lỗi ngôn ngữ tự nhiên để quyết định nghiệp vụ.
2. [error-handler.ts](../../../apps/api/src/plugins/error-handler.ts) giữ mã `AppError`, ánh xạ lỗi framework đã nhận diện và che lỗi chưa biết thành `INTERNAL_ERROR`. Không suy diễn mọi `statusCode: 4xx` là validation. Request ID nối response với log an toàn.
3. [api-client.ts](../../../apps/web/src/shared/api/api-client.ts) validate success/error body từ `unknown`, tạo [ApiError](../../../apps/web/src/shared/api/api-error.ts) gồm kind/method/status/code/requestId. Error envelope cho phép code mới; client cũ dùng fallback. HTML, JSON hỏng hoặc body sai schema không được render thẳng.
4. [project-messages.ts](../../../apps/web/src/features/projects/project-messages.ts) chọn text theo mã lỗi và thao tác list/get/create. `ROUTE_NOT_FOUND` khác `PROJECT_NOT_FOUND` dù cùng 404. Chỉ dùng fallback chung khi thiếu/không biết code; không đoán dự án mất từ status đơn thuần.
5. [create-project-form.tsx](../../../apps/web/src/features/projects/create-project-form.tsx) tách validation field khỏi lỗi submit. Network/timeout/server failure không tự đánh dấu tên dự án sai. Response tạo bị mất/hỏng hoặc lỗi server có thể xảy ra sau khi ghi; UI nhắc kiểm tra danh sách trước khi tạo lại. Client không tự retry mutation; đây không phải cơ chế bảo đảm idempotency.

## Kiểm chứng trước khi dùng làm mẫu

- [Error handler tests](../../../apps/api/src/plugins/error-handler.test.ts): public code/request ID và lỗi dependency 4xx chưa biết không bị biến thành lỗi người dùng; [API integration tests](../../../apps/api/src/modules/projects/project.integration.test.ts): validation, malformed JSON, 413, 415, missing route/project, Unicode và SQLite thật.
- [API client tests](../../../apps/web/src/shared/api/projects-api.test.ts): cùng status khác code, unknown code, error HTML/JSON hỏng, success sai schema, network/timeout, hủy trước khi gửi và trong request, timeout cả lúc đọc body; mutation không tự retry và giữ trạng thái chưa xác nhận.
- [Message tests](../../../apps/web/src/features/projects/project-messages.test.ts): thông báo theo thao tác, fallback và phục hồi khi chưa xác nhận lưu. [UI tests](../../../apps/web/src/features/projects/projects-page.test.tsx): validation, giữ input khi submit lỗi, không đánh dấu field sai vì network, chuyển dự án và bỏ response cũ.

Chạy `npm run check` từ root; contracts phải build lại trước consumer. Với browser smoke dùng API/SQLite temp riêng, không dùng DB cá nhân. Test assertions có thể giữ giá trị wire đã công bố để phát hiện thay đổi tương thích; không thay tất cả expected value bằng cùng hằng implementation rồi kết luận đã chứng minh compatibility.
