# Fixture VB6 tự tạo

Source giả lập, không lấy từ source khách hàng. Byte được giữ nguyên (CP932, CRLF/LF, có/không newline cuối) vì counter và evidence đo trên raw bytes; `.gitattributes` tắt chuyển đổi EOL cho thư mục này.

`LEGACY.CLS` là class module tự viết theo cấu trúc export VB6, vì corpus khách hàng không có `.cls`.

Nhãn dòng mong đợi viết tay trong `apps/api/src/modules/analysis/vb6/vb6-code-file.test.ts`, không sinh bằng counter. TL cần duyệt lại nhãn theo `docs/engineering/specs/source-analysis.md` §5 trước khi dùng làm baseline.
