# Test case IT do agent sinh (TC02)

Phạm vi: tài liệu `it-test-spec.md` (結合テスト仕様書), loại tài liệu thứ bảy của bước 3. Cùng cơ chế với [test case UT](ut-test-spec.md): Portal lập checklist tất định từ inventory, agent viết scenario, Portal kiểm độ phủ và bằng chứng rồi xuất Excel. Portal **không** tự sinh scenario.

## 1. Checklist `it-checklist-v2`

- `buildItChecklist(inventory, projectPath)` trong `apps/api/src/modules/analysis/it-checklist.ts`: thuần và ổn định, cùng inventory cho cùng danh sách và ID. Cần inventory đầy đủ vì loại `cross-program` nhìn sang program khác.
- Bốn loại hạng mục, đánh số riêng theo loại, ID `IT-<tên program>-<loại>-<n>`:

| Loại            | Nguồn trong inventory                                                                                                                       | Một hạng mục là                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `shared-module` | `analysis.calls` có `resolution: program`, nơi gọi ở file riêng của program, đích ở file `members[].shared`                                 | một module dùng chung (gộp mọi procedure được gọi) |
| `db-chain`      | `sqlTables` của các file thuộc program: cùng một bảng ở ≥ 2 procedure (code ngoài procedure tính là một đơn vị), có ít nhất một ghi (C/U/D) | một bảng                                           |
| `report`        | `programs[].reports` (AR04), mọi mức confidence                                                                                             | một report                                         |
| `cross-program` | cùng view bảng với bước 2 (`crudTables`, `mappedCrud`): bảng program này ghi và program khác đọc, hoặc ngược lại                            | một bảng (gộp mọi program kia; v1 là một cặp)      |

- Mỗi hạng mục có `file`, `line` (bằng chứng trong program), `detail` và `counterparts` (danh sách tên các program kia với `cross-program`, còn lại là mảng rỗng).
- **Không có loại `screen-flow`** (màn hình gọi màn hình) dù TC02 nêu: `call-graph-v2` chỉ resolve một tên trong chính file đó hoặc tới procedure `global`, mà procedure của form không bao giờ là `global`. `Form2.Show` hay `Form2.LoadData` vì vậy không thành lời gọi trong inventory, không có dữ liệu để lập cặp form → form. Test `it-checklist.test.ts` giữ đúng quan sát này; khi analyzer ghi lời gọi có qualifier thì test đó fail và có thể thêm loại này. Mở rộng analyzer nằm ngoài TC02.
- Không có `programs[].itPoints` và không có cột "Điểm test IT" ở bước 2: cột tương ứng của UT đã bị bỏ ngày 10/11/2026 (người dùng không cần), nên không thêm cột cùng loại cho IT. Checklist được tính lại từ inventory mỗi lần dùng.
- Checklist **có thể rỗng** (program không gọi module dùng chung, không có bảng nào qua hai procedure, không report, không chung bảng với program khác). Khi đó tài liệu hợp lệ với bảng scenario không có hàng nào.
- Checklist được ghi vào workspace agent tại `context/p1/1.5-it-skeleton.json` chỉ khi run có `it-test-spec`.

## 2. Tài liệu và validator

- `it-test-spec` là một giá trị của `SpecDocumentIdSchema`, không kéo theo tài liệu nào (`SPEC_DOCUMENT_COMPANIONS`), sinh cuối cùng trong `SPEC_GENERATION_ORDER`. Một program mỗi request như mọi loại khác.
- Bảng scenario 11 cột: No, 対象ID, 種別, シナリオ, 関連要素, 前提条件, 手順, 期待結果, 根拠(file:行), 区分, 対象外理由.
- `validateItSpec(markdown, checklist, programFiles)` chạy sau `parsePackage`; sai thì `AGENT_OUTPUT_INVALID`, log `it-test-spec rejected: <mã> <id>: <detail>` (tối đa 5 mục). Dùng chung với UT phần tìm bảng (ô thứ hai của hàng tiêu đề), nhận diện `区分` và đọc evidence (`normalizeEvidence`), nên mọi quy tắc định dạng của [UT mục 2](ut-test-spec.md#2-tài-liệu-và-validator) áp dụng y nguyên:
  1. mọi hạng mục checklist có ít nhất một scenario, hoặc `対象外` kèm lý do (`MISSING_ITEM`, `EXCLUDED_NO_REASON`);
  2. mọi scenario có bằng chứng `file:line` trỏ tới file của program, dòng ≥ 1 (`NO_EVIDENCE`);
  3. không scenario nào tham chiếu ID ngoài checklist (`UNKNOWN_ITEM`);
  4. scenario thật có `手順` và `期待結果` (`EMPTY_FIELD`); hàng thiếu ô là `ROW_MALFORMED`;
  5. **riêng IT:** scenario của hạng mục có `counterparts` phải nêu tên **ít nhất một** program trong danh sách ở `関連要素`, không phân biệt hoa/thường, kể cả hàng `対象外` (`NO_COUNTERPART`);
  6. checklist rỗng và bảng không có hàng (hoặc không có bảng) là hợp lệ; checklist có hạng mục mà không tìm thấy bảng là `TABLE_MISSING`.
- Cột `種別` agent viết không được kiểm; Excel lấy loại từ checklist theo ID.
- Prompt `spec-design-task-v9`: v8 thêm đoạn cho `it-test-spec`; v9 nói rõ đây là **phiên duy nhất** (không có lượt sau, không hứa làm tiếp, phải có block cho mọi file, tài liệu dở thì vẫn xuất với trạng thái đang sinh) sau khi một run thật dừng trước tài liệu cuối và mất cả gói. Template `docs/specification-design/templates/it-test-spec.md` (bộ template 0.14.0-draft).

## 3. Excel

`GET /api/v1/projects/:projectId/document-runs/:runId/items/:item/it-test-spec` trả `.xlsx` cho đúng run + program (không có "latest"), 404 `DOCUMENT_NOT_FOUND` khi gói không có `it-test-spec.md`. Ba sheet: `表紙` (như UT), `テストシナリオ` (12 cột: No, ID, 種別, シナリオ, 関連要素, 前提条件, 手順, 期待結果, 根拠(file:行), và 実施日/結果/確認者 để trống cho người test; hàng `対象外` ghi lý do trong 手順 và để trống 期待結果) và `カバレッジ` (8 cột: ID, 種別, 対象, 根拠, シナリオ数, テスト, 対象外, 対象外理由). Tên file `結合テスト仕様書_<program>.xlsx`. Nút tải ở bước 3 (khi xem file) và bước 4.

## 4. Giới hạn

- Chưa có LIVE: chưa lần nào chạy `it-test-spec` với agent thật (TC02-AC06 do người dùng/TL chạy). Chất lượng scenario và việc agent tuân thủ template chưa được quan sát.
- `cross-program` gộp theo bảng từ `it-checklist-v2` (v1 sinh một hạng mục cho mỗi cặp bảng × program, một program thật đã có 27 hạng mục và agent không viết hết trong một phiên). Hệ quả của việc gộp: validator chỉ đòi một program được nêu tên, nên các program còn lại của bảng có thể không có scenario nào; người review đọc cột 対象 ở sheet カバレッジ để thấy đủ danh sách.
- `db-chain` dùng tên bảng như viết trong source (so không phân biệt hoa/thường), không qua mapping schema; `cross-program` dùng view đã mapping của bước 2. Cùng một bảng có thể mang hai cách viết tên ở hai loại.
- Validator chỉ đảm bảo độ phủ hạng mục và bằng chứng tồn tại, không chứng minh scenario đúng hay chạy được.
