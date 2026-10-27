# Detail Design — <PROGRAM> — <Tên chức năng>

**DRAFT TEMPLATE — spec-design-templates-0.4.0-draft.** Thay revision riêng p2-detail-design-0.1.1-draft; thuật ngữ trung lập theo [quy trình phân tích](../analysis-method.md). [Phần đầu chung](../README.md), [yêu cầu](../rules/deliverables.md), [căn cứ tham khảo](../detail-design-reference.md).

Tổ chức theo xử lý nghiệp vụ; inventory bảo đảm không bỏ procedure. Một xử lý có thể gồm nhiều procedure, một procedure có thể phục vụ nhiều xử lý. ID xử lý là tham chiếu Markdown, không thêm field vào understanding-v1. Mọi mục có nội dung hoặc “không áp dụng” kèm lý do/phạm vi đã kiểm hoặc “chưa xác định” kèm Q-ID. E-ref trỏ evidence registry mục 7.

## 1. Tổng quan — 処理概要

### 1.1 Thông tin và danh sách xử lý

<unit/program, project/entrypoint path và alias, ngôn ngữ/runtime phát hiện (dẫn coverage), snapshot/version được cung cấp, mục đích, loại màn hình/báo cáo/xử lý chung, phạm vi và giới hạn>

| ID xử lý | Tên/mục đích | Trigger/entry point | Procedure chính | Mục chi tiết | BR/Q-ID | E-ref |
| -------- | ------------ | ------------------- | --------------- | ------------ | ------- | ----- |

### 1.2 Điều kiện truy cập

| Vai trò/trạng thái thấy trong source | Menu/entry point | Điều kiện cho phép | Khi không đủ điều kiện | Phạm vi dữ liệu | E-ref/Q-ID |
| ------------------------------------ | ---------------- | ------------------ | ---------------------- | --------------- | ---------- |

Không suy phân quyền từ control bị ẩn; không mặc định có URL/session/web layer khi source không có.

### 1.3 Item, sự kiện và khởi tạo

Basic Design giữ định nghĩa item đầy đủ. Tại đây chỉ tham chiếu item/section đúng version và ghi mapping phục vụ xử lý, không tạo bản chuẩn thứ hai.

| Basic item ref / control name/type/index | Nhãn gốc | Giá trị/default liên quan | Designer hay runtime | Event | ID xử lý | E-ref |
| ---------------------------------------- | -------- | ------------------------- | -------------------- | ----- | -------- | ----- |

| Bước | Khởi tạo/lifecycle/event | Điều kiện | ID xử lý gọi tới | Message/kết quả/điều hướng | State giữ/đổi | E-ref |
| ---- | ----------------------------- | --------- | ---------------- | -------------------------- | ------------- | ----- |

Bao gồm code khởi tạo module/file và code ngoài đơn vị logic. Chưa có căn cứ thứ tự event thì ghi Q-ID.

## 2. Inventory và ánh xạ source

| Inventory ID/path | Symbol đầy đủ/kind/visibility | Range gốc | ID xử lý/mục mô tả | Đã/chưa phân tích | Lý do/Q-ID |
| ---------- | ----------------------------- | --------- | ------------------ | ----------------- | ---------- |

Liệt kê mọi đơn vị logic theo ngôn ngữ thực (function/method/accessor/Sub/Property/paragraph/section/stored routine/trigger/handler…) và code file/module-level. Đơn vị chưa gắn xử lý vẫn phải ghi. Mỗi đơn vị có chữ ký, tham số và cách truyền/default nếu thấy, return, global state, caller/callee và unresolved ở mục 3; dẫn tới đó thay vì lặp nội dung.

## 3. Chi tiết từng xử lý — lặp khối 3.x theo ID xử lý

### 3.x.1 Mục đích và điều kiện gọi — 呼び出し条件

<ID/tên xử lý, mục đích hiện trạng, tiền điều kiện, observed/hypothesis, BR/Q-ID>

| Trigger/caller | Điều kiện/trạng thái | Input trực tiếp | Procedure/entry point | Kết quả theo source | E-ref |
| -------------- | -------------------- | --------------- | --------------------- | ------------------- | ----- |

### 3.x.2 Input/output — インプット・アウトプット

| Chiều | Item/biến/tham số/return | Kiểu/format thấy trong source | Nguồn/đích | Required/default | Null/Empty/giới hạn/biến đổi | E-ref |
| ----- | ------------------------ | ----------------------------- | ---------- | ---------------- | ---------------------------- | ----- |

Phân biệt local, global/static/session, control, tham số và cột DB. Kiểu biến/ORM trong source không xác nhận kiểu DB.

### 3.x.3 Trình tự — 処理詳細

| Bước | Điều kiện/nhánh | Thao tác/công thức | State trước → sau | Lặp/điều kiện dừng/early return | Bước tiếp/side effect | BR/E-ref |
| ---- | --------------- | ------------------ | ----------------- | ------------------------------- | --------------------- | -------- |

Ghi đường bình thường, rỗng, hủy, lỗi; thứ tự tính/rounding/precision có căn cứ. Mermaid có thể bổ sung nhưng không thay evidence. Không tự sửa lỗi legacy.

### 3.x.4 Thành phần và luồng gọi — 処理コンポーネント

| File/module/form thực tế | Symbol/range | Chữ ký/tham số/return | Global state đọc/ghi | Caller/callee, resolved/unresolved | Trách nhiệm | E-ref |
| ------------------------ | ------------ | --------------------- | -------------------- | ---------------------------------- | ----------- | ----- |

| Bước gọi | Nơi gọi → nơi nhận | Input | Output | Nhánh/lỗi truyền về | E-ref |
| -------- | ------------------ | ----- | ------ | ------------------- | ----- |

Dùng thành phần thực sự tìm thấy trong source, không dựng Controller/Service/Repository hoặc call graph đầy đủ theo bố cục mẫu tham khảo.

### 3.x.5 Validation và BR — バリデーション・業務ルール

| Thứ tự/timing | Đối tượng/điều kiện | Kiểm tra/công thức | BR ID canonical | Khi đạt/không đạt | Message/side effect | E-ref |
| ------------- | ------------------- | ------------------ | --------------- | ----------------- | ------------------- | ----- |

BR list giữ phát biểu chuẩn; ở đây ghi thứ tự áp dụng và điều kiện caller. Không tạo BR để lấp bảng.

### 3.x.6 Truy cập dữ liệu và SQL — データアクセス・SQL

| Call-site ID/path/symbol/range | Mục đích | Table/column as written | C/R/U/D hoặc X | Connection | Nơi dựng/nơi thực thi SQL | Kết quả/handling | E-ref/Q-ID |
| ------------------------------ | -------- | ----------------------- | -------------- | ---------- | ------------------------- | ---------------- | ---------- |

Mỗi call site có SQL nguyên dạng hoặc code dựng SQL (string, query builder, ORM, mapper XML/annotation, embedded SQL) trong code block riêng + E-ref. SQL đã ghép là diễn giải, không phải quote nguyên văn; giữ biểu thức nguồn. SQL động unresolved phải còn trong bảng.

| Biến/tham số SQL | Nguồn giá trị | Kiểu biết được và căn cứ | Null/default/biến đổi | Điều kiện WHERE/JOIN/sort/group | E-ref |
| ---------------- | ------------- | ------------------------ | --------------------- | ------------------------------- | ----- |

DDL/type/PK/FK và CRUD tổng hợp tham chiếu DB Design. Schema mặc định không chứng minh object đích. Không thay SQL nối chuỗi bằng parameter binding trong mô tả hiện trạng.

### 3.x.7 Transaction, lỗi và cleanup — トランザクション・例外

| Tình huống/boundary | Điều kiện/phạm vi | Begin/commit/rollback thấy được | Cơ chế lỗi/nhánh xử lý | Side effect đã xảy ra/còn lại | Cleanup/tài nguyên | E-ref/Q-ID |
| ------------------- | ----------------- | ------------------------------- | --------------------------- | ----------------------------- | ------------------ | ---------- |

Không suy transaction từ cùng connection hoặc nhiều SQL liên tiếp. Nêu trạng thái dữ liệu/UI khi lỗi giữa chừng, đóng cursor/recordset/connection/file nếu có bằng chứng; thiếu thì chưa xác định.

### 3.x.8 Message, kết quả và điều hướng — メッセージ・画面遷移

| Điều kiện | Message nguyên văn/ID nếu có | Dịch riêng | Form/control/kết quả trả về | State giữ/xóa/thay đổi | Xử lý tiếp | E-ref |
| --------- | ---------------------------- | ---------- | --------------------------- | ---------------------- | ---------- | ----- |

Không tự tạo mã message theo mẫu tham khảo nếu source không có mã đó.

## 4. Báo cáo, file và tích hợp

### 4.1 Báo cáo/export — 帳票・出力マッピング

Với mỗi report/mode, ghép [Detail report template](detail-design-report.md) thành section con tại đây theo [hướng dẫn report](../report-templates.md). Dùng cùng Report ID/mode/field với phần [Basic report](basic-design-report.md); bảng query, vòng lặp, tính toán, mapping, serialization và lỗi chỉ định nghĩa một lần ở section report. Inventory và khối common của program tham chiếu vào đây, không lặp toàn bộ logic.

Không có report thì ghi không áp dụng + phạm vi kiểm; thiếu source/layout hoặc chưa xác định mode thì Q-ID. Template chuyên biệt thay bảng tóm tắt cũ ở mục này, không bỏ coverage/evidence.

### 4.2 Dependency/giao tiếp ngoài

| File/library/native/COM/API/queue/print/CSV/interface | Caller/call site | Input/output | Resolved/missing/unsupported | Tác động khi lỗi | E-ref/Q-ID |
| ---------------------------------------- | ---------------- | ------------ | ---------------------------- | ---------------- | ---------- |

## 5. Xử lý chung — 共通詳細設計参照

| Canonical shared ID/symbol | Input từ caller | Output sử dụng | Điều kiện gọi | Tác động kết quả/lỗi | Mục chuẩn + version | BR/E-ref |
| -------------------------- | --------------- | -------------- | ------------- | -------------------- | ------------------- | -------- |

Mô tả xử lý chung một lần bằng khối mục 3: tổng quan → input/output → bảng dùng → logic/SQL → điều kiện gọi/lỗi. Caller chỉ ghi mapping và điều kiện riêng. Trong gói hiện tại, tham chiếu mục trong detail-design đã xác định; tách thêm file common cần quyết định đóng gói, chưa mặc định artifact thứ bảy. Không copy tài liệu common của dự án tham khảo vào output specification-design.

Reference Markdown phải tồn tại, rõ version/snapshot. JSON v1 theo [mapping contract](../contract-mapping.md), chỉ references cùng payload. Không nhân bản BR chung để tăng KPI.

## 6. Rủi ro diễn giải và thiếu dữ liệu

| Hiện tượng có evidence | Nguy cơ hiểu sai | Phần ảnh hưởng | Đã biết/chưa biết | E-ref/Q-ID |
| ---------------------- | ---------------- | -------------- | ----------------- | ---------- |

Xét theo [checklist semantics chung](../analysis-method.md#4-checklist-semantics-chung) cho ngôn ngữ thực: kiểu/null, số học/rounding, chuỗi/ngày/locale, scope/state, lỗi/cleanup, transaction/đồng thời, biên dịch có điều kiện/macro/include, gọi động và hành vi ngầm. Không tự chọn build config, không mượn semantics của ngôn ngữ khác hoặc của mẫu tham khảo.

## 7. Coverage, questions và evidence registry

| File/inventory symbol ID/file-level code | ID xử lý/mục mô tả | Đã/chưa phân tích | Phần thiếu/chunk | Coverage/Q-ID |
| ------------------------------------ | ------------------ | ----------------- | ---------------- | ------------- |

Đối chiếu [coverage](coverage.md) và [questions](open-questions.md). Mọi đơn vị logic mục 2 phải ánh xạ hoặc có lý do chưa phân tích. Số đo do công cụ cung cấp, không AI tự đếm.

| E-ref | Relative POSIX path | Symbol nếu biết | startLine/endLine gốc | Claim/mục sử dụng |
| ----- | ------------------- | --------------- | --------------------- | ----------------- |

Sau mỗi E-ref đặt quote nguyên văn trong fenced block, giữ tab/khoảng trắng/tiếng Nhật, không thêm line prefix hoặc newline vào nội dung quote. Không AI đánh verified. E-ref chỉ là trình bày Markdown; evidence JSON vẫn chỉ path/startLine/endLine/quote.
