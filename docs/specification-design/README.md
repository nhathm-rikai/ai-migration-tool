# Bộ tài liệu specification-design từ source đa ngôn ngữ

**DRAFT — CHỜ DUYỆT**, pack `spec-design-rules-0.9.0-draft`, ngày 30/10/2026; template set `spec-design-templates-0.8.0-draft` cho cả sáu template output và phiếu input. Chưa phải pipeline hay tài liệu nghiệp vụ đã sinh.

## Thứ tự đọc

Template set 0.2.0 gộp các revision riêng trước đó (`p2-detail-design-0.1.1-draft` theo [mẫu dự án tham khảo](detail-design-reference.md), `p2-report-templates-0.1.0-draft`, `p2-input-context-0.2.0-draft`) và chuyển thuật ngữ sang dạng trung lập ngôn ngữ.

1. [Nguồn và truy vết yêu cầu](requirements-map.md), [gate](../engineering/delivery-gates.md), [CORE](../engineering/rules/core.md).
2. [Phạm vi/pilot](rules/scope.md), [context/evidence](rules/context-evidence.md), [quy trình phân tích đa ngôn ngữ](analysis-method.md).
3. [Yêu cầu đầu ra](rules/deliverables.md), [artifact](rules/artifacts.md), [mapping contract](contract-mapping.md).
4. [BR](templates/business-rules.md), [Basic](templates/basic-design.md), [Detail](templates/detail-design.md), [DB](templates/db-design.md). Khi chạy, agent chỉ đọc template của tài liệu ở mục 3 phiếu input (được chọn + sinh kèm) ([SD-CT-07](rules/artifacts.md)); phần đầu và phần cuối chung của mọi tài liệu ở mục [Phần đầu và phần cuối chung](#phần-đầu-và-phần-cuối-chung).
5. [Phiếu input](templates/input-context.md) và cách kết hợp bên dưới.
6. [Luồng phase](analysis-method.md#8-luồng-vận-hành-theo-phase).
7. [Checklist review](review-checklist.md), [KB](knowledge-base.md), [quyết định chờ duyệt](decisions.md), [runbook](runbook.md).

## Phạm vi đa ngôn ngữ

Source ngôn ngữ nào trong allowlist thì phân tích ngôn ngữ đó; không có profile theo ngôn ngữ và người vận hành không bắt buộc khai báo ngôn ngữ. Agent tự nhận diện ngôn ngữ/runtime có căn cứ ở bước 0, ghi vào coverage, rồi áp cùng quy trình, checklist semantics chung và template trung lập theo [quy trình phân tích](analysis-method.md). Quy trình này cũng quy định cách xử lý khi thiếu parser, encoding chưa decode được hoặc gặp binary/generated code. Chưa tuyên bố parser Portal hỗ trợ mọi ngôn ngữ.

Giữ sáu file template output (bốn tài liệu + hai report section), thứ tự section và packaging tối đa bốn Markdown (TL chọn tài liệu cần tạo). Từ 0.9.0 không còn `coverage.md`/`open-questions.md` riêng: đây là phân tích source hiện trạng, trạng thái sinh, phạm vi đã đọc và câu hỏi mở nằm ngay trong từng tài liệu. Gói KUNO0020 đã sinh giữ version cũ; chưa có calibration ngoài VB6.

## Flow nghiệp vụ trên Portal

1. TL mở Portal và chọn thư mục source legacy.
2. TL chọn program cần phân tích: tất cả, một hoặc một số program trong Source Inventory (output P1 1.1).
3. TL chọn tài liệu cần tạo: một, nhiều hoặc tất cả trong `business-rules`, `basic-design`, `detail-design`, `db-design`. Tài liệu được tham chiếu tự sinh kèm theo [SD-CT-07](rules/artifacts.md): chọn Basic thì kèm BR; chọn Detail thì kèm BR, Basic, DB — trừ tài liệu đã có bản duyệt.
4. Portal lập [phiếu input](templates/input-context.md) (source legacy + output P1 1.1–1.3 + lựa chọn của TL) và gọi agent CLI cho từng program. Phiếu ghi cả tài liệu sinh kèm; tài liệu đã có bản duyệt từ run trước thì Portal đưa bản đó vào mục 4 thay vì sinh lại ([SD-CT-07](rules/artifacts.md)).
5. Agent CLI phân tích theo phiếu input và bộ tài liệu chuẩn này, sinh các tài liệu ở mục 3 phiếu input (được chọn + sinh kèm), rồi trả output về Portal. Nếu phiên bị dừng giữa chừng (vd. usage limit), Portal chạy tiếp bằng phiên mới từ trạng thái trên đĩa ([SD-CT-08](rules/artifacts.md)); chỉ output mà mọi tài liệu ghi "Trạng thái sinh" `hoàn tất` mới sang bước review.
6. TL review output trên Portal theo [checklist](review-checklist.md).

Bước 4–6 thuộc tự động hóa Portal, chưa triển khai (xem bên dưới); hiện chạy thủ công theo [runbook](runbook.md).

## Cách kết hợp

Program có report/export dùng thêm [Basic report](templates/basic-design-report.md) và [Detail report](templates/detail-design-report.md) theo [hướng dẫn ghép và nguồn tham khảo](report-templates.md). Đây là section bổ sung vào hai tài liệu Basic/Detail trong gói sáu Markdown; không tự tạo artifact thứ bảy hoặc mở rộng pilot.

Ghép quy định engineering liên quan → rule specification-design → quy trình phân tích → template/contract đã chọn → phiếu input đã điền → context source được đánh dấu là dữ liệu không đáng tin. Không gửi placeholder vào run thật. Cùng bộ file dùng cho Codex CLI và Claude CLI; không cần file prompt riêng hoặc bản sao rule trong AGENTS/CLAUDE.

Trước khi sinh, xác nhận program/snapshot và quyền đọc; nếu chưa rõ thì dừng và báo khoảng trống blocking. Trước khi rule được duyệt, chỉ calibration được giao tường minh và gắn nhãn dùng Draft; chưa chạy batch chính thức. Việc lưu phiên bản chỉ dẫn thực tế của mỗi run vẫn theo contract hiện hành, không dùng một version prompt cố định từ pack này.

Có hai đường sử dụng tách biệt:

- **Calibration trực tiếp bằng CLI:** người vận hành mở Codex CLI hoặc Claude CLI trong thư mục output riêng, áp quyền chỉ ghi tại output, rồi giao một chỉ dẫn ngắn chọn program/mode. Agent đọc README này theo thứ tự, phiếu input và source allowlist; không cần Portal runner hoặc prompt được đóng gói trong repo.
- **Tự động hóa qua Portal:** là feature LIVE tương lai, phải có context builder, runner/adapter, validator và enforcement theo engineering rules trước khi bật. Bộ tài liệu này không triển khai hoặc giả định các thành phần đó đã tồn tại.

[Runbook](runbook.md) mô tả preflight và cách chạy mẫu cho từng đường. Việc CLI có thể đọc source không đồng nghĩa được phép chạy source, SQL hay executable từ corpus.

Chọn tường minh một chế độ:

- `document-draft`: Markdown theo template cho các tài liệu được chọn (tối đa sáu); chưa phải payload backend hoặc deliverable BR xlsx.
- `understanding-v1`: chỉ JSON theo [schema hiện hữu](../engineering/contracts/understanding-payload.schema.json); không nhúng sáu file/metadata vào JSON, không tuyên bố đủ bảng specification-design.

## Phần đầu và phần cuối chung

Phần đầu chung cho mỗi template (bảng ngay dưới tiêu đề): unit/program, project/entrypoint path và alias, snapshot và version đã được cung cấp, ngôn ngữ/runtime phát hiện ở bước 0 (có căn cứ), phạm vi đã đọc (file đã/chưa đọc, excluded/missing/unsupported kèm lý do), giới hạn, nhãn Draft, và dòng **Trạng thái sinh** (`đang sinh` kèm đơn vị dừng gần nhất, hoặc `hoàn tất` khi không còn đơn vị "chưa phân tích" trong phạm vi của tài liệu, theo [SD-CT-08](rules/artifacts.md)). AI chỉ chép định danh đã cung cấp; không cấp artifact/run ID, hash, thời điểm, reviewer hoặc review state. Thiếu metadata ghi “chưa được cung cấp”. Nhãn Draft không phải quyền ghi envelope.

Phần cuối chung: **câu hỏi mở** của tài liệu đó, đặt trong section questions sẵn có của template (Basic §8, DB §6, Detail §7) hoặc mục "Câu hỏi mở" cuối tài liệu (Business rules), theo bảng:

| Q-ID   | Câu hỏi/thiếu gì | Related BR/DS/section | Blocking đề xuất | Phần ảnh hưởng | Evidence/context cần thêm |
| ------ | ---------------- | --------------------- | ---------------- | -------------- | ------------------------- |

Q-ID đánh số trong cả gói của program, không trùng giữa các tài liệu; tài liệu khác dẫn Q-ID của tài liệu đã mở nó. Không có câu hỏi thì ghi "Không có". Resolution do người có quyền ghi riêng, append-only theo [contract](../engineering/specs/understanding-contract.md); AI không điền reviewer/UTC/quyết định hoặc xóa câu hỏi. Số đo coverage/LoC/KPI lấy từ công cụ và hồ sơ review, không do agent điền ([SD-EV-08](rules/context-evidence.md)).

## Nguồn chuẩn

| Trách nhiệm                                    | Nguồn duy nhất                                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Decode, normalized view, line/quote/hash, LoC  | [source-analysis](../engineering/specs/source-analysis.md)                                |
| Inventory, SQL/call graph, mapping schema      | [source-inventory](../engineering/specs/source-inventory.md)                              |
| Payload, semantic validation, envelope, review | [understanding-contract](../engineering/specs/understanding-contract.md) và schema ở trên |
| Process, permissions, service/runner           | [JOB/AI](../engineering/rules/jobs-ai.md)                                                 |
| Snapshot, evidence, review, export             | [DATA](../engineering/rules/data-evidence.md)                                             |
| Kiểm chứng theo phạm vi                        | [QA/REV](../engineering/rules/testing-review.md)                                          |

Rule specification-design áp dụng các nguồn này cho tài liệu hiện trạng, không định nghĩa lại thuật toán hay thay contract. Nếu mâu thuẫn ảnh hưởng hành vi, ghi blocking decision, không tự nới gate. Các đoạn nguyên tắc được giữ từ Draft là diễn giải áp dụng; nguồn engineering vẫn quyết định chi tiết kỹ thuật.

Bộ pack chỉ định nghĩa tài liệu: không context builder, runner, backend, UI, exporter hoặc KB index. Gói chuẩn bị calibration có thể được lập từ P1 nhưng không phải tài liệu nghiệp vụ; chỉ chạy CLI AI sau khi có quyết định và preflight theo runbook. Không chạy legacy, SQL hay executable từ corpus.
