---
name: portal-implement
description: Implements portal features using shared rules, delivery gates, company-neutral naming and cross-platform boundaries. Use when explicitly asked to implement or fix a feature in this project.
disable-model-invocation: true
---

# Portal implement

Skill cấp project. Resolve các link tương đối từ thư mục chứa SKILL.md.

1. Đọc [delivery gates](../../../docs/engineering/delivery-gates.md) và [workflow implement](../../../docs/engineering/workflows/implement.md). Xác định mốc, feature và dữ liệu/runtime fake hay thật.
2. Đọc [CORE](../../../docs/engineering/rules/core.md) và chỉ rule liên quan. [Architecture](../../../docs/engineering/architecture.md) dùng khi bắt đầu/đổi feature; không nạp toàn bộ tài liệu mỗi task.
3. Dùng [examples](../../../docs/engineering/examples.md) để chỉ rõ file nào cần sửa; không giả định source mẫu đã tồn tại.
4. Implement và kiểm chứng trong gate hiện tại; ghi phần chưa đến mốc, không tự làm hết LATER. Không tự merge/deploy.

5. Áp dụng CORE-09 trong [CORE](../../../docs/engineering/rules/core.md): source/config/test dùng naming trung lập; branding UI/export tách qua config/asset/template, không chi phối domain/storage. Đồng bộ package/import/env/path/test/docs khi đổi tên và nêu cách giữ dữ liệu cũ; không tự thêm multi-tenant/licensing.

6. Theo CORE-10/QA-09, mục tiêu Portal là Windows/macOS/Linux. Khi chạm path/process/native/config/scripts, đọc [platform-support](../../../docs/engineering/platform-support.md), cô lập khác biệt OS ở config/adapter và báo OS/CPU/Node đã/chưa kiểm. Mock không thay native smoke; không tự làm installer/CI ngoài task.

7. Với init/mở rộng API/UI hoặc rà hardcode, theo CORE-11, BE-04/09, FE-08 và QA-10 trong [mẫu policy và lỗi API](../../../docs/engineering/patterns/api-errors-policy.md). Dùng source/test thật làm mẫu; phân biệt policy lặp với literal hợp lệ, giữ public error metadata và kiểm failure path chịu ảnh hưởng.

Tên skill trung lập, dùng thống nhất trong Codex, Claude Code và Cursor; convention nằm tại docs/engineering.

Rule trực tiếp: [BE](../../../docs/engineering/rules/backend.md), [FE](../../../docs/engineering/rules/frontend.md), [JOB/AI](../../../docs/engineering/rules/jobs-ai.md), [DATA](../../../docs/engineering/rules/data-evidence.md), [QA/REV](../../../docs/engineering/rules/testing-review.md).

Khi cần: [source/encoding/LoC](../../../docs/engineering/specs/source-analysis.md), [BR/Design contract](../../../docs/engineering/specs/understanding-contract.md), [payload schema](../../../docs/engineering/contracts/understanding-payload.schema.json), [GIT](../../../docs/engineering/rules/git-pr.md), [mẫu PR](../../../docs/engineering/pr-template.md).

Ví dụ: `/portal-implement Thêm mô tả project tối đa 500 ký tự; dữ liệu cũ vẫn đọc được.`
