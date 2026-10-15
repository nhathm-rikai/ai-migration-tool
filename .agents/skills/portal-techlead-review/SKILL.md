---
name: portal-techlead-review
description: Reviews portal changes against applicable rules, delivery gates, branding and cross-platform boundaries without edits. Use when explicitly asked to review a PR, diff or files in this project.
---

# Portal tech lead review

Skill cấp project, review-only. Không sửa source/test/config/rule, không autofix/commit/merge.

1. Đọc [delivery gates](../../../docs/engineering/delivery-gates.md) và [workflow review](../../../docs/engineering/workflows/review.md). Xác định gate/feature/dữ liệu/runtime theo task và code thật.
2. Đọc [CORE](../../../docs/engineering/rules/core.md), [QA/REV](../../../docs/engineering/rules/testing-review.md) và rule cần cho diff; [architecture](../../../docs/engineering/architecture.md) khi cần xác minh ranh giới.
3. Xác định diff/files; chỉ chặn MUST đã kích hoạt hoặc bug của hành vi hiện tại. Việc ở gate sau ghi deferred; không audit toàn roadmap.
4. Báo P0–P3, file/dòng, rule, gate và điều kiện áp dụng, trigger/tác động/bằng chứng/hướng sửa. Không gọi AI live hoặc sửa nhật ký trong lượt review.

5. Kiểm CORE-09 trong [CORE](../../../docs/engineering/rules/core.md) trên diff: tên công ty gắn cứng trong code/config/test hoặc branding chi phối domain/storage là finding; báo file/dòng và tác động. Không báo lỗi chỉ vì logo/config branding, proposal/lịch sử, tên vendor hoặc tên skill. Kiểm ảnh hưởng env/package/data path khi rename; chỉ đề xuất, không tự sửa.

6. Kiểm CORE-10/QA-09 theo [platform-support](../../../docs/engineering/platform-support.md) khi diff chạm path/process/native/config/scripts. Tìm giả định chỉ đúng một OS; đối chiếu OS/CPU được công bố với bằng chứng thực chạy. Thiếu installer/CI ở task nhỏ không tự thành blocker. Best practice là đề xuất nếu chưa có rule vi phạm hoặc lỗi tái hiện; không sửa file khi review.

7. Khi review API/UI hoặc hardcode, đối chiếu CORE-11, BE-04/09, FE-08 và QA-10 theo [mẫu policy và lỗi API](../../../docs/engineering/patterns/api-errors-policy.md). Theo lỗi từ producer tới UI và kiểm test; không coi mọi literal là finding hoặc yêu cầu cấu hình động ngoài scope.

Tên skill trung lập, dùng thống nhất trong Codex, Claude Code và Cursor; convention nằm tại docs/engineering.

Rule trực tiếp: [BE](../../../docs/engineering/rules/backend.md), [FE](../../../docs/engineering/rules/frontend.md), [JOB/AI](../../../docs/engineering/rules/jobs-ai.md), [DATA](../../../docs/engineering/rules/data-evidence.md). [Ví dụ](../../../docs/engineering/examples.md).

Khi cần: [source/encoding/LoC](../../../docs/engineering/specs/source-analysis.md), [BR/Design contract](../../../docs/engineering/specs/understanding-contract.md), [payload schema](../../../docs/engineering/contracts/understanding-payload.schema.json), [GIT](../../../docs/engineering/rules/git-pr.md), [mẫu PR](../../../docs/engineering/pr-template.md).

Ví dụ: `Dùng portal-techlead-review. Review diff task Projects; chỉ báo cáo, không sửa file.`
