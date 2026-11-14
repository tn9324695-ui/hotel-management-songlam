# G11 — diễn tập chuyển dữ liệu: hiện trạng và ánh xạ

Đã viết công cụ và tài liệu, **chưa thực thi exporter/CLI, chưa viết/chạy kiểm thử, chưa nhập hoặc đối chiếu dữ liệu thật**. Không truy cập browser/SQL; không thay schema, dữ liệu, quyền hay API vận hành. Không thực hiện G12. Các script SQL đọc trên đĩa không chứng minh triển khai hiện tại trên server.

Đã kiểm tra cú pháp bằng `node --check` trên 7 tệp JS/MJS G11; lệnh này chỉ parse, không thực thi module. Đây không phải kiểm thử importer, trình duyệt hoặc SQL và không phải nghiệm thu diễn tập.

## Ánh xạ đã có trong công cụ

Inventory bao phủ tất cả root collection trong snapshot và các dòng nested đã xác minh: guest/companions/servicesUsed/surcharges/nightlyRates/transferHistory/extensionHistory/folioSnapshot của stay; itemsUsed của minibar; nightlyRates/assignedRooms/checkedInRooms của booking. Các cấu trúc khác vẫn được bảo toàn trong nguồn, root chưa biết và trường bị loại có lý do cách ly; chưa có phép nhập ngầm cho dữ liệu chưa biết.

| Nguồn | Đích trong script SQL repository | Khả năng / chỗ cần xử lý |
| --- | --- | --- |
| roomClasses | RoomType; giá cần RatePlan/RateRule/PolicyVersion riêng | Nháp field code/name/area/occupancy/bed/amenities; base/weekend/holidayPrice không tự tạo chính sách lịch sử |
| rooms | Room | number/floor/classCode/cleanStatus; hiện diện lấy Stay/segments, khai thác cần lịch block/maintenance; không gộp ba trạng thái vào Room |
| customers, stay.guest/companions | Customer/Organization, CustomerIdentity, StayGuest | Không hợp nhất theo tên/phone; ví dụ KH-001 trong customers và stay có người khác nhau. Giấy tờ cần loại/quốc gia và hợp đồng mã hóa/HMAC/key; group không biến thành cá nhân |
| bookings | Booking/Room/Guest/NightRate và RoomAllocation | Cần khách, line identities từng phòng, chính sách giữ phòng và snapshot từng đêm; nhiều bản ghi chỉ có totalEstimated/roomQuantity |
| stays | Stay/StayRoomSegment/StayGuest, Folio/FolioEntry | WALKIN booking có thể không có nguồn booking; cần hợp đồng lịch sử riêng, không tự bịa booking; segment/phút chuyển phòng, policy, ledger có thể thiếu |
| services, stays.servicesUsed | Service, ServiceOrder/Line, FolioEntry | Giữ quantity/unitPrice/amount/orderTime, không lấy giá hiện tại; nhiều dòng không ID/order/folio. Chưa đủ tạo ServiceOrder từ phỏng đoán |
| minibarAudits.itemsUsed | MinibarAudit/Line, FolioEntry | Xác minh stay/segment/scope/người kiểm; 0đ hợp lệ. Dòng phản chiếu servicesUsed phải liên kết lại, không thành phí thứ hai |
| transactions | Payment, DepositAccount/Movement, FolioEntry | status success/gatewayVerified từ demo chưa là chứng cứ; cần nguồn thu/hoàn, actor, ca/ngày và line binding; internal allocation không phải thu mới |
| refundRequests | RefundRequest và liên kết Payment/Movement đã thực hiện | Phân biệt yêu cầu và tiền đã hoàn; giữ nguồn gốc, người duyệt/chứng cứ, không chạy API complete để nhập lịch sử |
| folioSnapshot, depositAmount/guaranteeDeposit | Folio/Entry, DepositAccount/Movement | Snapshot/tổng là quan sát, không đủ suy ra bút toán; không trừ/thu hai lần, không tự tạo RECEIVE từ số dư |
| housekeepingTasks/maintenanceTickets/lostAndFound | HousekeepingTask/MaintenanceTicket/LostFound | Giữ lịch sử, actor thật, custody và trạng thái sạch/khai thác độc lập; cần hợp đồng nhập lịch sử |
| cashierShifts/dailyLedgers/hotelInfo | CashierShift/BusinessDay/HotelSettings | Không dùng workingDate máy để tự gán các giao dịch cũ vào ca mới; không mở/chốt lại ngày bằng API vận hành |
| auditLogs/exceptionCases | AuditLog/ExceptionCase (đề xuất nhập dấu vết nguồn riêng) | Không sửa log hiện hành, không coi ngoại lệ là doanh thu; text bị giữ khỏi export cần xử lý riêng |
| users/roles | Tham chiếu AppUser/AppRole hiện có | Không nhập mật khẩu, tạo tài khoản/cấp quyền, giả actor; chỉ crosswalk được duyệt tới nhân viên thật |
| policies | PolicyVersion và hợp đồng giá G4 | Không coi các tỷ lệ demo là policy được duyệt, không dựng giá lịch sử từ giá hiện tại |

Tên entity và field mapping là thiết kế nháp theo repository; importer chưa có serializer SQL được duyệt. Target entities có quan hệ bổ sung phải được hợp đồng nhập mô tả trước khi mở. Crosswalk hỗ trợ nhiều target component cho một nguồn, định danh sourceRef + sourceHash + old ID + JSON pointer; ID SQL không tự sinh trên CLI. Bản ghi chưa đầy đủ vào quarantine, không tự giảm tiền về 0 để đi tiếp.

## Đối chiếu tiền cần đủ trước PASS

| Chỉ tiêu | Quy tắc nguồn/đích phải được duyệt |
| --- | --- |
| Cọc thu | RECEIVE có chứng cứ; không phải depositAmount tổng và không cộng apply lần nữa |
| Cọc đối trừ / hoàn | APPLY/UNAPPLY/REFUND có nguồn gốc, phân bổ đúng booking/stay và liên kết folio/payment |
| Thu / chi thực tế | Payment SUCCEEDED IN/OUT có chứng cứ; không tính pending, internal allocation, transfer, credit |
| Phí folio | Snapshot tiền phòng, dịch vụ/minibar/phụ thu; CHARGE_CREDIT tham chiếu dòng gốc; không đếm mirror hai lần |
| Công nợ | CHARGE − CHARGE_CREDIT − PAYMENT + REFUND − DEPOSIT_APPLY + DEPOSIT_UNAPPLY + TRANSFER_DEBIT − TRANSFER_CREDIT |
| Công nợ master | Cùng công thức trong master của đúng đoàn; transfer cần đủ hai phía, không phải doanh thu/tiền mới |

Tất cả VND phải nguyên chính xác; nhận số JS safe integer hoặc chuỗi nguyên, dùng BigInt khi đối chiếu, không làm tròn/lấy 0 thay dữ liệu sai. Timestamp cũ thường không offset; chỉ ghi nhận timezone approval trong review, **chưa tự chuyển thành UTC**. Phải duyệt IANA timezone, các mốc không rõ giờ, ngày kinh doanh và thời điểm đóng; không gắn Z mặc định. Dữ liệu thiếu chính sách/lịch sử không thể được giải quyết chỉ bằng cờ REAL.

## Bàn giao kỹ thuật

- `tools/migration/browser-export.js`: người vận hành chủ động xuất snapshot lọc + manifest.
- `tools/migration/cli.mjs`, `lib/core.mjs`: CLI, kiểm nguồn/checksum/coverage, artifact create-new.
- `lib/analyze.mjs`: inventory/nháp mapping, classification hints/review, crosswalk validation, quarantine và tiền quan sát.
- `lib/reconcile.mjs`: so thiếu/dư/ID/nội dung/quan hệ, từng dòng tiền và tổng theo scope; thiếu coverage/nguồn/approval thì FAIL.
- `lib/import-engine.mjs`, `sql-adapter.mjs`: framework atomic batch/receipt/resume; adapter SQL luôn khóa. Chưa có aggregate planner, IMPORT_READY promotion, source ledger resolver hoặc RPC verification được duyệt; không tuyên bố nhập thử có thể hoàn tất.
- `rehearsal.example.json`, README: cấu hình không bí mật, lệnh dự kiến, bảo quản/backup/restore và điều kiện vận hành.
- `.gitignore`: loại private/artifacts/local config/SQL backup khỏi Git; không thay ACL, không xóa file cũ.

Không bổ sung API đọc: chưa có hợp đồng verification đủ mạnh, các list API hiện tại không thay thế đọc toàn bộ graph đối soát. Không thay business module, frontend, session hay localStorage. Không có dữ liệu thật được sao lưu hay ghi trong lượt này.
