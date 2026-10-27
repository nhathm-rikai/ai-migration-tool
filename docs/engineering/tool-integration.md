# Dùng rule và skill trên ba AI coding tool

**Bản 1.1:** hai skill xác định gate/feature/fake-live trước khi áp dụng MUST. Dùng cùng nội dung gốc và chỉ nạp rule/spec liên quan.

## Một nội dung gốc

Convention nằm ở `docs/engineering/rules/`, quy trình ở `docs/engineering/workflows/`. Skill và file cấu hình tool chỉ dẫn tới nội dung này. Khi đổi rule, sửa bản gốc; không viết ba bộ convention độc lập.

Mở tool từ root repo sản phẩm chứa `package.json` và AGENTS.md. Bộ `docs/engineering/`, hai entrypoint, `.agents/skills/`, `.claude/skills/` và `.cursor/rules/` đều nằm trong repo này. Không cần proposal/WBS, source khách hàng hoặc nhật ký cá nhân bên ngoài. Sau khi di chuyển workspace, mở session mới tại repo; không dựa vào skill catalog đã cache ở đường dẫn cũ.

## Claude Code

- Entrypoint: [CLAUDE.md](../../CLAUDE.md), có mục engineering ở đầu.
- Skills: [implement](../../.claude/skills/portal-implement/SKILL.md), [review](../../.claude/skills/portal-techlead-review/SKILL.md).
- Gọi `/portal-implement <task>` hoặc `/portal-techlead-review <phạm vi>`.
- Wrapper `portal-implement` có `disable-model-invocation: false`: Claude có thể tự chọn khi được giao implement/sửa bug; vẫn gọi được `/portal-implement <task>`. Wrapper `portal-techlead-review` giữ `disable-model-invocation: true`, gọi tường minh để chọn lượt review-only. Khi tool không hiện skill, mở lại session từ project root và kiểm tra chế độ project skills có được bật.

Vị trí project skill và cơ chế explicit invocation theo [Claude Code Skills](https://code.claude.com/docs/en/skills). Project instruction theo [Claude Code Memory](https://code.claude.com/docs/en/memory).

## Codex

- Entrypoint: [AGENTS.md](../../AGENTS.md).
- Skills: [implement](../../.agents/skills/portal-implement/SKILL.md), [review](../../.agents/skills/portal-techlead-review/SKILL.md).
- Chọn skill bằng bộ chọn skill của công cụ hoặc ghi rõ tên trong yêu cầu. Cách gọi ít phụ thuộc giao diện nhất: “Dùng skill portal-implement…” / “Dùng skill portal-techlead-review…”.
- Wrapper Codex giữ metadata chuẩn `name`/`description`; không dựa vào frontmatter riêng của công cụ khác để bảo đảm quyền read-only. Giới hạn review nằm trong workflow, cần kiểm tra khi dùng.

Vị trí `.agents/skills` theo [OpenAI Build skills](https://learn.chatgpt.com/docs/build-skills); entrypoint theo [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

## Cursor

- Rule luôn áp dụng: [rikai-core.mdc](../../.cursor/rules/rikai-core.mdc).
- Rule theo path: [backend](../../.cursor/rules/rikai-backend.mdc), [frontend](../../.cursor/rules/rikai-frontend.mdc).
- Cursor hiện hỗ trợ project skills trong `.agents/skills/` và tương thích `.claude/skills/`, nên không cần thêm bản nội dung thứ ba vào `.cursor/skills/`.
- Chọn `portal-implement` hoặc `portal-techlead-review` trong skill picker. Nếu phiên bản tool hiển thị hai entry cùng tên từ hai thư mục, chúng cùng trỏ workflow gốc; chọn entry `.agents/skills/` và kiểm tra đường dẫn đã load. Không sửa một bản để tạo hành vi khác bản kia.

Tham khảo chính thức: [Cursor Rules](https://cursor.com/docs/rules), [Cursor Skills](https://cursor.com/docs/skills).

## Khi skill chưa được discover

Yêu cầu agent đọc trực tiếp một trong hai file sau rồi làm theo:

- [workflows/implement.md](workflows/implement.md)
- [workflows/review.md](workflows/review.md)

Không cần cài package, đồng bộ cloud hoặc chỉnh cấu hình toàn máy để đọc workflow. Việc xuất hiện trong skill picker vẫn phụ thuộc phiên bản/chế độ/trust của tool; không coi kiểm tra file trên disk là bằng chứng đã load vào một session đang mở.

## Smoke bộ hướng dẫn trước khi giao team

1. Mở session mới ở root trên từng tool; yêu cầu liệt kê tên hai skill và đường dẫn rule gốc đã đọc.
2. Giao bài tập chỉ phân tích: “Thêm field mô tả project thì cần sửa file/lớp nào?”. Kết quả phải gồm contracts, migration/repository, service nếu có policy, UI và test; không nói source đã có khi chưa init.
3. Cho reviewer một snippet giả định: request handler gọi CLI trực tiếp. Reviewer phải chỉ ra CORE-04/BE-05 và đề nghị chuyển qua service/runner; không sửa file.
4. Cho tình huống process chưa dừng nhưng slot được nhả: reviewer phải nhận ra JOB-04 và yêu cầu kiểm chứng cleanup.
5. Trên repo sản phẩm sau init: lưu diff/hash trước và sau review, xác nhận source không bị sửa; kiểm tra được báo trung thực.
6. Cho PR init chỉ fake runner, không CLI/source thật: reviewer không chặn vì thiếu process-tree smoke/LIVE hoặc backup tự động/LATER; vẫn kiểm route/service/schema của Projects.
7. Cho PR bật CLI thật nhưng khai báo “scaffold”: reviewer nhận ra LIVE đã kích hoạt từ code và không bỏ qua JOB-04/BE-06.
8. Cho naming chưa đúng nhưng không có bug: CORE-03/SHOULD là suggestion. Kiểm reviewer phân biệt “Chưa đến mốc” với thiếu bằng chứng của gate hiện tại.

**Trạng thái 14/10/2026:** đã có backend fixture, application tests tại `apps/api` và script `npm run check`; bằng chứng nằm trong [engineering progress](progress.md) của repo. `node scripts/verify-repository.mjs` kiểm link nội bộ và metadata/cùng nội dung bốn wrapper. Chưa smoke đầy đủ discovery trong session mới của ba tool tại đường dẫn mới và chưa chạy phiên tech lead review độc lập. Kiểm tra JSON Schema BR/Design không chứng minh decoder/LoC/semantic validator đã được implement.
