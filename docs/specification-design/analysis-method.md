# Quy trình phân tích source đa ngôn ngữ

**DRAFT — spec-design-rules-0.9.0-draft.** [README](README.md). Đây là hướng dẫn đọc source, không phải parser/plugin hay schema mới. Dùng chung cho Codex CLI và Claude CLI. Mục 1–7 là cách đọc source; [mục 8](#8-luồng-vận-hành-theo-phase) là luồng vận hành theo phase cho calibration/batch.

## 1. Nguyên tắc: không dùng profile theo ngôn ngữ

Source thuộc ngôn ngữ nào trong allowlist thì phân tích theo đúng ngôn ngữ đó. Pack không có file profile riêng cho từng ngôn ngữ; người vận hành không bắt buộc khai báo ngôn ngữ/runtime trong [phiếu input](templates/input-context.md). Agent tự nhận diện ở bước 0, ghi kết quả có căn cứ vào phần đầu chung của tài liệu ([README](README.md#phần-đầu-và-phần-cuối-chung)), rồi áp cùng một quy trình và cùng bộ template trung lập cho mọi ngôn ngữ, kể cả dự án trộn nhiều ngôn ngữ.

Ví dụ ngôn ngữ trong pack (VB6, Java, COBOL…) chỉ để minh họa, không phải danh sách hỗ trợ. Không mượn semantics, thang complexity, ngưỡng KPI hoặc kết quả calibration của ngôn ngữ này cho ngôn ngữ khác.

## 2. Bước 0 — tự nhận diện ngôn ngữ và thành phần

Thực hiện trước khi viết BR/design. Ghi vào dòng ngôn ngữ/runtime và phạm vi đã đọc trong phần đầu chung của tài liệu.

| Cần nhận diện                 | Căn cứ và cách ghi                                                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language/dialect theo file    | Gồm cả SQL, markup/template, config, build/job script hoặc DSL nếu ảnh hưởng hành vi                                                                  |
| Runtime/framework/version     | Manifest/lockfile/build/project/deployment file trong allowlist; không có căn cứ thì unknown + Q-ID                                                   |
| Unit và entrypoint            | Project file (ví dụ `.vbp`, `.csproj`, `pom.xml`, `package.json`, JCL) hoặc entrypoint thực; không có project file thì ghi N/A, không tạo file giả     |
| Vai trò file                  | UI/screen, logic, data access/SQL, config/wiring, build/job, resource/report, generated, binary                                                       |
| Build/configuration           | Target, conditional compilation, macro/include/copybook, environment/config keys; không tự chọn nhánh và không lộ secret                              |
| Boundary/dependency           | Caller/callee qua file và ngôn ngữ, shared module, external package, native call, API, queue, DB, stored routine                                      |

Thứ tự ưu tiên căn cứ: manifest/build/project file → nội dung và cú pháp file → đuôi file. Đuôi file chỉ là gợi ý; không suy dialect/version chỉ từ đuôi file. Mỗi dòng ghi basis `observed` (có E-ref), `hypothesis` hoặc unknown + Q-ID. Nếu phiếu input có thông tin ngôn ngữ do người vận hành cung cấp, đối chiếu với source; mâu thuẫn thì ghi cả hai và mở Q-ID.

Agent không tự làm các việc thuộc công cụ: decode encoding, tính hash, đếm LoC/symbol, chạy build/test/compiler, tải dependency, chạy macro/source generator hoặc source khách hàng. Kết quả nhận diện không đăng ký profile chạy được trong Portal.

## 3. Cách phân tích chung

1. Khóa identity, snapshot, allowlist và kết quả decode của công cụ; hoàn thành bước 0 trước khi đọc sâu. Dự án nhiều ngôn ngữ cần inventory theo từng ngôn ngữ và một bảng boundary chung.
2. Tìm entrypoint/trigger thực: UI event, route, command, scheduler, job step, message consumer, library export, stored routine/trigger hoặc top-level/module initialization. Giữ cả trigger chưa giải quyết.
3. Theo luồng dữ liệu và trạng thái: input → validation/quyền → nhánh/vòng lặp → phép tính → DB/file/network side effect → output; xét cả lỗi, hủy, retry và cleanup nếu source có.
4. Theo dependency xuyên file/ngôn ngữ qua interface có evidence, ví dụ route → service → SQL, template → handler, mapper XML/annotation → SQL, job step → program, queue producer → consumer, native/FFI. Wiring qua config/DI chỉ được resolve khi có evidence ở cả config và code; có tên API không chứng minh implementation phía bên kia; thiếu body ghi unresolved/Q-ID.
5. Trả lời checklist semantics ở mục 4 cho từng claim liên quan, theo ngôn ngữ thực.
6. Điền template theo mục 5; đối chiếu BR/design/DB/Q-ID bằng ID. Áp [evidence rules](rules/context-evidence.md) và [review checklist](review-checklist.md).

## 4. Checklist semantics chung

Mỗi câu hỏi được trả lời theo ngôn ngữ/runtime đã nhận diện, có evidence; không áp mặc định của ngôn ngữ khác. Chưa xác minh được thì ghi hypothesis hoặc Q-ID ở mục rủi ro của Detail Design.

| Nhóm                         | Câu hỏi cần trả lời                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Kiểu và giá trị rỗng         | Implicit conversion, null/empty/missing/default value, so sánh chuỗi/số                                             |
| Số học                       | Kiểu số, precision/scale, rounding, overflow, chia cho 0, packed/fixed decimal nếu có                               |
| Chuỗi, ngày, locale          | Encoding trong runtime, độ dài byte/ký tự, format/parse ngày-số theo locale, timezone                                |
| Scope và state               | Local/global/static/session/module state, lifetime, khởi tạo file/module-level, cách truyền tham số và giá trị default |
| Lỗi và cleanup               | Exception, return code, error handler/condition, resume/retry, finally/cleanup, side effect trước-sau lỗi            |
| Transaction và đồng thời     | Boundary begin/commit/rollback, autocommit, locking, async/thread/queue; không suy thứ tự hoàn tất từ thứ tự dòng   |
| Biên dịch và mở rộng code    | Conditional compilation, macro, include/copybook, generated/transpiled code, annotation processing                   |
| Gọi động                     | Reflection, dynamic dispatch, late binding, DI/config wiring, SQL/code dựng động; không tự resolve khi thiếu evidence |
| Hành vi ngầm của ngôn ngữ    | Default property, implicit event/lifecycle, auto-binding, magic method hoặc tương đương nếu ngôn ngữ có            |

## 5. Điền template trung lập

Template dùng thuật ngữ trung lập; ô bảng ghi tên và loại thực tế của ngôn ngữ nguồn. Không đổi tên cột, không tạo template riêng theo ngôn ngữ. Không áp dụng ghi N/A kèm lý do/phạm vi đã kiểm; chưa biết ghi unknown + Q-ID. Hai trạng thái này không thay thế nhau.

| Thuật ngữ trong template | Cách điền                                                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit/program             | ID được giao trong input; alias không thay identity                                                                                                         |
| Project/entrypoint       | Relative path và loại project/entrypoint thực, hoặc N/A nếu không có                                                                                        |
| Đơn vị logic             | Function/method/accessor/Sub/Property/paragraph/section/stored routine/trigger/handler hoặc tương đương; giữ symbol và chữ ký thực; gồm cả code file/module-level |
| Màn hình/item/event      | Form designer, trang/template web, terminal map hoặc UI khác có evidence; batch/API/library không có UI thì N/A, trigger và I/O ghi ở Detail                  |
| Cơ chế lỗi               | Cơ chế thực của ngôn ngữ, ví dụ exception, return code, error handler                                                                                        |
| Code dựng SQL            | Trích nguyên biểu thức nguồn: string, query builder, ORM, mapper XML/annotation, embedded SQL; SQL tái dựng gắn nhãn diễn giải, không giả là quote          |
| Nơi tính                 | Code (ghi ngôn ngữ)/SQL/template/spreadsheet thực tế                                                                                                        |
| Thành phần/luồng gọi     | Thành phần thực có evidence; không dựng Controller/Service/Repository hoặc call graph đầy đủ theo bố cục mẫu                                               |
| Kiểu dữ liệu và DB       | Kiểu biến hoặc ORM mapping không chứng minh DDL; ORM mapping là observed mapping, không thay schema DB thực                                                |
| Inventory/coverage       | Inventory công cụ đã xác định với giới hạn của nó; thiếu số đo ghi chưa đo, không đổi tên công cụ khác thành P1 đã hỗ trợ                                    |

Report/export vẫn áp [hướng dẫn report](report-templates.md) với các mode/field/layout/query/formula/serialization/cleanup có evidence. Không có report, UI hoặc DB không phải lý do bỏ cả tài liệu; giữ section và giải thích.

## 6. Giới hạn

- Encoding: công cụ decode trước khi chạy và ghi decode profile theo file trong input (CP932, UTF-8, EBCDIC…). Decoder chưa kiểm được hoặc file không đọc đúng: dừng phân tích phần đó, ghi unsupported/blocking Q-ID; không đoán nội dung.
- Không có parser phù hợp: vẫn có thể calibration document-draft trên text đã decode và snapshot/hash kiểm được, nếu phạm vi cho phép. Symbol/call graph/LoC chưa đo phải ghi rõ; symbol agent quan sát không phải coverage toàn bộ hoặc số đo P1.
- Source định dạng cột cố định (ví dụ vùng số thứ tự đầu/cuối dòng): quote nguyên dòng theo normalized view, không tự cắt vùng cột.
- Designer/report/project dạng binary (ví dụ `.frx`, `.pbl`, `.fmb`, `.rpt`, macro trong workbook): ghi unsupported. Chỉ phân tích khi người vận hành cung cấp bản export dạng text có provenance như input bổ sung; evidence trỏ bản export, ghi rõ không phải file gốc.
- Minified/generated/transpiled source: ghi provenance và giới hạn. Evidence thuộc đúng file/range đã đọc; không chuyển số dòng sang source gốc khi thiếu source map đã xác minh.
- Mixed-language: coverage theo từng ngôn ngữ và toàn scope; phần unsupported không bỏ khỏi mẫu số.
- Mode understanding-v1 chỉ dùng khi manifest/decoder/validator thực tế hỗ trợ source đó và payload hợp schema hiện hành. Khoảng trống ở [contract mapping](contract-mapping.md) là đề xuất review, không cấp quyền sửa schema.

## 7. Calibration

Calibration theo từng ngôn ngữ/runtime và kiểu ứng dụng có trong scope dự án: chọn mẫu có đường thường/lỗi và dependency liên quan; dự án hỗn hợp cần mẫu qua boundary liên ngôn ngữ. Review cả bảng nhận diện ở bước 0, nội dung, evidence, coverage và cách điền template trước batch. Danh sách đơn vị/pilot, KPI và người quyết định gate lấy từ kế hoạch dự án qua phiếu input; kết quả calibration ngôn ngữ này không là chứng nhận cho ngôn ngữ khác.

## 8. Luồng vận hành theo phase

Luồng này lấy một phần cách tổ chức công việc của [code-migration-kit-with-claude-code](https://github.com/anthropics/code-migration-kit-with-claude-code) (Apache-2.0) cho việc **sinh tài liệu hiện trạng**; không có pha dịch, compile, chạy hoặc so parity với source cũ. Mỗi program do **một phiên agent CLI** sinh tài liệu, rồi gửi thẳng TL review trên Portal; không có agent reviewer/fixer trung gian. Phần không áp dụng ghi tại [decisions](decisions.md).

Nguyên tắc **sửa quy trình, không vá output**: finding TL ghi cho từng output được xử lý bằng run mới; finding cùng loại lặp ở từ hai program trở lên nghĩa là rule/template thiếu hoặc sai, sửa pack bằng revision mới, không sửa ngầm output đã review.

| Phase | Mục tiêu | Đầu ra | Điều kiện qua phase |
| ----- | -------- | ------ | ------------------- |
| 0. Feasibility | Program có đủ điều kiện phân tích không: source legacy, output P1 (1.1 bắt buộc), program thuộc Source Inventory, quyền, CLI | Go/no-go trước khi gọi agent | Go; no-go ghi lý do, không gọi model |
| 1. Map và chuẩn hóa | Agent đọc thứ tự/phụ thuộc từ output P1 1.3 (chung trước riêng), ghi cycle nếu P1 báo; lập bảng điểm ngầm định | Điểm ngầm định và boundary ghi ngay trong section tương ứng của tài liệu (kèm E-ref/Q-ID) | Mọi file allowlist có vai trò; câu hỏi diễn giải chưa rõ đã có Q-ID |
| 2. Sinh | Agent sinh các tài liệu ở mục 3 phiếu input (TL chọn + sinh kèm theo [SD-CT-07](rules/artifacts.md)), ghi dần từng đơn vị và chạy tiếp được khi bị dừng ([SD-CT-08](rules/artifacts.md)), tự kiểm theo [checklist](review-checklist.md) | Markdown trong output program | Đủ tài liệu ở mục 3; mọi tài liệu `hoàn tất`; self-check không phải approval |
| 3. TL review | Output trả về Portal; TL review 3 lớp theo [checklist](review-checklist.md) | Quyết định approve/reject và finding của TL | TL duyệt; reject thì chạy lại program hoặc sửa pack |

Không áp dụng từ kit: rulebook, stress-test, reviewer/fixer agent, run manifest, dịch/compile/build survey, smoke test, parity harness chạy source cũ (cấm chạy source khách hàng), script dependency map (thứ tự lấy từ P1 1.3).
