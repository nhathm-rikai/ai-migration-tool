# Portal local — phát triển đa nền tảng

Yêu cầu đích: **Windows, macOS và Linux**. Đây là yêu cầu cho Portal; không tự suy ra VB6 runtime, COM, .NET WinForms hoặc chương trình được migrate cũng chạy trên ba OS. Giới hạn nguồn/target của migration được quyết định riêng.

## Trạng thái và phạm vi công bố

- Đã có bằng chứng backend fixture trên máy Windows x64, Node 24.16.0/npm 12.0.2: install, checks, SQLite native, HTTP và reopen dữ liệu.
- Linux/macOS là mục tiêu phải hỗ trợ, **chưa được kiểm chứng**. Chưa chốt OS version tối thiểu, Linux distro/libc và các tổ hợp x64/ARM64 sẽ phân phối. Chốt trước release cho nền tảng đó; không gọi chung “Linux supported” chỉ vì pass trên một distro.
- Chưa có installer. Adapter Agent CLI (`claude-cli`, và `codex-cli` chỉ cho dev/test) đã có cho run tạo tài liệu: process test (spawn, stream-json, cancel cây process qua `taskkill /T`) và smoke với Claude Code 2.1.311 chỉ mới chạy trên Windows x64; nhánh POSIX (process group) chưa kiểm chứng trên macOS/Linux. Smoke `claude-cli` thành công end-to-end ngày 30/10/2026 (Claude Code 2.1.311, `claude-sonnet-5-5`, Windows x64) trên fixture sạch. CLI Analyze tĩnh đã có và chạy độc lập với Portal. Test fake hoặc giả lập `platform` chỉ chứng minh logic lựa chọn nhánh; không thay test filesystem/native/process trên OS đích.
- Đã có resolver data directory tại `apps/api/src/platform/data-directory.ts`: Windows LOCALAPPDATA/AppData fallback, macOS Application Support và Linux XDG. Có unit test chọn path cho ba OS và containment/junction trên Windows; chưa thay thế smoke native macOS/Linux. README backend hiện dùng ví dụ PowerShell và ghi cách gọi npm trên OS khác.

## Quy ước khi viết/sửa code

Theo CORE-10, logic nghiệp vụ, route/service và shared contracts không tự biết OS. Cô lập khác biệt OS tại config/platform adapter được nối qua composition; chỉ tạo abstraction khi có thao tác thật cần tách. Không tạo ba backend hoặc nhiều lớp base rỗng.

- Dùng `node:path`, URL/file URL API và `node:os` đúng mục đích. Không tự nối dấu phân cách, hardcode drive/user directory hoặc dùng shell cho file operation đã có Node API.
- Path trong evidence/manifest có quy ước portable riêng; path truy cập filesystem theo OS host. Không nhầm VB6 reference chứa backslash với path host hợp lệ.
- Kiểm case-sensitive import, Unicode/tên có dấu cách, LF/CRLF, quyền đọc/ghi, file đang mở, symlink và Windows junction/reparse. Không lowercase toàn bộ path hoặc mặc định mọi filesystem của một OS đều có cùng case behavior. Chuẩn hóa văn bản theo source spec, giữ raw snapshot.
- `package.json` scripts dùng command/package đa nền tảng hoặc Node script. Không đưa `npm.cmd`, `cmd /c`, PowerShell, Bash, `rm -rf` hoặc shell-specific env assignment vào script chung. Tài liệu được có ví dụ riêng theo shell, phải ghi rõ.

## Thư mục dữ liệu

Resolver hiện giữ `PORTAL_DATA_DIR` absolute làm override ưu tiên để mở DB cũ, đồng thời từ chối repo sản phẩm và thư mục `source_vb6` cạnh repo, gồm alias trỏ vào đó. Source sibling là vị trí được bảo vệ tùy chọn, không cần tồn tại để clone chạy độc lập. Parent workspace không phải repo và không bị chặn toàn bộ. Đăng ký source root khác thuộc feature đọc source trước LIVE. Default theo platform với app identity ổn định, độc lập branding:

- Windows: local app-data directory của user, dưới đó `MigrationPortal/portal-dev` cho bản dev.
- macOS: `~/Library/Application Support/MigrationPortal/portal-dev`.
- Linux: `$XDG_DATA_HOME/MigrationPortal/portal-dev` khi XDG_DATA_HOME absolute; nếu thiếu/không hợp lệ thì `~/.local/share/MigrationPortal/portal-dev` theo XDG.

Cache/temp/config tách theo mục đích; test dùng temp directory của OS. Đổi default path phải hướng dẫn tiếp tục dùng dữ liệu cũ, không tự move/xóa DB. Data nằm ngoài source/repo. Kiểm containment/revalidation trước LIVE theo DATA-03, không chỉ dựa `path.join`.

## Process và native dependency

- AgentRunner giữ interface chung; launcher/process adapter tìm executable, truyền argv, xử lý permissions, signal, cancel/timeout và cleanup trên OS đích. Không ghép input thành shell command; không giả định `.cmd` và executable POSIX chạy giống nhau.
- Shutdown/lock/recovery phải có bằng chứng riêng từng OS. Windows/POSIX khác về signal/process tree; `child.kill()` không xác nhận cả cây đã dừng. Chỉ dừng process chứng minh được app sở hữu.
- Native SQLite phải kiểm theo **OS + CPU + Node runtime**; Linux có thể cần phân biệt libc. Không copy `node_modules`/binary build trên Windows sang Mac/Linux để nghiệm thu.
- `allowScripts` hiện khóa theo phiên bản driver/esbuild đã kiểm trên Windows. Khi đổi dependency, OS/CPU hoặc đóng gói phải kiểm `npm ci` và load binary thực tế; không suy ra cấu hình đó đã được kiểm trên mọi OS.

## Gate và bằng chứng

- **ALWAYS / code mới hoặc đang sửa:** tuân CORE-10, giữ nghiệp vụ độc lập OS; nêu target và môi trường đã chạy. Task nhỏ không phải làm installer/CI toàn dự án.
- **FEATURE liên quan:** kiểm behavior platform bị ảnh hưởng; unit test resolver bằng dependency platform/env + native integration trên target khi cần. Thiếu môi trường ghi “chưa kiểm chứng”, không tính là pass.
- **Khi cấu hình CI:** job Windows/Linux/macOS dùng Node/package manager đã khóa, chạy clean install, lint/typecheck/test/build. Chọn runner/CPU/distro rõ; không tự tạo remote/CI trong task chỉ sửa skill.
- **LIVE trên mỗi target:** smoke source/path/encoding, CLI permissions, process cancel/timeout, lock/restart/cleanup trên nền tảng đó trước bật tính năng thật.
- **Release trên mỗi target:** version/CPU hỗ trợ rõ; kiểm bản phân phối cài/chạy/nâng cấp/gỡ, giữ dữ liệu và chính sách ký ứng dụng phù hợp. Thiếu Mac/Linux smoke nghĩa là chưa release hỗ trợ nền tảng đó, không có nghĩa bỏ yêu cầu đa nền tảng.

Chưa chọn desktop shell/installer framework trong convention này. Tiếp tục dùng kiến trúc hiện tại; quyết định đóng gói ở task riêng dựa trên khả năng chạy Node backend và dependency native.

Nguồn: [Node child process](https://nodejs.org/docs/latest-v24.x/api/child_process.html), [Node path](https://nodejs.org/docs/latest-v24.x/api/path.html), [XDG base directory](https://specifications.freedesktop.org/basedir/latest/).
