# SongLam PMS — báo giá, khách và đặt phòng đã chạy SQL thật

Bàn giao ngày **13/11/2026**, theo yêu cầu trực tiếp cho phép tạo/áp dụng SQL cần thiết và ghi thử trên **`.\SQLEXPRESS / SongLamPms_Design`**. Đây là bản chạy SQL thật có giới hạn, không phải mock/demo và chưa phải cắt chuyển G12.

## Cách mở trên máy hiện tại

Chạy `Start-SongLamPMS.cmd`, hoặc:

```powershell
powershell -NoProfile -ExecutionPolicy RemoteSigned -File tools/sql/open-songlam-test.ps1
```

Mở <http://127.0.0.1:8093/login.html>, dùng tài khoản thử **lễ tân** hoặc **quản lý** đã cấp. Tải lại trang để nạp mã giao diện mới. Thông tin đăng nhập vẫn ở file bí mật cục bộ `tools/sql/private/test-staff-B20261112_UI01/credentials.local.json`; không đưa mật khẩu/hash vào tài liệu, Git hoặc chat.

Frontend và API cùng origin 8093. Node chạy dưới `DESKTOP-9EPI86K\songlam_pms_test`, SQL user `pms_web_auth_test`, Windows Authentication qua `mssql/msnodesqlv8` và ODBC Driver 17. Không chạy pool bằng tài khoản kiểm tra metadata. Không cài thêm dependency trong lượt này; đã sử dụng các bản theo lockfile có sẵn.

Bản chạy đặt tại `C:\ProgramData\SongLamPmsTest\20261112-modules-3-4`. Đây là staging trên chính máy này để tài khoản riêng đọc được source mà không nới ACL toàn bộ hồ sơ Windows của người dùng. Sửa source trong repo rồi đồng bộ/khởi động lại bằng:

```powershell
powershell -NoProfile -ExecutionPolicy RemoteSigned -File tools/sql/activate-booking-test.ps1 -ApprovalReference USER-20261112-REAL-PRICING-CUSTOMER-BOOKING
```

Lệnh này không migration/seed; chỉ sao chép source, manifest đã chuẩn bị và chạy tiến trình dưới đúng credential cục bộ. Không đổi epoch phiên. Không cần chạy lại migration để mở ứng dụng.

`PMS_WRITE_MODE=test-booking`, `NODE_ENV=test`. `/deployment` trả `mode=sql`, `testOnly=true`, `operationalCutover=false`. Ba quyền ghi được mở là `customers.create`, `bookings.create`, `bookings.group`. Đây là giới hạn phạm vi ghi **vào SQL thật**, không phải provider giả. `/ready` trả scope `CUSTOMER_BOOKING_TEST_ONLY`, stage `BOOKING_SQL_TEST`, không chứng nhận toàn bộ G0–G12.

## Nguồn 420 phòng và bảng giá riêng

420 Room được nhập từ **lô Excel của dự án** ở 011, nguồn SHA-256 `2e1e523b3c0463e07a744a78b68fe9ec1c7d3dc05bacb7bb974b95f19daade5d`. Nguồn tự ghi nhiều dữ liệu là giả định đồ án; người dùng cho dùng làm dữ liệu của dự án. Không có chứng cứ đây là danh sách số phòng vận hành thật của Mường Thanh. Lượt này **không tạo/thay đổi Room**: hash toàn bảng trước 012 và sau mọi giao dịch vẫn trùng. 501, 902, 1303, 1704, 2105 tiếp tục cách ly, không có trong Room.

Mường Thanh Luxury Sông Lam chỉ là mẫu tham khảo; **SongLam PMS là hệ thống riêng của nhóm**. Giá dưới đây là quyết định thiết lập giá của hệ thống, không phải bảng giá chính thức hiện hành của khách sạn tham khảo.

Đã tra nguồn công khai [trang khách sạn trên hệ thống đặt phòng Mường Thanh](https://booking.muongthanh.com/hotel-muong-thanh-luxury-song-lam): chỉ mục công khai nêu mức khởi điểm 1.290.000 VND/đêm. Không lấy được báo giá có ngày lưu trú cụ thể: trang chính bị timeout, truy vấn 13–15/12/2026 trên Booking.com không truy cập được qua công cụ. Do đó **không xác nhận mức 1.290.000 là giá của các ngày kiểm thử**, không sao chép nó thành giá cố định của khách sạn. Các mức riêng của nhóm giữ số tiền trong đề xuất nguồn đã chọn, ghi rõ quyền sở hữu, kỳ hiệu lực và điều kiện trong `deploy/booking-pricing-decision.json`.

Đã đối chiếu đủ **20 dòng RateRule trong SQL** với quyết định này:

| Hạng | Giá đêm VND | Gói tối đa 6 giờ VND |
| --- | ---: | ---: |
| SUP-K | 1.100.000 | 650.000 |
| DLX-T | 1.250.000 | 750.000 |
| PRE-K | 1.500.000 | 900.000 |
| PRE-T | 1.500.000 | 900.000 |
| JRS | 1.900.000 | 1.150.000 |
| CLS | 2.300.000 | 1.400.000 |
| EXS | 2.800.000 | 1.700.000 |
| GRS | 3.500.000 | 2.100.000 |
| RYS | 5.000.000 | 3.000.000 |
| PRS | 15.000.000 | 9.000.000 |

Hai RatePlan: `SL-NIGHT-2026-V1`, `SL-HOUR6-2026-V1`; PolicyVersion `SL-OPERATIONS-2026-11`, version 1. Hiệu lực **01/11/2026 đến hết 31/12/2027**, lưu `[2026-11-01,2028-01-01)`. Thời điểm hiệu lực chính sách là 31/10/2026 17:00 UTC, tương ứng 01/11 00:00 Việt Nam. DLX-TR vẫn ngừng hoạt động, không có giá.

Điều kiện của gói riêng: VND nguyên, HALF_UP; cùng giá BASE cho mọi ngày trong kỳ, chưa tăng giá cuối tuần/lễ; giá phòng bao gồm số khách đã khai đến MaxOccupancy của hạng, chưa bán giường phụ hoặc phụ thu theo tuổi riêng. Không giả định công thức phụ thu trẻ em của Mường Thanh. Gói giờ chỉ một gói tối đa 360 phút; quá giới hạn từ chối, không tự cộng gói hoặc tự đổi giá. Giá đêm cần ít nhất một đêm; ở trong ngày quá 6 giờ chưa có gói được mở.

Booking tại quầy được nhân viên có quyền xác nhận, **không đồng nghĩa đã thu cọc**. Chưa mở thu tiền hoặc xác nhận giao dịch ngân hàng. Ngày nghiệp vụ hiện có **11/10/2026** được giữ nguyên, không tự tiến/chốt ngày; giá trước 01/11/2026 không được kéo lùi.

## Biên nhận sớm/trả muộn

Tham khảo [điều khoản công khai của Mường Thanh](https://booking.muongthanh.com/dieu-khoan-chung-c2), nhưng đóng biên rõ và dùng **giá đêm đã chốt** của hệ thống riêng, không giá công bố tại thời điểm thanh toán.

| Thời điểm Việt Nam | Nhận sớm | Trả muộn |
| --- | --- | --- |
| Trước 06:00 | 100% đêm đầu | — |
| 06:00 ≤ giờ < 09:00 | 50% đêm đầu | — |
| 09:00 ≤ giờ < 14:00, gồm 12:00 | 30% đêm đầu | — |
| Từ 14:00 | Không phụ thu nhận sớm | — |
| Đến đúng 12:00 | — | Không phụ thu trả muộn |
| Sau 12:00 đến trước 15:00, gồm 14:00 | — | 30% đêm cuối |
| 15:00 ≤ giờ < 18:00 | — | 50% đêm cuối |
| Từ đúng 18:00 | — | 100% đêm cuối |

Mỗi thời điểm chọn đúng một bậc mỗi chiều. Giá giờ không gọi phụ thu nhận sớm/trả muộn giá đêm. API thực đã kiểm 06:00/09:00/12:00/14:00/15:00/18:00; đối chiếu hàm SQL kiểm giá tại commit với các mốc tương ứng cũng đạt.

## Màn hình → API → service/gateway → SQL

| Luồng | API | Mã ứng dụng chính | RPC/bảng SQL | Kết quả thực tế |
| --- | --- | --- | --- | --- |
| Đăng nhập/menu | auth login/me/permissions | G2 giữ nguyên | RPC auth + WebSession có sẵn | 5 vai trò đăng nhập SQL thật |
| Hạng/phòng/cấu hình | GET room-types/rooms/hotel-settings | catalog service/gateway | Gọi trực tiếp R1 `usp_AppCatalogRead` | Giữ chốt quyền R1, không gọi qua context owner |
| Gói/quy tắc/policy/khách | GET rate-plans/rate-rules/policy-versions/customers | catalog service, định tuyến resourceProcedures | `usp_AppReferenceRead` | Tìm khách có chủ đích; DTO không trả hash/giấy tờ |
| Tạo khách | POST customers | customers routes → service → booking-test gateway | `usp_AppCustomerCreate`; Customer, ApiRequest, AuditLog | Một hồ sơ có nhãn thử, replay trả cùng ID |
| Báo giá | POST pricing/quotes/nightly hoặc hourly | G4 service/engine → pricing gateway | `usp_AppPricingContext`; RatePlan/Rule/PolicyVersion | Đúng giá, ngày và policy từ SQL, không có giá demo |
| Quỹ/lịch/danh sách/chi tiết | GET bookings/availability, timeline, bookings, bookings/:id | G5 service/DTO/gateway | `usp_AppBookingRead`; inventory view, booking/allocation/stay/block | Lịch tương lai, mỗi đêm, phân trang và trạng thái độc lập |
| Tạo đơn/đoàn | POST bookings, bookings/groups | G5 tạo batch bằng giá G4, so acceptedQuoteHash | `usp_AppBookingPrepare` chỉ đọc, `usp_AppBookingCommit` ghi nguyên tử | Giá thay đổi bị từ chối; một transaction cho cả đoàn |
| Kết quả sau timeout | POST requests/lookup | runtime/receipt gateway, write coordinator | `usp_WebReceiptLookup`, ApiRequest | Đúng actor/key/UUID gốc, không gửi lại bằng khóa mới |

Chỉ một HTTP client, phiên/CSRF G2 và một pool SQL thật. Không import SongLamStore vào trang API, không ghi nghiệp vụ localStorage. sessionStorage chỉ giữ metadata yêu cầu chưa rõ kết quả, không dữ liệu khách hoặc token. Không public API seed/import.

## Migration đã thực thi

| Gói | Nội dung đã áp dụng | Backup UUID trước thay đổi |
| --- | --- | --- |
| 012 | 15 function/procedure mới; 1 policy, 2 plan, 20 rate; audit/receipt thiết lập; 8 EXECUTE object hẹp cho service | F08ECA36-0299-497D-BB5C-0FF822FF4193 |
| 013 | Sửa 3 module mới: lịch trống `[]`, thống nhất JSON/hash snapshot, khóa giá và chặn null/đêm trùng; thêm ticket bảo trì vào lịch | 13A822F3-6402-4AAB-B293-850E2D65FEF0 |
| 014 | Đọc giá ngoài kỳ trả mảng rỗng để G4 trả RATE_MISSING/422, không 500 | EEF8B7C8-EC7D-4254-A7A7-4F443E96A490 |

Cả ba backup `COPY_ONLY,CHECKSUM`, `RESTORE VERIFYONLY ... WITH CHECKSUM` đạt. **Chưa thử restore**. Thư mục SQL Server truy cập được:

```text
C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\Backup\
  SongLamPms_Design_Booking012_1794496662153.bak
  SongLamPms_Design_Booking013_1794573169903.bak
  SongLamPms_Design_Booking014_1794574402042.bak
```

Migration chạy dưới tài khoản bảo trì đã kiểm target/GUID, không dưới pool web. Phần thiết lập giá dùng tài khoản thử quản lý 3 làm author của policy; `WEB_PRICE_SETUP` là thao tác maintenance theo ủy quyền, không phải một lần đăng nhập web của quản lý. Audit nghiệp vụ Customer/Booking sau đó lấy actor từ phiên G2 thực.

013 ban đầu bị auto-review chặn do áp ranh giới duyệt từng file cũ. Không SQL nào chạy ở lần bị chặn; đã chuẩn bị/kiểm hash chỉ đọc, đối chiếu câu ủy quyền mới cho phép tạo/áp dụng SQL cần thiết và sửa lỗi, rồi lần xét duyệt tiếp theo cho phép thực thi cùng phạm vi. Không dùng đường vòng để chạy bước bị chặn.

Không chạy các file `.pending` cũ 002/002b hoặc nới role. Giữ nguyên trigger `CommandOnly`/immutable. Public command mới tự kiểm actor/quyền, giữ `SongLam:Inventory`, tạo context hợp lệ, ghi dữ liệu/audit/receipt rồi xóa context trong cùng transaction. Không gọi RPC ghi tổng quát cũ; service bị DENY trực tiếp `usp_ApplyCommand`, `usp_ExecuteCommand`, helper riêng `usp_WebAuthorize`.

Tám EXECUTE mới: `usp_AppPricingContext`, `usp_AppReferenceRead`, `usp_AppBookingRead`, `usp_AppBookingPrepare`, `usp_AppBookingCommit`, `usp_AppCustomerCreate`, `usp_WebReceiptLookup`, `usp_WebBookingRuntime`. Không GRANT SELECT/DML bảng, không db_owner/sysadmin, không sửa UserRole/RolePermission. PrincipalBinding vẫn 0. Definition hash của 22 đối tượng liên quan được kiểm trước khi mở ghi và trước lookup; drift sẽ khóa thay vì fallback.

SQL kiểm lại giá/policy hiện hành dưới khóa, tính VND bằng hàm SQL dùng chung cho xác minh, đối chiếu snapshot G4, quỹ mọi mốc trong khoảng, phòng cụ thể, FK khách và số dòng tối đa 500/4.000.000 byte UTF-16. Ứng dụng giới hạn 50 phòng, 300 liên kết khách; không chia đoàn thành nhiều commit. RequestHash UTF-8 canonical được kiểm lại trong SQL; unique Actor/Operation/IdempotencyKey và khóa transaction chặn ghi lặp. UUID yêu cầu gốc bắt buộc cho ghi.

## Bản ghi thử được thêm

Lô **`SONGLAM_TEST_BOOKING012_20261113122015`**. Một Customer ID **1**, code `SLT-C-A6B75CC7495F42A2B201B0E32883B4B0`, tên có đúng nhãn lô và Notes có `[SONGLAM_TEST:BOOKING012]`. Không tạo khách thật hoặc dùng thông tin cá nhân không được cung cấp. Các hồ sơ nhân viên có trước được giữ nguyên.

| Booking ID | Code | Kịch bản, khoảng nhận/trả Việt Nam | Actor G2 |
| --- | --- | --- | --- |
| 1 | SL-A4935C13-CC4E-4E73-95B9-2820145CC548 | UI, SUP-K P.502, 13/12/2026 14:00 → 15/12 12:00 | 4, lễ tân |
| 2 | SL-57B8373C-75C6-41EA-A420-23A14DE83605 | Hai nhân viên tranh phòng PRS duy nhất, 20/01/2027 14:00 → 22/01 12:00; chỉ một thắng | 4, lễ tân |
| 4 | SL-8F37E447-E284-4811-A9D2-EAF9FDDE37D3 | Đoàn 2 phòng SUP-K, 10/01/2027 14:00 → 12/01 12:00 | 4, lễ tân |
| 6 | SL-D6F648F5-1BD6-450A-921F-B3C9189B70DD | SUP-K 25/01/2027 14:00 → 20:00, 650.000đ, không phí trả muộn đêm | 4, lễ tân |
| 7 | SL-A8A4D7EC-F8FF-40C7-80CD-8365BDBBAB62 | PRS 22/01/2027 12:00 → 24/01 12:00, tiếp nối đúng thời điểm đơn 2 kết thúc; mất phản hồi sau commit | 3, quản lý |

ID 3/5 không có là kết quả identity tiêu thụ trong giao dịch rollback, không phải bản ghi bị xóa. Không xóa/hủy các đơn thử; chúng đang giữ quỹ đúng các khoảng trên. BookingGuest là khai báo dự kiến của hồ sơ thử dùng chung cho diễn tập, chưa phải hiện diện thực tế: Stay/StayGuest chưa tạo và không có phòng bị chuyển sang có khách.

Đối chiếu cuối: **5 Booking, 6 BookingRoom, 10 BookingNightRate, 6 RoomAllocation, 6 BookingGuest, 1 Customer, 6 receipt khách/booking, 28 audit liên quan**. Ngoài ra có receipt/audit riêng của thao tác thiết lập giá. Nhánh đoàn lỗi ở phòng thứ hai và bên thua tranh phòng không để lại Booking dở dang, receipt PROCESSING hoặc CommandExecution. Snapshot/giá từng đêm và hash trong audit so khớp từng dòng, không chỉ kiểm tổng.

| Tiền | Giá trị VND | Ý nghĩa |
| --- | ---: | --- |
| Giá phòng cơ bản trong snapshot | 67.250.000 | Có cả 650.000 gói giờ, không phải doanh thu đã ghi nhận |
| Phụ thu nhận sớm | 4.500.000 | Đơn 7, 30% đêm đầu PRS đã chốt |
| Tổng lưu trú dự kiến | 71.750.000 | Bằng cơ bản + phụ thu |
| Tiền thực thu / cọc đã thu | 0 / 0 | Không tạo Payment/DepositMovement |
| Folio / Stay | 0 / 0 | G6/G9 chưa mở, không gọi giá đặt phòng là công nợ folio |

## Kiểm tra đã chạy

| Lệnh/công cụ | Kết quả | Bằng chứng/phạm vi |
| --- | --- | --- |
| `booking-sql-browser.mjs --approved=USER-20261112-REAL-PRICING-CUSTOMER-BOOKING` | 18 kiểm tra đạt, 0 lỗi JS/tài nguyên | UI tạo khách, chọn phòng, báo giá, đổi đầu vào làm hết báo giá, xác nhận, mã đơn, tải lại SQL, viewport 1366/1920/390 |
| `booking-sql-integrity.mjs` cùng approval | 34 kiểm tra đạt | 5 vai trò; concurrent 201/409; replay cùng đơn; đoàn 2 phòng; đoàn lỗi 409; hourly; biên phí; thiếu quyền/CSRF và actor giả |
| `booking-sql-timeout-browser.mjs` cùng approval | 8 kiểm tra đạt | Chrome nhận server status 201 sau commit thật rồi **chỉ gây lỗi truyền tải**; client UNKNOWN, khóa ghi mới, lookup COMMITTED, giữ đúng một đơn |
| `booking-sql-ui-readback.mjs` cùng approval | 13 kiểm tra đạt | Mở lại đơn/lịch, 3 viewport, giá ngoài kỳ 422, ngày sai/offset sai, >6 giờ từ chối, readiness chỉ scope thử |
| `booking-sql-final-checks.mjs` cùng approval | 6 kiểm tra đạt | Lookup bản cuối, không lộ receipt khác actor, replay Customer cùng ID, UUID sai bị chặn, G9 khóa |
| `node tools/sql/reconcile-booking.mjs --read-only` | 76 kiểm tra SQL đạt | Từng FK, nightly rate, snapshot/audit hash, receipt, actor 3/4, rollback, 20 giá, VND, UTF-8 tiếng Việt, quyền hẹp và hash Room |
| `npm.cmd test` trong backend | 165/165 đạt | Bộ kiểm thử có sẵn bằng fixture, **không dùng kết quả này để chứng minh SQL**; không thêm unit test mới |
| Launcher `open-songlam-test.ps1 -NoOpen` | Đạt | Nhận diện backend/SQL và phạm vi ghi thật hẹp; không migration/seed |

Lỗi đã sửa: gọi R1 lồng trong context owner; lịch trống thiếu `segments`; khác chuẩn escape slash khi so hash; null/coverage trong snapshot; thiếu giá ngoài kỳ bị coi là lỗi hợp đồng; launcher mặc định chỉ chấp nhận frozen; nhãn readiness G12 gây hiểu nhầm. Các lỗi cú pháp/click selector trong công cụ diễn tập cũng đã sửa và chạy lại, không dùng lần thất bại làm bằng chứng đạt.

Nguồn bằng chứng: `screenshots/booking-sql/`, `tools/sql/private/booking012/` (deployment/current-deployment, backup, ui-run, http-integrity, timeout-browser, ui-readback, final-http-checks, reconciliation). File cục bộ có intent/key của **dữ liệu thử** để tiếp tục an toàn; không chứa cookie/password/token. Không publish thư mục private qua web/Git.

## Tệp đã tạo/sửa

- SQL: `database/migrations/012-booking/*.sql`, `013-booking/*.sql`, `014-booking-empty-rates/fn_WebPricingContext.sql`.
- Backend: `src/app.js`, `server.js`, `config/environment.js`, `adapters/sql/runtime.js`, `catalog-gateway.js`, `pricing-gateway.js`, `bookings-gateway.js`, mới `booking-test-gateway.js`; `modules/customers/routes.js`, `service.js`; `modules/bookings/service.js`, `validation.js`; `modules/cutover/booking-test-runtime.js`, `routes.js`, `operations.js` (đều dưới backend).
- Frontend: `reception-api.html`, `js/pages/reception-api.js`, `js/api/customers-api.js`, `bookings-api.js`, `js/deployment.js`; dùng lại component, HTTP client, phiên/quyền và CSS đã có, không tạo hệ song song.
- Cấu hình/công cụ: `deploy/booking-pricing-decision.json`; các `tools/sql/deploy-booking.mjs`, `upgrade-booking-integrity.mjs`, `upgrade-booking-empty-rates.mjs`, `prepare-booking-runtime.mjs`, `activate-booking-test.ps1`, `booking-service-entry.mjs`, `probe-booking-service.mjs`, `reconcile-booking.mjs`, sửa `open-songlam-test.ps1`; các công cụ kiểm tra thực ở bảng trên; tài liệu trạng thái.

## Giới hạn còn lại

- Chưa lấy được báo giá tham khảo có ngày cụ thể từ website khách sạn; không coi chỉ mục tìm kiếm là báo giá theo ngày. Giá đang chạy là **giá riêng đã thiết lập của nhóm**, có kỳ và version rõ.
- Chưa mở gán/đổi/hủy sau xác nhận, check-in/out, thu/cọc/hoàn, master folio, ca/ngày, hóa đơn và G12. Không tự bật các gateway đó. Quyết toán không nằm trong kết quả đạt của lượt này.
- Gói giờ >6 giờ trong cùng ngày, giường phụ và chính sách theo tuổi chưa mở. Không dùng giá mặc định hoặc âm thầm chuyển loại giá.
- Chưa diễn tập restore backup hoặc cắt chuyển vận hành. Nếu đã có giao dịch mới, phải backup/đối chiếu chúng trước phương án phục hồi; không restore bản 012/013 đè lên 5 đơn mới.
- Tra cứu sau sự cố phải giữ **Idempotency-Key và UUID gốc** như client đang lưu. Không xóa nhật ký UNKNOWN hoặc tự tạo yêu cầu thay thế khi lookup còn UNKNOWN.

Không đánh giá “toàn bộ hệ thống sẵn sàng vận hành” từ phạm vi đặt phòng đã chạy được này.
