# Mẫu UI đa ngôn ngữ

UI hiện hỗ trợ tiếng Việt (`vi`, mặc định) và tiếng Nhật (`ja`), chỉ có giao diện sáng. Rule áp dụng: FE-08/09, FE-04, CORE-09/11 và QA-05/10. Backend, schema/API, ID và dữ liệu đã lưu không phụ thuộc ngôn ngữ giao diện.

## Thêm nội dung hoặc ngôn ngữ

1. Thêm nội dung UI vào `viMessages` trong [vi.ts](../../../apps/web/src/shared/i18n/vi.ts); `Messages` được suy ra từ cấu trúc catalog này. Giữ key theo ý nghĩa/trách nhiệm, không dùng câu hiển thị làm key.
2. Bổ sung bản dịch tương ứng tại `jaMessages` trong [ja.ts](../../../apps/web/src/shared/i18n/ja.ts), được kiểm tra bằng `satisfies Messages`. Export catalog dùng hậu tố `Messages` để phân biệt với `vi` của Vitest. Thiếu key hoặc sai tham số của hàm nội suy phải gây lỗi typecheck. Không dùng assertion hoặc `Partial` để che bản dịch thiếu.
3. Để thêm ngôn ngữ, tạo catalog cùng type, đăng ký trong `catalogs` và `LOCALES` ở [locale.ts](../../../apps/web/src/shared/i18n/locale.ts), gồm mã ngôn ngữ, tên bản địa và locale cho `Intl`. Bộ chọn trong header tự đọc danh sách đó.
4. Component lấy `messages` từ [useLocale](../../../apps/web/src/shared/i18n/locale-context.ts). Context/hook nằm riêng với provider và catalog để giữ identity qua hot reload khi build contracts. Nội dung nhìn thấy, placeholder, label và tên truy cập của control đều lấy từ catalog; định dạng thời gian qua formatter theo locale. Chuỗi có biến dùng hàm nội suy có type; giới hạn nghiệp vụ vẫn lấy từ contracts.

Tên sản phẩm/logo lấy từ branding, giữ tên thương hiệu khi đổi ngôn ngữ. Tên dự án do người dùng nhập, UUID, `fixtureId` và mã lỗi public là dữ liệu/định danh, không tự dịch hoặc lưu bản dịch thay dữ liệu gốc. Message lỗi backend không được render thẳng để thay catalog.

## Thuật ngữ hiển thị

Catalog Việt dùng thống nhất: Workspace → Không gian làm việc; Local workspace → Trên máy này; Assessment Report → Báo cáo đánh giá; Review → Rà soát; Proposal → Đề xuất; source → mã nguồn; legacy system → hệ thống cũ. Khi thêm câu mới, dùng cùng cách gọi thay vì trộn nhãn Anh/Việt. Catalog Nhật dùng thuật ngữ tương ứng bằng tiếng Nhật.

Giữ các viết tắt AI, API, VB6, SA/PM và nhãn DEMO. Thông báo chẩn đoán kết nối/phiên bản có thể giữ frontend/backend để Dev và người hỗ trợ đối chiếu thành phần kỹ thuật; không dùng ngoại lệ này cho tên bước hoặc thao tác nghiệp vụ.

## Giữ hành vi khi chuyển ngôn ngữ

- [LocaleProvider](../../../apps/web/src/shared/i18n/locale-provider.tsx) chọn catalog và đồng bộ `html.lang` bằng `useLayoutEffect` trước khi trình duyệt vẽ UI, cả lúc đọc lại preference và khi đổi locale. CSS font theo `lang` và ngôn ngữ nội dung phải khớp ngay khi hiển thị. Lưu `portal.locale` trong localStorage bằng `useEffect` riêng; không đưa thao tác lưu vào effect chặn paint. Giá trị đọc từ storage phải được kiểm tra; mã không hỗ trợ về tiếng Việt. Storage bị chặn thì đổi ngôn ngữ trong phiên vẫn hoạt động, không hứa đã lưu preference.
- Giữ lỗi dưới dạng dữ liệu có cấu trúc hoặc state key, dịch khi render. [Project error resolver](../../../apps/web/src/features/projects/project-messages.ts) nhận catalog lỗi đang chọn; form lưu field-invalid/submit-failure thay cho chuỗi đã dịch. [List hook](../../../apps/web/src/features/projects/use-project-list.ts) và detail giữ lỗi gốc để dịch lại mà không gọi API.
- Locale không phải dependency của request effect. Không key/remount page/form theo locale, không tạo lại mutation để đổi label. Pending, input, selected project, cursor và dữ liệu phải giữ nguyên. Dùng key bước ổn định, không dùng nhãn đã dịch làm định danh.
- Giao diện giữ `color-scheme: light`; không còn state, control hoặc palette tối. Font Latin theo demo01; tiếng Nhật dùng fallback font hệ thống cho kana/kanji, không gọi font CDN. Hình dáng glyph Nhật có thể khác giữa hệ điều hành; muốn đồng nhất hoàn toàn cần thêm font Nhật local kèm giấy phép.

## Kiểm chứng

[App tests](../../../apps/web/src/app/app.test.tsx) kiểm đổi Việt/Nhật, lưu/đọc preference, storage không khả dụng, đổi giữa lúc create pending, giữ input/selection/success, ngày giờ và lỗi list/detail/submit đang hiện; không gửi lại request do đổi locale. Regression đồng bộ `html.lang` kiểm ngôn ngữ document đã khớp trước passive effect của component con khi mount/đổi locale, và phục hồi sau unmount. [Message tests](../../../apps/web/src/features/projects/project-messages.test.ts) kiểm error code/fallback/recovery cho bản dịch. Chạy `npm run check`, kiểm browser tiếng Nhật ở desktop/mobile và nhãn truy cập của bộ chọn.
