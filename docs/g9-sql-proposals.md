# G9 — đề xuất hợp đồng tài chính/checkout, chưa áp dụng

> Cập nhật 13/11/2026: người dùng đã chốt maker-checker (người tạo không tự duyệt, dùng `approveRefund` hiện có) và xử lý cọc/hủy/trả sớm từng trường hợp bởi quản lý; không tự giữ lại/hoàn. Đây là quyết định nghiệp vụ, chưa phải phê duyệt RPC/schema/quyền hay chi hoàn. Code receipt đã kiểm minibar 0đ và không thay biên bản/tiền sau preview, cùng linkage khi hủy đối trừ cọc. SQL G9 vẫn chưa áp dụng. Xem [phụ thuộc 17 và kết quả thực tế](lifecycle-next-approval.md), `deploy/lifecycle-policy-decisions.json`.

Ngày 09/11/2026. Không thực thi SQL, không migration/seed/import, không đổi bảng/procedure/trigger/quyền/dữ liệu. Không có bằng chứng phê duyệt RPC G9; phê duyệt code không là phê duyệt các thay đổi dưới đây. Cần môi trường và phạm vi đối tượng được duyệt riêng trước khi triển khai SQL/kiểm chứng.

## Bằng chứng nguồn (không phải live deployment)

| Script | Nội dung thực có | Chưa đủ / phải duyệt |
| --- | --- | --- |
| 001 schema, 002 views | Folio có ROOM/MASTER/INCIDENTAL, payer và RowVer; entry append-only source IDs, signed kinds, OperationKey unique; vFolioBalance=sum signed | Snapshot totals/source graph theo actor website, transfer provenance đến charge/stay và khóa sum remaining; không tự đọc toàn sổ cho housekeeping |
| 001 DepositAccount/Movement | Account không RowVer; kinds RECEIVE/REFUND/APPLY/UNAPPLY; linked payment/reversal, unique reverse và DepositMovement entry | Chưa có cặp phân bổ account→account với nguồn thu gốc. Không giả RECEIVE hoặc đổi balance trực tiếp |
| 001 Payment/ApiRequest | enum CASH/BANK_TRANSFER/VIETQR/VNPAY_QR/ONEPAY/POS_CARD; status; Payment.RequestId UNIQUE; ApiRequest unique(actor,operation,key), RequestHash/ResponseJson | Checkout có nhiều Payment không thể dùng một Payment.RequestId cho tất cả. Cần child requests trong transaction và receipt parent; không commit tuần tự |
| 004 Refund constraints | RefundRequest bổ sung FolioId/DepositAccountId XOR; Payment có RefundRequestId/unique; approveRefund, collectPayment | Source đặt ApprovedBy/At khi approve nhưng chưa chốt cấm người tạo tự duyệt. Chờ policy riêng; không suy phê duyệt từ tên role |
| 005 validations 522xx | Reserve refund theo original/allocation; cọc không âm; unapply đúng original amount; transfer đủ hai bên cùng booking; folio CLOSED phải zero; giá phòng net bằng quote | Cần bộ command compound/context/version chuẩn để giữ các điều kiện khi đồng thời; thiếu hợp đồng phân bổ cọc và nguồn chuyển nợ theo stay |
| 005 52114–52116, 52304–52305 | Minibar confirmed theo phòng/segment ArrivedAt, zero audit không buộc phí nếu không tiêu thụ; ca/ngày phải reconcile, không pending; variance cần note | Coverage đúng chu kỳ/segment/re-entry G8 chưa đủ, policy quick audit chưa duyệt. Clock/cutoff và closure proof theo website còn thiếu |
| 006 gateway | private owns transaction/inventory lock; cash ca phải đúng actor/current day; ngân hàng chưa verify chỉ PENDING; receipt chỉ nội bộ; close day outstanding=sum Balance>0 | Public Query/Execute dùng SQL principal, không là actor website trong pool. Không gọi private helper để lách; không SELECT/DML toàn bảng |
| HotelSettings/004 | WorkingDate từ BusinessDay; source timezone bị ràng buộc SE Asia Standard Time | Chưa có cutoff chốt ngày được duyệt. Không lấy giờ máy, giờ check-in/check-out hoặc mặc định nửa đêm làm cutoff |

## F1 — RPC và projection tài chính theo actor

Đề xuất `songlam.finance.v1`, actorMode=app-user-parameter. **Tên procedure, principal, module signing/ownership chain chưa xác định**, không có mặc định gọi thủ tục cũ. Manifest bootstrap tin cậy sau duyệt gồm approved/approvalReference/database SongLamPms_Design/environment/testOnly/procedures.read và command/operations/limits/policies/guarantees. Cấp EXECUTE hẹp đúng đối tượng, không db_owner/sysadmin, không cấp private gateway hay SELECT toàn bảng.

Tham số có kiểu: AppUserId bigint từ G2, Resource varchar(20), Operation varchar(24), InputJson nvarchar(max), RequestId nvarchar(80), PolicyContextJson nvarchar(max) từ manifest tin cậy. Command thêm IdempotencyKey varchar(120), IntentHash varchar(64). SQL phải xác minh DB_NAME/caller, account active/quyền hiện tại, từng quyền con của phương án, policy references thực tế; không chỉ tin JSON policy. Không cập nhật PrincipalBinding, SESSION_CONTEXT hoặc identity của connection dùng lại.

RequestId nvarchar(80) là correlation HTTP, không phải tự động `pms.ApiRequest.RequestId` uniqueidentifier. RPC phải tạo UUID nội bộ/child UUID đúng kiểu và liên kết correlation/audit/receipt, không ép một header tùy ý thành GUID hoặc tái dùng nó cho nhiều Payment.

Resources: folios/deposits/payments/refunds/checkouts/invoices/cashier/days. operations read list/detail/context/entries/movements/preview theo resource; command theo `modules/finance/model.js`. Manifest phê duyệt riêng mỗi resource:operation. Bộ lọc/phân trang được SQL xử lý trước limit, sort ổn định. MaxLimit<=200, maxLines<=125 là trần ứng dụng; phải chốt giới hạn command/mutation/byte thật và tính cả side effect, không chỉ số dòng client. Input JSON tối đa 65536 byte UTF-16, output tối đa4MB; không chia lô ghi tiền.

Đọc trả một PayloadJson: resource/operation/asOfUtc, row/null hoặc rows/page={offset,limit,total,hasMore}, context hoặc preview theo DTO. IDs/money chuỗi nguyên, date UTC ISO có Z và businessDate YYYY-MM-DD. Cần aggregate nhất quán toàn sổ, không chỉ tập đang phân trang; lineage/credit/reference graph phải đầy đủ hoặc lỗi chưa hỗ trợ, không giấu dòng làm số dư giả.

Quyền đọc giữ source: folio/deposit/payment/shift collectPayment; refund collectPayment hoặc approveRefund; invoice printVatInvoice; day viewDailyRevenue; checkout manageCheckOut với projection scoped của riêng stay, không cấp đọc folio toàn hệ thống. Commands đúng source: thu/cọc/transfer/hoàn yêu cầu/chi collectPayment; approve approveRefund; checkout manageCheckOut thêm collectPayment nếu có tiền/cọc/transfer; credit và close-day systemConfig; phiếu printVatInvoice. Không mở route G9 cho housekeeping chỉ vì được ghi minibar. Quyền đọc ngữ cảnh bị thiếu phải trình riêng, không tự cấp thêm.

## F2 — accounting và chuyển tiền/công nợ

Folio balance tuân Signs hiện có; totals trong DTO phải là sum đúng loại entry, số dư dương nợ/âm tiền có. Master cùng booking và có payer hợp lệ; transfer là hai entry TRANSFER_CREDIT từ nguồn/TRANSFER_DEBIT vào nhận, cùng TransferPairId, amount, actor/time; tổng signed zero. Khóa cả hai folio và provenance phân bổ charge/receivable chưa dùng; không vượt balance dương hoặc ghi hai lần. Phải lưu bản đồ nguồn charge/stay/amount → pair để group checkout/report không mất dấu vết; mutation rule TRANSFER_FOLIO hiện chưa cho StayId, không tự thêm qua body.

Cọc phải giữ RECEIVE/APPLY/UNAPPLY/REFUND và reservation theo original successful receipt/allocation. Apply có movement + một DEPOSIT_APPLY đúng folio/booking/kind; guarantee chỉ trong phần phòng của nó. Unapply trỏ originalApply, full amount, cùng account/folio, unique reversal; không sửa hay xóa lịch sử.

Phân bổ BOOKING cọc master→phần phòng cần đề xuất mở rộng DepositMovement ALLOCATE_OUT/ALLOCATE_IN, allocationPairId, counterparty và originalReceiveMovement provenance, constraints/index/view cân bằng. Code đã chừa DTO cho **enum/cột đề xuất này**, schema hiện tại chưa có nên API allocate bị gate PAIRED_APPEND_ONLY_V1. Mỗi nguồn thu gốc có cặp legs, một yêu cầu có thể nhiều cặp để giữ đầy đủ lineage khi account được thu nhiều lần; tất cả trong một transaction. Không tạo Payment/RECEIVE mới, không chuyển guarantee sang phòng khác, không tiêu phần reserved refund. Cần duyệt DDL/view/mutation/security riêng; không áp dụng trong G9.

Giữ nguyên phí đã chốt G4–G8. Điều chỉnh append CHARGE_CREDIT trỏ original charge, amount dương, đúng stay/category/folio và còn hạn mức. ROOM không điều chỉnh qua generic credit vì 52220; đổi giá phải đúng snapshot/command G6 khi còn được phép. Stay/ca/ngày đã chốt không được sửa để cân tổng. Không thêm surcharges/discount tỷ lệ tự đoán.

## F3 — thu tiền, hoàn, receipt và exactly-once

Cash: one Payment SUCCEEDED/IN, current open shift của actor, current BusinessDate mở. Allocation sum đúng full payment và đúng purpose; các entries/movements chỉ tạo khi payment SUCCEEDED. Noncash có trong enum chỉ PENDING, không ledger/cọc thực thu, không provider completion từ browser. Không có route webhook/mark-success trong G9. Muốn xác nhận ngân hàng thật phải duyệt hợp đồng provider/signature/event uniqueness, current open-day treatment và đối soát riêng.

Refund request chỉ original Payment SUCCEEDED/IN, folio/deposit allocation cụ thể cùng booking. Reserve sum PENDING/APPROVED/COMPLETED không quá original/allocation, available folio credit/cọc không bị tiêu hai lần. Khoản request chưa hoàn không là chi thực tế. Duyệt cần policy được duyệt; đề xuất DISTINCT_REQUESTER_APPROVER, không tự áp dụng quyền/seed role. Manifest policies.refundApproval={approved,reference,separation:DISTINCT_REQUESTER_APPROVER,cashPayoutAllowed:true/false}. Thiếu policy thì decide/complete khóa dù role có approveRefund. Reject cũng ghi quyết định/reason/audit, không đổi reason yêu cầu gốc.

Complete chỉ consume APPROVED request, CASH payout trong ca actor/ngày mở, một Payment OUT liên kết OriginalPaymentId/RefundRequestId, một allocation REFUND hợp lệ; request→COMPLETED trong cùng transaction. Không hỗ trợ ngân hàng chi thật hoặc duyệt ngầm trong checkout. UI/DTO không thể tự sửa status, role, actor, provider reference hoặc số tiền đã duyệt.

Một command cần transaction dưới cùng thứ tự khóa SongLam:Inventory + row locks và final validations. Idempotency theo actor/resource/operation/key, canonical UTF-8 SHA-256 {resource,operation,input}, binary key comparison. Kiểm quyền hiện tại trước replay, cùng key/intent trả **receipt gốc**, khác intent conflict. Commit nguồn/Payment/movement/entry/audit/response cùng transaction. Không cleanup receipts trong cửa sổ có thể retry rồi tạo lại tiền.

**Payment.RequestId UNIQUE:** checkout có cả cash in và nhiều cash refunds cần parent receipt và child ApiRequest/Payment request IDs duy nhất, deterministic scope theo parent/source. Mọi child cùng transaction parent, không ambient transaction Node/private helper vòng qua. Gate compoundPaymentRequestsAtomic; chưa có hợp đồng SQL này thì không chạy compound checkout. Không đổi unique hiện có khi chưa duyệt.

Receipt PayloadJson: committed/replayed/resource/operation/actorId/intentHash/idempotencyKey/contextBefore/before/row/effects/event. Effects là **các dòng mới** entries/movements/payments; refunds là các request được completed trong checkout (main refund ngoài checkout nằm ở row). Snapshot row/before theo DTO; biến động số dư, nguồn/cặp transfer/apply/credits, allocation sums và actor/time phải đối chiếu. Không gửi bí mật/session/provider raw payload vào API/log.

Các lỗi nghiệp vụ phải rollback toàn bộ trước trả 4xx, không THROW lỗi kiểu rollback sau COMMIT. Lỗi/timeout/receipt không đủ sau command → FINANCE_OUTCOME_UNKNOWN; không đoán thất bại để thu/chi lại. Proposed SQL 52501 deposit dispute, 52502 missing target, 52503 unresolved balance, 52504 checkout in progress, 52505 already-used source; **chưa phải error numbers đang có trên live SQL**. Existing 52404 idempotency mismatch, permission và 522xx/523xx/unique conflicts map an toàn. In-progress cùng parent key không tạo request thứ hai; chờ hoặc trả conflict để đối chiếu.

## F4 — checkout / preview chỉ đọc / minibar / master

Preview nhận contextToken, expectedVersion và kế hoạch cọc, CASH in, approved refund IDs, transfer master, quickMinibarSegments (nếu policy). Chỉ đọc, không ghi draft/thu/chi/audit0đ; trả before/after cost breakdown, master before/after, blockers và coverage đủ segment. Không repricing theo danh mục mới. Khoản PENDING, refund chưa duyệt, tranh chấp cọc, thiếu payer/target, source stale hoặc shortage giữ blocker.

Preview tokens phải có MAC/signature được module tin cậy kiểm, bind actor/subject/version/ledger/reservation/source-set/clock policy/expiry + planDigest. Token<=256 ký tự **không được giả là chứa toàn kế hoạch**: complete gửi lại planBody đã validate; SQL xác minh digest/signature rồi recheck mọi điều kiện. App không thực thi phí theo giá browser. Ca/ngày complete có các trường preview tương ứng (countedCash/current date/version), token cùng digest tương ứng. Không cache kế hoạch giả trong memory backend hoặc viết database khi nói preview chỉ đọc.

Replay receipt sau commit phải kiểm trước token expiry/folio closed/stay CHECKED_OUT, nếu không client timeout sẽ không lấy được kết quả gốc. Policy hiện hành vẫn phải được kiểm theo quyền gọi; receipt cũ là lịch sử, không tự sửa clock/source của receipt để khớp cấu hình mới.

Một checkout transaction phải kiểm quyền từng phần, IN_HOUSE/version/current segment, giá G4–G6 snapshot hash, các dòng G8/folio credits đã được link, minibar toàn phạm vi/chu kỳ kể cả re-entry. Confirmed audit0đ hợp lệ. Coverage thiếu không được bỏ qua; cần G8 mapping/scope hợp đồng đã duyệt. Nhanh0đ chỉ policy.quickMinibar approved/reference và quickZeroAuditAtomic, nhập explicit physical check với segment/occupancy/scope token. Không tự tạo audit từ checkbox “đã trả phòng”. Sau commit phải có audit CONFIRMED thật trong coverageAfter, không chỉ QUICK_PROPOSED. UI nhanh0đ chính thức còn khóa; G8 là đường xử lý hiện tại.

Commit toàn bộ các hiệu ứng cần thiết: nguồn thu/hoàn/cọc/transfer được phép, StaySettlement với giá đã chốt, segment/guests/Stay/BookingRoom, folio ROOM/INCIDENTAL zero→CLOSED, room hiện tại VACANT/DIRTY, task departure G7, audit/receipt. Không chạm occupancy của room lịch sử đang có khách khác. Nếu thất bại bất kỳ phần nào rollback cả lô, không checkout success một phần. Nếu cần refund mà chưa policy/approved request/ca phù hợp thì từ chối; không gọi complete refund tuần tự rồi checkout.

Master nhận công nợ giữ OPEN, balanceAfter=balanceBefore+transferred từ phòng đó; không bắt trả toàn bộ đoàn. Source room charges/master direct billing cần phân biệt: flow code hiện yêu cầu folio phòng có thể đóng; dữ liệu chỉ post trực tiếp vào MASTER phải trả blocker rõ và chờ contract scoped settlement riêng, không giả transfer mới/đóng master hoặc ghi lại charge. Cần phê duyệt đủ linkage/permission này trước khai báo hỗ trợ mọi hình thức đoàn.

## F5 — clock, ca, chốt ngày và phiếu

BusinessDate=HotelSettings.WorkingDate, không Date.now/browser date hoặc UTC date. TimeZoneId Windows source SE Asia Standard Time cần mapping IANA được duyệt (chưa tự coi dữ liệu thật đã xác minh); cutoffLocalTime/phạm vi được phép close cần policy businessClock approved/reference. Không lấy CheckInTime/CheckOutTime làm cutoff hoặc mặc định nửa đêm. DTO trả policyReference/timeZone/cutoff rõ; API đóng ngày khóa khi thiếu policy.

Shift open unique actor, OpeningCash là tiền đầu ca, không Payment/revenue. Shift preview tính ExpectedCash=OpeningCash+SUCCEEDED CASH IN−OUT và variance=counted−expected; counted do kiểm thực tế, notes khi lệch, không auto copy expected. Close recheck source/versions/current actor/open date, pending payments và snapshot dưới khóa. Không sửa Payment/old count để khớp. Ngoài tiền mặt pending không làm tăng tiền két; chốt ngày không được bỏ pending.

Command có dòng tiền mặt phải kiểm lượng tiền két hợp lệ không âm (`cashDrawerNonNegative`), không chi hoàn vượt tiền có trong ca rồi giả đã chi. Nếu cần bổ sung/rút float giữa ca phải có quy trình nguồn riêng được duyệt; G9 không tự chỉnh OpeningCash hoặc bỏ qua thiếu tiền mặt.

Close day đối chiếu vCashFlowDaily/vSettledRevenueDaily, mọi ca đủ điều kiện đóng/pending được xử lý, Outstanding=sum positive folio balance theo source. Đóng BusinessDay, immutable snapshot và audit, tạo ngày kế tiếp đúng policy và cập nhật WorkingDate **cùng transaction**. Không nhận giao dịch mới backdate vào ngày/ca đã CLOSED. Quy trình sửa sau chốt chưa duyệt, không mở API đó.

Receipt nội bộ cần unique InternalNumber, sourceType/sourceId (Payment/Refund/StaySettlement) và lineage/snapshot từ giao dịch thành công; Invoice schema có FolioId nhưng chưa có link Payment/Refund/Settlement rõ, đề xuất mapping/unique source hoặc event projection bền vững. Không tự giả phiếu đã có link nguồn. Buyer/tax/net/total chỉ từ nguồn/chính sách đã duyệt, không tự đặt VAT. Chỉ DocumentKind=RECEIPT và issue nội bộ; eInvoiceStatus=NOT_INTEGRATED, không tích hợp provider/ISSUED E_INVOICE hoặc adjustment sau quyết toán.

## Guarantees bắt buộc và danh sách cần duyệt

Manifest yêu cầu sourceGraph=FINANCE_GRAPH_V1, actorAndRightsRechecked/scopedFinancialProjection; command: atomicSourceLedgerAndReceipt, optimisticVersionsAndSetTokens, noDoubleAllocation, refundReservationsLocked, openShiftAndDayRechecked, immutableOriginalCharges, auditActorAtomic, noUnverifiedBankSuccess, noPostSettlementAdjustment, boundedAtomicMutations, serverClock=true; inventoryLock=SongLam:Inventory; idempotency=ACTOR_RESOURCE_OPERATION_INTENT_SHA256. Preview readOnlyPreview=true. Gate riêng transferPairAndSourceAllocation, depositAllocationJournal=PAIRED_APPEND_ONLY_V1, shiftCashReconciled, daySnapshotAndNextDayAtomic, internalReceiptSourceLinked. Checkout cần checkoutAtomicAllEffects/preserveG4G6Snapshot/g8SegmentCoverage/g7DirtyTaskAtomic/masterDebtPreserved/noHiddenMoneyEffects/compoundPaymentRequestsAtomic. Flags không thay bằng chứng phê duyệt/triển khai.

| Mục | Cần quyết định/phê duyệt | Chưa duyệt thì |
| --- | --- | --- |
| F1 | RPC/DTO/projection/quyền EXECUTE/actor G2 và quyền ngữ cảnh tối thiểu | Không kết nối tài chính thật; không cấp quyền rộng |
| F2 | Mapping transfer provenance, mở rộng cọc phân bổ/pairs/index/views, CAS set tokens | Không fake balance/RECEIVE hoặc chuyển không nguồn |
| F3 | Receipt durable/child ApiRequest/row locks/source allocations; policy maker-checker và cash payout | Không thu/hoàn lặp; approve/payout giữ khóa |
| F4 | Atomic checkout/G6–G8 coverage/quick0đ/master mapping và permissions | Không báo checkout một phần, không đóng master có nợ |
| F5 | Clock/cutoff, reconciliation shift/day/current date, receipt source map/unique | Không chốt/issue giả; khóa after-close adjustment |
| Ngân hàng / E-invoice | Provider/caller verification/event uniqueness và phát hành thật | Chỉ pending ngân hàng; eInvoice chưa tích hợp |

Chưa tạo migration tự chạy hoặc thực thi SQL nào. Không viết/chạy kiểm thử trong lượt G9; cần phê duyệt riêng môi trường/đối tượng để triển khai SQL và kiểm chứng sau này.
