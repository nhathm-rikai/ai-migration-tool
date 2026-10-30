# Specification design — yêu cầu nội dung đầu ra

**DRAFT — chờ duyệt.** Pack: spec-design-rules-0.9.0-draft.

[Thứ tự đọc và nguồn quy định](../README.md).

## 6. Business Rule — template bắt buộc

Một BR mô tả một hành vi nghiệp vụ có thể kiểm chứng. Không biến mọi dòng gán biến thành một rule; không gộp nhiều hành vi độc lập để che thiếu sót.

| Cột                 | Nội dung                                                                          |
| ------------------- | --------------------------------------------------------------------------------- |
| BR ID               | `BR-<PROGRAM>-001`; ổn định trong cùng dòng lịch sử, không tái sử dụng ID đã loại |
| Tiêu đề / phát biểu | Ai/khi nào/điều kiện gì/hệ thống làm gì                                           |
| Basis               | observed hoặc hypothesis                                                          |
| Trigger / điều kiện | Event, trạng thái, nhánh điều kiện; trường hợp ngoại lệ                           |
| Input / output      | Dữ liệu đọc, dữ liệu thay đổi, tác động nhìn thấy                                 |
| Công thức / giá trị | Thứ tự tính, precision/rounding, null/empty, giới hạn nếu có bằng chứng           |
| Dependency          | Function, module, bảng, report, tệp ngoài                                         |
| Evidence            | Một hoặc nhiều path + range + quote                                               |
| Open questions      | ID câu hỏi chưa giải quyết                                                        |

SD-BR-01: kiểm tra validation, quyền/trạng thái, tính toán, CRUD, transaction, điều kiện in/xuất, cập nhật tồn kho và lỗi nghiệp vụ khi source có chúng. Mỗi nhóm có ghi nhận tìm thấy hoặc chưa xác định, không áp đặt nhóm nào cũng phải có BR.

SD-BR-02: giữ khác biệt giữa path bình thường và path lỗi; ghi rõ side effect xảy ra trước/sau lỗi. Không suy ra transaction chỉ từ nhiều câu SQL liên tiếp.

SD-BR-03: BR thuộc common module dùng ID riêng và dẫn tham chiếu từ program; không sao chép thành nhiều rule để tăng mẫu số accuracy. Giữ điều kiện gọi khác nhau ở từng program.

SD-BR-04: file review xlsx là deliverable cuối theo OUT-P2-01. Giai đoạn chạy mẫu có thể dùng Markdown/JSON; không coi đó là đã bàn giao xlsx. Spreadsheet export phải ghi chuỗi như văn bản, không thực thi nội dung bắt đầu bằng ký tự công thức.

## 7. Basic Design — template mỗi program

Report/export áp dụng thêm [Basic report template](../templates/basic-design-report.md) cho layout/field/file contract và [Detail report template](../templates/detail-design-report.md) cho cách tạo đầu ra; ghép theo [hướng dẫn report](../report-templates.md). Đây là chi tiết hóa các mục report/DB/integration hiện có, giữ nguyên evidence và phạm vi pilot.

1. **Thông tin tài liệu:** unit/program ID, project/entrypoint path và alias, snapshot/version, ngôn ngữ/runtime phát hiện, draft/review state do hệ thống cấp.
2. **Mục đích và phạm vi hiện trạng:** chức năng có evidence; phụ thuộc và giới hạn hiểu biết.
3. **Danh sách màn hình/form:** ID, tên file, caption gốc, mục đích, entry/exit, evidence.
4. **Định nghĩa item:** control name/type/index, caption, default, enabled/visible/read-only, bắt buộc, giới hạn, binding, event, evidence. Phân biệt giá trị designer với giá trị đổi lúc chạy.
5. **Luồng xử lý:** trigger → kiểm tra → xử lý → DB/side effect → kết quả; nhánh lỗi/hủy; liên kết BR và function. Có Mermaid khi cần thể hiện nhánh.
6. **Báo cáo và export:** tên, điều kiện chạy, filter/sort/group, field/công thức, đích xuất, encoding/format nếu xác định được; phụ thuộc report template chưa có.
7. **Thông báo và điều hướng:** nguyên văn, điều kiện hiển thị, tác động, evidence.
8. **Câu hỏi và thiếu dữ liệu:** blocking/nonblocking, phần bị ảnh hưởng.

SD-BD-01: mọi section phải có nội dung, hoặc "không áp dụng" kèm lý do/phạm vi đã kiểm, hoặc "chưa xác định" kèm câu hỏi. Không dựng ảnh UI hoặc hành vi tương tác chỉ từ tên control.

## 8. Detail Design — template mỗi program

1. Danh sách file/module/procedure với trạng thái đã phân tích/chưa phân tích và lý do.
2. Mỗi đơn vị logic theo ngôn ngữ thực (function/method/property/handler/procedure/paragraph hoặc tương đương): symbol đầy đủ; phạm vi dòng; tham số/return; global state; caller/callee; tiền điều kiện; trình tự xử lý và các nhánh; vòng lặp/điều kiện dừng; side effect; lỗi/cleanup; BR liên quan; evidence.
3. Logic khởi tạo ở file/module và application/component lifecycle; không bỏ code ngoài procedure.
4. DB access theo call site: SQL nguyên dạng hoặc biểu thức xây SQL, biến tham gia, operation/table nhận diện được, connection, transaction boundary, handling kết quả/lỗi.
5. File/library/native API/network/message queue/print/CSV/integration: interface thấy trong source, trạng thái dependency, giới hạn phân tích.
6. Rủi ro hiểu sai: type conversion, null/missing values, precision/overflow, locale/date, state/lifecycle, error propagation, concurrency/async và conditional compilation theo [checklist semantics chung](../analysis-method.md#4-checklist-semantics-chung). Chỉ ghi hiện tượng có bằng chứng; không khẳng định semantics chưa được xác minh.
7. Phạm vi đã đọc (phần đầu chung) đối chiếu inventory symbol của công cụ được chọn; câu hỏi mở ở mục Câu hỏi mở cuối tài liệu.

SD-DD-01: không chỉ paraphrase source từng dòng. Mô tả nhánh, trạng thái và tác động đủ để người review kiểm tra tính tương đương.

SD-DD-02: unresolved call/dynamic dispatch phải hiện rõ; không dựng call graph đầy đủ giả. Không tự chọn nhánh conditional compilation khi chưa biết build configuration.

## 9. DB Design — template và giới hạn suy luận

| Bảng đầu ra           | Cột tối thiểu                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Table inventory       | Schema/table as written, normalized name nếu có, nguồn tên, program sử dụng, evidence                                                 |
| Column definition     | Column, type, length/precision/scale, nullable/default, PK/FK/index, nguồn DDL/schema hoặc observed usage, confidence/basis, evidence |
| CRUD Matrix           | Program/function, table, C/R/U/D xác định được, call site, dynamic/unresolved access, evidence                                        |
| Transaction/relations | Boundary/locking/relation thấy trong source hoặc DDL, provenance, câu hỏi                                                             |

SD-DB-01: nếu không có DDL/schema, chỉ xuất **column usage suy ra từ source**, giữ type/length/PK/FK là unknown khi thiếu chứng cứ. Dùng JOIN không chứng minh có FK constraint; kiểu biến trong ngôn ngữ nguồn không chứng minh kiểu cột DB.

SD-DB-02: Default schema/namespace do parser hoặc cấu hình cung cấp không chứng minh mọi bảng thuộc schema đó. Lưu riêng tên as-written và nguồn chuẩn hóa schema.

SD-DB-03: SQL động không giải quyết được phải ghi unresolved; không bỏ khỏi matrix hay gán bảng phỏng đoán thành observed. Stored routine không có body được ghi dependency cần bổ sung; khi routine là đơn vị phân tích chính, logic mô tả ở Detail Design như đơn vị logic khác.
