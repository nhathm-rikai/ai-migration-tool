# Báo cáo Assessment cho khách (`customer-assessment-report-v1`)

**Gate:** FEATURE:analysis (AR02). Đọc đúng một inventory đã lưu (artifact id + version), không đọc source, không gọi AI. Khác [báo cáo kỹ thuật](inventory-report.md) (16 sheet, nội bộ/phụ lục): đây là file riêng cho khách, **tiếng Nhật cố định**, 6 sheet. Phần màn hình/report/batch lấy nguyên từ [source-inventory §6](source-inventory.md#6-màn-hình-report-và-batch-screen-report-v1); AR02 không đếm lại.

## 1. Nguồn số liệu

`buildCustomerReport(inventory, origin)` (`apps/api/src/modules/inventory-report/customer-report.ts`) gọi `buildInventoryReport` (toàn bộ program) rồi chỉ chọn lại:

| Số liệu | Nguồn |
|---|---|
| Program, file, LoC (code/comment/blank/physical), procedure | `totals.unique` của lõi và `inventory.totals`, cùng định nghĩa thẻ KPI bước 2 (LoC duy nhất, file dùng chung một lần) |
| 画面 / 帳票 / バッチ, theo `kind`, theo mức phức tạp | `totals.screenReport` của inventory (AR04), nguyên giá trị |
| Bảng DB | số tên bảng riêng biệt của CRUD: bản đã ánh xạ nếu có, nếu không thì tên gốc. Dùng **cùng hàm `crudTables`** (contracts, `table-mapping.ts`) với bước 2, kể cả suy luận schema khi inventory `unconfigured` (`HAN01.ORDERS` và `ORDERS` là 1 bảng); khi schema chỉ là giả định, tiêu đề bảng ghi "※スキーマは仮定". Program đã phân tích mà không có SQL cho 0; chỉ khi không program nào có dữ liệu phân tích mới ghi 未解析 |
| Phân bố complexity program | `analysis.complexity` như đã lưu. Inventory `complexity-v0*` không có `very-high`: ô ghi "対象外", không trộn ngưỡng v1 |
| Rủi ro | cảnh báo của lõi + hai nhóm lấy từ dữ liệu (COM/OCX, API native) |

Inventory không có dữ liệu AR04: `scale.screenReport = null`; 画面/帳票/バッチ ghi **未解析（再解析が必要）**, danh sách sheet 6 cũng vậy, không bao giờ ghi 0.

## 2. Sáu sheet

Mỗi sheet: tiêu đề, 1–3 dòng "このシートの見方" (`notes`), bảng. Bảng không có dòng → "該当なし". Sheet 1–4 không có autofilter; 5 và 6 có. Style và writer dùng chung với AR01 (`xlsx-writer.ts`, thêm `notes` và `subHeaderRows`).

| Sheet | Nội dung |
|---|---|
| `1_規模概要` | Nguồn gốc (nhãn DEMO với dự án demo, run, artifact + version, snapshot rút gọn, version báo cáo/complexity); quy mô; 画面 (共通 tính một lần), 帳票 (検出 = detected + referenced; 疑い riêng, không cộng), バッチ; dòng `お客様提示数：未入力` (R8); 帳票 theo `kind` và theo mức (gồm 未評価); bảng theo module (folder chứa file project, giống `moduleOf` của báo giá) có dòng `共通` riêng, dòng `プログラム未所属` nếu còn LoC/file đã phân tích mà không program nào liệt kê (tổng LoC, procedure, file là của **mọi** file đã phân tích, như bước 2); module được định danh bằng loại + nhãn nên thư mục trùng nhãn đặc biệt vẫn là một dòng riêng, dòng 合計 bằng tổng duy nhất; đoạn khuyến nghị (R9) |
| `2_複雑度` | Phân bố 4 mức + 未解析 của program (số, %, version, 参考値); phân bố mức của report (`report-complexity-v1-draft`); 20 program phức tạp nhất |
| `3_依存関係` | Module dùng chung nhiều program tham chiếu nhất (top 15), COM/OCX, API native |
| `4_データベース` | Top 30 bảng theo số program truy cập kèm thao tác C/R/U/D/X; số vị trí SQL động và SQL ghép chuỗi theo module (`共通` cho file nhiều program); số SQL tính trên mọi file đã phân tích (kể cả file không thuộc program, vào dòng `プログラム未所属`) bằng `sqlUses`/`inventoryKpis` của contracts, cùng hàm với bước 2. Inventory cũ không có trường SQL ghép chuỗi: số này là `null` và Excel ghi 未解析, không phải 0. `FILE_UNSUPPORTED` có một dòng cho mỗi file unsupported (theo role hoặc analysis) và mỗi program unsupported, bằng `totals.unsupportedFiles` của bước 2. Cảnh báo cho vị trí dùng chung (SQL động) liệt kê mọi program dùng |
| `5_リスク・確認事項` | 区分, 重要度 (高/中/低), 件数, 内容, 影響プログラム (≤10 + `他N件`), お客様への確認事項 |
| `6_画面・帳票一覧` | Mỗi dòng một màn hình, một report (mọi mức tin cậy) hoặc một batch, có file (và dòng); report thêm 複雑度 (mức, 点数, モデル版, 評価要因) và 備考; `suspected`/unrated là 未評価 kèm lý do; file dùng chung hiển thị một lần |

## 3. Catalog rủi ro

Một file hằng số: `customer-risk-catalog.ts` ánh xạ mã → {区分, 重要度, 内容, 確認事項}. Mọi cảnh báo của lõi thuộc đúng một dòng (nhóm theo mã), tổng `件数` các dòng nguồn `warning` bằng số cảnh báo. Mã không có trong catalog gộp vào một dòng `その他` (`code: OTHER`), không bị bỏ. Mặc định: thiếu source/`.rpt`/không hỗ trợ = 高 (`REPORT_FILE_MISSING` kèm "帳票定義ファイル(.rpt)のご提供"); tên bảng chưa xác nhận, dynamic SQL, SQL ghép chuỗi (`CONCATENATED_SQL`, từ dữ liệu, kể cả khi dynamic SQL = 0), COM/OCX (cả `Reference=` và `Object=`, sheet 3 ghi 【参照設定】/【コンポーネント】), program nghi có report (`REPORT_SUSPECTED`) = 中; còn lại = 低. Sắp xếp 高 → 中 → 低, rồi theo `件数`. Câu chữ: `customer-report-constants.ts` (tiêu đề sheet, ghi chú, đoạn khuyến nghị, `お客様提示数：未入力`, nhãn mức/độ tin cậy).

## 4. API và UI

- `GET /api/v1/projects/:projectId/artifacts/:artifactId/versions/:version/customer-report?format=xlsx|json` (operation `exportCustomerReport`). Cùng bảo vệ, cùng quy tắc với route AR01: đúng `projectId + artifactId + version`, không "latest", `REPORT_TOO_LARGE` (422) khi một sheet vượt giới hạn Excel, dựng trong bộ nhớ, `Cache-Control: no-store`.
- Tên file `アセスメント報告書_<dự án>_<YYYYMMDD>.xlsx|json`; `filename` ASCII fallback + `filename*` UTF-8; tên dự án được làm sạch như AR01.
- JSON = `CustomerReport` (`reportVersion`, `source` giống AR01, `scale`, `modules`, `complexity`, `dependencies`, `database`, `risks`, `items`, `recommendations`); không có đường dẫn tuyệt đối (qua `redactAbsolutePath`); ô văn bản dạng công thức được ghi như text (writer).
- Bước 2: hai nút riêng trong tiêu đề: **Báo cáo cho khách (Excel)** (nút chính) và **Dữ liệu kỹ thuật (Excel, nội bộ)** (AR01). Cùng quy tắc disabled khi đang tải, hủy khi đổi artifact/version, kiểm tra cấu trúc ZIP trước khi lưu, nút tải JSON khi `REPORT_TOO_LARGE`. JSON của báo cáo khách chỉ được lưu khi `reportVersion` đúng và `source.origin` khớp artifact + version. vi/ja.

## 5. Giới hạn

Không có chữ ký, logo, kiểu mẫu của khách; chưa xuất theo bộ lọc (R5); chưa ô nhập số khách nêu và đối chiếu (R8); chưa tự chia wave (R9); PDF là AR03. Đã sinh file mở được bằng writer đã test, chưa mở bằng Excel Desktop.
