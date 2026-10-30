# Nguồn và truy vết yêu cầu

Yêu cầu bổ sung 22/10/2026: tổng quát hóa phân tích đa ngôn ngữ, giữ nguyên template output. [Quy trình phân tích](analysis-method.md) định nghĩa bước tự nhận diện ngôn ngữ, checklist semantics và cách điền template trung lập; không dùng profile theo ngôn ngữ. Danh sách pilot/KPI do input dự án cung cấp. Không thay parser, schema hoặc output KUNO0020. KPI/scope gốc không áp mặc định cho dự án khác.

Yêu cầu bổ sung 22/10/2026: report trong Basic/Detail có template riêng, tham khảo workbook layout và Markdown InternalReview người dùng cung cấp. Mapping nguồn và các ca Excel/CSV/mode/config/RPA/file-lock nằm trong [hướng dẫn report](report-templates.md); hai template được ghép vào các mục 7–8 của Draft, không đổi 35 mã rule hoặc 15 pilot ID.

**DRAFT.** [README](README.md). Nguồn chuyển soạn: `P2-Rules-v0.1-Draft.md`, 21/10/2026 do người dùng cung cấp. Bộ này không phụ thuộc file ngoài repo khi sử dụng.

Các căn cứ workbook/zip sau được dẫn lại từ bản Draft, chưa kiểm tra trực tiếp workbook/zip trong task này:

| Căn cứ                           | Yêu cầu được Draft dẫn                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| WBS & Lịch hàng 21–26 (2.1–2.6)  | BR có trace, Basic/Detail/DB, TL review, KB approved, G1                                                             |
| Output theo giai đoạn hàng 13–16 | OUT-P2-01 BR xlsx; OUT-P2-02 Basic TL duyệt 15/15; OUT-P2-03 Detail/DB TL duyệt, khớp source; KB repo hoặc Vector DB |
| Milestone & Gate hàng 7, 19–21   | Coverage ≥90% trên 15; BR Accuracy ≥85%; sai lệch LoC ≤5%                                                            |
| Tổng quan hàng 27–30             | Parser + AI Agent + CI; PR/checklist Excel; KB tài liệu được duyệt                                                   |

Template, ID, cách đóng gói, adapter, calibration và bổ sung checklist là đề xuất, không phải nguyên văn workbook. Người phụ trách xác nhận căn cứ kế hoạch trước G1. Contract/rule hiện tại trong repo đã được đối chiếu trực tiếp; nguồn chuẩn ở README.

| Mục Draft         | Nơi áp dụng                                                                          | Cách kiểm                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 1 Căn cứ          | Trang này, README                                                                    | Phân biệt nguồn gián tiếp/đề xuất                                                         |
| 2 Mục tiêu        | [scope](rules/scope.md)                                                              | Không trộn P3, P1 complete không thay approval                                            |
| 3 Pilot           | [scope](rules/scope.md), [phiếu input](templates/input-context.md)                   | Danh sách 15 ID và ambiguity KZKO0010 do input pilot VB6 cung cấp                         |
| 4 Input           | [context](rules/context-evidence.md), [phiếu input](templates/input-context.md)      | Snapshot/allowlist/chunk/provenance                                                       |
| 5 Evidence        | [context](rules/context-evidence.md)                                                 | SD-EV-01 đến 08, không tự verify                                                          |
| 6 BR              | [deliverables](rules/deliverables.md), [BR template](templates/business-rules.md)    | Đủ cột, nhóm nghiệp vụ, shared, xlsx                                                      |
| 7 Basic           | [deliverables](rules/deliverables.md), [Basic template](templates/basic-design.md)   | Đủ 8 section                                                                              |
| 8 Detail          | [deliverables](rules/deliverables.md), [Detail template](templates/detail-design.md) | Đủ 7 section, file-level code                                                             |
| 9 DB              | [deliverables](rules/deliverables.md), [DB template](templates/db-design.md)         | Usage không bịa DDL; giữ unresolved/X                                                     |
| 10 Contract       | [artifacts](rules/artifacts.md), [mapping](contract-mapping.md)                      | Không đổi schema; metadata đề xuất tách riêng                                             |
| 11 Chỉ dẫn tác vụ | [README](README.md), [phiếu input](templates/input-context.md)                       | Theo yêu cầu tinh gọn: bỏ file prompt riêng; dùng rule + template + context chung hai CLI |
| 12 Review         | [checklist](review-checklist.md), câu hỏi mở trong từng tài liệu                    | Ba lớp, append-only, không giả reviewer                                                   |
| 13 KPI            | [checklist](review-checklist.md), phạm vi đã đọc trong từng tài liệu                | Mẫu số 15/BR reviewed, zero chưa đo                                                       |
| 14 KB             | [KB](knowledge-base.md)                                                              | Approval/version/trace/retrieval                                                          |
| 15 Provider       | [runbook](runbook.md)                                                                | Cùng baseline, calibration lại                                                            |
| 16 Áp dụng        | [runbook](runbook.md)                                                                | Tách direct CLI calibration khỏi Portal LIVE; cả hai có preflight riêng                   |
| 17 Quyết định     | [decisions](decisions.md)                                                            | Tất cả chờ duyệt                                                                          |

Mã rule từ Draft đổi tiền tố P2- thành SD-, giữ nguyên số, mỗi mã có một định nghĩa tại rule sở hữu. Templates là biểu mẫu áp dụng, không tạo bản schema/policy mới. Số mục gốc được giữ trong các file chuyển soạn để truy vết.
