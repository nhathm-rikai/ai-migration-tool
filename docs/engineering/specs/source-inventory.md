# Đặc tả Source Inventory (`source-inventory-v1`)

**Gate:** FEATURE:analysis. Inventory là output tĩnh của Analyze, không gọi AI. Agent Understand, report và UI đọc file này. Schema máy đọc được nằm ở [`packages/contracts/src/source-inventory.schema.ts`](../../../packages/contracts/src/source-inventory.schema.ts) (TypeBox = JSON Schema); test của API kiểm inventory sinh ra khớp schema.

## 1. Version

| Trường | Giá trị hiện tại | Ý nghĩa |
|---|---|---|
| `schemaVersion` | `source-inventory-v1` | Hình dạng JSON. Thêm trường optional giữ version; đổi tên, bỏ hoặc đổi nghĩa trường phải tăng version. |
| `metricVersion` | `vb6-physical-code-v1` | Cách đếm dòng, theo [source-analysis](source-analysis.md) §4. |
| `procedureLinesVersion` | `vb6-procedure-lines-v1` | Breakdown Physical/Code/Executable/Comment/Blank/SQL theo procedure, [source-analysis](source-analysis.md) §4.1. Optional: inventory cũ không có. |
| `sqlAccessVersion` | `sql-access-v5` | Cách dựng chuỗi SQL (theo biến, nhánh, property), trích bảng/CRUD và đếm SQL ghép giá trị runtime/bind parameter. v5 thêm `concatenatedSql`/`parameterizedSql` và đọc `vbCrLf`, `vbNewLine`, `vbCr`, `vbLf`, `vbTab` là khoảng trắng thay vì giá trị runtime. |
| `callGraphVersion` | `call-graph-v2` | Cách nối lời gọi procedure, có đệ quy và hậu tố `$`. |
| `complexityVersion` | `complexity-v1` | Công thức điểm complexity (mục 5), chỉ là phân loại tham khảo. Inventory cũ ghi `complexity-v0` hoặc `complexity-v0-draft` (cùng công thức v0: SQL động chỉ đếm tên bảng runtime, ngưỡng 40/55, không có `very-high`). |
| `screenReportVersion` | `screen-report-v2` (v1: inventory cũ, vẫn đọc được) | Luật đếm 画面・帳票・バッチ (mục 6). Optional: inventory cũ không có, và khi đó mọi nơi hiển thị "chưa có dữ liệu, cần phân tích lại", không hiện 0. |
| `reportComplexityVersion` | `report-complexity-v1-draft` | Phân loại tham khảo độ phức tạp từng report (mục 6.3), không phải effort. Optional như trên. |
| `tableNames.version` | `table-name-v1` | Cách gộp tên bảng cho góc nhìn sau mapping (mục 4.1). |

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

| Phần | Input | Trần | Đạt trần khi |
|---|---|---|---|
| size | `ownCodeLines` | 30 | 10.000 dòng |
| decisions | `decisionPoints` | 20 | 2.000 |
| tables | số bảng trong `crud` | 15 | 30 |
| dynamicSql | 3 × `metrics.dynamicSql` (tên bảng runtime) + `metrics.concatenatedSql` (SQL ghép giá trị runtime) | 15 | 100 |
| components | số OCX | 10 | 8 |
| externalApis | số API native gọi tới | 10 | 10 |

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

| `kind` | Nhận diện | `confidence` |
|---|---|---|
| `data-report` | member `designer` có header `Begin {guid} DataReport/ActiveReport… <tên>` trong file (đọc header, chưa parse thiết kế) | `detected` |
| `crystal` | chuỗi `"….rpt"` trong code (không tính comment, đoạn trong chuỗi khác) | `detected` nếu có file cùng tên (không phân biệt thư mục/hoa thường) trong source, ngược lại `referenced` + `REPORT_FILE_MISSING` |
| `excel` | `CreateObject("Excel.Application")`, `GetObject(, "Excel.Application")`, `New Excel.Application` | `suspected` |
| `print` | `Printer.Print` / `Printer.EndDoc` / `PrintForm` | `suspected` |
| `file-output` | `Open … For Output/Append` | `suspected` |
| `unknown` | program có reference/OCX báo cáo (Crystal `crystl32`, `craxdrt`, `crviewer`; DataReport `msdbrptr`/`msdatrep`) mà không có dòng cùng loại | `suspected` |

`totals.screenReport.reports`: `rows` (số dòng duy nhất, bằng tổng `byKind` và tổng `byLevel`), `counted` (detected + referenced, "báo cáo phát hiện được"), `suspected` (hiển thị riêng, không cộng vào `counted`); `suspectedPrograms` = số program có ít nhất một dòng suspected; `batches` = số program `batch`.

**Report dùng chung (quy tắc gộp duy nhất):** report trong file do nhiều program khai báo có thể được chấm khác nhau ở mỗi program (yếu tố `calls` lấy từ call graph của program đó). Dòng của từng program (`programs[].reports[]`) giữ điểm riêng; mục cấp dự án `totals.screenReport.reportItems[]` là một dòng cho mỗi report, mang **điểm cao nhất** của các program khai báo nó (bằng điểm: program đầu theo thứ tự inventory, không phụ thuộc gì khác), mức tính từ điểm đó, và ghi điểm/mức riêng từng program ở `programs[]` (`{program, level, score}`). Chỉ phân tích tính mục này một lần: tổng theo kind/mức (`byKind`, `byLevel`), danh sách report ở bước 2, sheet `Reports` (cột `projectComplexity*`), báo cáo khách (AR02) và PDF (AR03) đều đọc nó, không gộp lại. Tổng theo mức luôn bằng số dòng theo mức của danh sách. `reportItems` là optional trong schema: inventory lưu trước khi có trường này vẫn hợp lệ và được đọc qua `normalizeScreenReportTotals` (`packages/contracts`), cùng một hàm và cùng quy tắc với analyzer, tính lại cả `reports.rows/counted/suspected/byKind/byLevel` từ danh sách.

Giới hạn: lexical. `file-output` gồm cả ghi log/work file; xuất Excel bằng `Shell` hoặc file CSV không phải `excel`; một `.rpt` được dựng động từ biến không thấy; số mẫu report thật không biết với `suspected`.

### 6.2a. Đếm theo mẫu (10/11/2026, `screen-report-v2`)

Các dòng ở 6.2 là **dấu hiệu** (một chuỗi `.rpt` trong một procedure, một `Printer.Print`, một `Open ... For Output`), không phải số mẫu report: cùng `Invoice.rpt` ở hai procedure là hai dòng. Cái khách hỏi là số mẫu, nên mọi chỗ hiển thị và xuất báo cáo dùng hai danh sách tách rời do `deriveReportSummary()` (contracts, `report-templates.ts`) suy ra từ các dòng đã lưu (nên inventory cũ cũng đọc được, không cần phân tích lại):

1. **Mẫu report** (`templates`, cấp dự án): khử trùng toàn dự án theo khóa chuẩn hóa: Crystal = tên file `.rpt` bỏ thư mục, không phân biệt hoa thường; DataReport = file `.dsr` thật. Mỗi mẫu có `status`: `design-file` (có file thiết kế trong source) hoặc `missing-file` (chỉ có tên trong code, cần xin khách file); `usages[]` (file, dòng, procedure), `programs[]`, độ phức tạp = mức cao nhất của các nơi dùng. X = A (`design-file`) + B (`missing-file`). `REPORT_FILE_MISSING` là danh sách mẫu B, mỗi mẫu một lần. Tên report động (ghép chuỗi) không được analyzer nhận ra nên không thành mẫu; chỗ gọi runtime mà không có mẫu nào thành một chức năng `unknown`.
2. **Chức năng in/xuất cần xác nhận** (`functions`): các dấu hiệu `print`, `excel` (`Excel.Application` hoặc `Shell "…EXCEL.EXE"`), `file-output` (`subkind: csv` khi đường dẫn có `.csv`) và `unknown`, gom theo (file, procedure) thành một chức năng, mỗi chức năng có bằng chứng file:dòng. **Không cộng vào X.** Ghi file vào log/file tạm bị loại: đường dẫn (biểu thức giữa `Open` và `For`) có từ `log`, `tmp`, `temp`, `debug`, `err`, `error`, `trace` (tách theo chữ hoa/thường và ký tự không phải chữ), hoặc một tên file kết thúc bằng `log`/`tmp`/`temp` (trừ `catalog`, `dialog`... ), được ghi `excludeReason` (`log` | `temp` | `debug` | `error`: loại, không phải tên khớp) và đếm riêng ở `excludedFunctions`. Giới hạn: tên biến/file không chứa các từ đó vẫn được tính là chức năng cần xác nhận.

`programs[].reports[]` thêm `subkind` và `excludeReason` (optional). Dòng dấu hiệu cũ giữ nguyên làm bằng chứng và cho báo cáo kỹ thuật AR01; `totals.screenReport.reports` vẫn là số dấu hiệu (không dùng để hiển thị).

### 6.3. Độ phức tạp từng report (`report-complexity-v1-draft`)

Phân loại tham khảo (không phải effort). Chấm trên procedure chứa dòng report: số decision point, dòng Executable, số bảng truy cập, SQL động/ghép chuỗi (`dynamicSql` + `concatenatedSql`), số procedure khác được tham chiếu. Mỗi yếu tố cộng điểm theo bậc trong `DEFAULT_REPORT_COMPLEXITY_CONFIG` (`screen-report.ts`); `complexity = { version, level, score, factors[], reason? }`, tổng `points` của `factors` bằng `score`. `level`: `low` < 3 ≤ `medium` < 6 ≤ `high` < 9 ≤ `very-high` (theo hằng số, đổi hằng số là đổi mức và phải đổi version).

- `suspected` hoặc không xác định được procedure → `level: unrated`, `score: null`, `reason` `SUSPECTED` / `NO_PROCEDURE`. Không bao giờ ghi `low` thay cho thiếu dữ liệu.
- Thiết kế report chưa phân tích (`.rpt`, `.dsr`): thêm factor `design-not-analyzed` (0 điểm) và mức tối thiểu `medium` (`reason: DESIGN_NOT_ANALYZED_FLOOR` khi bị nâng). `.dsr` không có procedure gọi nên là `unrated` + factor đó.

## 7. Chạy

```text
npm run build -w @portal/contracts && npm run build -w @portal/api
node apps/api/dist/cli/analyze-source.js --root <thư mục source> --out <inventory.json> [--summary <programs.csv>] [--default-schema <schema> [--schema-confirmed]]
```

CLI chỉ đọc source, bỏ qua symlink và file trên 16 MB (ghi vào `skipped`). Analyze run (PF07/B08) dùng cùng thư viện trên snapshot; `skipped` thêm lý do `unreadable`, `special`, `invalid-name` của snapshot và không liệt kê file ngoài loại source của profile. Trước khi đọc và ngay trước khi ghi, CLI so đường dẫn vật lý (đã giải symlink/junction, kể cả thư mục cha chưa tồn tại) và từ chối khi output nằm trong thư mục source, là hard link tới file source vừa đọc, hoặc `--out` và `--summary` là cùng một file (so cả path và file ID). Output được ghi vào file tạm cùng thư mục rồi rename đè, không ghi xuyên qua file cũ. `--summary` ghi một dòng mỗi program (CSV UTF-8 có BOM để mở bằng Excel), có cả cột trước mapping (`tables`, `crud`, `complexityScore`) và sau mapping (`normalizedTables`, `normalizedCrud`, `normalizedComplexityScore`) cùng cột `tableNameMapping` ghi schema và trạng thái; ô text bắt đầu bằng `=`, `+`, `-`, `@`, tab hoặc CR được thêm `'` phía trước để Excel không hiểu thành công thức. JSON vẫn là nguồn chuẩn.
