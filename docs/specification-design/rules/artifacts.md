# Specification design — artifact và contract

**DRAFT — chờ duyệt.** Pack: spec-design-rules-0.4.0-draft.

[Thứ tự đọc và nguồn quy định](../README.md).

## 10. Contract máy đọc và artifact

SD-CT-01: tái sử dụng `understanding-v1` cho `businessRules`, `designs`, `questions`. Tuân thủ schema thật trong repo; không tự thêm trường bằng cách chỉ thay prompt. `designs.kind=current_behavior` dùng cho specification-design. Target suggestion nếu cần ghi riêng và không trộn với baseline hiện trạng.

SD-CT-02: contract hiện hữu là hợp đồng BR/design tổng quát, chưa được xác nhận đủ để biểu diễn toàn bộ bảng item/function/DB ở trên. **Đề xuất** bổ sung contract specification-design có version riêng trong bước implementation; phải review mapping và schema trước tích hợp máy đọc. Không đổi meaning của `understanding-v1` âm thầm.

SD-CT-03: envelope do service/tool tạo: artifact/run/project ID, source hash, rule/prompt/template/schema version, provider/model/CLI version, thời điểm UTC, trạng thái kỹ thuật và review. AI không điền các giá trị đặc quyền này. Exit code 0 chưa đủ thành công.

SD-CT-04: gói output đề xuất mỗi program gồm `business-rules.md`, `basic-design.md`, `detail-design.md`, `db-design.md`, `open-questions.md`, `coverage.md`; kèm manifest do công cụ sinh. BR xlsx và KB index được tạo ở bước export/index. Evidence đặt sát claim hoặc qua evidence ID có bảng tra đầy đủ.

Hai [template report](../report-templates.md) được ghép thành section trong Basic/Detail. Layout xlsx hoặc file per-report riêng là đề xuất đóng gói cần review, chưa thành nghĩa vụ exporter/manifest trong contract hiện hành.

SD-CT-06: [rulebook](../rulebook.md), [run manifest](../templates/run-manifest.md) và file finding của reviewer là hồ sơ quy trình, không phải artifact nghiệp vụ, không làm thay đổi gói sáu Markdown.

SD-CT-05: generation không sửa rule, source, artifact đã duyệt hoặc ghi vào KB approved. Chạy lại tạo version/run mới. Khi chia context, giữ chunk manifest và kiểm tra trùng BR, references, coverage khi hợp nhất.
