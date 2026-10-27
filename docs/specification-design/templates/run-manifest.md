# Run manifest — <SCOPE/BATCH>

**DRAFT TEMPLATE — spec-design-templates-0.3.0-draft.** [Cách dùng](../README.md), [luồng phase](../analysis-method.md#8-luồng-vận-hành-theo-phase), [runbook](../runbook.md).

Hồ sơ của người vận hành ở output root, một file cho một scope/batch. Đây là hàng đợi công việc và trạng thái để dừng/resume; không phải tài liệu nghiệp vụ, không nằm trong gói sáu Markdown của program, và không thay envelope/review record do công cụ tạo. Agent không tự chuyển trạng thái sang `approved`.

| Thông tin scope | Giá trị |
| --------------- | ------- |
| Scope/pilot, pack và rulebook revision | <điền> |
| Nguồn thứ tự (inventory công cụ/version) | <điền> |
| Cycle phát hiện (file/module) và cách xử lý | <điền hoặc không có> |
| Người mở phase | <điền> |

| Thứ tự | Unit/program | Phụ thuộc | Phase hiện tại | Trạng thái | Output dir | Finding mở (A/B) | Q-ID blocking | Ghi chú |
| ------ | ------------ | --------- | -------------- | ---------- | ---------- | ---------------- | ------------- | ------- |
| <n> | <điền> | | 0–4 | pending | | | | |

Trạng thái: `pending` → `no-go` | `generated` → `reviewed` → `fixed` → `submitted` → `approved`/`rejected` (người có quyền ghi). Chạy lại tạo dòng mới hoặc run mới, không ghi đè lịch sử.

## Finding lặp lại

| Loại finding | Program bị ảnh hưởng | Rule/template/R-ID cần sửa | Revision đề xuất | Trạng thái |
| ------------ | -------------------- | -------------------------- | ---------------- | ---------- |

Từ hai program trở lên cùng loại finding thì ghi vào đây thay vì chỉ sửa từng output.
