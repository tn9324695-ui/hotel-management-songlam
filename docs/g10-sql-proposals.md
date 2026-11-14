# G10 — hợp đồng đọc/đối soát/quản trị cần duyệt

Ngày 09/11/2026. **Chỉ đề xuất; chưa thực thi SQL/migration, không đổi quyền, schema hoặc dữ liệu.** Không có bằng chứng phê duyệt gateway G10. Các protocol/flag dưới đây là interface code, không chứng minh SQL thật đã triển khai. Chưa viết/chạy kiểm thử.

## Bằng chứng từ repository

| Nguồn | Đã xác minh từ tệp | Chưa đủ |
| --- | --- | --- |
| 002 vCashFlowDaily | Payment SUCCEEDED, IN/OUT theo BusinessDate | Chưa chứng minh mọi noncash success có provider verification/allocation thật; không tự dùng status browser |
| 002 vSettledRevenueDaily | SUM StaySettlement.TotalAmountVnd và count theo BusinessDate | Không là revenue accrual từng đêm hoặc chính sách phí hủy; cần G9 reconciliation/snapshot linkage |
| 002 vFolioBalance | SUM SignedAmountVnd theo FolioId | Snapshot hiện tại; không đủ lifecycle hồi tố hoặc source provenance transfer/partial group nếu G9 còn thiếu |
| vRoomStatus/G7 đề xuất | Hiện diện, CleanStatus, IsActive/block theo khoảng | View gốc thiếu repair/hold sau bảo trì; không đủ cho readyRooms G7 |
| 001/006 account/role | AppUser/UserRole/AppRole/RolePermission/Permission; read systemConfig | Generic reader không phải projection user an toàn theo actor website; không được trả PasswordHash/ExternalSubject hoặc sessions |
| AuditLog/006 | Actor/Action/EntityType/Key/RequestId, Before/After/Reason/CreatedAt; quyền viewAuditLog | Không có outcome riêng; rollback/denied có thể không lưu row. Không suy tất cả failures có trong SQL hoặc trước/sau đều được phép xem |
| ExceptionCase/006 | OPEN/RESOLVED/REJECTED, Kind/CreatedBy/timestamps; manageCheckIn hoặc systemConfig đọc | Description/Resolution tự do có thể chứa bí mật; chưa có durable observer cho pending/missing-link/HTTP rejected |
| G2/G8/G9 docs | Chưa tìm thấy phê duyệt actor/pool/folio/reconciliation/clock/receipts | Không gọi private helper/gateway principal để lấy dữ liệu bằng quyền SQL cao hơn rồi giả đã có phân quyền website |

## R1 — RPC đọc theo actor, không quản trị ghi

Đề xuất `songlam.management.read.v1`, AppUserId chỉ từ G2. **Tên procedure/principal/module signing chưa chốt**. Manifest tin cậy sau phê duyệt gồm approved/approvalReference/database SongLamPms_Design/environment/testOnly/procedure/operations/limits/metrics/guarantees. Không env flag bật giả. Không trỏ usp_Query/usp_ReadResource/usp_ExecuteCommand/usp_ApplyCommand/private helpers, không SELECT bảng nền từ Node.

RPC nhận AppUserId bigint, Resource varchar(20), Operation varchar(24), InputJson nvarchar(max), RequestId nvarchar(80) là correlation (không tự ép header thành ApiRequest GUID). Tham số driver có kiểu, không ghép tên cột/query tùy ý. SQL xác minh caller/DB_NAME/active user/quyền hiện tại/cấp độ projection, giữ read-only. Không sửa PrincipalBinding, identity connection hoặc SESSION_CONTEXT qua pool.

Resources context/reports/users/roles/permissions/audit/exceptions; operations đúng routes G10. Giới hạn maxLimit<=200, maxRangeDays<=366 và nhỏ hơn nếu duyệt; input<=16KB UTF-16, output<=4MB, list con roleAssignments<=100. Lọc/phân quyền trước offset/limit, sort ổn định (ID hoặc timestamp+ID), không paginate trước rồi Node mới loại dữ liệu. DTO không trả trường SQL raw ngoài allowlist.

Một dòng PayloadJson trả resource/operation/asOfUtc, row/null hoặc rows/page={offset,limit,total,hasMore}. Total chính xác dạng chuỗi hoặc null, hasMore boolean/null. Quan hệ users:id roles/permissions và roles:id permissions trả parentId khớp request. Source JSON phải có null rõ ràng thay vì thiếu giá trị. Không fallback empty list khi chưa query được SQL.

Quyền giữ nguyên: users/roles/permissions systemConfig; audit viewAuditLog; exceptions manageCheckIn hoặc systemConfig; dashboard chỉ các metrics có quyền nguồn; cash/revenue viewDailyRevenue; receivable collectPayment. Nếu muốn viewDailyRevenue được xem aggregate nợ hiện tại mà không đọc toàn folio phải duyệt projection riêng, không tự mở trong G10.

Context clock tối thiểu dành cho actor có một quyền G10 hợp lệ, không cấp họ SELECT HotelSettings. Trả WorkingDate, nextBusinessDate, IANA timeZone, cutoffLocalTime/defaultFromUtc/defaultToUtc theo policy G9 đã duyệt, asOfUtc/policyReference. Không lấy giờ máy/UTC date làm business date, không dùng check-in/check-out time làm cutoff. User/role lists không bắt buộc clock để đọc khi contract riêng đã có.

## R2 — aggregate đã đối soát, không KPI đoán

Định nghĩa chính thức code `reports/definitions.js`, version SONGLAM_G10_V1. Mỗi metric có source/formula/recognition/cancellation/unit/basis/dependency; chỉ trả key người gọi được phép. Manifest metrics[key]={approved:true,reference,dependency} **sau phê duyệt nguồn thực**. SQL recheck metric-level permissions; không tin metricKeys như quyền do client tự khai. Request metricKeys chỉ do service đã lọc quyền G2 tạo.

Financial periods là SQL BusinessDate `[from,to)`, query input timeZone phải khớp clock source. SQL phải đọc clock/currentBusinessDate + aggregates trên snapshot nhất quán, không totals và rows ở hai thời điểm lệch. Period trả from/to/timeZone/interval/dateBasis=SQL_BUSINESS_DATE/currentBusinessDate, definitionsVersion, asOfUtc, reportReference, snapshotConsistent=true. Không đổi nghĩa doanh thu thành cash hay công nợ hiện tại thành phát sinh kỳ chọn.

Metric AVAILABLE chỉ khi raw.value là chuỗi nguyên, reconciled=true, dependency đúng và proof đủ: unlinkedSourceCount/unverifiedSuccessCount/unbalancedTransferCount/unbalancedSettlementCount đều '0' trong phạm vi của metric. Đây là kiểm tra nguồn phải thực hiện thật, không hằng số để lấp metadata. Metric không có dữ liệu nguồn đáng tin: status=UNAVAILABLE/value=null/reasonCode theo code (G9_LEDGER_SCOPE_MISSING, G9_VERIFICATION_MISSING, MISSING_SOURCE_LINKS, UNBALANCED_TRANSFERS, SETTLEMENT_SCOPE_MISSING, G7_ELIGIBILITY_MISSING, READ_CONTRACT_PENDING, CLOCK_POLICY_PENDING, SOURCE_RECONCILIATION_PENDING). Không truyền value=0 nếu chưa đối soát.

Aggregates trống thực sự sau query dùng COUNT/COALESCE SUM=0 và rows=[], metadata/period thật. Node không tạo số 0 khi pool/contract thiếu; nếu chỉ metric dependencies thiếu nhưng clock hợp lệ, API có thể trả UNAVAILABLE với rows=null. SQL timeout/lỗi là lỗi tải, không empty success. Kỳ có source anomalies phải đánh dấu thiếu hợp đồng/đối soát, không âm thầm bỏ giao dịch lỗi khỏi tổng rồi ghi AVAILABLE.

Tiền báo cáo SUM decimal(38,0)/chuỗi BigInt, không float, không USD. Daily rows theo BusinessDate cùng definitions/proof và tổng cho toàn scope, không chỉ trang. NetReceipts=receipts-refunds; revenue=sum unique settlement; receivable/current credit tách hai phía. Kiểm subtotal khi full dataset đã biết; không tạo tỷ lệ tăng trưởng/occupancy rate khi chưa có hợp đồng mẫu số/lịch sử.

Phụ thuộc cụ thể:

- Cash: G9 payment SUCCEEDED với allocations đúng, noncash verified integration/event thật; pending/refund request không là money movement. Deposit apply/transfer/credits không cộng thu lần hai.
- Revenue: StaySettlement snapshot net đúng G4–G9/source links, mỗi StayId một lần. Không tự cộng các dịch vụ/minibar raw lần nữa. Phí hủy/no-show, accrual/nightly revenue hay adjustment sau settle chưa có recognition policy thì không mở rộng chỉ số.
- Receivable: current SUM positive folio balances, customer credit separate, master/room sau transfer không double count; scope/booking/folio kind đúng quyền. Không filter theo CreatedAt/kỳ để loại nợ cũ; không cung cấp historical-as-of khi chưa có lifecycle đủ. Closed folio nonzero, missing payer/source, unbalanced transfer là anomaly cần chặn reconciliation, không sửa số để khớp.
- Rooms: occupancy theo open segments thực, ready theo G7 ROOM_ELIGIBILITY_V1 (không chỉ vRoomStatus cũ), dirty VACANT/DIRTY độc lập khai thác. Arrivals theo G5 effective hold/unreceived count, departures IN_HOUSE theo business date. Chọn kỳ quá khứ không biến room snapshot hiện tại thành lịch sử.

## R3 — user/role projection và audit an toàn

Users DTO whitelist id/username/fullName/active/createdAt/roleAssignments{id/code/name/active}; không email không cần thiết, hash/password/ExternalSubject, RowVer/securityVersion, session/cookie/token/CSRF. G10 profile nhân viên hiện tại cũng không trả CSRF/session fields. Role/permission metadata giữ bảng và mã quyền hiện có, không insert/cấp/tước/sửa quyền.

users:id/permissions phải hiệu lực giống G2: User active, Role active, UserRole + RolePermission; account inactive trả tập rỗng quyền hiệu lực. roles:id/permissions là cấu hình role, không tự coi role inactive có quyền runtime. Cần snapshot/projection read hợp lệ, không lấy role từ browser để ủy quyền. Cần g2EffectivePermissions=true sau chứng minh truy vấn dùng đúng mô hình.

Audit read chỉ actorId/kind/action/entityType/canonical entityKey/time/result/outcomeScope/reference/errorCode đã lọc. actorName chỉ thêm cho systemConfig; viewAuditLog thuần dùng actorId. Không trả BeforeJson/AfterJson/Reason/Description hoặc tùy chọn "xem raw" cho role thông thường. Quyền xem audit không đồng nghĩa được xem password/hash trong before/after.

SQL source phải phân biệt outcomeScope DATABASE_COMMIT, HTTP_REQUEST, UNKNOWN. Persisted AuditLog cùng transaction có thể chứng minh commit bằng ApiRequest/evidence, nhưng không có bằng chứng thì result UNKNOWN. HTTP thất bại không chứng minh Payment FAILED; timeout/receipt invalid của command có thể đã commit. Không tạo "SUCCEEDED" mặc định hoặc suy tất cả failures đều có trong AuditLog.

Lọc audit UTC `[fromUtc,toUtc)` và timeZone chỉ là múi giờ trình bày khớp hotel clock. Filter performedBy là ActorId của bản ghi được xem, khác AppUserId caller typed độc lập; không nới rejectClientActor để nhận actorId/role header/body. Các entity keys/references là canonical IDs/codes đã cho phép, không token/provider payload/username-password nhập trong URL/query.

## R4 — ngoại lệ dẫn xuất, hồ sơ và journal chưa có

ExceptionCase có status lifecycle khác outcome của thao tác nguồn. Chỉ trả controlled kind/status/actor/time/refs và thông điệp từ bảng mã; không phản hồi Description/Resolution tự do vì không có bộ lọc nào bảo đảm che hết bí mật tùy ý. Operational role chỉ thấy references đúng scope; refs tài chính cần systemConfig hoặc collectPayment, refs security cần systemConfig. Derived observations nhạy cảm phải loại trước pagination, không lọc Node làm total sai.

Danh sách hồ sơ EXCEPTION_CASE/PERSISTED_CASE khác observations DERIVED_OBSERVATION/DERIVED_NOT_PERSISTED. Đề xuất đọc dẫn xuất: Payment PENDING chưa đối soát, source link thiếu, request outcome có evidence, cọc tranh chấp. Chọn cột/key/time/actor thật; không coi mọi pending là giao dịch thất bại, không tạo exception revenue hoặc tự sửa nguồn thiếu. Màn quản trị chỉ đọc/đối chiếu, không resolve/reject case hay write audit.

Nguồn SQL hiện tại chưa bảo đảm lưu deny/rollback/HTTP errors: request có thể rollback cả ApiRequest/AuditLog. Middleware G10 chỉ ghi metadata đã lọc vào logger ứng dụng (clock APPLICATION_UTC, scope HTTP_REQUEST, actor từ G2 hoặc UNIDENTIFIED, operation allowlist/target numeric, request/status/code). Không body/query/header, secret/amount/SQL error string. Command5xx/OUTCOME_UNKNOWN được giữ UNKNOWN. Không dùng tài khoản admin giả làm CreatedBy khi chưa xác thực.

**Journal SQL bền vững còn phải duyệt riêng**: phương án append-only security/exception event ingestion/outbox có source event ID unique, kiểm caller, retention, actor nullable/UNIDENTIFIED được mô hình hóa, phân quyền đọc/che dữ liệu; kênh an toàn ngoài transaction đã rollback. Có thể map vào read projection hoặc Case được phê duyệt, không ghi Case tự động trong G10. Chưa chọn tên bảng/procedure, không tạo hoặc chạy SQL. Không tuyên bố logger console đã trở thành durable AuditLog; capabilities hiện durableRejectionJournal=false.

## Guarantees và phê duyệt

Manifest cần readOnly/actorAndRightsRechecked/boundedProjection. Reports/context thêm consistentSnapshot=true và businessClock=G9_CLOCK_V1. Users cần noCredentialOrSessionProjection; roles/permissions existingRoleModelOnly; users effective perms g2EffectivePermissions; audit sanitizedOutcomeProjection; exceptions scopedExceptionProjection. Mỗi metric dependency/reference phải được duyệt riêng, flags không thay kiểm chứng nguồn thật.

| Mục | Cần duyệt | Chưa duyệt thì |
| --- | --- | --- |
| R1 | RPC read/DTO/filter/paging/EXECUTE hẹp/actor G2/clock tối thiểu | Không gọi private/generic gateway hoặc tạo API dữ liệu giả |
| R2 | G5/G7 operational projections và G8–G9 verified financial/settlement/transfer provenance | Metric ẩn theo quyền hoặc UNAVAILABLE; không fill 0/KPI mẫu |
| R3 | User/role safe projection/effective rules, audit outcome và redaction | Không lộ credential/session hoặc raw before/after |
| R4 | Observation nguồn, append-only rejection ingestion/durability/retention và privacy scope | Chỉ app log đã lọc; không giả đã ghi SQL exception |
| Quyền mới (nếu cần) | Các nhu cầu aggregate/read context ngoài matrix hiện có phải xem xét riêng | Không tự thêm Permission/grant SQL hoặc đổi role |

Không triển khai mutation quản trị, không thay dữ liệu quyền, không chạy SQL hoặc kiểm thử trong G10. Code/report definitions không phải nghiệm thu dashboard SQL thật.
