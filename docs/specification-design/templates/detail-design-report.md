# Detail Design Report/Export — <PROGRAM> / <REPORT-ID> / <MODE>

**DRAFT TEMPLATE — spec-design-templates-0.3.0-draft.** Phần mở rộng [Detail Design](detail-design.md), kết hợp [Basic report](basic-design-report.md) theo [hướng dẫn report](../report-templates.md). Giữ evidence, inventory/coverage và contract hiện có. Đây là mẫu cấu trúc, không phải report nghiệp vụ đã sinh.

REPORT-ID/MODE và query/region/field IDs là tham chiếu Markdown, không thêm schema. Mọi mục có nội dung hoặc lý do không áp dụng hoặc chưa xác định + Q-ID. Không kế thừa session/web/DB/rounding từ mẫu tham khảo.

## 0. Thuật ngữ và nguồn

| Nhãn/identifier gốc | Diễn giải Việt | Đơn vị/ngữ cảnh | Basic ref | Evidence/provenance/Q-ID |
| ------------------------ | -------------- | --------------- | --------- | ------------------------ |

## 1. Tổng quan report — 帳票概要

<REPORT-ID/MODE, mục đích, program/form/event, quyền/trạng thái, snapshot/version đã cung cấp, Basic report đúng version; một đơn vị file/sheet/record; no-data; phạm vi chưa đọc>

| ID xử lý | Procedure/call site | Vai trò trong export | Basic requirement/BR | Evidence |
| -------- | ------------------- | -------------------- | -------------------- | -------- |

## 2. Input — インプット

| Input ID | Biến/control/tham số | Kiểu/format | Nguồn | Required/default | Validation/cutoff/biến đổi | Evidence |
| -------- | -------------------- | ----------- | ----- | ---------------- | -------------------------- | -------- |

| Mode | Điều kiện chọn | Query/nhánh/group | Layout/file contract áp dụng | Key cấu hình đích | Evidence/Q-ID |
| ---- | -------------- | ----------------- | ---------------------------- | ----------------- | ------------- |

Ghi đầy đủ các mode chi tiết/tổng hợp/SQL lựa chọn nếu thấy, không tự áp chúng cho mọi report.

## 3. Output — アウトプット

| Output/Basic field-region ref | Kiểu file thực tế | Template/sheet/record | Đơn vị/số lượng/giới hạn | Trường hợp rỗng/overflow | Evidence/Q-ID |
| ----------------------------- | ----------------- | --------------------- | ------------------------ | ------------------------ | ------------- |

Basic sở hữu layout/format người dùng; Detail tham chiếu và ghi cách tạo. Nếu mâu thuẫn mở Q-ID, không tự sửa một phía.

## 4. Nguồn dữ liệu và query — 使用テーブル

| Query/call-site ID | Path/symbol/range | Table/view as written | Mục đích/CRUD hoặc X | Connection | Cardinality/key/order/group | DB Design ref/Evidence |
| ------------------ | ----------------- | --------------------- | -------------------- | ---------- | --------------------------- | ---------------------- |

Cho mỗi query: SQL nguyên dạng hoặc code dựng SQL theo ngôn ngữ thực trong block riêng + E-ref; bảng tham số dưới đây. Ghi nơi dựng khác nơi thực thi, điều kiện thêm fragment, dynamic/unresolved và stored procedure thiếu body. SQL tái dựng phải gắn nhãn diễn giải, không giả là quote source.

| Query ID | Tham số/biến/fragment | Nguồn/kiểu biết được | Default/Null/conversion | Điều kiện sử dụng | Evidence |
| -------- | --------------------- | -------------------- | ----------------------- | ----------------- | -------- |

Không mặc định tất cả report chỉ SELECT; ghi update/log/temp table nếu có evidence. Không đoán DDL/schema.

## 5. Chi tiết xử lý — 処理詳細

### 5.1 Thành phần và luồng gọi

| File/form/module | Symbol/chữ ký/range | Input/return/global state | Caller/callee resolved/unresolved | Trách nhiệm | Evidence |
| ---------------- | ------------------- | ------------------------- | --------------------------------- | ----------- | -------- |

### 5.2 Trình tự và nhánh

| Bước | Điều kiện/trigger | Xử lý/query/common call | State/recordset trước-sau | Output field/region | Nhánh tiếp/early exit/lỗi | BR/Evidence |
| ---- | ----------------- | ----------------------- | ------------------------- | ------------------- | ------------------------- | ----------- |

Xét các bước thực sự có: kiểm điều kiện → resolve input/mode/kỳ → resolve config/path/template → truy vấn → tạo header → lặp dữ liệu → tính/group/tổng → ghi số/công thức/text → format → lưu/in → cleanup/thông báo. Ghi riêng no-data, cancel, lỗi giữa chừng; không giả đủ bước khi chưa đọc.

### 5.3 Vòng lặp và vùng động

| Loop/region ID | Đơn vị/key/cardinality | Vị trí bắt đầu/quy ước index | Hướng/stride/điều kiện dừng | Filter/group break | Limit/overflow | Vị trí tổng/ảnh hưởng công thức | Evidence |
| -------------- | ---------------------- | ---------------------------- | --------------------------- | ------------------ | -------------- | ------------------------------- | -------- |

Phân biệt A1 1-based với index API 0/1-based; mô tả phép đổi khi source có. Không lấy giới hạn nhân viên, số dòng/tháng hoặc tọa độ ô từ mẫu làm mặc định.

## 6. Logic tính và tổng hợp — 業務ロジック・集計

| Calculation/BR ID | Input/query field | Công thức/thứ tự tính | Group/period/cutoff | Precision/rounding/đơn vị | Null/Empty/0/zero denominator | Nơi tính: code/SQL/template/spreadsheet | Output ref/Evidence |
| ----------------- | ----------------- | --------------------- | ------------------- | ------------------------- | ----------------------------- | -------------------------------- | ------------------- |

Ghi rõ tổng trước hay sau làm tròn, giá trị số hay công thức Excel được ghi, công thức được kế thừa/copy hay tạo động, điều kiện tính lại workbook. Không coi cached value là bằng chứng recalculation, không sửa công thức nguồn để khớp kỳ vọng.

## 7. Mapping đầu ra — 出力マッピング

| Field ID / Basic ref | Sheet/cell/range hoặc ordinal/header/record type | Query/biến nguồn | Conversion/calculation ref | Repeat/điều kiện ghi | Null/0/blank | Value/text/formula | Format owner | Evidence |
| -------------------- | ------------------------------------------------ | ---------------- | -------------------------- | -------------------- | ------------ | ------------------ | ------------ | -------- |

| Formula region | Biểu thức nguyên dạng/nguồn template | Tham chiếu relative/absolute | Quy tắc copy/offset khi lặp | Recalculation/consumer | Evidence/provenance/Q-ID |
| -------------- | ------------------------------------ | ---------------------------- | --------------------------- | ---------------------- | ------------------------ |

CSV/text có bảng tuần tự record/cột; ghi call site API/thư viện ghi file thực tế và chứng cứ quoting/escape/newline, không suy từ đuôi file. Dữ liệu có delimiter, quote, xuống dòng, số 0 đầu và ký tự Nhật cần được mô tả nếu source xử lý; thiếu thì Q-ID.

## 8. Layout và format — レイアウト・書式

| Basic region ref | Thuộc tính áp dụng | Code/template quyết định | Điều kiện ghi đè | Tác động khi lặp/resize/in | Evidence/provenance |
| ---------------- | ------------------ | ------------------------ | ---------------- | -------------------------- | ------------------- |

Chỉ ghi cách áp dụng/ghi đè, không nhân bản đặc tả layout. Helper ngoài vùng in, vùng ẩn, print range/freeze/filter, merge và formula dependencies vẫn phải được xét khi có căn cứ. Thiếu report resource/binary chưa đọc thì ghi rõ.

## 9. File output và consumer — ファイル出力

| Thuộc tính              | Hành vi hiện trạng                                                                      | Call site/Evidence/Q-ID |
| ----------------------- | --------------------------------------------------------------------------------------- | ----------------------- |
| Resolve đích            | <config key/hàm đọc, precedence/default, dialog, relative base; không lộ path nhạy cảm> |                         |
| Tên file                | <SQL name/mode/kỳ/timestamp/extension theo source>                                      |                         |
| Serialization           | <encoding/BOM/delimiter/quote/escape/newline/header/trailer>                            |                         |
| Create/append/overwrite | <open mode, xác nhận ghi đè, thứ tự ghi>                                                |                         |
| Resource lifecycle      | <file handle/spreadsheet API hoặc COM/workbook/printer; open/close/release>                            |                         |
| Hoàn tất / ghi dở       | <temp/rename nếu có, file partial và khi báo thành công>                                |                         |
| Consumer/RPA            | <cột/format/thứ tự phải giữ; provenance xác nhận>                                       |                         |

Comment về tương thích là bằng chứng ý định; đối chiếu code, nếu mâu thuẫn mở Q-ID. Không tự thêm cột/escape/chống formula injection vào hành vi legacy; tài liệu review vẫn lưu trích dẫn như text theo policy specification-design.

## 10. Transaction và lỗi — トランザクション・例外処理

| Tình huống/điều kiện                 | Boundary transaction nếu có | Cơ chế lỗi/nhánh | Dữ liệu/file đã thay đổi | Message nguyên văn | Close/cleanup/retry | Evidence/Q-ID |
| ------------------------------------ | --------------------------- | --------------------- | ------------------------ | ------------------ | ------------------- | ------------- |
| Không có dữ liệu/giới hạn vượt       |                             |                       |                          |                    |                     |               |
| Thiếu/sai config hoặc template       |                             |                       |                          |                    |                     |               |
| File bị khóa/đã tồn tại/quyền ghi    |                             |                       |                          |                    |                     |               |
| Lỗi query/COM/printer/ghi giữa chừng |                             |                       |                          |                    |                     |               |
| Người dùng hủy                       |                             |                       |                          |                    |                     |               |

Không khẳng định không transaction hoặc cleanup an toàn nếu chỉ chưa tìm thấy. Không suy OS error behavior từ tên API; cần code hoặc xác minh sau.

## 11. Common và dependency — 共通詳細設計参照

| Canonical common/dependency | Input | Output sử dụng | Điều kiện gọi/mode | Tác động kết quả/lỗi | Mục chuẩn/version | Evidence/Q-ID |
| --------------------------- | ----- | -------------- | ------------------ | -------------------- | ----------------- | ------------- |

Giữ canonical BR/reference, không copy common thành nhiều rule. Inventory/procedure/file-level coverage, câu hỏi và registry evidence nối về Detail Design của program; mọi mode/query/field/loop phải có trace hoặc khoảng trống được ghi rõ. Không thêm reference cross-artifact bất hợp schema v1.
