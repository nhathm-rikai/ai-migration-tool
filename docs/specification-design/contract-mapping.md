# Mapping P2 và khoảng trống contract

**DRAFT — đề xuất để review, không phải schema mới.** [README](README.md).
Nguồn: [contract](../engineering/specs/understanding-contract.md), [schema](../engineering/contracts/understanding-payload.schema.json), [sample sạch](../engineering/contracts/understanding-example.json). `additionalProperties:false`: không thêm trường bằng prompt.

| Nội dung P2                               | Mapping hợp lệ hiện tại                                                                                    | Giới hạn/đề xuất                                                                          |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| BR                                        | businessRules.id/title/statement/basis/inputs/outputs/conditions/evidence/openQuestionIds                  | Công thức/dependency viết trong statement/conditions đúng giới hạn; chưa có field riêng   |
| Basic/Detail/DB                           | designs.id/title/kind=current_behavior/summary/constraints/relatedBusinessRuleIds/evidence/openQuestionIds | Văn xuôi tổng quát, chưa có screen/item/procedure/column/CRUD dạng bảng máy đọc           |
| Unknown                                   | questions, openQuestionIds                                                                                 | Không thêm enum unknown vào basis                                                         |
| Design suy luận                           | Question và mô tả giới hạn có evidence                                                                     | Design không có basis=hypothesis; không dùng target_suggestion để che suy đoán hiện trạng |
| Evidence                                  | path/startLine/endLine/quote                                                                               | Symbol/evidence ID chỉ ở Markdown; JSON inline đủ object, không thêm function/hash        |
| Question                                  | id/question/relatedIds/blocking                                                                            | relatedIds chỉ BR/DS cùng payload; section/path ghi trong question; resolution bên ngoài  |
| BR shared                                 | Canonical ID, điều kiện caller riêng                                                                       | V1 chưa có cross-artifact reference; không dangling reference                             |
| Coverage/chunk/provenance DDL             | Markdown và hồ sơ input riêng                                                                              | Chưa có collection trong v1                                                               |
| Hash/reviewer/approval                    | Backend/tool/human record theo contract                                                                    | Không do AI tạo                                                                           |
| rule/template/provider/model/CLI versions | Hồ sơ vận hành đề xuất                                                                                     | Envelope hiện có promptVersion/runnerVersion, chưa liệt kê đủ các trường này              |

Giới hạn byte/stream theo JOB-07, cần chốt trước LIVE. Schema hiện giới hạn mỗi array gốc 1000 item, title 500 ký tự, statement/summary/question 10000, quote 20000; inputs/outputs/conditions/constraints tối đa 100 chuỗi, mỗi chuỗi 500. Schema là nguồn chuẩn. Không cắt im lặng; chia chunk có manifest và kiểm hợp nhất.

BR/DS/Q tuân pattern schema; ID đề xuất BR-<PROGRAM>-001 ổn định trong lịch sử, không tái dùng ID bị loại. Shared namespace phải do manifest xác định, không đoán từ tên file. Payload v1 độc lập cần nhúng BR shared khi có reference nội bộ, giữ canonical ID và không đếm bản lặp vào KPI. Nếu không thể bảo đảm reference hợp lệ, ghi câu hỏi và chờ quyết định. Không giả định reader hiểu cross-artifact.

DDL/ảnh/report có provenance riêng nhưng evidence v1 vẫn là text path/range/quote trong snapshot manifest. Không dựng số dòng cho binary hoặc trỏ ngoài manifest. Cần duyệt luồng nhập/manifest/validator trước tích hợp DDL; Markdown được ghi provenance đã cung cấp với giới hạn chưa xác minh máy.

## Khoảng trống đa ngôn ngữ cần review

Language/dialect/runtime/framework/build config và cross-language dependency do agent nhận diện và ghi trong coverage Markdown; encoding theo file và unit-to-entrypoint mapping ghi trong phiếu input. Không tự thêm field hoặc enum language/profile vào payload, envelope hay source-inventory-v1. Đổi rule không làm P1/parser trở thành đa ngôn ngữ.

Trước tích hợp cần đối chiếu schema/profile registry và validator thực tế cho từng ngôn ngữ; đề xuất version hóa metadata/capability, inventory symbol, generated-source provenance/source map và metric coverage nếu contract chưa đủ. Binary/AST/generated locations không được giả thành text line evidence. Chưa đủ decoder/manifest/evidence thì không chạy understanding-v1 cho source đó; document-draft chỉ ghi phần có evidence hợp lệ và giới hạn theo [quy trình phân tích](analysis-method.md).

## Đề xuất implementation sau review

Report templates hiện chỉ là section Markdown: report/mode/field/region/query IDs, mapping cell/CSV, dynamic block, formula owner, serialization và provenance layout chưa có bảng máy đọc riêng trong v1. Ghi phần tổng quát trong designs đúng schema khi dùng JSON; không thêm các field này. Nếu cần per-report artifact/layout xlsx, review packaging và metadata trước tích hợp; xem [hướng dẫn report](report-templates.md).

1. Chọn review sáu Markdown thủ công hay bổ sung payload P2 có version riêng.
2. Nếu mở rộng, thiết kế schema screen/item/event, procedure/call site, DB usage, coverage/chunk, external provenance, shared references; review mapping không mất dữ liệu và giới hạn trước tích hợp.
3. Duyệt bổ sung metadata envelope; tách khỏi AI payload. Không chỉ sửa prompt.
4. Có reader v1 tương thích, contract parity và fixture success/failure cho references/unknown/metadata giả/quote.
5. Không migrate approval; export/index đúng artifact/version đã review.

Chưa thay JSON Schema, TypeBox, API hoặc runtime. Quyết định ở [phiếu duyệt](decisions.md).
