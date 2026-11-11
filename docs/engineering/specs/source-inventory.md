# Đặc tả Source Inventory (`source-inventory-v1`)

**Gate:** FEATURE:analysis. Inventory là output tĩnh của Analyze, không gọi AI. Agent Understand, report và UI đọc file này. Schema máy đọc được nằm ở [`packages/contracts/src/source-inventory.schema.ts`](../../../packages/contracts/src/source-inventory.schema.ts) (TypeBox = JSON Schema); test của API kiểm inventory sinh ra khớp schema.

## 1. Version

| Trường                    | Giá trị hiện tại                                    | Ý nghĩa                                                                                                                                                                                                                                                       |
| ------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`           | `source-inventory-v1`                               | Hình dạng JSON. Thêm trường optional giữ version; đổi tên, bỏ hoặc đổi nghĩa trường phải tăng version.                                                                                                                                                        |
| `metricVersion`           | `vb6-physical-code-v1`                              | Cách đếm dòng, theo [source-analysis](source-analysis.md) §4.                                                                                                                                                                                                 |
| `procedureLinesVersion`   | `vb6-procedure-lines-v1`                            | Breakdown Physical/Code/Executable/Comment/Blank/SQL theo procedure, [source-analysis](source-analysis.md) §4.1. Optional: inventory cũ không có.                                                                                                             |
| `sqlAccessVersion`        | `sql-access-v5`                                     | Cách dựng chuỗi SQL (theo biến, nhánh, property), trích bảng/CRUD và đếm SQL ghép giá trị runtime/bind parameter. v5 thêm `concatenatedSql`/`parameterizedSql` và đọc `vbCrLf`, `vbNewLine`, `vbCr`, `vbLf`, `vbTab` là khoảng trắng thay vì giá trị runtime. |
| `callGraphVersion`        | `call-graph-v2`                                     | Cách nối lời gọi procedure, có đệ quy và hậu tố `$`.                                                                                                                                                                                                          |
| `complexityVersion`       | `complexity-v1`                                     | Công thức điểm complexity (mục 5), chỉ là phân loại tham khảo. Inventory cũ ghi `complexity-v0` hoặc `complexity-v0-draft` (cùng công thức v0: SQL động chỉ đếm tên bảng runtime, ngưỡng 40/55, không có `very-high`).                                        |
| `screenReportVersion`     | `screen-report-v2` (v1: inventory cũ, vẫn đọc được) | Luật đếm 画面・帳票・バッチ (mục 6). Optional: inventory cũ không có, và khi đó mọi nơi hiển thị "chưa có dữ liệu, cần phân tích lại", không hiện 0.                                                                                                          |
| `reportComplexityVersion` | `report-complexity-v2-draft`                        | Phân loại tham khảo độ phức tạp từng report (mục 6.3), không phải effort. Optional như trên; v1 vẫn đọc được và được báo cần phân tích lại.                                                                                                                                                                  |
| `tableNames.version`      | `table-name-v1`                                     | Cách gộp tên bảng cho góc nhìn sau mapping (mục 4.1).                                                                                                                                                                                                         |

Số liệu khác version không được trộn trong cùng report.

## 2. Theo file (`files[]`)

- `manifest`: path, vai trò, hash, encoding, số dòng theo [source-analysis](source-analysis.md) §2–3.
- `analysis` (file code): `counters`, `procedures[]` (ID `<path>#<kind>:<name>`, `visibility`, dòng bắt đầu/kết thúc, `codeLines`, `decisionPoints`, breakdown `physicalLines`/`executableLines`/`commentOnlyLines`/`blankLines`/`metadataLines`/`unclassifiedLines`/`sqlLines` khi có `procedureLinesVersion`), `fileLevelCodeLines`.
- `sqlTables[]`: bảng, thao tác `C|R|U|D|X`, dòng, procedure. `X` là DDL trên bảng (CREATE/DROP/TRUNCATE/ALTER TABLE), thường gặp với bảng tạm.
- `dynamicSql[]`: tên bảng là giá trị runtime, hoặc dính liền với giá trị runtime (`"FROM ORD_" & tenant`, `"UPDATE HAN01." & t`). Parser gắn cờ, không đoán tên bảng.
- `concatenatedSql[]` (từ `sql-access-v5`, optional với inventory cũ): mỗi chuỗi SQL có giá trị runtime ghép vào **ngoài tên bảng** một dòng, kể cả giá trị trong dấu nháy (`" WHERE A = " & x`, `"'" & x & "'"`, mệnh đề trong biến không biết giá trị như `strWHERE` tham số). Dòng là nơi ghép giá trị runtime đầu tiên, `operation` là statement chứa nó. Chỉ tính khi chuỗi có statement mà detector đọc được (cùng điều kiện với `sqlLines`); không tính giá trị nằm trong comment SQL, phần chỉ khác nhau giữa các nhánh đã gộp (mỗi nhánh đã được phân tích riêng), và dòng comment VB6 (`'`, `Rem`). Một chuỗi vừa có tên bảng runtime vừa ghép giá trị có ở cả hai danh sách.
- `parameterizedSql[]` (từ `sql-access-v5`, optional): mỗi chuỗi SQL dùng bind parameter `:name` (ngoài string literal/comment, ví dụ OO4O `CreateDynaset`/`ExecuteSQL` với `Parameters.Add`) một dòng, tại bind đầu tiên. Bind parameter không phải ghép chuỗi nên không tính vào `concatenatedSql`.
- Các fact SQL ghép trong cùng procedure ở cùng dòng chỉ giữ một lần (chuỗi được ghép vào chuỗi khác cũng được phân tích riêng).
- `externalDeclarations[]`: procedure khai báo từ thư viện native (VB6 `Declare ... Lib`, ví dụ Win32 API).
- `labels[]`: label/số dòng dùng làm đích `GoTo`/`On Error`.

`decisionPoints` đếm statement rẽ nhánh: `If`, `ElseIf`, `Case` (trừ `Case Else`), `For`, `Do`, `While`.

## 3. Theo program (`programs[]`)

Một program là một file project (`.vbp`). `members[]` ghi path đã khai báo, path thật, cách resolve và `shared`. `shared = true` khi file được nhiều program khai báo (ví dụ module trong `cmn/`); LoC của file shared không tính là LoC riêng của program.

`analysis`:

- `calls[]`: mỗi cặp (nơi gọi, tên) một dòng, kèm `count` và dòng đầu tiên. `resolution`:
  - `local`: procedure cùng file.
  - `program`: procedure `global` của file khác trong program.
  - `external`: procedure native đã `Declare`.
  - `ambiguous`: nhiều đích cùng tên. Giữ mọi đích trong `targets`, không chọn một.
- `crud[]`: bảng × thao tác từ code riêng và từ procedure shared **gọi tới được** từ code riêng, tên bảng giữ như trong source. `evidence` là vị trí gặp đầu tiên. `viaSharedOnly` cho biết bảng chỉ được truy cập qua module dùng chung.
- `normalizedCrud[]`: cùng dữ liệu sau mapping tên bảng (mục 4.1). Mỗi dòng là một object được giả định là cùng một bảng; `names` liệt kê các tên trong source đã gộp vào. `metrics.normalizedTables` và `normalizedComplexity` tính trên góc nhìn này; `metrics.tables` và `complexity` vẫn tính trên tên như trong source.
- `externalApis[]`: API native thực sự được gọi tới.
- `metrics`: số file/dòng/procedure riêng, decision points, số procedure shared gọi tới được, số bảng, SQL động (`dynamicSql`, tên bảng runtime), `concatenatedSql` và `parameterizedSql` (số fact trong code riêng và procedure shared gọi tới được, như `dynamicSql`; optional với inventory cũ), số component (OCX) trong project, số API native. Theo procedure: lọc fact theo `procedureId`.
- `complexity`: xem mục 5.

## 4. Giới hạn của phân tích lexical

- Tìm tên procedure theo identifier ngoài string/comment, bỏ qua dòng khai báo (`Sub/Function/Property/Declare`). Trong chính procedure `F`, `F = ...` và `F` đứng trơn trong biểu thức là giá trị trả về; `F(...)`, `Call F` và `F args` ở đầu statement là lời gọi đệ quy. Ký tự kiểu `$` không phân biệt (`F$()` gọi `Function F$`). Lời gọi qua object (`Form1.Foo`, `obj.Method`) không nối được. Biến cục bộ trùng tên procedure global có thể bị nối nhầm.
- Chuỗi SQL được dựng lại theo từng statement (đã nối dòng ` _`), trong một procedure:
  - Literal nối bằng `&`/`+` được ghép đúng như viết, không chèn khoảng trắng (`"ORD" & "ERS"` là `ORDERS`).
  - `x = "..."` giữ giá trị cho biến `x`; `x = x & ...` nối tiếp; gán lại `x` hoặc hết procedure thì giá trị cũ được phân tích như một câu SQL. Biến chứa phần SQL khác được ghép vào (`s = strSELECT & strFROM`). Property (`obj.SQL = obj.SQL & ...`) được theo dõi như biến.
  - `If/ElseIf/Else` và `Select Case`: mỗi nhánh bắt đầu từ cùng trạng thái, không ghép chữ của hai nhánh loại trừ nhau. Giá trị của từng nhánh được phân tích riêng; sau khối, phần khác nhau giữa các nhánh thành giá trị runtime (bảng ở đó báo `dynamicSql`). `If` một dòng, kể cả lồng nhau (`If a Then If b Then ... Else ...`), kết thúc hết ở cuối dòng; `Else` thuộc `If` gần nhất chưa có `Else` (`If a Then If b Then x Else y Else z`: `Else y` thuộc `If b`, `Else z` thuộc `If a`). Vòng lặp được đọc một lượt theo thứ tự.
  - Biến không biết giá trị, lời gọi hàm, phần tử mảng là giá trị runtime. Chuỗi không gán vào biến (tham số `MsgBox`, `ExecuteSQL(...)`) là câu riêng, không ghép với SQL khác.
- Trong câu SQL, string literal `'...'` và comment `--`, `/* */` bị bỏ qua khi tìm keyword.
- SQL truyền qua tham số sang procedure khác (ví dụ một hàm `ExecSql(strSQL)` dùng chung) được ghi ở nơi tạo chuỗi, không ở nơi thực thi.
- Đọc sequence (`SELECT seq.NEXTVAL FROM DUAL`) không sinh bảng.
- Tên bảng trong `sqlTables`/`crud` giữ như trong source, chữ hoa (chỉ nhận identifier không có dấu nháy kép, vốn không phân biệt hoa thường). `HAN01.KMTANT` và `KMTANT` là hai dòng.

### 4.1. Mapping tên bảng (`table-name-v1`)

- Inventory ghi `tableNames = { version, defaultSchema, status }` để tái lập. CLI nhận `--default-schema <schema>`: schema mà tên không ghi schema resolve tới với kết nối được phân tích (ví dụ user đăng nhập). Không cấu hình thì `status = unconfigured` và chỉ gộp chữ hoa/thường.
- `status = assumed` (mặc định khi có schema): mapping là giả định. Oracle resolve tên không ghi schema theo `CURRENT_SCHEMA` của session (có thể khác user đăng nhập) rồi tới private/public synonym; source không cho biết các điều này. Chỉ dùng `--schema-confirmed` (`status = confirmed`) sau khi người quản lý DB xác nhận.
- Quy tắc: phần tên không có dấu nháy chuyển chữ hoa, phần trong `"..."` giữ nguyên; `<defaultSchema>.X` thành `X`; schema khác giữ nguyên. Hai tên gộp là cùng **tên tham chiếu được giả định**, chưa chứng minh cùng object đích (một tên có thể là synonym).
- Một lần chạy dùng một schema cho mọi program. Corpus có program kết nối bằng user khác thì phải chạy riêng hoặc chờ mapping theo program.

## 5. Complexity v1

Điểm 0–100, tổng 6 phần, mỗi phần theo thang log và có trần:

| Phần         | Input                                                                                              | Trần | Đạt trần khi |
| ------------ | -------------------------------------------------------------------------------------------------- | ---- | ------------ |
| size         | `ownCodeLines`                                                                                     | 30   | 10.000 dòng  |
| decisions    | `decisionPoints`                                                                                   | 20   | 2.000        |
| tables       | số bảng trong `crud`                                                                               | 15   | 30           |
| dynamicSql   | 3 × `metrics.dynamicSql` (tên bảng runtime) + `metrics.concatenatedSql` (SQL ghép giá trị runtime) | 15   | 100          |
| components   | số OCX                                                                                             | 10   | 8            |
| externalApis | số API native gọi tới                                                                              | 10   | 10           |

SQL ghép giá trị cũng là SQL dựng lúc chạy, nhưng nhẹ hơn tên bảng runtime: phần lớn là đổi sang bind parameter và test lại (SQL injection, format ngày/số), còn tên bảng runtime làm CRUD không biết trước. Vì vậy một tên bảng runtime tính bằng 3 câu ghép. `parameterizedSql` (bind `:name`) không vào điểm. Tên phần `dynamicSql` giữ như v0 để inventory cũ vẫn hợp schema.

Mức, so trên điểm đã làm tròn: `low` < 45 ≤ `medium` < 60 ≤ `high` < 70 ≤ `very-high`.

Ngưỡng 45/60 chọn trên VB6 pilot (28/10/2026, `sql-access-v5`): thêm SQL ghép làm điểm cả corpus tăng khoảng 5, nên giữ 40/55 thì 15 program pilot chỉ khớp 9/15; với 45/60 khớp 15/15 và 10 program holdout khớp 7/10. Phân bố 284 program: Low 122, Medium 101, High 52, Very High 9 (điểm 70–79). Đổi công thức phải tăng `complexityVersion`.

**Phạm vi dùng:** phân loại tham khảo. Theo quyết định của người phụ trách (02/11/2026), báo giá nháp ở bước 5 dùng mức complexity làm hệ số effort, người phụ trách rà soát kết quả; không dùng làm số cam kết tự động. Model không đo xử lý file, ghi DB nhiều bảng và transaction/rollback.

v1 không gắn cờ review (`reviewFlags`, mức cao hoặc gần ngưỡng) như v0; trường đó chỉ còn trong inventory v0 và không được report/UI dùng (quyết định của người dùng 28/10/2026).

## 6. Màn hình, report và batch (`screen-report-v1`)

Tất cả là fact từ code/project file, không gọi AI. Trường mới đều optional nên `schemaVersion` giữ `source-inventory-v1`.

### 6.1. Màn hình (画面) và batch

- Màn hình = member kind `form` hoặc `user-document`, đếm theo file thật (`relativePath`), không theo tên. `programs[].screens[]`: `name`, `file`, `shared` (file do ≥ 2 program khai báo), `warnings`. Form không tìm thấy hoặc không phân tích được vẫn đếm, kèm `SCREEN_FILE_MISSING` / `SCREEN_FILE_NOT_ANALYZED` (file là đường dẫn đã khai báo khi chưa resolve được). Đường dẫn khai báo tuyệt đối (ổ đĩa/UNC/gốc) chỉ được che ở phần hiển thị, nhưng định danh không dùng chuỗi đã che: `file` có dạng `<absolute path>/<tên file> [8 hex đầu của SHA-256 đường dẫn gốc đã chuẩn hóa]`, nên hai đường dẫn khác nhau cùng tên file vẫn là hai màn hình, cùng một đường dẫn khai báo hai lần chỉ tính một lần, và không lộ đường dẫn gốc.
- Toàn dự án: số form duy nhất (không phân biệt hoa thường), form dùng chung chỉ tính một lần: `totals.screenReport.screens`, `sharedScreens`.
- `programs[].programType`: `screen` nếu có ít nhất một màn hình; `batch` nếu không có màn hình và `Startup` của `.vbp` là `Sub Main`; còn lại `unknown`. Program có form nhưng startup `Sub Main` vẫn là `screen`. Project không parse được không có các trường này.

### 6.2. Report (帳票)

`programs[].reports[]`: `kind`, `name`, `file`, `line` (null với bằng chứng cấp project), `confidence`, `shared`, `procedureId`, `warnings`, `complexity`. Một dòng cho mỗi (kind, tên, procedure); code ở file dùng chung gắn vào mọi program khai báo file, tổng dự án tính một lần.

| `kind`        | Nhận diện                                                                                                                                 | `confidence`                                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `data-report` | member `designer` có header `Begin {guid} DataReport/ActiveReport… <tên>` trong file (đọc header, chưa parse thiết kế)                    | `detected`                                                                                                                        |
| `crystal`     | chuỗi `"….rpt"` trong code (không tính comment, đoạn trong chuỗi khác)                                                                    | `detected` nếu có file cùng tên (không phân biệt thư mục/hoa thường) trong source, ngược lại `referenced` + `REPORT_FILE_MISSING` |
| `excel`       | `CreateObject("Excel.Application")`, `GetObject(, "Excel.Application")`, `New Excel.Application`                                          | `suspected`                                                                                                                       |
| `print`       | `Printer.Print` / `Printer.EndDoc` / `PrintForm`                                                                                          | `suspected`                                                                                                                       |
| `file-output` | `Open … For Output/Append`                                                                                                                | `suspected`                                                                                                                       |
| `unknown`     | program có reference/OCX báo cáo (Crystal `crystl32`, `craxdrt`, `crviewer`; DataReport `msdbrptr`/`msdatrep`) mà không có dòng cùng loại | `suspected`                                                                                                                       |

`totals.screenReport.reports`: `rows` (số dòng duy nhất, bằng tổng `byKind` và tổng `byLevel`), `counted` (detected + referenced, "báo cáo phát hiện được"), `suspected` (hiển thị riêng, không cộng vào `counted`); `suspectedPrograms` = số program có ít nhất một dòng suspected; `batches` = số program `batch`.

**Report dùng chung (quy tắc gộp duy nhất):** report trong file do nhiều program khai báo có thể được chấm khác nhau ở mỗi program (yếu tố `calls` lấy từ call graph của program đó). Dòng của từng program (`programs[].reports[]`) giữ điểm riêng; mục cấp dự án `totals.screenReport.reportItems[]` là một dòng cho mỗi report, mang **điểm cao nhất** của các program khai báo nó (bằng điểm: program đầu theo thứ tự inventory, không phụ thuộc gì khác), mức tính từ điểm đó, và ghi điểm/mức riêng từng program ở `programs[]` (`{program, level, score}`). Chỉ phân tích tính mục này một lần: tổng theo kind/mức (`byKind`, `byLevel`), danh sách report ở bước 2, sheet `Reports` (cột `projectComplexity*`), báo cáo khách (AR02) và PDF (AR03) đều đọc nó, không gộp lại. Tổng theo mức luôn bằng số dòng theo mức của danh sách. `reportItems` là optional trong schema: inventory lưu trước khi có trường này vẫn hợp lệ và được đọc qua `normalizeScreenReportTotals` (`packages/contracts`), cùng một hàm và cùng quy tắc với analyzer, tính lại cả `reports.rows/counted/suspected/byKind/byLevel` từ danh sách.

Giới hạn: lexical. `file-output` gồm cả ghi log/work file; xuất Excel bằng `Shell` hoặc file CSV không phải `excel`; một `.rpt` được dựng động từ biến không thấy; số mẫu report thật không biết với `suspected`.

### 6.2a. Report theo quy ước Assessment (10/11/2026, `screen-report-v5`; v4 = nhận diện ghi Excel/CSV theo phạm vi biến, connection và lệnh đã tách, §6.2b; v5 = bằng chứng Excel là procedure có ghi, `With` trên connection/recordset Excel)

Các dòng ở 6.2 là **dấu hiệu** (một chuỗi `.rpt` trong một procedure, một `Printer.Print`, một `Open ... For Output`), không phải số report: cùng `Invoice.rpt` ở hai procedure là hai dòng. Mọi chỗ hiển thị và xuất báo cáo dùng `deriveReportSummary()` (contracts, `report-templates.ts`), suy ra từ các dòng đã lưu (inventory cũ vẫn đọc được; `subkind`, `excludeReason` và điểm theo procedure cho in/CSV cần phân tích lại với `screen-report-v3`). Tổng `counts.total` là **số đơn vị đầu ra theo quy ước Assessment**, không phải số báo cáo nghiệp vụ; nhãn: vi "Report theo quy ước Assessment", ja 「帳票数（算定基準による）」. Tổng = Crystal/DataReport + in bằng code + xuất CSV/Excel:

1. **Crystal / DataReport** (`origin: crystal`): một đơn vị cho mỗi mẫu. Định danh (`identity`):
   - `path`: khi chuỗi trong code có thư mục (ví dụ `"sales\Detail.rpt"`, `"reports/Detail.rpt"`), khóa = đường dẫn chuẩn hóa (bỏ `./` đầu, `\` thành `/`, không phân biệt hoa thường). `sales/Detail.rpt` và `stock/Detail.rpt` là hai mẫu.
   - `name`: khi code chỉ ghi tên file, kể cả `App.Path & "\Detail.rpt"` (dấu phân cách đầu là thư mục ứng dụng, không xác định), khóa = tên file, theo giả định cùng tên là cùng mẫu.
   - Một mẫu khóa `name` chỉ được gộp vào mẫu khóa `path` khi tên file trùng và trên toàn dự án chỉ có **một** đường dẫn cùng tên file; có từ hai đường dẫn trở lên thì mẫu `name` đứng riêng. Đường dẫn tuyệt đối (ổ đĩa, UNC) không được lưu (analyzer chỉ giữ tên file) nên khóa là `name`.
   - DataReport: khóa là file `.dsr`.
   `status`: `design-file` (có file thiết kế trong source) hoặc `missing-file`. `REPORT_FILE_MISSING` chỉ ghi 設計ファイルなし. Tên report ghép chuỗi lúc chạy không nhận ra nên không thành report. `counts.identityPath` / `identityName` = số mẫu Crystal theo từng loại khóa.
2. **In bằng code** (`origin: print`): một đơn vị cho mỗi **file chứa code** (`.frm`, `.bas`, `.cls`) có lệnh in trực tiếp (`Printer.Print`, `prn_*`…); nhiều lệnh hay nhiều procedure trong file vẫn là một. Đây là đơn vị quy đổi, không phải số mẫu thực tế (một file in nhiều chứng từ vẫn tính một); file `.bas` dùng chung được nhiều form gọi vẫn là một.
3. **Xuất CSV/Excel** (`origin: export`): một đơn vị cho mỗi file chứa code có **ghi** Excel hoặc xuất CSV. Excel chỉ tính khi có lời gọi/phép gán GHI trên đối tượng hoặc connection Excel đã xác định (quy tắc, bộ mẫu chấp nhận và giới hạn đã biết: §6.2b); chỉ mở/đọc (`Workbooks.Open`, chuỗi `.xls`, ADO `SELECT`, `Open … For Input`) không tính. CSV (`subkind: csv`): đường dẫn có `.csv`, hoặc `Write #h` / `Print #h` ngăn giá trị bằng `","` vào **đúng handle `h`** của lệnh `Open … For Output/Append As #h` còn mở trong cùng procedure (handle số hoặc biến từ `FreeFile`; `Close #h` hoặc mở lại handle thì không còn).

**Chồng lấp:** ba cách được đếm riêng. Crystal/DataReport tính theo từng mẫu (không giới hạn theo file; một mẫu chỉ một lần trong dự án), in và xuất CSV/Excel mỗi loại tối đa 1 đơn vị cho mỗi file. Ví dụ: file gọi 2 mẫu Crystal + in + xuất CSV = 2 + 1 + 1 = 4 (nếu 2 mẫu chưa được tính ở file khác); file vừa in vừa xuất là 2. `counts.overlapFiles` = số file có đơn vị ở từ hai cách trở lên (chỉ để đối chiếu).

**Không đếm:** ghi file không phải CSV/Excel (liệt kê riêng ở `dataFiles`, `counts.dataFiles`); thư viện report chỉ khai báo OCX không có mẫu (`unknown`, nằm trong `dataFiles`); ghi log/file tạm theo quy tắc nhận diện (`counts.excluded`): đường dẫn (biểu thức giữa `Open` và `For`) có từ `log`, `tmp`, `temp`, `debug`, `err`, `error`, `trace` (tách theo chữ hoa/thường và ký tự không phải chữ), hoặc tên file kết thúc bằng `log`/`tmp`/`temp` (trừ `catalog`, `dialog`…); `excludeReason`: `log` | `temp` | `debug` | `error`. Quy tắc dựa trên từ trong đường dẫn nên không bảo đảm loại hết; tên biến/file không có các từ trên vẫn là file dữ liệu.

**Độ phức tạp:** tính cho cả ba loại từ code tạo report, chưa gồm thiết kế layout. Crystal chấm trên procedure gọi report (tối thiểu `medium` vì file thiết kế chưa phân tích); in/CSV chấm trên procedure thực hiện lệnh in/xuất; report lấy mức cao nhất của các nơi dùng.

**Cơ sở tính (một nguồn):** `REPORT_COUNTING_BASIS` (`packages/contracts/src/report-counting-basis.ts`, vi + ja: `template`, `file-unit`, `overlap`, `other-output`, `log-temp`, `complexity`) là nguồn duy nhất cho khối "Cơ sở tính" ở tab Report (bước 2, mở/gập), phần cuối sheet 1 (`算定基準`) của Excel AR02 và phụ lục PDF AR03. Màn hình chỉ giữ nhãn ngắn, không rải câu giả định; sửa luật đếm thì sửa hằng số này.

`programs[].reports[]` thêm `subkind` và `excludeReason` (optional). Dòng dấu hiệu giữ nguyên làm bằng chứng và cho báo cáo kỹ thuật AR01; `totals.screenReport.reports` vẫn là số dấu hiệu (không dùng để hiển thị).

### 6.2b. Nhận diện xuất CSV/Excel: quy tắc, bộ mẫu chấp nhận, giới hạn đã biết

Nhận diện là phân tích **từ vựng** (không chạy code, không có kiểu thật), nên là heuristic có giới hạn. Mục tiêu: ca phổ biến đúng; ca biên ghi rõ là giới hạn.

**Quy tắc (một lượt quét tuần tự, mọi tín hiệu sinh từ lệnh đã tách):**
- **Lệnh:** nối dòng `_`, bỏ comment/chuỗi, tách `:`, `If` một dòng tách thành điều kiện + lệnh sau `Then` + lệnh sau `Else` (lồng nhau); mỗi lệnh giữ số dòng gốc.
- **Phạm vi biến:** biến khai báo trong procedure (`Dim/Static`, tham số, có hoặc không kiểu) là của procedure đó, che biến module cùng tên và bị quên ở `End Sub`. Tên không khai báo trong procedure mà module có khai báo là biến module (một `Set` ở procedure nào cũng đổi loại của nó, theo thứ tự đọc file). Tham số/biến không kiểu hoặc `As Object/Variant` có loại chưa biết (không phải Excel).
- **Loại của tên** = loại khai báo (`As Excel.*`, `As ADODB.Connection`) hoặc lần gán/cấu hình GẦN NHẤT trước lệnh đang xét: `Set x = ...` (Excel nếu từ `CreateObject/GetObject("Excel.Application")`, `New Excel.Application`, `Workbooks.Add/Open` hoặc đối tượng Excel khác; gán lại hoặc `Set x = Nothing` đổi loại), `cn.Open`/`cn.ConnectionString` (Excel khi chuỗi có `Excel 8.0`, `Extended Properties=Excel` hoặc `.xls`; mở lại bằng chuỗi khác thì thành connection thường), `rs.Open ..., cn` / `cmd.ActiveConnection = cn` / `Set rs.ActiveConnection = cn` (recordset/command lấy loại của connection tại lúc đó, đổi khi cấu hình lại). Chuỗi kết nối trong biến/hằng: tra trong procedure rồi module.
- **Ghi Excel** chỉ tính là một LỜI GỌI/phép gán ghi: `Workbooks.Add`; `.SaveAs/.Save` và gán ô/range/`.Value` trên đối tượng Excel (hoặc trong `With` trên nó); trên connection Excel: `Execute`/`Open` của INSERT/UPDATE/DELETE chạy trên connection đó hoặc recordset/command gắn với nó (command theo `CommandText`), và `AddNew/Update/Delete/UpdateBatch` của recordset mở trên connection Excel. In chuỗi SQL, hoặc biến connection cùng câu với SQL (`Debug.Print cn.State, sql`) không phải lời gọi. Ghi trên đối tượng Excel chỉ biết qua khai báo (tham số `As Excel.Workbook`) sinh một tín hiệu Excel ngay tại dòng ghi đầu tiên của file.
- **CSV:** `Write #h` hoặc `Print #h` có chuỗi `","` ngăn giá trị vào đúng `Open … For Output/Append As #h` còn mở trong procedure (handle số hoặc biến `FreeFile`); `Close #h`, mở lại handle hoặc hết procedure thì quên; đường dẫn có `.csv` là CSV. File log/tmp/debug/error (theo từ trong đường dẫn) bị loại trừ và không thành CSV.

**Bộ mẫu chấp nhận:** `apps/api/src/modules/analysis/vb6/vb6-report-signals.acceptance.test.ts` (69 ca và 3 ca bằng chứng ghi, đi qua inventory → tổng report): Excel automation (CreateObject/GetObject/New, Workbooks.Add/Open, SaveAs/Save, gán Cells/Range/Value, With, tham số `As Excel.*`, biến module Set ở procedure khác, If một dòng), ADO Excel (chuỗi kết nối Excel kể cả hằng module, Execute INSERT/UPDATE, biến SQL, recordset AddNew/Update, command CommandText, đọc SELECT không tính, đổi connection/ConnectionString/ActiveConnection), CSV (Open For Output/Append + Print #/Write #, theo handle và FreeFile, If một dòng, `:`, log/tmp loại trừ, Open For Input), in bằng Printer/PrintForm, Crystal `.rpt` (một và nhiều mẫu, trong comment), và các ca âm (Recordset.Save, control.Value, check box Value, grid.Cells, Debug.Print, Picture1.Print, UPDATE DB thường, biến cùng tên ở procedure khác, tham số không kiểu che biến module). Ca mới được thêm vào đây khi gặp pattern phổ biến hoặc ca làm đổi số pilot.

**Giới hạn đã biết** (S = có thể SÓT, N = có thể NHẦM):
- Đối tượng Excel truyền qua tham số không khai `As Excel.*` (Object/Variant): S.
- Biến Excel/connection nằm trong mảng hoặc collection: S.
- Đối tượng/connection lấy từ giá trị trả về của hàm: S.
- Connection string ghép từ nhiều biến, đọc từ file/registry (`GetSetting`): S (không tính).
- SQL ghép động không bắt đầu bằng INSERT/UPDATE/DELETE: S.
- Connection mở ở file khác (module khác) rồi dùng ở file này: S (theo dõi theo file).
- Biến module bị `Set` ở nhiều procedure với loại khác nhau: loại là lần gán cuối theo thứ tự đọc file, có thể S hoặc N.
- Code không chạy tới (nhánh chết, procedure không được gọi) vẫn được tính: N (phân tích tĩnh).
- Biến không khai báo (không `Option Explicit`) trùng tên biến module ở procedure khác: có thể N.
- `With` chứa nhiều cấp đối tượng lồng nhau: S.
- Khối `With Printer ... End With` (lệnh bắt đầu bằng dấu chấm): S. `With cn` / `With rs` (biến trần): lệnh `.Execute`/`.Open`/`.AddNew`/`.Update`/`.Delete`/`.UpdateBatch` được đọc như `cn.` / `rs.` theo loại hiện tại của biến; `With` trên biểu thức (`With a.b`) chỉ nhận đối tượng Excel: S.
- ProgID có số phiên bản (`Excel.Application.8`): S (chỉ nhận `Excel.Application`).
- `ActiveWorkbook.SaveAs` không có tiền tố đối tượng Excel đã biết: S.
- `SELECT … INTO` / `INSERT INTO [Excel 8.0;…]` chạy trên connection thường (đích Excel nằm trong câu SQL): S.
- Tham số không có tiền tố `Excel.` như `As Sheets` / `As Range`: S (chỉ nhận `Workbook(s)`/`Worksheet(s)` không tiền tố).
- `CreateObject("ADODB.Connection")` (late-bound) chưa được phân loại là connection: recordset mở trên nó vẫn giữ loại Excel đã gán trước đó: N.
- Chuỗi `".rpt"` nằm trong phép so sánh (ví dụ `If Right(f, 4) = ".rpt"`) vẫn cho tín hiệu Crystal: N.
- File tên `ErrorList.csv` bị loại trừ như log (từ `Error` trong tên): S (nhãn N trong ghi chú review là chưa đúng: file bị bỏ, không bị tính thêm).
- Biến đích của `With` bị gán lại trong chính khối (`Set cn = ...` giữa `With cn`): lệnh `.Member` sau đó đọc theo loại HIỆN TẠI của biến; `With` chỉ theo dõi theo tên, không theo phạm vi: có thể S hoặc N.
- Ghi Excel ở mức module (ví dụ khai báo toàn cục `Public xl As New Excel.Application` rồi gán ô ngoài procedure) thuộc "procedure 0": bằng chứng lùi về dòng ghi đầu tiên của file. Số report không đổi; dòng và procedure chấm độ phức tạp có thể không phải procedure mong đợi.
- Bằng chứng (dòng, procedure chấm độ phức tạp) của một file xuất Excel chỉ lấy từ procedure CÓ ghi; `Workbooks.Open`/`CreateObject` ở procedure chỉ đọc bị bỏ, số report theo file không đổi. Nếu đối tượng khởi tạo ở procedure khác (biến module) thì dòng ghi đầu tiên là bằng chứng. Ghi qua tham số/biến module ở procedure khác với nhiều procedure ghi: mức phức tạp lấy cao nhất trong các procedure ghi.
- Ghi Excel qua mẫu (`Workbooks.Open("t.xlt")` rồi `CopyFromRecordset`/`Paste`/`PasteSpecial`/gán `.Formula`/`.Value`) được tính; chỉ định dạng (`.Interior.Color`, `.Font.Bold`, `.ColumnWidth`) không được tính.

### 6.3. Độ phức tạp từng report (`report-complexity-v2-draft`)

Phân loại độ khó migrate (không phải effort; phân loại này không được dùng làm hệ số tính effort). Hằng `REPORT_COMPLEXITY_VERSION` nằm ở contracts (`report-templates.ts`), cùng chỗ với `isScreenReportOutdated`.

**Phạm vi chấm (v2, 11/11/2026).** Một report được chấm **một lần theo đơn vị đếm** (cùng quy ước với 6.2a): mẫu Crystal là một đơn vị dù dùng ở nhiều nơi; in bằng code và xuất CSV/Excel là một đơn vị cho mỗi file và mỗi cách; dòng không tính vào tổng (log, file dữ liệu...) là đơn vị riêng. Tập chấm của một đơn vị gồm các procedure tạo/gọi report (tầng 0) và các procedure được gọi theo call graph **đã phân giải của chính program đang xét** trong **2 tầng** (tầng = đường gọi ngắn nhất, BFS; `A→X→B` và `A→B` cho B tầng 1). Mỗi procedure chỉ tính một lần trong mỗi report; vòng gọi (`A→B→A`, `A→A`) dừng ở procedure đã thăm. Lời gọi chưa phân giải (trùng tên, native `Declare`, `CallByName`) không được theo và không đổi điểm; số lượng được ghi vào `complexity.scope.unresolvedCalls`. **Không đi lên handler:** procedure chuẩn bị dữ liệu gọi trước ở nơi khác (`LoadData()` rồi `PrintReport()` ở cùng handler) không thuộc tập chấm khi không phải callee của procedure tạo report; giới hạn này được nêu trong "Cơ sở tính". Procedure dùng chung giữa nhiều report được tính đủ trong từng report (không chia).

**Gộp rồi chấm một lần.** Dữ liệu đo của cả tập được gộp trước, rồi mới so với ngưỡng (2 procedure mỗi cái 3 nhánh cho 6 nhánh, khác với hai điểm 0): rẽ nhánh và dòng thực thi cộng theo procedure; bảng là hợp tên (không phân biệt hoa thường); SQL động/ghép chuỗi là hợp theo vị trí `file:dòng`; lời gọi là hợp các cặp (caller, callee) đã phân giải mà caller thuộc tập chấm. Sáu yếu tố, mỗi yếu tố có bậc điểm trong `DEFAULT_REPORT_COMPLEXITY_CONFIG` (đổi ngưỡng thì đổi version): số decision point, dòng Executable, số bảng truy cập, SQL động/ghép chuỗi, lời gọi, **mật độ lệnh in/vẽ** (`printDensity`).

**Mật độ lệnh in/vẽ** đếm số **lệnh** (không nhân vòng lặp) hướng tới đối tượng in: đối tượng `Printer`/`Printers(...)`, biến khai báo `As Printer`/`DataReport`/`CRAXDRT.Report` hoặc `Set` từ `Printer`, và `With` trên các đối tượng đó. Ba nhóm: in nội dung (`Print`, `PrintForm`), vẽ đường/khung (`Line`, `Circle`, `PSet`), đặt vị trí (`CurrentX/Y`, `TextWidth/Height`, chỉ ghi nhận). Không đếm `Debug.Print`, `Me.Print`, `Picture1.Print`, `Print`/`Line`/`Circle`/`PSet`/`CurrentX` của form hoặc control khác, `Print #n`. Ngưỡng ban đầu: in nội dung 20/60/120 lệnh → 1/2/3 điểm; vẽ đường/khung 10/30/60 → 1/2/3; điểm yếu tố = `min(3, in + vẽ)`; đặt vị trí không cộng điểm. Ngưỡng ban đầu này chưa được hiệu chỉnh bằng pilot.

Bằng chứng lưu theo report: `complexity.scope` = `{ procedures: [{ id, tier: 0|1|2 }], unresolvedCalls, printOps: { content, drawing, position } }`, optional để inventory v1 vẫn parse được. Inventory v1 không bị tính lại; `isScreenReportOutdated` trả `true` khi `screenReportVersion` **hoặc** `reportComplexityVersion` khác phiên bản hiện hành, nên bước 2, Excel và PDF cảnh báo cần phân tích lại. Hiển thị: bước 2 (chi tiết report) hiện procedure được chấm theo tầng, điểm và giá trị đo từng yếu tố, số lệnh in/vẽ, số lời gọi chưa phân giải; danh sách, Excel và PDF chỉ hiện mức.

**Giới hạn đã biết của v2.** (1) Yếu tố `calls` đếm mọi cặp (caller, callee) đã phân giải mà caller thuộc tập chấm, nên cặp từ procedure tầng 2 xuống tầng 3 (callee không thuộc tập) vẫn được đếm: yếu tố này hơi vượt 2 tầng; các yếu tố còn lại chỉ đo procedure trong tập. Giữ như vậy có chủ ý và ghi rõ ở đây. (2) Mật độ in/vẽ chỉ nhận biết máy in/report object qua `Printer`, `Printers(...)`, biến khai báo kiểu rõ (`As Printer`/`DataReport`/Crystal `Report`) hoặc `Set` từ `Printer` trong cùng module/procedure; bỏ sót máy in khai báo ở module khác (`Public p As Printer` trong `.bas`), biến `Variant` không có `As`, và đối tượng lấy từ hàm trả về. (3) Module dùng chung được lưu `scope` lặp theo từng program, chỉ tốn dung lượng inventory.

- `suspected` hoặc không xác định được procedure → `level: unrated`, `score: null`, `reason` `SUSPECTED` / `NO_PROCEDURE`. Không bao giờ ghi `low` thay cho thiếu dữ liệu. DataReport (`.dsr`) chưa có cách nối với procedure nên là `unrated` + `NO_PROCEDURE`.
- Thiết kế report chưa phân tích (`.rpt`, `.dsr`): thêm factor `design-not-analyzed` (0 điểm) và mức tối thiểu `medium` (`reason: DESIGN_NOT_ANALYZED_FLOOR` khi bị nâng).
- Khác với v1 (chấm từng dòng tín hiệu trên procedure chứa nó): các dòng của cùng một đơn vị nay có cùng điểm; ở mức project, report của file dùng chung vẫn lấy điểm cao nhất giữa các program.

## 7. Chạy

```text
npm run build -w @portal/contracts && npm run build -w @portal/api
node apps/api/dist/cli/analyze-source.js --root <thư mục source> --out <inventory.json> [--summary <programs.csv>] [--default-schema <schema> [--schema-confirmed]]
```

CLI chỉ đọc source, bỏ qua symlink và file trên 16 MB (ghi vào `skipped`). Analyze run (PF07/B08) dùng cùng thư viện trên snapshot; `skipped` thêm lý do `unreadable`, `special`, `invalid-name` của snapshot và không liệt kê file ngoài loại source của profile. Trước khi đọc và ngay trước khi ghi, CLI so đường dẫn vật lý (đã giải symlink/junction, kể cả thư mục cha chưa tồn tại) và từ chối khi output nằm trong thư mục source, là hard link tới file source vừa đọc, hoặc `--out` và `--summary` là cùng một file (so cả path và file ID). Output được ghi vào file tạm cùng thư mục rồi rename đè, không ghi xuyên qua file cũ. `--summary` ghi một dòng mỗi program (CSV UTF-8 có BOM để mở bằng Excel), có cả cột trước mapping (`tables`, `crud`, `complexityScore`) và sau mapping (`normalizedTables`, `normalizedCrud`, `normalizedComplexityScore`) cùng cột `tableNameMapping` ghi schema và trạng thái; ô text bắt đầu bằng `=`, `+`, `-`, `@`, tab hoặc CR được thêm `'` phía trước để Excel không hiểu thành công thức. JSON vẫn là nguồn chuẩn.
