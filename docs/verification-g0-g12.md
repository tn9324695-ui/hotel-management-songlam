# Rà soát G0–G12 — kết quả độc lập SQL, 09/11/2026

**Chưa nghiệm thu SQL hoặc vận hành.** Đã chạy ứng dụng/HTTP, kiểm thử code/fixture và Edge trong hồ sơ tạm riêng; đã sửa lỗi và chạy lại. Theo xác nhận của người dùng, không ghi/import/migration trên SQL khi chưa được chỉ định môi trường. Không đọc browser/dữ liệu khách thật, không cắt chuyển, không tạo/sửa schema/procedure/trigger/quyền SQL.

Không tìm thấy AGENTS.md trong repo hoặc các thư mục cha đã kiểm tra. Trước sửa đã đọc cấu trúc, frontend, backend/config, G11/G12, schema script và các đề xuất/hợp đồng G2–G10. Giữ các thay đổi cũ đang có; số lượng diff từ Git gồm nhiều giai đoạn trước, không phải toàn bộ do lượt rà soát này.

## Ma trận màn hình → API → service → SQL → bảng

Tên bảng là đối chiếu script nguồn, **không phải xác nhận bảng/procedure đang triển khai trên DB thật**. Gateway mặc định không có pool/driver/manifest được phê duyệt; backend chỉ phụ thuộc Express. Không đi vòng qua private/public principal gateway để làm test đạt.

| Màn hình/nguồn | API/client | Service | SQL gateway / hợp đồng thiếu | Bảng/view theo source | Hiện trạng |
| --- | --- | --- | --- | --- | --- |
| index.html: dashboard, timeline, phòng, khách, thanh toán demo | js/app.js → SongLamStore; không gọi API nghiệp vụ | js/store.js, js/pms-data.js | Không | localStorage songlam_hotel_pms_data_v2; INITIAL_DATA minh họa | Còn localStorage/demo; kiểm UI 100/100 và 8 model assertions, không gọi là số liệu SQL |
| reception.html: đặt/nhận/chuyển/gia hạn/trả sớm demo | js/reception.js → Store | Store | Không | Cùng key localStorage | Còn demo; G5/G6 clients đã có nhưng chưa nối màn này. Mode frozen/API chuyển sang status, không fallback |
| housekeeping.html demo | js/housekeeping.js → Store | Store | Không | Cùng key localStorage | Còn demo; luồng API riêng ở housekeeping-api.html |
| login.html | POST auth/login, GET auth/status/me | modules/auth/runtime, sessions, password-verifier | approved-contracts.js; A1/A2/A3 và kho phiên/hash còn thiếu | AppUser/UserRole/AppRole/RolePermission/Permission/PrincipalBinding, session store chưa chọn | Đã sửa UI nối API khi G2 configured; browser → Express/session thật chạy đạt với **SQL pool fixture**; server mặc định vẫn AUTH_NOT_CONFIGURED |
| Danh mục / khách | /room-types, /rooms, /services, /hotel-settings, /business-days, /customers qua catalog routes | modules/catalog/service.js | catalog-gateway.js, G3 actor-scoped read | RoomType/Room/vRoomStatus/Service/HotelSettings/BusinessDay/Customer | API có code; SQL chặn; chưa nối các bảng legacy sang nguồn thật |
| Báo giá (API client, chưa có màn API lễ tân) | POST pricing/quotes/nightly,hourly,early-departure | pricing/service, engine, stay-change | pricing-gateway.js/stay-pricing-gateway.js; P1/C4 | RatePlan/RateRule/PolicyVersion/HotelSettings và calendar contract | Pure engine/validation chạy fixture; chưa xác minh giá/chính sách thật |
| Đặt phòng / availability / timeline | js/api/bookings-api.js → /bookings, /availability, /timeline, /groups, assignment/cancel | modules/bookings/service,batch,validation | bookings-gateway.js; B1–B5 | Booking/BookingRoom/BookingNightRate/BookingGuest/RoomAllocation, Folio/RefundRequest liên quan | Client chưa nối màn legacy; validation nhóm/trùng khoảng chạy unit; **chưa kiểm tranh phòng SQL đồng thời** |
| Nhận/chuyển/gia hạn/shorten | js/api/stays-api.js → /stays/check-in, /:id/transfer-room,extend,shorten | stays/service,commands | stays-gateway.js; C1–C5 | Stay/StayRoomSegment/StayGuest/RoomAllocation/BookingRoom/FolioEntry | Compiler từ chối phòng không sẵn sàng đã chạy unit; chưa chạy SQL transaction hoặc màn lễ tân API |
| housekeeping-api.html | operations client → /housekeeping/tasks,rooms, /maintenance/tickets,room-blocks, /lost-found | operations + housekeeping/maintenance/lost-found | operations-gateway.js; O1–O4 | HousekeepingTask/Room/MaintenanceTicket/RoomAllocation/LostFound, event/custody contract | Trang thực thi qua HTTP; mặc định báo thiếu auth, không tạo Store; inspection chưa duyệt vẫn khóa |
| services-api.html | services/minibar clients → /service-orders, /minibar-audits | services/minibar services, amount/dto/validation | consumption-gateway.js; S1–S4 | ServiceOrder/Line, MinibarAudit/Line, Stay/Segment, FolioEntry | UI lỗi/empty chạy thật; zero audit, giá/quantity/rounding validation chạy unit. Chưa xác minh SQL unique source-line/credit |
| finance-api.html | finance client → /folios,/deposit-accounts,/payments,/refunds,/checkouts,/invoices,/cashier/shifts,/finance/business-days | finance/service,receipt,dto + các module wrapper | finance-gateway.js; F1–F5 | Folio/FolioEntry/DepositAccount/Movement/Payment/RefundRequest/StaySettlement/Invoice/Line/CashierShift/BusinessDay | UI chạy với trạng thái khóa đúng; số dư và timeout/idempotency fixture đạt; **chưa thu/hoàn/checkout trên SQL** |
| admin-api.html | reports/administration clients → /reports/*,/users,/roles,/permissions,/audit,/exceptions | reports/management services + users/roles/audit/exceptions | management-gateway.js; R1–R4 | StaySettlement/Payment/FolioEntry/vFolioBalance, AppUser/AppRole/Permission/AuditLog/ExceptionCase | Không KPI demo dự phòng; role fixture kiểm 403/503; báo cáo SQL và số liệu sau giao dịch chưa chạy |
| operations-status.html | /deployment, /requests/lookup; /internal/status theo quyền | cutover/runtime,routes | Chưa có receipt lookup/probe/monitor adapter được duyệt | Durable receipt/activation/delta contracts chưa chốt | Mode/readonly/metadata/unknown thực thi đã kiểm; mặc định lookup 503, không giả commit |
| G11/G12 CLI nội bộ | Không API import công khai | tools/migration, tools/cutover | Import adapter luôn khóa; readback/activation/delta thiếu | MigrationMap có trong source, chưa đủ registry/receipt/atomic import | Phân tích/manifest/quarantine và importer fixture test; không nhập dữ liệu thật |

Hiện không thấy đường ghi một nghiệp vụ đồng thời vào localStorage và SQL trong chế độ được phục vụ: demo giữ Store, command API khóa; API pages không nạp Store; G12 chặn Store trong mode khác demo. Metadata request trong sessionStorage không phải bản sao sổ tiền. **Đóng băng tất cả tab/origin/bản static cũ vẫn cần xác nhận vận hành**, không suy từ test một tab.

## Lỗi đã tái hiện và sửa

| Lỗi | Sửa | Kiểm lại |
| --- | --- | --- |
| G12 guard chặn route fixture G2, khiến test quyền/CSRF/actor/pool không tới middleware cần kiểm | Chỉ cho registerRoutes trong NODE_ENV=test; đăng ký fixture trước guard, server vận hành không có hook | 57 test cũ đạt lại, thêm test hook bị cấm ngoài test và mọi business family vẫn khóa |
| Test request ID còn kỳ vọng chuỗi tùy ý; test booking còn kỳ vọng endpoint chưa tồn tại | Cập nhật kỳ vọng UUID và 503 CUTOVER_WRITE_LOCKED cho command đã có, vẫn kiểm 404 route đọc chưa có | api.test.js đạt |
| Frontend login luôn khóa kể cả G2 báo đã configured | Nối username/password qua HTTP; chỉ bật với status đầy đủ; xác nhận /auth/me cùng user/CSRF trước chuyển trang; xóa password, không lưu token/role | Unit login + browser login fixture thực qua Express, HttpOnly/session/CSRF/thu hồi quyền/khóa account đạt |
| **Importer G11 chấp nhận receipt PENDING và ghi checkpoint COMMITTED** | Bắt buộc status COMMITTED + thời điểm hợp lệ trước checkpoint | Test mới ban đầu trượt “Missing expected rejection”; sau sửa đạt; timeout sau commit/replay fixture chỉ gọi import một lần |
| Browser harness cũ cố định đúng 2 script login, không kiểm API pages thực thi | Kiểm script cho phép + cấm Store ở login/API; thêm 5 trang × 3 kích thước, ảnh và runtime errors; test auth browser riêng | 29/29 default pages, 8/8 authenticated fixture |
| Thông báo login offline vẫn ngụ ý dùng demo thay | Hiển thị chưa xác thực, không thay bằng phiên/dữ liệu demo | Unit và browser checks đạt |

Browser ban đầu không khởi động trong sandbox (GPU/cache access). Đã chạy lại với quyền thực thi cần thiết trên **hồ sơ tạm riêng**, không mở profile người dùng, đạt. npm ci ban đầu bị EPERM đọc cache; chạy lại cài đúng lockfile, ignore-scripts/no-audit/no-fund/offline, 65 packages. Không sửa SQL để vượt lỗi môi trường.

## Kết quả kiểm thử cuối

| Bộ kiểm | Kết quả cuối | Loại bằng chứng |
| --- | --- | --- |
| Backend node:test | **89/89**, 0 trượt | Unit + HTTP localhost + SQL pool/store/gateway fixture, không SQL thật |
| View model | **8/8 assertions**, 0 trượt | Node model trên dữ liệu giả; Node reporter tính một file test |
| Nghiệp vụ demo | **18/18**, 0 trượt | Edge fresh profile/localStorage minh họa |
| UI demo | **100/100**, 0 trượt, errors=[] | Edge fresh profile, 1366×768/1920×1080/390×844, screens/menu/links/assets |
| Login/API/status browser | **29/29**, 0 trượt | Express mặc định thiếu SQL/auth; 5 trang API × 3 kích thước, preserve sentinel, no fallback, no JS exceptions/asset failure |
| Auth browser → backend | **8/8**, 0 trượt | Browser cookie/session/G2/hash thật trong app, **SQL pool fixture**, không SQL thật |
| SQL nghiệp vụ | **0 bài chạy** | Chưa chỉ định DB test và chưa duyệt hợp đồng; không nghiệm thu |

Ảnh và báo cáo: `screenshots/verification/browser-checks.json`, `auth-browser-checks.json`, các ảnh login/API; `screenshots/ui-checks.json`. Đã xem trực tiếp ảnh finance 1366 và admin 390: thông báo auth chưa cấu hình rõ, không dữ liệu khách/KPI giả, không tràn ngang. Không suy ra giao diện có dữ liệu SQL đã đạt từ ảnh rỗng.

Các lần chạy trung gian trượt: backend cũ 49/57 trước sửa; importer fixture 9/10 trước sửa; test audit fixture thiếu bộ lọc hợp lệ nên 400, đã bổ sung fromUtc/toUtc/timeZone rồi kiểm đúng quyền 403/503. Đây không phải phát hiện cho phép người không có quyền đọc audit. Kết quả cuối không cộng lặp các lần rerun.

## Bảng nghiệp vụ yêu cầu

| Nghiệp vụ | Frontend → API | API → SQL | Kịch bản đã chạy | Kết quả | Lỗi đã sửa | Vấn đề còn lại |
| --- | --- | --- | --- | --- | --- | --- |
| Đặt trước tháng, lịch/trùng phòng | Legacy demo; client G5 chưa nối | Chặn B1/B2/B4 | Demo TC03–05/15; unit half-open/overlap/batch cap, snapshot từng đêm | Đạt phạm vi demo/unit | Test fixture/G12 hook | Chưa chạy hai nhân viên tranh cùng phòng trên SQL, chưa kết luận khóa quỹ đúng |
| Đoàn/nhận từng phòng/master | Demo, chưa màn API lễ tân | Chặn B/C/F | Demo cọc chia nguyên/công nợ master; mô hình debt và transfer balances | Đạt demo/synthetic ledger | Không giả mở ghi | Atomic group/check-in/out/master trên SQL chưa chạy |
| Chặn check-in phòng không sẵn sàng | Legacy demo; API compiler | Chặn C/O3 | Unit DIRTY/CLEANING/INSPECTING/OCCUPIED/INACTIVE/MAINTENANCE, demo bảo trì | Đạt từ chối code/demo | Không hạ yêu cầu sạch | Block theo khoảng/transaction SQL và state race còn thiếu môi trường |
| Chuyển/gia hạn/trả sớm | API client chưa nối màn | Chặn C2/C4/C5 | Unit shorten snapshot, số đêm/giá trước-sau; validation/timezone | Đạt phần đã chạy | Không tạo công thức giá thứ hai | Chưa E2E chuyển/gia hạn vướng lịch/segments dưới khóa SQL |
| Dịch vụ/minibar | API pages thực thi; thiếu auth hiện lỗi | Chặn S1–S4 | Empty zero audit, price injection, exact rounding, no fallback/retry; demo minibar checkout | Đạt validation/UI/fixture | Form/API giữ unknown không gửi mới | Source-line unique/credit linked/cancel atomic SQL chưa chạy |
| Cọc/thu/hoàn/checkout/ca | API pages đã gọi backend; mặc định khóa | Chặn F1–F5 | Demo18 về cọc/idempotency/pending refund/chốt ngày; synthetic balances; timeout sau fixture commit giữ key | Đạt demo/unit/fixture | Chặn checkpoint PENDING giả commit | Không có tiền SQL thực để đối soát; refund/provider/checkout/close shift chưa nghiệm thu |
| Đăng nhập/quyền/actor | **Đã nối và chạy browser→HTTP fixture** | Pool giả, không SQL | 2 users cùng một fixture connection; 4 bộ quyền; CSRF/locked/revoked/expired/logout/timeout | Đạt fixture + middleware thực | Login UI configured; test hook | A1/A2/A3, hash thật, session vận hành và AuditLog SQL chưa xác minh |
| Dashboard/revenue/cash/debt | API admin thực thi, lỗi/thiếu dữ liệu đúng | Chặn R1–R4 | Demo8 model checks; kỳ báo cáo; API no-demo fallback/UI | Đạt model/UI, không phải báo cáo SQL | Không số liệu giả | Chưa đối chiếu giao dịch SQL vừa tạo vì không có môi trường |
| G11/G12 retry/cắt chuyển | API mode giữ khóa; CLI nội bộ | Adapter SQL khóa | Fixture timeout/replay, invalid receipt, manifest/checksum/redaction/quarantine, same-tab concurrent requests | Đạt framework, không kích hoạt | Receipt phải COMMITTED | Registry/receipt/monitor đa instance/readback SQL chưa duyệt |

## Đối chiếu tiền đã chạy — chỉ dữ liệu tổng hợp/demo

- Quote fixture 3 đêm: 1.000.000 + 1.200.000 + 1.500.000 = 3.700.000đ/phòng; 2 phòng = 7.400.000đ. Trả sớm còn 1 đêm = 1.000.000đ; credit **dự kiến** 2.700.000đ, không tạo refund/payment.
- Sổ tổng hợp: cọc nhận 2.000.000 − apply 1.400.000 − refund 600.000 = 0; folio charge 1.400.000 − deposit apply 1.400.000 = 0.
- Chuyển công nợ tổng hợp 1.400.000 từ room sang master: room balance 0, master 1.400.000; không tạo thu mới. Không suy rằng đó là số dư SQL thật.
- Demo TC01/02/09: cọc đoàn 1.000.000 chia 2/3 phòng bảo toàn từng đồng, nhận phòng không thu lần hai. TC10/11 giữ đúng nghĩa vụ hoàn pending; TC12–14 lưu/chống chốt ngày lặp.
- Fixture timeout sau commit: callback import chạy đúng 1 lần sau retry; coordinator send đúng 1 lần dù thử key cũ/key mới khi unknown. **Chưa chứng minh SQL exactly-once hoặc khả năng phục hồi tiền trên DB thật.**

## Lệnh đã chạy

```powershell
# backend/ — cài theo lockfile từ cache; lần đầu lỗi quyền, lần sau thành công
npm.cmd ci --ignore-scripts --no-audit --no-fund --offline
npm.cmd test
npm.cmd run test:browser
npm.cmd run test:browser:auth
node --env-file=.env.example src/server.js

# root — static server chỉ cho hồ sơ kiểm thử cô lập
python -m http.server 8080 --bind 127.0.0.1
node --test tests/view-data.test.js
python run_suite.py
python run_ui_checks.py
```

Các bài mới đã chạy riêng trước khi chạy toàn bộ: `node --test tests/write-coordinator.test.js tests/migration.test.js tests/domain.test.js` và `tests/cutover-boundaries.test.js` trong backend. Browser CLI cần quyền chạy Edge headless trên Windows; không vô hiệu hóa sandbox trình duyệt/không dùng profile thật. SQL chỉ truy vấn metadata master bằng `sqlcmd -S 'lpc:.\SQLEXPRESS' -E -d master ... SELECT ... FROM sys.databases`; không chạy script SQL nghiệp vụ, seed, install, DML hay quyền. Lần kết nối sandbox qua `-S '.\SQLEXPRESS'` lỗi TLS/security token, không dùng lỗi đó để suy ra SQL đã khỏe; metadata đọc được khi chạy Windows token phù hợp, không đồng nghĩa app có pool SQL.

Đã chạy thêm `node tools/migration/cli.mjs --help`, `node tools/cutover/cli.mjs --help` và `git diff --check` (không lỗi whitespace, chỉ cảnh báo LF/CRLF ở file có sẵn). Backend test log cuối lưu ở `screenshots/verification/backend-tests.log`. Đã dừng hai server tạm 127.0.0.1:8080/3000 sau kiểm tra bằng session đã tạo; exit do Ctrl+C không tính là bài kiểm thử trượt. Các browser fixture tự đóng profile riêng.

## File đã sửa trong lượt rà soát này

- Code vận hành: `backend/src/app.js` (test-only route hook); `js/pages/login.js`, `login.html` (kết nối G2 có điều kiện, xác minh phiên, thông báo lỗi); `tools/migration/lib/import-engine.mjs` (không nhận PENDING làm COMMITTED).
- Test cập nhật: `backend/tests/api.test.js`, `login.test.js`, `helpers.js`, `fixtures/auth-fixture.js`, `browser/login.browser.js`; `backend/package.json` thêm script browser auth, không thêm dependency.
- Test mới: `backend/tests/domain.test.js`, `write-coordinator.test.js`, `migration.test.js`, `cutover-boundaries.test.js`, `browser/auth.browser.js`, `browser/cdp.mjs`.
- Tài liệu: README.md, báo cáo này, `docs/sql-verification-prerequisites.md`; các ảnh/báo cáo kiểm thử riêng dưới screenshots. Không thay mã SQL/config vận hành hoặc quyền.

## Phân loại cuối

- **Đã chạy và đúng trên SQL kiểm thử:** không có chức năng nào; chưa có DB được phép dùng.
- **Đã sửa code nhưng chưa xác minh SQL:** login wiring, G11 receipt guard, các adapter/contracts và nghiệp vụ G3–G12 chỉ được kiểm trong phạm vi unit/fixture/UI.
- **Còn mock/localStorage:** 3 màn demo chính và các pool/session fixtures kiểm thử. API pages không tự chuyển về demo khi lỗi.
- **Bị chặn bởi cấu hình/hợp đồng:** mọi luồng SQL thật, importer, durable monitor/receipt và cutover. Xem [danh sách hợp đồng và thông tin cần cung cấp](sql-verification-prerequisites.md).

Không sẵn sàng vận hành và không đánh dấu nghiệm thu các luồng tranh phòng/trạng thái/phí/công nợ/tiền khi chưa chạy, đối chiếu đạt trên SQL test được chỉ định.
