# G4 — báo giá và chính sách giá

> **13/11/2026:** báo giá đêm/giờ đã đọc SQL thật qua gói 012/013/014, chính sách riêng version 1 của nhóm và dòng đặt phòng đã lưu snapshot/đối chiếu. Xem [bàn giao SQL thực](booking-sql-execution-2026-11-13.md). Các mô tả chưa có hợp đồng bên dưới giữ làm lịch sử; API trả sớm từ Stay/G6 vẫn chưa mở.

> Cập nhật 12/11/2026: xem [bằng chứng và phạm vi hiện tại](pricing-booking-progress.md). Đăng nhập và R1 danh mục đã chạy SQL thật; hợp đồng G4 giá vẫn chưa được áp dụng. Các đoạn ghi “chưa chạy test” bên dưới mô tả lượt G4 ban đầu, không phải lượt rà soát mới.

## Bổ sung hợp đồng báo giá

Kết quả theo đêm/giờ có `acceptanceHash` SHA-256 của `snapshotCandidate` sau khi bỏ **chỉ** `sourceQuoteId` và `quotedAt`. Cách serialize là `JSON.stringify` trên snapshot đã chuẩn hóa bởi G4, UTF-8. Giữ nguyên input một phòng, hạng/gói, toàn bộ ngữ cảnh giá/chính sách/lịch và bảng kê. Không dùng hash này thay `snapshotSha256`: hash snapshot vẫn bao gồm mã/thời điểm để lưu dấu vết.

G5 nhận `rooms[].acceptedQuoteHash` từ lần báo giá đã xem, tự gọi lại G4 và so sánh. Khác hash trả `409 BOOKING_QUOTE_CHANGED` trước commit. Không nhận giá do trình duyệt khai; sửa một chữ số hash không cho phép bỏ qua so sánh. Bản giá/policy thay đổi dù tổng tiền tình cờ bằng nhau vẫn cần xem lại. SQL còn phải kiểm chứng nguồn giá và snapshot trong transaction khi commit.

Hai tùy chọn policy mới là **khả năng của engine, chưa phải chính sách được bật trên SQL**:

- `lateDepartureInterval: LEFT_CLOSED_RIGHT_OPEN` dùng `[fromMinutes,toMinutes)` cho trả muộn, để 15:00 và 18:00 bắt đầu bậc mới. Thiếu trường này giữ nguyên `(from,to]` của snapshot cũ.
- `hourlyMaximumMinutes` giới hạn thời lượng gói giờ; vượt trả `HOURLY_LIMIT_REQUIRES_NIGHTLY`, không tự cộng block/gói, tính phụ thu đêm hoặc tự chọn giá khác. Khách phải xem báo giá đêm riêng. Chuyển ở trong ngày quá 6 giờ thành giá đêm chưa được hỗ trợ đầy đủ, phải có hợp đồng riêng.

Không gán policy `INCLUDED_UP_TO_MAX` hiện có cho nguồn Excel có phụ thu khách vượt tiêu chuẩn/trẻ em: việc đó làm miễn phí sai. Chưa bật các chính sách nguồn khi thiếu mô hình tuổi, giường phụ và điều kiện loại trừ phí trùng.

## Căn cứ và giới hạn

Đã đọc code G0–G3, schema, cổng SQL và kiểm tra nghiệp vụ trong repository. Không tìm thấy AGENTS.md ở checkout hoặc thư mục cha. Không tìm thấy phê duyệt riêng cho A1/A2/A3, R1 hoặc hợp đồng báo giá. Không xem yêu cầu viết code G4 là phê duyệt SQL/chính sách mới.

Chỉ viết code và rà soát tĩnh; không tạo/chạy test, không khởi động ứng dụng, không gọi SQL Server. Không sửa database, quyền, seed, dữ liệu, frontend hoặc localStorage. Chưa có API G4 nào được xác nhận hoạt động với SQL thật.

### Nguồn đã đối chiếu

- `001_schema.sql`: RatePlan trỏ PolicyVersion; StayType NIGHTLY/HOURLY. RateRule có khoảng ValidFrom/ValidTo, DayKind, Priority, PriceVnd và bộ IncludedMinutes/ExtraBlockMinutes/ExtraBlockPriceVnd. Không có bảng lịch ngày lễ hoặc ngữ nghĩa RulesJson được chốt trong các script đã đọc.
- `005_business_validation.sql`, kiểm tra 52103: giá đêm phải đủ từng NightDate từ ArrivalDate đến trước DepartureDate; tổng BookingNightRate bằng BookingRoom.QuotedTotalVnd.
- Cùng script, kiểm tra 52104: giá giờ = baseVnd + CEILING(phần thời gian vượt includedMinutes / extraMinutes) × extraVnd, tính trên thời lượng millisecond. Snapshot phải có includedMinutes, extraMinutes, baseVnd, extraVnd. Không kèm giá đêm vào gói giờ.
- Kiểm tra 52105: RatePlan/PolicyVersion/StayType phải khớp; các quy tắc cùng DayKind và Priority không được chồng khoảng hiệu lực.
- `006_command_gateway.sql`: RatePlan, RateRule, PolicyVersion có rule đọc viewRoomRack, nhưng public Query vẫn dùng SQL principal, phân trang và không cung cấp đầy đủ ngữ cảnh báo giá theo actor website.
- `js/store.js` còn giá demo dự phòng và hệ số mặc định. **G4 không nhập hoặc sao chép các giá/hệ số đó vào backend.**

Các kết luận SQL trên là từ script, không phải tái xác minh deployment hoặc dữ liệu thật. Đặc biệt validation ngày booking hiện có DATEADD(hour,7,...); cần đối chiếu với TimeZoneId thật trước G5, không tự đổi múi giờ/SQL để vượt ràng buộc này.

## API đã viết

Đường dẫn có tiền tố `/api/v1`:

| API | Mục đích và quyền |
| --- | --- |
| GET `/rate-plans`, `/rate-plans/:id` | Gói lưu trú; viewRoomRack; thêm capability vào catalog G3 |
| GET `/rate-rules`, `/rate-rules/:id` | Bảng/quy tắc giá; viewRoomRack; phân trang, lọc nếu manifest SQL hỗ trợ |
| GET `/policy-versions`, `/policy-versions/:id` | Metadata phiên bản chính sách; viewRoomRack; không trả RulesJson tùy ý |
| POST `/pricing/quotes/nightly` | Ước tính theo đêm; viewRoomRack |
| POST `/pricing/quotes/hourly` | Ước tính theo block giờ; viewRoomRack |
| POST `/pricing/quotes/early-departure` | Chênh lệch lưu trú trả sớm từ snapshot đã chốt; viewRoomRack và manageCheckOut |

Không thêm quyền vào role. Route → service → SQL gateway theo cấu trúc hiện có. Actor/quyền lấy từ middleware G2, được đọc lại mỗi request. Các POST dùng Origin/CSRF của G2 dù không ghi database. Không nhận role, actor, giá hoặc snapshot do trình duyệt gửi.

Body đêm/giờ bắt buộc gồm `roomTypeId`, `ratePlanId` (chuỗi ID), `checkInAt`, `checkOutAt` (ISO có giây và offset hoặc UTC), `rooms`, `adultsPerRoom`, `childrenPerRoom` (số nguyên). Phải chọn RatePlan cụ thể, không tự chọn gói đầu tiên. Rooms 1–50, khoảng ở tối đa 366 ngày là giới hạn xử lý API, không phải chính sách kinh doanh mặc định.

Body trả sớm chỉ nhận `stayId` và `newCheckOutAt`. Gateway phải đọc snapshot đã chốt/đang hiệu lực của đúng lượt ở từ SQL, bao gồm các điều chỉnh đã được chốt; không nhận số tiền hoàn hoặc giá cũ từ client. Một Stay tương ứng một phòng, nên snapshot nguồn cho API này có rooms=1. Yêu cầu stayStatus=IN_HOUSE, giờ trả mới sau checkedInAtUtc thực tế và trước expectedOutAtUtc; expectedOutAtUtc phải khớp snapshot đang có hiệu lực.

Các bộ lọc đọc mới: RatePlan q/active/stayType; RateRule ratePlanId/roomTypeId/from/to/dayKind; PolicyVersion code. Chúng chỉ được chuyển tới SQL khi capability tương ứng được duyệt. Không quét bảng trên Node để giả lập SQL chưa hỗ trợ.

## Công thức đã viết và điều kiện áp dụng

### Tiền và thời gian

Tiền tính bằng BigInt, xuất chuỗi VND nguyên để bảo toàn decimal(19,0). Không parseFloat/Math.round tiền, không nhận số thập phân VND. Kiểm tra tràn phạm vi cả giá mỗi phòng và tổng số phòng.

Phụ thu tỷ lệ dùng tử/mẫu nguyên; cách làm tròn DOWN, UP hoặc HALF_UP phải có trong chính sách được duyệt. Không có kiểu làm tròn mặc định. Cùng một cách được dùng cho các khoản tỷ lệ; giá cố định và giá block đã là VND nguyên.

Datetime thiếu offset, ngày không tồn tại, khoảng kết thúc không sau bắt đầu đều bị từ chối. UTC được đổi sang múi giờ khách sạn; offset địa phương khác UTC phải khớp múi giờ đó. Không lấy timezone máy chạy Node. Ánh xạ Windows TimeZoneId sang IANA phải được manifest duyệt, không hardcode mặc định Asia/Ho_Chi_Minh. Profile hiện tại từ chối khoảng ở đi qua thay đổi offset/DST thay vì đoán cách tính phụ thu.

### Đêm

Lập từng đêm theo ngày địa phương, khoảng [ngày đến, ngày đi), phù hợp kiểm tra BookingNightRate hiện có. Mỗi đêm chọn một RateRule đúng phòng/gói, khoảng [ValidFrom,ValidTo), loại ngày và thứ tự ưu tiên được chính sách chốt. Không suy ra cuối tuần từ thứ 6/7/CN hoặc tự tạo ngày lễ.

Calendar phải có nguồn/phiên bản được duyệt và phân loại rõ từng ngày. Policy phải chỉ rõ ưu tiên cao/thấp, ưu tiên loại ngày hay Priority trước, thứ tự DayKind và có cho phép chọn loại giá khác còn hợp lệ hay không. Nếu REQUIRE_HIGHEST_DAY_KIND thì thiếu giá loại ngày cao nhất trả RATE_MISSING; chỉ ALLOW_ELIGIBLE_RULES được duyệt mới cho phép chọn quy tắc khác trong danh sách ngày hợp lệ. Không dùng giá mặc định. Hai quy tắc đồng hạng hoặc cùng loại/ưu tiên chồng hiệu lực trả RATE_CONFLICT.

Tổng giá phòng nền mỗi phòng = tổng giá từng đêm. Tổng nhóm = giá mỗi phòng × rooms; mọi phòng trong request có cùng hạng/gói và số khách mỗi phòng.

### Giờ

Theo công thức kiểm tra 52104 của SQL:

```
extraBlocks = ceil(max(0, durationMs - includedMinutes × 60000)
                   / (extraBlockMinutes × 60000))
roomBaseVnd = PriceVnd + extraBlocks × ExtraBlockPriceVnd
```

Không làm tròn thời lượng thành số giờ trước khi chia block. Ngày chọn RateRule cho toàn gói giờ phải được policy xác định ARRIVAL_DATE trong profile hỗ trợ hiện tại; cách chọn khác trả lỗi chưa hỗ trợ. **Không gọi phụ thu nhận sớm/trả muộn của giá đêm trong nhánh giá giờ**, kể cả ước tính trả sớm.

### Phụ thu nhận sớm/trả muộn

Đọc giờ chuẩn từ HotelSettings. Profile chính sách được đề xuất dùng giờ đồng hồ khách sạn: nhận sớm so với CheckInTime, trả muộn so với CheckOutTime. Các khoảng phụ thu có dạng `(fromMinutes,toMinutes]`, đầu cuối vô hạn phải ghi null rõ ràng. Không làm tròn phút để chọn khoảng.

Mỗi khoản là fixedVnd hoặc một tỷ lệ numerator/denominator. Trong profile v1, tỷ lệ nhận sớm có cơ sở là giá đêm đầu; trả muộn là giá đêm cuối được tính tiền. Đây là **ngữ nghĩa profile cần được phê duyệt**, không phải kết luận về RulesJson đang có. Mức miễn phí cũng phải có khoản fixedVnd=0 rõ ràng nếu thời điểm đó thuộc trường hợp phụ thu. Thiếu khoảng hoặc chồng khoảng trả lỗi, không tự đặt 30%/50%/100%.

Đúng giờ hoặc không rơi vào hướng nhận sớm/trả muộn thì điều kiện khoản đó không phát sinh. Hai khoản được tách khỏi giá nền, không tự ghi vào folio.

### Trả sớm

Đọc snapshot đã chốt từ SQL, tái dựng và kiểm tra tiền bằng giá/quy tắc/lịch đã đóng băng trong snapshot, **không đọc bảng giá hiện tại để thay giá cũ**. Không dùng dữ liệu gói/khách đang sửa trên frontend.

Profile hỗ trợ chính sách tường minh:

- Đêm: giữ toàn bộ đêm đã chốt (KEEP) hoặc bỏ đêm chưa dùng (REMOVE), với minimumChargeNights được khai báo; giữ khoản nhận sớm; khoản trả muộn giữ hoặc tính lại trên ngày trả sớm theo lựa chọn đã duyệt.
- Giờ: giữ tiền thời lượng đã chốt hoặc tính lại block đã dùng theo chính RateRule trong snapshot; không tự hoàn một phần giá gói.

Các lựa chọn trên chưa có phê duyệt/dữ liệu thật. Policy thiếu lựa chọn trả EARLY_DEPARTURE_POLICY_MISSING, không mặc định hoàn các đêm chưa dùng.

Đầu ra gồm originalAccommodationTotalVnd, revisedAccommodationTotalVnd, changeVnd có dấu, creditEstimateVnd/additionalEstimateVnd và bảng kê. Đây chỉ là chênh lệch giá lưu trú; loại trừ thu/cọc/dịch vụ/minibar và thực hiện hoàn tiền. Không trả “đã hoàn tiền”, không sửa ngày trả của Stay.

## Định dạng chính sách và snapshot

`songlam.policy.v1` là **interface ứng dụng mới được đề xuất**, không phải định dạng RulesJson đã được xác nhận trên SQL. Parser đóng: các khóa/ngữ nghĩa chưa hỗ trợ bị từ chối. Muốn dùng phải có phê duyệt riêng cho nội dung/phiên bản và SHA-256 chính xác của RulesJson. Không tự dịch policy legacy hoặc kích hoạt các lựa chọn trong code làm mặc định.

Profile yêu cầu schema, moneyRounding, occupancy=INCLUDED_UP_TO_MAX, effectiveBasis (QUOTE_TIME/ARRIVAL_TIME), selection với order/priority/dayKindOrder/fallback. Phụ thu cần boundaryClock/earlyArrival/lateDeparture; gói giờ cần hourlyRateBasis; trả sớm cần earlyDeparture.nightly/hourly tương ứng. Chính sách phụ thu theo số khách ngoài profile này chưa hỗ trợ; không tự bỏ qua hoặc tự thêm phí trẻ em.

Báo giá trả kind=ESTIMATE, committed=false, quoteId, quotedAt, loại lưu trú, policy ID/code/version/hash, từng khoản theo phòng/nhóm và tổng. Snapshot ứng viên cho **một BookingRoom** gồm bản sao input rooms=1, hotel timezone/giờ chuẩn, RatePlan, PolicyVersion/RulesJson, RateRule, Calendar và nguồn/phiên bản lịch; không chỉ giữ ID liên kết bảng giá. Không chứa dữ liệu khách hàng, mật khẩu hoặc credential.

- Đêm: roomBaseVnd và từng dòng NIGHT dành cho BookingNightRate/QuotedTotalVnd; **không cộng phụ thu vào QuotedTotalVnd** vì sẽ trái kiểm tra 52103. Giai đoạn đặt/lưu trú sau phải xử lý phụ thu theo hợp đồng folio được duyệt riêng.
- Giờ: snapshot có thêm includedMinutes, extraMinutes, baseVnd, extraVnd ở cấp đầu đúng các trường kiểm tra 52104 đang đọc.
- Snapshot có engineVersion; trả sớm không diễn giải snapshot engine/format cũ chưa hỗ trợ bằng giá mới.
- SHA-256 là checksum nội dung, **không phải chữ ký xác thực**. G5 không được nhận snapshot từ trình duyệt rồi tin checksum; phải dùng kết quả do backend tin cậy tạo/kiểm tra và chốt trong transaction nghiệp vụ được duyệt. G4 không lưu snapshot ở SQL hoặc bộ nhớ như một cam kết giá.

## Hợp đồng SQL P1 còn chờ phê duyệt

Gateway `createPricingSqlGateway` không có manifest/pool vận hành mặc định. Không dùng Query theo SQL principal hoặc private helper cũ để lách actor. Chỉ nhận hợp đồng pms được duyệt cho đúng SongLamPms_Design/environment, `protocol=songlam.pricing.v1`, `actorMode=app-user-parameter` và danh sách operations.

Interface dự kiến, chưa phải thủ tục đã tồn tại:

- Input: AppUserId bigint từ G2, Mode, InputJson đã whitelist, QuotedAtUtc datetime2(3), RequestId.
- Output: duy nhất một dòng ContextJson, giới hạn 1 MiB; đọc nhất quán phòng/gói/chính sách/giá/lịch cần thiết, không chia trang thiếu quy tắc rồi chọn nhầm giá.
- Ngữ cảnh báo giá mới: schema=songlam.pricing.context.v1; hotel/roomType/ratePlan/policy, rules đầy đủ, calendar đầy đủ và calendarSource (id/version); ratesComplete/calendarComplete=true. Tiền/ID lớn là chuỗi chính xác, ngày/giờ chuẩn là chuỗi có định dạng.
- Trả sớm: schema=songlam.pricing.early.v1, stayId đúng request, stayStatus=IN_HOUSE, checkedInAtUtc/expectedOutAtUtc, snapshotStatus=COMMITTED, committedSnapshot đang có hiệu lực của Stay. SQL phải kiểm quyền/trạng thái lượt ở và đọc đúng snapshot sau các thay đổi đã chốt trước đó; không lấy “quote gần nhất” chưa được chốt.
- Manifest cần policyApprovals theo policyVersionId/version/rulesSha256/reference; calendarApprovals theo sourceId/version/reference; timeZoneMappings được duyệt. Cần giữ bằng chứng phê duyệt lịch sử để dùng snapshot cũ, không tự thay bằng policy mới.
- SQL vẫn kiểm AppUser active/quyền ngay khi đọc. Mỗi lời gọi là request pool riêng, tham số hóa, có timeout/cancel; không giữ actor trên connection, không cập nhật PrincipalBinding và không tự retry.

### Các điểm phải duyệt trước khi bật

| Mục | Cần xác nhận |
| --- | --- |
| G2/R1 | Đăng nhập/kho phiên/actor và hợp đồng catalog cho ba resource giá; quyền EXECUTE tối thiểu |
| P1 | Thủ tục đọc ngữ cảnh, signature/output/capabilities, môi trường kiểm thử và phạm vi quyền |
| P2 | Định dạng/ngữ nghĩa RulesJson, ưu tiên và fallback, cơ sở tính phụ thu, làm tròn, điều kiện trả sớm/số khách |
| P3 | Nguồn cuối tuần/ngày lễ và phiên bản lịch có phê duyệt; không tự tạo ngày lễ |
| P4 | Múi giờ thực tế, ánh xạ IANA và sự tương thích với validation SQL +7 hiện tại |
| P5 | Snapshot lịch sử thực tế và mapper legacy được kiểm chứng; snapshot thiếu dữ liệu thì báo lỗi, không bù bằng giá mới |

Server mặc định vẫn bị chặn tại G2; khi G2 đã sẵn sàng nhưng thiếu hợp đồng G4 trả PRICING_CONTRACT_NOT_APPROVED. Thiếu phê duyệt nội dung/lịch/ánh xạ trả POLICY_NOT_APPROVED/CALENDAR_NOT_APPROVED/TIMEZONE_MAPPING_NOT_APPROVED. Thiếu giá/quy tắc trả 422, xung đột 409, format chưa hỗ trợ 501, sai ngữ cảnh 502, SQL lỗi 503/timeout 504. Không dùng dữ liệu mẫu để trả thành công.

## Tệp tạo/sửa

- Tạo `backend/src/modules/pricing/validation.js`, `money.js`, `policy.js`, `engine.js`, `service.js`, `routes.js`.
- Tạo `backend/src/adapters/sql/pricing-gateway.js`.
- Mở rộng `backend/src/modules/catalog/resources.js`, `dto.js`, `routes.js` cho danh mục giá, giữ các resource G3 cũ.
- Sửa `backend/src/app.js`, `server.js`, `modules/status/readiness.js` để đăng ký G4 và phụ thuộc còn thiếu.
- Thêm tài liệu này, cập nhật `backend/README.md` và đầu `README.md`.

Không sửa code nghiệp vụ demo, bộ xác thực G2, tệp SQL, dependency hoặc bộ kiểm thử. Chưa chạy ứng dụng, syntax checker, test hoặc kiểm thử SQL trong lượt G4; rà soát tĩnh không phải nghiệm thu runtime hay chứng minh công thức đã khớp dữ liệu vận hành.
