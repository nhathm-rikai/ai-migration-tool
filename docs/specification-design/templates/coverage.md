# Coverage — <PROGRAM>

**DRAFT TEMPLATE — p2-templates-0.2.0-draft.** [Phần đầu chung](../README.md), [KPI/checklist](../review-checklist.md).

## Ngôn ngữ và thành phần phát hiện

Agent điền ở bước 0 theo [quy trình phân tích](../analysis-method.md#2-bước-0--tự-nhận-diện-ngôn-ngữ-và-thành-phần), trước BR/design.

| Path/nhóm file | Language/dialect | Runtime/framework/version | Vai trò | Căn cứ: manifest/nội dung/đuôi file | Basis | E-ref/Q-ID |
| -------------- | ---------------- | ------------------------- | ------- | ----------------------------------- | ----- | ---------- |

| Boundary liên file/ngôn ngữ | Bên gọi → bên nhận | Cơ chế: call/SQL/config/queue/API/native | Resolved/unresolved | E-ref/Q-ID |
| --------------------------- | ------------------ | ---------------------------------------- | ------------------- | ---------- |

Ghi cả file binary/generated/unsupported. Thông tin ngôn ngữ trong phiếu input (nếu có) được đối chiếu; mâu thuẫn mở Q-ID.

## Phạm vi đã đọc

| File/inventory symbol ID hoặc file-level code | Context status/lý do | Range/chunk | Đã/chưa phân tích | BR/DS/section | Q-ID |
| ----------------------------------------- | -------------------- | ----------- | ----------------- | ------------- | ---- |

Gồm excluded/missing/unsupported/unread, phần chồng lặp chunk. Đã đọc không đồng nghĩa được TL duyệt.

## Hợp nhất

<chunk đã nhận/còn thiếu; canonical shared BR; duplicate/dangling ID; mâu thuẫn; truncation>

## Số đo từ công cụ và hồ sơ review

| Metric                                          | Giá trị | Nguồn report/version | Phạm vi/mẫu số | Giới hạn |
| ----------------------------------------------- | ------- | -------------------- | -------------- | -------- |
| File/symbol coverage                            | chưa đo |                      |                |          |
| LoC và baseline                                 | chưa đo |                      |                |          |
| Generated/reviewed/accepted/rejected/pending BR | chưa đo |                      |                |          |
| First-pass/after-correction (đề xuất)           | chưa đo |                      |                |          |

KPI G1 ở phạm vi pilot; không suy từ một program hoặc P1 complete=true. AI không tự đếm LoC/hash hoặc công nhận G1.
