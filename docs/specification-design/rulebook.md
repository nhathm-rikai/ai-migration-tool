# Specification design — rulebook diễn giải

**DRAFT — chờ duyệt.** Pack: spec-design-rules-0.4.0-draft. [Thứ tự đọc và nguồn quy định](README.md), [luồng phase](analysis-method.md#8-luồng-vận-hành-theo-phase).

Rulebook ghi mỗi câu hỏi diễn giải **có thể trả lời theo hai cách** và đã được chốt một lần, để mọi program trong scope điền giống nhau. Đây là bảng tra cho việc lập tài liệu hiện trạng, không phải rule dịch code. Rule trong [rules/](rules/scope.md), [quy trình phân tích](analysis-method.md) và template vẫn có hiệu lực cao hơn; rulebook chỉ lấp chỗ chúng để mở.

## Cách dùng

- Phase 1: generator tra rulebook trước khi viết. Gặp câu hỏi diễn giải chưa có dòng nào thì không tự chốt; ghi Q-ID và đề xuất dòng mới.
- Mỗi dòng phải dựa trên khảo sát trong scope (ví dụ số lần xuất hiện, số program bị ảnh hưởng), không dựa trên một ví dụ.
- Thêm/sửa dòng chỉ qua revision pack, có người duyệt; stress-test ở phase 2 là nguồn đề xuất chính. Không sửa rulebook trong lúc run.
- Rule chỉ áp cho ngôn ngữ/runtime ghi ở cột phạm vi; không mượn sang ngôn ngữ khác.

## Bảng quyết định

| R-ID | Câu hỏi diễn giải | Quyết định | Phạm vi ngôn ngữ/runtime | Căn cứ khảo sát | Nguồn đề xuất | Trạng thái |
| ---- | ----------------- | ---------- | ------------------------ | --------------- | ------------- | ---------- |
| <R-ID> | | | | | | Đề xuất |

Ví dụ loại câu hỏi đưa vào đây: tách hay gộp BR khi cùng một điều kiện lặp ở nhiều event; khi nào một form/màn hình con là screen riêng trong Basic; ghi kiểu dữ liệu biến hay kiểu cột DB khi chỉ có một bên; đặt tên nhóm nghiệp vụ; mức chi tiết của nhánh lỗi chung. Các ví dụ chỉ để minh họa, không phải quyết định.

Trạng thái: Đề xuất → Đã duyệt → Thay thế bởi R-ID khác. Không xóa dòng cũ; output đã review theo dòng cũ giữ nguyên version.
