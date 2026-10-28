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

**Calibration (28/10/2026, `sql-access-v5`, VB6 pilot 284 program):** thêm SQL ghép làm điểm cả corpus tăng khoảng 5, nên giữ ngưỡng 40/55 thì pilot chỉ khớp 9/15. Ngưỡng 45/60 cho 15/15 pilot (danh sách dùng để chọn ngưỡng của v0) và 7/10 holdout. Holdout lệch: NUKO0110 và NUKO0030 (nhãn Medium, tool Low), KUKO0080 (nhãn High, tool Medium); KNRO2040 (lệch ở v0) nay khớp High. Phân bố: Low 122, Medium 101, High 52, Very High 9 (điểm 70–79). Ngưỡng được chọn trên cả 25 program đã có nhãn từ trước, nên đây vẫn là calibration, không phải độ chính xác. `very-high` chưa có nhãn nào: dùng để ưu tiên review, chưa phải mức đã kiểm chứng. Cần tập nhãn mới chưa từng xem (có program ≥ 70) để xác nhận. Đổi công thức phải tăng `complexityVersion`.

**Phạm vi dùng (giữ từ quyết định 23/10/2026 cho v0, approved-limited; v1 do người dùng duyệt 28/10/2026):** chỉ là phân loại tham khảo. Không dùng điểm để tự động tính effort hoặc báo giá. Model không đo xử lý file, ghi DB nhiều bảng và transaction/rollback; các yếu tố này phải được review bổ sung.

`reviewFlags` trên mỗi điểm complexity: `high` (mức High hoặc Very High, model kém tin cậy nhất ở các mức này) và `near-threshold` (điểm chưa làm tròn cách 45, 60 hoặc 70 không quá 3 điểm). Program có cờ phải được người xem trước khi dùng mức (pilot: 117/284). Danh sách ca lệch đã biết là dữ liệu của corpus, đưa vào báo cáo qua `--complexity-review` ([inventory-report](inventory-report.md)), không ghi trong code; danh sách lập cho v0 phải được lập lại cho v1.

## 6. Chạy

```text
npm run build -w @portal/contracts && npm run build -w @portal/api
node apps/api/dist/cli/analyze-source.js --root <thư mục source> --out <inventory.json> [--summary <programs.csv>] [--default-schema <schema> [--schema-confirmed]]
```

CLI chỉ đọc source, bỏ qua symlink và file trên 16 MB (ghi vào `skipped`). Analyze run (PF07/B08) dùng cùng thư viện trên snapshot; `skipped` thêm lý do `unreadable`, `special`, `invalid-name` của snapshot và không liệt kê file ngoài loại source của profile. Trước khi đọc và ngay trước khi ghi, CLI so đường dẫn vật lý (đã giải symlink/junction, kể cả thư mục cha chưa tồn tại) và từ chối khi output nằm trong thư mục source, là hard link tới file source vừa đọc, hoặc `--out` và `--summary` là cùng một file (so cả path và file ID). Output được ghi vào file tạm cùng thư mục rồi rename đè, không ghi xuyên qua file cũ. `--summary` ghi một dòng mỗi program (CSV UTF-8 có BOM để mở bằng Excel), có cả cột trước mapping (`tables`, `crud`, `complexityScore`) và sau mapping (`normalizedTables`, `normalizedCrud`, `normalizedComplexityScore`) cùng cột `tableNameMapping` ghi schema và trạng thái; ô text bắt đầu bằng `=`, `+`, `-`, `@`, tab hoặc CR được thêm `'` phía trước để Excel không hiểu thành công thức. JSON vẫn là nguồn chuẩn.
