# Specification design — phạm vi và pilot

**DRAFT — chờ duyệt.** Pack: spec-design-rules-0.9.0-draft.

[Thứ tự đọc và nguồn quy định](../README.md).

## 2. Mục tiêu và ranh giới

Specification design mô tả đúng **hệ thống đang có, độc lập ngôn ngữ nguồn**, đủ dẫn chứng để người đọc kiểm tra và làm đầu vào P3/P4/P5.

- Trong phạm vi: BR, màn hình/item/event, luồng xử lý, báo cáo/CSV, logic function, truy cập dữ liệu, xử lý lỗi, dependency, câu hỏi còn mở, tài liệu đã duyệt trong KB.
- Ngoài phạm vi: chọn kiến trúc đích, viết conversion/coding rules, chuyển đổi ngôn ngữ, sửa nghiệp vụ, chạy source/SQL/script khách hàng, sinh bộ test thực thi đầy đủ.
- Quy tắc tạo tài liệu specification-design trong file này khác với **Migration Rules P3** và khác với **Business Rules trích từ source**.
- P1 `complete=true` chỉ phản ánh tiêu chí parser; không chứng minh AI hiểu đúng, BR đầy đủ hoặc thiết kế được duyệt.

## 3. Đơn vị phân tích và pilot

SD-ID-01: mỗi đơn vị tài liệu có ID ổn định từ input/manifest, ánh xạ tới project/module/service/package/job hoặc entrypoint và relative path. Alias không thay identity; trùng tên hoặc ranh giới chưa rõ là câu hỏi blocking. Không bắt buộc mọi ngôn ngữ có project file.

SD-ID-02: danh sách đơn vị, complexity và mẫu calibration thuộc từng dự án. Không áp danh sách, thang điểm hoặc ngưỡng VB6 cho ngôn ngữ khác. Complexity chưa có công cụ phù hợp thì ghi chưa đo.

Danh sách pilot, KPI và người quyết định gate thuộc kế hoạch từng dự án, được cung cấp qua [phiếu input](../templates/input-context.md); pack không lưu danh sách program. Pilot 15 program VB6 và KPI gốc chỉ áp khi input chọn pilot đó; dự án khác dùng danh sách được giao.
