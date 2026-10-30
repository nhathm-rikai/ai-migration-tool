# Specification design — artifact và contract

**DRAFT — chờ duyệt.** Pack: spec-design-rules-0.9.0-draft.

[Thứ tự đọc và nguồn quy định](../README.md).

## 10. Contract máy đọc và artifact

SD-CT-01: tái sử dụng `understanding-v1` cho `businessRules`, `designs`, `questions`. Tuân thủ schema thật trong repo; không tự thêm trường bằng cách chỉ thay prompt. `designs.kind=current_behavior` dùng cho specification-design. Target suggestion nếu cần ghi riêng và không trộn với baseline hiện trạng.

SD-CT-02: contract hiện hữu là hợp đồng BR/design tổng quát, chưa được xác nhận đủ để biểu diễn toàn bộ bảng item/function/DB ở trên. **Đề xuất** bổ sung contract specification-design có version riêng trong bước implementation; phải review mapping và schema trước tích hợp máy đọc. Không đổi meaning của `understanding-v1` âm thầm.

SD-CT-03: envelope do service/tool tạo: artifact/run/project ID, source hash, rule/prompt/template/schema version, provider/model/CLI version, thời điểm UTC, trạng thái kỹ thuật và review. AI không điền các giá trị đặc quyền này. Exit code 0 chưa đủ thành công.

SD-CT-04: gói output mỗi program gồm các tài liệu TL chọn và tài liệu sinh kèm theo SD-CT-07 trong `business-rules.md`, `basic-design.md`, `detail-design.md`, `db-design.md`; kèm manifest do công cụ sinh. Không có `coverage.md`/`open-questions.md` riêng: trạng thái sinh, phạm vi đã đọc và câu hỏi mở nằm trong phần đầu/cuối chung của từng tài liệu ([README](../README.md#phần-đầu-và-phần-cuối-chung)). BR xlsx và KB index được tạo ở bước export/index. Evidence đặt sát claim hoặc qua evidence ID có bảng tra đầy đủ.

Hai [template report](../report-templates.md) được ghép thành section trong Basic/Detail. Layout xlsx hoặc file per-report riêng là đề xuất đóng gói cần review, chưa thành nghĩa vụ exporter/manifest trong contract hiện hành.

SD-CT-07: tài liệu liên quan sinh cùng lúc. Tài liệu tham chiếu ID của tài liệu khác thì được sinh cùng lần chạy với tài liệu đó, để tham chiếu nhất quán ngay trong một gói:

| Tài liệu TL chọn | Tham chiếu tới       | Sinh kèm tự động (nếu chưa có bản đã duyệt) |
| ---------------- | -------------------- | ------------------------------------------- |
| business-rules   | —                    | —                                           |
| db-design        | —                    | —                                           |
| basic-design     | BR                   | business-rules                              |
| detail-design    | BR, item Basic, bảng DB | business-rules, basic-design, db-design  |

- Tập tài liệu sinh = tài liệu TL chọn + tài liệu sinh kèm theo bảng trên. Portal/người vận hành ghi tập này vào mục 3 phiếu input; agent không tự thêm hay bớt.
- Tài liệu sinh kèm **không** được sinh nếu mục 4 phiếu input có bản **đã duyệt** của nó cùng program và cùng snapshot: dẫn đúng ID của bản đó, ghi version, không chép lại nội dung và không sửa bản đó.
- Bản draft/rejected hoặc khác snapshot không dùng làm căn cứ. Không bịa ID; nếu vẫn thiếu căn cứ (vd. tài liệu sinh kèm bị TL bỏ chọn có chủ ý) thì mô tả tại chỗ kèm evidence, ghi "chưa sinh <tài liệu>" và mở Q-ID không blocking.
- Thứ tự sinh trong lần chạy: business-rules → db-design → basic-design → detail-design, để tài liệu tham chiếu được viết sau tài liệu được tham chiếu.
- Phần đầu chung của mỗi tài liệu ghi tài liệu đó là được chọn hay sinh kèm, và các tài liệu nó tham chiếu: sinh cùng lần / bản đã duyệt (version) / chưa sinh.

SD-CT-08: ghi dần và chạy tiếp. Agent ghi kết quả ngay sau mỗi đơn vị logic (hoặc nhóm nhỏ theo thứ tự P1 1.3) vào tài liệu được chọn và đánh dấu "đã phân tích" trong phạm vi đã đọc của tài liệu đó; không dồn tới cuối mới ghi. Phần đầu chung của mỗi tài liệu giữ dòng "Trạng thái sinh": `đang sinh` kèm đơn vị dừng gần nhất, hoặc `hoàn tất` khi không còn đơn vị "chưa phân tích" trong phạm vi.

Khi phiên bị dừng (usage limit, mất kết nối, người vận hành dừng) và chạy tiếp bằng phiên mới:

- Chỉ chạy tiếp khi snapshot, version output P1, pack/template và lựa chọn tài liệu không đổi so với phiên đầu; đổi bất kỳ mục nào thì chạy lại từ đầu bằng run mới.
- Đọc lại phiếu input, pack và các tài liệu đang dở; kiểm cấu trúc và "Trạng thái sinh" của chúng trước. File hỏng hoặc không nhất quán thì dừng, báo lỗi, không đoán.
- Chỉ phân tích đơn vị "chưa phân tích"; không viết lại phần đã xong. BR-ID/Q-ID/E-ref đánh số tiếp, không đặt lại.
- Tăng số phiên trong "Trạng thái sinh". Output còn `đang sinh` không được gửi TL review.

SD-CT-06: run record và finding review của TL là hồ sơ quy trình, không phải artifact nghiệp vụ, không làm thay đổi gói Markdown nghiệp vụ.

SD-CT-05: generation không sửa rule, source, artifact đã duyệt hoặc ghi vào KB approved. Chạy lại tạo version/run mới. Khi chia context, giữ chunk manifest và kiểm tra trùng BR, references, coverage khi hợp nhất.
