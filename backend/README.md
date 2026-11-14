# SongLam PMS — backend

## Trạng thái xác minh ngày 13/11/2026

Đã chạy đường thật frontend → Express → pool tài khoản dịch vụ riêng → `.\SQLEXPRESS / SongLamPms_Design` cho đăng nhập, danh mục, báo giá, tạo khách và tạo đơn lẻ/đoàn. Phạm vi ghi chỉ `customers.create`, `bookings.create`, `bookings.group`, cấu hình `NODE_ENV=test`, `PMS_WRITE_MODE=test-booking`; chưa cắt chuyển vận hành hoặc mở G6–G12.

Mở từ thư mục gốc bằng `Start-SongLamPMS.cmd`, truy cập <http://127.0.0.1:8093/login.html>. Backend thật được launcher chạy dưới tài khoản dịch vụ riêng từ staging; không dùng danh tính quản trị để chạy pool. Không cần chạy migration/seed lại để mở ứng dụng. Chi tiết migration, khởi động, dữ liệu thử và bằng chứng: [báo cáo SQL thực thi](../docs/booking-sql-execution-2026-11-13.md).

Bàn giao booking trước đó: **165/165 kiểm thử fixture** và **76 kiểm tra đối chiếu SQL thật** đạt; hai kết quả là hai phạm vi riêng. Lượt tiếp theo bổ sung chốt giá gia hạn/trả sớm, receipt tài chính và gói 015 chờ duyệt; **178/178 fixture** đạt, chưa áp dụng SQL mới. Xem [trạng thái lưu trú/tài chính](../docs/lifecycle-next-approval.md). G10 tài chính/báo cáo và các phần lịch sử bên dưới vẫn giữ giới hạn được mô tả, không được coi là đã nghiệm thu SQL từ kết quả đặt phòng.

## Lịch sử khung G10 và các giai đoạn trước

Đã đăng ký `/reports`, `/users`, `/roles`, `/permissions`, `/audit`, `/exceptions` và `/admin/profile` (dưới `/api/v1`). Gateway G10 chỉ đọc, actor G2/quyền nguồn, projection không credential/session/raw audit JSON. Dashboard/cash/revenue/debt phân biệt thời điểm/phạm vi ghi nhận và unavailable. Page `admin-api.html` không nạp Store/data demo, không ghi kép. HTTP observation chỉ logger đã lọc, chưa là durable SQL audit. Chưa có phê duyệt gateway/metric reconciliation/clock/journal nên không bật dữ liệu thật giả; chưa viết/chạy kiểm thử, không thay SQL hoặc quyền. Xem [G10](../docs/g10-management.md), [SQL proposal](../docs/g10-sql-proposals.md). Lệnh chạy nền giữ nguyên, không cài dependency G10.

## Nền G9

Đã thêm folios/deposit-accounts/payments/refunds/checkouts/invoices/cashier/shifts và finance/business-days, context/preview/command theo actor G2. Một RPC ghi được yêu cầu sở hữu transaction và receipt/idempotency; không bọc chuỗi thu/hoàn/đóng stay trong Node. Form `finance-api.html` tách demo, không ghi kép. Thiếu manifest/policy thì khóa; chưa có vận hành SQL thật. Không mở xác nhận ngân hàng, hóa đơn điện tử, approval refund chưa duyệt hoặc after-close adjustment. Không thay SQL, không viết/chạy kiểm thử. Xem [G9](../docs/g9-finance.md), [SQL/folio cần duyệt](../docs/g9-sql-proposals.md). Lệnh chạy nền phía dưới giữ nguyên, không cài dependency cho G9.

## Nền G8

Đã đăng ký `/api/v1/service-orders`, `/api/v1/minibar-audits`: tạo/xem, giao/hủy dịch vụ, confirm/dispute minibar, catalog và ngữ cảnh folio tối thiểu. Actor/CSRF từ G2, một RPC nguyên tử có receipt/idempotency, giá BigInt và snapshot, credit liên kết; không balance/full folio cho housekeeping. Form `/services-api.html` qua HTTP client, tách demo/localStorage. Chưa có hợp đồng SQL/folio được duyệt nên không bật vận hành hoặc giả ghi phí. Không viết/chạy kiểm thử, không thay SQL. Xem [bàn giao G8](../docs/g8-services-minibar.md), [đề xuất cần duyệt](../docs/g8-sql-proposals.md); lệnh chạy nền phía dưới giữ nguyên, không cần cài thêm thư viện G8.

## Nền G7

Đã đăng ký API housekeeping/tasks/rooms, maintenance/tickets/room-blocks và lost-found cùng capabilities; actor/CSRF/quyền từ G2, DTO tối thiểu, CAS/idempotency/receipt cho một command nguyên tử. Đã nối trang `/housekeeping-api.html` riêng, không localStorage. Không có driver/pool/manifest hoặc kho phiên vận hành được tự bật. Nghiệm thu sạch và hợp đồng SQL/event/custody/eligibility còn chờ duyệt. G5–G6 trả lỗi khi chưa có bảo đảm eligibility G7; không giả phòng đã khả dụng. Không viết/chạy test trong lượt này. Xem [bàn giao G7](../docs/g7-operations.md), [SQL cần duyệt](../docs/g7-sql-proposals.md). Cách chạy phía dưới giữ nguyên; không cài thêm thư viện cho G7.

## Nền G6

Đã viết `/api/v1/stays/check-in`, `/:id/transfer-room`, `/:id/extend`, `/:id/shorten` và read APIs. Tái sử dụng giá/snapshot G4–G5; thêm API client `js/api/stays-api.js`, chưa nối biểu mẫu. Không check-out/quyết toán (G9), không thu/hoàn tiền hoặc đóng folio. Hợp đồng actor/atomic/giá điều chỉnh còn chờ duyệt; không bật SQL bằng flag giả. Xem [bàn giao G6](../docs/g6-stays.md), [đề xuất SQL cần duyệt](../docs/g6-sql-proposals.md). Lượt này không tạo/chạy kiểm thử.

## Nền G5

Đã viết API đặt phòng, quỹ/lịch, gán phòng và hủy, dùng giá G4; thêm client `js/api/bookings-api.js` nhưng chưa nối giao diện. Tất cả luồng SQL mới còn chờ hợp đồng theo actor, transaction/idempotency và kế toán cọc được phê duyệt; không gọi G5 hoàn thành. Không có SQL migration hoặc giao dịch tiền thật. Xem [bàn giao G5](../docs/g5-bookings.md) và [đề xuất SQL cần duyệt](../docs/g5-sql-proposals.md). Lượt này chỉ viết code, không tạo/chạy kiểm thử.

## Nền G4

Đã thêm danh mục RatePlan/RateRule/PolicyVersion và POST `/api/v1/pricing/quotes/nightly`, `/hourly`, `/early-departure`. Giá chỉ lấy từ ngữ cảnh SQL/chính sách/lịch được duyệt, không dùng giá demo. Có bảng kê, tiền VND nguyên, snapshot ứng viên và phân biệt ước tính với giá đã chốt; không tạo booking hoặc ghi snapshot. Hợp đồng và chính sách thực tế còn chờ duyệt nên không bật báo giá thật. Xem [G4: công thức, API và phần bị chặn](../docs/g4-pricing.md). Lượt G4 không tạo/chạy kiểm thử theo yêu cầu.

## Nền G3

Đã đăng ký GET room-types, rooms, services, hotel-settings, business-days và customers theo route → service → SQL gateway. Các route dùng actor/quyền G2, DTO giới hạn trường và capability SQL được duyệt; không có dữ liệu giả hoặc fallback. G2 và hợp đồng delegated read còn chờ phê duyệt nên server mặc định tiếp tục báo chưa sẵn sàng. G3 chỉ viết code, chưa chạy kiểm thử theo yêu cầu. Xem [API và đề xuất SQL G3](../docs/g3-sql-proposals.md).

## Nền G2

Đã thêm login/logout/me/permissions, quản lý phiên, CSRF, middleware quyền và adapter SQL nhận pool được cấp bởi bootstrap tin cậy. A1/A2/A3 và kho phiên chưa được phê duyệt; server mặc định không nạp driver/pool/store và các API xác thực trả 503. Luồng thành công mới được kiểm thử với fixture, không có tài khoản hoặc phiên vận hành thật. Xem [bàn giao G2](../docs/g2-authentication.md).

Các bước chạy bên dưới giữ nguyên. Tài liệu G1 dưới đây mô tả nền đã có; bổ sung G2 thay endpoint POST login bị khóa bằng implementation có thể nhận dependency đã duyệt. Không có env flag bật giả đăng nhập hoặc fixture cho server.

Khung Express phục vụ health/readiness, hợp đồng lỗi JSON, trang login chưa kích hoạt và tài nguyên frontend được chỉ định. Chưa có driver, pool hoặc kết nối SQL; chưa có xác thực/phiên thật hay API nghiệp vụ được bật trên server mặc định. Không có backend PostgreSQL hoặc cơ chế tự migration/seed.

## Chạy trên Windows

Cần Node.js >=22; lần kiểm tra này dùng Node.js 26.13.0. Từ thư mục dự án:

```powershell
cd backend
npm.cmd ci --ignore-scripts
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm.cmd start
```

Hoặc xem ngay bằng cấu hình mẫu, không tạo `.env`:

```powershell
node --env-file=.env.example src/server.js
```

- Login: http://127.0.0.1:3000/login.html
- Demo qua Express: `/index.html`, `/reception.html`, `/housekeeping.html`.
- `/` chuyển tới trang login; login chưa kích hoạt và không bảo vệ/đổi hành vi demo.
- Dừng bằng Ctrl+C.

Đường chạy demo trước đây vẫn giữ nguyên: tại thư mục gốc chạy `python -m http.server 8080 --bind 127.0.0.1`. Tiếp tục dùng đúng origin cũ để thấy cùng dữ liệu localStorage. Cổng 3000 là một origin khác; không tự chuyển hoặc đồng bộ dữ liệu từ 8080.

## Cấu hình

| Biến | Kiểm tra |
| --- | --- |
| NODE_ENV | development/test/production, bắt buộc |
| HOST | Địa chỉ bind, bắt buộc; mẫu dùng loopback |
| PORT | Số nguyên 1–65535, bắt buộc |
| PUBLIC_ORIGIN | HTTP(S) origin không có credential/path/query; production phải HTTPS |
| DATABASE_PROVIDER | Chỉ chấp nhận sqlserver |
| SQL_DATABASE | Chỉ chấp nhận SongLamPms_Design trong phạm vi hiện tại |
| SQL_SERVER, SQL_PORT | Có thể trống để khởi động G1; readiness báo thiếu; nếu có port thì phải hợp lệ |

Thiếu/sai cấu hình runtime khiến startup thoát code 1, chỉ log tên trường, không log giá trị. Thiếu phụ thuộc G2 không ngăn health hoạt động nhưng luôn làm readiness thất bại. Không có biến môi trường bật xác thực hoặc giả nhận đã kết nối SQL trong G1.

`.env` được gitignore. Không đưa mật khẩu/token vào URL, code hoặc log. G1 không cần mật khẩu SQL hay session secret.

## Endpoint đang có

| Endpoint | Kết quả |
| --- | --- |
| GET /health | 200: tiến trình HTTP đang chạy; không chứng minh SQL sẵn sàng |
| GET /ready | 503: ready=false; thiếu cấu hình SQL nếu có, SQL chưa kiểm tra, auth/actor chờ duyệt, session chưa cấu hình |
| GET /api/v1/auth/status | 200 với loginEnabled=false, trạng thái not_configured |
| POST /api/v1/auth/login | 503 AUTH_NOT_CONFIGURED khi dữ liệu hợp lệ; không cấp cookie/token/phiên |
| POST /api/v1/auth/logout | 503 AUTH_NOT_CONFIGURED khi chưa có dependency được duyệt; không giả xác nhận hủy phiên |
| GET /api/v1/auth/me, GET /api/v1/auth/permissions | 503 AUTH_NOT_CONFIGURED trên server mặc định; chưa có nguồn SQL được duyệt |
| API nghiệp vụ chưa triển khai | 404 API_NOT_FOUND |

POST login chỉ chấp nhận JSON có username/password; trường actor/role bị từ chối. Sai đầu vào trả 400, sai media type 415, quá 16 KB trả 413. Server mặc định chưa tra cứu tài khoản thật. Kiểm thử fixture G2 có xác minh hash thật bằng crypto trên dữ liệu kiểm thử, không dùng SQL thật.

Phản hồi dùng `data` hoặc `error`, cùng `requestId`. Có header X-Request-ID; lỗi không lộ stack/exception gốc. Log chỉ chứa mã theo dõi, method, status, event/code; không ghi body, query, credential, config hay exception text.

Chỉ phục vụ các HTML demo/login, favicon và thư mục css/js. Không phục vụ backend/, database/, docs/, tests/, node_modules/ hoặc tệp ẩn. Không chạy Express static ở toàn bộ project root. Trang login có CSP riêng, không áp CSP chặn inline handler lên demo cũ.

## Kiểm thử

```powershell
cd backend
npm.cmd test
npm.cmd run test:browser
```

- Node test runner tích hợp: config, HTTP, lỗi, static allowlist, HTTP client và login không báo thành công giả. Không cần SQL.
- Browser test: Edge headless, profile tạm riêng, CDP bằng WebSocket có sẵn trong Node. Có thể chỉ định EDGE_PATH nếu Edge ở vị trí khác. Test chạy app trên cổng tạm, chụp ảnh tại `screenshots/g1/`, bảo toàn sentinel localStorage trong chính profile thử và xóa đúng profile nó tạo.
- Browser test không dùng profile người dùng. Không coi dữ liệu thử là dữ liệu thật.
- Hồi quy demo: dùng Python server gốc cổng 8080 rồi chạy các lệnh tại `docs/g0-g1-validation.md`.
- Không chạy `tests/sqlserver/*.py` trong phạm vi này vì chúng có khả năng ghi/tạo/xóa database.

Tài liệu: [kiểm kê nguồn](../docs/source-inventory.md), [đề xuất SQL cho G2](../docs/sql-proposals.md), [kết quả G0–G1](../docs/g0-g1-validation.md).
