# Workflow implement — hướng dẫn như senior Dev

Áp dụng khi thêm tính năng, sửa bug, viết test hoặc refactor code RIKAI. Đọc [delivery gates](../delivery-gates.md), [CORE](../rules/core.md) và chỉ rule liên quan trong [README](../README.md). Đọc [architecture](../architecture.md) khi bắt đầu/đổi feature; tra [examples](../examples.md) khi cần xác định file. Không nạp toàn bộ rule/spec cho mọi task.

## 1. Hiểu task và xác định phạm vi

1. Đọc acceptance criteria, code thật, package scripts và thay đổi đang có. Nếu chưa có code, nói rõ đang ở bước init; không giả định feature mẫu đã tồn tại.
2. Tóm tắt hành vi trước/sau; xác định input, output, state và failure path liên quan. Chỉ hỏi nếu thiếu thông tin làm thay đổi hợp đồng/nghiệp vụ; chọn naming/format theo rule sẵn có.
3. Ghi mục tiêu init/feature/live/ms1/later, feature, dữ liệu fake/thật và runtime fake/CLI. Suy ra từ task/code khi rõ; không hỏi để chọn chi tiết đã có convention. Ghi file, rule đã kích hoạt và test dự kiến.
4. Không kéo yêu cầu LATER/gate chưa tới vào task. Scaffold chưa có CLI không cần hoàn thành Windows process cleanup; code bật CLI thật phải đạt LIVE trước bàn giao. Nếu thiếu điều kiện LIVE, giữ đường chạy thật disabled và báo giới hạn.

## 2. Theo một luồng xuyên suốt

1. Contract/schema và service behavior trước; SQL/migration nếu dữ liệu đổi.
2. Repository/adapter theo port, rồi route; thay composition khi thêm dependency.
3. UI/hook dùng contract; xử lý loading/error/reconnect phù hợp.
4. Viết kiểm tra cho hành vi và edge case bị ảnh hưởng. Nếu task chỉ sửa lỗi một lớp, không cần sửa đủ mọi lớp.
5. Mỗi lần mở rộng pattern hãy giải thích ngắn “file này chịu trách nhiệm gì” để Dev mới hiểu. Không copy code demo rồi bỏ qua ranh giới riêng của RIKAI.
6. Làm Analyze/Understand: đọc [source/encoding/LoC](../specs/source-analysis.md) và [BR/Design](../specs/understanding-contract.md); dùng schema/sample để implement contract. Không tự đếm LoC bằng AI hoặc đoán encoding.
7. Theo CORE-09, dùng naming trung lập cho source/config/test; khi có branding, cô lập ở config/asset/template, không rẽ nhánh nghiệp vụ theo tên khách hàng. Kiểm package/import/env/error/path/temp prefix của phần đang sửa. Đổi naming đã có phải đồng bộ scripts/lockfile/test/docs và hướng dẫn dùng data directory cũ; không tự sửa proposal/lịch sử hoặc thêm multi-tenant.

## 3. Chọn edge case theo loại thay đổi

Khi init/mở rộng API/UI, áp dụng CORE-11, BE-04/09, FE-08 và QA-10 theo [mẫu policy và lỗi API](../patterns/api-errors-policy.md). Xác định nguồn policy, public code và tầng chọn thông báo; chứng minh các failure path có liên quan bằng test. Không biến literal hợp lệ thành yêu cầu cấu hình động.

Theo CORE-10, xác định nền tảng mục tiêu và máy thực sự chạy checks. Khi sửa config/path/process/native/build script, đọc [platform-support](../platform-support.md), cô lập khác biệt OS và kiểm nhánh bị ảnh hưởng. Không dùng mock `process.platform` làm bằng chứng hỗ trợ OS thật; không đưa yêu cầu installer vào task init nhỏ.

- Input/API: thiếu field, dữ liệu sai, không tồn tại, conflict, request từ origin/session không hợp lệ.
- Job/CLI: request trùng, process không mở được, stream bị cắt, auth/quota/network, timeout, cancel race, crash/restart; chọn đúng case có thể bị thay đổi ảnh hưởng.
- File/data: encoding không hỗ trợ, root escape, source đổi trong khi snapshot, DB/file write thất bại, artifact version cũ.
- UI/review: double click, refresh, reconnect, response cũ, stale approval và xem nhầm run.
- Chưa có rule cho một tình huống: áp dụng invariant hiện có, ghi quyết định nhỏ trong mô tả thay đổi. Chỉ đề nghị thay rule khi thật sự cần; không tự nới MUST để làm code dễ hơn.

## 4. Kiểm tra và bàn giao

Đọc scripts thực tế; chạy gate liên quan theo QA-06. Không gọi AI live hoặc đọc source khách hàng chỉ để “test thử” nếu task chưa yêu cầu/cho phép. Khi có lỗi, sửa trong phạm vi rồi chạy lại phần liên quan. Chưa chạy được phải ghi rõ, không báo đã xong hoàn toàn.

Kết quả trả bằng tiếng Việt theo mẫu:

```text
Đã thay đổi: <hành vi và lý do>
File chính: <file và trách nhiệm>
Rule áp dụng: <mã rule liên quan>
Gate và điều kiện: <mốc/feature/dữ liệu/runtime>
Kiểm chứng: <command/phạm vi/kết quả thật>
Chưa kiểm chứng hoặc giới hạn: <nếu có>
Chưa đến mốc: <việc ở gate sau, không tự nhận đã hoàn thành>
Điểm cần reviewer xem kỹ: <nếu có>
```

Không tự merge/deploy. Không tự chuyển sang sửa theo skill review. Khi người dùng yêu cầu sửa finding, đọc finding + xác minh trigger, sửa bằng workflow này và giữ test regression tương ứng.

Khi dùng Git/PR, áp dụng [GIT](../rules/git-pr.md) và [mẫu PR/bàn giao](../pr-template.md). Không init/publish remote hoặc commit chỉ vì đang dùng skill; làm theo phạm vi người dùng giao.
