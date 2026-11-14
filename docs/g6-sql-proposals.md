# G6 — hợp đồng SQL cần duyệt riêng

> Cập nhật 13/11/2026: code đã có `POST /stays/:id/price-change-preview` dùng chính G4 stay-change, commit gia hạn/trả sớm bắt buộc `acceptedProposalHash`. Hash chấp nhận bỏ thời điểm đọc nhưng giữ giá/chính sách/lý do/snapshot nguồn. SQL phải tự kiểm lại dưới khóa. Compiler có nhánh đề xuất Folio ROOM cùng lô check-in (`ATOMIC_ROOM_FOLIO_V1`), chỉ dùng khi policy và `checkInFolioCreationAtomic` được duyệt; ngữ cảnh SQL phải xác định booking/customer/phần phòng. Chưa áp dụng RPC/manifest G6 thật, chưa nghiệm thu SQL. Xem [trạng thái/phê duyệt tiếp theo](lifecycle-next-approval.md).

Chỉ là interface đề xuất cho code G6, không có migration/thực thi SQL. Chưa có bằng chứng phê duyệt các hợp đồng này. Yêu cầu viết code G6 không được dùng thay phê duyệt thủ tục, schema, quyền hoặc dữ liệu.

## Bằng chứng từ script, chưa phải live SQL

- `004_business_contract.sql`: CHECK_IN được update BookingRoom.Status, insert Stay/StayGuest/StayRoomSegment/FolioEntry. TRANSFER_ROOM được cắt/tạo allocation, đóng/mở segment với lý do. CHANGE_STAY được đổi interval/giá/snapshot booking và stay, sửa nightlyRates/allo, ghi CHARGE/CHARGE_CREDIT. Không có quyền tự hoàn tiền/đóng folio trong các operation này.
- `006_command_gateway.sql`: private command sở hữu transaction, khóa SongLam:Inventory, kiểm actor/quyền, rowversion và business state trước COMMIT. Public gateway lấy actor theo principal; không đủ cho pool chung nhiều nhân viên website. Các private helper không được cấp EXECUTE để lách caller binding.
- Source 52416 yêu cầu phòng sạch active, không maintenance tại lúc vào. Source 52108–52112 buộc Stay/BookingRoom/segment/allocation/khách chính đồng bộ và không trùng hiện diện. Index unique phòng/stay đang mở và Stay.BookingRoomId hỗ trợ chống nhận trùng.
- Source 52220 yêu cầu net ROOM charge bằng BookingRoom.QuotedTotalVnd; không thể bỏ bút toán phòng rồi báo đã nhận thành công. Folio phải OPEN và thuộc đúng phạm vi.
- Khi đóng segment, private gateway có side effect Room.CleanStatus=DIRTY và tạo tác vụ buồng phòng; wrapper G6 phải giữ hành vi này.
- StayRoomSegment **không có RowVer** trong schema. Không tự thêm cột hoặc giả version segment; cần kiểm ID segment hiện tại, tập segment/allocation và phiên bản liên quan dưới khóa.
- Giá ngày địa phương trong validation hiện có +7; cần đối chiếu timezone thật. Không dùng máy Node/giá demo để vượt mâu thuẫn múi giờ.

## C1 — đọc tổng hợp cho lễ tân

Interface songlam.stays.v1, operations list/detail/arrivals/readiness, actorMode app-user-parameter, EXECUTE hẹp cho service principal. Tên procedure chưa xác định.

Read nhận AppUserId, Operation, InputJson chuẩn hóa và RequestId; trả một dòng PayloadJson có DTO fields/metadata. Ngày giờ UTC phải chuẩn hóa rõ thành chuỗi có Z, IDs/money lớn là chuỗi chính xác. List có page offset/limit/total/hasMore, total/hasMore có thể null; lọc SQL trước phân trang.

- Stay: id/code/bookingId/bookingRoomId/status, checkedInAtUtc/expectedOutAtUtc/checkedOutAtUtc, version Stay và bookingRoomVersion. Detail cần pricing summary lấy từ snapshot đã lưu; roster chỉ cho quyền phù hợp, segment kèm allocationVersion thật.
- Arrivals: ngày địa phương explicit, booking/bookingRoom IDs/codes/versions, trạng thái HELD/CONFIRMED/IN_HOUSE, khoảng dự kiến và phòng dự kiến. Không coi tất cả arrivals là đã nhận; không lấy ngày máy chủ làm ngày khách sạn.
- Readiness: nguồn Room/vRoomStatus, version Room, allocation liên quan và conflict toàn khoảng. Ba trạng thái occupancy/cleanliness/exploitation độc lập. Kết quả chỉ advisory; không cấp quyền nhận phòng qua một boolean frontend.

Không mở rộng ma trận đọc để cho mọi role xem khách/tài chính. Các role có quyền ghi nhưng thiếu quyền đọc ngữ cảnh cần phân tích và trình riêng. Không tự cấp SELECT toàn bảng.

## C2 — prepare/commit nhận/chuyển/đổi thời gian nguyên tử

Manifest có protocol songlam.stays.v1, procedures read/prepare/commit, operations, policyApprovals id/hash/reference, giới hạn lô và guarantees được duyệt. Không có manifest/pool vận hành mặc định. Việc điền một flag true không phải bằng chứng hoặc thay thế phê duyệt.

Prepare chỉ đọc: actor/operation, canonical InputJson UTF-8, IdempotencyKey, IntentHash, RequestId. Nó kiểm actor/quyền trước replay; trả receipt đã commit hoặc context mới có actorId/operation/intentHash/replayed=false, policy id/hash, và:

- Check-in: booking id/version, checkedInAtUtc từ server, chargingMode, hourlyBillingAnchor nếu giờ, units đủ phần chọn. Mỗi unit có BookingRoom CONFIRMED/version/dates/adults/children/quotedRoomBaseVnd/ratePlanId/policyVersionId/pricingSnapshot; room trạng thái/version/type/capacity; allocation ID/version/time/bookingRoomId; open folio; guestRosterVerified; depositRequirement. Có thể có upgrade đã được phê duyệt.
- Thao tác Stay: stay IN_HOUSE với version/snapshot, bookingRoom với version/snapshot/nightlyRates, currentSegment chưa rời, currentAllocation cùng booking/phòng, effectiveAtUtc. Transfer thêm targetRoom; extend/shorten thêm folio và nguồn giá trước. Không tin body về active/clean/price/approval.

Commit nhận cùng intent/key, PreparedJson, Changes đầy đủ và PriceProofJson. Dưới một transaction khóa SongLam:Inventory phải:

1. Kiểm lại actor active/quyền, replay theo actor/operation/intent; khác intent trả conflict. Hash intent không gồm thời điểm, Stay.Code hoặc các quote sinh lại.
2. Kiểm version và **tập segment/allocation hiện tại**, kể cả điều kiện đang mở hoặc chưa có Stay. Không chỉ tin Stay.RowVer vì transfer có thể không sửa hàng Stay.
3. Check-in: revalidate phần đặt chưa nhận đã xác nhận, phòng trống/sạch/active, đúng hạng hoặc upgrade hợp lệ, đủ sức chứa, allocation đúng chủ và toàn khoảng không block/trùng; không nhận tương lai. Tạo tất cả phần chọn hoặc rollback, không success phần đầu của đoàn.
4. Chuyển: đóng segment cũ và allocation đúng mốc, mở allocation/segment mới liền mạch, giữ old/new room/history/lý do/audit. Phòng đích không xung đột cả tương lai. Side effect buồng phòng cũ và timeline cập nhật cùng transaction.
5. Gia hạn/shorten: revalidate toàn khoảng mới với các sự kiện quỹ/lịch, cả những đơn xuất hiện sau prepare; giữ ngày trả cũ nếu thất bại. Snapshot G4 nguồn phải còn đúng version/hash; kiểm net charges, credit limits, policy và calendar tại commit. Giữ actual segment mở đến G9, không tự giải phóng phòng hôm nay chỉ từ kế hoạch.
6. Không tạo current occupancy thứ hai hoặc đếm IN_HOUSE đồng thời trong reserved và occupied. Phần đoàn chưa nhận tiếp tục giữ đúng quỹ.
7. Lưu audit ActorId đúng nhân viên, before/after và lý do, approval nâng hạng, response idempotent trong cùng commit. Không sửa PrincipalBinding qua request, không SESSION_CONTEXT làm xác thực, không EXECUTE AS/REVERT rời trên pool.

Receipt phải SUCCEEDED/committed/atomic sau commit, match actor/intent, đủ phần chọn/Stay, dữ liệu mới và thông tin giá/history. Flags output chỉ là interface cần kiểm chứng, không tự chứng minh dữ liệu đã cập nhật. Timeout/transport error có thể đã commit: STAY_OUTCOME_UNKNOWN, replay cùng key; không tạo command mới hoặc báo thất bại chắc chắn.

Không bọc thêm transaction Node nếu SQL vẫn tự sở hữu và từ chối ambient transaction. Batch giữ 500 items/4.000.000 byte UTF-16 hoặc cap thấp hơn được duyệt; không thêm hidden mutation items hay tách đoàn để vượt giới hạn.

## C3 — folio, snapshot và cọc khi nhận

CHECK_IN hiện không có Folio insert trong MutationRule. Cần quyết định mở folio từ G5 hay một composite nhận phòng + mở folio được duyệt; không chạy mở folio rồi nhận bằng hai command và gọi nguyên tử. Code hiện yêu cầu folio OPEN đã có, nếu thiếu thì chặn.

Phí phòng là giá đã chốt, kiểm lại snapshot G4 v1 bằng frozen context, không đọc bảng giá mới để sửa đơn. Phụ thu nhận sớm chỉ POST_AGREED amount trong profile FROZEN_ROOM_AND_AGREED_EARLY_V1 được duyệt. Phụ thu trả muộn dự kiến để G9. Với hourly cần chốt BOOKED_INTERVAL hoặc có luồng sửa booking/giá được duyệt trước nhận; code không tự đổi mốc tính giờ/giá gói.

Cọc/guarantee bắt buộc chỉ thỏa từ giao dịch đã xác minh SUCCEEDED đúng scope. Pending, callback trình duyệt hoặc flag body không có giá trị xác nhận. G6 không tạo Payment/DepositMovement, không phân bổ cọc mới giữa các phần đoàn, không tự cấp collectPayment. Nếu nghiệp vụ đòi áp dụng cọc lúc nhận cần composite kế toán/quyền riêng; chưa thực hiện.

Snapshot legacy/có override/format khác cần mapper được kiểm chứng. Không “chuẩn hóa” dữ liệu đang có, tự thêm ngày/giá hoặc thay bằng quote hiện tại. Nâng hạng có tiền hoặc thiếu profile giá bị chặn.

## C4 — G4 đề xuất giá gia hạn/shorten

Interface mới songlam.pricing.stay-change.v1 trong lớp G4, không phải nguồn giá/bảng trạng thái mới. Chưa có procedure nào được chốt. Chỉ đọc, tham số AppUserId, InputJson (stayId, direction, versions, newExpectedOutAt, reason, sourceSnapshotHash), QuotedAtUtc, RequestId. Directions được manifest duyệt riêng.

Output một PayloadJson schema songlam.stay-price-change.v1 gồm:

- stayId/direction/stayVersion/bookingRoomVersion, beforeSnapshotHash đúng snapshot đã chốt.
- startsAtUtc/oldExpectedOutAtUtc/newExpectedOutAtUtc, stayType, roomTypeId/ratePlanId/policyVersionId, timeZoneId/IANA.
- before/after totals: roomBaseVnd, earlyArrivalVnd, lateDepartureEstimateVnd, earlyDeparturePenaltyVnd, accommodationEstimateVnd; before/after nightlyRates đủ ngày với date/priceVnd/rateRuleId. Hourly có beforeHourlyTerms/hourlyTerms (RateRuleId, includedMinutes/extraMinutes/baseVnd/extraVnd) giữ nguyên giá gói/block đã chốt.
- ledgerChanges đã tính theo policy: CHARGE/CHARGE_CREDIT, ROOM_PRICE_CHANGE/AGREED_EARLY_CHARGE/EARLY_DEPARTURE_PENALTY, amount, description và reversesEntryId nếu credit. Không có tiền thu/hoàn hoặc late surcharge của giá giờ. Late estimated fees không được hạch toán/thu ở G6.
- policyProofs id/version/hash, calendarProofs id/version được phê duyệt và nguồn Rule IDs; bao gồm policy gốc. Không có tỷ lệ, ngày lễ, mức giữ lại mặc định.

Lớp G4 kiểm tổng tiền nguyên VND, đủ mỗi NightDate, giữ giá/Rule ID các đêm còn lại, khớp ledger delta và minute-block formula; Stays chỉ map output vào changes. Nếu chưa có giá/không có policy cho phần bổ sung hoặc retention, trả lỗi; không tự tạo dữ liệu giả để đủ bảng kê.

Giữ tiền các đêm không dùng theo policy không có nghĩa giữ NightRate ngoài khoảng mới. Cần đưa phần tiền giữ lại thành phí/nghĩa vụ đúng category và tạo room credits/charges có liên kết, net ROOM vẫn bằng QuotedTotalVnd mới. NIGHTLY cùng ngày không thể dùng CHANGE_STAY để tạo 0 đêm do schema hiện tại; cần để G9 xử lý trả thực tế hoặc đề xuất mô hình khác riêng, không tự sửa CHECK/StayType.

G4 tạo JSON snapshot ứng viên songlam.stay.pricing.v1 có các giá đã quyết định, Rule IDs, policy/calendar refs, sourceSnapshotHash và lý do. Đây là format ứng dụng cần duyệt, **không phải thêm bảng/cột**. Bộ đọc/reprice G4 legacy v1 và G9 cần mapper cho format mới; không tự ép nó thành format khác. SQL audit phải giữ trước/sau đầy đủ; hash chỉ là checksum, không thay việc chốt/scope/caller tin cậy.

## C5 — approval đổi hạng và các luồng bổ sung

Khác hạng chỉ cho nếu SQL có approval đúng BookingRoom, phòng/hạng đích, trạng thái APPROVED, approving user, policy hash; transaction phải kiểm lại và lưu dấu vết. Profile ứng dụng hiện chỉ hỗ trợ priceEffect=NO_CHANGE đã duyệt. Nếu có tiền phải qua hợp đồng G4 chốt lại riêng; không lấy reason tự khai làm approval.

Walk-in (tạo booking + allocation + folio + check-in), nhận trước khoảng đã chốt, đổi gói/hạng có tiền, overstay/transfer sau khi allocation hết hạn, thêm khách phát sinh sau nhận và áp dụng cọc cần composite hoặc luồng được duyệt riêng; không làm các bước rời rồi báo thành công. Chưa viết chức năng giả cho các trường hợp đó.

## Điều kiện nghiệm thu chưa đạt

Chưa có approve/deploy/integration SQL mới. Trước khi bật phải chỉ định môi trường và phê duyệt đúng objects/EXECUTE/service principal cho C1–C5, phụ thuộc A1/A2/A3 và giá/booking trước. Không dùng db_owner/sysadmin/SELECT rộng. Cần test concurrent cùng pool, tranh một phòng, clean/block đổi giữa prepare/commit, nhóm nhận một phần, giá cũ sau đổi bảng giá, transfer segment liền mạch, extension gặp booking mới, shorten có penalty/credits, version stale, replay/timeout sau commit và actor audit. Theo yêu cầu, chưa tạo/chạy các test trong lượt này.
