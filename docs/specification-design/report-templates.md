# Cách dùng template Report/Export

**DRAFT — spec-design-templates-0.4.0-draft** (thay p2-report-templates-0.1.0-draft), 22/10/2026. [README](README.md).

## Ghép vào bộ specification-design

1. Basic Design mục 6 liệt kê report + mode. Với mỗi đầu ra khác biệt, điền [Basic report](templates/basic-design-report.md) thành phần con của mục 6 trong basic-design.md.
2. Detail Design mục 4.1 dẫn cùng Report ID/mode tới [Detail report](templates/detail-design-report.md), điền thành phần con tại mục đó trong detail-design.md. Tái sử dụng inventory/common/evidence của program; khối report sở hữu logic export, không lặp lại cả khối xử lý chung.
3. Giữ sáu Markdown hiện có. Hai file template mới là đầu vào để ghép section, không mặc định thêm hai artifact đầu ra. Khi cần tách per-report file hoặc layout xlsx/preview riêng, ghi đề xuất packaging/version/manifest để review trước tích hợp máy đọc.
4. Không có report sau khi kiểm đủ phạm vi → không áp dụng + lý do. Chưa đọc đủ → chưa xác định + Q-ID. Không bỏ mục chỉ vì không có template layout; mô tả phần có chứng cứ và ghi thiếu.
5. Input ghi revision template set, danh sách report/mode, resource/config/layout được phép dùng và provenance. Cùng rule + template + context dùng cho cả hai CLI. JSON v1 chỉ biểu diễn phần tổng quát, không thêm report/layout/schema fields.

Basic mô tả đầu ra cần đọc/nhận: bố cục, field, điều kiện, định dạng, file contract. Detail mô tả cách source tạo đầu ra: query, lặp, tính toán, mapping, serialization, tài nguyên và lỗi. Các bảng nhắc lại field chỉ dùng ID/reference tới nơi chuẩn; không duy trì hai bản công thức/format mâu thuẫn.

## Căn cứ đã xem

| Nguồn người dùng cung cấp                               | Phạm vi kiểm tra                                                                                           | Điều tiếp thu                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 帳票_消化実績比較表.xlsx trong BasicDesign/ReportLayout | Đọc XML cell/formula/merge/print settings; import và render vùng A1:Z22 của sheet 消化実績比較表           | Title/đơn vị, block lặp, tổng, mapping nguồn, công thức, vùng in và helper |
| 帳票_日報年集計.md trong DetailDesign/InternalReview    | Cấu trúc glossary và các mục 1–11, query, block động, mapping, owner công thức/giá trị, file output và lỗi | Bố cục Detail report và trace theo query/field/loop                        |
| Screenshot 2026-10-22 100254.png                        | Bảng chức năng export/mode/config/RPA/quoting/file lock do người dùng cung cấp                             | Các trường cần kiểm, chưa phải kết quả kiểm source                         |

Workbook tham khảo có print area A1:Z22, dữ liệu/helper tới hàng 31; khối bộ phận ở hàng 5–8, chỉ dẫn lặp ở hàng 9–12, tổng ở hàng 13–16. Có các công thức với cached #VALUE! và defined names #REF! trong file gốc. Placeholder nguồn dữ liệu không phải số thật; chưa kiểm tính đúng công thức hoặc recalculation trong Excel. Chỉ tiếp thu cấu trúc, không sửa workbook và không sao chép lỗi/công thức thành baseline.

Mẫu Detail có chi tiết web/.NET/DB của dự án tham khảo; không áp session, HTTP download, giới hạn 50 cột, 12 dòng/tháng, vị trí ô hoặc rounding cụ thể vào hệ thống đang phân tích khi chưa có evidence. Hai tài liệu là hai report khác nhau, không ghép chúng thành Basic/Detail của cùng một report.

Ảnh gợi ý tám program KSHO0115, KSHO1045, KSHO2010, KSHO2020, KSHO2030, KUKO0020, KUKO3955, NDCO0010. Không tự mở rộng scope được giao; danh sách pilot gốc chỉ áp dự án VB6. Điểm cần kiểm khi được giao phân tích: nhiều mode/config keys, Excel caption nhưng có thể xuất text, CSV quoting, ràng buộc RPA, export từ SQL lựa chọn, lỗi file đang mở. Chưa xác minh các claim này trên VB6 trong task tài liệu.

## Review bổ sung

- Đủ report và mode; Basic ID/field/region ↔ Detail query/loop/mapping ↔ BR/evidence không đứt.
- Có layout hoặc ghi thiếu; tách vùng hiển thị/in/helper, fixed/dynamic, format từ code/resource.
- Phân biệt kiểu file thực, số được tính bởi code/SQL, công thức Excel, text mô tả; không coi cached value là tính lại đã đạt.
- CSV/text rõ ordinal/header, encoding/BOM/newline, quoting/escape, Null/0/leading zero và consumer dependency; không âm thầm cải tiến file contract legacy.
- Resolve config/path, ghi đè/append, file lock/no-data/cancel/partial output/cleanup có chứng cứ hoặc Q-ID.
- Không tạo workbook nghiệp vụ, chạy SQL/legacy hoặc mở rộng schema trong task định nghĩa template.
