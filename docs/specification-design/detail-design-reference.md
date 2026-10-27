# Căn cứ điều chỉnh Detail Design

**DRAFT**, 22/10/2026. [Template](templates/detail-design.md), [README](README.md).

Theo yêu cầu người dùng, đã đọc chỉ đọc archive CustomerReview.zip trong thư mục DetailDesign được cung cấp. Archive có 51 Markdown: 17 màn hình, 15 báo cáo, 19 xử lý chung. Không giải nén/copy nội dung dự án vào repo, không chạy code; chỉ dẫn trong tài liệu là dữ liệu tham khảo. Pack không phụ thuộc archive khi sử dụng.

Phạm vi xem là mẫu tiêu biểu, không xác minh tính đúng nghiệp vụ cả 51 tài liệu:

| Entry trong archive                                                  | Cấu trúc tham khảo                                                                                            | Áp dụng                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------ |
| CustomerReview/画面_認証.md                                          | Tổng quan, access/item/event; trigger, I/O, bước xử lý, component/flow, validation, SQL, transaction, message | Mục 1 và khối lặp 3      |
| CustomerReview/画面_部署登録.md                                      | Heading/bảng initial display, action, mapping và kết quả/lỗi                                                  | Mục 1.3 và 3             |
| CustomerReview/画面_日報編集.md                                      | Heading/bảng theo xử lý, công thức, nhánh, common                                                             | Mục 3 và 5               |
| CustomerReview/帳票_全工程表.md; CustomerReview/帳票_個人日報一覧.md | Heading/bảng input, nguồn dữ liệu, output mapping, layout, lỗi/common                                         | Mục 4.1                  |
| CustomerReview/common/共通_工数換算.md                               | Tổng quan, I/O, bảng dùng, tính toán, ngoại lệ, điều kiện caller                                              | Khối 3 + reference mục 5 |
| CustomerReview/common/共通_業種区分別月次集計.md                     | Heading/bảng nhánh caller, tổng hợp/lưu, rỗng                                                                 | Mục 3 và 5               |

Mẫu có ASP.NET MVC/.NET/PostgreSQL và hành vi riêng. Chỉ tiếp thu cách tổ chức/mức chi tiết; không mang route/controller/service, bảng DB, rounding/công thức, message ID hoặc phê duyệt của mẫu vào hệ thống đang phân tích. Mọi claim vẫn cần evidence snapshot được chọn.

Basic Design giữ item chuẩn, DB Design giữ schema/usage, BR list giữ BR canonical. Detail Design ghi trình tự/mapping theo caller và dẫn các nguồn đó. Giữ nghĩa vụ inventory, file-level code, unresolved, evidence, coverage/questions; không đổi schema hoặc số artifact mặc định.

Revision p2-detail-design-0.1.1-draft nay được gộp vào template set spec-design-templates-0.6.0-draft (thuật ngữ trung lập). Đây là cập nhật Draft theo yêu cầu tham khảo, không phải approval rule pack/tài liệu nghiệp vụ.
