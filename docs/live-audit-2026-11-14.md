# Rà soát hệ thống trên SQL kiểm thử — 14/11/2026

## Phạm vi và bằng chứng

Target đã xác minh bằng truy vấn chỉ đọc: `.\SQLEXPRESS / SongLamPms_Design`, database GUID `C4DD399E-5661-4741-A424-5ABFEEFBC1AC`, marker `test`. Backend chạy dưới service principal riêng. Đây là hệ thống **thử nghiệm**, chưa phải cắt chuyển vận hành. Không thực hiện ghi nghiệp vụ hoặc thay đổi SQL trong lượt rà soát này; login/logout có ghi phiên G2.

| Luồng | Kết quả thực tế | Giới hạn |
| --- | --- | --- |
| Đăng nhập, `/me`, quyền | 5 vai trò login 200, `/me` 200; HTTP kiểm tra tiếp 5 vai trò đạt | Tài khoản thử, không xác nhận vận hành thật |
| Danh mục, phòng, giá | SQL có 11 hạng, 420 phòng, 2 gói, 20 quy tắc, 15 dịch vụ; HTTP đọc 11 hạng, trang 50 phòng và 2 gói đạt | Năm phòng bảo trì từ Excel còn cách ly |
| Báo giá, quỹ, lịch, đơn | HTTP báo giá dự kiến 200; availability/timeline 200; 7 đơn trên SQL, 5 CONFIRMED và 2 CANCELLED | Không thu tiền, không ghi nhận doanh thu khi đặt |
| Đổi/hủy 015 | SQL readback booking 9: 2 phần phòng hủy, 1 allocation hủy, 3 receipt khớp 3 dòng audit actor, tiền 0 | Chỉ cùng hạng và hủy phần chưa nhận khi không có tiền/stay/folio; không diễn tập ghi mới lượt này |
| Lưu trú G6 | HTTP đọc list/arrivals/readiness đạt; Stay=0, Folio=0 | Check-in ghi khóa vì WorkingDate=2026-10-11 OPEN, ngày khách sạn=2026-11-14; không có kiểm thử commit nhận phòng |
| Buồng phòng/bảo trì G7 | HTTP trả `OPERATIONS_CONTRACT_NOT_APPROVED` | Không có RPC/quyền vận hành được nạp; hàng đợi và chuyển trạng thái chưa chạy SQL |
| Dịch vụ/minibar G8 | Gateway chưa được nạp; ServiceOrder/MinibarAudit/FolioEntry=0 | Không có thử phí/đảo phí trên SQL |
| Tài chính/checkout G9 | HTTP `/payments` trả `FINANCE_CONTRACT_NOT_APPROVED`; Payment/Deposit/Folio/Shift/Refund/Settlement=0 | Chưa thử cọc, thu/hoàn, checkout, đối soát tiền |
| Báo cáo/quản trị G10 | HTTP `/users` trả `MANAGEMENT_READ_CONTRACT_PENDING`; management gateway null | KPI/tài khoản/audit qua UI chưa có SQL RPC đọc; không dùng số liệu demo làm thật |

SQL metadata: không thấy FK/check constraint mất tin cậy hoặc bị tắt, không thấy trigger bị tắt. `Room`: 405 sạch, 6 đang dọn, 9 bẩn, cả 420 active. Đây là các cột nguồn; hiện diện và khai thác trong API còn được suy ra theo Stay/allocation/tình trạng phòng. `BookingRoom`: 6 CONFIRMED, 4 CANCELLED. Số bản ghi là ảnh chụp tại thời điểm kiểm tra, không phải giao dịch mới.

## Lỗi code đã sửa

1. Trang lễ tân SQL từng dẫn tới `reception.html` dùng localStorage; đã bỏ liên kết này. Khi backend ở chế độ quản lý không phải demo, các URL `reception.html`, `index.html`, `housekeeping.html` nay chuyển tới trang API tương ứng.
2. Bộ lọc lễ tân từng mặc định 11/10/2026 theo WorkingDate đã cũ. Nay mặc định ngày hiện tại trong múi giờ khách sạn và ghi rõ cảnh báo lệch ngày; **không sửa WorkingDate SQL**.

## Kiểm tra đã chạy

- `npm.cmd test` trong `backend`: **181/181 fixture pass**; không tương đương 181 giao dịch SQL.
- `node tools/verify/repository-audit.mjs`: **256 JS, 12 HTML, 15 JSON** parse/kiểm tra được.
- `node tools/sql/audit-live-readonly.mjs`: SQL metadata và số bản ghi trên đúng target, chỉ đọc.
- `node tools/sql/verify-checkin-016.mjs`: 8 định nghĩa, 5 GRANT, 2 DENY khớp; ngày chưa khớp.
- `node tools/sql/reconcile-booking.mjs --read-only`: **76 kiểm tra SQL pass**, tiền nhận/cọc đều 0.
- `node tools/sql/reconcile-015-race.mjs`: receipt/audit/hủy 015 trên SQL pass.
- `node tools/verify/login-five-real.mjs`: login + `/me` 5 vai trò 200.
- `node tools/verify/live-sql-scope-audit.mjs`: **32 HTTP kiểm tra** qua backend/SQL, gồm các module thiếu contract trả 503 đúng chủ đích.
- `node tools/verify/checkin-016-read.mjs`: **9 HTTP** đọc/chặn G6 pass.
- `node tools/verify/booking-sql-ui-readback.mjs --approved=USER-20261112-REAL-PRICING-CUSTOMER-BOOKING`: **18 kiểm tra browser** sau sửa, gồm điều hướng trang cũ và ngày mặc định; 1366/1920/390.

## Thứ tự cần mở rộng; chưa áp dụng SQL

1. Gói bảo trì ngày nghiệp vụ test: kiểm tra toàn bộ tiền/ca/lưu trú, backup mới + VERIFYONLY; nếu mọi số liệu bằng 0, đóng ngày test cũ bằng snapshot tính từ SQL và mở ngày hiện tại nguyên tử, có audit/receipt. Cần trình SQL cụ thể và duyệt riêng. Không tự cập nhật WorkingDate hay bịa ngày trung gian.
2. Sau ngày khớp, duyệt phát hành riêng `stays.checkIn` đã có RPC 016, tạo booking thử đúng ngày, diễn tập check-in đơn/đoàn, phòng bẩn/block/trùng, retry/concurrency/timeout, đối chiếu Stay, segment, ROOM folio, audit/receipt và quỹ phòng. Chưa bật chỉ vì RPC đã tồn tại.
3. G7 cần hợp đồng SQL tasks, nghiệm thu sạch có quyền tách biệt, maintenance và timed block; phải đồng bộ availability/check-in.
4. G8 cần command nguyên tử ServiceOrder/MinibarAudit + FolioEntry unique source line + credit tham chiếu; kiểm minibar 0đ hợp lệ.
5. G9 cần ledger cọc/thu/hoàn/master folio, maker-checker refund, checkout và chốt ca/ngày nguyên tử. Chính sách hủy có cọc/trả sớm do quản lý quyết định từng trường hợp; không tự chi hoàn.
6. G10 cần hợp đồng đọc KPI đối soát, quyền tài khoản/audit; G11/G12 cần diễn tập nhập/đối chiếu đạt trước khi cắt chuyển thật.

Không có bằng chứng chạy xuyên suốt G6–G10 trên SQL; không đánh dấu nghiệm thu hoặc sẵn sàng vận hành.
