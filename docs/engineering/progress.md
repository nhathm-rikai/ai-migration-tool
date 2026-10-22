# Tiến độ kỹ thuật Portal

Nhật ký độc lập của repo sản phẩm. Sau implement/quyết định kỹ thuật ghi scope, command/bằng chứng và giới hạn ở đây; review-only chỉ báo trong chat.

## Phạm vi hiện tại

- Gate init FE + BE; Projects/UI/API/storage, fixture + fake runner. Fastify → service → repository, SQLite thật, TypeBox contracts.
- Đã có [FE Projects](../../apps/web/README.md) gọi API thật. Đã có thư viện Analyze tĩnh (decode/manifest/LoC, SQL/CRUD, call graph, complexity v0) tại `apps/api/src/modules/analysis` và CLI `analyze-source`, chưa nối API/job. Chưa Understand, Claude CLI, LIVE/MS1 hoặc conversion.
- Runtime mục tiêu Windows/macOS/Linux; hiện chỉ kiểm native trên Windows x64, Node 24.16.0/npm 12.0.2.

## 22/10/2026 — Cho Claude tự chọn skill implement

- Dùng `portal-implement` và `skill-creator`; scope cấu hình coding agent và tài liệu, không đổi runtime sản phẩm. Theo yêu cầu người dùng, đặt `disable-model-invocation: false` cho Claude `portal-implement`; `portal-techlead-review` tiếp tục gọi tường minh và review-only.
- Đồng bộ AGENTS.md, CLAUDE.md, hướng dẫn tích hợp và validator metadata theo policy riêng của từng skill. Không thay workflow/rule gốc hoặc wrapper Codex.
- Kiểm chứng trên Windows: `node scripts/verify-repository.mjs` pass (36 documents, 306 links, 4 skill frontmatters); Prettier check sáu file thay đổi và `git diff --check` pass sau sửa format validator. Chưa smoke discovery/tự chọn trong session Claude mới; bật policy không bảo đảm model luôn tự chọn skill. Không chạy test sản phẩm vì không đổi code/runtime sản phẩm.

## 22/10/2026 — C01 hợp đồng Analyze source/run/artifact

- Làm theo workflow `portal-implement`; gate FEATURE:jobs/storage/analysis, dữ liệu fixture, không route/DB/runtime mới. Baseline `1d49deb`, nhánh `feat/c01-analyze-run-contracts`.
- Contracts: `source-registration.schema.ts` (PUT/GET source, mapping `unconfigured|assumed|confirmed`, summary không có root tuyệt đối), `run.schema.ts` (Run union theo 7 status, config khóa gồm profile/mapping/phiên bản analyzer/limits, start + `Idempotency-Key`, retry `current-source|reuse-snapshot`, list/current/cancel, runtime status, SSE event), `artifact.schema.ts` (ref + envelope inventory theo exact version), `analyze-api.ts` (bảng operation: method/path/schema/status/mã lỗi), `AnalyzeApiErrorCodeSchema` + HTTP status. Fixture sạch qua subpath `@portal/contracts/fixtures`. Đặc tả: [analyze-run-contract](specs/analyze-run-contract.md).
- Quyết định: Project DTO không đổi; project demo có source `fixture` revision 1, PUT source trên demo trả `409 PROJECT_MODE_CONFLICT`; project `mode: 'local'` chốt trong B03 kèm migration. Runtime cần recovery trả `503`. `stateVersion` chỉ tăng khi đổi status. Mã analyze tách khỏi catalog Projects đến khi BE/FE có route/màn hình dùng.
- Contracts có test riêng (`npm run test -w @portal/contracts`, đã thêm vào `npm test`): 36 test cho C01-AC01/AC02/AC03, negative field/ID/status/config, bảng operation. Windows x64, Node 24.16.0/npm 12.0.2: `npm run check` pass (format, lint, typecheck, test contracts 36 + API 233 + web 41, build).
- Sửa 2 finding P2 review `f5345e4` (đã tái hiện trước khi sửa): cancel trả 202 khi `cancelling`, 200 khi `cancelled` (`successStatuses`, `cancelRunSuccessStatus`, BE-03); Run `reuse-snapshot` bắt buộc `retryOfRunId` + `sourceSnapshotId` ở mọi status, run `current-source` queued không có snapshot; thêm fixture `reuseSnapshotRunFixture`, request reuse trỏ tới run gốc có snapshot; 39 test contracts.
- Sửa regression P2 review `f28e020`: `runVariants` nhận `currentSnapshot: TSchema` nên `Run.sourceSnapshotId` nhánh `current-source` thành `unknown` (runtime vẫn đúng). Giữ generic `S extends TSchema`; thêm `run.types.test.ts` (`expectTypeOf`, chạy trong typecheck) khóa type snapshot/status, đã xác nhận test này fail trên `f28e020`.
- Chưa làm (task sau): route/service/migration B03/B04/B07/B09, message VI/JA F01/F02/F03, project `local`. Limits trong fixture là số giữ chỗ, số thật chốt sau spike JOB-07.

## 19/10/2026 — mapping tên bảng theo schema (giả định)

- Làm theo nội dung skill `portal-implement` (SKILL.md, delivery gates, workflow implement, CORE, DATA, QA); phiên cloud không gọi skill trực tiếp. Scope feature / analysis, source thật chỉ đọc trên máy. Theo review bản đề xuất 2 (`analysis/de-xuat-tl-analyze-vb6.md` trong thư mục dự án, ngoài repo): gộp schema được duyệt có điều kiện.
- `table-name-v1`: CLI nhận `--default-schema <schema>` (và `--schema-confirmed` khi người quản lý DB đã xác nhận); inventory ghi `tableNames = { version, defaultSchema, status }`, mặc định `assumed`. Không cấu hình thì `unconfigured`. Schema không gắn cứng trong code (CORE-09).
- Giữ tên như trong source ở `sqlTables`/`crud`, `metrics.tables`, `complexity`. Thêm góc nhìn sau mapping: `normalizedCrud` (kèm `names` gốc), `metrics.normalizedTables`, `normalizedComplexity`; CSV thêm cột tương ứng và `tableNameMapping`. Chỉ đổi chữ hoa với identifier không có dấu nháy. Contract thêm trường optional, giữ `source-inventory-v1`.
- Container Linux, Node 22: prettier, lint, typecheck, build, `verify-repository` pass; **233 test API** pass; smoke CLI: schema sai hoặc `--schema-confirmed` thiếu schema trả mã 2. Chưa chạy `npm.cmd run check` trên Windows sau thay đổi này.
- Source thật với `--default-schema HAN01`: JSON hợp schema; số liệu theo tên gốc không đổi. Sau mapping: 195 → 130 tên bảng, 45/284 program giảm số bảng, 5/284 program đổi mức complexity (low 105, medium 143, high 36); 15 program pilot không đổi mức. 7 program chưa complete vẫn được đánh dấu `complete = false`.

## 16/10/2026 — sửa 1 finding review A01b lần 4

- Làm theo nội dung skill `portal-implement` (SKILL.md, delivery gates, workflow implement, CORE, DATA, QA); phiên cloud không gọi skill trực tiếp. Scope feature / analysis, source thật chỉ đọc trên máy.
- Review `CHANGES_REQUIRED` (commit `42b51f9`): [P2] `If f Then If g Then A Else B Else C` gắn `Else` thứ hai vào `If g` đã có `Else`, sinh thêm bảng giả `TZ`. Đã tái hiện bằng test trước khi sửa.
- SQL `sql-access-v4`: `Else` thuộc `If` một dòng gần nhất chưa có `Else`; `If` bên trong đã có `Else` được đóng trước (theo MS-VBAL §5.4.2.9, chưa chạy compiler VB6). Thêm 2 regression test (đứng riêng và nằm trong khối `If` nhiều dòng, có statement vô điều kiện phía sau).
- Container Linux, Node 22: prettier, lint, typecheck, build, `verify-repository` pass; **217 test API** pass. Chưa chạy `npm.cmd run check` trên Windows sau thay đổi này.
- Source thật: 0 lỗi decode/unclassified, 277/284 complete, JSON hợp schema, 0 SQL động; 2202 dòng bảng/CRUD và complexity mọi program không đổi so với `sql-access-v3` (15/15 khớp).

## 16/10/2026 — sửa 1 finding review A01b lần 3

- Làm theo nội dung skill `portal-implement` (đọc SKILL.md, delivery gates, workflow implement, CORE, DATA, QA); phiên cloud không gọi skill trực tiếp. Scope feature / analysis, source thật chỉ đọc trên máy.
- Review `CHANGES_REQUIRED` (commit `0f1679e`): [P2] `If f Then If g Then ... Else ...` mở hai nhánh nhưng cuối dòng chỉ đóng một, nên dòng sau chỉ cập nhật một nhánh (ra `T` thay vì `TZ`). Đã tái hiện bằng test trước khi sửa.
- SQL `sql-access-v3`: mọi `If` một dòng, kể cả lồng nhau, đóng hết ở cuối dòng; khối `If` nhiều dòng bao ngoài vẫn mở. Thêm 2 regression test (đứng riêng và nằm trong khối `If` nhiều dòng).
- Container Linux, Node 22: prettier, lint, typecheck, build, `verify-repository` pass; **215 test API** pass. Chưa chạy `npm.cmd run check` trên Windows sau thay đổi này.
- Source thật: 0 lỗi decode/unclassified, 277/284 complete, JSON hợp schema, 0 SQL động; 2202 dòng bảng/CRUD và complexity của mọi program không đổi so với `sql-access-v2` (15/15 khớp).

## 16/10/2026 — sửa 5 finding review A01b lần 2

- Review `CHANGES_REQUIRED` (commit `8632c9e`): cả 5 finding tái hiện được trước khi sửa.
- [P1] Guard chỉ coi segment `..` nguyên vẹn là đi ra ngoài (tên `..notes.bas` là file con). [P1] So file ID (dev + inode/NTFS file ID) của output với file source vừa đọc và giữa hai output, nên hardlink bị từ chối; output ghi vào file tạm cùng thư mục rồi rename đè, không ghi xuyên qua file cũ.
- SQL `sql-access-v2`: If/ElseIf/Else và Select Case được theo như các đường chạy riêng (tối đa 8, quá thì gộp và phần khác nhau thành giá trị runtime), không ghép chữ của hai nhánh loại trừ nhau; property `obj.SQL = obj.SQL & ...` được theo dõi như biến.
- Call graph `call-graph-v2`: tên có hậu tố `$` (`F$()`) nối về `Function F$`, giữ phân biệt gọi đệ quy với gán giá trị trả về.
- Container Linux, Node 22: prettier, lint, typecheck, build pass; **213 test API** pass. Chưa chạy `npm.cmd run check` trên Windows sau thay đổi này.
- Source thật: 0 lỗi decode/unclassified, 277/284 complete, JSON hợp schema, 0 SQL động; complexity 15 program pilot không đổi (15/15).

## 16/10/2026 — sửa 6 finding review A01b

- Review `CHANGES_REQUIRED` (commit `83892a9`): cả 6 finding tái hiện được bằng dữ liệu giả lập trước khi sửa.
- [P1] CLI so đường dẫn vật lý (giải symlink/junction, kể cả thư mục cha chưa tồn tại) trước khi đọc và ngay trước khi ghi; từ chối output trong source và `--out`/`--summary` trùng file vật lý. Code ở `apps/api/src/cli/output-guard.ts`, test dùng junction trên Windows, symlink trên macOS/Linux.
- SQL `sql-access-v1`: dựng chuỗi theo statement/biến (`x = x & ...`, biến ghép biến, nối dòng ` _`), literal ghép đúng như viết, chuỗi không thuộc SQL không bị ghép vào; tên bảng dính giá trị runtime → `dynamicSql`; bỏ qua string `'...'` và comment `--`, `/* */` trong SQL; dòng của từng bảng là dòng viết tên bảng.
- Call graph `call-graph-v1`: giữ lời gọi đệ quy; `F = ...` và `F` trơn trong `F` là giá trị trả về; dòng khai báo không tính là lời gọi.
- CSV: ô text bắt đầu `= + - @`, tab, CR được thêm `'` (OWASP CSV injection).
- Container Linux, Node 22: prettier, lint, typecheck, build pass; **200 test API** pass. Test FE trong container lỗi do bản `apps/web` trong container cũ hơn máy, không liên quan thay đổi này; cần `npm.cmd run check` trên Windows.
- Source thật: 0 lỗi decode/unclassified, 277/284 complete, JSON hợp schema; complexity 15 program pilot không đổi (15/15). CRUD tìm thêm bảng ghép qua biến (ví dụ `KTUJNL2` trong KTBO0020).

## 15/10/2026 — hoàn thiện parser theo output P1 (A01b)

- Làm theo `docs/engineering/workflows/implement.md` (phiên cloud không gọi được skill `portal-implement`); scope feature / analysis / CLI dev. Không đổi FE, HTTP contract, DB hay dependency. Source khách hàng chỉ đọc trên máy, không copy vào repo.
- SQL/CRUD lexical `sql-access-v0`: bảng từ string literal theo procedure (INSERT/SELECT…FROM/JOIN/UPDATE/DELETE, DDL `X` cho bảng tạm); tên bảng là biểu thức runtime → `dynamicSql`, không đoán. Thêm `Declare` (API native), label, `decisionPoints`, `visibility`.
- Program: `shared` cho file nhiều program dùng; call graph `call-graph-v0` (local/program/external/ambiguous, không chọn bừa khi trùng tên); CRUD từ code riêng + procedure shared gọi tới được; metrics và complexity `complexity-v0-draft` (nháp, TL chốt). Schema TypeBox `source-inventory-v1` trong contracts, test kiểm inventory khớp schema. Đặc tả [source-inventory](specs/source-inventory.md).
- CLI `analyze-source`: walk thư mục, bỏ symlink/file > 16 MB, từ chối output trong thư mục source, `--summary` xuất CSV theo program.
- Sửa khi chạy source thật: key `.vbp` có ngoặc (`FavorPentiumPro(tm)=0`), module khai báo trong `.vbp` dạng `.TXT` được phân tích như code.
- Container Linux, Node 22: prettier (apps/api, packages, tests), lint, typecheck, **174 BE tests/19 files** (cả FE tests trong `npm test`), build, `verify-repository` pass. Chưa chạy `npm.cmd run check` trên Windows sau thay đổi này.
- Source thật (784 file, 284 `.vbp`): 0 lỗi decode, 0 dòng unclassified, 277/284 program complete (7 thiếu `cmn/SFTP.bas`), JSON hợp lệ schema. 1336/1357 procedure gọi ExecuteSQL/CreateDynaset có bảng; phần còn lại là sequence từ DUAL hoặc SQL truyền qua tham số. 15 program pilot: complexity v0 khớp Low/Medium/High 15/15 (ngưỡng chọn theo chính danh sách này).
- Còn mở: TL chốt Executable/SQL LoC, công thức complexity, gộp tên bảng có/không schema; xlsx export; đếm tay 1.5; nối API/job.

## 15/10/2026 — xác minh parser A01a trên Windows

- Phạm vi feature / analysis / fixture tự tạo, không AI hoặc source khách hàng; source đã có trong commit `59f5b2d` (`paser VB6 & i18n`). Bước chốt này chỉ bổ sung bằng chứng kiểm chứng, không sửa parser hoặc FE.
- `npm.cmd run check` pass trên **Windows x64, Node 24.16.0/npm 12.0.2**: format check, lint, typecheck, **160 API tests/17 files + 41 web tests/4 files**, build contracts/API/Vite. Chạy ngoài sandbox để test junction và HTTP loopback có quyền thực thi; không bỏ qua test.
- Smoke bằng Node trên JavaScript vừa build trong `apps/api/dist` xác nhận cả 5 trigger review trước: keyword trước colon/comment vẫn tính code; End Sub/Function/Property sau colon đóng đúng procedure; dòng unclassified làm program incomplete; VBP hỏng giữ unsupported; UTF-32LE/BE bị từ chối. Chỉ dùng bytes giả lập trong bộ nhớ, không tạo report hoặc sửa fixture.
- Bằng chứng này áp dụng thư viện Analyze tĩnh; chưa chứng minh KPI corpus <= 5%, baseline TL duyệt, source thật/LIVE, call graph, CLI/API/job Analyze hoặc native macOS/Linux. Kết luận reviewer sau commit được báo riêng trong chat.

## 15/10/2026 — hoàn thiện mẫu đa ngôn ngữ sau review

- Dùng `portal-implement`; gate feature / Projects UI / fixture. Chỉnh ba đề xuất đã xác nhận: `LocaleProvider` đồng bộ `html.lang` bằng layout effect trước paint, lưu preference ở passive effect riêng; catalog export `viMessages`/`jaMessages` để tránh nhầm `vi` của Vitest; Việt hóa nhãn bước và nội dung Workspace/source/legacy, bỏ nhãn Fixture thừa ở hai locale.
- Cập nhật [mẫu đa ngôn ngữ](patterns/localization.md) với naming catalog, thuật ngữ dùng thống nhất, ngoại lệ viết tắt và thông báo chẩn đoán frontend/backend, cùng lý do tách hai effect. Không thêm dependency hoặc thay API/DB; giữ nguyên thay đổi parser/fixture của task khác.
- Regression mới kiểm document language đã khớp khi passive effect của component con chạy lúc mount tiếng Nhật và đổi sang Việt, cùng phục hồi khi unmount. Test này fail trên implementation cũ, pass sau sửa; toàn bộ **41 FE tests/4 files** pass. `npm.cmd run lint -w @portal/web`, `npm.cmd run typecheck -w @portal/web`, `npm.cmd run build -w @portal/web`, `npm.cmd run format:check`, `node scripts/verify-repository.mjs` và `git -c core.autocrlf=false diff --check` pass.
- Browser IAB: Việt/Nhật trên desktop 1280px và mobile 390px, nhãn Việt dài hơn vẫn không tràn ngang; reload giữ Nhật, `html.lang` đúng locale, console không error/warn. Chỉ xem UI/list qua API local đang có, không tạo/sửa project. Ảnh local tại `test-results/localization-baseline/vi-desktop.jpg` (Git ignored); Vite smoke riêng đã dừng, viewport/preference đã khôi phục.
- Kiểm thực tế Windows x64, Node 24.16.0. Không chạy lại suite BE cho thay đổi chỉ FE này; chưa kiểm native macOS/Linux hoặc bản dịch với reviewer bản ngữ. Không đổi cấu trúc catalog theo feature hay thêm ICU/lazy loading trong phạm vi này.

## 15/10/2026 — sửa 5 finding review parser (A01a)

- Review tech lead `CHANGES_REQUIRED`, 5 finding P2; cả 5 tái hiện đúng trên code trước sửa và đã sửa kèm regression:
  1. `Stop:`/`End:`/`Return:`/`Resume:`... trước comment bị coi là label → dòng code thành comment. Lexer loại reserved word đứng một mình khỏi label.
  2. `x = 1: End Sub` không đóng procedure → cả file `unsupported`. Lexer trả `statementStarts` (mọi statement sau label/`:`; bỏ phần đầu dòng continuation); counter xét tất cả, mỗi dòng vật lý vẫn tính một lần (procedure một dòng `Sub A(): End Sub` cũng vậy).
  3. Program `complete: true` khi còn `unclassifiedLines`. `complete` nay yêu cầu project parse được, mọi member analyzed và unclassified = 0.
  4. `.vbp` hỏng thành project rỗng hoàn tất. Parser `.vbp` yêu cầu `Type=Exe|OleDll|OleExe|Control`, dòng không phải `key=value` ở section chính → `unsupported` (`PROJECT_TYPE_MISSING` / `PROJECT_LINE_UNRECOGNIZED` + dòng); inventory giữ program `status: unsupported`, cộng vào `unsupportedFiles`.
  5. BOM UTF-32LE `FF FE 00 00` bị đọc là UTF-16LE. Decoder kiểm BOM UTF-32LE/BE trước UTF-16, trả `SOURCE_ENCODING_UNSUPPORTED`.
- Kiểm chứng Linux x64, Node 22.22.0: lint, typecheck, test (**API 160/17 files**, analysis 86, web 33), build pass; prettier pass cho `apps/api`, `packages`, `tests`; `verify-repository` pass. Chưa chạy lại trên Windows/Node 24.16.0.

## 15/10/2026 — thư viện Analyze tĩnh: decode, manifest, LoC VB6 (A01a)

- Làm theo `docs/engineering/workflows/implement.md` (phiên cloud không gọi được skill `portal-implement`), scope feature / analysis / fixture tự tạo, không AI, không đọc source khách hàng. Theo `source-analysis-v1`.
- `apps/api/src/modules/analysis/`: core trung lập ngôn ngữ gồm `source-decoder.ts` (BOM → override → default profile, CP932 qua `TextDecoder('windows-31j')` strict, NUL/không profile báo lỗi, ASCII ghi `ascii`), `source-text.ts` (tách CRLF/LF/CR, normalized LF, quote evidence), `source-manifest.ts` (raw/normalized SHA-256, snapshot hash gồm profile/decoder/normalization version), `source-inventory.ts` (inventory `source-inventory-v1`: file, program từ project file, unique vs per-program counters, coverage). Ranh giới ngôn ngữ ở `language-analyzer.ts`; `source-profiles.ts` chọn analyzer compiled-in theo profile ID, không load plugin lúc chạy.
- `vb6/`: lexer dòng (string `""`, `'`, `Rem` đầu statement, `:`, label/line number, continuation code/comment), counter `vb6-physical-code-v1` (designer `.frm` theo VERSION/Begin-End/`Attribute VB_Name` top-level, Attribute = metadata, unclassified riêng), tách Sub/Function/Property Get/Let/Set; parse `.vbp` (member, Reference, Object; bỏ qua sau `[Section]`). Cấu trúc lỗi → `unsupported` có reason/dòng, không báo 0 LoC. Role: `.bas/.frm` code, `.vbp` project, `.frx` resource, `.cls/.ctl/...` unsupported, còn lại excluded. Member path khác hoa/thường được resolve và gắn `case-mismatch`.
- Profile ID dùng `vb6-cp932-v1` thay `bsn-vb6-cp932-v1` của spec theo CORE-09 (không tên khách hàng trong code); spec cần cập nhật tên profile.
- Fixture tự tạo `tests/fixtures/vb6-sample/` (CP932 mở rộng NEC/IBM, CRLF/LF, không newline cuối, designer, Attribute, Rem/string/colon/continuation, label, Declare, `#If`, Property, `.frx`, `.cls`, member thiếu/khác case). `.gitattributes` thêm `tests/fixtures/** -text`. Nhãn dòng viết tay trong test, **TL chưa duyệt** theo spec §5.
- Kiểm chứng trên **Linux x64 (container), Node 22.22.0/npm 10.9.4**, clean `npm ci` (engine-strict tắt vì Node khác bản khóa): lint, typecheck, test (**API 140 tests/17 files**, web 33/3), build pass; prettier pass cho `apps/api`, `packages`, `tests`. `prettier --check .` toàn repo fail ở 4 file `apps/web/src/shared/i18n/*` đang được task FE khác sửa, ngoài scope. `node scripts/verify-repository.mjs` pass. Chưa chạy lại trên Windows/Node 24.16.0.
- Chưa làm (A01b/tiếp theo): call graph tới `cmn/`, trích SQL/bảng Oracle, complexity, CLI chạy trên thư mục local, contract TypeBox/API/job Analyze, WorkspaceProvider. Đọc source BSN thật cần decoder được đối chiếu với người biết tiếng Nhật và điều kiện LIVE/DATA-03; chưa thực hiện.

## 15/10/2026 — UI sáng cố định và đa ngôn ngữ Việt/Nhật

- Dùng `portal-implement`; scope feature / Projects UI / API fixture, không source khách hàng hoặc AI thật. Bỏ toàn bộ state/control/palette tối và icon sun/moon; giữ `color-scheme: light`. Header thay bằng bộ chọn Tiếng Việt/日本語.
- `shared/i18n/`: catalog Việt làm nguồn type `Messages`, catalog Nhật dùng `satisfies Messages`; đăng ký locale/name bản địa/Intl ở `locale.ts`. Nội dung màn hình, accessible label, placeholder, validation và error/recovery chuyển sang catalog; nội suy giới hạn dùng policy contracts. Giữ nguyên tên dự án, ID, fixture và public error code. Không đổi dependency/API/domain/DB trong task FE này.
- LocaleProvider cập nhật `html.lang`, formatter thời gian và preference `portal.locale` đã validate; default Việt, storage không khả dụng thì giữ chuyển ngôn ngữ trong phiên. Form/list/detail giữ lỗi dạng dữ liệu và dịch khi render; success dùng state key/boolean. Đổi locale không reset input/selection/cursor/pending hoặc phát lại request/mutation.
- Browser phát hiện context identity bị lệch khi Vite hot update sau build contracts. Đã tách context/hook sang `locale-context.ts`, provider chỉ export component. Rebuild contracts trong lúc giữ form tiếng Nhật đã nhập: input/locale giữ nguyên, không trắng trang, console không error/warn. Tài liệu [mẫu đa ngôn ngữ](patterns/localization.md), FE-09 và README hướng dẫn thêm locale/state đúng pattern; wrapper skill hiện có tiếp tục đọc rule FE chung.
- `npm.cmd run check` cuối pass trên Windows x64, Node 24.16.0: format/lint/typecheck, **140 BE tests/17 files + 40 FE tests/4 files**, build contracts/API/Vite. Số BE gồm thư viện Analyze được task khác thêm đồng thời; task này không sửa phần đó. Test FE mới kiểm switch/persist/fallback/storage blocked, validation/error đang hiện, pending create chỉ POST một lần, giữ selection/success/date và không refetch khi đổi locale.
- Browser smoke IAB với DB fixture temp riêng: đổi Việt/Nhật, validation dịch ngay, giữ tên Nhật khi chuyển, tạo/mở project, định dạng thời gian, reload vẫn chọn Nhật và mở lại đúng ID, đổi Việt vẫn giữ tên/ID và detail đang chọn; mobile 390px không tràn ngang, UI luôn sáng. Bằng chứng tại `test-results/localization/` (Git ignored). Japanese glyph dùng font fallback hệ thống; chưa có font CJK local đồng nhất đa OS, chưa kiểm native macOS/Linux hoặc bản dịch bởi reviewer bản ngữ.
- `node scripts/verify-repository.mjs` và `git diff --check` pass. Chưa LIVE/MS1 hoặc phát hành; không sửa các thay đổi BE/fixtures/metadata của task khác đang có trong working tree.

## 15/10/2026 — chuẩn hóa policy và lỗi API làm mẫu cho Dev

- Scope feature / Projects/API/UI / fixture + fake runner. Rà BE config, service/repository, error handler/catalog, platform/data guard, DB/migration/logging và fake adapter; sửa policy lặp và nhận diện lỗi sai, không coi catalog an toàn, protocol literal, loopback guard hoặc migration lịch sử là hardcode cần xóa. Không thêm LIVE/CLI, config động hoặc framework i18n.
- Contracts bổ sung policy tên/fixture/mode/default page size và type public error code. Service dùng lại schema sau normalize, query validation trước repository; UI sinh nội dung giới hạn từ policy chung. Producer catalog dùng `satisfies Record<ApiErrorCode, ...>`; giữ error envelope mở cho mã mới để client cũ fallback. HTTP payload/schema DB/dependencies không đổi; migration cũ giữ nguyên.
- BE handler nhận diện AppError và mã Fastify validation/JSON/body/content-type cụ thể; unknown dependency 4xx không còn bị biến thành INVALID_INPUT. Giữ status/message an toàn, request ID và log tại boundary.
- FE tách `api-client.ts`/`api-error.ts` khỏi endpoint Projects và `project-messages.ts`. Giữ kind/method/status/code/requestId, phân biệt HTTP/network/timeout/invalid-response và caller cancellation; timeout bao gồm đọc response body. Không render raw server message, không suy diễn business error chỉ từ status. Tạo gặp network/timeout/response hỏng/server failure có trạng thái chưa xác nhận kết quả và hướng dẫn kiểm tra danh sách; không tự retry POST. Form tách field/submit error, không đánh dấu tên invalid vì backend lỗi.
- Dùng `portal-implement`, `skill-creator` và `create-rule` để bổ sung CORE-11, BE-09, FE-08, QA-10 tại rule gốc; thêm [mẫu source/test cho Dev](patterns/api-errors-policy.md), nối README và workflow. Cập nhật đồng nhất bốn wrapper Codex/Claude cho implement/review, giữ review-only và `disable-model-invocation: true` của Claude; Cursor tiếp tục đọc cùng rule gốc.
- `npm.cmd run check` pass ngoài sandbox: format/lint/typecheck, **74 BE tests/10 files + 33 FE tests/3 files**, build contracts/API/Vite. Regression kiểm cùng status khác code, unknown/malformed body, success JSON/schema hỏng, hủy trước/trong fetch, timeout cả body, mutation uncertainty/no automatic retry, lỗi submit không đánh dấu field, shared Unicode/name policy và unknown dependency 4xx. Sửa các lỗi format/lint/type của test phát hiện trong quá trình chạy gate; không bỏ check để bàn giao.
- `node scripts/smoke-backend.mjs` pass: compiled startup từ cwd ngoài repo, migration/create/reopen SQLite và bốn protected path. Browser smoke IAB trên DB temp riêng: validation, tạo/mở dự án, dừng backend để kiểm hướng dẫn chưa xác nhận lưu và input vẫn valid; phục hồi backend, refresh và mở lại đúng ID. Screenshot ở `test-results/policy-errors/` (Git ignored); expected proxy error khi cố ý dừng backend không được coi là bug sản phẩm.
- `node scripts/verify-repository.mjs` pass: rule/docs links và wrapper metadata/behavior đồng nhất; `git diff --check` pass. Validator chung `quick_validate.py` không chạy được vì Python hệ thống và bundled thiếu PyYAML; dùng validator riêng của repo kiểm flat YAML và cả bốn wrapper. Chưa thử discovery/behavior của skill trong session mới hoặc review độc lập. Runtime thực kiểm Windows x64, Node 24.16.0; chưa native macOS/Linux, chưa LIVE/MS1.

## 15/10/2026 — chỉnh UI theo thiết kế demo01

- Dùng `portal-implement`; scope feature / Projects UI / API fixture + fake runner. Demo01 là thiết kế tham chiếu theo yêu cầu người dùng: bỏ bước Upload, bổ sung cây dự án. Không thay BE/contracts/storage, không đọc source hoặc chạy AI thật.
- Khôi phục palette, font Be Vietnam Pro (400–800), JetBrains Mono, body 15px/1.55, heading 22px, header gọn, stepper dạng ô riêng, panel/button/form theo thiết kế. Đóng gói font local cùng giấy phép SIL OFL từ Google Fonts; không gọi font CDN lúc chạy. Logo Rikai nằm trong asset branding riêng và được đọc qua `branding.ts`, không gắn vào định danh API/storage.
- Cây dự án bên trái dùng dữ liệu API hiện có, mở/thu nhánh và mở tổng quan bên phải. Tạo dự án mới dùng cùng vùng nội dung; sau tạo chọn và mở nhánh dự án vừa lưu. Giữ loading/empty/error/retry/pagination và cleanup request. Các nhánh và bốn bước đánh giá chưa triển khai đều disabled/có nhãn; không dựng file source hoặc kết quả giả. Dùng nav/list/button native, không khai báo ARIA tree thiếu keyboard model.
- `npm.cmd run check` pass ngoài sandbox: format, lint, typecheck, **68 BE tests/10 files + 11 FE tests/2 files**, build contracts/API/Vite. Thêm test luồng chọn/chuyển dự án, mở/thu nhánh, quay về tạo mới; giữ test pending/create/error/pagination/stale response. Lần check trong sandbox thất bại ở 5 test symlink và 1 HTTP loopback do EPERM/ENOENT/EACCES; không sửa code backend để né hạn chế môi trường.
- Browser smoke Codex IAB: empty state, form trống có lỗi, tạo dự án qua UI/proxy/API với SQLite temp riêng, mở/thu cây, reload rồi mở lại đúng project ID; font document loaded/check thành công; desktop 1280px và mobile 390px không tràn ngang, theme sáng/tối. Sửa accessible name của nút theme khi label chữ bị ẩn trên mobile. Console không có error/warn trong luồng đã kiểm. Bằng chứng local trong `test-results/fe-demo01/` (Git ignored).
- Sau chỉnh accessible name, chạy lại format check file, ESLint FE, 11 test FE và build FE: pass. `node scripts/verify-repository.mjs` pass với README FE đã cập nhật. Runtime thực kiểm: Windows x64, Node 24.16.0; chưa native macOS/Linux hoặc Safari/Firefox. Chưa LIVE/Analyze/Review/Export.

## 15/10/2026 — init FE từ tham khảo prototype

- Dùng `portal-implement`, scope init / Projects UI / fixture + fake runner. Đọc bản FE Dev cung cấp trước khi làm; giữ nguyên bản tham khảo ngoài repo. Tham khảo palette sáng/tối, header/stepper, bố cục feature; không mang DTO khác backend, timer/counter phân tích giả, upload hoặc cam kết xử lý dữ liệu chưa triển khai vào luồng sản phẩm.
- Thêm `apps/web` với React/React DOM 18.3.1, Vite 6.4.4, plugin React 4.7.0 theo lockfile prototype. TypeScript strict, ESM, JSX/DOM/Bundler config riêng, ESLint typed + React hooks. Package `@portal/web`, branding display riêng; không font ngoài, không mở LAN.
- UI → proxy `/api` → API hiện có: tạo/list/phân trang/detail Projects, loading/empty/error/pending, refresh/retry tường minh; kiểm schema TypeBox cho response unknown, abort/timeout 15 giây và bỏ response cũ. Không tự retry POST. Dữ liệu lưu SQLite thật; lựa chọn detail chỉ trong phiên UI. Các bước chưa triển khai ghi “Chưa khả dụng”. Source BE và HTTP contract không thay đổi.
- Một root lockfile và ba workspaces; root `dev` vẫn chạy API, `dev:web` chạy FE port 5173, `preview:web` xem build port 4173. Root checks bao gồm FE/API/contracts. Thêm allow postinstall đúng `esbuild@0.25.12` của Vite, giữ cấu hình SQLite. Dependency test FE thêm Testing Library/jsdom; Vitest 5.0.4 dùng chung.
- `npm.cmd install` hợp nhất lockfile, rồi `npm.cmd ci --offline` pass: 294 packages cài sạch; không lấy node_modules/dist từ prototype. Offline audit không phải bằng chứng tra advisory mới nhất.
- `npm.cmd run check` pass: format check, lint, typecheck ba workspaces, **68 BE tests/10 files + 10 FE tests/2 files**, build contracts/API/Vite. FE tests kiểm create/pending, validation trước POST, lỗi list/create, pagination, cancellation, stale detail, malformed response và không tự retry mutation.
- Browser smoke trên Codex IAB/Windows: form trống có lỗi; tạo dự án qua UI/proxy/API, mở detail, reload vẫn giữ project; theme sáng/tối, viewport 390px một cột và không tràn ngang. Console không có error trong luồng đã kiểm. DB fixture temp riêng đã được dọn và server smoke đã dừng; không đọc source khách hàng hay dùng DB cá nhân. Screenshot local trong `test-results/fe-init/` (Git ignored).
- `node scripts/verify-repository.mjs` pass: 32 tài liệu, 227 link nội bộ, 4 skill frontmatters, 3 Cursor frontmatters, workspace/root lockfile. README root/FE và trạng thái engineering/entrypoint đã cập nhật; repo không cần prototype để clone/build.
- Bằng chứng native hiện **Windows x64, Node 24.16.0/npm 12.0.2**. Chưa native Mac/Linux, chưa Safari/Firefox matrix, chưa kiểm discovery skills trong session mới hoặc tech lead review độc lập. Chưa LIVE/CLI/Analyze/Review/Export, không commit/remote/push.

## 14/10/2026 — tách repo sản phẩm

- Di chuyển source/tooling, engineering và wrapper Codex/Claude/Cursor vào repo này. Một npm lockfile; không đổi dependency hoặc HTTP contract.
- Không mang proposal/kế hoạch/demo/tài liệu cá nhân, customer source, DB/runtime hoặc bộ cài/build cũ. Repo không cần dữ liệu hoặc file cấu hình ở parent directory.
- Repo root vẫn xác định từ layout module `apps/api/src` hoặc `apps/api/dist`, độc lập cwd. Guard thêm thư mục `source_vb6` bên cạnh repo, kể cả chưa tồn tại và alias trỏ vào đó; không cấm toàn bộ parent workspace. Nơi clone không có thư mục sibling này vẫn hoạt động. Chưa hỗ trợ đăng ký arbitrary customer roots hoặc cô lập filesystem trước LIVE.
- Giữ explicit invocation của hai Claude skills và review-only. Convention duy nhất tại `docs/engineering/`; progress trong repo thay tham chiếu nhật ký cá nhân.
- Khởi tạo Git cục bộ tại repo này; chưa stage, commit, remote hoặc push. Lockfile giữ nguyên SHA-256 `FABA5405D966049E8BB829A4D28E8BD28C4B4CE48D92D3E338A02C9B21709EA7`; không đổi dependency.
- Sửa script `lint` build contracts trước ESLint: typed lint của clone sạch cần exports compiled của workspace contracts. Không phụ thuộc dist cũ. FE chưa có nên giữ hai workspaces hiện tại; hướng dẫn bổ sung workspace/scripts/lockfile khi có FE.

### Kiểm chứng tại repo root

- `npm.cmd ci --offline`: pass, 192 packages cài mới từ npm cache theo lockfile; không tái sử dụng node_modules cũ. Lần sandbox ban đầu bị EPERM khi tạo workspace junction; chạy ngoài sandbox pass. Không coi kết quả audit offline là bằng chứng tra cứu advisory mới nhất.
- `npm.cmd run check`: pass — format check, lint, typecheck, **68 tests/10 files**, build. Lần clean check đầu phát hiện lint thiếu build contracts; đã sửa script và toàn bộ check pass sau đó.
- `node scripts/verify-repository.mjs`: pass — 31 tài liệu, 210 link nội bộ, 4 skill frontmatters, 3 Cursor frontmatters và root workspace lockfile. Frontmatter hiện dùng subset YAML phẳng; validator kiểm đúng cấu trúc đó. Nội dung wrapper cùng workflow, khác ví dụ invocation theo tool.
- `node scripts/smoke-backend.mjs`: pass — compiled server chạy từ cwd temp ngoài repo, migration tạo DB, POST project 201, restart/reopen trả cùng project; bốn path repo/source/descendant bị từ chối trước ghi DB. Validate parent workspace hợp lệ nhưng không ghi DB vào đó.
- `git rev-parse --show-toplevel`: đúng repo sản phẩm. `git remote -v`: rỗng. `git check-ignore` kiểm dependencies/build/secrets/runtime/tài liệu cá nhân bị loại. Không stage hoặc commit.
- Native filesystem/junction, SQLite và HTTP chạy trên **Windows x64, Node 24.16.0/npm 12.0.2**. Unit test kiểm lựa chọn path macOS/Linux và clone không có source sibling; chưa native smoke trên macOS/Linux.

### Giới hạn còn lại

- Chưa kiểm discovery trong session mới của Codex/Claude/Cursor tại đường dẫn mới; metadata/link đúng không thay runtime discovery.
- Chưa có review độc lập sau di chuyển, UI, CLI hoặc LIVE; Host/Origin protection, local credential, instance lock và source root registration vẫn theo gate.
- Chưa có remote/commit để team clone qua Git; khi được giao publish mới thực hiện. Source/tooling/docs ở đây không cần workspace cá nhân để build/chạy.
