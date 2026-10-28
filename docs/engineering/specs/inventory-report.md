# Đặc tả báo cáo inventory theo program (`inventory-report-v1`)

**Gate:** FEATURE:analysis, phần core của export (B14 chưa có API/UI/job). Báo cáo đọc một [source inventory](source-inventory.md) đã sinh và đã validate theo `source-inventory-v1`; **không mở hay parse source lần nữa**. Code: `apps/api/src/modules/inventory-report/`, CLI `apps/api/src/cli/export-inventory-report.ts`.

## 1. Chọn program

- ID program là tên file project bỏ phần mở rộng (`KUN/KUNO0020.vbp` → `KUNO0020`), so không phân biệt hoa thường.
- Mỗi ID phải khớp đúng một project file. ID rỗng, lặp, không khớp hoặc khớp nhiều file → từ chối cả báo cáo, không bỏ qua ngầm.

## 2. Nội dung (JSON và XLSX cùng dữ liệu)

| Bảng (sheet) | Nội dung | Truy vết |
|---|---|---|
| `source` (Summary) | `snapshotHash`, profile, mọi version của inventory (`metricVersion`, `procedureLinesVersion`, decoder, normalization, `sqlAccessVersion`, call graph, complexity, table name) và mapping tên bảng. | Snapshot |
| `programs` | Trạng thái, `complete`, counters theo program, số procedure, tổng Executable/SQL, metrics (gồm `concatenatedSql`, `parameterizedSql`; trống với inventory cũ), complexity raw/normalized, `complexityReviewFlags` (`high`, `near-threshold`, `known-mismatch`). | `projectPath` |
| `members` | Member khai báo trong project, path thật, `resolution`, `fileStatus`, `shared` (trong toàn corpus). | `declaredPath`, `relativePath` |
| `files` | File riêng biệt của các program đã chọn, `rawSha256`, encoding, counters, `usedBy`. | `relativePath`, hash |
| `procedures` | LoC theo function: Physical/Code/Executable/Comment/Blank/Metadata/Unclassified/SQL theo [source-analysis](source-analysis.md) §4.1, decision points, `usedBy`. | file, procedure ID, `startLine..endLine` |
| `calls` | Lời gọi theo program, `resolution` `local/program/external/ambiguous`, mọi đích. | `from` (procedure hoặc `#file`), dòng đầu |
| `crud` | View `raw` (tên như trong source) và `normalized` (sau mapping, kèm `names` đã gộp), `viaSharedOnly`. | evidence path + dòng |
| `dynamicSql` | SQL có tên bảng runtime. | file, procedure, dòng |
| `concatenatedSql` (ConcatenatedSQL) | SQL ghép giá trị runtime ngoài tên bảng (`sql-access-v5`); rỗng với inventory cũ. Không sinh cảnh báo từng dòng. | file, procedure, dòng |
| `externalReferences`, `externalApis` | Reference/OCX của project, API native được gọi. | program |
| `totals` | `perProgramSum` và `unique` (mục 3). | — |
| `warnings` | Mục 4. | program/file/dòng nếu có |

XLSX: một sheet mỗi bảng theo thứ tự trên, header in đậm, freeze dòng đầu, có autofilter; danh sách nối bằng `; ` trong một ô. JSON là nguồn chuẩn: ô quá 32.767 ký tự bị cắt và đánh dấu `…[truncated]`, ký tự XML không cho phép thay bằng `U+FFFD`. CSV `programs.csv` của analyze-source không thay báo cáo này.

## 3. Totals

- `perProgramSum`: cộng counters của từng program. File dùng chung (ví dụ `cmn/`) được tính ở **mỗi** program khai báo nó; đây không phải quy mô corpus.
- `unique`: mỗi file riêng biệt trong tập program đã chọn tính một lần; kèm `files`, `analyzedFiles`, `sharedFiles` (file thuộc ≥2 program đã chọn), `procedures`, `procedureCodeLines`, `fileLevelCodeLines`. Kiểm được: `procedureCodeLines + fileLevelCodeLines = codeLines`.
- Không cộng hai loại tổng với nhau. `procedurePhysicalLines`/`executableLines`/`sqlLines` là `null` nếu inventory cũ chưa có breakdown theo procedure.

## 4. Cảnh báo

Mọi cảnh báo của tập đã chọn được giữ, không lọc: `TABLE_NAMES_NOT_CONFIRMED` (mapping `assumed`/`unconfigured`), `COMPLEXITY_DRAFT` (version `*-draft`) hoặc `COMPLEXITY_REFERENCE_ONLY` (không tính effort/báo giá từ điểm; review riêng xử lý file, ghi DB, transaction), `COMPLEXITY_HIGH`, `COMPLEXITY_NEAR_THRESHOLD`, `COMPLEXITY_KNOWN_MISMATCH`, `PROCEDURE_LINES_MISSING`, `FILES_SKIPPED` (cấp corpus), `PROGRAM_UNSUPPORTED`, `PROGRAM_INCOMPLETE`, `MEMBER_<resolution>` (missing, case-mismatch, ambiguous, outside-root, absolute-path), `FILE_ERROR`, `FILE_UNSUPPORTED`, `UNCLASSIFIED_LINES`, `CALL_AMBIGUOUS`, `DYNAMIC_SQL`.

## 5. An toàn

- Ô text luôn là inline string, không bao giờ là công thức; text bắt đầu bằng `=`, `+`, `-`, `@`, tab hoặc CR có thêm quote prefix nên vẫn là text khi người dùng sửa ô.
- Báo cáo chỉ có path tương đối và hash từ inventory; không chứa source code hay lệnh chạy. Member khai báo bằng đường dẫn tuyệt đối (`C:\...`, UNC `\\server\...`, `/...`, `\...`) chỉ giữ tên file dạng `<absolute path>/SECRET.BAS` trong `members` và `warnings`; `resolution: absolute-path` cho biết trạng thái. Cùng quy tắc cho `externalReferences` (`identifier`, `fileName`, `description`) và `externalApis[].library` (`Declare ... Lib "C:\...\X.DLL"`).
- Header XLSX đậm, cột rộng tối thiểu bằng độ dài header + 4 ký tự để không bị cắt.
- CLI bắt buộc `--source-root` (thư mục đã tạo inventory) và từ chối output nằm trong đó, kể cả qua alias/junction, trước khi đọc inventory và ngay trước khi ghi.

## 6. Chạy

```text
npm run build -w @portal/contracts && npm run build -w @portal/api
node apps/api/dist/cli/export-inventory-report.js --inventory <inventory.json> --source-root <thư mục source> --programs <ID,ID,...> --out-json <report.json> --out-xlsx <report.xlsx> [--complexity-review <review.json>]
```

`--complexity-review` là JSON `{"knownMismatches":[{"program":"ID","note":"..."}]}` các ca phân loại sai đã được review (dữ liệu corpus, để ngoài repo). Report giữ toàn bộ danh sách trong `complexityKnownMismatches`, kể cả program ngoài tập chọn, và gắn cờ `known-mismatch` cho program được chọn.

Inventory và hai output phải là ba file khác nhau; output ghi qua file tạm rồi rename. Chưa có: route/job/UI, HTML, chọn version qua API (B14).
