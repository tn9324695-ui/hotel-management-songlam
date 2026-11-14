# Backend SongLam PMS — rà soát phần còn phải hoàn thiện

## Kết luận theo đường chạy thực tế

Backend **chưa hoàn thành để vận hành hoặc nối frontend ghi SQL thật**. Có HTTP app, auth/session adapters, services, validation, DTO và gateway cho G0–G12. Tuy nhiên `backend/src/server.js` hiện chỉ gọi `createApp({config,logger})`; không khởi tạo driver/pool/auth runtime/gateway/receipt/monitoring đã cấu hình. `backend/package.json` chỉ có Express, chưa có driver SQL. `auth-bootstrap.js` là phần ghép nối chuẩn bị, không được entrypoint nạp. Đăng nhập và các nghiệp vụ qua SQL vẫn khóa.

**Cập nhật D1 12/11/2026:** SongLamPms_Design trên `.\SQLEXPRESS` được phép ghi kiểm thử; 000 đã chạy backup/VERIFYONLY thành công, 004 đã duyệt nhưng chưa thực thi vì thiếu bằng chứng ngừng ghi. 001/002/002b/003/005 chưa duyệt/chạy. Driver/runtime đã bổ sung sau lượt audit bên dưới; xem [trạng thái kết nối](sql-connection-status.md). Kiểm tra chỉ đọc mới xác nhận AppUser=0; không seed hoặc mở pool bằng metadata account. Các nhận định entrypoint/dependency còn lại trong tài liệu là snapshot lượt audit cũ.

## Đối chiếu backend → SQL → dữ liệu

Tên bảng dưới đây đối chiếu từ schema trong repository, không phải chứng cứ mọi cột/trigger/procedure tương ứng đã deploy trên SQL. Tên gateway là file trong `backend/src/adapters/sql/`; không mặc nhiên là tên stored procedure đã tồn tại.

| Nhóm/API | Code ứng dụng hiện có | Gateway/dữ liệu dự kiến | Việc còn thiếu trước frontend thật |
| --- | --- | --- | --- |
| Health/readiness | app.js, status/readiness.js | Không có SQL probe mặc định | Nối probe runtime thật, tách trạng thái từng phụ thuộc; không bật ready bằng biến môi trường |
| `/auth/login,logout,me,permissions` | auth/runtime.js, sessions.js, password-verifier.js | approved-contracts.js, session-store.js → AppUser/UserRole/AppRole/RolePermission/Permission, WebSession đề xuất | D1 backup/marker; D2 RPC/principal; D3 kho phiên; driver/TLS/bootstrap; nhân viên thử và hash format duyệt riêng |
| `/room-types`, `/rooms`, `/services`, `/customers`, `/hotel-settings`, `/business-days` | catalog/routes/service/resources/DTO | catalog-gateway.js → RoomType/Room/vRoomStatus/Service/Customer/HotelSettings/BusinessDay | Hợp đồng đọc theo actor, lọc/phân trang/projection; hiện chỉ GET, chưa CRUD danh mục/khách |
| `/rate-plans`, `/rate-rules`, `/policy-versions`, `/pricing/*` | catalog và pricing engine/service/policy | pricing-gateway.js, stay-pricing-gateway.js → RatePlan/RateRule/PolicyVersion và ngữ cảnh lịch | Hợp đồng P1–P5 trong G4; holiday/calendar đầy đủ, chọn phiên bản policy, quyền đọc; chưa có API quản trị bảng giá được duyệt |
| `/bookings/*` | bookings/service/validation/batch/intent/DTO | bookings-gateway.js → Booking/BookingRoom/BookingGuest/BookingNightRate/RoomAllocation | B1–B5: lịch/quỹ toàn khoảng, transaction đoàn, room lock, version, snapshot, hủy/cọc, receipt/intent; không dùng JavaScript để thay khóa SQL |
| `/stays/*` | stays/service/commands/validation/DTO, tái dùng pricing | stays-gateway.js + stay-pricing-gateway.js → Stay/StayGuest/StayRoomSegment và booking/folio | C1–C5: nhận phần chưa nhận, segment chuyển phòng, eligibility, đổi ngày/giá nguyên tử, kiểm xung đột lịch |
| `/housekeeping/*`, `/maintenance/*`, `/lost-found/*` | các service/route, operations/model/DTO | operations-gateway.js → HousekeepingTask/MaintenanceTicket/LostFound/RoomAllocation | O1–O4: lifecycle/event/custody/claim version, quyền nghiệm thu, block ảnh hưởng G5–G6; schema nguồn chưa đủ toàn bộ event/custody đề xuất |
| `/service-orders/*`, `/minibar-audits/*` | services/minibar validation/amounts/DTO | consumption-gateway.js → ServiceOrder/Line, MinibarAudit/Line, FolioEntry | S1–S4: đúng Stay/segment, giá snapshot, liên kết source-line, charge/credit + status cùng transaction, unique/idempotency, biên bản 0đ |
| `/folios/*`, `/deposit-accounts/*` | folios và finance/service/receipt/money | finance-gateway.js → Folio/FolioEntry/DepositAccount/DepositMovement | F1–F2: nguồn và phân bổ tiền, ledger append-only, chuyển master có đủ cặp bút toán, khóa nguồn không chuyển quá số tiền |
| `/payments/*`, `/refunds/*`, `/checkouts/*` | payments/refunds/checkout, finance/receipt | finance-gateway.js → Payment/RefundRequest/StaySettlement, các ledger và trạng thái Stay/Room | F3–F4: receipt bền vững, chính sách duyệt hoàn, timeout sau commit, settlement/minibar/master/room state nguyên tử; ngân hàng thật chưa mở |
| `/invoices/*`, `/cashier/shifts/*`, `/finance/business-days/*` | invoices/cashier/business-days, finance | finance-gateway.js → Invoice/Line/CashierShift/BusinessDay | F5: business clock, mã phiếu, chốt ca/ngày và điều chỉnh sau chốt; e-invoice chưa tích hợp |
| `/reports/*`, `/users/*`, `/roles/*`, `/permissions/*`, `/audit/*`, `/exceptions/*` | management/reports định nghĩa metric và DTO, các route đọc | management-gateway.js → bảng quyền/AuditLog/ExceptionCase, nguồn ledger/settlement | R1–R4 của G10: read projection có quyền, snapshot/aggregate đối soát, durable exception journal; chưa có API tạo/sửa tài khoản/role được duyệt |
| Import nội bộ G11 | tools/migration: export/analyze/map/quarantine/reconcile và import engine | tools/migration/sql-adapter.mjs → MigrationMap và graph lịch sử | Adapter hiện luôn throw SQL_IMPORT_LOCKED_NO_APPROVED_CONTRACT_OR_REHEARSAL_ADAPTER; cần import RPC/checkpoint/receipt/readback được duyệt, không API import công khai |
| Receipt/cutover G12 | cutover/runtime/routes, release gates | receiptGateway, cutoverDependencies chỉ DI; ApiRequest/monitoring dự kiến | Thiếu adapter receipt thật theo actor, runtime probes/durable monitoring/post-switch reconciliation; không cắt chuyển để vượt các thiếu sót trên |

## Danh sách công việc theo thứ tự phụ thuộc

| Ưu tiên | Công việc cụ thể | Điều kiện/loại thay đổi | Tiêu chí kết thúc |
| --- | --- | --- | --- |
| P0.1 | Chạy backup 000, VERIFYONLY, giữ receipt thật; sau đó marker 004 | Duyệt riêng từng thao tác như D1, người phụ trách/cửa sổ ghi; không cần xác nhận lại tên DB | Backup kiểm chứng, marker đúng, không thay dữ liệu nghiệp vụ |
| P0.2 | Triển khai đúng 001/003 và service principal riêng | D2 + D2-P; Windows token đọc metadata không làm pool | Ba RPC hoạt động dưới account hạn quyền, gọi ngoài quyền bị từ chối |
| P0.3 | Chọn/cài driver SQL Server phù hợp Windows Authentication; cấu hình TLS, timeout, pool; nối vào entrypoint | Code/dependency/config; cần xác nhận runner/service identity, không mật khẩu chat; không đổi SQL auth mode | Driver thật kết nối đúng target, tắt/timeout/đóng pool an toàn, không log secrets |
| P0.4 | Triển khai 005/S0/membership, cấp epoch ngoài DB; phê duyệt dữ liệu nhân viên thử/hash | D3, D3-P và dữ liệu thử riêng; không tự tạo admin/role | Login sai/khóa không lộ account, phiên bền vững, logout/expiry/revoke/CSRF đạt trên SQL |
| P0.5 | Chốt và triển khai actor/domain command/receipt, module signing | D4-H/R/P/C theo phạm vi riêng; 002 helper không thay domain contract | Audit đúng hai nhân viên cùng pool; lỗi rollback cùng nghiệp vụ/receipt; replay không ghi hai lần |
| P1.1 | Nối hợp đồng đọc danh mục/khách/room state/business clock | G3 read contract | Dữ liệu SQL đúng, phân trang/PII/quyền, 3 trạng thái phòng riêng |
| P1.2 | Chốt hợp đồng giá/calendar/policy và nối G4 | G4 P1–P5, không tự đặt phụ thu/ngày lễ | Báo giá VND từng đêm/giờ và snapshot đúng; thiếu/xung đột giá bị từ chối |
| P1.3 | Hoàn thiện và triển khai booking atomics B1–B5 | SQL contract mới cần duyệt | Đặt trước tháng, từng đêm, 2 người tranh phòng, đoàn rollback/replay, hủy/cọc đối soát |
| P1.4 | Hoàn thiện stays C1–C5 và room eligibility G7 | SQL contract/state/policy liên quan | Phòng bẩn/block/đã ở bị chặn; segment/extend/shorten đúng, không đếm đôi quỹ đoàn |
| P1.5 | Hoàn thiện buồng phòng/bảo trì/custody O1–O4 | Thiếu schema/lifecycle/quyền nghiệm thu phải duyệt | Hai người không claim cùng việc; dọn xong chờ nghiệm thu; block xung đột bị từ chối |
| P1.6 | Hoàn thiện charge/credit S1–S4 | Folio tối thiểu, nguồn-line unique/receipt | Minibar 0đ hợp lệ; retry không phí trùng; hủy bằng credit có nguồn |
| P1.7 | Hoàn thiện finance/checkout F1–F5 | Chốt policy hoàn, ca/ngày, nguồn tiền và transaction | Thu/hoàn/cọc/master đối soát; timeout sau commit không nhân đôi; checkout toàn bộ hoặc không gì |
| P2.1 | Nối report/admin đọc R1–R4 vào nguồn đã đối soát | Phụ thuộc finance/source graph, quyền đọc hiện hành | Revenue/cash/debt riêng, không KPI demo, không hash/token/audit payload nhạy cảm |
| P2.2 | Xác định cần CRUD phòng/hạng/khách/giá/tài khoản hay chỉ đọc như G3/G10 | Mở rộng API/code và SQL command cần duyệt riêng, không mặc nhiên cấp quyền | Có validation/version/audit/quyền và SQL atomics phù hợp nếu được yêu cầu |
| P2.3 | Cài adapter import và chạy G11 được duyệt | Import RPC/target/backup/lô dữ liệu thật riêng | Không quarantine chưa duyệt, tiền lệch 0 theo booking/stay; retry không thu lại |
| P2.4 | Receipt lookup/runtime probe/durable log, shutdown, vận hành đa instance | Hợp đồng đọc/monitoring; rate limiter hiện theo process, cần phương án đa instance | Không đọc receipt người khác; restart không mất audit/unknown outcome; thống kê tình trạng có bằng chứng |
| P3 | Chỉ sau G11 PASS và duyệt, diễn tập G12/cắt chuyển và frontend thật từng module | Release evidence, không tự bật nguồn ghi | Không ghi kép/fallback; đủ role/UAT/các kích thước giao diện và rollback bảo toàn giao dịch mới |

## Việc có thể làm bằng code và việc không thể tự vượt qua

Có thể tiếp tục code: driver-provider adapter và startup DI theo manifest được cấp rõ; probes/close pool; contract tests/DTO/receipt validation; validation/API client; chuẩn bị frontend loading/error/blocked; các bài kiểm thử concurrency bằng fixture để tìm lỗi ứng dụng. Không dùng các bài này làm chứng cứ unique/locking/transaction của SQL.

Không thể tự hoàn tất bằng JavaScript: quyền EXECUTE, cấp service login/user, tạo session table/RPC, khóa inventory/đoàn/tiền và commit receipt/audit ở tầng SQL, sửa lịch sử dữ liệu hoặc nhập lô. Phải có artifact SQL/policy cụ thể được duyệt và chạy tích hợp. Không mặc nhiên áp dụng lại installer/upgrade cũ hoặc chạy seed để “sửa nhanh”.

## Lỗi code/config sửa trong lượt rà soát này

1. Readiness trước đây báo thiếu SQL_PORT dù loadConfig cho phép null và profile có thể dùng named instance. Bỏ điều kiện thiếu cổng bắt buộc; thêm HTTP regression với `.\SQLEXPRESS`, không cổng. Vẫn trả 503/sqlConnection=not_verified, không giả connected.
2. SQL_SERVER trước đây chỉ trim, có thể nhận cả chuỗi chứa thuộc tính kết nối hoặc xuống dòng. Thêm validation độ dài <=255, cấm semicolon/CR/LF/NUL và chỉ báo tên trường lỗi; giữ named instance hợp lệ. Không đụng .env thật.

File: `backend/src/config/environment.js`, `backend/src/modules/status/readiness.js`, `backend/tests/config.test.js`, `backend/tests/api.test.js`. Lỗi RowVer binary/text đã sửa trong lượt D2–D4 trước, không tính là sửa mới.

## Phạm vi kiểm chứng

- Đã xem entrypoint/config/app registration, các SQL gateway, auth/session composition, pricing/booking/finance validation và receipt, catalog routes, report metric definitions, G11 adapter và G12 gates; đối chiếu schema nguồn/proposal. Đây là rà soát điểm nối và ràng buộc trọng yếu, không tuyên bố chứng minh đúng từng dòng toàn repository.
- `node --check` chạy **113 tệp JS trong backend/src**, không lỗi cú pháp. Không kiểm chứng stored procedure bằng việc này.
- Suite backend trước lượt này **112/112 fixture/mock**. Chạy `npm.cmd test` tại backend sau hai test mới: **114/114 đạt, 0 trượt, 0 skip**. HTTP trong suite chạy thật với Express nội bộ, SQL provider là fixture/mock. Không có test SQL thực, không import/backup/DDL/DML/GRANT, không thử dữ liệu khách thật.
- Chưa chạy SQL concurrency/timeout sau commit/đối soát tiền; chưa có bằng chứng financial ledger/booking/stay qua SQL. Không đánh dấu các luồng này nghiệm thu hoặc sẵn sàng frontend vận hành.

Gói duyệt: [D1](d1-approval-package.md), [D2](d2-approval-package.md), [D3](d3-approval-package.md), [D4](d4-approval-package.md). Phạm vi thiếu theo từng G nằm trong các `g3-sql-proposals.md`, `g4-pricing.md`, `g5`–`g12` proposals; không coi một proposal là hợp đồng đã được duyệt.
