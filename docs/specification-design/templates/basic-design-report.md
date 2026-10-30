# Basic Design Report/Export — <PROGRAM> / <REPORT-ID> / <MODE>

**DRAFT TEMPLATE — spec-design-templates-0.9.0-draft.** Phần mở rộng của [Basic Design](basic-design.md), không thay toàn bộ tài liệu program. Áp dụng [cách ghép và nguồn tham khảo](../report-templates.md), [rule đầu ra](../rules/deliverables.md), [phần đầu chung](../README.md).

Điền một khối cho từng report và mode có đầu ra khác nhau. REPORT-ID/MODE/field ID là định danh trình bày, không thêm vào JSON v1. Mỗi mục có nội dung hoặc không áp dụng + lý do/phạm vi đã kiểm hoặc chưa xác định + Q-ID. Evidence nguồn và provenance layout phân biệt rõ; ảnh/tài liệu mẫu không chứng minh hành vi source hiện tại.

## 1. Danh tính, mục đích và điều kiện xuất

| Report ID/mode | Tên gốc / diễn giải Việt | Program/form/event | Mục đích/đối tượng sử dụng | Điều kiện/quyền/trạng thái | Basic item/BR ref | Evidence/Q-ID |
| -------------- | ----------------------------- | ------------------ | -------------------------- | -------------------------- | ----------------- | ------------- |

| Mode | Chi tiết hay tổng hợp | Đơn vị một dòng/khối/file | Filter/sort/group | Output kind/extension thực tế | Khác biệt với mode khác | Evidence |
| ---- | --------------------- | ------------------------- | ----------------- | ----------------------------- | ----------------------- | -------- |

Không suy file Excel thật từ caption “EXCEL出力”; xác định workbook/CSV/text/print từ chứng cứ. Program không có report ghi không áp dụng; chưa đọc đủ source ghi chưa xác định. Program ngoài pilot trong ảnh tham khảo không tự được thêm vào pilot.

## 2. Điều kiện và tham số đầu vào

| Input ID | Nhãn/control/tham số | Nguồn giá trị | Kiểu/định dạng/đơn vị | Required/default | Validation/phạm vi/thời điểm chốt dữ liệu | Evidence/Q-ID |
| -------- | -------------------- | ------------- | --------------------- | ---------------- | ----------------------------------------- | ------------- |

Ghi kỳ/ngày cutoff, điều kiện lọc, lựa chọn mode, nhóm và phạm vi dữ liệu nếu tồn tại. Phân biệt điều kiện người dùng nhập với cấu hình và giá trị chương trình tính.

## 3. Đặc tả đầu ra người dùng nhìn thấy

| Thuộc tính                          | Mô tả hiện trạng                                                  | Evidence/provenance/Q-ID |
| ----------------------------------- | ----------------------------------------------------------------- | ------------------------ |
| Loại đầu ra                         | <Excel/CSV/text/preview/printer/khác; chưa xác định nếu thiếu>    |                          |
| Số file/sheet/trang, đơn vị dữ liệu | <mỗi lần xuất/nhóm/mode>                                          |                          |
| Tên file và đuôi                    | <pattern, timestamp/locale nếu có>                                |                          |
| Đích xuất                           | <dialog/config key/thư mục logic/printer; không lộ path nhạy cảm> |                          |
| Khi không có dữ liệu                | <không tạo/header-only/file rỗng/thông báo/chưa biết>             |                          |
| Thành công/hủy/lỗi nhìn thấy        | <message gốc, giữ form/điều hướng>                                |                          |
| Hệ thống nhận file                  | <người dùng/RPA/import/khác; có căn cứ hoặc chưa biết>            |                          |

## 4. Layout — 帳票レイアウト

### 4.1 Nguồn layout và vùng hiển thị

| Layout/resource ID + version | Sheet/trang/vùng | Tiêu đề/nhãn/đơn vị | Header/footer | Nguồn: code/template/ảnh | Đã đọc/thiếu/binary unsupported | Provenance/Q-ID |
| ---------------------------- | ---------------- | ------------------- | ------------- | ------------------------ | ------------------------------- | --------------- |

Khi có workbook/image hợp lệ, dẫn layout đúng version hoặc đính kèm preview được phép ở bước tạo tài liệu sau. Khi chưa có, ghi sơ đồ vùng bằng bảng; không tạo ảnh giống đã xác minh. Tách vùng in/hiển thị và vùng helper ngoài vùng in.

### 4.2 Bản đồ vùng và khối lặp

| Region ID | Vai trò: title/header/detail/subtotal/total/note/helper | Sheet/cell/range hoặc vị trí trang | Nội dung/nguồn logic | Khóa nhóm/đơn vị lặp/hướng | Dòng-cột tối đa/overflow/page break | Evidence/provenance |
| --------- | ------------------------------------------------------- | ---------------------------------- | -------------------- | -------------------------- | ----------------------------------- | ------------------- |

Ghi vị trí gốc và quy tắc dịch khi thêm khối, nơi đặt tổng sau khối cuối, nhãn/đơn vị theo kỳ và điều kiện ẩn. Chỉ dùng địa chỉ ô thật khi có căn cứ; không dùng ô của mẫu tham khảo cho report khác.

### 4.3 Định nghĩa item đầu ra

| Field ID | Nhãn gốc | Region/vị trí/thứ tự | Kiểu/format/đơn vị | Ý nghĩa/nguồn logic | Công thức/BR ref | Null/Empty/0/không có dữ liệu | Điều kiện hiển thị | Evidence |
| -------- | -------- | -------------------- | ------------------ | ------------------- | ---------------- | ----------------------------- | ------------------ | -------- |

Mô tả ý nghĩa phép tính ở mức Basic; thuật toán/query/mapping nguồn cụ thể đặt trong Detail report. Không điền tên bảng hoặc kiểu DB khi chỉ biết nhãn màn hình.

### 4.4 Định dạng và in

| Vùng | Font/màu/viền/alignment/merge | Number/date format | Kích thước/freeze/filter | Paper/orientation/margins/print area/repeat header | Nguồn code/template | Provenance/Q-ID |
| ---- | ----------------------------- | ------------------ | ------------------------ | -------------------------------------------------- | ------------------- | --------------- |

Phân biệt màu/chữ chú thích thiết kế với định dạng đầu ra thật. CSV không có layout trang: ghi không áp dụng và hoàn thiện mục 5.

## 5. File phẳng/CSV và tương thích hệ thống nhận

| Thứ tự cột | Field ID/header gốc | Kiểu text/số/ngày | Format/leading zero | Null/empty | Quote/escape riêng nếu có | Evidence/Q-ID |
| ---------- | ------------------- | ----------------- | ------------------- | ---------- | ------------------------- | ------------- |

| Thuộc tính file                    | Giá trị hiện trạng                               | Nguồn/Q-ID |
| ---------------------------------- | ------------------------------------------------ | ---------- |
| Header / trailer / record types    | <có/không/chưa biết, thứ tự>                     |            |
| Delimiter / quote / escape         | <phân biệt dấu phân cách và ký tự trong dữ liệu> |            |
| Encoding / BOM / newline           | <không suy encoding output từ encoding source>   |            |
| Số cột / thứ tự / format ngày-số   | <điều kiện thay đổi theo mode>                   |            |
| Consumer / RPA / import dependency | <định dạng bắt buộc được ghi nhận, provenance>   |            |

Ghi nguyên hành vi legacy, kể cả quoting do API/thư viện ghi file tạo ra nếu có evidence. Không tự thêm/xóa cột hoặc chuẩn hóa format làm thay đổi hợp đồng file. Nội dung bắt đầu bằng ký tự công thức được ghi như văn bản trong tài liệu/export review; không nhầm chính sách xuất tài liệu specification-design với hành vi file legacy.

## 6. Kết quả, giới hạn và liên kết Detail

| Tình huống                         | Hành vi người dùng/file thấy được | Message gốc | Detail report/mục | Evidence/Q-ID |
| ---------------------------------- | --------------------------------- | ----------- | ----------------- | ------------- |
| Không có dữ liệu                   | <điền>                            |             |                   |               |
| Hủy hoặc xuất lại                  | <điền>                            |             |                   |               |
| Đã có file/file bị khóa            | <điền>                            |             |                   |               |
| Thiếu config/template hoặc lỗi ghi | <điền>                            |             |                   |               |

Evidence registry dùng cùng cơ chế của Basic Design; provenance workbook ghi file/version/sheet/range, ảnh ghi nguồn/vùng ảnh. Không dựng line evidence cho xlsx/binary. Câu hỏi thiếu source/layout/config và mâu thuẫn mẫu/source đưa vào open-questions.
