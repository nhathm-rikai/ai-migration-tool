# Đặc tả đọc source, encoding, dòng và LoC

**Version:** `source-analysis-v1` · **Gate:** FEATURE:analysis, kiểm chứng trên dữ liệu thật trước LIVE. Đây là baseline triển khai Portal; không phải rule convert. Thay đổi cách đo phải tăng version và tạo baseline tương ứng, không trộn số liệu cũ/mới.

## 1. Profile source BSN

Kiểm tra read-only ngày 13/10/2026 trên bộ source khách hàng ngoài repo (không phân phối cùng sản phẩm): 784 file gồm 6 `.frx` binary; trong 778 file còn lại có 41 ASCII-only và 737 non-ASCII decode strict CP932 được. Có 26/737 file không decode strict Shift_JIS được. Tổng 743 file không đọc được UTF-8 bao gồm 6 binary, không phải 743 file text đã xác định là Shift_JIS. Đây là bối cảnh lựa chọn profile, không phải fixture hoặc dependency để clone/build/test repo. Decode được là bằng chứng tương thích, không phải phương pháp tự động nhận diện encoding chắc chắn.

Profile `bsn-vb6-cp932-v1`:

- Text source v1: `.bas`, `.frm`, `.cls`, `.vbp`. Corpus BSN kiểm ngày 23/10/2026 không có `.cls` (0 file, không `.vbp` nào khai báo `Class=`); hỗ trợ `.cls` theo phạm vi WBS, chỉ được kiểm trên fixture tự tạo. Loại VB6 khác (`.ctl`, `.dsr`, `.pag`, `.dob`, `.vbg`...) báo unsupported.
- `.bas`, `.frm`, `.cls`: parse code và tính LoC. `.vbp`: parse tham chiếu project/dependency, không cộng vào LoC code VB6.
- `.frx`: inventory resource binary theo tên/hash nếu cần; không decode thành text, không gửi thẳng cho AI.
- `.log`, `.scc`, `.txt`, build output và config agent không nằm trong text source allowlist mặc định. Tài liệu nghiệp vụ cần nhập theo luồng riêng khi được yêu cầu.
- Root ngoài workspace đã đăng ký, symlink/junction thoát root, secret và file quá giới hạn: báo loại trừ/lỗi, không đọc bừa. Manifest ghi lý do và counts; coverage không giả định bằng 100%.

Số `.vbp` không tự bằng số program nghiệp vụ. Program ID lấy từ danh sách project được chọn; module dùng chung có thể thuộc nhiều program. Tổng unique LoC của corpus không đếm lặp file dùng chung; report phải ghi rõ unique-file hay per-program.

## 2. Quyết định encoding

1. Giữ raw bytes snapshot, không viết lại file gốc. Tính SHA-256 raw bytes trước decode.
2. Nếu có BOM: UTF-8/UTF-16LE/UTF-16BE theo BOM, decoder strict; bỏ BOM khi tạo decoded view. Encoding khác có BOM không hỗ trợ → lỗi rõ.
3. Không BOM: dùng encoding override theo file nếu người dùng đã chọn; nếu không, dùng default profile **CP932 (Windows-31J)**. V1 chỉ cho override không BOM là CP932 hoặc UTF-8; UTF-16 cần BOM. File ASCII-only không có NUL được ghi `ascii` vì cùng nội dung trong hai encoding này; không tự thử UTF-8 rồi chọn theo “decode thành công”.
4. Profile khác có thể chọn default UTF-8 hoặc CP932 tường minh. Không BOM và profile chưa được chọn → yêu cầu chọn profile trước Analyze; không silently guess.
5. Decode lỗi → `SOURCE_ENCODING_ERROR`, ghi relative path + encoding đã thử; không thay byte lỗi bằng U+FFFD, không tự chuyển encoding rồi tiếp tục. Byte NUL trong text không BOM phải báo `SOURCE_TEXT_UNSUPPORTED`, không phân loại là ASCII text hợp lệ. Người dùng sửa profile/override sẽ tạo snapshot/run mới.
6. Ghi effective encoding, nguồn quyết định (`bom|profile|override|ascii`), raw hash và decoder version vào manifest. BOM và override mâu thuẫn → lỗi cấu hình, không bỏ qua.

CP932 không đồng nghĩa codec Shift_JIS strict. Chọn thư viện decoder có CP932/Windows-31J và kiểm thử mapping ký tự mở rộng; không dùng tên codec gần giống mà chưa đối chiếu. Decoder Node chưa được implement trong bộ tài liệu này.

## 3. Dòng và normalized view

- Line numbering 1-based theo decoded text, chỉ tách bằng CRLF, LF hoặc CR. Giữ dòng trống, khoảng trắng và tab; không trim, không Unicode-normalize hoặc reformat source.
- Empty file có 0 dòng. Newline kết thúc file không sinh thêm dòng ảo; hai newline cuối vẫn có một dòng trống thực. Ví dụ `a\n` có 1 dòng; `a\n\n` có 2 dòng.
- Normalized text dùng LF, giữ việc có/không có newline cuối; encode UTF-8 để đưa cho parser/AI. Chỉ đổi newline/BOM, không bỏ header/Attribute/designer khỏi view dùng làm evidence.
- Manifest giữ `rawSha256`, `normalizedSha256`, `lineCount`, `encoding`, `newlineStyle: crlf|lf|cr|mixed|none`, relative path và vai trò file. Snapshot hash SHA-256 từ manifest entries sắp theo path, gồm hash/encoding và version normalization; cùng bytes nhưng decode policy khác phải khác snapshot identity.
- Evidence `startLine/endLine` inclusive trong normalized view toàn file; `quote` bằng các dòng trong range nối bằng LF, không thêm newline sau range. Không lấy line number trong đoạn code đã bỏ designer rồi gắn vào file gốc.

## 4. Định nghĩa LoC v1

Tên metric **`vb6-physical-code-v1`**. Đếm dòng vật lý có code, không đếm statement logic. Các counter cho từng file:

- `physicalLines`: toàn bộ dòng theo mục 3.
- `designerLines`: phần header/designer của `.frm`, gồm cả dòng trống nằm trong vùng đó.
- `metadataLines`: dòng export `Attribute ...` ngoài vùng designer, phân biệt bằng lexer, không dựa substring trong string/comment.
- `blankLines`: dòng trống còn lại trong vùng code.
- `commentOnlyLines`: dòng còn lại chỉ có comment `'` hoặc `Rem`, sau khi xử lý label/line number nếu có.
- `codeLines`: các dòng code còn lại, bao gồm declaration, `Option`, directive `#If/#Else/#End If`, chữ ký và `End Sub/Function/Property`.
- `unclassifiedLines`: chưa phân loại chắc chắn; phải hiện riêng, không đẩy vào codeLines cho đủ số.

Các nhóm loại trừ nhau; tổng bằng physicalLines. `.vbp` không có codeLines và không tham gia mẫu số LoC. File decode/parse fail có `status: unsupported|error`, không báo codeLines=0 như đã phân tích thành công.

Quy tắc lexical:

- Dòng có code rồi comment tính 1 code line. Dấu `'`, `:` hoặc `Rem` bên trong string không phải comment/separator; xử lý dấu `""` escape.
- Nhiều statement cách `:` trên cùng dòng vẫn tính 1. Dòng continuation `_` được tính theo từng dòng vật lý có code, không gộp thành một.
- Dòng chỉ có label/line number và comment tính commentOnly; label đứng riêng không có comment là code line theo metric v1. Phải có fixture cho hai tình huống.
- `.frm`: vùng designer từ đầu file đến ngay trước dòng top-level `Attribute VB_Name`; Attribute đó thuộc metadata. Parser phải xác định ranh giới theo cấu trúc export, không tìm substring mù; thiếu/không xác định ranh giới → unsupported, không cộng designer thành code.
- `.cls`: header export (`VERSION x.y CLASS`, khối `BEGIN ... END` property của class) tính `designerLines`, ranh giới như `.frm`: đến ngay trước `Attribute VB_Name` top-level; thiếu/không cân bằng → unsupported `CLASS_HEADER_BOUNDARY_NOT_FOUND`. Phần sau như `.bas`. Member không `Private` của class/form chỉ gọi qua object (visibility `public`), `Declare` trong class/form là private.
- `.bas`: toàn file là vùng code ngoại trừ export Attribute. Attribute ẩn trong procedure vẫn là metadata; số dòng evidence không bị dồn lại.
- Theo function/procedure: tính codeLines từ chữ ký tới End tương ứng, gồm declaration/body/end, bỏ comment/blank/Attribute. `Sub`, `Function`, `Property Get/Let/Set` có ID riêng; code ngoài procedure tính `fileLevelCodeLines`. Tổng procedure codeLines + fileLevelCodeLines bằng codeLines của file khi coverage đầy đủ.

Tài liệu cú pháp tham khảo: [Microsoft Rem](https://learn.microsoft.com/en-us/office/vba/language/reference/user-interface-help/rem-statement). Đây là tham khảo họ Visual Basic; parser VB6 vẫn phải chứng minh trên fixture/corpus, không giả định parser VBA bất kỳ hỗ trợ toàn bộ VB6.

## 5. Baseline và ngưỡng lệch ≤ 5%

- TL/người review gán nhãn dòng trên fixture sạch theo đúng metric này, QC/Dev khác đối chiếu; expected không sinh bằng chính counter đang test hoặc AI chưa duyệt.
- Fixture phải có form designer, Attribute, comment/Rem/string, colon, continuation, procedure/property và CP932 mở rộng. Fixture nhỏ đã chốt yêu cầu exact match; 5% không dùng để tha lỗi đếm dễ tái hiện.
- Với corpus nghiệm thu, so cùng danh sách file và cùng metric version. `errorRate = sum(abs(actualCodeLines - expectedCodeLines)) / sum(expectedCodeLines) * 100`; không lấy sai số tổng có thể triệt tiêu nhau.
- File thiếu/unsupported trong corpus expected vẫn tính actual=0 trong công thức đánh giá coverage/sai số, nhưng report giữ trạng thái thiếu, không hiển thị “0 LoC hợp lệ”. Nếu expected sum=0: chỉ pass nếu mọi actual=0 và không thiếu file; trường hợp khác fail.
- Gate M1 muốn công bố ≤ 5% cần baseline corpus được chốt và bảng sai lệch per-file/per-procedure. Chưa có baseline thì ghi **chưa xác minh KPI**, không tự tuyên bố đạt. Metric này là baseline đề xuất triển khai; nếu khách hàng dùng logical LoC phải thống nhất metric trước so sánh.
- Coverage báo riêng file/procedure nhận diện được; LoC đúng trên phần nhỏ không chứng minh đã phân tích đủ hệ thống.

## 6. Acceptance trước LIVE/MS1

- Decode được bộ mẫu CP932 có ký tự mở rộng, ASCII, BOM UTF-8/UTF-16; byte lỗi không bị silently replace.
- Evidence quote/range khớp cả CRLF/LF/mixed, tiếng Nhật và form có designer.
- Counter pass fixture exact và báo unsupported rõ; source gốc có hash không đổi sau Analyze.
- Đối chiếu một tập source BSN được phép đọc với người biết tiếng Nhật trước khi nhận decoder là đúng; strict decode thành công chưa đủ xác nhận nghĩa.
- Schema BR/Design và bước kiểm evidence theo [understanding-contract](understanding-contract.md).
