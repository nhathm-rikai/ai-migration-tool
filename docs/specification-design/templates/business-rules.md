# Business Rules — <PROGRAM>

**DRAFT TEMPLATE — spec-design-templates-0.8.0-draft.** Điền [phần đầu chung](../README.md); áp dụng [yêu cầu BR](../rules/deliverables.md).

| BR ID   | Tiêu đề/phát biểu | Basis | Trigger/điều kiện/ngoại lệ | Input/output | Công thức/precision/rounding/Null/Empty/giới hạn | Dependency | Evidence refs | Q-IDs |
| ------- | ----------------- | ----- | -------------------------- | ------------ | ------------------------------------------------ | ---------- | ------------- | ----- |
| <BR-ID> |                   |       |                            |              |                                                  |            |               |       |

| Nhóm kiểm tra                           | Tìm thấy/chưa xác định/không áp dụng | Phạm vi đã kiểm/lý do | BR hoặc Q-ID |
| --------------------------------------- | ------------------------------------ | --------------------- | ------------ |
| Validation                              |                                      |                       |              |
| Quyền/trạng thái                        |                                      |                       |              |
| Tính toán                               |                                      |                       |              |
| CRUD/transaction                        |                                      |                       |              |
| In/export                               |                                      |                       |              |
| Tồn kho                                 |                                      |                       |              |
| Lỗi nghiệp vụ/side effect trước-sau lỗi |                                      |                       |              |

BR chung: <canonical ID, module, điều kiện gọi, không đếm trùng>.

Evidence registry: mỗi ref ghi path POSIX tương đối, symbol nếu biết, startLine/endLine gốc và quote nguyên văn trong fenced block riêng. Không để quote nhiều dòng trong ô Markdown. JSON không thêm field registry/symbol.

Markdown chưa phải BR xlsx bàn giao; export theo [checklist](../review-checklist.md).

## Câu hỏi mở

Theo [phần cuối chung](../README.md#phần-đầu-và-phần-cuối-chung). Không có câu hỏi thì ghi "Không có".

| Q-ID   | Câu hỏi/thiếu gì | Related BR/DS/section | Blocking đề xuất | Phần ảnh hưởng | Evidence/context cần thêm |
| ------ | ---------------- | --------------------- | ---------------- | -------------- | ------------------------- |
