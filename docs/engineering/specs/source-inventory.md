# Đặc tả Source Inventory (`source-inventory-v1`)

**Gate:** FEATURE:analysis. Inventory là output tĩnh của Analyze, không gọi AI. Agent Understand, report và UI đọc file này. Schema máy đọc được nằm ở [`packages/contracts/src/source-inventory.schema.ts`](../../../packages/contracts/src/source-inventory.schema.ts) (TypeBox = JSON Schema); test của API kiểm inventory sinh ra khớp schema.

## 1. Version

| Trường | Giá trị hiện tại | Ý nghĩa |
|---|---|---|
| `schemaVersion` | `source-inventory-v1` | Hình dạng JSON. Thêm trường optional giữ version; đổi tên, bỏ hoặc đổi nghĩa trường phải tăng version. |
| `metricVersion` | `vb6-physical-code-v1` | Cách đếm dòng, theo [source-analysis](source-analysis.md) §4. |
| `sqlAccessVersion` | `sql-access-v0` | Cách trích bảng/CRUD. |
| `callGraphVersion` | `call-graph-v0` | Cách nối lời gọi procedure. |
| `complexityVersion` | `complexity-v0-draft` | Công thức điểm complexity, bản nháp chờ TL chốt. |

Số liệu khác version không được trộn trong cùng report.

## 2. Theo file (`files[]`)

- `manifest`: path, vai trò, hash, encoding, số dòng theo [source-analysis](source-analysis.md) §2–3.
- `analysis` (file code): `counters`, `procedures[]` (ID `<path>#<kind>:<name>`, `visibility`, dòng bắt đầu/kết thúc, `codeLines`, `decisionPoints`), `fileLevelCodeLines`.
- `sqlTables[]`: bảng, thao tác `C|R|U|D|X`, dòng, procedure. `X` là DDL trên bảng (CREATE/DROP/TRUNCATE/ALTER TABLE), thường gặp với bảng tạm.
- `dynamicSql[]`: vị trí tên bảng là biểu thức runtime. Parser gắn cờ, không đoán tên bảng.
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

- Tìm tên procedure theo identifier ngoài string/comment. Lời gọi qua object (`Form1.Foo`, `obj.Method`) không nối được. Biến cục bộ trùng tên procedure global có thể bị nối nhầm.
- SQL chỉ lấy từ string literal trong cùng procedure, theo thứ tự dòng. SQL truyền qua tham số sang procedure khác (ví dụ một hàm `ExecSql(strSQL)` dùng chung) được ghi ở nơi tạo chuỗi, không ở nơi thực thi.
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

CLI chỉ đọc source, bỏ qua symlink và file trên 16 MB (ghi vào `skipped`), từ chối ghi output vào trong thư mục source. `--summary` ghi một dòng mỗi program (CSV UTF-8 có BOM để mở bằng Excel). JSON vẫn là nguồn chuẩn.
