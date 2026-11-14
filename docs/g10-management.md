# G10 — báo cáo và quản trị chỉ đọc

Ngày 09/11/2026. **Đã viết code; chưa nghiệm thu SQL thật.** Chưa viết/chạy kiểm thử, chưa chạy ứng dụng/browser/API hoặc truy vấn SQL. Không cài thư viện, thay SQL/quyền/mô hình role, sửa dữ liệu hoặc localStorage. Rà soát cú pháp bằng `node --check` trên 27 file JS liên quan (không thực thi module), `git diff --check` không báo lỗi khoảng trắng trên phần Git đang theo dõi; có cảnh báo LF/CRLF cũ ở README/run_suite. Đây không phải kiểm thử.

Đã đọc các điểm tích hợp G2, G8, G9 và SQL source 001/002/004/005/006. Không thấy AGENTS.md ở repo/đường dẫn cha đã kiểm tra. Các ghi chép/flag thiết kế không thay bằng chứng hợp đồng SQL đã được phê duyệt/triển khai. Server mặc định chưa có G2/pool/manifest vận hành thật; G10 không tự bật chúng.

## API (prefix `/api/v1`)

| Module | GET đã viết |
| --- | --- |
| reports | `/reports/context`, `/reports/capabilities`, `/reports/definitions?report=…`, `/reports/dashboard`, `/reports/receivables`, `/reports/cash-flow`, `/reports/revenue` |
| users | `/users`, `/users/:id`, `/users/:id/roles`, `/users/:id/permissions`, `/users/capabilities` |
| roles/permissions | `/roles`, `/roles/:id`, `/roles/:id/permissions`, `/roles/capabilities`; `/permissions`, `/permissions/:id`, `/permissions/capabilities` |
| audit | `/audit`, `/audit/:id`, `/audit/capabilities` |
| exceptions | `/exceptions`, `/exceptions/:id`, `/exceptions/observations`, `/exceptions/capabilities` |
| profile | `/admin/profile`: nhân viên hiện tại và điều hướng được backend cho phép; không CSRF/session/token/security version |

Mọi API dùng G2 authenticate, rejectClientActor và quyền từ actor đã xác minh. Không nhận quyền/actor từ browser. G10 không có command cấp quyền, sửa user/role, sửa/xóa audit, duyệt ngoại lệ hoặc thay đổi tiền; router quản trị từ chối thao tác ghi. Menu chỉ hiện theo capabilities backend.

List users/roles/permissions hỗ trợ q; users thêm active/roleCode, roles thêm active. Vai trò được gán khác quyền hiệu lực: `/users/:id/permissions` yêu cầu đúng quy tắc G2 User active + AppRole active + UserRole/RolePermission, không coi role inactive còn hiệu lực. Quyền cấu hình của role inactive vẫn có thể đọc để kiểm kê, không làm quyền đó thành quyền đăng nhập.

Audit/exceptions lọc `[fromUtc,toUtc)`, timeZone, performedBy, action, entityType/entityKey, result, reference; exceptions thêm status/kind. `performedBy` chỉ là bộ lọc nhân viên trong dữ liệu, **không là AppUserId ủy quyền SQL**. Không nới rejectClientActor G2 để cho browser truyền actorId. Lọc/phân quyền trước phân trang. Page limit<=200, period<=366 ngày hoặc giới hạn nhỏ hơn được duyệt.

## Bảng định nghĩa chỉ số

Định nghĩa thực thi nằm ở `backend/src/modules/reports/definitions.js`, version SONGLAM_G10_V1; API definitions chỉ trả các chỉ số người gọi được xem. Bảng dưới là các chỉ số đã viết, **không phải số liệu đã chạy/kiểm chứng**.

| Key / nhãn | Nguồn | Công thức | Ghi nhận / hủy, hoàn | Đơn vị |
| --- | --- | --- | --- | --- |
| occupiedRooms — Phòng đang có khách | Room/StayRoomSegment/Stay | DISTINCT phòng có segment mở, Stay IN_HOUSE | Snapshot SQL hiện tại; booking tương lai/hủy không là đang ở | Phòng |
| readyRooms — Phòng trống sạch đủ khai thác | G7 ROOM_ELIGIBILITY_V1 | VACANT+CLEAN+ACTIVE, không block/repair/hold kiểm tra | Snapshot hiện tại; trả phòng/sửa xong không tự sạch | Phòng |
| dirtyVacantRooms — Phòng trống bẩn | Room + hiện diện | VACANT và DIRTY, DISTINCT RoomId | Snapshot hiện tại; độc lập trạng thái khai thác | Phòng |
| arrivingRooms — Phần phòng đến chưa nhận | BookingRoom + G5 demand/hold | Phần chưa nhận còn giữ quỹ hợp lệ, arrival=WorkingDate | Ngày kinh doanh SQL; loại phần hủy/đã nhận/hold hết hiệu lực theo policy | Phần phòng |
| departingStays — Lượt dự kiến trả | Stay + hotel clock | IN_HOUSE, ngày trả dự kiến địa phương=WorkingDate | Ngày kinh doanh hiện hành; lấy shorten/extend đã commit | Lượt |
| receiptsVnd — Tiền đã nhận | Payment, G9 verification/allocation | SUM IN/SUCCEEDED đã đối soát | Payment.BusinessDate trong kỳ; pending/failed/cancelled không tính; cọc thu một lần | VND nguyên |
| refundsVnd — Tiền đã hoàn | Payment OUT + RefundRequest | SUM OUT/SUCCEEDED, nguồn hoàn hợp lệ | BusinessDate thực chi; yêu cầu/duyệt chưa chi không tính | VND nguyên |
| netReceiptsVnd — Thực thu ròng | vCashFlowDaily/G9 | receipts − refunds | Theo kỳ; có thể âm; không cộng lại apply/transfer/credit | VND nguyên có dấu |
| settledRevenueVnd — Doanh thu đã quyết toán | StaySettlement/G9 source graph | SUM TotalAmountVnd duy nhất theo StayId | BusinessDate quyết toán; đã net điều chỉnh hợp lệ trong snapshot; không phải tiền thu | VND nguyên |
| settledStays — Lượt đã quyết toán | StaySettlement + Stay | DISTINCT StayId đã CHECKED_OUT, đối soát | Kỳ quyết toán; booking hủy/chưa checkout không tính | Lượt |
| receivableVnd — Nợ dương hiện tại | FolioEntry/vFolioBalance/G9 | SUM MAX(Balance,0), mỗi folio đúng một lần | Snapshot hiện tại, không hồi tố; không cộng lại room đã transfer master | VND nguyên |
| customerCreditVnd — Tiền có của khách | vFolioBalance | SUM MAX(-Balance,0) tách khỏi nợ dương | Snapshot hiện tại; reserve hoàn chưa là chi, không bù nợ của khách khác | VND nguyên |

Doanh thu ở G10 là **doanh thu quyết toán theo StaySettlement**, không tự mở rộng thành doanh thu dồn tích theo đêm hoặc phí hủy/no-show chưa có chính sách ghi nhận riêng. Chi hoàn không tự trừ doanh thu; chỉ tác động dòng tiền/folio theo nguồn G9. Ngoại lệ không là doanh thu. Không đưa tiền cọc đã thu vào doanh thu; không coi đối trừ cọc/master transfer là thu mới.

Mỗi metric có AVAILABLE hoặc UNAVAILABLE, không mặc định giá trị thiếu thành 0. AVAILABLE chỉ khi read contract/dependency được duyệt và SQL trả proof reconciled, zero unmatched/unverified/unbalanced counts. SQL chưa đủ hợp đồng: value=null, reasonCode và “Chưa có dữ liệu đối soát”. Tài khoản thiếu quyền không nhận metric đó, không chỉ ẩn CSS. Lỗi SQL/timeout là lỗi tải, không giả unavailable/empty thành công.

Kết quả thật rỗng phải có aggregate 0/tập rỗng sau query thành công, kỳ/metadata thật; không tạo 0 ở Node khi pool/config thiếu. UI phân biệt rows=null chưa đối soát với rows=[] đọc thật không có bản ghi. Tổng phạm vi phải bao gồm toàn bộ dataset đã lọc, không chỉ trang hiện tại. Code kiểm đẳng thức thu−hoàn, kiểm sum khi biết đang nhận toàn bộ tập, kiểm folio dương/âm và uniqueness.

## Kỳ, clock và công nợ

Cash/revenue dùng `from`, `to`, `timeZone`, khoảng `[from,to)` theo **BusinessDate SQL**, không cắt timestamp UTC bằng ngày browser. Clock context phải từ G9 policy đã duyệt: WorkingDate, ngày tiếp theo, IANA mapping, cutoff, cửa sổ UTC mặc định và policy reference. Không tự mặc định midnight/Asia timezone hoặc lấy Date.now làm ngày kinh doanh.

Operational cards là snapshot hiện tại hoặc WorkingDate, không trở thành thống kê lịch sử khi chọn tháng trước. API/nhãn từng metric nêu basis. Receivables chỉ snapshot hiện tại, không lọc theo CreatedAt của folio/kỳ để làm mất nợ cũ; UI ẩn chọn kỳ cho màn công nợ và ghi rõ asOfUtc. Kỳ đi kèm chỉ là ngữ cảnh, không là số dư hồi tố. Historical as-of cần hợp đồng ledger lifecycle/status đầy đủ riêng.

Audit/exceptions dùng timestamp UTC rõ offset, backend chuẩn hóa ISO, UI hiển thị cả UTC và giờ khách sạn theo clock SQL. Các bảng cấu hình tài khoản/role không phụ thuộc clock tài chính để đọc nếu hợp đồng riêng đã có. Report snapshot có reportReference/asOfUtc/definitionsVersion; log/profile không trả dữ liệu phiên đăng nhập.

## Bảo mật và truy vết

- Users: id/username/fullName/active/createdAt/role assignments; roles/permissions chỉ metadata hiện có. Không PasswordHash, ExternalSubject, Email không cần thiết, RowVer/securityVersion, token, cookie hoặc payload đăng nhập.
- Audit: actorId/kind, action, canonical entity key, UTC, result và outcomeScope, reference/errorCode an toàn. actorName chỉ khi có systemConfig. UNKNOWN giữ nguyên nếu thiếu bằng chứng; không suy mọi row là thành công hay timeout là tiền thất bại.
- Không trả BeforeJson/AfterJson/Reason/Description/Resolution hoặc provider payload thô. Thông tin ngoại lệ dùng thông điệp theo kind được kiểm soát; tham chiếu tài chính/bảo mật được che theo quyền. SQL phải lọc observations nhạy cảm trước phân trang, không chỉ che frontend.
- Hồ sơ ExceptionCase khác quan sát dẫn xuất. `/exceptions/observations` là nguồn đọc đề xuất từ Payment pending, thiếu liên kết, outcome đã có; persistence=DERIVED_NOT_PERSISTED, không giả đã lưu case. Các source này không được đưa vào metric doanh thu.
- Middleware G10 ghi rejection HTTP đã lọc qua logger hiện có: actor từ G2 hoặc UNIDENTIFIED, operation allowlist, entityId nếu hợp lệ, UTC ứng dụng, request/status/error code. Không body/query/headers/secrets/amount. Kết quả HTTP ghi rõ scope; lỗi command 5xx/OUTCOME_UNKNOWN giữ UNKNOWN, không gắn FAILED vào giao dịch có thể đã commit.
- **Chưa ghi rejection vào SQL AuditLog/ExceptionCase**: ingestion/journal bền vững chưa được duyệt. Nguồn SQL hiện có không đủ lịch sử deny/rollback; không bịa event. Logger console/app không phải journal SQL đã nghiệm thu; capabilities durableRejectionJournal=false.

## Giao diện / file

`admin-api.html` dùng Tabler và HTTP client hiện có; dashboard, báo cáo kỳ, công nợ, users/roles/permissions, audit/ngoại lệ có filter/paging/detail/định nghĩa chỉ số. Không chart/growth/KPI mẫu. Menu/quyền từ backend. Màn tài khoản và nhật ký chỉ có thao tác đọc, không nút edit/grant/delete giả.

`js/app.js` và `js/pms-data.js` thêm guard data-pms-mode=api: mount controller API và formatter BigInt, thoát trước state demo/Store. Trang mới **không nạp data.js/store.js/pms-ui.js**, không export localStorage, không ghi kép. index.html giữ demo cục bộ có nhãn/link API rõ; login.html thêm link API, không kích hoạt đăng nhập giả hoặc thay G2. Các luồng demo/đặt/nhận/trả/thu tiền đang có không bị viết lại.

- Mới backend: `modules/reports/{definitions,dto,service,routes}.js`, `modules/management/{model,validation,dto,service,routes}.js`, routes/service `users`, `roles`, `audit`, `exceptions`; `exceptions/observations.js`, `adapters/sql/management-gateway.js`.
- Sửa backend: app đăng ký route/profile/page, readiness stage G10/phụ thuộc; error-handler chỉ thêm outcomeCode an toàn cho telemetry.
- Mới frontend: `admin-api.html`, `css/management.css`, `js/api/reports-api.js`, `js/api/administration-api.js`, `js/pages/admin-api.js`.
- Sửa frontend: `js/app.js`, `js/pms-data.js`, link index/login.
- Tài liệu: file này, `g10-sql-proposals.md`, README root/backend, source inventory và SQL proposal index.

Giữ cách chạy backend: từ `backend`, `node --env-file=.env.example src/server.js`; mở `/admin-api.html`. Đây là hướng dẫn, chưa chạy trong G10. Không cài dependency. Stage G10 ở health chỉ là phiên bản code; readiness vẫn chưa sẵn sàng. Xem [hợp đồng chờ duyệt](g10-sql-proposals.md).
