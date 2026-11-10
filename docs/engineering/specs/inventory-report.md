# Đặc tả báo cáo inventory theo program (`inventory-report-v1`)

**Gate:** FEATURE:analysis, phần core của export (B14 chưa có API/UI/job). Báo cáo đọc một [source inventory](source-inventory.md) đã sinh và đã validate theo `source-inventory-v1`; **không mở hay parse source lần nữa**. Code: `apps/api/src/modules/inventory-report/`, CLI `apps/api/src/cli/export-inventory-report.ts`.

## 1. Chọn program

- ID program là tên file project bỏ phần mở rộng (`KUN/KUNO0020.vbp` → `KUNO0020`), so không phân biệt hoa thường.
- Mỗi ID phải khớp đúng một project file. ID rỗng, lặp, không khớp hoặc khớp nhiều file → từ chối cả báo cáo, không bỏ qua ngầm.

## 2. Nội dung (JSON và XLSX cùng dữ liệu)

| Bảng (sheet) | Nội dung | Truy vết |
|---|---|---|
| `source` (Summary) | `snapshotHash`, profile, mọi version của inventory (`metricVersion`, `procedureLinesVersion`, decoder, normalization, `sqlAccessVersion`, call graph, complexity, table name) và mapping tên bảng. | Snapshot |
| `programs` | Trạng thái, `complete`, counters theo program, số procedure, tổng Executable/SQL, metrics (gồm `concatenatedSql`, `parameterizedSql`; trống với inventory cũ), complexity raw/normalized (chỉ `version`, `score`, `level`, `parts`; `reviewFlags` của inventory v0 không được xuất). | `projectPath` |
| `screens`, `reports` (AR04) | Màn hình theo program (`file`, `shared`, cảnh báo) và từng dòng report (kind, tên, file:dòng, `confidence`, `complexityLevel/Score/Version/Factors/Reason`). `programs` thêm `programType`, `screens`, `reports` (detected + referenced), `suspectedReports`; `totals.screenReport` cho tập đã chọn. Inventory cũ: `null`/rỗng và cảnh báo `SCREEN_REPORT_MISSING`, không phải 0. Cảnh báo thêm: `REPORT_FILE_MISSING`, `SCREEN_FILE_MISSING`, `SCREEN_FILE_NOT_ANALYZED`, `REPORT_SUSPECTED`. | `programId`, file, dòng |
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

XLSX (AR01): 16 sheet theo nhóm cố định, tab tô màu theo nhóm. `README` đứng đầu: tên báo cáo, dự án, nguồn gốc dữ liệu, rồi bảng mô tả từng sheet (nội dung, cột khóa, số dòng, link tới sheet). Overview (`Summary`, `Totals`) → Program level (`Programs`, `Screens`, `Reports`, `Members`, `ExternalRefs`, `ExternalAPIs`) → Detail (`Files`, `Procedures`, `Calls`, `CRUD`, `DynamicSQL`, `ConcatenatedSQL`) → `Warnings`. `Summary` là bảng khóa/giá trị chia mục (Provenance, Source and versions, Scope and size, Warnings). Kiểu bảng: header chữ trắng đậm nền xanh đậm, viền mảnh, freeze dòng header, autofilter (trừ `README`/`Summary`), số nguyên `#,##0`, số thập phân `#,##0.00`, chữ căn trái, độ rộng cột từ độ dài header + 4 đến tối đa 60, chỉ cột mô tả dài (README, Summary) xuống dòng; ô trống vẫn có viền, không ghi chuỗi rỗng. Danh sách nối bằng `; ` trong một ô.

Nguồn gốc (DATA-08): khi xuất qua API, `source.origin` trong JSON và mục Provenance của `Summary`/`README` ghi `mode` (`demo` hiện rõ "DEMO: bundled sample data, not a customer system"), `projectId`, tên dự án, `runId`, `artifactId`, `artifactVersion`, `createdAt` của artifact, cùng `snapshotHash` và `reportVersion`; CLI để `origin: null`.

Giới hạn Excel: một sheet tối đa 1.048.576 dòng (tính cả header và dòng tiêu đề) và 16.384 cột. Kiểm trước khi dựng XML; vượt giới hạn thì API trả `REPORT_TOO_LARGE` (422) và người dùng tải JSON, không có file XLSX lỗi.

Che đường dẫn tuyệt đối: dấu ngoặc kép/đơn và khoảng trắng bao quanh được bỏ trước khi kiểm (`"C:\root\X.bas"` → `<absolute path>/X.bas`), áp cho `declaredPath`, `externalReferences`, `externalApis` và mọi cảnh báo.

ID program ở chế độ tất cả luôn duy nhất, không phân biệt hoa thường: tên file; trùng → đường dẫn project bỏ phần mở rộng; vẫn trùng với ID khác (kể cả ID ngắn của file khác, ví dụ `X.vbp.vbp` có ID `X.vbp`) → cả nhóm trùng dùng đường dẫn project đầy đủ; đường dẫn đầy đủ chỉ khác hoa thường (`X.vbp` và `X.VBP`) → thêm `#1`, `#2` theo thứ tự, bỏ qua mọi ID đã dùng. Nếu vẫn còn ID trùng thì báo lỗi nội bộ, không xuất báo cáo. JSON là nguồn chuẩn: ô quá 32.767 ký tự bị cắt và đánh dấu `…[truncated]`, ký tự XML không cho phép thay bằng `U+FFFD`. CSV `programs.csv` của analyze-source không thay báo cáo này.

## 3. Totals

- `perProgramSum`: cộng counters của từng program. File dùng chung (ví dụ `cmn/`) được tính ở **mỗi** program khai báo nó; đây không phải quy mô corpus.
- `unique`: mỗi file riêng biệt trong tập program đã chọn tính một lần; kèm `files`, `analyzedFiles`, `sharedFiles` (file thuộc ≥2 program đã chọn), `procedures`, `procedureCodeLines`, `fileLevelCodeLines`. Kiểm được: `procedureCodeLines + fileLevelCodeLines = codeLines`.
- Không cộng hai loại tổng với nhau. `procedurePhysicalLines`/`executableLines`/`sqlLines` là `null` nếu inventory cũ chưa có breakdown theo procedure.

## 4. Cảnh báo

Mọi cảnh báo của tập đã chọn được giữ, không lọc: `TABLE_NAMES_NOT_CONFIRMED` (mapping `assumed`/`unconfigured`), `COMPLEXITY_DRAFT` (version `*-draft`) hoặc `COMPLEXITY_REFERENCE_ONLY` (không tính effort/báo giá từ điểm; review riêng xử lý file, ghi DB, transaction), `PROCEDURE_LINES_MISSING`, `FILES_SKIPPED` (cấp corpus), `PROGRAM_UNSUPPORTED`, `PROGRAM_INCOMPLETE`, `MEMBER_<resolution>` (missing, case-mismatch, ambiguous, outside-root, absolute-path), `FILE_ERROR`, `FILE_UNSUPPORTED`, `UNCLASSIFIED_LINES`, `CALL_AMBIGUOUS`, `DYNAMIC_SQL`.

## 5. An toàn

- Ô text luôn là inline string, không bao giờ là công thức; text bắt đầu bằng `=`, `+`, `-`, `@`, tab hoặc CR có thêm quote prefix nên vẫn là text khi người dùng sửa ô.
- Báo cáo chỉ có path tương đối và hash từ inventory; không chứa source code hay lệnh chạy. Member khai báo bằng đường dẫn tuyệt đối (`C:\...`, UNC `\\server\...`, `/...`, `\...`) chỉ giữ tên file dạng `<absolute path>/SECRET.BAS` trong `members` và `warnings`; `resolution: absolute-path` cho biết trạng thái. Cùng quy tắc cho `externalReferences` (`identifier`, `fileName`, `description`) và `externalApis[].library` (`Declare ... Lib "C:\...\X.DLL"`).
- Header XLSX đậm, cột rộng tối thiểu bằng độ dài header + 4 ký tự để không bị cắt.
- CLI bắt buộc `--source-root` (thư mục đã tạo inventory) và từ chối output nằm trong đó, kể cả qua alias/junction, trước khi đọc inventory và ngay trước khi ghi.

## 6. Chạy

```text
npm run build -w @portal/contracts && npm run build -w @portal/api
node apps/api/dist/cli/export-inventory-report.js --inventory <inventory.json> --source-root <thư mục source> --programs <ID,ID,...> --out-json <report.json> --out-xlsx <report.xlsx>
```

Inventory và hai output phải là ba file khác nhau; output ghi qua file tạm rồi rename.

### Tải qua API và UI (AR01)

- `GET /api/v1/projects/:projectId/artifacts/:artifactId/versions/:version/report?format=xlsx|json` (operation `exportInventoryReport`, route protected như route artifact). Đọc đúng `projectId + artifactId + version` qua artifact service, không bao giờ lấy version khác hoặc latest; project khác, artifact/version không có → `ARTIFACT_NOT_FOUND` (404), `format` thiếu hoặc sai → 400. Mã trong `ErrorResponseSchema`, không thêm mã mới.
- Chế độ chọn **tất cả program** (`buildInventoryReport(inventory, ALL_PROGRAMS)`): chọn theo `projectPath`, nên hai project file cùng tên ở hai thư mục không bị từ chối. ID là tên file; nếu tên lặp (không phân biệt hoa thường) thì ID là đường dẫn project bỏ phần mở rộng (`A/X`), và leo tiếp lên đường dẫn đầy đủ khi vẫn trùng (mục 2). Chế độ ID của CLI giữ nguyên, vẫn từ chối ID khớp nhiều file.
- `xlsx` = `writeXlsx(inventoryReportSheets(report))` (16 sheet: `README` + 15 bảng theo thứ tự nhóm ở mục 2), `json` = report. `Content-Disposition: attachment` với `assessment-<tên dự án>-<YYYYMMDD UTC>.<đuôi>`: `filename` ASCII an toàn + `filename*=UTF-8''…` (RFC 5987); ký tự không an toàn trong tên file bị thay `_`, tên cắt 80 ký tự. Dựng trong bộ nhớ, không ghi file vào data directory hay thư mục tạm; `Cache-Control: no-store`.
- UI (từ 10/11/2026 bước 2 **không còn nút xuất báo cáo kỹ thuật**; route và builder giữ nguyên, được e2e gọi trực tiếp; nút "Xuất Excel" hiện nay là của báo cáo Assessment, AR02, dùng cùng component và quy tắc): nút ở tiêu đề bước 2 (chỉ khi inventory `ready`), truyền đúng `artifact.id` và `version` đang hiển thị. File xlsx chỉ được lưu khi cấu trúc ZIP đúng: có End Of Central Directory, số mục khớp, và **mọi** mục có local header trong file (chữ ký, tên bằng tên ở central directory, dữ liệu kết thúc trước central directory), trong đó có `[Content_Types].xml` và `xl/workbook.xml`. Ranh giới: đây là kiểm tra cấu trúc sơ bộ cho phản hồi từ backend cục bộ của Portal; client không giải nén, không kiểm CRC, không parse XML, và hỏng ở mức đó nằm ngoài phạm vi (server dựng file bằng writer đã test). Khi API trả `REPORT_TOO_LARGE`, UI hiện thêm nút "Tải bản JSON" gọi cùng route với `format=json` (cùng kiểm tra, hủy và không lưu file rỗng).
- Chưa có: job nền, HTML, xuất theo bộ lọc/program đang chọn, phần cho khách (AR02), PDF (AR03).
