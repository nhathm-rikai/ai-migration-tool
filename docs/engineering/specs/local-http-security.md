# Bảo vệ HTTP local và credential UI (B01/F00)

Policy đã chốt cho task PF02 (B01 + F00), áp dụng BE-06/BE-07/FE-08. Code: [local-security.ts](../../../apps/api/src/plugins/local-security.ts), [local-session.routes.ts](../../../apps/api/src/modules/local-session/local-session.routes.ts), [local-session.ts](../../../apps/web/src/shared/api/local-session.ts), [api-client.ts](../../../apps/web/src/shared/api/api-client.ts); contract [local-session.schema.ts](../../../packages/contracts/src/local-session.schema.ts).

## Mô hình đe dọa

Bảo vệ API loopback khỏi trang web khác đang mở trong browser của người dùng: CSRF/form cross-site, `fetch` từ origin lạ, DNS rebinding (Host lạ trỏ về 127.0.0.1). Process local khác chạy cùng user không nằm trong phạm vi (đọc được DB trực tiếp). Không có account/login tổ chức.

## Cơ chế

1. API chỉ bind `127.0.0.1` (không đổi).
2. Mỗi process API sinh một credential ngẫu nhiên 32 byte (base64url, 43 ký tự) khi khởi động. Restart API làm credential cũ hết hạn.
3. **Trusted bootstrap**: `POST /api/v1/session` (không body) trả `200 { token }`, `Cache-Control: no-store`. Chỉ nhận khi có `Origin` thuộc danh sách tin cậy.
4. Mọi route khác (kể cả route không tồn tại) là **protected**: cần `Authorization: Bearer <token>`. Không dùng cookie nên không cần CSRF token riêng; browser không tự đính header này cho request cross-site, và origin lạ không qua được preflight (API không trả header CORS nào).
5. `GET /api/v1/health` là public (readiness của harness), vẫn kiểm Host/Origin.

Kiểm tra chạy ở hook `onRequest`, trước parse body và handler, nên request bị chặn không tới service/DB. Thứ tự: Host → Origin → credential.

| Điều kiện | Kết quả |
|---|---|
| Host không thuộc `127.0.0.1:<port>`/`localhost:<port>` của API hoặc UI | 403 `HOST_NOT_ALLOWED` |
| Có `Origin` nhưng không đúng chính xác origin tin cậy (kể cả `null`, `https://...`) | 403 `ORIGIN_NOT_ALLOWED`, kể cả khi credential đúng |
| Bootstrap thiếu `Origin` | 403 `ORIGIN_NOT_ALLOWED` |
| Route protected thiếu/sai credential (sai scheme, sai độ dài, sai giá trị) | 401 `CREDENTIAL_INVALID` |
| Route protected **không có** `Origin`, credential đúng | Cho qua (GET same-origin của browser, tool local đã bootstrap) |

**Thiếu Origin không được coi là tin cậy**: không lấy được credential khi thiếu Origin, và thiếu Origin thì chỉ credential quyết định. Browser luôn gửi Origin cho POST, nên trang lạ không thể bootstrap.

Origin/Host tin cậy: port API (`PORTAL_PORT`) và port UI. `PORTAL_WEB_PORT` (cùng biến Vite dùng) chỉ định một port UI; khi không đặt, tin cậy port mặc định 5173 (dev) và 4173 (preview). Vite proxy giữ nguyên Host/Origin của browser, nên Host của UI port được chấp nhận. Không có wildcard; origin LAN/khác port bị từ chối.

## Không lộ credential

- Token không nằm trên URL/query, cookie, localStorage/sessionStorage; FE giữ trong memory.
- Logger không ghi header/URL (serializer chỉ method/route/status) và redact `authorization`. Test kiểm log khi chạy socket thật không chứa token.
- SSE (B09/F05) **không** dùng `EventSource` với token query. Dùng `fetch` streaming với header `Authorization`, cùng client/credential source này.

## FE

- `createLocalSession` giữ trạng thái `idle → pending → ready | failed`, `ready → expired` khi API trả 401 `CREDENTIAL_INVALID`. Nhiều request đồng thời dùng chung một bootstrap; caller abort không hủy bootstrap của caller khác; re-render/StrictMode/đổi locale không bootstrap lại.
- Không có credential thì không gửi request: lỗi `ApiError` kind `credential`, `outcomeUnknown = false` (mutation chưa gửi).
- 401 `CREDENTIAL_INVALID`: bỏ credential; GET retry đúng một lần với credential mới; POST **không** tự retry, người dùng gửi lại (request bị chặn trước side effect nên kết quả đã biết).
- `SessionStatus` ở header hiển thị pending/failed/expired; nút "Thử kết nối lại" gọi bootstrap lại, không phát lại mutation đã fail.

## Chưa đến mốc

- Release Fastify phục vụ UI cùng origin chưa có; khi thêm, origin API đã nằm trong danh sách tin cậy.
- Instance lock (B02), source thật, CLI thật vẫn là task LIVE riêng; PF02 không mở đường đọc source thật.
- Chỉ kiểm trên Windows x64, Node 24.16.0, Chromium của Playwright.
