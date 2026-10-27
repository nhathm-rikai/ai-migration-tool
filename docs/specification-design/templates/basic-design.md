# Basic Design — <PROGRAM>

**DRAFT TEMPLATE — spec-design-templates-0.3.0-draft.** [Phần đầu chung](../README.md), [yêu cầu nội dung](../rules/deliverables.md). Mọi section có nội dung hoặc lý do/phạm vi không áp dụng hoặc chưa xác định + Q-ID.

## 1. Thông tin tài liệu

<unit/program, project/entrypoint path và alias, ngôn ngữ/runtime phát hiện (dẫn coverage), snapshot/version được cung cấp, Draft>

## 2. Mục đích/phạm vi hiện trạng

<claim + evidence, dependency, giới hạn>

## 3. Màn hình/form

UI có thể là form designer, trang/template web, terminal map hoặc dạng khác có evidence. Batch/API/library không có UI ghi không áp dụng + phạm vi đã kiểm cho mục 3–4; trigger và I/O nằm ở mục 5 và Detail.

| ID  | File | Caption gốc | Mục đích | Entry/exit | Evidence |
| --- | ---- | ----------- | -------- | ---------- | -------- |

## 4. Item

| Control/type/index | Caption | Default | Enabled/visible/read-only | Required/giới hạn | Binding | Event | Designer/runtime | Evidence |
| ------------------ | ------- | ------- | ------------------------- | ----------------- | ------- | ----- | ---------------- | -------- |

## 5. Luồng xử lý

<trigger → validation → xử lý → DB/side effect → kết quả; lỗi/hủy; BR/function/evidence; Mermaid khi cần>

## 6. Report/export

Với mỗi report/mode trong bảng dưới, ghép [Basic report template](basic-design-report.md) thành section con theo [hướng dẫn report](../report-templates.md). Bảng này là danh mục; layout/field/file contract chi tiết chỉ định nghĩa một lần trong section report. Nếu không có hoặc chưa xác định, ghi lý do/phạm vi/Q-ID.

| Tên/đích | Điều kiện | Filter/sort/group | Field/công thức | Encoding/format | Template thiếu | Evidence |
| -------- | --------- | ----------------- | --------------- | --------------- | -------------- | -------- |

## 7. Thông báo/điều hướng

| Nguyên văn | Dịch riêng | Điều kiện | Tác động | Evidence |
| ---------- | ---------- | --------- | -------- | -------- |

## 8. Questions và evidence registry

<Q-ID, blocking/nonblocking, phần ảnh hưởng; mỗi evidence ref ghi path/symbol/range/quote nguyên văn>
