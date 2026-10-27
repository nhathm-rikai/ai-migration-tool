# Specification design — quyết định chờ duyệt

**DRAFT — chờ duyệt.** Pack: spec-design-rules-0.4.0-draft. [Thứ tự đọc và nguồn quy định](README.md).

Report/export: đã bổ sung hai template Draft theo yêu cầu. Mặc định ghép section trong Basic/Detail, giữ sáu Markdown. Nếu cần bàn giao layout xlsx/per-report file riêng, cần chốt packaging, version/provenance và cách kiểm layout trước implementation; chưa tự đổi schema hoặc xây exporter. Xem [hướng dẫn report](report-templates.md).

Các quyết định bổ sung sau đối chiếu repo, tất cả **chờ duyệt**:

| Quyết định           | Đề xuất để review                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Mode calibration     | document-draft với sáu Markdown; JSON v1 là mode riêng có giới hạn                                                                       |
| Mapping/extension    | [Mapping](contract-mapping.md): bảng specification-design, shared cross-artifact, external provenance và envelope versions cần review trước implementation |
| Input/chunk manifest | [Phiếu input](templates/input-context.md) là yêu cầu bàn giao thủ công, chưa là schema máy đọc                                           |
| Điều kiện chạy       | Direct CLI: duyệt pack + preflight quyền/hash/version; Portal: cần enforcement/adapter/validator; Medium/High do TL chọn                 |
| Căn cứ KPI           | Xác nhận workbook được Draft dẫn gián tiếp; không tự thay ngưỡng                                                                         |
| Phân tích ngôn ngữ   | Không dùng profile theo ngôn ngữ; agent tự nhận diện có căn cứ, áp [quy trình chung](analysis-method.md) và template trung lập 0.2.0     |
| Luồng phase          | Áp phương pháp vận hành của [code-migration-kit-with-claude-code](https://github.com/anthropics/code-migration-kit-with-claude-code) (Apache-2.0, viết lại, không sao chép file): feasibility go/no-go, thứ tự từ inventory, bảng điểm ngầm định, [rulebook](rulebook.md), stress-test, generator + 2 reviewer + fixer, [run manifest](templates/run-manifest.md). Không áp dụng dịch/compile/parity chạy source cũ; script dependency map deferred sang context builder |

Capability parser/decoder và metadata/coverage liên ngôn ngữ cần review theo [contract mapping](contract-mapping.md). Chưa có calibration ngoài VB6 hoặc schema/runtime mới.

## 17. Phiếu duyệt bản rule này

| Quyết định cần duyệt    | Đề xuất v0.1                                                     | Trạng thái |
| ----------------------- | ---------------------------------------------------------------- | ---------- |
| Phạm vi specification-design              | Hiện trạng đa ngôn ngữ; không bao gồm migration rules            | Chờ duyệt  |
| Ngôn ngữ                | Tiếng Việt, giữ nhãn ngôn ngữ gốc và identifier                  | Chờ duyệt  |
| Packaging calibration   | Sáu Markdown; report ghép vào Basic/Detail khi áp dụng           | Chờ duyệt  |
| Deliverable mục tiêu    | BR xlsx; Basic/Detail/DB Markdown; KB repo/index trước           | Chờ duyệt  |
| Chính sách chứng cứ     | Claim observed có trace chính xác; thiếu thì question/hypothesis | Chờ duyệt  |
| Mẫu hiệu chỉnh đầu tiên | Theo language/runtime; pilot VB6 giữ KUNO0020 rồi Medium/High    | Chờ duyệt  |
| Review KPI              | Review toàn bộ BR; tách first-pass/after-correction              | Chờ duyệt  |
| Contract                | Giữ understanding-v1; thiết kế bổ sung có version cho bảng specification-design    | Chờ duyệt  |

Reviewer: chưa chỉ định. Ngày duyệt: chưa có. Quyết định: chưa có.

Bạn duyệt bộ rule sinh tài liệu ở bước này; TL vẫn phải duyệt từng tài liệu nghiệp vụ sinh ra ở bước sau. Hai lần duyệt không thay thế nhau.
