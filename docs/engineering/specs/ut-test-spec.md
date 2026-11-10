# Test case UT do agent sinh (TC01)

Phạm vi: tài liệu `ut-test-spec.md` (単体テスト仕様書) sinh ở bước 3 cùng các tài liệu khác, checklist tất định, validator và Excel. Portal **không** tự sinh test case; agent viết case, Portal chỉ đo độ phủ và kiểm bằng chứng.

## 1. Checklist `ut-checklist-v1`

- Tính từ inventory (`buildUtChecklist(inventory, projectPath)`), thuần và ổn định: cùng inventory cho cùng danh sách và ID.
- Mức hạng mục: `procedure`, `event` (event handler VB: `Tên_Sự kiện` trong form/class), `sql` (mỗi lệnh INSERT/SELECT/UPDATE/DELETE/DDL theo `sqlTables`), `report` (từ `programs[].reports`). Nhánh bên trong procedure KHÔNG nằm trong checklist; agent tự liệt kê, mỗi case có `file:line`.
- ID: `UT-<tên file>-<procedure>-<n>`; trùng tên procedure giữa các file thì thêm tiền tố tên file. Code ngoài procedure thuộc nhóm `_file_<tên file>`.
- `programs[].utPoints` (optional, số hạng mục) hiển thị ở cột "Điểm test UT" của bước 2; inventory cũ không có thì hiện "Chưa phân tích", không phải 0.
- Checklist được ghi vào workspace agent tại `context/p1/1.4-ut-skeleton.json` chỉ khi run có chọn `ut-test-spec`.

## 2. Tài liệu và validator

- Bảng case 13 cột: No, 対象ID, 大項目, 中項目, 小項目, 前提条件, 入力データ, 手順, 期待結果, 確認観点, 根拠(file:行), 区分, 対象外理由.
- `validateUtSpec(markdown, checklist, programFiles)` chạy sau `parsePackage`; sai thì run lỗi `AGENT_OUTPUT_INVALID` (log nêu mã lỗi, tối đa vài mục):
  1. mọi hạng mục checklist có ít nhất một case, hoặc `対象外` kèm lý do;
  2. mọi case có bằng chứng `file:line` trỏ tới file của program. Chuỗi được chuẩn hóa trước khi so (`normalizeEvidence`): bỏ tiền tố `source/`, `\` → `/`, dấu `：` và chữ số toàn chiều → nửa chiều, `〜`/`～`/`–`/`—` → `-`, bỏ hậu tố `行`/`行目`/`line`, bỏ ghi chú trong ngoặc ở cuối, `:L5` → `:5`, `a (5)` → `a:5`, và lấy ref đầu nếu ô có nhiều (`,`/`;`/`、`). Khớp file không phân biệt chữ hoa/thường; chỉ ghi tên file thì chấp nhận khi **duy nhất một** file của program có tên đó, nhiều file cùng tên vẫn là `NO_EVIDENCE`. Dòng phải ≥ 1. Lý do chuẩn hóa: một run fail là một run mất (gói bị từ chối không được lưu, tốn quota), và cách viết chuỗi không nói gì về chất lượng test case;
  3. không case nào tham chiếu ID ngoài checklist của program.
- Prompt `spec-design-task-v7`; template `docs/specification-design/templates/ut-test-spec.md` (bộ template 0.12.0-draft).

## 3. Excel

`GET /api/v1/projects/:projectId/document-runs/:runId/items/:item/ut-test-spec` trả `.xlsx` cho đúng run + program (không có "latest"): sheet `表紙` (program, phiên bản tài liệu, ngày, tác giả AI, trạng thái review, lưu ý), `テストケース` (14 cột: No, ID, 大項目, 中項目, 小項目, 前提条件, 入力, 手順, 期待結果, **確認観点**, 根拠(file:行), và ba cột cuối 実施日/結果/確認者 để trống cho người test; hàng `対象外` để trống 期待結果/確認観点 và ghi lý do trong 手順) và `カバレッジ` (9 cột: hạng mục, 種別, 手続き, 対象, 根拠, ケース数, **テスト**, **対象外**, 対象外理由 — đếm theo `区分` thay vì một nhãn, để hạng mục vừa có nhánh kiểm được vừa có phần không kiểm được không bị đọc thành đã test hết). Tên file `単体テスト仕様書_<program>.xlsx`. Hiển thị ở bước 3 (khi xem file) và bước 4 (xem trước).

## 4. Giới hạn

- Checklist không có vị trí từng nhánh: chất lượng case mức nhánh phụ thuộc agent và việc TL đọc lại; validator chỉ đảm bảo độ phủ hạng mục và bằng chứng tồn tại, không chứng minh case đúng.
- Chỉ test đơn vị (UT). Test tích hợp (TC02) chưa làm.
