# Frontend SongLam PMS — bàn giao ngày 12/11/2026

## Trạng thái kết nối thực tế

Cập nhật sau bàn giao frontend: [đường runtime SQL mới](sql-connection-status.md) đã được thêm vào entrypoint, nhưng chỉ nạp khi có cấu hình test/approval phù hợp. Driver đã cài và import native được; vẫn chưa có pool ứng dụng kết nối SQL. Các nhận xét dưới đây về entrypoint chưa nạp driver mô tả đường chạy mặc định khi không cấu hình runtime, không phải thiếu file driver nữa.

Đã kiểm kê Git và bảo toàn các thay đổi có sẵn. Không tìm thấy AGENTS.md trong các đường dẫn repository/cha đã kiểm tra ở các lượt trước. Giữ HTML/CSS/JavaScript, dùng Tabler có sẵn, không sửa `css/tabler.min.css`, không cài framework mới.

**Chưa có endpoint nghiệp vụ nào được chứng minh chạy qua SQL Server thật.** Entry `backend/src/server.js` hiện không nạp driver/pool/gateway SQL; các manifest mặc định khóa và các file SQL pending chưa được duyệt chạy. `/health`, `/api/v1/auth/status` trả trạng thái HTTP thực nhưng không chứng minh database kết nối. `/ready` và các API nghiệp vụ trả lỗi/chưa sẵn sàng khi thiếu phụ thuộc. Lượt này không chạy SQL/seed/import hoặc đổi schema/quyền.

Frontend API gọi đúng backend qua client HTTP thống nhất. Khi chưa sẵn sàng, hiện lý do và khóa ghi; không chuyển sang Store/demo. Demo cũ vẫn ở `index.html`, `reception.html`, `housekeeping.html`, gắn nhãn dữ liệu trình duyệt; chưa cắt chuyển G12.

## Bảng màn hình → file → API → bằng chứng

| Màn hình | File tạo/sửa hoặc dùng lại | API sử dụng | Dữ liệu | Kịch bản đã chạy | Lỗi đã sửa | Còn chờ |
| --- | --- | --- | --- | --- | --- | --- |
| Đăng nhập/khôi phục phiên/đăng xuất | login.html; js/pages/login.js; services/session-service.js, permission-service.js; components/workspace.js | auth/status, login, logout, me, permissions | HTTP thật khi chưa cấu hình; happy path dùng provider fixture | Cookie HttpOnly, đổi quyền/khóa tài khoản, CSRF, điều hướng theo quyền server; không lưu credential/token vào storage | Dùng chung client/phiên; gom request restore đồng thời; xóa quyền khi lỗi/401, xóa nội dung nhạy cảm khỏi UI khi mất phiên | A1/A2, S0, service principal/driver, nhân viên thử/hash được duyệt |
| Sơ đồ phòng | reception-api.html; pages/reception-api.js; api/catalog-api.js | rooms, room-types, hotel-settings | Chưa khả dụng SQL; fixture riêng trong test | 3 trạng thái độc lập, bộ lọc; layout 1366×768, 1920×1080, 390×844 | Không suy phòng trống là sẵn sàng; không lấy KPI demo | Hợp đồng đọc danh mục theo actor |
| Lịch/quỹ phòng | Cùng màn hình lễ tân; api/bookings-api.js | bookings/timeline, bookings/availability; rooms/:id | Chưa khả dụng SQL; fixture lịch tương lai | Khoảng tương lai [01/12,05/12), ngày trả không chiếm thêm đêm; phân trang và lane độc lập | Dùng DTO thực thay vì trường window UTC không được API trả; tính vị trí theo timezone đã xác nhận; tra số phòng theo ID khi thiếu cache | B1/eligibility và nguồn SQL thật; chưa có API quỹ theo khung giờ |
| Đặt phòng lẻ/đoàn/phân/hủy | pages/reception-api.js; api/bookings-api.js; components/modal/table | bookings, bookings/groups, bookings/:id, rooms/:id/assignment, cancel, rooms/cancel; customers | Ghi thật bị khóa; đọc và command/receipt có fixture riêng | Chi tiết giá, xem biểu mẫu lẻ/đoàn, tìm khách ngoài danh sách ban đầu; preview không gửi command; bấm hai lần chỉ gửi một command trong fixture ghi riêng | Key ổn định, chặn gửi mới khi còn pending, gộp nhu cầu từng đêm của đoàn; đổi đầu vào làm mất báo giá cũ; kiểm lịch đầy đủ trước gán; refresh kiểm lại khả năng ghi | B2–B5 atomics/version/receipt; phần ghi/hủy/gán chưa nghiệm thu SQL |
| Báo giá đêm/giờ | api/pricing-api.js; services/ui-service.js; pages/reception-api.js | pricing/quotes/nightly, hourly | Fixture đọc, không giữ quỹ/thu tiền | Đơn vị VND nguyên, timezone +07:00, không gửi actor/giá; loại phản hồi đến sau khi người dùng sửa đầu vào | Không nhận quote thiếu tổng tiền/bảng kê/policy hoặc quote đã committed làm dự kiến | Giá/calendar/policy SQL được duyệt; không tự đặt phụ thu/ngày lễ |
| Khách đến/đang ở/sắp trả | pages/reception-api.js; api/stays-api.js | stays/arrivals, stays, stays/:id | Chưa khả dụng SQL; fixture danh sách | Lọc ngày trả dự kiến theo ngày khách sạn, loại ngày kế tiếp dù UTC nằm ngày trước | Không dùng bộ lọc from/to mơ hồ làm due-out; chỉ lọc khi đã đọc đủ tập đang ở có phân trang xác định (giới hạn 20 trang, vượt giới hạn báo thiếu hợp đồng) | C1/C2 và hợp đồng paging/clock SQL thật |
| Nhận/chuyển/trả sớm/gia hạn | pages/reception-api.js; api/stays-api.js, pricing-api.js | room-readiness, check-in, transfer-room, shorten, early-departure quote; extend client đã có | Chưa khả dụng ghi | Kiểm source DTO/code; command bị khóa trước khi đủ hợp đồng; chưa chạy commit nhận/chuyển/trả sớm qua SQL | Lấy RowVer phòng đích từ readiness, không bịa từ catalog; dùng segment/version từ stay; giá trước/sau trả sớm từ backend, không tự hoàn | C2–C5/receipt; **gia hạn khóa riêng** vì chưa có API xem trước phần giá bổ sung phù hợp |
| Buồng phòng/bảo trì/block/đồ thất lạc | housekeeping-api.html; pages/housekeeping-api.js; api/operations-api.js | operations/capabilities, housekeeping/tasks/rooms, maintenance/tickets/room-blocks, lost-found | HTTP khóa thật + bảng fixture | Không có Store; layout/menu cả 3 kích thước; bảng hàng đợi qua component chung | Modal, phân trang, thông báo và nguồn phiên dùng chung; không mở nghiệm thu từ quyền demo | O1–O4, event/custody, quyền nghiệm thu và eligibility nguyên tử |
| Dịch vụ/minibar | services-api.html; pages/services-api.js; api/services-api.js, minibar-api.js | service-orders, minibar-audits, capabilities/context/catalog/commands | HTTP khóa thật + bảng fixture | Bảng nguồn 0đ, điều hướng, không lộ tổng dư nợ bằng dữ liệu demo; chưa commit G8 | Tái dùng bảng/modal/notification, CSRF theo phiên mới; giữ xử lý charge/credit và unknown outcome hiện có | S1–S4 và liên kết FolioEntry đúng một lần |
| Folio/cọc/thu-hoàn/checkout/ca | finance-api.html; pages/finance-api.js; api/finance-api.js | folios, deposit-accounts, payments, refunds, checkouts, invoices, cashier/shifts, finance/business-days | HTTP khóa thật + folio fixture | Bảng folio theo nguồn; chưa thu/hoàn/checkout thật | Một client/phiên, giữ key và trạng thái chưa rõ commit; liên kết từ lưu trú sang thu ngân mang bookingId để lọc đúng đoàn; không ép đóng cả đoàn | F1–F5, receipt/preview/minibar/master và chính sách hoàn/ca/ngày; e-invoice chưa tích hợp |
| Tổng quan/báo cáo/tài khoản/quyền/audit | admin-api.html; pages/admin-api.js; api/reports-api.js, administration-api.js; pms-data.js dùng lại projection API | reports/*, admin/profile, users, roles, permissions, audit, exceptions | HTTP khóa thật; bảng tài khoản fixture; KPI thật chưa có | Layout/menu, bảng user qua component chung; không điền KPI mẫu khi API lỗi | Tách rõ nguồn API với demo, dùng lại định nghĩa metric và projection đã có, không sửa mô hình quyền | R1–R4 và số liệu G9 được đối soát; chưa nghiệm thu dashboard tiền thật |
| Tra cứu kết quả chưa xác định | operations-status.html; pages/operations-status.js; api/write-coordinator.js giữ nguyên protocol | deployment, requests/lookup | Hợp đồng receipt thật chưa sẵn sàng; fixture kiểm chứng UI | Phản hồi command mơ hồ giữ journal UNKNOWN và khóa nút; tra cứu bằng mã cũ giải quyết pending mà không gửi command thứ ba | Một HTTP client; metadata tab chỉ chứa mã/hash, không chứa body nghiệp vụ; link đối chiếu ở lỗi unknown | Receipt lookup theo actor/deployment đã được duyệt |
| Ba workspace demo cũ | index.html, reception.html, housekeeping.html; controllers/Store cũ giữ lại | Không dùng làm nguồn dữ liệu API | Demo/localStorage, hồ sơ kiểm thử riêng | Đã chạy lại 103/103 UI và 18/18 nghiệp vụ demo ngày 12/11/2026 | Không ghi kép; không xóa/chuẩn hóa dữ liệu trình duyệt thật | Không phải nghiệm thu SQL hoặc nguồn vận hành |

## Thành phần dùng chung

- `js/api/http-client.js`: cùng implementation và singleton `getClient`, cookie same-origin, CSRF do module lấy qua phiên, request ID, timeout, không retry/fallback; 401 phát sự kiện mất phiên.
- `js/services/session-service.js`: restore đồng thời dùng chung promise; quyền từ `/auth/permissions`, actor từ `/auth/me`; CSRF kiểm lại ID nhân viên để chặn trang cũ dùng phiên người khác. Không ghi vào localStorage/sessionStorage.
- `js/services/permission-service.js`: chỉ quyết định hiển thị UI từ quyền server; write còn cần deployment chấp nhận, journal hoạt động và không có request pending. Backend vẫn kiểm mọi quyền/trạng thái/actor.
- `js/services/ui-service.js`: định dạng VND dùng BigInt; null/rỗng/boolean/Number không an toàn không được chuyển thành 0; datetime-local chỉ chuyển theo múi giờ khách sạn xác minh, không theo timezone browser.
- `js/components/table.js`, `pagination.js`, `modal.js`, `notification.js`, `workspace.js`: API lễ tân và các trang API cũ dùng lại cùng skeleton bảng/phân trang/modal/thông báo/phiên/menu. Row renderer đặc thù từng nghiệp vụ được giữ; không dựng component framework thứ hai.
- `css/pms.css` tùy chỉnh UI; các stylesheet domain hiện có giữ lại. Không chỉnh Tabler minified. Không tự chuyển các màn demo thành API hoặc bật nguồn ghi G12.

## Thay đổi backend trong phạm vi tối thiểu

Chỉ thêm `reception-api.html` vào allowlist phục vụ tệp trong `backend/src/app.js`; cập nhật fixture login test dùng `getClient` và browser test chờ landing mới theo quyền. Không sửa service nghiệp vụ/SQL, không cấp quyền hoặc mở driver.

## Cách chạy và xem

Các trang API phải được phục vụ cùng origin với Express; mở bằng `file://` hoặc server tệp riêng không tạo kết nối API. Ví dụ preview **không bật SQL** tại cổng 8090, từ terminal PowerShell:

```powershell
cd backend
$env:NODE_ENV='development'
$env:HOST='127.0.0.1'
$env:PORT='8090'
$env:PUBLIC_ORIGIN='http://127.0.0.1:8090'
$env:DATABASE_PROVIDER='sqlserver'
$env:SQL_DATABASE='SongLamPms_Design'
$env:SQL_SERVER=''
$env:SQL_PORT=''
$env:PMS_WRITE_MODE='demo'
$env:PMS_RELEASE_FILE=''
$env:PMS_BUILD_ID=''
node src/server.js
```

Đây là chạy HTTP/asset và trạng thái chưa sẵn sàng, không phải lệnh kích hoạt database. Không đưa secrets vào các lệnh hoặc bật manifest approval giả.

- http://127.0.0.1:8090/login.html
- http://127.0.0.1:8090/reception-api.html
- http://127.0.0.1:8090/housekeeping-api.html
- http://127.0.0.1:8090/services-api.html
- http://127.0.0.1:8090/finance-api.html
- http://127.0.0.1:8090/admin-api.html

Từ repository root, `python tools/open_frontend_preview.py --port 8090 --page reception-api.html` mở Edge trong profile tạm mới, không dùng/copy dữ liệu trình duyệt thật. Preview demo có thể dùng máy chủ tệp localhost như hướng dẫn `frontend-preview.md`; không dùng máy chủ tệp để khẳng định API đã kết nối.

## Kiểm thử và bằng chứng

`tests/frontend-api.browser.mjs` dùng Edge thật + asset Express thật. Giai đoạn `real-unconfigured` gọi HTTP không có phụ thuộc SQL, xác minh giao diện bị khóa đúng. Giai đoạn `fixture-read/empty/forbidden` dùng CDP cấp phản hồi API tổng hợp trong test. `fixture-write` và `fixture-write-unknown` thay trạng thái deployment chỉ trong profile test, chặn command/receipt ngay tại trình duyệt để kiểm tra bấm lặp, ACK đúng request ID và xử lý kết quả chưa rõ. **Không có command nào tới SQL và không có dữ liệu SQL thật.** Không có flag fixture trong frontend sản phẩm hoặc API mock công khai.

Kết quả đã chạy: **66/66 kiểm tra trình duyệt API đạt**, SQL tests=0; **6/6 test dịch vụ frontend**, **8/8 test view-data**, **103/103 UI demo**, **18/18 nghiệp vụ demo**, **114/114 test backend** và **8/8 kiểm tra login trên trình duyệt với provider fixture**. Các suite đã được chạy lại khi tiếp tục ngày 12/11/2026. Kiểm cú pháp 38 tệp JS frontend đạt, `git diff --check` không lỗi whitespace (có cảnh báo LF/CRLF ở file cũ). Report máy đọc và screenshot fixture trong `screenshots/frontend-api/`; login tại `screenshots/verification/auth-browser-checks.json`. File report có `source` cho từng kiểm tra; không dùng ảnh fixture làm chứng cứ SQL thật.

HTTP preview cổng 8090 đã kiểm thực: `/health` 200; `/ready` 503/false; `/api/v1/auth/status` 200/not_configured; `/api/v1/auth/me` 503/AUTH_NOT_CONFIGURED; `/reception-api.html` 200. Các mã này thể hiện frontend/Express chạy và chức năng thiếu phụ thuộc bị khóa; không thể dùng chúng để kết luận SQL kết nối.

Menu di động mới từng bị dải trạng thái che nút đóng; đã sửa z-index drawer/backdrop và kiểm lại nút thực sự nhận hit-test, Escape khôi phục trạng thái aria trên cả năm trang API. Không chỉ kiểm tra class CSS.

Lượt chạy trước từng bị lỗi biến trùng tên trong script CDP; đã sửa IIFE và chạy lại đạt. Bước chạy lại sau đó từng bị hệ thống approval chặn vì credits; hôm nay đã được phép chạy lại và có kết quả thực. Không thay cách chạy để né phê duyệt.

Các lệnh kiểm tra:

```powershell
node --test tests/frontend-services.test.mjs
node tests/frontend-api.browser.mjs
node tests/view-data.test.js
python run_ui_checks.py
python run_suite.py
# tại backend:
npm.cmd test
node tests/browser/auth.browser.js
```

Không kết luận đặt trùng/transaction/cọc/thu-hoàn/master/checkout đã đạt trên SQL từ unit/fixture/demo. Các luồng ghi thật tiếp tục bị chặn bởi D1–D4 và hợp đồng G3–G10; gia hạn/quỹ giờ có thiếu sót API riêng nêu trong bảng, không tự giả lập thành công.
