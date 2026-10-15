# FE — apps/web

Nhãn áp dụng theo [delivery-gates.md](../delivery-gates.md); chỉ chặn khi MUST đúng phạm vi và gate đã kích hoạt.

- **FE-01 MUST [FEATURE:ui] — Feature:** page/component/hook nằm cùng feature; API transport và SSE client ở `shared/api`. UI không import backend, filesystem, process, SQLite hoặc Node API. DTO dùng contracts, không copy type giống backend rồi để lệch.
- **FE-02 MUST [FEATURE:ui] — Trạng thái:** mỗi màn hình dữ liệu có loading/empty/error/success; thao tác async thể hiện pending và phục hồi sau lỗi. Loading không dùng số phần trăm giả; tiến độ chưa biết hiển thị bước hiện tại. Disable nút chỉ hỗ trợ UX, không thay rule chống trùng ở backend.
- **FE-03 MUST [FEATURE:jobs] — Job:** giữ run ID và idempotency key cho cùng ý định Start khi retry HTTP. Reload/reconnect đọc lại run, không tự tạo run mới. Retry nghiệp vụ là thao tác riêng tạo run mới với key mới. Ngắt SSE hoặc đổi trang không tự cancel job.
- **FE-04 MUST [FEATURE:ui] — Cleanup:** effect đăng ký SSE/timer/listener phải cleanup; abort request khi kết quả không còn được dùng. Bỏ response/event cũ theo run ID + version/sequence; React re-render/effect chạy lại không được tạo mutation mới.
- **FE-05 MUST [FEATURE:reviews,export] — Review/export:** render đúng artifact version; gửi expected version khi review. Khi source/phiên bản thay đổi, hiển thị review cũ thuộc lịch sử và cần review bản mới. Export theo run/version người dùng chọn, không âm thầm dùng latest.
- **FE-06 MUST [FEATURE:ui] — Nội dung:** source/AI/Markdown là dữ liệu không tin cậy; escape hoặc sanitize bằng thư viện đã kiểm chứng, không chèn raw HTML/script. Nhãn demo, draft, cần xác minh và đã review phải rõ; tech success không được đổi thành “nghiệp vụ chính xác”.
- **FE-07 SHOULD [FEATURE:ui] — Dễ dùng:** input có label, lỗi gắn với field, tương tác dùng được bằng bàn phím; tên trạng thái không chỉ thể hiện bằng màu. Component trình bày không chứa rule nghiệp vụ server; tách component theo trách nhiệm thay vì giới hạn dòng cứng.

Ví dụ: SSE đứt → hiện “Đang kết nối lại”, GET run để đồng bộ → tiếp tục theo dõi. Không hiển thị “Job thất bại” chỉ vì kết nối browser bị mất.

- **FE-08 MUST [FEATURE:ui] — Lỗi có cấu trúc:** API client validate error envelope từ unknown, giữ kind/status/code/requestId khi hợp lệ; phân biệt HTTP, network, timeout, response sai định dạng và caller cancellation. Tầng feature chọn thông báo theo code và thao tác; không đoán lỗi nghiệp vụ chỉ từ status hoặc render raw server message/body. Mã mới/body hỏng dùng fallback an toàn. Lỗi submit không tự đánh dấu field invalid. Kết quả mutation có thể đã ghi nhưng chưa xác nhận phải có hướng dẫn kiểm tra trước khi tạo lại; không tự retry mutation khi chưa có contract idempotency. Xem [mẫu policy và lỗi API](../patterns/api-errors-policy.md).
