# G6 — nhận phòng, chuyển phòng, gia hạn và shorten

**Đã viết lớp ứng dụng; chưa nghiệm thu với SQL thật.** G6 không quyết toán/check-out, đóng folio, tạo settlement hoặc thực hiện thu/hoàn tiền. Các việc đó thuộc G9/phân hệ tiền. Không có thay đổi database, quyền hoặc dữ liệu trong lượt này.

Đã đọc code G0–G5, schema và các script business/gateway. Không tìm thấy AGENTS.md trong checkout/thư mục cha. Không tìm thấy phê duyệt riêng A1/A2/A3, R1, P1, B1–B5 hoặc hợp đồng lưu trú theo actor. Chỉ viết code và rà soát tĩnh, không tạo/chạy test, syntax checker, ứng dụng hoặc truy vấn SQL live theo yêu cầu lượt này.

## Backend và API client

Tiền tố `/api/v1/stays`:

| API | Nội dung |
| --- | --- |
| POST `/check-in` | Nhận các BookingRoom được chọn của một đơn; toàn bộ phần chọn cùng transaction |
| POST `/:id/transfer-room` | Chuyển hiện diện sang phòng mới, giữ lịch sử, lý do và giá cũ |
| POST `/:id/extend` | Gia hạn ngày trả dự kiến bằng đề xuất giá G4 và kiểm toàn khoảng mới |
| POST `/:id/shorten` | Cắt phần thời gian dự kiến chưa dùng, điều chỉnh giá/bút toán; vẫn IN_HOUSE |
| GET `/` | Danh sách, status/bookingId/roomId/from/to, phân trang |
| GET `/:id` | Chi tiết lượt ở, phiên bản, giá tóm tắt; khách/segment theo quyền |
| GET `/arrivals` | Khách dự kiến đến theo date địa phương, bookingId và phân trang |
| GET `/room-readiness` | Phòng sẵn sàng cho bookingRoomId, hoặc phòng đích cho stayId + roomId |

`js/api/stays-api.js` dùng SongLamHttp, xuất createStaysApi với listStays/getStay/getArrivals/getRoomReadiness/checkIn/transferRoom/extend/shorten. Mọi hàm ghi yêu cầu getCsrfToken và Idempotency-Key từ caller, hỗ trợ AbortSignal. Không tự thử lại, sinh key mới, chia lô hoặc báo thành công lạc quan.

**Chưa nối biểu mẫu lễ tân.** reception.html/js/reception.js vẫn là đường demo localStorage có sẵn; không thêm script mới vào HTML, không gọi API song song với SongLamStore. Không có chức năng giao diện mới được kết nối SQL trong G6.

## Danh tính, quyền và hợp đồng

Route → service → SQL gateway; actor là context G2, không đọc UserId/role/giá/trạng thái phòng do client khai. POST kiểm JSON, Origin, CSRF, Idempotency-Key. Quyền thao tác theo tên đã có: check-in/extend/shorten là manageCheckIn, transfer là manageRoomTransfer. Đọc Stay theo manageCheckIn hoặc manageCheckOut; chỉ trả roster khi có manageCheckIn, segment khi có viewRoomRack. Arrivals yêu cầu manageCheckIn cùng quyền đọc BookingRoom hiện có (createBooking hoặc manageCheckOut); readiness yêu cầu viewRoomRack và quyền nhận/chuyển tương ứng. Không tự cấp thêm quyền để giải quyết khoảng trống của role tùy chỉnh.

Adapter mặc định không có pool/manifest, không mở SQL. Chỉ nhận thủ tục pms được phê duyệt, đúng environment/SongLamPms_Design, giao thức songlam.stays.v1, actorMode app-user-parameter. Query/ExecuteCommand theo SQL principal và private helper cũ không được gọi vòng qua.

Các capability atomic/lock trong constructor là **điều kiện của hợp đồng cần duyệt**, không phải bằng chứng SQL đã thực hiện. Không bật chúng bằng biến môi trường hoặc mặc định true. Xem [đề xuất SQL G6](g6-sql-proposals.md).

## Check-in

Body có bookingId, expectedVersion Booking và rooms gồm bookingRoomId/expectedVersion, roomId/roomVersion, allocationId/allocationVersion, guestCustomerIds/leadCustomerId. Danh sách phòng/BookingRoom không được trùng; khách mỗi phòng phải có đúng một lead trong roster đã biết. SQL phải kiểm Customer hiện hữu/được phép, không tự tạo khách giả.

- Chỉ BookingRoom CONFIRMED chưa có Stay. HELD/pending không tự thành đã xác nhận. Một BookingRoom tạo một Stay; nhiều phòng được nhận một phần theo danh sách chọn, nhưng tất cả phần chọn ghi nguyên tử.
- Giờ thực tế lấy từ preparation SQL, không nhận timestamp thực tế do trình duyệt tự khai; không cho timestamp tương lai. Giờ đó phải trong khoảng đã chốt và allocation còn hiệu lực. Nhận sớm trước StartsAtUtc cần luồng sửa booking/giá được duyệt trước, không tự dời ngày nhận.
- Phòng phải VACANT/CLEAN/ACTIVE theo ba trạng thái độc lập; đúng hạng hoặc có approval nâng hạng được SQL xác minh. Profile hiện chỉ chấp nhận nâng hạng được duyệt với priceEffect=NO_CHANGE; nâng hạng có tiền bị chặn chờ báo giá/chốt lại.
- Xác minh phiên bản/phân phòng/khả dụng/khách/cọc lần nữa dưới khóa SQL. Cọc bắt buộc chỉ thỏa khi SQL trả VERIFIED_SUCCEEDED, không pending. G6 không áp dụng hoặc phân bổ lại cọc và không thu tiền.
- Snapshot G4 v1 được kiểm bằng chính bộ tính G4 trên **ngữ cảnh đã đóng băng**, không nạp bảng giá mới. Profile khác cần mapper được duyệt; không tự sửa/chuẩn hóa dữ liệu legacy. Snapshot pricing được sao chép theo giá trị vào Stay.
- BookingRoom → IN_HOUSE, tạo Stay, StayRoomSegment, StayGuest và các CHARGE phòng/phụ thu nhận sớm đã thỏa thuận trong cùng lô. Giá giờ không cộng phụ thu đêm; mốc tính giờ BOOKED_INTERVAL phải được chính sách nhận phòng chốt, không tự thay sang giá hiện tại.
- Cần folio OPEN đúng Booking/BookingRoom (hoặc MASTER đúng đơn). Không tự tạo folio bằng một command rời. Nếu thiếu, OPEN_FOLIO_REQUIRED; cần C3 để xác định cách mở folio nguyên tử/quyền tương ứng.
- Room charge lấy đúng giá phòng nền đã chốt để khớp 52220. Không ghi phụ thu trả muộn dự kiến vào folio lúc check-in; G9 xử lý theo chính sách/thực tế.

Sau nhận một phần, SQL phải tổng hợp PARTIALLY_CHECKED_IN/CHECKED_IN từ các phòng. Phần chưa nhận vẫn reserved; phần đã nhận thuộc Stay/occupied, không đếm hai lần. Lô không tự cập nhật một trường trạng thái lưu trú riêng trên Room.

## Chuyển phòng

Body có expectedVersion Stay, bookingRoomVersion, currentSegmentId, currentAllocationId/currentAllocationVersion, targetRoomId/targetRoomVersion và reason không trắng (tối đa 500 ký tự theo TransferReason của schema).

SQL preparation phải trả đúng Stay IN_HOUSE, segment hiện tại chưa rời và allocation thuộc đúng BookingRoom. Không giả RowVersion cho StayRoomSegment: bảng này không có cột đó, nên dùng ID segment đang mở cộng snapshot tập segment và rowversion của Stay/allocation để kiểm xung đột dưới khóa.

Command đóng segment cũ với DepartedAtUtc/lý do, cắt allocation cũ tại thời điểm thực tế, mở allocation mới tới ngày trả dự kiến, tạo segment mới cùng mốc. Các khoảng nối tiếp theo [start,end), không làm chồng hiện diện. Phòng đích sạch/active/trống, đủ sức chứa, không xung đột lịch/bảo trì toàn khoảng; nâng hạng cần approval phù hợp và không tự đổi giá.

Giữ nguyên snapshot/giá Stay. Receipt phải khớp hash giá trước/sau, phòng và segment cũ/mới, thời điểm, lý do. SQL phải giữ side effect buồng phòng có sẵn: khi segment cũ kết thúc thì phòng cũ DIRTY và tác vụ dọn tương ứng, cùng transaction. Không tự viết trạng thái phòng vào localStorage/Node.

Khoảng đã quá ngày trả/phân phòng, chuyển tại mốc không tạo được allocation có độ dài dương hoặc nâng hạng có tiền cần hợp đồng xử lý riêng; không thực hiện nửa luồng rồi báo thành công.

## Gia hạn và shorten

Body chung có expectedVersion Stay, bookingRoomVersion, currentSegmentId, currentAllocationId/currentAllocationVersion, newExpectedOutAt và reason. Không nhận giá, snapshot hoặc lựa chọn chính sách từ client.

1. Prepare chỉ đọc và kiểm intent/phiên bản/segment hiện tại. Replay trả receipt trước, không đọc bảng giá mới cho một thao tác đã commit.
2. Lớp stays gọi `pricingService.quoteStayChange` trong **module G4**. Hợp đồng G4 bổ sung phải đọc snapshot đã chốt, các nightlyRates hiện hành và chính sách/lịch được duyệt. Không có công thức chọn giá thứ hai trong stays.
3. G4 kiểm đủ các đêm theo ngày khách sạn, giữ nguyên giá và RateRule của ngày còn lại đã chốt; giờ giữ nguyên giá gói/block cũ. Không tự chuyển gói hoặc policy gốc vì CHANGE_STAY hiện không cho đổi RatePlanId/PolicyVersionId.
4. Gia hạn kiểm từng đêm/khung giờ và chính phòng hiện tại với các nhu cầu khác dưới khóa lúc commit. Nếu xung đột, toàn bộ ngày trả/giá/folio giữ nguyên.
5. Shorten chỉ nhận ngày trả dự kiến còn trong tương lai, sau check-in thực tế và trước ngày trả cũ. Không đặt thời điểm đã dùng thành chưa dùng. Trả thực tế/quyết toán ngay thuộc G9. NIGHTLY không hỗ trợ cắt thành khoảng không có đêm vì CHECK của BookingRoom và 52103; không tự đổi StayType để lách ràng buộc.
6. Một lô cập nhật BookingRoom interval/QuotedTotalVnd/snapshot, thêm hoặc xóa đúng BookingNightRate, sửa allocation cuối và Stay.ExpectedOutAtUtc/PricingSnapshotJson, thêm các bút toán điều chỉnh được G4 xác định. Không thay giá các ngày cũ còn giữ, không ghi đè bằng giá mới.
7. Room net charges sau điều chỉnh phải bằng giá phòng nền mới. Các CHARGE_CREDIT phải trỏ đúng charge gốc, cùng stay/folio và không vượt giá trị có thể đảo. Nếu tiền giữ lại cho đêm bị cắt, cần chuyển nó thành nghĩa vụ/phí theo chính sách, **không giữ BookingNightRate ngoài khoảng mới**. G4/SQL C4 phải cung cấp kế hoạch đó, không có mặc định hoàn đủ hoặc giữ 100%.

G4 trả đề xuất G6 chưa commit; Stays chỉ dùng kết quả khi gắn đúng Stay/BookingRoom versions, hash snapshot cũ và policy/calendar approvals. Snapshot điều chỉnh mới `songlam.stay.pricing.v1` là **định dạng JSON ứng dụng cần duyệt**, không phải schema SQL mới. Nó chứa giá đóng băng, Rule IDs, policy/calendar refs, before hash, lý do và quotedAt. Hourly giữ includedMinutes/extraMinutes/baseVnd/extraVnd ở cấp đầu tương thích kiểm tra minute-block hiện có. Profile legacy/G9 còn cần mapper riêng, không tự dùng bộ tính v1 cho format khác.

G6 giữ Stay=IN_HOUSE, segment hiện tại mở, folio OPEN; không tạo StaySettlement, không CHECKED_OUT, không hoàn/thu tiền hoặc tự chuyển cọc. Receipt trả giá trước/sau và hashes. Tiền chênh lệch là điều chỉnh giá/bút toán, không phải payout thành công. Phụ thu trả muộn chỉ là dự kiến trong snapshot, không hạch toán/thu tại G6; G9 phụ trách.

## Version, batch và audit

Mỗi thao tác ghi có logical IntentHash SHA-256 canonical UTF-8 (dùng helper G5) và key actor/operation. Quote IDs/thời điểm SQL không nằm trong intent. SQL phải kiểm replay ngay trong transaction và kiểm quyền hiện tại kể cả replay, không chỉ dựa lookup trước đó. Lỗi/timeout commit trả STAY_OUTCOME_UNKNOWN, caller giữ key; không tự chạy command tiếp theo hoặc retry với key mới.

Dùng bộ gom batch G5: tối đa 500 mutation items và 4.000.000 byte UTF-16 theo script nguồn, có thể giảm theo hợp đồng được duyệt. Mỗi phòng check-in ít nhất BookingRoom update + Stay + Segment + lead guest; trần 125 units là giới hạn kỹ thuật suy ra, thực tế thấp hơn khi có charges/đồng hành/snapshot bytes. Không chia nhóm đang chọn thành các lần ghi. Nhánh HTTP stays giới hạn 128 KiB; API cũ khác giữ giới hạn trước đó.

SQL phải audit đúng AppUserId, lưu trước/sau và lý do, tham chiếu approval nâng hạng, giữ history segment và charge credits. Các capability trong adapter không thay thế transaction/khóa/audit hoặc kiểm thử tích hợp thực tế.

## Những gì chưa hoạt động vận hành

| Phần | Trạng thái |
| --- | --- |
| Bốn API ghi và read tối thiểu | Đã viết route/service/DTO/batch; chưa chạy |
| API client frontend | Đã viết, chưa nạp vào HTML hoặc gọi trong controller |
| Biểu mẫu lễ tân | Chưa nối API; giữ demo cũ, không ghi kép |
| SQL thật, audit actor, atomic/concurrency | Chưa kết nối/nghiệm thu; chưa có phê duyệt hợp đồng |
| Folio mở khi chưa có, snapshot legacy/nâng hạng có tiền | Còn chặn chờ C3/C5, không tự thực hiện rời |
| Giá bổ sung/trả sớm theo chính sách thật | Chờ hợp đồng G4 C4 và phê duyệt policy/lịch; không bịa giá |
| Check-out/quyết toán/thu-hoàn tiền | Không triển khai, thuộc G9/phân hệ tiền |

## Tệp tạo/sửa

- Mới `backend/src/modules/stays/{validation,dto,commands,service,routes}.js`.
- Mới `backend/src/adapters/sql/stays-gateway.js`, `stay-pricing-gateway.js`.
- Bổ sung G4: mới `backend/src/modules/pricing/stay-change.js`, thêm `quoteStayChange` vào `pricing/service.js`; không sửa công thức giá đêm/giờ đã có trong engine.
- Mới `js/api/stays-api.js`.
- Sửa `backend/src/app.js`, `server.js`, `modules/status/readiness.js`, README và tài liệu này/[đề xuất SQL](g6-sql-proposals.md).

Không sửa frontend demo, localStorage, database, dependency hoặc test. Không tuyên bố G6 hoàn thành khi các hợp đồng SQL/price amendments chưa được duyệt và kiểm chứng.
