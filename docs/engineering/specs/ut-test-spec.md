# Test case UT do agent sinh (TC01)

Phạm vi: tài liệu `ut-test-spec.md` (単体テスト仕様書) sinh ở bước 3 cùng các tài liệu khác, checklist tất định, validator và Excel. Portal **không** tự sinh test case; agent viết case, Portal chỉ đo độ phủ và kiểm bằng chứng.

## 1. Checklist `ut-checklist-v1`

- Tính từ inventory (`buildUtChecklist(inventory, projectPath)`), thuần và ổn định: cùng inventory cho cùng danh sách và ID.
- Mức hạng mục: `procedure`, `event` (event handler VB: `Tên_Sự kiện` trong form/class), `sql` (mỗi lệnh INSERT/SELECT/UPDATE/DELETE/DDL theo `sqlTables`), `report` (từ `programs[].reports`). Nhánh bên trong procedure KHÔNG nằm trong checklist; agent tự liệt kê, mỗi case có `file:line`.
- ID: `UT-<tên file>-<procedure>-<n>`; trùng tên procedure giữa các file thì thêm tiền tố tên file. Code ngoài procedure thuộc nhóm `_file_<tên file>`.
- `programs[].utPoints` (optional, số hạng mục) được giữ trong inventory; bước 2 KHÔNG còn cột "Điểm test UT" (bỏ 10/11/2026, người dùng không cần). Inventory cũ không có trường này vẫn hợp lệ.
- Checklist được ghi vào workspace agent tại `context/p1/1.4-ut-skeleton.json` chỉ khi run có chọn `ut-test-spec`.

## 2. Tài liệu và validator

- Bảng case 13 cột: No, 対象ID, 大項目, 中項目, 小項目, 前提条件, 入力データ, 手順, 期待結果, 確認観点, 根拠(file:行), 区分, 対象外理由.
- `validateUtSpec(markdown, checklist, programFiles)` chạy sau `parsePackage`; sai thì run lỗi `AGENT_OUTPUT_INVALID` (log nêu mã lỗi, tối đa vài mục):
  1. mọi hạng mục checklist có ít nhất một case, hoặc `対象外` kèm lý do;
  2. mọi case có bằng chứng `file:line` (chấp nhận `a:5` hoặc `a:5-9`, bỏ tiền tố `source/`) trỏ tới file của program;
  3. không case nào tham chiếu ID ngoài checklist của program.
- Prompt `spec-design-task-v7`; template `docs/specification-design/templates/ut-test-spec.md` (bộ template 0.11.0-draft).

## 3. Excel

`GET /api/v1/projects/:projectId/document-runs/:runId/items/:item/ut-test-spec` trả `.xlsx` cho đúng run + program (không có "latest"): sheet `表紙` (program, phiên bản tài liệu, ngày, tác giả AI, trạng thái review, lưu ý), `テストケース` (13 cột, ba cột cuối 実施日/結果/確認者 để trống cho người test) và `カバレッジ` (hạng mục × số case, 対象外 + lý do). Tên file `単体テスト仕様書_<program>.xlsx`. Hiển thị ở bước 3 (khi xem file) và bước 4 (xem trước).

## 4. Giới hạn

- Checklist không có vị trí từng nhánh: chất lượng case mức nhánh phụ thuộc agent và việc TL đọc lại; validator chỉ đảm bảo độ phủ hạng mục và bằng chứng tồn tại, không chứng minh case đúng.
- Chỉ test đơn vị (UT). Test tích hợp (TC02) chưa làm.
