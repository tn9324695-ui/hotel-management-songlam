# G5 — đề xuất hợp đồng SQL, chưa phê duyệt hoặc thực thi

Không có DDL/DML để thực thi trong tài liệu này. Không thay SQL, quyền hoặc dữ liệu. Chưa có phê duyệt riêng tìm thấy trong repository/lịch sử hiện có; các tên interface/protocol dưới đây chỉ là ứng dụng đề xuất, không phải thủ tục đã tồn tại.

## Những gì có trong script

1. `usp_ApplyCommand` riêng tư tự BEGIN/COMMIT, XACT_ABORT, gọi `usp_LockInventory`, kiểm actor/quyền, thực hiện toàn @Changes và AssertBusinessState trước commit. Nó có thể xử lý một batch đoàn cùng các ref trong phạm vi 500 items; không phải một hệ thống chỉ có JavaScript kiểm quỹ.
2. `usp_LockInventory` dùng khóa ứng dụng SongLam:Inventory, owner Transaction. `usp_AssertInventory` kiểm giao khoảng nửa mở của từng phòng/booking-room và sweep mốc sự kiện để chặn vượt quỹ, có cả booking chưa gán và block.
3. `vInventoryDemand` dùng HELD/CONFIRMED/IN_HOUSE; allocation thay thế nhu cầu chưa gán theo đoạn, không cộng thêm. Không có điều kiện tự loại HELD hết HoldExpiresAtUtc trong view; cần hợp đồng chuyển trạng thái/hết hạn nhất quán, không tự bỏ qua ở Node.
4. Public Query/ExecuteCommand lấy actor từ SQL principal/PrincipalBinding, không nhận nhân viên website. Không thể dùng một pool dịch vụ chung rồi tuyên bố audit là đúng từng nhân viên. Private helper đang bị DENY cho pms_executor; không gọi vòng qua.
5. Idempotency hiện so SHA2_256 trực tiếp @Changes. Dữ liệu G4 có quoteId/quotedAt và Booking.Code được sinh nên @Changes có thể khác giữa hai lần gửi cùng ý định. Không thể gắn key vào payload biến đổi rồi tự nhận replay chắc chắn đúng.
6. MutationRule BOOKING có các insert liên quan và ASSIGN_ROOM có allocation insert/update. CANCEL_BOOKING chỉ BookingRoom/RoomAllocation. Migration `008_cancellation_reason.sql` bổ sung lý do; chưa xác minh live đã áp dụng.
7. CANCEL_BOOKING hiện không có các dòng nghĩa vụ giữ cọc/chờ hoàn kết hợp trong cùng command. Không tự chạy REQUEST_REFUND/thu tiền/hoàn tiền rời rồi nói hủy nguyên tử; cần B3.
8. Giá đêm cổng hiện chọn Priority DESC, rồi DayKind, cuối tuần theo biểu thức thứ; giờ chọn Priority DESC/RateRuleId DESC. Nó chưa khớp mọi lựa chọn policy/calendar G4. Không tự thêm RateReason/overrideReason để bỏ qua chênh lệch.

Tất cả là bằng chứng từ script, không phải kiểm chứng server thật. Không có bằng chứng hợp đồng theo actor đã được phê duyệt nhưng chưa deploy; không tự chốt số lượng bảng, bản ghi hay quyền live.

## B1 — đọc quỹ/lịch/đơn theo khoảng và actor

Đề nghị một hợp đồng chỉ EXECUTE theo actor, dữ liệu tối thiểu, có các operation availability/timeline/list/detail. SQL kiểm user active/quyền, khóa/phạm vi dữ liệu phù hợp. Không SELECT toàn bảng hoặc cấp quyền đọc tài chính rộng.

- Quỹ: mỗi đêm theo roomTypeId và khoảng ngày địa phương [from,to), đủ ngày, xét toàn bộ các mốc timestamp có giao nhau trong cửa sổ đêm đã định nghĩa theo giờ khách sạn. Phân loại reservedUnreceived/occupied/blocked tại cùng mốc peak để tổng hợp không double count; không đếm riêng max của từng thành phần.
- Lịch: trả segment theo phòng/hạng, bao gồm unassigned và bảo trì; lọc overlap start < windowEnd AND end > windowStart. Đã nhận không còn một segment đặt phòng song song chồng lên segment lưu trú để nhân đôi nhu cầu. Không cho booking tương lai thành occupancy hôm nay.
- Danh sách/chi tiết: lọc phía SQL trước phân trang, ordering ổn định. Chi tiết trả version Booking, BookingRoom, tập allocation đang hiệu lực và versions, trạng thái, ngày/giờ, giá từ snapshot. Không join giá hiện tại để thay giá cũ.
- Finance của detail chỉ được project khi caller có collectPayment. Tóm tắt cọc riêng trong kết quả hủy cần quyết định cấp EXECUTE theo phạm vi nghiệp vụ, không đồng nghĩa cấp quyền đọc mọi tài chính.
- Metadata total/hasMore có thể null khi chưa có count chính xác; không bịa tổng từ số phần tử trang.

## B2 — chuẩn bị và commit một command nguyên tử

Adapter dự kiến `songlam.bookings.v1` có procedure read/prepare/commit riêng hoặc thủ tục được duyệt có signature tương ứng. Tên object chưa chốt. Manifest phải ghi căn cứ phê duyệt, đúng SongLamPms_Design/environment, actorMode app-user-parameter và operations.

Prepare phải chỉ đọc, không tạo booking/hold/request hoặc ghi dữ liệu phụ. Đầu vào gồm actor, operation, canonical InputJson, IdempotencyKey, IntentHash, RequestId. Nó kiểm quyền cả khi replay; có thể trả receipt cũ nếu cùng intent đã commit. Nếu chưa có, trả:

- actorId/operation/intentHash/replayed=false và policy id/hash đã được duyệt.
- Tạo: creation.status PENDING/CONFIRMED, mỗi lineKey có HELD/CONFIRMED, holdExpiresAtUtc và requiresVerifiedDeposit, accountingChanges=[] trong profile tạo booking-only hiện tại.
- Gán/hủy: booking id/version, rooms chưa nhận với id/roomTypeId/status/version/interval, allocations đầy đủ gồm id/roomId/bookingRoomId/version/isCancelled=false; gán có targetRoom id/type/active.
- Hủy: receivedRoomIds, depositSummary trước/sau theo nhóm tiền không trùng, cancellationAccountingComplete và đầy đủ accountingChanges nếu cần. Không tự lấy dữ liệu tài chính từ client.

Commit nhận cùng actor/operation/intent/key và thêm PreparedJson, toàn Changes, PriceProofsJson. SQL phải xem preparation là dữ liệu cần **tái kiểm tra**, không coi kết quả đọc hoặc boolean từ backend là chứng cứ quỹ còn đúng. Trong một transaction giữ SongLam:Inventory:

1. Kiểm actor active và quyền hiện tại, kiểm idempotency/intent dưới khóa.
2. Revalidate chính sách, hợp đồng/phiên bản G4, snapshot và tariff. Giá đổi/xung đột phải trả lỗi, không tự ghi giá khác hoặc tự dùng override.
3. Kiểm Booking/BookingRoom/allocation rowversions, tập phòng thuộc đơn và tập allocation (kể cả tập rỗng). Hủy toàn bộ phải tái đối chiếu đầy đủ tập chưa nhận/đã nhận, không bỏ sót phòng vừa thêm/thay đổi. Không chỉ dựa version Booking vì allocation hoặc tập con có thể đổi mà version header không đổi.
4. Xét quỹ cho toàn batch ở mọi mốc trong mọi khoảng yêu cầu, cộng nhu cầu các dòng cùng hạng giao nhau; chống hai nhân viên đặt vượt phòng.
5. Kiểm từng phòng dự kiến active, đúng hạng, không block/bảo trì/trùng booking hoặc assignment khác. Gán mới thay assignment cũ nguyên tử; không làm luồng chuyển phòng khách đang ở.
6. Kiểm khách/FK, mọi dòng giá từng đêm, expiry giữ phòng tại lúc ghi; ghi toàn bộ hoặc rollback, không trả created một phần.
7. Ghi trạng thái tổng hợp header từ trạng thái thực tế của các phòng, snapshot đã chốt khi CONFIRMED, audit đúng AppUserId và response idempotent trong cùng transaction.

Không cần Node bọc transaction ngoài nếu hợp đồng SQL vẫn tự sở hữu transaction và cấm ambient transaction. Không cập nhật PrincipalBinding hay gắn actor vào connection pool. Không nâng quyền db_owner/sysadmin.

Giới hạn cần xác nhận live và giữ nguyên/lower cap được duyệt: 500 mutation items và 4.000.000 byte UTF-16 cho Changes. Các dòng giữ cọc/chờ hoàn phụ trợ cũng phải có mặt trong batch đã đo; không tự thêm hidden mutation items. Trigger/audit tự động không đồng nghĩa giới hạn 500 dòng vật lý SQL. Nếu adapter khác layout hoặc cần Folio/DepositAccount/Customer bổ sung khi tạo thì phải đề xuất lại compiler/cost, không tự bỏ qua hoặc ghi lẻ.

## B3 — hủy và nghĩa vụ cọc, không chi tiền

Chốt cách xác định eligible chưa nhận và reason; từ chối hủy toàn bộ nếu có phòng IN_HOUSE/COMPLETED. Partial chỉ được động tới bookingRoomIds đã chọn.

Tóm tắt cần dùng tiền từ giao dịch SUCCEEDED đã xác minh và sổ tiền, không pending: collected = refunded + applied + retained + pendingRefund + remaining, các nhóm rời nhau. Phân bổ cho các phòng đã nhận phải bất biến trước/sau thao tác hủy. Không âm thầm dồn số cọc của phần hủy sang các phòng còn ở; toàn bộ đơn hủy phải có phân loại tiền còn lại rõ ràng.

Nếu cần ghi phí giữ lại hoặc tạo nghĩa vụ hoàn, phải kết hợp vào cùng transaction với hủy BookingRoom/allocation. Compiler hiện chỉ nhận các dòng do SQL chuẩn bị: RefundRequest insert Status=PENDING, hoặc FolioEntry insert Kind=CHARGE/Category=CANCELLATION, đúng account/payment/folio thuộc phạm vi đơn/phần hủy. Không Payment, DepositMovement hoặc refund COMPLETED. Cần phê duyệt riêng đối tượng, quyền hẹp và ngữ nghĩa kế toán; MutationRule CANCEL_BOOKING hiện không hỗ trợ tổ hợp này.

## B4 — replay theo ý định, xử lý trạng thái không xác định

Định nghĩa canonical JSON UTF-8 SHA-256 phải khớp `modules/bookings/intent.js`; không nhầm với HASHBYTES trên nvarchar UTF-16 của @Changes hiện tại. So intent của caller đã chuẩn hóa, không gồm payload G4 sinh mới. Cùng actor/operation/key khác intent trả conflict; cùng intent trả nguyên receipt trước, không tạo Booking mới hoặc chốt giá mới.

Không chỉ lookup trước transaction: hai request song song chưa thấy bản ghi vẫn phải có unique/lock và kết quả replay đúng khi vào commit. Receipt chỉ SUCCEEDED sau khi toàn bộ commit và audit hoàn tất, actor/hash/lineKey/IDs phải khớp, không success một phần.

SQL protocol trả một dòng PayloadJson. Receipt có actorId/operation/intentHash/status=SUCCEEDED/committed=true/atomic=true/inventoryCheckedUnderLock=true/replayed, operationId, booking projection, rooms và depositSummary; hủy cần CancellationReason từng phòng đúng reason đã ghi. Những cờ này là hợp đồng output phải kiểm chứng qua integration, không tự chứng minh transaction tồn tại.

Commit timeout hoặc lỗi đường truyền có thể đã commit. Không đổi key hay retry thành command mới. SQL phải cho phép gửi lại đúng key/intent để lấy kết quả sau khi hoàn tất, đồng thời vẫn kiểm quyền đã bị thu hồi. Endpoint tra cứu request riêng là đề xuất tiếp theo nếu cần, chưa giả lập trong lượt này.

## B5 — chuyển HELD sang CONFIRMED và tiền online

Trong source MutationRule hiện có chưa xác định command xác nhận đơn HELD hiện hữu đáp ứng snapshot G4/idempotency/cọc thật. G5 hiện tạo theo quyết định server: giá HELD là ước tính, CONFIRMED là giá chốt. Chưa có API xác nhận HELD riêng.

Nếu cần giữ giá lúc hold hoặc xác nhận online sau thu cọc, phải duyệt chính sách thời hạn/giữ giá, nguồn payment SUCCEEDED và command xác nhận cập nhật snapshot hoặc giữ đúng bản giá đã được thỏa thuận, trong transaction. Không tự coi HTTP callback/pending là tiền đã thu. Chưa tạo payment intent/webhook hoặc cọc thật trong G5.

## Điều kiện bật và nghiệm thu còn thiếu

Hiện không cung cấp manifest/pool/driver vận hành cho G5. Các guarantees trong constructor là yêu cầu của hợp đồng đề xuất, không phải phê duyệt và không phải test SQL. Không tự đặt true để bật triển khai.

Trước khi gọi G5 hoàn thành cần phê duyệt riêng B1–B5 phù hợp phạm vi, A1/A2/A3, R1/P1–P5 còn thiếu; chỉ định môi trường kiểm thử và xác minh thủ tục/quyền live. Sau đó phải kiểm thử tích hợp: hai actor cùng pool, hai đơn tranh phòng cuối, đoàn vượt batch/thiếu một guest/giá đổi/rollback giữa lô, block được tạo sau prepare, expiry hold, ngày nối tiếp, đặt trước một tháng, nhận một phần rồi hủy phần còn lại, replay cùng/different intent và timeout sau commit. Theo yêu cầu lượt này, chưa tạo/chạy các test đó.

Một số test G1 cũ đang giả định POST /api/v1/bookings chưa tồn tại và trả 404; G5 đã đăng ký route nên khi chưa cấu hình G2 nó trả 503. Kỳ vọng đó cần được rà soát trong lượt kiểm thử được yêu cầu sau này, không dùng báo cáo đạt của giai đoạn cũ làm kết quả kiểm thử G5.
