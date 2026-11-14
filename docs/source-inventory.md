# Kiểm kê nguồn — G0, 08/11/2026

## Phạm vi và căn cứ

- Áp dụng G0–G1 theo kế hoạch trong hội thoại và yêu cầu triển khai mới nhất. Không tìm thấy tệp kế hoạch đính kèm riêng trong repository.
- Đã tìm `AGENTS.md` trong repository và các thư mục cha: không tìm thấy. Không có quy tắc cục bộ bổ sung để áp dụng.
- Checkout có nhiều thay đổi giao diện/database chưa commit từ trước; giữ nguyên chúng. Trước G1 chưa có `backend/`, `package.json`, package-lock hoặc cấu hình backend.
- Có Node.js 26.13.0, npm 11.20.0 và Microsoft Edge trên máy lúc kiểm kê. Không có backend PostgreSQL mẫu trong checkout.

## Frontend và nguồn dữ liệu đã xác minh bằng mã nguồn

| Phần | Tệp/nguồn | Hiện trạng |
| --- | --- | --- |
| Quản trị | `index.html`, `js/app.js` | HTML và controller JavaScript thuần |
| Lễ tân | `reception.html`, `js/reception.js` | Controller nghiệp vụ riêng |
| Buồng phòng | `housekeeping.html`, `js/housekeeping.js` | Controller riêng, có vai trò mô phỏng |
| Layout | `css/style.css`, `css/pms.css`, `js/pms-ui.js` | Layout dùng chung, responsive |
| Tabler | `css/tabler.min.css`, `js/tabler.min.js` | Tài nguyên cục bộ; CSS ghi Tabler 1.7.3 |
| Thống kê/lịch | `js/pms-data.js` | Mô hình đọc dữ liệu từ store |
| Dữ liệu demo | `js/data.js` / `INITIAL_DATA` | Header xác định rõ dữ liệu minh họa |
| Nghiệp vụ | `js/store.js` / `SongLamStore` | localStorage và BroadcastChannel; chưa có HTTP API |

Key nghiệp vụ trong mã: **`songlam_hotel_pms_data_v2`**. Kênh đồng bộ: **`songlam_hotel_sync_channel`**. Origin khác nhau, ví dụ localhost/127.0.0.1/cổng khác nhau, không tự dùng chung dữ liệu.

## Các điểm ghi localStorage

Trong `js/store.js` tại thời điểm kiểm kê:

- `_reloadFromStorage()` khoảng dòng 254: ghi INITIAL_DATA khi chưa có key; có nhánh ghi lại khi JSON phân tích được nhưng không phải đối tượng hợp lệ. Hàm được gọi khi nạp script khoảng dòng 346.
- `_commitData()` khoảng dòng 297: ghi toàn bộ dữ liệu nghiệp vụ và thời điểm sửa; được các hàm nghiệp vụ gọi.
- `resetToInitialData()`/đường khôi phục dữ liệu khoảng dòng 490: ghi lại dữ liệu mẫu rồi commit.
- `reloadLatest()` và các luồng đồng bộ có thể dẫn về `_reloadFromStorage()`; không dùng chúng như công cụ xuất dữ liệu thật.
- Bộ kiểm thử frontend có ghi fixture, nhưng bộ chạy Python dùng browser profile tạm. Chỉ chạy trong profile kiểm thử, không dùng phiên người dùng.

G0–G1 không gọi SongLamStore để xuất dữ liệu, không đọc/ghi key này từ HTTP client hoặc trang login mới và không đổi controller demo.

## Luồng nghiệp vụ hiện có

| Luồng | Hàm chính trong `js/store.js` | Cách lưu |
| --- | --- | --- |
| Đặt phòng | `createBooking`, `createGroupBooking`, gán phòng/hủy | Cập nhật bộ nhớ → `_commitData` → localStorage |
| Nhận phòng | `checkInDirect`, `adjustBookingForEarlyArrival`, `checkInBookingRoom` | Tạo lượt ở, phân bổ cọc/phòng rồi commit |
| Chuyển/gia hạn/trả sớm | `transferRoom`, `extendStay`, `shortenStay` | Cập nhật phòng, khoảng ở và giá rồi commit |
| Trả phòng | `calculateStayFolio`, `settleAndCheckout` | Kiểm minibar, thu/hoàn theo demo, snapshot và trạng thái phòng |
| Thu tiền | `recordPayment`, thanh toán dịch vụ | Có kiểm tra idempotency trong store, sau đó commit |
| Hoàn tiền | `requestRefund`, `approveRefund`, `completeRefund` | Luồng duyệt/chi mô phỏng; chưa phải backend xác thực |
| Cổng thanh toán | `simulateGatewayWebhook` | Mô phỏng, không dùng làm xác nhận ngân hàng thật |

Không chuyển các luồng trên sang API trong G1.

## Database: điều đã và chưa xác minh trong lượt G0–G1

- Database đích `SongLamPms_Design` và SQL Server là quyết định của người dùng.
- Đã đọc các script SQL trong `database/sqlserver/`. Chúng mô tả cổng đọc/ghi theo SQL principal; các tên thủ tục là bằng chứng từ tệp nguồn, không phải xác nhận đang triển khai trên server.
- Các số lượng bảng/quy tắc và kết quả SQL trong README/VALIDATION là ghi chép lịch sử. **Không truy vấn SQL Server trong lượt G0–G1 này**, không dùng các con số đó làm điều kiện bật API.
- Kết nối Node.js–SQL, tài khoản dịch vụ, chứng chỉ/cổng hiện tại và hợp đồng xác thực/ủy quyền được phê duyệt: **chưa xác minh/chưa có**.
- G1 không cài driver SQL, không mở connection SQL, không chạy migration/seed/import hoặc bộ kiểm thử SQL tạo/xóa database.

## Nguồn dữ liệu thật: chưa xác định

Chưa truy cập browser profile/origin đang chứa dữ liệu thật. Chưa biết số bản ghi, dữ liệu trộn demo/thật hoặc snapshot nguồn chính. Browser kiểm thử tạm không phải nguồn dữ liệu thật. Cần xác nhận profile, origin, bản sao JSON gốc và quy tắc đối chiếu ở giai đoạn migration được phê duyệt riêng.

## Kiểm thử sẵn có được phép chạy cho hồi quy G1

- `node tests/view-data.test.js`: mô hình đọc, không cần SQL.
- `python run_suite.py`: 18 ca nghiệp vụ trình duyệt trong profile tạm.
- `python run_ui_checks.py`: kiểm tra UI trong profile tạm; ghi báo cáo kiểm thử vào `screenshots/ui-checks.json`.
- Không chạy `tests/sqlserver/*.py`: các bộ này có thể tạo/xóa database hoặc ghi fixture.

Kết quả thực chạy G1 được ghi riêng trong `docs/g0-g1-validation.md` sau khi hoàn tất.

## Bổ sung G7 — 08/11/2026

Đã đối chiếu controller buồng phòng và source SQL HousekeepingTask/MaintenanceTicket/RoomAllocation/LostFound với G0–G6. Chưa xác minh live SQL và chưa có bằng chứng phê duyệt hợp đồng mới; không truy cập/xuất/chuẩn hóa localStorage hoặc chạy test trong lượt này.

`housekeeping.html` tiếp tục demo qua SongLamStore. `housekeeping-api.html` là đường API riêng, không nạp store/data/pms-ui. `js/housekeeping.js` thoát trước logic demo khi data-housekeeping-mode=api; controller `js/pages/housekeeping-api.js` chỉ gọi HTTP client qua `js/api/operations-api.js`. Không có luồng ghi song song localStorage/SQL. Các luồng đặt phòng/nhận trả/thu tiền demo giữ nguyên.

Backend G7 dùng module operations dùng chung và routes/services housekeeping/maintenance/lost-found. Các gateway G3/G5/G6 thêm chốt ROOM_ELIGIBILITY_V1 để không bỏ qua bảo trì/hold sau sửa. Chi tiết API, thiếu schema/event/custody/inspection và trạng thái chưa nghiệm thu: [bàn giao G7](g7-operations.md), [đề xuất SQL G7](g7-sql-proposals.md).

## Bổ sung G8 — 09/11/2026

Đã đối chiếu ServiceOrder/Line, MinibarAudit/Line, FolioEntry và validation từ SQL source; chưa truy vấn/live xác nhận. Actor/quyền G2 giữ nguyên. `services-api.html` gọi services/minibar API qua các client mới, không nạp data/store/pms-ui; link từ lễ tân/buồng phòng dẫn đến form API riêng. Không chuyển/ghi kép các thao tác demo addServiceToStay/recordMinibarAudit hoặc đụng checkout G9. Mã và các điểm thiếu SQL/folio được ghi tại [G8](g8-services-minibar.md), [SQL proposal G8](g8-sql-proposals.md). Chưa viết/chạy kiểm thử trong lượt G8.

## Bổ sung G9 — 09/11/2026

Đã đối chiếu Folio/Entry, DepositAccount/Movement, Payment/ApiRequest/RefundRequest, StaySettlement, CashierShift/BusinessDay và Invoice trong 001/002/004/005/006. Đây là đọc source, chưa truy vấn/deploy SQL thật; không thấy phê duyệt RPC/policy G9. Thêm `modules/finance` dùng chung với các module tài chính/checkout chuyên biệt, không viết lại G4–G8.

`finance-api.html` chỉ nạp HTTP/finance client/controller và CSS local, không data/store/pms-ui. Liên kết từ lễ tân và trang dịch vụ sang form tài chính riêng; không lấy số dư demo hoặc ghi kép. Luồng Store demo thu/cọc/hoàn/checkout hiện có giữ nguyên. Chi tiết file/API, số dư, chốt ca/ngày và blocker: [G9](g9-finance.md), [proposal SQL G9](g9-sql-proposals.md). Không viết/chạy kiểm thử hoặc thay dữ liệu trong G9.

## Bổ sung G10 — 09/11/2026

Đã đọc G2/G8/G9, views cash-flow/settlement/folio và read rules tài khoản/role/audit/exception. Không truy vấn SQL thật hoặc suy rằng các hợp đồng đề xuất đã được duyệt. Thêm code reports và quản trị chỉ đọc; không thay role, cấp quyền hoặc sửa dữ liệu.

`admin-api.html` chỉ nạp HTTP/API clients, pms-data ở API mode, controller quản trị và app.js ở API mode. Guard thoát trước state demo/SongLamStore; không nạp data.js/store.js/pms-ui.js, không localStorage fallback. index/login thêm link API; index vẫn demo riêng có nhãn rõ. Middleware rejection ghi metadata an toàn vào logger, không SQL; không coi log HTTP failure là Payment FAILED. Metric definitions/provenance và phần thiếu: [G10](g10-management.md), [SQL proposal](g10-sql-proposals.md). Chưa viết/chạy kiểm thử G10.
