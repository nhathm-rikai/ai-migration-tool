# Đặc tả test đơn vị (単体テスト仕様書) — <PROGRAM>

**DRAFT TEMPLATE — spec-design-templates-0.11.0-draft.** [Phần đầu chung](../README.md). Tài liệu này do agent viết theo **checklist tất định** của Portal (`context/p1/1.4-ut-skeleton.json`), không phải theo ý agent về cái gì đáng test.

## 1. Phạm vi và cách làm

<Program, các file đã đọc, ngôn ngữ/runtime. Một câu: các case dưới đây được liệt kê từ source, mỗi case có evidence `file:dòng`>

Quy tắc bắt buộc (validator của Portal kiểm, sai thì gói bị từ chối):

- Mỗi hạng mục của checklist (`context/p1/1.4-ut-skeleton.json`, trường `items[].id`) có **ít nhất một case**, hoặc một dòng `対象外` kèm lý do không test được.
- Với mỗi hạng mục, đọc source của procedure/handler/câu SQL/report đó và **tự liệt kê case ở mức nhánh**: mỗi `If`/`ElseIf`/`Case`/vòng lặp (0, 1, nhiều lần), mỗi điều kiện biên và mỗi đường lỗi quan sát được trong code. Không bịa nhánh không có trong code.
- Mỗi case có evidence `đường/dẫn/file:dòng` là **file thuộc program** (trong `items[].file` hoặc file cùng program), dòng thật của nhánh/câu lệnh được test.
- Không thêm case cho ID không có trong checklist; không đổi ID.

## 2. Test case

Cột theo đúng thứ tự dưới đây (tiêu đề dịch theo ngôn ngữ đầu ra, vị trí cột không đổi). `対象ID` là ID của hạng mục checklist; `区分` là `テスト` hoặc `対象外`; `対象外理由` chỉ điền khi `対象外`. Một dòng một case; nhiều case cho cùng một hạng mục thì lặp `対象ID`.

| No | 対象ID | 大項目 | 中項目 | 小項目 | 前提条件 | 入力データ | 手順 | 期待結果 | 確認観点 | 根拠(file:行) | 区分 | 対象外理由 |
| -- | ------ | ------ | ------ | ------ | -------- | ---------- | ---- | -------- | -------- | ------------- | ---- | ---------- |

- `大項目`: procedure/màn hình/câu SQL/report; `中項目`: nhóm điều kiện (nhánh, biên, lỗi); `小項目`: điều kiện cụ thể của case.
- `入力データ`: giá trị cụ thể suy ra từ code (tên biến, giá trị, bảng/cột), không để chung chung.
- `期待結果`: kết quả quan sát được theo code hiện tại (giá trị trả về, thay đổi dữ liệu, thông báo), không phải kết quả "nên" có.

## 3. Hạng mục không test được (対象外)

<Danh sách ID đã đánh `対象外`, nhắc lại lý do và điều gì cần có để test (ví dụ DB, thiết bị in)>

## 4. Điểm chưa xác định

Theo [phần cuối chung](../README.md#phần-đầu-và-phần-cuối-chung): mục **Điểm chưa xác định** là section cuối cùng.
