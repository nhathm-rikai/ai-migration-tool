# Hợp đồng Analyze: source, run, artifact (C01)

**Gate:** FEATURE:jobs/storage/analysis, dữ liệu fixture. Đây là hợp đồng đã chốt cho checkpoint **analyze-only**; endpoint/route/bảng DB chưa tồn tại và được implement ở B03/B04/B07/B09. Schema máy đọc được nằm trong `packages/contracts/src`:

| File | Nội dung |
|---|---|
| [source-registration.schema.ts](../../../packages/contracts/src/source-registration.schema.ts) | Đăng ký source, mapping tên bảng, summary trả về |
| [run.schema.ts](../../../packages/contracts/src/run.schema.ts) | Run DTO theo trạng thái, config khóa, start/list/current/cancel, runtime status, SSE event |
| [artifact.schema.ts](../../../packages/contracts/src/artifact.schema.ts) | Artifact ref và envelope inventory |
| [analyze-api.ts](../../../packages/contracts/src/analyze-api.ts) | Bảng operation: method/path/schema/success status/mã lỗi |
| [error.schema.ts](../../../packages/contracts/src/error.schema.ts) | `AnalyzeApiErrorCodeSchema` + HTTP status |
| [fixtures](../../../packages/contracts/src/fixtures/) | Payload sạch, import qua `@portal/contracts/fixtures` |

Route, API client và message catalog dùng `ANALYZE_API_OPERATIONS` và schema/DTO export; không copy DTO hoặc tự đặt mã lỗi. Đổi hợp đồng đi qua contract owner và cập nhật test [analyze-contract.test.ts](../../../packages/contracts/src/analyze-contract.test.ts).

## 1. Nguyên tắc chung

- Base `/api/v1`; mọi path nằm dưới project và service kiểm ownership project → run → snapshot → artifact. Resource của project khác trả 404 theo mã của resource (không lộ tồn tại).
- Schema strict: field lạ, ID không phải UUID, status/stage/mã lỗi ngoài union đều bị từ chối. Nullable là giá trị `null` bắt buộc có mặt, không dùng field optional cho DTO mới; optional chỉ còn ở inventory để đọc bản cũ (§6).
- Thời gian UTC ISO-8601. Query/path số đi dưới dạng string (API tắt coerce).
- Error dùng envelope `{ error: { code, message, requestId } }` hiện có. Client cũ gặp mã mới dùng fallback.
- Projects API (create/list/detail) **không đổi**: DTO Project, query và mã lỗi giữ nguyên; test AC02 khóa payload cũ dưới dạng JSON viết tay.

## 2. Source registration (API 2)

`GET/PUT /projects/:projectId/source`.

- PUT body: `rootPath` (tuyệt đối, ≤ 4096 ký tự, BE canonicalize/kiểm quyền), `profileId`, `tableNameMapping`, `expectedSourceRevision` (`null` = đăng ký lần đầu, số = revision đang sửa). PUT không walk source hoặc tạo snapshot.
- `tableNameMapping`: `{ defaultSchema: null, status: 'unconfigured' }` hoặc `{ defaultSchema: <identifier>, status: 'assumed' | 'confirmed' }` theo [source-inventory §4.1](source-inventory.md#41-mapping-tên-bảng-table-name-v1). `confirmed` chỉ chọn khi người quản lý DB đã xác nhận.
- Response `{ source: null | ProjectSource }`. `local` trả `sourceId`, `displayName` (segment cuối, không chứa `/` hoặc `\`), `revision`, `status: ready | unreadable` (kết quả kiểm tra root gần nhất), thời gian. **Root tuyệt đối không bao giờ có trong response, log hay URL.**
- Project demo có source `kind: 'fixture'` (bộ mẫu `sample-vb6`, revision cố định 1, mapping `unconfigured`). PUT lên project demo trả `409 PROJECT_MODE_CONFLICT`: project demo không tự thành project dùng source thật.
- `profileId` hợp lệ về hình thức nhưng không thuộc `SOURCE_PROFILE_IDS` → `422 SOURCE_PROFILE_UNSUPPORTED`.

**Quyết định còn mở (B03):** cách tạo project dùng source local. Hướng chốt: thêm member `mode: 'local'` (không `fixtureId`) vào union Project/CreateProject trong PR B03 kèm migration, giữ nguyên member demo hiện tại; UI Projects cập nhật cùng PR. C01 không đổi Project DTO để không phá Projects UI đang chạy.

## 3. Start run (API 3)

`POST /projects/:projectId/runs`, header `Idempotency-Key` (16–128 ký tự `[A-Za-z0-9_-]`, client sinh, ví dụ UUID).

| Body | Ý nghĩa |
|---|---|
| `{ kind: 'analyze', source: { strategy: 'current-source', expectedSourceRevision }, retryOfRunId: null }` | Run mới trên source đang đăng ký (demo: revision 1) |
| `{ kind: 'analyze', source: { strategy: 'current-source', expectedSourceRevision }, retryOfRunId }` | Retry, snapshot mới từ source hiện tại |
| `{ kind: 'analyze', source: { strategy: 'reuse-snapshot' }, retryOfRunId }` | Retry tái lập trên snapshot của run cũ |

- Trả **202** + `Location: /api/v1/projects/:projectId/runs/:runId` + Run (thường `queued`). Không chờ execution.
- Idempotency theo project: fingerprint = JSON chuẩn hóa của body. Cùng key + cùng fingerprint → 202 với Run hiện tại của run đã tạo (bất kể status). Cùng key, fingerprint khác → `409 IDEMPOTENCY_KEY_CONFLICT`. Key giữ cùng run, không hết hạn trong v1.
- Client không gửi config. Server khóa `config` lúc tạo run: profile, mapping từ registration (reuse-snapshot: copy profile/mapping của run cũ), phiên bản analyzer của bản build đang chạy và limits. Phiên bản analyzer luôn là bản hiện tại; khác version so với run cũ hiển thị được qua `config.analyzer`.
- Lỗi: source chưa đăng ký `409 SOURCE_NOT_REGISTERED`; revision khác `409 SOURCE_REVISION_CONFLICT`; `retryOfRunId` không thuộc project `404 RUN_NOT_FOUND`; run cũ không có snapshot `409 SNAPSHOT_UNAVAILABLE`; project còn run queued/running/cancelling `409 RUN_ACTIVE_CONFLICT`; runtime cần recovery `503 RUNTIME_RECOVERY_REQUIRED` (trạng thái server tạm thời, không phải conflict của resource).
- Chỉ expose `kind: 'analyze'`. C02 thêm `understand` + parent analyze run.

## 4. Đọc run (API 4)

- `GET .../runs?limit&cursor`: mới nhất trước (`createdAt` giảm, rồi `id`), `limit` 1–100 mặc định 20, cursor opaque `[A-Za-z0-9_-]`. Trả `{ items, nextCursor }`.
- `GET .../runs/current`: `{ run }` = run đang active, nếu không có thì run mới nhất, nếu chưa có run thì `null`. Dùng khi mở lại project; không gây Start.
- `GET .../runs/:runId`: Run, nguồn sự thật cho UI sau reconnect.

Run DTO theo từng status (schema là union, field mâu thuẫn status bị từ chối):

| status | stage | startedAt | finishedAt | sourceSnapshotId | errorCode |
|---|---|---|---|---|---|
| queued | null | null | null | null (reuse-snapshot: có) | null |
| running | snapshot/inventory/publish | có | null | nullable | null |
| cancelling | nullable | có | null | nullable | null |
| succeeded | null | có | có | **bắt buộc** | null |
| failed | stage cuối, nullable | có | có | nullable | **bắt buộc** `RunErrorCode` |
| cancelled | null | null nếu hủy khi queued | có | nullable | null |
| interrupted | stage cuối, nullable | có | thời điểm recovery đánh dấu | nullable | null |

- Transition theo [architecture §6](../architecture.md#6-vòng-đời-job). `stateVersion` bắt đầu 1, **chỉ tăng khi đổi status**; stage cập nhật không tăng version (SSE `sequence` sắp thứ tự). Client so `stateVersion` rồi `updatedAt` để bỏ response cũ.
- `RunErrorCode`: `SOURCE_UNREADABLE`, `SOURCE_FORBIDDEN`, `SOURCE_CHANGED`, `SOURCE_LIMIT_EXCEEDED`, `SOURCE_PROFILE_UNSUPPORTED`, `ANALYSIS_OUTPUT_INVALID`, `ARTIFACT_WRITE_FAILED`, `TIMEOUT`, `STOP_UNCONFIRMED` (cancelling → failed khi không xác nhận dừng được), `INTERNAL_ERROR`. Run lỗi vẫn là run, khác lỗi request.
- Không có phần trăm tiến độ; UI hiển thị stage.

## 5. Cancel, runtime, SSE (API 5–6)

- `POST .../runs/:runId/cancel` body `{ expectedStateVersion }`, trả 200 + Run: queued → `cancelled`; running → `cancelling`; đang `cancelling`/`cancelled` → trả run hiện tại (idempotent, bỏ qua version). Terminal khác hoặc version lệch khi run còn active → `409 RUN_STATE_CONFLICT`; client GET lại rồi quyết định.
- `GET /runtime/status`: `{ status: 'ready', reasonCode: null }` hoặc `{ status: 'recovery_required', reasonCode: 'PROCESS_CLEANUP_UNCONFIRMED' }`. Không trả PID, path, command hay credential.
- `GET .../runs/:runId/events`: `text/event-stream`, event name `run`, `id` = `sequence`, `data` = `RunEvent { runId, sequence, stateVersion, status, stage, occurredAt }`. State commit trước event. Không raw stdout/log, không token trên query (transport credential theo B01/F00). Reconnect: GET run là nguồn chính thức, bỏ event có `stateVersion` cũ hơn.

## 6. Artifact (API 7)

- `GET .../runs/:runId/artifacts` → `{ items: ArtifactRef[] }`; chỉ liệt kê version đã publish hoàn tất. Run chưa xong trả danh sách rỗng, client dựa vào status run.
- `GET /projects/:projectId/artifacts/:artifactId/versions/:version` → envelope đúng version (`version` là số nguyên dương trong path, không có `latest`). Không thuộc project → `404 ARTIFACT_NOT_FOUND`.
- Envelope: `id, version, kind: 'source-inventory', schemaVersion, projectId, runId, sourceSnapshotId, sourceSnapshotHash, mode: demo|local, sha256, byteLength, createdAt, payload`. `sha256/byteLength` là của payload đã lưu. Inventory tĩnh không có prompt/model version. Mỗi analyze run thành công tạo một artifact version 1; version tăng dùng cho artifact có review (C02).
- **Tương thích inventory:** payload là `source-inventory-v1`. Reader phải đọc được bản không có `tableNames`/`normalizedCrud`/`normalizedTables`/`normalizedComplexity` (trước mapping) và bản partial (file `error`, analysis `unsupported`, binary, member `missing`, program `complete: false`, `skipped`). Góc nhìn raw (`crud`, `metrics.tables`, `complexity`) và mapped (`normalized*`) giữ riêng; UI không tự gộp. Cảnh báo partial không được lọc khi validate.

## 7. Bảng mã lỗi và status

| Mã | HTTP |
|---|---|
| `RUN_NOT_FOUND`, `ARTIFACT_NOT_FOUND` | 404 |
| `PROJECT_MODE_CONFLICT`, `SOURCE_NOT_REGISTERED`, `SOURCE_REVISION_CONFLICT`, `RUN_ACTIVE_CONFLICT`, `RUN_STATE_CONFLICT`, `IDEMPOTENCY_KEY_CONFLICT`, `SNAPSHOT_UNAVAILABLE` | 409 |
| `SOURCE_FORBIDDEN`, `SOURCE_UNREADABLE`, `SOURCE_PROFILE_UNSUPPORTED` | 422 |
| `RUNTIME_RECOVERY_REQUIRED` | 503 |

Danh sách mã từng operation trả được nằm trong `ANALYZE_API_OPERATIONS[op].errorCodes` (gồm `INVALID_INPUT`, `PROJECT_NOT_FOUND`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE` của catalog Projects). `SOURCE_FORBIDDEN` dùng 422 để dành 403 cho bảo vệ request local (B01). Auth/CSRF status do B01 chốt.

Các mã analyze nằm riêng trong `AnalyzeApiErrorCodeSchema`: BE thêm vào catalog `app-error.ts` (dùng `ANALYZE_API_ERROR_HTTP_STATUS`) và FE thêm message VI/JA khi route/màn hình tương ứng được làm (B03/B04/B07, F01/F02/F03), không thêm sớm vào catalog Projects.

## 8. Fixture

`@portal/contracts/fixtures` có run đủ 7 status + retry + demo, start/retry request, source local/fixture/chưa đăng ký, list/current/event/runtime, inventory mapped/unmapped/partial và envelope tương ứng, payload Projects cũ. Dữ liệu viết tay cho module đặt hàng giả lập, không từ source khách hàng. Limits trong `runConfigFixture` là số giữ chỗ cho test; số thật chốt sau spike (JOB-07).
