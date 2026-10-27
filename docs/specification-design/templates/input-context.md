# Phiếu đầu vào một run specification-design

**DRAFT INPUT — spec-design-templates-0.5.0-draft.** [Cách dùng](../README.md), [flow Portal](../README.md#flow-nghiệp-vụ-trên-portal). Phiếu thủ công đề xuất, không phải schema/context builder đã triển khai.

Input chỉ gồm hai nhóm: **source legacy** và **output của P1**. Lựa chọn program và tài liệu cần tạo là phạm vi run do TL chọn trên Portal (mục 3); tài liệu đã duyệt từ run trước do Portal đưa kèm nếu có (mục 4). Snapshot/hash, decode, quyền đọc/ghi và phiên bản CLI do Portal/công cụ quản lý, không do người điền. Ngôn ngữ/runtime do agent tự nhận diện theo [quy trình phân tích](../analysis-method.md).

## 1. Source legacy

| Thông tin                                 | Giá trị  |
| ----------------------------------------- | -------- |
| Đường dẫn thư mục source legacy (TL chọn) | <điền>   |
| Snapshot ID do Portal cấp khi chọn source | <Portal> |

## 2. Output P1 — kết quả parser

| Mục P1 | Tài liệu                                                                            | Dùng để                                                                                      | Đường dẫn/version |
| ------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------- |
| 1.1    | Source Inventory — parser chạy trên các program (vd. `.vbp`/`.frm`/`.bas`/`.cls`)    | Danh sách program TL được chọn; file thuộc từng program, symbol/procedure để đối chiếu coverage | <điền>            |
| 1.2    | LoC report — LoC theo function (Physical/Exe/Comment/Blank/SQL)                     | Số đo LoC/coverage trong tài liệu; agent không tự đếm ([SD-EV-08](../rules/context-evidence.md)) | <điền>            |
| 1.3    | Dependency — dependency graph và DB access                                          | Caller/callee, module dùng chung, bảng/SQL theo call site; thứ tự phân tích                   | <điền>            |

Thiếu mục P1 nào thì ghi "chưa được cung cấp" và phần liên quan ghi "chưa đo"/Q-ID; không để agent tự dựng inventory, LoC hoặc dependency thay parser. Thiếu 1.1 là blocking vì không xác định được program và file thuộc program.

## 3. Phạm vi run (TL chọn trên Portal)

| Lựa chọn         | Giá trị                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| Program          | Tất cả / một / một số program trong Source Inventory (1.1): <điền>                                                   |
| Tài liệu cần tạo | Một hoặc nhiều: business-rules, basic-design, detail-design, db-design. `coverage` và `open-questions` luôn sinh kèm |

## 4. Tài liệu đã duyệt từ run trước (Portal cung cấp, nếu có)

| Tài liệu       | Version | Snapshot | Trạng thái review | Đường dẫn |
| -------------- | ------- | -------- | ----------------- | --------- |
| <điền hoặc không có> |  |          | approved          |           |

Chỉ liệt kê bản **approved** của cùng program. Agent dùng bản này để tham chiếu ID khi tài liệu đó không được chọn, theo [SD-CT-07](../rules/artifacts.md); không sửa bản này.

Không đưa credential/raw log/config agent từ corpus. Phiếu này không thay hash/manifest công cụ hay cơ chế kiểm soát quyền.
