# Specification design — validation và human review

**DRAFT — chờ duyệt.** Pack: spec-design-rules-0.9.0-draft. [Thứ tự đọc và nguồn quy định](README.md).

Phiếu dùng cho mỗi artifact/version: đánh dấu từng mục sau kiểm thực tế; chưa đánh dấu nghĩa là chưa kiểm. Findings ghi item/section, bằng chứng, tác động, hướng xử lý. Không AI ghi danh tính hay quyết định thay reviewer.

- [ ] Trạng thái sinh: mọi tài liệu ghi `hoàn tất` trong phần đầu chung, không còn đơn vị "chưa phân tích" trong phạm vi; nếu số phiên > 1 thì soát chỗ nối giữa các phiên, không có đoạn bị viết lại hoặc ID trùng/đặt lại ([SD-CT-08](rules/artifacts.md)).
- [ ] Cấu trúc: đúng mode/schema/version, đủ các tài liệu ở mục 3 phiếu input (TL chọn + sinh kèm theo SD-CT-07) hoặc JSON đúng mode; mỗi tài liệu có phần đầu chung và mục Câu hỏi mở; Q-ID không trùng trong gói; ID unique, refs tồn tại, đủ section, không placeholder/truncation âm thầm.
- [ ] Nhận diện ngôn ngữ: ngôn ngữ/runtime và phạm vi đã đọc trong phần đầu chung phủ mọi file allowlist; language/dialect/runtime/framework/build config có căn cứ manifest hoặc nội dung, không chỉ từ đuôi file; mâu thuẫn với input có Q-ID; boundary liên ngôn ngữ, binary/generated/unsupported/unmeasured rõ. Semantics ghi theo ngôn ngữ thực, không mượn từ ngôn ngữ khác ([quy trình](analysis-method.md)).
- [ ] Context: đúng program/snapshot, manifest included/excluded/missing/unsupported/unread, chunk hợp nhất, scope allowlist.
- [ ] Evidence: validator độc lập kiểm path/range/quote/hash trên snapshot; không thêm symbol/hash vào evidence JSON.
- [ ] BR: nhóm nghiệp vụ và đường lỗi được xét; shared BR canonical không đếm trùng; hypothesis còn nhãn.
- [ ] Basic: screen/item/designer-runtime/flow/report/message đủ hoặc có lý do/Q-ID.
- [ ] Detail: đủ symbol theo inventory được chọn và file-level code, branches/cleanup/side effect, unresolved calls/build config rõ.
- [ ] Detail Design theo mẫu tham khảo: có danh sách xử lý → trigger/I-O → trình tự/component → validation/SQL → transaction/lỗi → message/state; report có output mapping khi áp dụng; common có mapping caller. Inventory vẫn đủ đơn vị logic/file-level code. Không đưa kiến trúc, SQL, rounding hoặc nghiệp vụ của dự án tham khảo thành sự thật của source đang xét; tham chiếu Basic/DB/BR chuẩn thay vì tạo bản sao.
- [ ] Report/export: áp dụng [review bổ sung](report-templates.md) cho đủ mode, layout/block/helper, query-field mapping, formula owner, CSV contract, config đích, consumer/RPA, file lock/no-data/cancel/partial output/cleanup. Thiếu source/layout là Q-ID; không lấy mẫu hoặc screenshot làm chứng cứ hành vi hệ thống đang xét.
- [ ] DB: as-written/mapping/provenance riêng; unknown không thành DDL; dynamic SQL/stored procedure/X không mất.
- [ ] Nhất quán: BR ↔ design ↔ function ↔ DB ↔ question giữa các tài liệu được sinh; tài liệu liên quan được sinh cùng lần theo SD-CT-07 hoặc trỏ bản đã duyệt cùng snapshot ở mục 4, không có ID bịa; evidence đa đoạn đủ chứng minh claim; bản dịch ngôn ngữ gốc tách riêng.
- [ ] Nghiệp vụ: TL kiểm ý nghĩa claim, nhánh thiếu, precision/Null/error; quote đúng không tự chứng minh hiểu đúng.
- [ ] Review: version/source đúng, evidence lỗi và blocking questions được xử lý theo contract; append-only, stale review không tái dùng.
- [ ] Export/KB: đúng version/state, BR xlsx còn là nghĩa vụ nếu chỉ có Markdown; text chống formula injection; không secret/path tuyệt đối/log; chỉ index bản được duyệt.
- [ ] KPI: report có nguồn đo và tập version cố định; số chưa đo không giả 0/100%; người có quyền quyết G1.

## 12. Validation và human review

Ba lớp độc lập:

1. **Cấu trúc:** parse/schema, trường bắt buộc, ID duy nhất, references, đủ section, giới hạn output. Lỗi cấu trúc không được gắn thành công đầy đủ.
2. **Evidence:** file thuộc manifest, range hợp lệ, quote khớp, snapshot/hash do công cụ xác minh. Evidence sai không thể được AI tự sửa thành verified.
3. **Nghiệp vụ:** TL kiểm tra claim thật sự được evidence chứng minh, nhánh quan trọng có bị thiếu, dịch có sai, DB inference có vượt chứng cứ. Người có quyền ghi approve/reject và lý do.

Review record tối thiểu: artifact ID/version, source hash, rule version, item ID nếu có, reviewer, UTC, quyết định, comment/resolution. Append-only; không rewrite lịch sử. Review hết hạn khi nội dung/source đổi; bản mới quay về draft. Với pilot có thể lưu bằng PR và bảng review, chưa cần xây Portal.

| Check         | Điều kiện đạt                                                                         |
| ------------- | ------------------------------------------------------------------------------------- |
| Scope         | Đúng program/snapshot; thiếu dependency hiển thị rõ                                   |
| BR            | Phát biểu kiểm chứng được; observed có evidence đúng; hypothesis giữ nhãn             |
| Basic Design  | Có screen/item/flow/report hoặc giải thích không áp dụng/chưa xác định                |
| Detail Design | Có inventory procedure, nhánh/lỗi/side effect và phần chưa phân tích                  |
| DB            | CRUD có trace; type/key/relationship chưa biết không bị bịa                           |
| Consistency   | BR ↔ design ↔ function ↔ DB không mâu thuẫn, references tồn tại                       |
| Approval      | Không còn evidence lỗi cho claim giữ là observed; blocking questions đã có resolution |
| Export        | Đúng version/review state; không lộ credential, absolute path, raw log nhạy cảm       |

Không có BR tìm được không tự đồng nghĩa lỗi tool; phải kiểm tra đủ context và ghi insufficient_information nếu không có nội dung sử dụng được. Không tạo BR giả để vượt gate.

## 13. KPI và gate dự án

Tập đơn vị, mẫu số, ngưỡng và người quyết định gate lấy từ kế hoạch/input dự án. Không có số đo thì ghi chưa đo; không suy approval từ coverage hoặc schema pass. Công bố generated/reviewed/accepted/rejected/pending, khóa tập version và tách first-pass/after-correction.

KPI và nghĩa vụ 15 program trong Draft gốc chỉ áp cho pilot VB6 khi input chọn pilot đó ([scope](rules/scope.md)). Dự án/ngôn ngữ khác không tự kế thừa ngưỡng hoặc thang complexity.
