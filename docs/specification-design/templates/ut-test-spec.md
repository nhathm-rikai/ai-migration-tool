# Đặc tả test đơn vị (単体テスト仕様書) — <PROGRAM>

**DRAFT TEMPLATE — spec-design-templates-0.14.0-draft.** [Phần đầu chung](../README.md). Tài liệu này do agent viết theo **checklist tất định** của Portal (`context/p1/1.4-ut-skeleton.json`), không phải theo ý agent về cái gì đáng test.

## 1. Phạm vi và cách làm

<Program, các file đã đọc, ngôn ngữ/runtime. Một câu: các case dưới đây được liệt kê từ source, mỗi case có evidence `file:dòng`>

Quy tắc bắt buộc (validator của Portal kiểm, sai thì gói bị từ chối):

- Mỗi hạng mục của checklist (`context/p1/1.4-ut-skeleton.json`, trường `items[].id`) có **ít nhất một case**, hoặc một dòng loại trừ kèm lý do không test được.
- Với mỗi hạng mục, đọc source của procedure/handler/câu SQL/report đó và **tự liệt kê case ở mức nhánh**: mỗi `If`/`ElseIf`/`Case`/vòng lặp (0, 1, nhiều lần), mỗi điều kiện biên và mỗi đường lỗi quan sát được trong code. Không bịa nhánh không có trong code.
- Mỗi case có evidence `đường/dẫn/file:dòng` là **file thuộc program** (trong `items[].file` hoặc file cùng program), dòng thật của nhánh/câu lệnh được test.
- Không thêm case cho ID không có trong checklist; không đổi ID.

### 1.1 Định dạng bảng (lỗi định dạng làm cả gói bị từ chối)

Portal đọc bảng test case bằng **vị trí cột**, nên định dạng là phần của hợp đồng:

- **Tiêu đề cột thứ hai phải viết nguyên văn** theo ngôn ngữ đầu ra — Portal tìm bảng test case bằng đúng ô này. Không được dịch khác, không thêm chú thích vào ô. Tiếng Việt: `ID hạng mục`. 日本語: `対象ID`. English: `Target ID`. Các tiêu đề cột khác dịch theo ngôn ngữ đầu ra như bình thường.
- **Chỉ bảng test case ở mục 2 được phép có ô thứ hai là một trong ba tiêu đề trên.** Bảng khác trong tài liệu (ví dụ mục 3) phải đặt cột khác ở vị trí thứ hai, nếu không Portal sẽ đọc nhầm bảng và từ chối gói.
- **Cột `区分` chỉ nhận một trong hai giá trị nguyên văn** theo ngôn ngữ đầu ra: case thật là `Kiểm thử` / `テスト` / `Test`, loại trừ là `Loại trừ` / `対象外` / `Excluded`. Viết khác (ví dụ "Không áp dụng", "N/A", "—") làm hàng đó **bị hiểu là case thật**: Portal không báo lỗi, nhưng hạng mục không test được sẽ xuất hiện trong Excel như một case có thể thực hiện và `対象外理由` bị bỏ qua. Đây là lỗi im lặng, phải viết đúng một trong hai giá trị trên.
- **Mỗi hàng có đúng 13 ô.** Ô không có nội dung vẫn phải giữ dấu `|` để không lệch cột; `対象外理由` để trống khi `区分` là case thật.
- **Một ô một dòng.** Không xuống dòng trong ô (kể cả `<br>` hay danh sách nhiều dòng); nội dung dài thì tách thành nhiều case hoặc viết ngắn lại. Ký tự `|` trong nội dung (điều kiện, SQL, chuỗi) phải escape thành `\|`.
- **Evidence (`根拠`) viết đúng một dạng:** `<đường dẫn như trong checklist>:<dòng>`, hoặc `…:<dòng đầu>-<dòng cuối>` cho nhánh nhiều dòng. Copy đường dẫn **nguyên văn từ `items[].file` của checklist** (được phép giữ tiền tố `source/`). Dùng dấu `:` và chữ số nửa chiều (half-width), dòng ≥ 1, **một ref một ô**, không thêm gì sau số dòng. Ví dụ đúng: `frmOrder.frm:120`, `src/frmOrder.frm:120-134`.
- Portal có chuẩn hóa một số cách viết thường gặp trước khi so (dấu `：` và chữ số toàn chiều, `〜` thay cho `-`, hậu tố `行`/`行目`, ghi chú trong ngoặc ở cuối, dấu `\` thay cho `/`, chỉ ghi tên file khi tên đó thuộc duy nhất một file của program, và lấy ref đầu nếu ô có nhiều). Đây là lưới an toàn, **không phải cách viết được khuyến khích**: dạng chuẩn ở gạch đầu dòng trên luôn đúng, còn ô có hai ref sẽ mất ref thứ hai.
- **Hàng phân cách phải dùng ít nhất hai dấu gạch** mỗi ô (`| --- | --- |`). Viết `| - | - |` làm Portal hiểu đó là một case và từ chối gói.
- `手順`, `期待結果` không được để trống với case thật; `対象外理由` không được để trống với hàng loại trừ.
- `確認観点` phải có nội dung: trong file Excel bàn giao nó là **một cột riêng** người test đọc và lọc theo, để trống là lỗ trong tài liệu họ nhận được.

## 2. Test case

Cột theo đúng thứ tự dưới đây (tiêu đề dịch theo ngôn ngữ đầu ra trừ cột thứ hai ở mục 1.1, vị trí cột không đổi). `対象ID` là ID của hạng mục checklist. Một dòng một case; nhiều case cho cùng một hạng mục thì lặp `対象ID`.

Hai hàng dưới đây là **ví dụ định dạng, phải xóa** và thay bằng case thật của program:

| No  | 対象ID                     | 大項目             | 中項目                   | 小項目                             | 前提条件                       | 入力データ                      | 手順                                  | 期待結果                                                | 確認観点                           | 根拠(file:行)            | 区分     | 対象外理由                                       |
| --- | -------------------------- | ------------------ | ------------------------ | ---------------------------------- | ------------------------------ | ------------------------------- | ------------------------------------- | ------------------------------------------------------- | ---------------------------------- | ------------------------ | -------- | ------------------------------------------------ |
| 1   | UT-frmOrder-cmdSave_Click-1 | cmdSave_Click      | If txtQty.Text = "" | Số lượng để trống                  | Form mở, chưa nhập số lượng    | txtQty.Text = ""                | Bấm cmdSave                           | MsgBox "数量を入力してください"; không gọi UpdateOrder  | Không ghi DB khi validate thất bại | frmOrder.frm:120-126     | テスト   |                                                  |
| 2   | UT-rptMonthly-report-1      | rptMonthly         | Xuất báo cáo             | In ra máy in mặc định              | Có máy in và dữ liệu tháng     | Tháng = 2026/03                 |                                       |                                                         |                                    | rptMonthly.frm:48        | 対象外   | Cần máy in thật, không kiểm được trong môi trường UT |

- `大項目`: procedure/màn hình/câu SQL/report; `中項目`: **tên nhánh hoặc điều kiện cụ thể viết theo code** (ví dụ `If txtQty.Text = ""`, `Case 2`, `Loop 0 lần`, `On Error`), không ghi chung chung kiểu "nhánh chính" hay "trường hợp bình thường"; `小項目`: điều kiện cụ thể của case.
- `入力データ`: giá trị cụ thể suy ra từ code (tên biến, giá trị, bảng/cột), không để chung chung.
- `期待結果`: kết quả quan sát được theo code hiện tại (giá trị trả về, thay đổi dữ liệu, thông báo), không phải kết quả "nên" có.

## 3. Số nhánh đã thấy trên mỗi hạng mục

Bảng để người review đối chiếu độ sâu: với mỗi hạng mục của checklist, số nhánh/điều kiện **đếm được trong source** và số case đã viết. Số case ít hơn số nhánh thì giải thích ở cột cuối.

| Hạng mục | Số nhánh thấy trong code | Số case đã viết | Ghi chú nếu ít hơn |
| -------- | ------------------------ | --------------- | ------------------ |

## 4. Hạng mục không test được

<Nhắc lại từ cột `区分`/`対象外理由` của bảng mục 2: ID, lý do và điều gì cần có để test (ví dụ DB, thiết bị in). Không thêm ID không có trong bảng mục 2 và không ghi lý do khác với bảng.>

## 5. Điểm chưa xác định

Theo [phần cuối chung](../README.md#phần-đầu-và-phần-cuối-chung): mục **Điểm chưa xác định** là section cuối cùng.
