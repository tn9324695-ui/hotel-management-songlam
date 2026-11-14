# G8 — dịch vụ và minibar

Ngày 09/11/2026. Đã viết phần ứng dụng, **chưa nghiệm thu SQL thật**. Theo yêu cầu cuối cùng: chưa viết/chạy kiểm thử, không chạy ứng dụng/trình duyệt, không kết nối hoặc thay đổi SQL, không cài thư viện. Thông tin từ script là bằng chứng nguồn, không xác nhận live deployment.

Rà soát tĩnh: `node --check` đã parse 15 file JavaScript liên quan, không thực thi module; controller frontend được parse lại sau chỉnh formatter/nhãn nhập. `git diff --check` không báo lỗi khoảng trắng trên các file đang được Git theo dõi (chỉ cảnh báo LF/CRLF ở README/run_suite đã có). Không coi đây là kiểm thử API/nghiệp vụ/SQL/UI.

Đã đọc cấu trúc G0–G7, G2 actor/permissions/CSRF, Stay và schema ServiceOrder/Line, MinibarAudit/Line, FolioEntry cùng business contract/validation/gateway. Không thấy AGENTS.md trong repository/đường dẫn cha đã kiểm tra. Giữ Express ESM, route → service → SQL gateway, lỗi AppError/requestId và HTTP client chung. Không dùng driver/pool/manifest chưa được duyệt hoặc khởi tạo session giả.

## API đã viết (prefix `/api/v1`)

| Method | Đường dẫn | Nội dung |
| --- | --- | --- |
| GET | `/service-orders/capabilities`, `/minibar-audits/capabilities` | Quyền hiển thị và capability theo G2; không bịa dữ liệu SQL |
| GET | `/service-orders/catalog`, `/minibar-audits/catalog` | Dịch vụ phù hợp, giá/phiên bản từ SQL; phân trang, tìm q |
| GET | `/service-orders/context?stayId=…` | Stay đang ở và folio mở được phép phục vụ stay, không balance |
| GET | `/minibar-audits/context?stayId=…&roomSegmentId=…` | Ngữ cảnh stay/folio tối thiểu, room/segment, token hiện diện và phạm vi kiểm |
| GET | `/service-orders`, `/service-orders/:id` | Danh sách (stayId/status/offset/limit), chi tiết/giá chốt và reference phí/credit của nguồn |
| POST | `/service-orders` | Tạo yêu cầu nhiều dòng OPEN, chốt giá khi backend xác nhận tạo; chưa ghi phí |
| POST | `/service-orders/:id/deliver` | Chuyển DELIVERED và ghi phí nguyên tử |
| POST | `/service-orders/:id/cancel` | Hủy có lý do; giữ charge và credit cũ, chỉ credit phần còn lại, không hoàn tiền |
| GET | `/minibar-audits`, `/minibar-audits/:id` | Danh sách/chi tiết biên bản, snapshot, liên kết line/phí theo quyền |
| POST | `/minibar-audits` | Tạo PENDING theo segment thực tế/phạm vi kiểm; lưu counts và snapshot giá, chưa phí |
| POST | `/minibar-audits/:id/confirm` | PENDING/DISPUTED→CONFIRMED, nguồn dịch vụ và phí trong cùng command |
| POST | `/minibar-audits/:id/dispute` | PENDING→DISPUTED, lý do/actor; không sửa counts/giá hoặc ghi phí |

Các POST yêu cầu Origin, CSRF, Idempotency-Key, JSON và rowversions/context từ server. G2 tái kiểm account/quyền; actor không lấy từ body/query/header. Không có collect/refund/check-out/close folio G9; không update catalog giá/danh mục hoặc lưu dữ liệu demo.

## Giá và nguồn phát sinh

- Chỉ serviceId/expectedServiceVersion và quantity từ browser, không chấp nhận unitPrice/amount/role. Giá source active được SQL kiểm tại tạo và snapshot phải lưu bền vững. Sau đó get/deliver/confirm/cancel dùng snapshot cũ, không catalog mới.
- `amounts.js` dùng BigInt: Quantity decimal(12,3), ROUND dương half-up đến VND nguyên, kiểm decimal(19,0), tổng bằng sum từng dòng đã làm tròn. Minibar lượng nguyên <=999999999 để vừa ServiceOrderLine.Quantity khi có tiêu thụ, không suy số tồn/tỷ lệ khác.
- Phiên bản SQL phù hợp lấy từ Service.RowVer, Order/Audit/Stay/Folio.RowVer. AuditLine/ServiceOrderLine/StayRoomSegment không có RowVer: không giả version cho các bảng này; hợp đồng cần compare tập line/snapshot và token segment/scope.
- Service order OPEN chưa phí; delivery chỉ một charge dương cho mỗi line, minbar confirm liên kết AuditLine→ServiceOrderLine→FolioEntry và kiểm cùng service/qty/giá/stay. Cancel giữ charge, dùng CHARGE_CREDIT positive/ReversesEntryId; phí đã credit một phần chỉ đảo phần còn lại. Không double credit hoặc biến cancel OPEN thành delivery giả.
- Biên bản không tiêu thụ phải xác nhận rõ, có thể lines rỗng/tất cả lượng 0, vẫn có PENDING/CONFIRMED và dấu vết. Không tạo order rỗng, service line quantity0 hoặc FolioEntry amount0. Chính sách free/round-to-zero/price snapshot cần SQL duyệt, không coi miễn phí là thu tiền thành công.

## Giao diện đã nối

Trang `services-api.html` dùng Tabler/CSS có sẵn và HTTP client chung; có menu dịch vụ/minibar theo capabilities backend, danh sách/lọc/phân trang, chi tiết/giá chốt/tham chiếu phí-credit, tạo nhiều dòng, xác minh Stay/folio/segment, giao/hủy, tạo/confirm/dispute biên bản và xác nhận 0 tiêu thụ. Giá preview chỉ là giá catalog; frontend không nhân số lượng với đơn giá để quyết định số phải thu. Không trả/hiện tổng dư nợ khách.

Đã thêm liên kết từ lễ tân `reception.html` sang dịch vụ API, từ `housekeeping.html` và `housekeeping-api.html` sang `services-api.html#minibar`. Form API không nạp data.js/store.js/pms-ui.js; form demo cũ tiếp tục riêng, không biến chúng thành luồng ghi kép hoặc lấy demo StayId làm thật. Người dùng nhập/chọn đúng SQL StayId/segment và phải xác minh bằng context API; chưa có bộ chọn stay toàn hệ thống đã được duyệt.

Chỉ báo success khi backend trả committed receipt hợp lệ. Khi mất kết nối/timeout/response sai: giữ body/key trong bộ nhớ, khóa sửa, retry chủ động cùng key, nhắc trước khi rời trang; một lỗi auth sau đó không giải quyết trạng thái commit chưa rõ trước đó. Nếu vẫn đóng browser/mất điện thì bộ nhớ không bền vững; phải đối chiếu receipt/audit trước tạo lại. Không có localStorage/token/price fallback, retry tự động hoặc ghi SQL song song.

## Chống phí trùng: code và điều chưa có

Code application đã yêu cầu một RPC nguyên tử với actor+resource+operation+key+canonical intent SHA-256, CAS/source transitions và receipt gốc khi replay; kiểm graph source/charge/credit, giữ nguyên snapshot trước/sau. Gateway không cho gọi nếu thiếu các guarantees được duyệt. Source script có unique FolioEntry.ServiceOrderLineId, OperationKey và AuditLine.ServiceOrderLineId; chúng hỗ trợ chống trùng nhưng không tự thay receipt/transaction/phạm vi kiểm.

SQL thật **chưa** có hợp đồng G8 được phê duyệt trong repo: chưa kiểm chứng concurrency, idempotency, credit, audit hoặc price snapshot. S1–S4 trong [đề xuất SQL G8](g8-sql-proposals.md) ghi cụ thể blocker: ngữ cảnh folio hẹp, hủy OPEN mâu thuẫn validation, snapshot giá audit pending, mapping segment/scope/chống kiểm lặp và 0đ. Server mặc định trả chưa cấu hình (G2) hoặc CONSUMPTION_CONTRACT_NOT_APPROVED; không giả các API đã post phí thật.

## File mới/sửa trong lượt

- Mới: `backend/src/modules/services/{amounts,permissions,validation,dto,service,routes}.js`, `backend/src/modules/minibar/{validation,service,routes}.js`, `backend/src/adapters/sql/consumption-gateway.js`.
- Sửa backend: `app.js` đăng ký gateway/routes/page, `modules/status/readiness.js` báo phụ thuộc G8.
- Mới frontend: `services-api.html`, `css/consumption.css`, `js/api/services-api.js`, `js/api/minibar-api.js`, `js/pages/services-api.js`.
- Sửa liên kết: `reception.html`, `housekeeping.html`, `housekeeping-api.html`. Không đổi business engine demo/Store hoặc checkout G9.
- Tài liệu: file này, `g8-sql-proposals.md`, source inventory, SQL proposal index và README root/backend.

## Cách mở

Giữ cách chạy hiện có trong backend/README. Từ `backend`: `node --env-file=.env.example src/server.js`, rồi mở `/services-api.html` trên origin server hoặc `#minibar`. Đây là hướng dẫn, **không phải lệnh đã chạy G8**. Không cần cài thêm thư viện. Trang báo thiếu auth/SQL đúng thực trạng cho đến khi phụ thuộc được phê duyệt và cấu hình; `/health` stage G8 không đồng nghĩa `/ready` hoặc nghiệp vụ đã sẵn sàng.
