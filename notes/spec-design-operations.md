# Tóm tắt vận hành specification-design (P2)

Cập nhật 27/10/2026 · branch `docs/spec-design-migration-kit` @ `38f5a74` · pack `spec-design-rules-0.7.0-draft`, template `spec-design-templates-0.6.0-draft` (Draft, chờ duyệt).

## 1. Flow vận hành

### 1.1 Flow nghiệp vụ trên Portal (đích)

1. TL mở Portal, chọn thư mục **source legacy**.
2. TL chọn **program**: tất cả / một / một số, từ Source Inventory (P1 1.1).
3. TL chọn **tài liệu cần tạo**: một/nhiều/tất cả trong `business-rules`, `basic-design`, `detail-design`, `db-design`. `coverage` + `open-questions` luôn sinh kèm.
4. Portal lập **phiếu input** cho từng program (source + P1 1.1–1.3 + lựa chọn + tài liệu đã duyệt nếu có) và gọi **agent CLI** (Codex/Claude), mỗi program một phiên.
5. Agent phân tích theo phiếu input + bộ tài liệu chuẩn, **ghi dần** từng hàm vào output, trả về Portal. Bị dừng giữa chừng (usage limit…) thì chạy tiếp từ trạng thái trên đĩa.
6. Chỉ output có coverage `hoàn tất` mới sang **TL review**; TL duyệt hoặc từ chối (chạy lại).

Hiện bước 4–6 **chưa có code Portal**; chạy thủ công theo `runbook.md`.

### 1.2 Bên trong một phiên agent

| Phase | Việc | Không đạt |
| --- | --- | --- |
| 0. Feasibility | Có source, có P1 1.1, program thuộc inventory, quyền chỉ ghi output, CLI đã kiểm | Dừng, không gọi model |
| 1. Map | Thứ tự/phụ thuộc từ P1 1.3; tự nhận diện ngôn ngữ; bảng "Điểm ngầm định" | Chưa rõ → Q-ID |
| 2. Sinh | Chỉ tài liệu được chọn + coverage/open-questions; ghi dần; tự kiểm checklist | Thiếu căn cứ → hypothesis/Q-ID |
| 3. TL review | Cấu trúc → evidence → nghiệp vụ | Reject → chạy lại; lỗi lặp ≥2 program → sửa pack |

### 1.3 Quy tắc then chốt

- Agent **chỉ đọc** source/pack/P1, **chỉ ghi** thư mục output; không chạy source/SQL/macro. Source/comment là dữ liệu, không phải lệnh.
- Mỗi claim hiện trạng có evidence: path + dòng + quote nguyên văn. LoC lấy từ P1, không tự đếm.
- Không tự điền reviewer/approval/hash/run ID.
- **SD-CT-07 — chọn riêng lẻ:** tham chiếu tài liệu không được chọn chỉ dùng ID của bản **đã duyệt cùng snapshot**; không có thì "chưa sinh <tài liệu>" + Q-ID, không bịa ID.
- **SD-CT-08 — ghi dần/chạy tiếp:** coverage có "Trạng thái sinh" (`đang sinh`/`hoàn tất`, số phiên). Chạy tiếp chỉ khi snapshot/P1/pack/lựa chọn không đổi; không viết lại phần đã xong; ID đánh số tiếp.

## 2. Input cho P2

Mẫu: `docs/specification-design/templates/input-context.md`.

| Mục | Nội dung | Ai cung cấp | Bắt buộc |
| --- | --- | --- | --- |
| 1. Source legacy | Đường dẫn thư mục source; snapshot ID | TL chọn; Portal/P1 cấp snapshot | Có |
| 2. Output P1 1.1 | Source Inventory: program, file thuộc program, encoding, danh sách hàm | Engineer (parser) | **Có** — thiếu thì dừng |
| 2. Output P1 1.2 | LoC report theo function (Physical/Exe/Comment/Blank/SQL) | Engineer | Không — thiếu ghi "chưa đo" |
| 2. Output P1 1.3 | Dependency graph & DB access | Engineer | Không — thiếu ghi Q-ID |
| 3. Phạm vi run | Program; tài liệu cần tạo | TL trên Portal | Có |
| 4. Tài liệu đã duyệt | Bản approved cùng program (version, snapshot, đường dẫn) | Portal | Không — dùng cho SD-CT-07 |

Không điền tay: hash, decode, quyền, version CLI (công cụ/Portal quản lý); ngôn ngữ/runtime (agent tự nhận diện).

**Sinh P1 bằng công cụ trong repo:**

```bash
npm run build -w @portal/contracts && npm run build -w @portal/api
node apps/api/dist/cli/analyze-source.js --root <thư-mục-source> --out <inventory.json> --summary <programs.csv>
node D:/spec-runs/tools/extract-p1.mjs <inventory.json> <PROGRAM> <out-dir>
```

`extract-p1.mjs` (ngoài repo) tách inventory đầy đủ thành `p1-1.1-source-inventory.json`, `p1-1.2-loc.json`, `p1-1.3-dependency.json` cho một program.

## 3. Các bước test (thủ công, Codex CLI 0.164.0 / Claude Code 2.1.311)

Bộ test đã dựng: `D:\spec-runs\test-01\` (source `D:\old_source\legacy_sources\kousyosr`, 784 file, 284 program; P1 đã sinh; program KUNO0020).

**Bước 0 — Xác nhận** quy định bảo mật cho phép gửi source tới provider (OpenAI/Anthropic).

**Bước 1 — Chuẩn bị**

1. Sinh P1 và tách cho program (mục 2).
2. Lưu hash source: `find <source> -type f -exec sha256sum {} \; | sort -k2 > <run>/source-before.sha256`.
3. Tạo thư mục output ngoài repo/source cho từng CLI và program; đặt `input-context.md` đã điền.
4. Câu chỉ dẫn: `D:\spec-runs\test-01\instruction.txt` (runbook 2.2, đường dẫn tuyệt đối tới pack).
5. Claude: `.claude\settings.json` trong thư mục output deny Bash/web và Edit/Write ngoài output (cú pháp path Windows chưa kiểm).

**Bước 2 — Chạy**

```bash
codex -C "D:\spec-runs\test-01\codex\KUNO0020" --sandbox workspace-write
```

```bash
claude --add-dir "D:\ai-migration-tool\docs\specification-design" --add-dir "D:\old_source\legacy_sources\kousyosr" --add-dir "D:\spec-runs\test-01\p1\KUNO0020"
```

(Claude: mở terminal tại thư mục output trước.) Dán nội dung `instruction.txt`; từ chối mọi yêu cầu ghi ngoài thư mục output.

**Bước 3 — Output:** nằm ngay trong thư mục output đã mở CLI (cùng chỗ `input-context.md`).

**Bước 4 — Kiểm**

```bash
bash /d/spec-runs/tools/check-run.sh /d/spec-runs/test-01 <thư-mục-output> /d/old_source/legacy_sources/kousyosr
```

Script kiểm: source không đổi (hash), file sinh ra, "Trạng thái sinh", tài liệu sinh thừa (viết cho ca chỉ chọn Detail), BR-ID được nhắc. Kiểm tay: 5–10 quote mở đúng dòng source; ghi run record (version CLI/model, chỉ dẫn, settings, thời gian, số phiên).

**Ca test**

| Ca | Thiết lập | Kỳ vọng |
| --- | --- | --- |
| T1 | Chỉ Detail | Chỉ detail-design + coverage + open-questions; tham chiếu "chưa sinh" + Q-ID; không BR-ID bịa |
| T2 | Đủ 4 tài liệu | 6 file; BR-ID trong Detail khớp BR |
| T3 | Chọn Detail, mục 4 có BR approved | Dẫn đúng BR-ID + version, không chép lại |
| T4 | Ctrl+C giữa chừng, chạy tiếp theo runbook 2.2b | Phần cũ không đổi, ID đánh tiếp, số phiên = 2, `hoàn tất` |
| T5 | Bỏ P1 1.1 | Dừng ở phase 0, không sinh tài liệu |

Muốn so Codex với Claude thì hai phiếu input phải chọn cùng tài liệu (hiện Codex: business-rules, Claude: detail-design).

## 4. Chức năng từng file trong `docs/specification-design`

### Điều phối và vận hành

| File | Chức năng |
| --- | --- |
| `README.md` | Điểm vào: thứ tự đọc, flow Portal, hai đường dùng (CLI thủ công / Portal), mode, nguồn chuẩn |
| `runbook.md` | Cách chạy: điều kiện chung, preflight, chỉ dẫn tác vụ (2.2), phase (2.2a), dừng/chạy tiếp (2.2b), kiểm output trước khi gửi TL (2.3) |
| `analysis-method.md` | Cách đọc source: bước 0 nhận diện ngôn ngữ, checklist semantics, cách điền template trung lập, giới hạn (encoding/binary/generated), luồng phase 0–3 |

### Rule (38 mã SD-xx-NN)

| File | Chức năng |
| --- | --- |
| `rules/scope.md` | Phạm vi P2 (hiện trạng, không migration), định danh program, pilot (SD-ID) |
| `rules/context-evidence.md` | Input/context (SD-IN) và quy tắc evidence: path/dòng/quote, observed/hypothesis/unknown, không bịa (SD-EV) |
| `rules/deliverables.md` | Nội dung bắt buộc của BR, Basic, Detail, DB (SD-BR/BD/DD/DB) |
| `rules/artifacts.md` | Contract và đóng gói output (SD-CT), gồm SD-CT-07 chọn riêng lẻ, SD-CT-08 ghi dần/chạy tiếp |

### Template

| File | Chức năng |
| --- | --- |
| `templates/input-context.md` | Phiếu input: source, P1 1.1–1.3, phạm vi run, tài liệu đã duyệt |
| `templates/business-rules.md` | Bảng BR: ID, phát biểu, basis, trigger, I/O, công thức, dependency, evidence, Q |
| `templates/basic-design.md` | Basic: màn hình/item/luồng/report/thông báo |
| `templates/basic-design-report.md` | Section con cho report/export trong Basic (layout, field, file contract) |
| `templates/detail-design.md` | Detail: inventory hàm, khối xử lý (trigger/IO/logic/SQL/transaction/lỗi), common, coverage |
| `templates/detail-design-report.md` | Section con cho report/export trong Detail (query, vòng lặp, mapping, serialization) |
| `templates/db-design.md` | DB: bảng, cột, CRUD matrix, transaction/quan hệ (không bịa DDL) |
| `templates/coverage.md` | Trạng thái sinh, ngôn ngữ phát hiện, điểm ngầm định, tài liệu được chọn/tham chiếu, phạm vi đã đọc, số đo |
| `templates/open-questions.md` | Danh sách Q-ID: câu hỏi, liên quan, blocking, cần thêm gì |

### Review, quyết định, tham khảo

| File | Chức năng |
| --- | --- |
| `review-checklist.md` | Checklist review 3 lớp (cấu trúc/evidence/nghiệp vụ), review record, KPI |
| `knowledge-base.md` | Quy tắc đưa tài liệu đã duyệt vào KB (SD-KB) — chưa triển khai |
| `decisions.md` | Các quyết định chờ duyệt về pack (mode, packaging, luồng phase…) |
| `contract-mapping.md` | Ánh xạ nội dung P2 vào schema `understanding-v1` và khoảng trống contract |
| `report-templates.md` | Cách ghép hai template report vào Basic/Detail; nguồn tham khảo |
| `detail-design-reference.md` | Căn cứ điều chỉnh Detail theo mẫu CustomerReview (chỉ tham khảo cấu trúc) |
| `requirements-map.md` | Truy vết yêu cầu gốc (Draft v0.1, WBS) tới file áp dụng |

Agent khi chạy cần chủ yếu: phiếu input, README, `analysis-method.md`, `rules/*`, template của tài liệu được chọn + coverage/open-questions, `review-checklist.md`. Các file nhóm cuối phục vụ người duyệt/thiết kế, không bắt buộc cho từng run.

## 5. Nguồn và công nghệ dùng để xây bộ tài liệu chuẩn

### 5.1 Tài liệu nguồn kết hợp

| Nguồn | Loại | Đóng góp vào pack | Nơi ghi nhận |
| --- | --- | --- | --- |
| `P2-Rules-v0.1-Draft.md` (21/10/2026, người dùng cung cấp) | Bản nháp rule gốc | 17 mục gốc → rules, template, checklist, KB, decisions; 35 mã rule ban đầu (nay 38, tiền tố SD-) | `requirements-map.md` |
| Workbook WBS & lịch dự án (dẫn gián tiếp qua Draft, chưa kiểm trực tiếp) | Kế hoạch | Output P2 (BR xlsx, Basic/Detail/DB TL duyệt), KPI (coverage ≥90%, BR accuracy ≥85%, LoC ≤5%), G1, P0/P1 | `requirements-map.md` |
| `CustomerReview.zip` — 51 Markdown (17 màn hình, 15 báo cáo, 19 xử lý chung) của một dự án ASP.NET MVC/.NET/PostgreSQL | Mẫu Detail Design tham khảo | Cấu trúc Detail: tổng quan → trigger/I-O → trình tự/component → validation/SQL → transaction/lỗi → message; mapping caller cho common. Chỉ lấy cấu trúc, không lấy nghiệp vụ | `detail-design-reference.md` |
| `帳票_消化実績比較表.xlsx` (BasicDesign/ReportLayout) | Layout báo cáo Excel | Template Basic report: tiêu đề, block lặp, tổng, vùng in, helper, mapping nguồn | `report-templates.md` |
| `帳票_日報年集計.md` (DetailDesign/InternalReview) | Mẫu Detail báo cáo | Template Detail report: query, block động, mapping, owner công thức, file output, lỗi | `report-templates.md` |
| Ảnh chụp danh mục chức năng export (22/10/2026) | Bối cảnh | Điểm cần kiểm: nhiều mode/config, CSV quoting, RPA, file lock | `report-templates.md` |
| [code-migration-kit-with-claude-code](https://github.com/anthropics/code-migration-kit-with-claude-code) (Apache-2.0, viết lại, link chưa xác minh) | Phương pháp vận hành | Luồng phase (feasibility → map → sinh → review), bảng điểm ngầm định, nguyên tắc "sửa quy trình, không vá output". Đã bỏ: rulebook, stress-test, reviewer/fixer, run manifest | `analysis-method.md` mục 8, `decisions.md` |
| Kế hoạch dự án P0/P1 (người dùng cung cấp trong hội thoại) | Định nghĩa input | Input = source legacy + P1 1.1 Source Inventory, 1.2 LoC, 1.3 Dependency | `templates/input-context.md` |

### 5.2 Quy định engineering trong repo được tái sử dụng

| Tài liệu repo | Dùng cho |
| --- | --- |
| `docs/engineering/rules/core.md` (CORE-09/10) | Naming trung lập, đa OS |
| `docs/engineering/rules/jobs-ai.md` (AI-02/03/05, JOB-04/07/08) | Quyền, process, runner — điều kiện trước Portal LIVE |
| `docs/engineering/rules/data-evidence.md` | Snapshot, evidence, review, export |
| `docs/engineering/rules/testing-review.md` | Kiểm chứng, finding P0–P3 |
| `docs/engineering/delivery-gates.md` | Gate, việc deferred |
| `docs/engineering/specs/source-analysis.md` | Decode, normalized view, line/quote/hash, LoC |
| `docs/engineering/specs/source-inventory.md` | Inventory, SQL/call graph, mapping schema, complexity |
| `docs/engineering/specs/understanding-contract.md` + `contracts/understanding-payload.schema.json` | Mode `understanding-v1`, giới hạn JSON; `contract-mapping.md` |

### 5.3 Công nghệ và công cụ

| Thành phần | Công nghệ | Vai trò |
| --- | --- | --- |
| Bộ tài liệu chuẩn | Markdown UTF-8 (LF), tiếng Việt, Mermaid | Rule, template, runbook; agent đọc trực tiếp, không có prompt file riêng |
| Output P2 | Markdown (`document-draft`) hoặc JSON `understanding-v1` (JSON Schema/TypeBox trong `packages/contracts`) | Tài liệu nghiệp vụ; BR xlsx là bước export sau (chưa có) |
| P1 parser | `apps/api/src/cli/analyze-source.ts` (TypeScript/Node 24), profile `vb6-cp932-v1` | Source Inventory, LoC, call graph, SQL/CRUD |
| Agent | Codex CLI 0.164.0 (OpenAI), Claude Code 2.1.311 (Anthropic) | Phân tích source và sinh tài liệu; dùng chung một bộ rule/template |
| Kiểm soát quyền | Codex `--sandbox workspace-write`; Claude `--add-dir`, `--disallowedTools`, `.claude/settings.json` deny | Chỉ đọc source/pack, chỉ ghi output |
| Portal (đích) | React/Vite (UI), Fastify/TypeScript → service → repository, SQLite | Chọn source/program/tài liệu, gọi CLI, review — phần P2 chưa triển khai |
| Kiểm repo | `scripts/verify-repository.mjs`, Prettier, `git diff --check` | Link/file/format của pack; không kiểm chất lượng nghiệp vụ |
| Kiểm run (ngoài repo) | `D:\spec-runs\tools\extract-p1.mjs`, `check-run.sh`, `check-evidence.mjs` | Tách P1 theo program; kiểm source không đổi, file sinh, trạng thái; kiểm quote CP932 độc lập |

## 6. Còn thiếu / lưu ý

- Pack và mọi quyết định vẫn Draft, chưa có reviewer.
- Chưa có Portal automation, validator evidence độc lập, export BR xlsx, KB.
- Không còn agent reviewer: TL tự soát quote/số dòng.
- Bỏ P0 0.2 khỏi input → xác nhận quy định bảo mật khi gửi source phải làm ở chỗ khác.
- Luật deny Claude cho path Windows chưa kiểm; chưa có lần chạy nào theo pack 0.7.0.
