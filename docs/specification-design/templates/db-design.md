# DB Design — <PROGRAM>

**DRAFT TEMPLATE — spec-design-templates-0.5.0-draft.** [Phần đầu chung](../README.md), [yêu cầu DB](../rules/deliverables.md).

## 1. Nguồn và giới hạn

<DDL/schema provenance có/thiếu; không có thì ghi “column usage suy ra từ source”; cấu hình default schema riêng>

## 2. Table inventory

| Schema/table as written | Normalized name | Nguồn tên/mapping status | Program | Evidence |
| ----------------------- | --------------- | ------------------------ | ------- | -------- |

## 3. Column definition hoặc usage

| Table/column | Type | Length/precision/scale | Nullable/default | PK/FK/index | DDL/schema/observed usage | Basis/giới hạn | Evidence |
| ------------ | ---- | ---------------------- | ---------------- | ----------- | ------------------------- | -------------- | -------- |

Thiếu chứng cứ giữ unknown + Q-ID; không suy FK từ JOIN, kiểu DB từ kiểu biến hoặc ORM trong source.

## 4. CRUD và unresolved access

| Program/function | Table as written | C/R/U/D | Call site | Dynamic/unresolved | Evidence/Q-ID |
| ---------------- | ---------------- | ------- | --------- | ------------------ | ------------- |

Inventory công cụ có operation X cho DDL: ghi riêng operation X/nguyên dạng tại đây, không ép thành CRUD hay bỏ khỏi coverage. Inventory lexical là gợi ý; nơi dựng SQL không nhất thiết là nơi thực thi.

## 5. Transaction/relations

| Boundary/locking/relation | Source hay DDL/provenance | Basis | Evidence | Q-ID |
| ------------------------- | ------------------------- | ----- | -------- | ---- |

## 6. Dependency/questions/evidence registry

<stored routine thiếu body hoặc là đơn vị phân tích chính (dẫn Detail), SQL động, synonym/current schema chưa biết; Q-ID; registry path/symbol/range/quote>
