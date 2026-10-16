# Đặc tả Source Inventory (`source-inventory-v1`)

**Gate:** FEATURE:analysis. Inventory là output tĩnh của Analyze, không gọi AI. Agent Understand, report và UI đọc file này. Schema máy đọc được nằm ở [`packages/contracts/src/source-inventory.schema.ts`](../../../packages/contracts/src/source-inventory.schema.ts) (TypeBox = JSON Schema); test của API kiểm inventory sinh ra khớp schema.

## 1. Version

| Trường | Giá trị hiện tại | Ý nghĩa |
|---|---|---|
| `schemaVersion` | `source-inventory-v1` | Hình dạng JSON. Thêm trường optional giữ version; đổi tên, bỏ hoặc đổi nghĩa trường phải tăng version. |
| `metricVersion` | `vb6-physical-code-v1` | Cách đếm dòng, theo [source-analysis](source-analysis.md) §4. |
| `sqlAccessVersion` | `sql-access-v2` | Cách dựng chuỗi SQL (theo biến, nhánh, property) và trích bảng/CRUD. |
| `callGraphVersion` | `call-graph-v2` | Cách nối lời gọi procedure, có đệ quy và hậu tố `$`. |
| `complexityVersion` | `complexity-v0-draft` | Công thức điểm complexity, bản nháp chờ TL chốt. |

Số liệu khác version không được trộn trong cùng report.

## 2. Theo file (`files[]`)

- `manifest`: path, vai trò, hash, encoding, số dòng theo [source-analysis](source-analysis.md) §2–3.
- `analysis` (file code): `counters`, `procedures[]` (ID `<path>#<kind>:<name>`, `visibility`, dòng bắt đầu/kết thúc, `codeLines`, `decisionPoints`), `fileLevelCodeLines`.
- `sqlTables[]`: bảng, thao tác `C|R|U|D|X`, dòng, procedure. `X` là DDL trên bảng (CREATE/DROP/TRUNCATE/ALTER TABLE), thường gặp với bảng tạm.
- `dynamicSql[]`: tên bảng là giá trị runtime, hoặc dính liền với giá trị runtime (`"FROM ORD_" & tenant`, `"UPDATE HAN01." & t`). Parser gắn cờ, không đoán tên bảng.
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
- `crud[]`: bảng × thao tác từ code riêng và từ procedure shared **gọi tới được** từ code riêng. `evidence` là vị trí gặp đầu tiên. `viaSharedOnly` cho biết bảng chỉ được truy cập qua module dùng chung.
- `externalApis[]`: API native thực sự được gọi tới.
- `metrics`: số file/dòng/procedure riêng, decision points, số procedure shared gọi tới được, số bảng, SQL động, số component (OCX) trong project, số API native.
- `complexity`: xem mục 5.

## 4. Giới hạn của phân tích lexical

- Tìm tên procedure theo identifier ngoài string/comment, bỏ qua dòng khai báo (`Sub/Function/Property/Declare`). Trong chính procedure `F`, `F = ...` và `F` đứng trơn trong biểu thức là giá trị trả về; `F(...)`, `Call F` và `F args` ở đầu statement là lời gọi đệ quy. Ký tự kiểu `$` không phân biệt (`F$()` gọi `Function F$`). Lời gọi qua object (`Form1.Foo`, `obj.Method`) không nối được. Biến cục bộ trùng tên procedure global có thể bị nối nhầm.
- Chuỗi SQL được dựng lại theo từng statement (đã nối dòng ` _`), trong một procedure:
  - Literal nối bằng `&`/`+` được ghép đúng như viết, không chèn khoảng trắng (`"ORD" & "ERS"` là `ORDERS`).
  - `x = "..."` giữ giá trị cho biến `x`; `x = x & ...` nối tiếp; gán lại `x` hoặc hết procedure thì giá trị cũ được phân tích như một câu SQL. Biến chứa phần SQL khác được ghép vào (`s = strSELECT & strFROM`). Property (`obj.SQL = obj.SQL & ...`) được theo dõi như biến.
  - `If/ElseIf/Else` và `Select Case`: mỗi nhánh bắt đầu từ cùng trạng thái, không ghép chữ của hai nhánh loại trừ nhau. Giá trị của từng nhánh được phân tích riêng; sau khối, phần khác nhau giữa các nhánh thành giá trị runtime (bảng ở đó báo `dynamicSql`). Vòng lặp được đọc một lượt theo thứ tự.
  - Biến không biết giá trị, lời gọi hàm, phần tử mảng là giá trị runtime. Chuỗi không gán vào biến (tham số `MsgBox`, `ExecuteSQL(...)`) là câu riêng, không ghép với SQL khác.
- Trong câu SQL, string literal `'...'` và comment `--`, `/* */` bị bỏ qua khi tìm keyword.
- SQL truyền qua tham số sang procedure khác (ví dụ một hàm `ExecSql(strSQL)` dùng chung) được ghi ở nơi tạo chuỗi, không ở nơi thực thi.
- Đọc sequence (`SELECT seq.NEXTVAL FROM DUAL`) không sinh bảng.
- Tên bảng giữ nguyên như trong source (`HAN01.KMTANT` và `KMTANT` là hai dòng). Gộp theo schema mặc định cần quyết định của TL.

## 5. Complexity v0 (bản nháp)

Điểm 0–100, tổng 6 phần, mỗi phần theo thang log và có trần:

| Phần | Input | Trần | Đạt trần khi |
|---|---|---|---|
| size | `ownCodeLines` | 30 | 10.000 dòng |
| decisions | `decisionPoints` | 20 | 2.000 |
| tables | số bảng trong `crud` | 15 | 30 |
| dynamicSql | số SQL động | 15 | 30 |
| components | số OCX | 10 | 8 |
| externalApis | số API native gọi tới | 10 | 10 |

Mức: `low` < 40 ≤ `medium` < 55 ≤ `high`. Ngưỡng được chọn để khớp danh sách Low/Medium/High của 15 program pilot (15/15 khớp trên source thật ngày 15/10/2026). Đây là điểm xuất phát, không phải mô hình đã kiểm chứng: TL chốt trọng số/ngưỡng trước khi dùng cho estimate. Đổi công thức phải tăng `complexityVersion`.

## 6. Chạy

```text
npm run build -w @portal/contracts && npm run build -w @portal/api
node apps/api/dist/cli/analyze-source.js --root <thư mục source> --out <inventory.json> [--summary <programs.csv>]
```

CLI chỉ đọc source, bỏ qua symlink và file trên 16 MB (ghi vào `skipped`). Trước khi đọc và ngay trước khi ghi, CLI so đường dẫn vật lý (đã giải symlink/junction, kể cả thư mục cha chưa tồn tại) và từ chối khi output nằm trong thư mục source, là hard link tới file source vừa đọc, hoặc `--out` và `--summary` là cùng một file (so cả path và file ID). Output được ghi vào file tạm cùng thư mục rồi rename đè, không ghi xuyên qua file cũ. `--summary` ghi một dòng mỗi program (CSV UTF-8 có BOM để mở bằng Excel); ô text bắt đầu bằng `=`, `+`, `-`, `@`, tab hoặc CR được thêm `'` phía trước để Excel không hiểu thành công thức. JSON vẫn là nguồn chuẩn.
