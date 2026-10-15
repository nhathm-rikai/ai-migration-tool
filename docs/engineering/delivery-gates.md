# Thời điểm áp dụng rule

**Bản 1.1.** MUST nói mức bắt buộc; nhãn nói khi nào bắt đầu áp dụng. Một rule không tự tạo task ngoài phạm vi hiện tại. Ngày 14/10/2026 đã init phần BE fixture/Projects tại `apps/api`; ngày 15/10/2026 có UI Projects tại `apps/web`; LIVE chưa được triển khai. Phạm vi hiện có xem [README backend](../../apps/api/README.md).

Mục tiêu nền tảng là Windows/macOS/Linux theo [platform-support](platform-support.md). Hiện chỉ có bằng chứng Windows; quy tắc mới áp dụng code đang thêm/sửa, không tự chứng minh backend đã port hoặc tạo task installer ngoài phạm vi.

## 1. Năm nhãn

- **[ALWAYS]**: áp dụng ngay với code/tài liệu/config đang thay đổi và thuộc phạm vi của rule. Ví dụ không nuốt lỗi, không commit secret, không giả vờ test pass.
- **[FEATURE:x]**: phải đạt khi triển khai hoặc tích hợp feature x. Chỉ đọc rule liên quan; task Projects không phải hoàn thành CLI. Tên feature: `api`, `ui`, `jobs`, `analysis`, `storage`, `reviews`, `export`, `ai`, `collaboration`.
- **[LIVE]**: đạt trước khi app tiếp xúc source/dữ liệu khách hàng thật hoặc chạy CLI thật qua portal. Điều kiện nào đến trước thì gate có hiệu lực; không chờ Sales release. Spike CLI trên fixture sạch được phép riêng nếu đã được giao, nhưng vẫn phải kiểm soát process, quyền và cleanup.
- **[MS1]**: kiểm tra khi nghiệm thu Portal v1 cho Sales; bao gồm các feature đã cam kết và LIVE nếu có engine thật. Không gắn ngày lịch vào rule.
- **[LATER]**: ngoài nghiệm thu MS1, chỉ làm khi có task riêng. Không chặn PR hiện tại vì chưa có tính năng này. Nếu tính năng đã được bật thì correctness/an toàn của nó vẫn phải được kiểm tra.

Nhãn FEATURE không phải một mốc tuần tự: một PR chỉ UI có thể thuộc FEATURE:ui; PR tích hợp CLI kích hoạt cả jobs, ai, storage và LIVE. `FEATURE:a,b` nghĩa là rule áp dụng khi có một trong các feature liên quan, trong phần yêu cầu thực sự chịu ảnh hưởng.

## 2. Xác định phạm vi mà không hỏi đi hỏi lại

Ở đầu task, implement/reviewer ghi ba dòng:

```text
Mục tiêu: init | feature | live | ms1 | later
Feature/phạm vi: <ví dụ projects/api/storage, diff hoặc file cụ thể>
Dữ liệu/runtime: fixture + fake runner | source thật | CLI thật
```

Ưu tiên task/PR đã ghi. Nếu thiếu, suy ra từ code và acceptance criteria, nêu giả định. Chỉ hỏi khi khác biệt làm thay đổi phạm vi bàn giao hoặc quyền thực thi; không hỏi để chọn naming. Không được gọi một đường code đang đọc source/chạy process thật là “mock” để né LIVE.

Rule FEATURE phải đạt với phần feature đang được tích hợp. Có thể merge scaffold có TODO nếu task là scaffold, đường chưa hoàn chỉnh không được expose như tính năng dùng được, và TODO có task tiếp theo. Không dùng “đang làm dở” để bỏ qua sai lệch trong hành vi PR tuyên bố đã hoàn thành.

Reviewer đánh giá **rule MUST + đúng phạm vi + điều kiện đã kích hoạt**. Thiếu tính năng ở gate sau → mục “Chưa đến mốc/việc tiếp theo”, không tự chuyển thành CHANGES_REQUIRED. Thiếu bằng chứng cần thiết cho gate hiện tại → INCOMPLETE. Bug đang ảnh hưởng code có thể chạy vẫn là finding dù rule chuyên biệt nằm ở mốc sau.

## 3. Mức triển khai tối thiểu

### Init / feature Projects

- Workspace, config, contract, API/service/repository, SQLite tạm/fixture và UI mẫu.
- Gate phù hợp cho typecheck/lint/test/build của phần đã tạo; test project success/input lỗi/not found/reopen.
- Fake runner chưa cần CLI, auth Claude, process tree theo từng OS, toàn pipeline BR/Design hoặc E2E mọi feature.
- Có thể ghi rõ LIVE chưa sẵn sàng và disable thao tác đọc source thật/chạy CLI. Không cần làm authentication tổ chức.

### LIVE

- Loopback, kiểm tra Host/Origin, cơ chế xác thực cục bộ/CSRF phù hợp kiến trúc, giới hạn truy cập file và source chỉ đọc.
- Ngăn hai app instance cùng data directory; giải pháp lock local đáng tin cậy hoặc cơ chế tương đương được test. Không cần distributed lock.
- Một job AI, cancel/timeout, không nhả slot khi process có thể còn sống; auth/quota/network/output lỗi có trạng thái rõ.
- Decoder/snapshot/evidence đúng profile. Không dùng source thật nếu decoder chưa được kiểm chứng.
- Kết quả ghi dở không được public là artifact hoàn tất; khi crash phải có thông báo và đường xử lý an toàn.

### MS1

- Projects → Analyze/Understand thật trên mẫu được phép → review đúng version → export → reopen.
- Demo fixture có nhãn và chạy không cần AI; bằng chứng live tách riêng.
- Startup chuyển job dang dở sang interrupted, phát hiện tình huống process cũ chưa sạch và chặn dispatch; cho phép người hỗ trợ xử lý theo hướng dẫn đã test. Không bắt buộc tự phục hồi mọi trường hợp.
- Smoke trên từng OS/CPU/version nằm trong phạm vi release đã chốt; không hiển thị số liệu giả khi parser thiếu coverage; báo giới hạn source hỗ trợ.
- Có hướng dẫn dữ liệu lưu ở đâu, đóng/mở app và xử lý lỗi; không bắt buộc UI backup/restore.

### Sau MS1

- Lịch backup tự động, UI quản lý restore, tự dọn orphan có retention policy.
- Tự phục hồi process/queue phức tạp, replay toàn bộ SSE log, nhiều job đồng thời.
- Installer/auto-update, cloud/multi-user/billing và convert agent VB6 → C#.

## 4. Ví dụ reviewer phải phân biệt

- PR Projects dùng fake fixture, chưa CLI: thiếu process-tree smoke trên OS đích không chặn PR; ghi cần trước LIVE.
- PR bật Start CLI thật nhưng chưa timeout/cancel: JOB-04 đã kích hoạt, phải sửa.
- PR chưa có backup tự động: không phải vi phạm DATA-02. PR thêm backup nhưng copy .db khi WAL đang ghi: vi phạm DATA-02 vì chức năng đã có.
- PR MS1 không tự xóa orphan nhưng file không được công khai và có đường xử lý thủ công: chấp nhận mức tối thiểu. Artifact ghi dở được hiển thị succeeded: phải sửa.
- PR có tên file chưa đúng convention nhưng không có bug: CORE-03 là SHOULD, ghi đề xuất thay vì chặn như lỗi runtime.

Mốc MS1 là tiêu chí kỹ thuật bàn giao, không giải quyết chênh lệch ngày/nhân sự trong kế hoạch cũ. Trước nghiệm thu toàn release, người phụ trách xác nhận scope MS1 thực tế; reviewer không tự thu hẹp acceptance criteria để báo pass.
