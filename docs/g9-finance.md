# G9 — tài chính và checkout

Ngày 09/11/2026. **Đã viết code ứng dụng, chưa nghiệm thu SQL thật.** Không viết/chạy kiểm thử, không chạy ứng dụng/trình duyệt, không kết nối/thay đổi SQL, không cấp quyền/cài thư viện hoặc sửa localStorage. Các kết quả kiểm thử trong tài liệu G0–G2 là lịch sử, không phải kết quả G9.

Rà soát tĩnh bằng `node --check` trên 27 file JavaScript liên quan; không thực thi module. `git diff --check` không báo lỗi khoảng trắng trên các file đang được theo dõi (chỉ cảnh báo LF/CRLF ở README/run_suite đã có). Đây không phải kiểm thử API/SQL/UI hoặc nghiệm thu nghiệp vụ tiền.

Đã đối chiếu kiến trúc G0–G8, G2 actor/CSRF/quyền, Stay/price snapshot G4–G6, departure housekeeping G7, source-line/folio G8 và SQL source 001/002/004/005/006. Không thấy AGENTS.md trong repo/đường dẫn cha được kiểm tra; chưa có bằng chứng phê duyệt RPC tài chính/actor hoặc policy mới. Không coi script trên đĩa là hợp đồng đã được triển khai trên SQL Server.

## API đã viết

Tất cả prefix dưới `/api/v1`; mỗi resource có GET danh sách, GET `/:id`, GET `/context`, GET `/capabilities`. Actor/quyền từ G2; context chỉ cấp theo quyền của command tương ứng. List có offset/limit và các filter được hợp đồng cho phép. Tiền/ID lớn là chuỗi chính xác, không float.

Filter theo resource: folio bookingId/status; cọc bookingId; payments bookingId/shiftId/businessDate/status; refunds/invoices status; checkout bookingId/stayId/status; ca/ngày businessDate/status. Màn hình sổ ca có liên kết sang các khoản thu/hoàn theo shiftId để đối chiếu actor/ca, không nhận actor ghi tiền từ filter.

| Module / prefix | API bổ sung |
| --- | --- |
| folios `/folios` | GET `/:id/entries`; POST `/:id/transfer`, `/:id/credit`, `/:id/close` |
| cọc thuộc folios `/deposit-accounts` | GET `/:id/movements`; POST `/:id/apply`, `/:id/unapply`, `/:id/allocate` |
| payments `/payments` | POST `/` (tiền mặt hoặc khoản ngoài tiền mặt PENDING); POST `/:id/cancel` (chỉ khoản ngoài tiền mặt đang pending) |
| refunds `/refunds` | POST `/` yêu cầu hoàn; POST `/:id/decide` (duyệt/từ chối); POST `/:id/complete` chi hoàn tiền mặt đã duyệt |
| checkout `/checkouts` | POST `/:stayId/preview` chỉ đọc; POST `/:stayId/complete` quyết toán nguyên tử |
| invoices `/invoices` | POST `/` tạo phiếu nội bộ DRAFT theo nguồn; POST `/:id/issue` phát hành phiếu nội bộ |
| cashier `/cashier/shifts` | POST `/` mở ca; POST `/:id/preview` chỉ đọc đối soát; POST `/:id/close` chốt ca |
| business-days `/finance/business-days` | POST `/:date/preview` chỉ đọc; POST `/:date/close` đóng ngày và mở ngày kế tiếp nguyên tử |

Prefix ngày tài chính tách khỏi `/api/v1/business-days` của danh mục G3 để không che route cũ. Ngày kinh doanh là key YYYY-MM-DD của SQL, không phải ngày máy Node/browser.

Mọi POST dùng Origin/CSRF/JSON. Command ghi thêm Idempotency-Key; preview chỉ đọc không tạo giao dịch/biên bản/receipt tiền. `contextToken` bảo vệ phiên bản/tập bút toán có liên quan; expectedVersion chỉ dùng bảng thật có RowVer. DepositAccount không có RowVer, không giả version: context/state token so tập movements/reservations.

## Định nghĩa đối soát

**Folio:** balance = CHARGE − CHARGE_CREDIT − PAYMENT + REFUND − DEPOSIT_APPLY + DEPOSIT_UNAPPLY + TRANSFER_DEBIT − TRANSFER_CREDIT. Dương là khách còn nợ, âm là tiền có của khách, zero mới đủ điều kiện đóng nếu không còn blocker. Snapshot tổng hợp phải được SQL đọc nhất quán trên toàn sổ, không cộng riêng một trang entries để làm số dư.

**Master:** cùng công thức, trong đúng booking/payer của đoàn. Chuyển công nợ từ phòng sang master tạo TRANSFER_CREDIT giảm nợ phòng và TRANSFER_DEBIT tăng nợ master, cùng pair/transaction, nguồn phân bổ được lưu; không tạo Payment hoặc tính lại doanh thu. Checkout một phòng chỉ đóng phần folio phòng đã xử lý, giữ master OPEN và công nợ các phòng khác. Flow hiện yêu cầu folio ROOM/INCIDENTAL của phần phòng; tình huống lịch sử chỉ hạch toán trực tiếp lên master cần hợp đồng scope riêng, không giả chuyển nợ hoặc ép đóng master.

**Cọc:** balance = RECEIVE + UNAPPLY + ALLOCATE_IN − APPLY − REFUND − ALLOCATE_OUT. Available = balance − khoản đang giữ cho refund PENDING/APPROVED. Hai kind ALLOCATE_* là **đề xuất mở rộng chưa được áp dụng**; không giả RECEIVE/PAYMENT mới để phân bổ. Cọc bảo đảm không tự chuyển sang phòng khác. Apply/unapply có DepositMovement và entry folio cùng nguồn; unapply đảo đầy đủ đúng lần apply, không sửa balance trực tiếp.

**Tiền thực thu:** tổng Payment SUCCEEDED/IN; chi hoàn là SUCCEEDED/OUT, thực thu ròng = IN − OUT trên ngày kinh doanh tương ứng. PENDING/FAILED/CANCELLED không đóng góp. Không cộng cọc lần hai khi apply, không cộng transfer/credit/phát hành phiếu vào thực thu. Tiền mặt ca = OpeningCash + SUCCEEDED CASH IN − SUCCEEDED CASH OUT; chênh lệch = counted − expected. Doanh thu quyết toán từ StaySettlement khác thời điểm dòng tiền; outstanding cuối ngày là tổng các folio có Balance>0 theo source 006, không lấy tiền có của khách khác để bù nợ.

**Checkout:** phòng/dịch vụ khác/minibar/phụ thu là net theo nguồn đã chốt, giảm trừ tính riêng đúng một lần. Before/after tính thêm cọc net đã apply, thanh toán đã nhận, refund thực chi và transfer. Khi complete, phòng đang trả hết số dư phạm vi của nó; master có thể còn nợ hợp lệ. Biên bản confirmed amount0 là hợp lệ, không cần phí 0. Thiếu/disputed/coverage không đủ thì blocker, không bỏ qua.

## Luồng ứng dụng

- Thu tiền mặt chỉ vào ca của actor đang mở/ngày đang mở; nhận đúng một Payment và phân bổ toàn bộ amount vào folio hoặc cọc phù hợp purpose. Phương thức ngoài tiền mặt có trong enum SQL chỉ tạo PENDING, không entry/movement hoặc tự coi là tiền đã thu. Không có callback xác nhận ngân hàng giả.
- Refund request trỏ khoản thu gốc thành công và đúng phân bổ folio/cọc, reserve tiền dưới khóa. Quy tắc maker/checker chưa được duyệt thì decide/complete khóa. Code đã có gate policy độc lập, quyền approveRefund/collectPayment hiện có và kiểm người duyệt khác requester theo policy đề xuất, không tự cấp quyền.
- Preview checkout nhận phương án cọc, thu thêm CASH, các refund request đã duyệt và chuyển master. Backend kiểm quyền cho từng thành phần. Preview trả planBody chuẩn hóa, planDigest, previewToken và bảng đối soát SQL; complete gửi lại chính plan đó và token. Không tạo ledger/thu tiền trong preview, không đọc lại giá catalog hoặc dựng công thức giá phòng G9.
- Token preview phải được hợp đồng SQL xác minh MAC/signature + plan/context/version/expiry; client giữ plan đầy đủ, không cần SQL ghi draft trong bước chỉ đọc. Commit recheck tất cả dưới transaction. Replay receipt phải thực hiện trước kiểm token hết hạn/trạng thái sau checkout để retry sau commit vẫn lấy kết quả gốc.
- Checkout complete dùng một RPC nguyên tử cho settlement, tiền/cọc/credit/transfer được phép, đóng stay/segment/guest/BookingRoom, folio phòng, room VACANT/DIRTY và task dọn. Không mark CLEAN, không ảnh hưởng phòng lịch sử đã có khách khác sau chuyển phòng, không đóng master có nợ. Receipt đối chiếu snapshot hash trước/sau, graph tiền/nguồn và biên bản confirmed sau commit.
- Không có biên bản: API có payload quickMinibarSegments nhưng mặc định khóa policy. Giao diện hiện hướng sang G8; **chưa có biểu mẫu xác nhận nhanh chính thức**, không tự tạo biên bản 0đ. Khi duyệt cần scope/token kiểm thực tế, command atomic và coverage sau commit.
- Chốt ca có preview kiểm đếm, pending payments và discrepancy; source yêu cầu notes khi chênh. Chốt ngày preview các điều kiện, close chỉ một transaction cùng snapshot và ngày mới/WorkingDate. Không tự chỉnh Payment hay số kiểm đếm để làm đẹp tổng, không sửa ngày/ca cũ đã chốt.
- Phiếu có InternalNumber unique và tham chiếu nguồn Payment/Refund/StaySettlement. Chỉ RECEIPT nội bộ DRAFT/ISSUED; eInvoiceStatus luôn NOT_INTEGRATED. Không mở hóa đơn điện tử hoặc điều chỉnh sau quyết toán.

## Gửi lặp và timeout

Client giữ một UUID + body đã chốt trong bộ nhớ, khóa sửa khi kết quả chưa rõ, không retry tự động. Nếu timeout/network/receipt sai thì không báo success; gửi lại nguyên key/body để lấy receipt gốc. Một lỗi auth sau đó không chứng minh yêu cầu trước chưa commit. Chỉ thông báo thành công khi backend đã xác minh committed receipt. Mất browser/bộ nhớ thì phải tra receipt/audit trước tạo lại; chưa có kho phục hồi client bền vững, không tự ghi localStorage.

Gateway yêu cầu ACTOR_RESOURCE_OPERATION_INTENT_SHA256, CAS/set tokens, append-only sources, allocation/refund reservation locks, unique source/OperationKey/RequestId và transaction chung SongLam:Inventory. Chỉ một command ghi; không chuỗi request thu/hoàn/đóng stay rồi báo success một phần. Nhiều Payment trong checkout cần child ApiRequest/receipt nguyên tử vì Payment.RequestId hiện unique; chưa triển khai SQL này.

Đây là yêu cầu/hàng rào **trong code ứng dụng**, không phải chứng minh SQL thật đã có hoặc đã kiểm chứng đúng một lần. Khi thiếu manifest/guarantee/policy, API báo FINANCE_CONTRACT_NOT_APPROVED/FINANCE_ATOMIC_CONTRACT_MISSING hoặc policy pending. Server mặc định G2 còn chưa cấu hình; không có luồng G9 thật nào được tuyên bố hoạt động.

## Giao diện và file

Trang `finance-api.html` dùng layout Tabler/HTTP client có sẵn, sidebar theo capabilities server, danh sách/chi tiết/sổ phát sinh có phân trang, form thu/hoàn/cọc/transfer/credit/phiếu/ca/ngày và phương án checkout trước xác nhận. Không hiển thị token/version như trường nhập nghiệp vụ, không tính số tiền phải thu trong browser. Form thay đổi sẽ hủy hiệu lực preview, không dùng kết quả async của phương án cũ.

Link từ `reception.html` → `finance-api.html#checkout`, từ `services-api.html` → thu ngân. Trang mới không nạp data/store/pms-ui; engine demo thu/cọc/checkout cũ giữ riêng, không ghi kép. Khi thiếu SQL/auth chỉ báo chưa cấu hình, không lấy số dư mẫu. Chưa mở bộ chọn dữ liệu thật toàn hệ thống; các form dùng ID từ API và bắt buộc context server xác minh trước ghi.

- Mới: `modules/finance/{money,model,validation,dto,receipt,service,routes}.js`, `adapters/sql/finance-gateway.js`.
- Mới: routes/service của `folios`, `payments`, `refunds`, `checkout`, `invoices`, `cashier`, `business-days`; `folios/deposit-routes.js`.
- Sửa: backend app/readiness đăng ký route/page/phụ thuộc; không sửa G4–G8 nghiệp vụ.
- Mới frontend: `finance-api.html`, `css/finance.css`, `js/api/finance-api.js`, `js/pages/finance-api.js`; sửa link lễ tân/dịch vụ.
- Tài liệu: bàn giao này, `g9-sql-proposals.md`, source inventory/SQL proposal index/README root và backend.

Chạy theo hướng dẫn backend hiện có: từ `backend`, `node --env-file=.env.example src/server.js`, mở `/finance-api.html`. Đây là lệnh hướng dẫn, không phải lệnh chạy G9 đã thực hiện. Không cài thêm dependency. `/health` stage G9 chỉ là phiên bản code, `/ready` tiếp tục 503 cho các phụ thuộc chưa được duyệt.

Chi tiết đối tượng/chính sách cần duyệt: [đề xuất SQL G9](g9-sql-proposals.md). Không tuyên bố đã kiểm thử hoặc nghiệm thu API, SQL, UI hoặc nghiệp vụ tiền.
