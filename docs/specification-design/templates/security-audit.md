# Security Audit — <PROGRAM>

**DRAFT TEMPLATE — spec-design-templates-0.9.0-draft.** [Phần đầu chung](../README.md), [rule security audit](../rules/security-audit.md).

## 1. Phạm vi và giới hạn

<Program đã audit; review tĩnh chỉ đọc, không phải pentest (SD-SA-02); kết luận chỉ áp dụng cho program này, không cho cả hệ thống>

## 2. Bề mặt tấn công

| Điểm nhận input/ranh giới tin cậy | Loại | Thao tác nhạy cảm liên quan | Cơ chế bảo vệ quan sát được | Evidence |
| --------------------------------- | ---- | --------------------------- | --------------------------- | -------- |

## 3. Tổng hợp phát hiện

| Severity | Số phát hiện |
| -------- | ------------ |
| High     |              |
| Medium   |              |
| Low      |              |

Không có phát hiện thì ghi "Không có phát hiện trong phạm vi đã đọc", không ghi "an toàn".

## 4. Phát hiện

Sắp theo severity giảm dần. Lặp lại khối dưới đây cho từng phát hiện:

### SEC-001: <tên ngắn>

| Mục              | Nội dung                                  |
| ---------------- | ----------------------------------------- |
| Severity         | High / Medium / Low                       |
| Độ tin cậy       | 0.7–1.0 (Agent tự đánh giá)               |
| Nhóm             | Mã nhóm SD-SA-04                          |
| Vị trí           | `path:line`                               |
| Evidence         | Trích đoạn ngắn, đã che giá trị secret    |
| Luồng dữ liệu    | Từ input đến thao tác nhạy cảm            |
| Kịch bản khai thác | Điều kiện và cách khai thác              |
| Tác động         |                                           |
| Hướng xử lý khi migrate |                                    |

## 5. Cần xác minh

| ID | Nghi vấn | Vị trí | Vì sao chưa kết luận | Cần gì để xác minh |
| -- | -------- | ------ | -------------------- | ------------------ |

## 6. Chưa đánh giá được

| Hạng mục | Lý do | Ai/nguồn nào có thể đánh giá |
| -------- | ----- | ---------------------------- |

Luôn xét: luồng qua program khác, cấu hình và triển khai, quyền DB, dependency/binary/thư viện ngoài, hành vi chỉ lộ ra khi chạy.

## 7. Câu hỏi mở

<Bảng câu hỏi mở chung theo README; không có thì ghi "Không có">
