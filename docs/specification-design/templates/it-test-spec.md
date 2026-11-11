# Đặc tả test tích hợp (結合テスト仕様書) — <PROGRAM>

**DRAFT TEMPLATE — spec-design-templates-0.13.0-draft.** [Phần đầu chung](../README.md). Tài liệu này do agent viết theo **checklist tất định** của Portal (`context/p1/1.5-it-skeleton.json`), không phải theo ý agent về cái gì đáng test. Cùng cơ chế với [đặc tả test đơn vị](ut-test-spec.md); IT **không lặp lại** case mức nhánh của UT.

## 1. Phạm vi và cách làm

<Program, các file đã đọc, các module/bảng/báo cáo/program liên quan. Một câu: các scenario dưới đây được liệt kê từ source theo checklist, mỗi scenario có evidence `file:dòng`>

IT kiểm **sự phối hợp giữa các phần** của program: program gọi module dùng chung, chuỗi đọc/ghi trên cùng một bảng qua nhiều procedure, báo cáo, và dữ liệu dùng chung với program khác. Checklist chưa có hạng mục màn hình gọi màn hình (kết quả phân tích hiện chưa ghi lời gọi giữa các form); không tự thêm loại này. Không viết lại case nhánh trong một procedure — phần đó thuộc đặc tả test đơn vị.

Quy tắc bắt buộc (validator của Portal kiểm, sai thì gói bị từ chối):

- Mỗi hạng mục của checklist (`context/p1/1.5-it-skeleton.json`, trường `items[].id`) có **ít nhất một scenario**, hoặc một dòng loại trừ kèm lý do không test được.
- Mỗi scenario có evidence `đường/dẫn/file:dòng` là **file thuộc program** (trong `items[].file` hoặc file cùng program), dòng thật của lời gọi/câu lệnh/định nghĩa báo cáo được test.
- Không thêm scenario cho ID không có trong checklist; không đổi ID.
- Hạng mục có `counterpart` khác `null` trong checklist (loại `cross-program`) **phải nêu tên program đó** trong cột `関連要素`, viết đúng như giá trị `counterpart`, kể cả khi hàng đó là loại trừ. Thiếu tên này thì gói bị từ chối.
- Checklist rỗng (`"items": []`): program không có hạng mục tích hợp nào trong kết quả phân tích. Khi đó bảng mục 2 chỉ có hàng tiêu đề và hàng phân cách, mục 1 ghi rõ điều này; không tự nghĩ ra scenario.

### 1.1 Định dạng bảng (lỗi định dạng làm cả gói bị từ chối)

Portal đọc bảng scenario bằng **vị trí cột**, nên định dạng là phần của hợp đồng:

- **Tiêu đề cột thứ hai phải viết nguyên văn** theo ngôn ngữ đầu ra — Portal tìm bảng scenario bằng đúng ô này. Không dịch khác, không thêm chú thích vào ô. Tiếng Việt: `ID hạng mục`. 日本語: `対象ID`. English: `Target ID`. Các tiêu đề cột khác dịch theo ngôn ngữ đầu ra như bình thường.
- **Chỉ bảng scenario ở mục 2 được phép có ô thứ hai là một trong ba tiêu đề trên.** Bảng khác trong tài liệu (ví dụ mục 3) phải đặt cột khác ở vị trí thứ hai, nếu không Portal sẽ đọc nhầm bảng và từ chối gói.
- **Cột `区分` chỉ nhận một trong hai giá trị nguyên văn** theo ngôn ngữ đầu ra: scenario thật là `Kiểm thử` / `テスト` / `Test`, loại trừ là `Loại trừ` / `対象外` / `Excluded`. Viết khác (ví dụ "Không áp dụng", "N/A", "—") làm hàng đó **bị hiểu là scenario thật**: Portal không báo lỗi, nhưng hạng mục không test được sẽ xuất hiện trong Excel như một scenario có thể thực hiện và `対象外理由` bị bỏ qua. Đây là lỗi im lặng, phải viết đúng một trong hai giá trị trên.
- **Cột `種別` viết nguyên văn giá trị `items[].kind` của checklist**: `shared-module`, `db-chain`, `report`, `cross-program`. Không dịch, không tự thêm loại mới.
- **Mỗi hàng có đúng 11 ô.** Ô không có nội dung vẫn phải giữ dấu `|` để không lệch cột; `対象外理由` để trống khi `区分` là scenario thật.
- **Một ô một dòng.** Không xuống dòng trong ô (kể cả `<br>` hay danh sách nhiều dòng); `手順` nhiều bước thì viết `1) … 2) …` trên một dòng, hoặc tách thành nhiều scenario. Ký tự `|` trong nội dung (điều kiện, SQL, chuỗi) phải escape thành `\|`.
- **Evidence (`根拠`) viết đúng một dạng:** `<đường dẫn như trong checklist>:<dòng>`, hoặc `…:<dòng đầu>-<dòng cuối>` cho đoạn nhiều dòng. Copy đường dẫn **nguyên văn từ `items[].file` của checklist** (được phép giữ tiền tố `source/`). Dùng dấu `:` và chữ số nửa chiều (half-width), dòng ≥ 1, **một ref một ô**, không thêm gì sau số dòng. Ví dụ đúng: `frmOrder.frm:120`, `src/frmOrder.frm:120-134`.
- Portal có chuẩn hóa một số cách viết thường gặp trước khi so (dấu `：` và chữ số toàn chiều, `〜` thay cho `-`, hậu tố `行`/`行目`, ghi chú trong ngoặc ở cuối, dấu `\` thay cho `/`, chỉ ghi tên file khi tên đó thuộc duy nhất một file của program, và lấy ref đầu nếu ô có nhiều). Đây là lưới an toàn, **không phải cách viết được khuyến khích**: dạng chuẩn ở gạch đầu dòng trên luôn đúng, còn ô có hai ref sẽ mất ref thứ hai.
- **Hàng phân cách phải dùng ít nhất hai dấu gạch** mỗi ô (`| --- | --- |`). Viết `| - | - |` làm Portal hiểu đó là một scenario và từ chối gói.
- `前提条件`, `手順`, `期待結果` không được để trống với scenario thật; `対象外理由` không được để trống với hàng loại trừ.

## 2. Test scenario

Cột theo đúng thứ tự dưới đây (tiêu đề dịch theo ngôn ngữ đầu ra trừ cột thứ hai ở mục 1.1, vị trí cột không đổi). `対象ID` là ID của hạng mục checklist. Một dòng một scenario; nhiều scenario cho cùng một hạng mục thì lặp `対象ID`.

Hai hàng dưới đây là **ví dụ định dạng, phải xóa** và thay bằng scenario thật của program:

| No  | 対象ID                   | 種別          | シナリオ                                        | 関連要素                      | 前提条件                              | 手順                                                              | 期待結果                                                     | 根拠(file:行)       | 区分   | 対象外理由                                             |
| --- | ------------------------ | ------------- | ----------------------------------------------- | ----------------------------- | ------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ | ------------------- | ------ | ------------------------------------------------------ |
| 1   | IT-ORDER-db-chain-1      | db-chain      | Đơn lưu ở frmEntry hiện đúng ở frmList          | Bảng ORDERS, frmEntry, frmList | ORDERS chưa có đơn số 1001            | 1) Mở frmEntry 2) Nhập đơn 1001 3) Bấm cmdSave 4) Mở frmList      | frmList có một dòng số đơn 1001 với số lượng vừa nhập        | frmEntry.frm:120-134 | テスト |                                                        |
| 2   | IT-ORDER-cross-program-1 | cross-program | ORDERS do program này ghi, KNRO0990 đọc         | Bảng ORDERS, program KNRO0990 | Có máy chạy được cả hai program       |                                                                   |                                                              | frmEntry.frm:120    | 対象外 | Cần chạy program KNRO0990, ngoài môi trường IT hiện có |

- `シナリオ`: luồng cụ thể quan sát được trong code (procedure nào gọi module dùng chung nào, procedure nào ghi rồi procedure nào đọc), không ghi chung chung kiểu "kiểm tra tích hợp".
- `関連要素`: tên thật của màn hình/module/bảng/báo cáo tham gia, viết như trong source hoặc checklist. Hạng mục có `counterpart` phải có tên program đó (quy tắc ở mục 1).
- `前提条件`: trạng thái dữ liệu/môi trường cần có trước khi chạy (bảng nào có dữ liệu gì, có máy in, có file nào).
- `手順`: các bước người test thao tác được, đánh số trên một dòng.
- `期待結果`: kết quả quan sát được theo code hiện tại (giá trị truyền sang module dùng chung, bản ghi được ghi/đọc, nội dung báo cáo), không phải kết quả "nên" có.

## 3. Độ phủ phối hợp trên mỗi hạng mục

Bảng để người review đối chiếu độ sâu: với mỗi hạng mục của checklist, số đường phối hợp **đếm được trong source** (procedure của module dùng chung được gọi, procedure cùng ghi/đọc một bảng, biến thể báo cáo) và số scenario đã viết. Số scenario ít hơn thì giải thích ở cột cuối.

| Hạng mục | Số đường phối hợp thấy trong code | Số scenario đã viết | Ghi chú nếu ít hơn |
| -------- | --------------------------------- | ------------------- | ------------------ |

## 4. Hạng mục không test được

<Nhắc lại từ cột `区分`/`対象外理由` của bảng mục 2: ID, lý do và điều gì cần có để test (ví dụ DB, thiết bị in, program khác). Không thêm ID không có trong bảng mục 2 và không ghi lý do khác với bảng.>

## 5. Điểm chưa xác định

Theo [phần cuối chung](../README.md#phần-đầu-và-phần-cuối-chung): mục **Điểm chưa xác định** là section cuối cùng.
