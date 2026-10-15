# Hợp đồng BR/Design của Portal

**Version:** `understanding-v1` · **Gate:** FEATURE:analysis,reviews,export. Đây là draft phân tích và thiết kế sơ bộ, không phải C# code hoặc cam kết .NET/WinForms/DB đã chốt.

## 1. Payload AI trả về

Schema máy đọc: [understanding-payload.schema.json](../contracts/understanding-payload.schema.json). Sample sạch: [understanding-example.json](../contracts/understanding-example.json), trỏ tới [OrderRules.bas](../contracts/fixtures/OrderRules.bas) giả lập. Schema dùng JSON Schema draft-07, `additionalProperties:false`; sample không chứa source BSN.

Đây là schema validation của backend. Nếu CLI structured-output chỉ hỗ trợ một phần JSON Schema, adapter có thể cung cấp schema tương thích cho model, nhưng output cuối vẫn phải qua schema đầy đủ này và semantic validation; không tự bỏ điều kiện để chiều output AI.

- `schemaVersion`: cố định `understanding-v1`.
- `businessRules[]`: ID `BR-...`, title, statement, `basis: observed|hypothesis`, inputs, outputs, conditions, evidence, openQuestionIds.
- `designs[]`: ID `DS-...`, title, `kind: current_behavior|target_suggestion`, summary, relatedBusinessRuleIds, constraints, evidence, openQuestionIds.
- `questions[]`: ID `Q-...`, question, relatedIds và blocking. Blocking do AI đề xuất để ưu tiên review, không tự quyết định workflow human gate.
- Evidence do AI đề xuất chỉ có relative path, startLine/endLine 1-based và quote. Không cho AI tự cấp hash, reviewer, approved hoặc trạng thái evidence verified.

BR observed và design current_behavior phải có ít nhất một evidence. Hypothesis/target_suggestion có thể chưa có evidence nhưng phải được trình bày đúng nhãn. Đây là điều kiện cấu trúc; evidence có tồn tại thật hay không do semantic validator kiểm.

Các array bắt buộc có mặt, được phép rỗng khi không tìm được thông tin. Payload ba array đều rỗng là output không đủ cho bước Understand, phải phát sinh kết quả `insufficient_information`, không hiện như phân tích đầy đủ thành công. Không bắt AI bịa BR chỉ để array khác rỗng.

## 2. Envelope do backend tạo

Sau validate, backend tạo artifact envelope với các trường:

- `schemaVersion: artifact-envelope-v1`, `artifactId`, `artifactVersion` (số nguyên từ 1), `projectId`, `runId`.
- `sourceSnapshotId`, `sourceSnapshotHash`, `sourceAnalysisVersion`, `locMetricVersion`, `promptVersion`, `runnerVersion`, `createdAt` UTC.
- `mode: live|demo|test`, `qualityStatus: validated|needs_confirmation|insufficient_information`.
- `payload`: AI payload hợp schema, giữ dữ liệu đầu vào kiểm toán; raw response chưa parse không đưa vào API/UI.
- `evidenceChecks[]`: business/design item ID, evidence index (0-based), `status: verified|mismatch|missing_file|invalid_range`, file raw/normalized hash do backend lấy hoặc null khi không tồn tại, reason code.
- `reviewState: draft|in_review|approved|rejected`; khởi tạo `draft`, chỉ review service đổi theo action của con người. Review history append-only, gắn artifact version/source hash.

Quality status là kiểm chứng kỹ thuật/bằng chứng, không đồng nghĩa nội dung nghiệp vụ chính xác. `validated` vẫn cần người review. Khi init chuyển envelope thành TypeBox schema trong contracts và tạo API response test; không đưa metadata này vào output schema cho model tự tạo.

## 3. Semantic validation bắt buộc

1. Parse JSON, validate schema với bound tổng output bytes trước khi lưu. Schema không thay JOB-07 về giới hạn kích thước toàn stream.
2. Unique ID trong từng danh sách; mọi relatedBusinessRuleIds/openQuestionIds/relatedIds trỏ tới item tồn tại trong payload. Duplicate/dangling ID → `AI_OUTPUT_INVALID`.
3. Path normalized relative POSIX, không absolute/drive/traversal/backslash; chỉ lookup trong manifest snapshot, không nối trực tiếp vào filesystem từ AI input.
4. Kiểm `startLine <= endLine <= lineCount`, quote exact theo [source-analysis](source-analysis.md). Mismatch/file thiếu/range ngoài file → giữ finding có trạng thái cần xác minh; không tạo verified giả. Không đọc thêm file ngoài manifest để cố hợp thức hóa evidence.
5. Item hypothesis/target_suggestion hoặc evidence chưa verified → quality `needs_confirmation`; tất cả observed/current có evidence verified và không có question mở → có thể `validated`. Nếu không có BR/design sử dụng được hoặc cả hai rỗng → `insufficient_information` dù JSON đúng; show câu hỏi/lý do rõ.
6. Payload giả mạo `approved`, `reviewer` hoặc `qualityStatus` bị schema từ chối. Backend mới có quyền tạo/đổi metadata review.

Sai cú pháp/schema/reference → run failed với code `AI_OUTPUT_INVALID`. Schema hợp lệ nhưng evidence/nội dung chưa đủ → run có thể succeeded về thực thi, artifact vẫn draft với quality phù hợp. Human gate không tự được vượt qua vì exit code 0 hoặc schema hợp lệ.

## 4. UI, review, export

- UI phân biệt observed/hypothesis và current_behavior/target_suggestion; hiển thị evidence đã xác minh khác với giả thuyết cần SME.
- Review ở mức artifact version trong v1; comment có thể trỏ item ID. Chỉ approve khi không còn evidence check lỗi cho claim giữ nguyên là observed/current và không còn câu hỏi blocking chưa được xử lý.
- Cách xử lý claim thiếu bằng chứng: sửa thành hypothesis hoặc loại khỏi phiên bản mới, ghi comment; không sửa raw evidence checks thành verified. Thay đổi nội dung tạo artifact version mới và validate lại.
- Câu hỏi được người review giải quyết bằng resolution record (questionId, artifactVersion, người xử lý, UTC, comment); không sửa payload AI lịch sử để xóa câu hỏi. Chưa có resolution thì question vẫn mở.
- Target suggestion có thể được duyệt làm đề xuất, không trở thành mô tả hiện trạng. Hypothesis được chấp nhận có điều kiện vẫn phải giữ nhãn đó trong export.
- Export giữ run/version/source hash, quality, review, unresolved questions và nhãn sơ bộ. Không dùng design draft như specification convert đã nghiệm thu.

## 5. Tương thích và kiểm tra

- Version schema trong artifact không đổi khi nâng thư viện. Thay field/ý nghĩa không tương thích phải có version mới + reader hỗ trợ dữ liệu cũ, không sửa âm thầm artifact đã lưu.
- Khi init dùng JSON Schema này làm contract fixture cho TypeBox: cả validator spec và runtime phải nhận/từ chối cùng case. Tránh hai bản schema phát triển độc lập; test contract parity hoặc sinh schema từ một nguồn khi có code.
- Case bắt buộc: sample pass; thiếu evidence observed, field approved giả, ID trùng/tham chiếu sai, traversal/range/quote sai, array rỗng, stale review, target suggestion chưa chốt .NET.
