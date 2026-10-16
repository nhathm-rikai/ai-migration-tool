# Hướng dẫn phát triển RIKAI

**Bản 1.1 — 13/10/2026.** Dành cho Dev, người review và AI coding assistant.

**Trạng thái source 14/10/2026:** đã init backend fixture trong [apps/api](../../apps/api/README.md), shared contracts trong `packages/contracts`. Có Projects API → service → SQLite và fake runner dùng trong test. Ngày 15/10 đã có [UI Projects](../../apps/web/README.md) nối API thật bằng fixture; chưa engine CLI/Analyze. Phần mô tả pipeline bên dưới là kiến trúc đích.

RIKAI là portal chạy local để chọn thư mục source legacy, phân tích, đọc kết quả có dẫn chứng, review và xuất báo cáo. Backend gọi Claude Code CLI đã đăng nhập. Source gốc chỉ đọc; dữ liệu làm việc được lưu riêng trên máy. UI local không có nghĩa là AI chạy offline.

## Quyết định đã chốt

- Fastify chia theo nghiệp vụ; route → service → repository/adapter.
- Convention dùng chung cho Claude Code, Cursor và Codex, lưu cùng project.
- Skill review chỉ đọc, kiểm tra và báo cáo; Dev sửa bằng skill implement, sau đó review lại.
- Source sản phẩm độc lập thương hiệu theo CORE-09: `PORTAL_*`, `@portal/*`, runtime path trung lập; branding UI/export tách qua config/asset/template khi triển khai. Đây là nền tảng tái sử dụng cho công ty khác, chưa phải tính năng multi-tenant/licensing.
- Bộ này hướng dẫn Portal v1: projects, Analyze/Understand, jobs, artifacts, review, export và demo. Convert C# và đối chiếu VB6/C# chưa thuộc phần code phải init.

## Đọc và dùng

1. Đọc [mốc áp dụng](delivery-gates.md) và [rule chung](rules/core.md); xác định task là init/feature/live/ms1/later, có dữ liệu/CLI thật không.
2. Đọc [kiến trúc](architecture.md) khi bắt đầu feature hoặc đổi ranh giới; chỉ đọc rule liên quan bên dưới, không nạp tất cả mỗi lượt.
3. Khi code: dùng [workflow implement](workflows/implement.md).
4. Khi review: dùng [workflow review](workflows/review.md).
5. Khi chưa biết sửa file nào: tra [ví dụ và bản đồ thay đổi](examples.md).
6. Cách gọi skill trên từng công cụ: [tích hợp AI tool](tool-integration.md).
7. Khi thêm API/UI hoặc rà soát hardcode: đọc [mẫu policy và lỗi API](patterns/api-errors-policy.md), lần theo source/test thật trước khi copy pattern sang module mới.
8. UI đã có Việt/Nhật: theo [mẫu catalog và chuyển ngôn ngữ](patterns/localization.md) khi thêm nội dung, ngôn ngữ hoặc xử lý state đang hiển thị.

## Rule theo phạm vi

- Mục tiêu Windows/macOS/Linux, path/process/native/scripts hoặc đóng gói: [hỗ trợ đa nền tảng](platform-support.md), CORE-10. Hiện mới có bằng chứng Windows; cập nhật rule không đồng nghĩa đã port code hoặc kiểm thử Mac/Linux.

- Mọi source/config/test mới: [CORE](rules/core.md).
- `apps/api/**`, `packages/contracts/**`: [BE — backend/API](rules/backend.md).
- `apps/web/**`: [FE — frontend](rules/frontend.md).
- Job, process, CLI, prompt, SSE và recovery: [JOB/AI](rules/jobs-ai.md).
- Database, filesystem, snapshot, artifact, evidence, review, export: [DATA](rules/data-evidence.md).
- Thay đổi hành vi hoặc review: [QA/REV](rules/testing-review.md).
- Làm việc qua Git/PR hoặc bàn giao task: [GIT](rules/git-pr.md), [mẫu PR](pr-template.md).

## Đặc tả khi làm Analyze/Understand

- [Đọc source, encoding, evidence và LoC](specs/source-analysis.md): CP932 cho profile BSN; binary không decode; metric `vb6-physical-code-v1` và cách đối chiếu baseline.
- [Source inventory](specs/source-inventory.md): JSON `source-inventory-v1` cho agent/report: SQL/CRUD, call graph, complexity v0 và CLI.
- [Hợp đồng BR/Design](specs/understanding-contract.md): payload AI, metadata do backend tạo, semantic validation và review.
- [JSON Schema](contracts/understanding-payload.schema.json) và [sample sạch](contracts/understanding-example.json): dùng để implement/test contract khi init, không phải code engine đã chạy.

Những đặc tả này thuộc Portal Analyze/Understand. Quy tắc convert VB6 → C# vẫn nằm ở bộ agent migration riêng, chưa được tạo trong bộ này.

Các file hiện có được dẫn trong [README backend](../../apps/api/README.md) và [examples](examples.md). `apps/web` hiện có shell và Projects; jobs/analysis/artifacts/reviews và CLI adapter vẫn là cấu trúc dự kiến. Rule áp dụng cho code mới và code bị thay đổi trong phạm vi task; không tự sửa hàng loạt tài liệu, demo hoặc source khách hàng cũ để đạt convention.

## Cách hiểu mức bắt buộc

- **MUST**: phải tuân thủ khi đúng phạm vi và nhãn ALWAYS/FEATURE/LIVE/MS1 đã kích hoạt; reviewer ghi rõ điều kiện đó cùng mã rule và bằng chứng.
- **SHOULD**: mặc định nên làm; cách khác hợp lý được chấp nhận nếu giải thích được.
- LATER hoặc gate chưa tới không tự chặn task hiện tại. Naming/style SHOULD là đề xuất; bug độc lập vẫn phải sửa theo tác động thực tế.
- Ngoại lệ MUST đã kích hoạt cần quyết định được ghi rõ từ người phụ trách kỹ thuật; không tự hạ rule để code qua review. Chọn cách triển khai tối thiểu hợp rule không cần xin duyệt lại.
- Rule mới phải có lý do và ví dụ kiểm tra; không dùng sở thích cá nhân chưa được ghi thành rule để chặn PR.

Các lựa chọn chi tiết như npm workspaces, TypeBox, SQL migration và Vitest là baseline kỹ thuật do người soạn chọn trong kiến trúc đã được người dùng chấp nhận. Khi init cần xác nhận phiên bản tương thích bằng lockfile và smoke Windows; không tự thay kiến trúc nếu gặp lỗi cài đặt.

## Giới hạn của bộ này

Rule/skill là hướng dẫn cho người và AI. Source backend đã có scripts format/lint/typecheck/test/build; đọc bằng chứng trong [engineering progress](progress.md) và chạy lại khi thay code. Chưa cấu hình remote CI; kiểm chứng backend fixture không thay nghiệm thu Portal/LIVE. Repo tự đủ; không dùng nhật ký/tài liệu ở parent directory. FE tích hợp theo [hướng dẫn apps/web](frontend-integration.md).

Init source đủ với Projects + fixture/fake runner và kiểm tra tương ứng; không phải hoàn thành hết gate MS1. Mức local security, instance lock và recovery tối thiểu trước LIVE được mô tả tại delivery-gates; backup tự động/orphan cleanup nâng cao ở LATER.

Ngày release, nhân sự và kế hoạch kinh doanh không nằm trong coding convention. Các tài liệu kế hoạch hiện có đang ghi khác nhau; chỉ cần làm rõ trước khi sửa lịch hoặc cam kết effort. Dev có thể dùng bộ này độc lập, không cần đọc proposal hay WBS.
