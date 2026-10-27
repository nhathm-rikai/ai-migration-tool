# Phiếu đầu vào một run P2

**DRAFT INPUT — p2-templates-0.2.0-draft.** [Cách dùng](../README.md). Phiếu thủ công đề xuất, không phải schema/context builder đã triển khai.

Không cần khai báo ngôn ngữ/runtime: agent tự nhận diện theo [quy trình phân tích](../analysis-method.md) và ghi vào coverage. Người vận hành chỉ cung cấp phần công cụ hoặc kế hoạch dự án phải xác định.

| Người vận hành cung cấp                                                  | Giá trị                         |
| ------------------------------------------------------------------------ | ------------------------------- |
| Project/unit ID; danh sách pilot, KPI, người quyết định gate nếu có      | <điền>                          |
| Project/entrypoint relative path/alias, căn cứ mapping/ambiguity         | <điền>                          |
| Snapshot ID/hash từ công cụ, normalized view, decode profile theo file   | <điền>                          |
| Inventory công cụ cụ thể, versions/complete/limitations, phần chưa đo    | <điền>                          |
| Thông tin ngôn ngữ/runtime đã biết (tùy chọn, agent đối chiếu)           | <điền hoặc không cung cấp>      |
| Rule/template/schema và revision chỉ dẫn tác vụ thực tế                  | <điền>                          |
| Mode document-draft hoặc understanding-v1                                | <chọn>                          |
| Read allowlist, output ngoài source/repo, run identity do tool cấp       | <điền>                          |
| Provider/model/CLI version, permissions/preflight record                 | <điền>                          |
| Build config, DDL/schema, bản export text của file binary, ảnh/tài liệu  | <provenance hoặc thiếu>         |
| Report/export: report/mode IDs, layout/resource/config được phép đọc     | <provenance hoặc không áp dụng> |
| Context/output limits, thứ tự chunk                                      | <điền>                          |
| Calibration được giao / run sau duyệt, quyền dùng dữ liệu                | <điền>                          |

Report/export ghi provenance file/version/sheet/range hoặc vùng ảnh; thiếu resource hoặc chưa xác minh ghi rõ theo [hướng dẫn report](../report-templates.md). Không đưa giá trị config chứa credential/path nhạy cảm vào tài liệu xuất.

| Relative path | Vai trò | included/excluded/missing/unsupported | Lý do | Snapshot entry | Range gốc/chunk | Dependency |
| ------------- | ------- | ------------------------------------- | ----- | -------------- | --------------- | ---------- |
| <điền>        |         |                                       |       |                |                 |            |

| Chunk ID               | Program/flow/đơn vị logic | Files/ranges gốc | Đã/chưa đọc | Chồng lặp/thiếu | Hợp nhất |
| ---------------------- | ------------------------- | ---------------- | ----------- | --------------- | -------- |
| <điền hoặc không chia> |                           |                  |             |                 |          |

Không đưa credential/raw log/config agent từ corpus. Phiếu này không thay hash/manifest công cụ hay cơ chế kiểm soát quyền.
