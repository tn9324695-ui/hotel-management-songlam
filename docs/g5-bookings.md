# G5 — code đặt phòng, phân phòng và quỹ/lịch phòng

> **13/11/2026:** đọc quỹ/lịch/đơn và tạo đơn/đoàn kèm phân phòng ban đầu đã chạy SQL thật, có kiểm tranh phòng, replay, rollback và timeout. [Bằng chứng, mã đơn và giới hạn](booking-sql-execution-2026-11-13.md). Gán/đổi/hủy sau xác nhận chưa mở; các đoạn nói chưa có SQL dưới đây mô tả giai đoạn G5 ban đầu, không phủ nhận phạm vi mới đã xác minh. Chưa nghiệm thu toàn bộ G5/G12 vận hành.

> Cập nhật 12/11/2026: [tiến độ và bằng chứng mới](pricing-booking-progress.md). A1/R1 đăng nhập và danh mục đã được áp dụng, khác thời điểm ghi tài liệu ban đầu dưới đây. G5 vẫn chưa có hợp đồng SQL nguyên tử được phê duyệt/triển khai. Kiểm thử ứng dụng đã được bổ sung; không thay thế kiểm thử SQL nghiệp vụ.

## Chốt điều kiện giá khi xác nhận

Mỗi dòng phòng bắt buộc `acceptedQuoteHash` (64 ký tự hex thường) từ `acceptanceHash` G4. Trường này là một phần canonical intent và khóa chống gửi lặp, không phải số tiền để backend tin theo. Frontend xóa báo giá đã chấp nhận khi người dùng đổi nội dung đơn; cần xem lại giá trước xác nhận. Backend tự tính G4, so hash, rồi mới dựng batch. Một phòng lỗi giá/khác hash/vượt giới hạn khiến toàn đoàn không gọi commit. Không ghi từng phòng rồi báo thành công một phần.

`PriceProofsJson[]` bổ sung `acceptanceHash` cạnh `snapshotSha256`, `lineKey`, thời điểm, policy và căn cứ phê duyệt. Hợp đồng SQL G5 tương lai cần nhận trường mới, ràng buộc nó với InputJson và snapshot; đây chưa phải thay đổi đã áp dụng. Khi replay, dùng receipt/intent gốc trước khi báo giá lại; giá danh mục mới không tạo đơn thứ hai. Không có xác nhận rằng SQL hiện tại đã thực hiện cơ chế này.

**G5 chưa hoàn thành/nghiệm thu vận hành.** Đã viết backend và API client độc lập; chưa có hợp đồng SQL theo actor được duyệt để thực sự ghi đoàn nguyên tử hoặc kiểm chứng xung đột đồng thời. Không có API mới nào được xác nhận dùng SQL thật trong lượt này. Không xem các capability trong code là bằng chứng SQL đã an toàn.

Đã đọc code G0–G4, script schema/gateway/inventory/cancellation và tài liệu hiện có. Không tìm thấy AGENTS.md trong checkout/thư mục cha. Không tìm thấy phê duyệt riêng A1/A2/A3, R1, P1 hoặc hợp đồng G5. Không sửa/chạy SQL, seed, dữ liệu, quyền hoặc cài thư viện. Theo yêu cầu chỉ viết code: không tạo/chạy test, không chạy ứng dụng hoặc syntax checker; chỉ rà soát tĩnh và `git diff --check`.

## Backend đã viết

Tiền tố `/api/v1/bookings`:

| Method/path | Mục đích | Quyền ứng dụng theo tên quyền đã có |
| --- | --- | --- |
| GET `/availability` | Quỹ theo roomTypeId, from/to địa phương [from,to) | viewRoomRack |
| GET `/timeline` | Lịch theo from/to và roomId/roomTypeId tùy chọn | viewRoomRack |
| GET `/` | Danh sách, lọc khoảng ngày giao nhau, status/customerId/code; phân trang | createBooking hoặc manageCheckOut |
| GET `/:id` | Chi tiết, phiên bản, phòng dự kiến và giá snapshot | createBooking hoặc manageCheckOut |
| POST `/` | Một đơn INDIVIDUAL/GROUP, một hoặc nhiều phòng | createBooking; khi báo giá còn cần viewRoomRack của G4 |
| POST `/groups` | Alias tạo đoàn, bắt buộc kind=GROUP và groupName | Như tạo đơn |
| PUT `/:id/rooms/:bookingRoomId/assignment` | Gán/thay toàn bộ phân phòng dự kiến cho phần chưa nhận | createBooking |
| POST `/:id/cancel` | Hủy toàn bộ đơn chưa có phần đã nhận | cancelBooking |
| POST `/:id/rooms/cancel` | Hủy chính xác bookingRoomIds chưa nhận | cancelBooking |

Route → service → gateway, actor lấy từ G2 và kiểm quyền lại tại SQL. Không tin status/giá/actor/quyền trong body. Các POST/PUT yêu cầu JSON, Origin, CSRF và `Idempotency-Key`. Không có endpoint check-in/check-out/thu cọc hoặc hoàn tiền thành công.

G2 chưa cấu hình thì các route bị chặn ở xác thực. Nếu G2 sẵn sàng nhưng thiếu hợp đồng G5, trả BOOKING_CONTRACT_NOT_APPROVED/BOOKING_ATOMIC_CONTRACT_MISSING. Không dùng dữ liệu demo hoặc gọi cổng SQL theo principal để lách các điểm chặn.

### Đầu vào tạo đơn

- Header: kind INDIVIDUAL/GROUP, customerId có sẵn, organizationId tùy chọn, groupName khi GROUP, contact.name/phone/email, sourceCode và notes tùy chọn.
- rooms là từng BookingRoom riêng: lineKey ổn định duy nhất trong lô, roomTypeId, ratePlanId, stayType NIGHTLY/HOURLY, checkInAt/checkOutAt, adults/children; plannedRoomId tùy chọn.
- guestCustomerIds tùy chọn là Customer ID đã có; leadCustomerId nếu có phải nằm trong danh sách đó. Tất cả liên kết khách cung cấp được đưa vào cùng lô. Không tạo Customer mới inline hoặc giả dữ liệu khách chưa biết. Không tự hạn chế INDIVIDUAL chỉ một phòng vì schema không có ràng buộc đó.
- Không nhận QuotedTotalVnd, RateSnapshotJson, status, hold expiry, tiền cọc hoặc actor từ client. SQL preparation quyết định HELD/CONFIRMED và thời hạn giữ theo chính sách được duyệt.
- Nếu chính sách đòi cọc xác thực để xác nhận, G5 hiện chỉ chấp nhận quyết định HELD. Chưa có hợp đồng xác thực payment intent trước khi tạo booking; không lấy giao dịch pending làm đã thu hoặc cho frontend khai “đã thanh toán”.

### Snapshot G4 và tính nguyên tử

Backend gọi `createPricingService` G4 cho từng phòng, với rooms=1. Không thêm engine/công thức chọn giá thứ hai. Các lần gọi giá là đọc/ước tính; chưa ghi gì nếu một phòng báo giá thất bại. Bộ gom lô lấy đúng từng dòng NIGHT, roomBaseVnd và snapshot ứng viên G4.

Lô gồm một Booking và toàn bộ BookingRoom/BookingNightRate/BookingGuest/RoomAllocation liên quan. Chỉ một lời gọi SQL commit được phép ghi; không có vòng lặp ghi từng phòng, không chia lô. SQL phải kiểm quỹ và xung đột phòng, giá/chính sách G4, khách/FK, phiên bản, trạng thái và lưu audit trong cùng transaction/khóa đã duyệt.

Giá nền và phụ thu được tách đúng G4: BookingRoom.QuotedTotalVnd bằng giá phòng nền, không cộng phụ thu vào tổng BookingNightRate. Snapshot giữ cả các khoản ước tính còn lại; G5 không tự ghi folio phụ thu khi tạo đơn. PriceProofs gồm hash snapshot và bằng chứng phiên bản G4 để SQL kiểm lại lúc commit. Không thêm RateReason nhằm lách quyền override nếu công thức SQL cũ khác G4.

Snapshot được lưu theo giá trị, không join bảng giá mới để thay giá đơn cũ. Chi tiết API yêu cầu SQL projection lấy tổng tiền từ snapshot đã lưu, trả priceState ESTIMATE cho HELD và LOCKED cho CONFIRMED/IN_HOUSE/COMPLETED. Chưa có hợp đồng xác nhận đơn HELD hiện hữu; chưa viết luồng đó giả thành công, xem B5 trong đề xuất SQL.

### Quỹ phòng, lịch và trạng thái

- Khoảng nửa mở: ngày trả không chiếm thêm đêm; read DTO phải có đủ từng đêm [from,to). Không kiểm riêng ngày đến.
- Quỹ đọc là ước tính, không giữ chỗ. Nó không được dùng thay kiểm tra dưới khóa SQL khi ghi. Backend không tự “đếm còn trống” rồi coi JavaScript là cơ chế chống đặt trùng.
- SQL projection dùng một nguồn nhu cầu hiệu lực: phần chưa nhận đếm một lần; phần đã nhận của đoàn thuộc occupied, không cộng thêm vào reservedUnreceived. assigned thay thế unassigned trong đoạn thời gian tương ứng.
- Ngày/quỹ tương lai vẫn mang timestamp tương lai. Lô G5 không ghi Room/Stay/StayRoomSegment hoặc trạng thái vệ sinh/lưu trú hôm nay.
- Timeline phân biệt BOOKING (HELD/CONFIRMED), STAY và BLOCK; không trả tên khách, số điện thoại hoặc số tiền. Các segment phải giao với cửa sổ yêu cầu. Phân trang không được trình bày thành lịch đầy đủ khi hasMore chưa hết.
- Quỹ trả capacity/reservedUnreceived/occupied/blocked/available tại cùng thời điểm nhu cầu xấu nhất của từng cửa sổ đêm, tránh cộng các peak khác thời điểm. Contract phải xác định cửa sổ đêm theo cấu hình khách sạn. DTO kiểm tổng khớp, ngày đầy đủ; không bịa số liệu thiếu.

### Phân phòng và hủy

Gán phòng chỉ nhận roomId, expectedVersion của Booking và expectedAllocationVersions (ID/version của toàn bộ phân phòng dự kiến đang thấy, có thể là mảng rỗng). So sánh tập phân phòng để không ghi đè từ UI cũ; SQL vẫn phải kiểm lại tập đó dưới khóa, bao gồm điều kiện “chưa có allocation”. Đổi hạng phòng bị chặn ROOM_TYPE_CHANGE_REQUIRES_REQUOTE; không tự đổi giá. Hủy allocation cũ và tạo allocation mới thuộc cùng command, kiểm chính phòng đích không bảo trì/chặn/trùng toàn khoảng ở.

Hủy bắt buộc reason không trắng, expectedVersion; hủy phần phòng cần danh sách ID cụ thể. Đoàn đã nhận một phần không được hủy toàn bộ bằng endpoint đơn; phần đã nhận/hoàn tất không bị cập nhật. BookingRoom.CancellationReason và các allocation tương ứng phải thay đổi cùng transaction.

SQL preparation phải trả quyết định cọc theo chính sách: collected/refunded/applied/retained/pendingRefund/remaining và phân bổ cho phòng đã nhận trước/sau. DTO dùng các nhóm tiền **không trùng nhau**, bảo toàn tổng; phân bổ cho phần đã nhận không được tự tăng. Hủy toàn bộ phải giải quyết hết remaining. RefundExecution luôn NOT_EXECUTED.

Nếu cần bút toán nghĩa vụ, backend chỉ chấp nhận dòng SQL preparation đã sinh: RefundRequest PENDING hoặc FolioEntry CHARGE/CANCELLATION cho phạm vi được duyệt. Không chấp nhận Payment, DepositMovement hoặc refund COMPLETED. Những dòng này cũng tính vào 500 thay đổi; chúng **chưa được phép gọi với MutationRule hiện tại**, cần hợp đồng/quyền hẹp B3, không tự cấp collectPayment.

### Chống gửi lặp và timeout

Khóa gắn actor + operation + canonical input intent. IntentHash là SHA-256 của JSON UTF-8 có thứ tự key ổn định; không gồm UUID booking, quoteId, thời điểm báo giá hoặc nội dung quote được tạo lại. SQL cần so cùng intent để replay kết quả cũ, không tạo thêm đơn dù G4 được gọi lại cho request khác.

Prepare là đọc, có thể trả kết quả đã commit trước khi gọi G4. Commit phải lặp lại kiểm tra idempotency dưới khóa, trước thay đổi dữ liệu. Không tin một lần lookup trước transaction; hai nhân viên/request cùng lúc vẫn phải được SQL xử lý nguyên tử.

Commit timeout/lỗi kết nối trả BOOKING_OUTCOME_UNKNOWN, không nói thất bại chắc chắn hoặc báo thành công. Caller giữ nguyên key để gửi lại sau khi xử lý trạng thái không xác định; không tự tạo key mới. Chưa có endpoint tra cứu request riêng; replay an toàn còn phụ thuộc B2/B4 đã được triển khai và kiểm chứng.

## Giới hạn lô đã kiểm tra từ nguồn

`006_command_gateway.sql` hiện kiểm 1–500 phần tử @Changes và DATALENGTH(@Changes) ≤ 4.000.000 byte nvarchar. Đây là **số mutation items**, không phải tối đa 500 phòng hoặc số dòng vật lý SQL kể cả trigger/audit. Chưa tái kiểm tra định nghĩa live.

Với lô tạo G5 hiện tại, không tạo tiền/folio/customer mới:

```
items = 1 Booking
      + tổng mỗi phòng (1 BookingRoom + số đêm G4 + số BookingGuest
                        + 1 nếu có RoomAllocation dự kiến)
```

Giờ không có BookingNightRate. Khách mỗi phòng theo MaxOccupancy G4 và kiểu smallint của schema; số link khách tăng số mutation items. 499 phòng/guest links chỉ là trần lý thuyết từ 500 items trừ Booking, không phải giới hạn nghiệp vụ độc lập được tìm thấy trong SQL. Số phòng thực tế cho phép thường thấp hơn sau khi cộng đêm và khách.

Bộ gom đếm chính xác UTF-16LE của JSON, cả dấu ngoặc/phẩy, và chặn ngay khi vượt. Manifest SQL có thể giới hạn thấp hơn về rooms/guest links/items/bytes; không được nâng vượt nguồn. Hủy/gán cũng tính từng allocation và dòng nghĩa vụ tài chính. SQL commit phải tính lại, không thêm mutation items ngoài batch đã đo mà không cập nhật hợp đồng/cap.

HTTP JSON riêng nhánh bookings giới hạn 128 KiB, giới hạn kỹ thuật trước xử lý; các API cũ vẫn 16 KiB. Đây không thay thế giới hạn @Changes sau khi đính snapshot G4. Vượt giới hạn trả 413 hoặc BOOKING_BATCH_LIMIT_EXCEEDED; không tự chia thành nhiều command.

## API client đã viết — chưa nối giao diện

`js/api/bookings-api.js` xuất `SongLamBookingsApi.createBookingsApi({client,getCsrfToken})`, dùng `SongLamHttp` đã có:

- listBookings, getBooking, checkAvailability, getTimeline.
- createBooking, createGroupBooking, assignRoom, cancelBooking, cancelRooms.

Hàm ghi nhận options gồm idempotencyKey và signal; getCsrfToken lấy token phiên do caller cung cấp. Không tự cấp token/phiên hoặc sinh key mới khi gửi lại. Không retry, chia lô, ghi localStorage, gọi SongLamStore hoặc cập nhật giao diện lạc quan. Không thêm script này vào HTML; khi được nạp nó cũng không tự gọi API.

| Phần | Trạng thái |
| --- | --- |
| Backend route/service/validation/DTO/batch/gateway | Đã viết code; chưa chạy/nghiệm thu |
| API client frontend | Đã viết riêng; chưa chạy/nghiệm thu |
| Chức năng nối giao diện | Chưa thực hiện |
| SQL thật/transaction đoàn/xung đột đồng thời | Chưa kết nối hoặc kiểm chứng; còn chờ hợp đồng/phê duyệt |

## Tệp mới/sửa

- Mới: `backend/src/modules/bookings/{validation,intent,batch,dto,service,routes}.js`, `backend/src/adapters/sql/bookings-gateway.js`.
- Mới: `js/api/bookings-api.js`.
- Sửa: `backend/src/app.js`, `backend/src/server.js`, `backend/src/modules/status/readiness.js` và tài liệu README.
- Mới: tài liệu này và [đề xuất SQL G5](g5-sql-proposals.md).

Không sửa engine giá G4, code xác thực G2, database, dữ liệu demo, controller giao diện, dependency hoặc test. Không gọi G5 hoàn thành khi B2/B3/B4 chưa có transaction SQL và nghiệm thu đồng thời thực tế.
