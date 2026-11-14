# G8 — hợp đồng SQL/folio cần duyệt riêng

Ngày 09/11/2026. **Chỉ đề xuất; chưa áp dụng SQL, chưa có bằng chứng phê duyệt các mục dưới đây.** Chỉ đối chiếu script trong repository, không truy vấn SQL Server thật. Phê duyệt viết code G8 không thay thế phê duyệt schema/procedure/trigger/quyền/dữ liệu. A1–A3/kho phiên G2 và cổng đọc/ghi theo actor vẫn là phụ thuộc.

## Bằng chứng từ nguồn và khoảng thiếu

| Tệp `database/sqlserver/` | Đã xác minh | Khoảng thiếu/điểm cần xử lý |
| --- | --- | --- |
| `001_schema.sql` Service/ServiceOrder/Line | Service có PriceVnd decimal(19,0), RowVer; order OPEN/DELIVERED/CANCELLED có RowVer; line lưu Quantity decimal(12,3), UnitPriceVnd và AmountVnd=ROUND(Quantity*UnitPriceVnd,0) | Line không có RowVer, phiên bản catalog tại lúc chốt, thời điểm giao hoặc source loại dịch vụ/minibar trên header. Cần projection/lịch sử thật, không tự giả cột |
| `001_schema.sql` MinibarAudit/Line | Audit PENDING/CONFIRMED/DISPUTED có StayId/RoomId/CheckedBy/CheckedAtUtc/RowVer; line có số lượng nguyên >=0, PK(auditId,serviceId), ServiceOrderLineId nullable và unique khi có | Không có SegmentId, định danh chu kỳ/phạm vi kiểm, đơn giá/snapshot pending, dấu xác nhận không tiêu thụ. Token segment/phạm vi phải do SQL cấp, không browser tự tạo |
| `001_schema.sql` FolioEntry | StayId, FolioId, ServiceOrderLineId, ReversesEntryId; OperationKey unique với binary collation; unique ServiceOrderLineId; credit chỉ Kind=CHARGE_CREDIT, reference không tự trỏ chính mình | AmountVnd **>0**, không thể chèn phí/credit 0. Không có unique tổng tất cả credit cho một phí; cần khóa/kiểm sum remaining khi hủy |
| `004_business_contract.sql` | SERVICE: addServiceOrder; CANCEL_SERVICE: cancelServiceOrder; MINIBAR: manageHousekeepingTasks. OPEN→DELIVERED/CANCELLED, DELIVERED→CANCELLED; audit PENDING→CONFIRMED/DISPUTED, DISPUTED→CONFIRMED | Chưa có RPC pool theo actor được duyệt. Không mặc định cấp thêm quyền đọc folio cho housekeeping |
| `005_business_validation.sql` 52116–52119 | Audit confirmed tiêu thụ >0 phải liên kết line đã giao, cùng stay/service/quantity. Order phải có dòng; DELIVERED **và CANCELLED** đều đòi phí đúng bằng mỗi line; CANCELLED đòi credit đủ | Hủy OPEN chưa giao không có phí bị mâu thuẫn với 52118/52119. Dòng thành tiền 0 bị mâu thuẫn với AmountVnd>0; không tạo phí rồi credit giả để lách |
| `005_business_validation.sql` 52114–52115 | Kiểm minibar theo StayId/RoomId và CheckedAt>=segment.ArrivedAt; checkout cần audit confirmed cho các phòng đã ở | Không đủ để phân biệt hai lần vào cùng phòng, các chu kỳ kiểm hoặc stale audit. Cần policy coverage đúng segment và lần tiêu thụ trước G9 |
| `006_command_gateway.sql` 52417–52420 | Folio OPEN, Stay IN_HOUSE; service charge cần line; insert line buộc dịch vụ active/current unit price, MINIBAR buộc đúng Category | Không thể tự chèn giá snapshot audit cũ khi catalog đã đổi bằng gateway hiện tại; cần hợp đồng chốt snapshot được duyệt. Không dùng quyền override từ browser |
| `006_command_gateway.sql` read rules | Service: addServiceOrder hoặc manageHousekeepingTasks; ServiceOrder/Line: addServiceOrder hoặc manageCheckOut; Audit/Line: manageHousekeepingTasks hoặc manageCheckOut; Folio/Entry: collectPayment | Người buồng phòng có quyền MINIBAR nhưng không được đọc toàn bộ folio. Người có cancelServiceOrder có thể thiếu quyền đọc order; cần rà soát, chưa tự cấp |

Không dùng các tệp này làm chứng cứ rằng SQL thật đã triển khai. Không sửa các script trên trong G8.

## S1 — RPC đọc và ngữ cảnh folio tối thiểu

Protocol đề xuất `songlam.consumption.v1`, actorMode=app-user-parameter. **Tên procedure và principal chưa xác định.** Bootstrap tin cậy chỉ được cung cấp manifest sau duyệt: approved/reference/database SongLamPms_Design/environment/testOnly/procedures.read và command/operations/limits. Không gọi public principal gateway hoặc private helper để giả actor website.

RPC dùng tham số driver có kiểu: AppUserId bigint từ G2, Resource varchar(16)=orders/audits, Operation varchar(16), InputJson nvarchar(max), RequestId nvarchar(80); command thêm IdempotencyKey varchar(120), IntentHash varchar(64). Không actor/role/giá/số tiền từ browser. Một lô duy nhất tối đa `limits.maxLines` được duyệt (trần ứng dụng 125), page maxLimit<=200; InputJson<=32768 byte UTF-16, HTTP<=128KB, response<=2MB. RPC tự kiểm tổng mutation/byte bao gồm side effects và rollback cả lô nếu vượt; không tự chia lô. Giá trị fallback trong adapter không phải giới hạn SQL đã được duyệt và không bật supports().

Đọc có list/detail/catalog/context, phê duyệt riêng từng `resource:operation`. Một dòng PayloadJson chứa resource/operation/asOfUtc. List/catalog có rows + page {offset,limit,total,hasMore}, lọc trước phân trang, total chuỗi chính xác hoặc null, hasMore boolean hoặc null; sort ổn định. Detail có row/null. Context có context/null.

- Catalog orders chỉ dịch vụ ngoài MINIBAR, catalog audits chỉ Category=MINIBAR; DTO serviceId/code/name/category/unit/unitPriceVnd/version/active. Điều này giữ tiêu thụ minibar qua audit thay vì tạo hai đường ghi cùng một tiêu thụ. Định nghĩa này cần nằm trong hợp đồng được duyệt, không đổi role SQL hiện tại.
- Context chỉ stayId/stayCode/stayVersion/stayStatus=IN_HOUSE, folioId/folioVersion/folioStatus=OPEN. Audits thêm roomId/roomSegmentId/occupancyToken/inspectionScopeToken. SQL kiểm folio thực sự phục vụ đúng stay/booking, kể cả folio chung nhóm; không để actor chọn folio của khách khác. Không trả balance, payment/deposit, charge của stay khác hoặc hồ sơ khách không cần thiết.
- Không cấp collectPayment/SELECT FolioEntry cho housekeeping để làm context. Cần procedure projection có phạm vi hẹp dưới quyền module đã duyệt, EXECUTE giới hạn. Người được quyền thao tác không mặc nhiên được đọc toàn bộ subledger.
- Row và line DTO theo `modules/services/dto.js`: giá và tổng **của chính nguồn đó**, không phải dư nợ. Line chỉ trả charge của nó và các credit đảo đúng charge đó. Nested link set phải đầy đủ, không giấu/truncate credit; quá giới hạn projection trả lỗi thay vì số dư sai.
- Source MINIBAR của ServiceOrder phải suy từ quan hệ AuditLine → ServiceOrderLine bằng projection đúng; deliveredAtUtc/pricedAtUtc/serviceVersionAtPricing từ lịch sử/snapshot bền vững đã duyệt. Không lấy giá/RowVer hiện tại của Service để giả giá/phiên bản lịch sử.

Dữ liệu lịch sử chưa có snapshot/version/timestamp/segment/scope cần được đánh giá và đối chiếu riêng trước bật projection G8. Không backfill bằng catalog hiện tại hoặc suy segment chỉ từ RoomId; nếu không đủ chứng cứ phải báo chưa hỗ trợ ngữ cảnh đó. DTO hiện yêu cầu các trường provenance của hợp đồng mới, không tự biến bản ghi cũ thiếu metadata thành bản ghi đã được kiểm chứng. Không cập nhật dữ liệu lịch sử trong G8.

## S2 — request/giao/hủy dịch vụ nguyên tử và snapshot

1. Tạo request: kiểm actor active/addServiceOrder, stay đang ở, folio mở/thuộc stay, ngày nghiệp vụ mở. Kiểm từng service active, version đúng expectedServiceVersion, không MINIBAR; chốt UnitPriceVnd/Description/Quantity/Amount cùng order OPEN và lịch sử. Cột Quantity là decimal(12,3) nên không lấy số float JavaScript. Xác nhận tạo yêu cầu là thời điểm chốt giá; delivery sau đó không repricing theo catalog mới.
2. Giao: OPEN→DELIVERED, kiểm expectedVersion và tập line đã chốt, Stay/Folio còn hợp lệ. Tạo một CHARGE/SERVICE/StayId/FolioId/ServiceOrderLineId cho mỗi dòng thành tiền >0, giá đúng snapshot. Chuyển trạng thái, ghi thời điểm/người giao, audit và receipt cùng transaction. Không ghi phí khi order mới OPEN.
3. Hủy bắt buộc reason/actor, chỉ nguồn SERVICE trong G8. Nếu đã giao, giữ charge cũ, kiểm tổng credit hiện có dưới khóa và chỉ ghi **một credit cho phần còn chưa đảo** của từng phí; Kind=CHARGE_CREDIT, AmountVnd dương, ReversesEntryId trỏ phí gốc, cùng stay/folio, ServiceOrderLineId phải NULL theo CHECK hiện tại. Không xóa bút toán, không dùng amount âm, không tự hoàn tiền. Nếu đã được credit đủ thì không thêm credit trùng; lịch sử credit cũ phải giữ nguyên.
4. Hủy OPEN chưa giao: trạng thái CANCELLED và lý do, **không phí và không credit**. Cần điều chỉnh validation được duyệt để phân biệt chưa giao/đã giao; không tạo delivery/phí/credit giả. Tạm thời chưa có RPC này và adapter không bật cancel nếu thiếu openCancellationNoCharge.
5. Không hủy riêng order MINIBAR đang liên kết audit CONFIRMED: sẽ phá 52116. Nếu sau này cần sửa audit confirmed/hủy minibar phải duyệt command điều chỉnh audit+nguồn+credit nguyên tử riêng; G8 chưa mở đường này.
6. SQL recheck rowversion của order/stay/folio, ownership và trạng thái ngay trong transaction; line không có RowVer nên kiểm tập line/snapshot đầy đủ. Thay đổi business date hay close folio/G9 không được đua với delivery/cancel.

Đề xuất lưu phiên bản catalog lúc chốt/thời điểm giao trong event/snapshot bền vững hoặc cột được duyệt; lựa chọn vật lý chưa chốt. Không tự thêm bảng/cột. Giá các line đã tồn tại không lấy lại từ catalog trong get/deliver/cancel.

## S3 — minibar, segment, phạm vi kiểm và giá

- Tạo audit PENDING khi nhân viên đã kiểm thực tế; CheckedBy/CheckedAtUtc từ actor và giờ SQL. Lưu stay/room/segment thực sự, token provenance và giá chốt từng mặt hàng tại xác nhận tạo biên bản. Không backdate qua body, không suy stay theo số phòng hiện tại sau khách chuyển phòng.
- `occupancyToken` là compare token cho đúng segment và các mốc hiện diện; **StayRoomSegment không có RowVer**, không giả rowversion. `inspectionScopeToken` là định danh ổn định do SQL cấp cho một chu kỳ/phạm vi tiêu thụ thực tế, không là UUID browser. Cùng phạm vi không được tạo audit/phí lần hai dù đổi Idempotency-Key hoặc nhân viên khác. Khóa/unique trên phạm vi kiểm và từng dòng nguồn phải được thiết kế cùng policy; chưa tự đoán chu kỳ theo ngày hoặc số lượng tồn kho.
- Context phải trả đúng phạm vi đang xử lý cho segment, không tự mở chu kỳ mới chỉ vì người dùng bấm tạo. Khi có audit PENDING/DISPUTED cho phạm vi, làm việc trên audit đó; tạo lại khác key phải conflict hoặc trả receipt theo giao thức được duyệt. Các chu kỳ tiếp theo cần policy/điểm mở chu kỳ rõ ràng, không mặc định một audit vĩnh viễn cho toàn stay hoặc tự coi mọi lần bấm là tiêu thụ mới.
- Source Audit không có SegmentId/scope và AuditLine không có giá. Đề xuất bổ sung mapping/provenance/unique scope + snapshot giá và service version bền vững (cột hoặc metadata quan hệ có ràng buộc). Không nhét JSON vào Notes rồi coi đã có integrity. Chưa chốt đối tượng/tên/DDL; chưa áp dụng gì.
- Tạo audit không ghi phí. PENDING→DISPUTED cần reason và actor; PENDING/DISPUTED→CONFIRMED giữ nguyên counts/giá/segment/giờ kiểm, kiểm account/quyền/phiên bản/phạm vi chưa ghi phí. Chỉ manageHousekeepingTasks theo ma trận hiện có, không tự thêm quyền nghiệm thu vệ sinh hoặc quyền đọc số dư.
- Confirm nguyên tử: với mỗi consumedQuantity>0 tạo ServiceOrder/Line DELIVERED cùng stay, quantity bằng lượng tiêu thụ, giá snapshot, AuditLine.ServiceOrderLineId đúng; CHARGE dương đúng line khi amount>0; liên kết, trạng thái audit, audit log, receipt trong cùng transaction. Không gọi tuần tự createOrder rồi confirmAudit và báo thành công một phần. Khóa phạm vi, unique line nguồn và index FolioEntry.ServiceOrderLineId cùng chống phát sinh hai phí.
- Chốt giá audit tại create rồi confirm sau giá catalog đổi cần contract hỗ trợ giá snapshot hợp lệ tại insert line, thay vì generic 52420 buộc current price; chỉ snapshot được SQL xác minh, không quyền override giá qua API.
- Zero consumption: input xác nhận rõ zeroConsumptionConfirmed=true khi mọi consumedQuantity=0 hoặc lines rỗng. Audit vẫn được lưu và confirm; không tạo ServiceOrder rỗng, không chèn line quantity=0 vào ServiceOrderLine, không chèn FolioEntry 0. Dòng audit quantity 0 vẫn lưu đơn giá snapshot đã chốt nếu có dòng mặt hàng.
- Mặt hàng có giá 0 hoặc quantity lẻ làm tròn amount=0 vẫn phải lưu dòng tiêu thụ hợp lệ; chỉ miễn tạo entry tiền 0 theo policy `SOURCE_LINE_NO_LEDGER_V1` **sau duyệt**. Hiện validation 52118/52119 cần đối chiếu/điều chỉnh để chỉ yêu cầu charge/credit cho khoản dương; chưa áp dụng thay đổi.
- Không triển khai sửa counts/snapshot audit đã ghi trong G8; sai dữ liệu có thể ghi DISPUTED, cần quy trình điều chỉnh được duyệt riêng. Không xóa biên bản confirmed hoặc tạo audit mới để che lần ghi sai. G9 cần hợp đồng read coverage đủ mới quyết toán, không dùng UI checkbox thay chứng cứ SQL.

## S4 — chính xác một lần, transaction và receipt

Manifest command phải có guarantees: actorAndRightsRechecked/minimalFolioProjection/sourceProjection=CONSUMPTION_V1; atomicSourceAndLedger, optimisticVersions, stayAndFolioRechecked, catalogVersionsAtCreate, immutablePriceSnapshot, sourceLineUniqueCharge, auditActorAndReceiptAtomic, noCashOrCheckout, boundedAtomicLines, serverClock, openBusinessDay=true; inventoryLock=SongLam:Inventory; idempotency=ACTOR_RESOURCE_OPERATION_INTENT_SHA256; rounding=SQL_ROUND_POSITIVE_HALF_UP_0; zeroAmountHandling=SOURCE_LINE_NO_LEDGER_V1.

Audits thêm segmentProvenanceRechecked/minibarCategoryOnly/persistedAuditPrices/oneChargePerConsumption/inspectionCoverageAndLock=true. Cancel thêm linkedFullCredit/noIndependentMinibarCancellation/openCancellationNoCharge=true. Flag không thay bằng chứng duyệt/triển khai.

SQL dùng **cùng khóa/lock order SongLam:Inventory** với G5–G7 (hoặc hợp đồng khóa tương thích được duyệt, code hiện yêu cầu khóa chung này), kiểm actor/quyền, stay/folio/business day, snapshot/line set, số dư credit còn lại, scope và versions. Không set identity trên connection pool, không sửa PrincipalBinding hoặc EXECUTE AS/REVERT rời. Không transaction riêng trong Node bao quanh private gateway.

Một command trả một PayloadJson: committed=true, replayed, resource, operation, actorId, intentHash, idempotencyKey, contextBefore, before (null khi create), row sau ghi, event {actorId,atUtc,operation,reason}. `contextBefore` phải mang phiên bản/provenance thật trước commit; null field rõ ràng, IDs/tiền chuỗi, UTC có Z. Snapshot trước/sau phải đầy đủ/ổn định thứ tự; receipt không trả toàn folio. Giao/confirm tạo reference graph đúng line/stay/folio; cancel giữ charge và credit cũ, chỉ bổ sung đúng phần còn lại.

Khóa idempotency theo actor/resource/operation/key, digest SHA-256 canonical UTF-8 JSON {resource,operation,input}. Kiểm quyền hiện tại trước replay, cùng intent trả **receipt gốc** trong transaction, khác intent 409. Sau timeout giữ nguyên key/body để đối chiếu; không tạo UUID mới hoặc retry tự động. Receipt không được hết hạn trước cửa sổ retry mà cho phép tạo lại nguồn/phí. Index OperationKey và unique source line hiện có là lớp bảo vệ dữ liệu, không thay receipt/scope/CAS và transaction.

Lỗi hợp đồng: 229/52403→403; 52404→idempotency conflict; 52412/52417/52418/52420/52114–52119 và unique conflict→409. Chỉ phát sinh 4xx sau rollback hoặc trước ghi; không THROW như vậy sau COMMIT. Lỗi không rõ/timeout khi command có thể đã chạy→CONSUMPTION_OUTCOME_UNKNOWN, không báo success. Xác minh DB_NAME/caller thực tế và cấp EXECUTE hẹp; không db_owner/sysadmin/SELECT toàn bảng.

## Phê duyệt cần thiết

| Mục | Quyết định cần duyệt | Chưa duyệt thì |
| --- | --- | --- |
| S1 | RPC, principal/module security, projection context/link đồ thị tối thiểu, read/EXECUTE đúng quyền | API thật bị khóa; không tăng quyền đọc folio cho housekeeping |
| S2 | Snapshot catalog/lịch sử giao; hủy OPEN không phí; credit remaining và tránh cancel order minibar độc lập | Không giả hủy hoặc xóa/đổi lịch sử |
| S3 | Mapping audit-segment, phạm vi kiểm/cycle/token/unique, snapshot giá pending, policy 0đ và giá cũ | Không bảo đảm consumption một lần hoặc audit0đ bằng SQL thật |
| S4 | Receipt bền vững, CAS/source constraints/khóa, limits thực tế, G9 coverage/close barrier | Không tuyên bố chống trùng/transaction đã nghiệm thu |
| Quyền | Rà soát role thiếu đọc ngữ cảnh, cơ chế module được phép post ledger thay mặt MINIBAR/SERVICE, không cấp collectPayment hàng loạt | Giữ lỗi thiếu quyền; không lách bằng đọc toàn bảng |

Không có SQL/schema/trigger/procedure/quyền/dữ liệu nào được sửa trong lượt này. Không viết/chạy kiểm thử hoặc nghiệm thu SQL.
