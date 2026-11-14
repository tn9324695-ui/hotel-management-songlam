# G7 — đề xuất SQL và quyền, chưa phê duyệt/chưa áp dụng

Ngày: 08/11/2026. Tài liệu này là hợp đồng đề xuất cho code ứng dụng, **không phải migration đã chạy hoặc xác nhận SQL thật đã hỗ trợ**. Lượt G7 chỉ đọc tệp nguồn; không kết nối SQL, không DDL/DML/EXECUTE hoặc đổi quyền. Chưa tìm thấy bằng chứng phê duyệt hợp đồng actor G2, các hợp đồng G3–G6 hoặc các mục G7 dưới đây.

## Bằng chứng và khoảng thiếu

| Nguồn trong `database/sqlserver/` | Đã xác minh từ tệp | Thiếu/chưa xác minh |
| --- | --- | --- |
| `001_schema.sql`, HousekeepingTask | PENDING, IN_PROGRESS, INSPECTING, COMPLETED, CANCELLED; AssignedTo, InspectedBy, CreatedAtUtc, CompletedAtUtc, Notes, RowVer | Không có CLAIMED/BLOCKED, thời điểm nhận/bắt đầu/gửi kiểm tra, lý do không thể dọn hay bảng lịch sử tác vụ riêng |
| `001_schema.sql`, MaintenanceTicket | OPEN, IN_PROGRESS, RESOLVED, CANCELLED; Priority, Description, ReportedBy, AssignedTo, ResolvedAtUtc, RowVer | Không có phân loại chặn khai thác/không chặn, ghi chú tiến độ/đóng phiếu có cấu trúc, giữ kiểm tra sau sửa |
| `001_schema.sql`, RoomAllocation | Block dùng BookingRoomId NULL, TicketId, BlockReason, StartsAtUtc, EndsAtUtc, IsCancelled, CreatedBy, RowVer | Chưa có hợp đồng pool theo actor, phân trang lịch sử block, lý do kết thúc/hủy; không được dùng IsCancelled để xóa dấu vết block đã hiệu lực |
| `001_schema.sql`, LostFound | STORED, RETURNED, DISPOSED; FoundBy, FoundAtUtc, StorageLocation, ReturnedToCustomerId, ResolvedAtUtc, Notes | **Không có RowVer**; thiếu vị trí phát hiện riêng, người đang giữ và lịch sử bàn giao. Không được giả rowversion |
| `004_business_contract.sql` | Tên quyền CLEANING/manageHousekeepingTasks, updateCleanStatus; MAINTENANCE/reportMaintenance; BLOCK_ROOM/systemConfig; LOST_FOUND/manageHousekeepingTasks | Hợp đồng update LostFound không cho sửa StorageLocation; MaintenanceTicket không có notes/progress; chưa có quyền nghiệm thu riêng |
| `005_business_validation.sql`, `006_command_gateway.sql` | Hoàn tất tác vụ cần InspectedBy; CLEAN từ INSPECTING; đóng segment làm phòng DIRTY và tạo tác vụ; generic gateway có actor theo principal/khóa quỹ | Không được gọi private helper hoặc gateway theo principal để giả actor website. Mức triển khai trên SQL thật chưa xác minh |
| `vRoomStatus` trong schema | Ba chiều hiện diện/vệ sinh/khai thác riêng; khai thác dựa IsActive và block đang hiệu lực | Chưa phản ánh đủ sự cố chặn khai thác và giữ kiểm tra sau bảo trì khi block hết hạn |

## O1 — đọc và command vận hành theo actor

Đề xuất protocol `songlam.operations.v1`; **tên procedure chưa xác định**. Manifest do bootstrap tin cậy cung cấp sau phê duyệt, gồm approved, approvalReference, database=SongLamPms_Design, environment đúng môi trường, testOnly đúng, actorMode=app-user-parameter, procedures.read/command, operations và limits.maxLimit (1–200). Không có env flag bật giả. Không trỏ về usp_Query/usp_ReadResource/usp_ExecuteCommand/usp_ApplyCommand hoặc private helper.

Input RPC dùng tham số driver có kiểu: AppUserId bigint từ phiên G2; Resource varchar(16), Operation varchar(32), InputJson nvarchar(max), RequestId nvarchar(80). Command thêm IdempotencyKey varchar(120), IntentHash varchar(64). Giới hạn input 16.000 byte UTF-16, HTTP 16 KB; một thực thể mỗi request, không tự chia lô. Không gửi role hoặc actor từ browser.

Resource: tasks, rooms, tickets, blocks, items. Read Operation=list/detail/history; manifest `resource:read` phê duyệt cả ba projection và bộ lọc được mô tả trong validation. Command phê duyệt riêng từng `resource:action`; không suy quyền từ việc resource đọc được.

### Kết quả đọc

Một dòng/cột PayloadJson chứa resource, operation, asOfUtc chuẩn UTC, recordId cho detail/history. List/history chứa rows và page={offset,limit,total,hasMore}; total là chuỗi chính xác hoặc null, hasMore boolean hoặc null, lọc **trước** phân trang, sort ổn định theo ID hoặc (thời điểm, ID). Detail chứa row (null nếu không tồn tại). Không tự trả danh sách rỗng khi thiếu hợp đồng/quyền.

IDs là chuỗi số dương chính xác, version dạng 0x + 16 hex. Mọi timestamp có hậu tố Z, chuẩn hóa ISO millisecond khi đối chiếu input. Nullable phải là null rõ ràng. DTO ứng dụng whitelist, không trả đối tượng SQL thô.

Trường row theo `backend/src/modules/operations/dto.js`:

- rooms: id/number/version và ba trạng thái; eligibleForCheckIn/eligibilityReasons từ projection SQL chuẩn.
- tasks: id/version/roomId/stayId/taskType/status/assignedToId/inspectedById, mốc created/claimed/started/submitted/completed, unable=null hoặc {reason,actorId,atUtc}, notes, roomVersion và trạng thái phòng. CLAIMED là PENDING có AssignedTo, **không thêm enum SQL**. Các mốc không tồn tại phải được cấp từ sự kiện thật; không lấy CreatedAt làm thời điểm nhận việc.
- tickets: id/version/roomId/description/priority/status/reportedById/assignedToId/createdAtUtc/resolvedAtUtc/workMode/notes. workMode phải từ chính sách/sự kiện được duyệt, không đoán theo priority; UNDECIDED không được start.
- blocks: id/version/roomId/ticketId/startsAtUtc/endsAtUtc/reason/state/createdById. state SCHEDULED/ACTIVE/ENDED/CANCELLED suy từ dữ liệu và thời gian SQL; không là cột mới mặc định.
- items: id/stateToken/roomId/stayId/description/foundLocation/storageLocation/status/foundById/foundAtUtc/custodianId/returnedToCustomerId/resolvedAtUtc/notes. Người giữ lịch sử chưa xác định phải null, **không suy FoundBy là người giữ hiện tại**.
- history event: id/action/actorId/atUtc/fromState/toState/note/recipientEmployeeId/recipientCustomerId/storageLocation; projection chỉ của thực thể được phép đọc, không cấp xem toàn bộ AuditLog. Lịch sử bao gồm claim/assign/start/progress/submit/unable/resume/inspection/resolve/block/handovers/return.

### Command nguyên tử (không có prepare ghi dở dang)

Mỗi command một transaction SQL gồm kiểm tra actor còn active/quyền hiện tại, idempotency, state/version/ownership, toàn bộ cập nhật liên quan, AuditLog và sự kiện, receipt. Không đọc ở JavaScript rồi tự coi là khóa. Không ambient transaction Node; không cập nhật PrincipalBinding hoặc lưu actor trong SESSION_CONTEXT/connection dùng lại.

Receipt PayloadJson: committed=true, replayed boolean, actorId, resource, action, intentHash, idempotencyKey, before (row projection trước ghi; null khi tạo), row sau ghi và event. Replay phải trả **receipt gốc** sau kiểm lại danh tính/quyền, không tạo lịch sử hoặc đổi token lần nữa. Hash là SHA-256 UTF-8 của canonical JSON {resource,action,input}, khóa được scope theo actor/resource/action/key; cùng key khác input phải lỗi 409. Lưu receipt và mutation cùng commit. Không được cleanup receipt khi còn có thể retry mà tạo bản ghi lặp.

Task/room/ticket/block: kiểm expectedVersion, tạo version mới ngay cả thao tác chỉ thêm lịch sử. Items: expectedStateToken do SQL cấp theo **toàn bộ hàng + sự kiện custody cuối cùng**, compare-and-swap dưới khóa; không token do browser tự tạo hoặc chỉ hash một cột Status. Kiểm hiện trạng STORED và người giữ trước handoff/return; một món không trả hai lần, người nhận nhân viên phải active/khác người giao, khách nhận phải tồn tại. Token quá hạn/xung đột trả 409.

Các SQL error contract đề xuất tái dùng: 229/52403 cho thiếu quyền; 52404 cho key khác intent; 52412/52416/52427/51005/51006/52108/52109 cho version/state/lịch/room conflict. Phải xác nhận mapping trước bật manifest; lỗi không nhận diện/timeout khi command được gửi được coi kết quả chưa rõ, **không success**. Không trả SQL text/thông tin connection hoặc dữ liệu riêng vào message/log.

Các lỗi nghiệp vụ được map 4xx phải phát sinh trước ghi hoặc sau rollback toàn transaction; không THROW lỗi như vậy sau COMMIT. RPC phải xác minh đúng database/caller dịch vụ và không chỉ tin manifest Node. Receipt đối chiếu đủ before/after version/token, fromState/toState, actor, intent, key và note; task start/submit/reject phải có trạng thái vệ sinh tương ứng. Đây vẫn là yêu cầu cần triển khai và kiểm chứng sau phê duyệt, chưa là bảo đảm đã có trên SQL thật.

## O2 — lifecycle và event/custody

1. **Buồng phòng:** create → PENDING không AssignedTo; claim dùng điều kiện PENDING/AssignedTo NULL/RowVer, assign chỉ PENDING; start chỉ người được giao, chuyển IN_PROGRESS và Room.CLEANING; submit chỉ người đó, chuyển INSPECTING và Room.INSPECTING. Chỉ nghiệm thu độc lập mới COMPLETED/Room.CLEAN. Reject về IN_PROGRESS/CLEANING. Một active cleaning task cho một phòng; tác vụ kiểu INSPECTION thuần kiểm tra/luồng khác chỉ bật sau khi duyệt chính sách, không tự tạo cách đi tắt sang CLEAN. Không sửa Stay/current occupancy.
2. **Không thể dọn:** append sự kiện và giữ underlying trạng thái PENDING hoặc IN_PROGRESS, projection phase UNABLE; không giả một enum BLOCKED, không hủy task để lách. Bắt buộc lý do/actor/time. Resume chỉ đúng người giữ việc, xóa hold theo sự kiện mới; giữ lịch sử và trở về CLAIMED/CLEANING tương ứng. Điều kiện update recheck dưới khóa, không cho bỏ qua submit/inspection.
3. **Bảo trì:** create OPEN, claim/assign OPEN; start theo người được giao và workMode đã được duyệt; progress giữ IN_PROGRESS và ghi note/event/version; resolve chỉ người đó, RESOLVED/ResolvedAt. BLOCKING chỉ được thi công nếu block/điều kiện an toàn cùng phòng/toàn khoảng còn hợp lệ và không khách/lịch xung đột. Không tự chuyển thành NONBLOCKING hoặc hủy/chuyển khách để vượt conflict.
4. Resolve không CLEAN; công việc có ảnh hưởng vệ sinh cần Room.DIRTY và follow-up housekeeping + hold kiểm tra **cùng transaction**, theo chính sách được duyệt. Không tự đóng mọi block của phòng/ticket. Hết thời hạn block cũng không xóa hold hoặc coi repair đang mở là được khai thác. Internal side effect tạo task không đồng nghĩa cấp manageHousekeepingTasks cho người bảo trì; cơ chế cấp quyền module/side effect này phải được duyệt riêng.
5. **Đồ thất lạc:** create STORED, actor là người phát hiện/người giữ ban đầu; nếu ghi hộ người khác cần chính sách riêng, chưa có API giả danh. Handoff giữ STORED, ghi người giao=current actor, người nhận, vị trí mới/time/note, token mới; return chuyển RETURNED và ghi khách nhận/time/note. Không có dispose endpoint trong G7. Bản ghi cũ thiếu custody không được bàn giao/trả cho đến khi có đối chiếu được duyệt.

Đề xuất chọn **một** phương án được duyệt cho lịch sử: event tables chuyên biệt (task/ticket/block/custody) có FK, server timestamps, append-only, chỉ mục và CAS; hoặc mở rộng AuditLog có cấu trúc đủ các trường trên và projection/tính token đúng. Chưa chốt schema/cột/tên, chưa tạo bảng hoặc migration tự chạy. Không nhét JSON vào Notes rồi giả đã có ràng buộc. Thêm RowVer LostFound là phương án thay thế phải duyệt riêng; code hiện dùng token CAS để không tự giả cột.

## O3 — ROOM_ELIGIBILITY_V1 và block nguyên tử

- Canonical inventory vẫn là Room/RoomAllocation/BookingRoom/Stay/StayRoomSegment hiện có, không tạo nguồn phòng riêng trong Node/localStorage. Khoảng block [start,end), kiểm toàn khoảng và mọi đêm/khung giờ liên quan.
- Mọi thay đổi task/room/ticket/block ảnh hưởng phòng cùng thứ tự khóa `SongLam:Inventory` như G5–G6 và các row liên quan; không tạo lock namespace mới độc lập. Recheck CAS, quyền, room active, khách đang ở, allocation của đơn giữ phòng/ở khác trước ghi. Conflict trả rõ, rollback tất cả, không tự hủy booking/di chuyển stay hoặc commit ticket/block dở dang.
- Block create: BookingRoomId NULL, cùng RoomId với ticket nếu có, mốc end>start, reason, CreatedBy từ actor. Không cho block lùi vào khoảng khách đang ở/đã giữ hợp lệ. Quy tắc backdate/thời điểm hiệu lực cần duyệt, không tự đặt dung sai.
- Cancel chỉ block SCHEDULED và ghi reason/version/event; không dùng cancel trên block từng hiệu lực. End chỉ ACTIVE, set EndsAt theo UTC server > StartsAt, giữ khoảng lịch sử và reason; không đổi IsCancelled để xóa lịch. Giữ guard repair chưa resolve và hold sau repair khi end/cancel/expiry.
- Eligibility trả ba chiều độc lập, block đang hiệu lực/repair chặn/hold sau sửa. Bẩn không đồng nghĩa có khách, đặt tương lai không là đang ở; repair resolved không là CLEAN. Check-in còn phải kiểm toàn khoảng, allocation đúng chủ và phòng CLEAN/sạch nghiệm thu.
- G5 availability/timeline/create/assign và G6 readiness/check-in/transfer/extend phải tiêu thụ cùng read model và recheck tại commit; G3 rooms cũng không dùng vRoomStatus cũ để khẳng định khai thác. Code G7 thêm guard manifest `roomEligibility='ROOM_ELIGIBILITY_V1'` (G5/G6 trong guarantees; G3 trên manifest) và trả 503 khi thiếu. Đây là **chốt chặn**, chưa phải SQL đã tích hợp block/repair mới.

## O4 — nghiệm thu và quyền (không tự cấp)

Giữ tên quyền hiện có; server kiểm đủ mọi quyền cho một thao tác, ownership và trạng thái. Read tasks/items: manageHousekeepingTasks; rooms/blocks: viewRoomRack; tickets: reportMaintenance. Write task: manageHousekeepingTasks, thêm updateCleanStatus nếu đổi trạng thái vệ sinh; room mark-dirty: updateCleanStatus; ticket: reportMaintenance; block: systemConfig; item: manageHousekeepingTasks. Vai trò thiếu quyền đọc ngữ cảnh không được tự nâng quyền để UI chạy.

Nghiệm thu cần quyết định riêng: permissionCode chuyên biệt, vai trò được cấp, không tự nghiệm thu việc của mình, tiêu chuẩn nghiệm thu sau bảo trì và quan hệ Room/Task/hold. Manifest phải có inspectionAuthorization={approved:true,reference,permissionCode} và guarantee independentInspection=true **sau phê duyệt thực tế**. Hiện không cấp quyền, không seed permission và không bật nút chính thức.

## Guarantees bắt buộc cho manifest được duyệt

- Mọi read/write: actorAndRightsRechecked=true, historyProjection=OPERATIONS_EVENTS_V1, roomEligibility=ROOM_ELIGIBILITY_V1.
- Mọi command: atomicCommand, compareAndSwap, ownershipAndTransitionsRechecked, auditAndHistoryAtomic, noCashOrStayWrites, serverClock, noAutoCleanAfterRepair đều true; idempotency=ACTOR_OPERATION_INTENT_SHA256.
- Task/room/ticket/block: inventoryLock=SongLam:Inventory, inventoryConflictsRechecked, postRepairInspectionHold, housekeepingFollowupAtomic=true.
- Tasks: taskAndRoomAtomic/oneActiveCleaningTask=true. Items: custodyEventsAtomic=true, lostFoundCas=ROW_AND_LATEST_CUSTODY_TOKEN_V1. Inspection: independentInspection=true + phê duyệt quyền riêng.

Các flag không thay chứng cứ phê duyệt/triển khai. Chỉ cấp EXECUTE đối tượng cụ thể cho service principal sau duyệt; không db_owner/sysadmin, SELECT/DML toàn bảng, không cấp private gateway.

## Danh sách cần phê duyệt trước vận hành

| Mã | Quyết định/đối tượng cần duyệt | Ảnh hưởng nếu chưa duyệt |
| --- | --- | --- |
| O1 | RPC actor, projection đọc/lịch sử/phân trang/DTO/receipt và EXECUTE hẹp; A1–A3/kho phiên G2 | Không đăng nhập/vận hành SQL thật, API 503 |
| O2 | Schema hoặc projection event/custody/CAS; nhận việc, unable/resume, note tiến độ và lịch sử; xử lý dữ liệu cũ thiếu custody | Không ghi đầy đủ lifecycle/bàn giao, không giả bằng Notes |
| O3 | Quy tắc blocking/nonblocking, post-repair hold, follow-up task, block conflict và nâng hợp đồng G3/G5/G6 cùng khóa | Không được hứa quỹ phòng/check-in đã phản ánh đủ G7 |
| O4 | Quyền nghiệm thu riêng, vai trò/người được cấp, không tự nghiệm thu, release hold | Giữ INSPECTING, không CLEAN chính thức |
| O5 | Môi trường thử nghiệm và quyền ghi dành cho kiểm thử tích hợp sau này | Chưa kiểm chứng concurrency/idempotency/rollback/audit hoặc nghiệm thu G7 |

Không có thay đổi SQL hoặc quyền/dữ liệu nào được áp dụng trong lượt G7.
