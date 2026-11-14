# G7 — code buồng phòng, bảo trì và đồ thất lạc

Ngày 08/11/2026. **Chưa nghiệm thu G7 với SQL thật. Không viết/chạy test, không chạy ứng dụng/trình duyệt trong lượt này theo phạm vi yêu cầu.** Không đổi SQL, quyền, dữ liệu hoặc localStorage. Các kết quả test G0–G2 trong tài liệu cũ là lịch sử, không phải kiểm thử G7.

Rà soát tĩnh cuối lượt: `node --check` phân tích cú pháp thành công 20 file JavaScript liên quan, không thực thi module; `git diff --check` không báo lỗi khoảng trắng trên phần Git đang theo dõi (có cảnh báo LF/CRLF đã có ở README/run_suite). Đây không phải kiểm thử API, nghiệp vụ, SQL, giao diện hoặc kết nối.

## Kiểm kê trước sửa

Không tìm thấy AGENTS.md trong repo/đường dẫn cha đã kiểm tra. Tiếp nối Express ESM hiện có, G2 authenticate/CSRF/Origin/actor đã xác thực, permission names trong script, AppError/requestId và gateway theo manifest được duyệt. Đã đọc module G3–G6, HTTP client, controller buồng phòng, tài liệu đề xuất và SQL source. Không có bằng chứng phê duyệt RPC mới; không truy vấn live SQL để suy rằng script đã được triển khai. [Đề xuất SQL riêng](g7-sql-proposals.md) ghi rõ bằng chứng và phần thiếu.

## API đã viết

Các resource có GET danh sách, GET `/:id`, GET `/:id/history` (offset/limit, tối đa 200 hoặc giới hạn nhỏ hơn đã duyệt):

| Prefix `/api/v1` | POST tạo | POST thao tác theo `/:id/…` |
| --- | --- | --- |
| `/housekeeping/tasks` | `/` | claim, assign, start, submit, unable, resume, inspect-approve, inspect-reject |
| `/housekeeping/rooms` | Không tạo phòng | mark-dirty |
| `/maintenance/tickets` | `/` | claim, assign, start, progress, resolve |
| `/maintenance/room-blocks` | `/` | cancel, end |
| `/lost-found` | `/` | handoff, return |

GET `/api/v1/operations/capabilities`: quyền đọc/tạo và mức hỗ trợ hợp đồng theo actor hiện tại; **không cần giả bản ghi SQL**. Từng DTO trả allowedActions từ server, theo quyền/ownership/state và capability. G2 kiểm lại tài khoản/quyền trên từng request. Mọi POST yêu cầu JSON, Origin hợp lệ, CSRF, Idempotency-Key; không nhận actor/role từ browser. Không có endpoint tự đặt CLEAN hoặc sửa hiện diện khách.

Lọc: roomId; tasks/tickets có status/mine; tickets thêm priority; rooms có occupancyStatus/cleanlinessStatus/exploitationStatus; blocks có state; items có status. Không cho tùy ý SQL/filter hoặc đổi page thành ghi lô. IDs là chuỗi số; version từ server, LostFound dùng expectedStateToken được SQL cấp, không giả RowVer.

## Luồng trạng thái trong ứng dụng

- Tasks: QUEUED → CLAIMED (PENDING có AssignedTo) → CLEANING → AWAITING_INSPECTION → COMPLETED. unable cần lý do, giữ lịch sử và underlying state; resume về bước trước. Nhân viên chỉ start/submit/unable/resume việc của mình. Nghiệm thu khác người dọn và quyền riêng **đang khóa**; submit không phải CLEAN.
- Tickets: OPEN → IN_PROGRESS (có người nhận và phân loại xử lý được duyệt) → RESOLVED; progress ghi dấu vết khi IN_PROGRESS. Sửa xong không tự CLEAN hoặc xóa block/hold. Quy tắc follow-up vệ sinh phải được SQL hỗ trợ nguyên tử.
- Blocks: SCHEDULED/ACTIVE/ENDED/CANCELLED, cancel chỉ chưa hiệu lực, end chỉ đang hiệu lực. Cùng khoảng [start,end), không âm thầm sửa booking/Stay. G5–G6 bị chặn nếu contract chưa hỗ trợ ROOM_ELIGIBILITY_V1, thay vì giả tính availability an toàn.
- Lost-found: STORED → các lần handoff → RETURNED; người giữ hiện tại mới bàn giao/trả; không trả hai lần. Server recheck token/status/recipient dưới transaction và lưu sự kiện. Dữ liệu cũ chưa có người giữ không được đoán.

State guards cho allowedActions và kiểm receipt đã được viết; tính nguyên tử, claim đồng thời, block conflict, rowversion/token và audit cần RPC được duyệt thực thi. Gateway chỉ nhận đúng một command nguyên tử và một receipt đã commit; không dựng chuỗi ghi tuần tự. Lỗi/timeout hoặc receipt sai không trả thành công; gửi lại đúng key để lấy receipt gốc. Không có in-memory lock/idempotency giả thay SQL.

## Giao diện đã nối API

Mở `/housekeeping-api.html` trên cùng origin backend. Đã nối danh sách/lọc/phân trang, chi tiết/lịch sử, các biểu mẫu tạo/nhận/phân công/bắt đầu/gửi kiểm tra/không thể dọn/tiếp tục việc, báo/cập nhật/đóng phiếu, tạo/hủy/kết thúc block và ghi nhận/bàn giao/trả đồ. Nút lấy từ allowedActions, menu từ capabilities backend, không đọc role demo. Ba trạng thái phòng trình bày riêng. Form giữ key/body trong bộ nhớ khi kết quả ghi chưa rõ, không tự retry hoặc báo success; ngăn đóng dialog/nhắc trước khi rời trang. Nếu người dùng vẫn đóng browser hoặc máy mất điện, key chưa có kho phục hồi bền vững; cần đối chiếu receipt/audit với quản trị viên trước tạo lại, không coi dữ liệu ghi là đã thất bại.

Trang API không nạp data.js/store.js/pms-ui.js/pms-data.js; không có SongLamStore/localStorage fallback. `js/housekeeping.js` điều phối theo data-housekeeping-mode và thoát trước controller demo. `housekeeping.html` giữ nguyên demo riêng, thêm liên kết sang trang API. Không gắn G7 vào nguồn demo để tạo ghi kép; không chuyển các module booking/tiền/check-out sang API.

Giao diện dùng Tabler/CSS đã có, sidebar có nút thu gọn trên màn hình nhỏ, bảng cuộn ngang; **chưa xác minh kích thước/console/liên kết qua browser**. Form dùng ISO 8601 có offset rõ ràng; giờ đọc hiển thị Việt Nam, không tự hiểu giờ địa phương của máy người dùng.

## File của lượt G7

- Backend mới: `backend/src/modules/operations/{model,validation,dto,service,routes}.js`; `modules/housekeeping/{service,routes}.js`, `maintenance/{service,routes}.js`, `lost-found/{service,routes}.js`; `adapters/sql/operations-gateway.js`.
- Backend sửa: `app.js`, `modules/status/readiness.js`, gateway catalog/bookings/stays (chốt kiểm eligibility G7; không viết lại giá/đặt/lưu trú).
- Frontend mới: `housekeeping-api.html`, `css/operations.css`, `js/api/operations-api.js`, `js/pages/housekeeping-api.js`.
- Frontend sửa: `housekeeping.html`, `js/housekeeping.js` (giữ demo, thêm đường API riêng).
- Tài liệu: file này, `g7-sql-proposals.md`, source-inventory và README root/backend.

## Cách mở và phần còn chặn

Giữ lệnh chạy backend trong `backend/README.md`. Có thể dùng cấu hình mẫu mà không tạo `.env`:

```powershell
cd backend
node --env-file=.env.example src/server.js
```

Mở URL/port server thông báo, đường dẫn `/housekeeping-api.html`. Không cần cài thư viện mới cho G7. `/health` báo stage G7 là phiên bản code; `/ready` vẫn 503 với phụ thuộc còn thiếu, không phải chứng nhận vận hành.

Server mặc định chưa có pool/driver/manifest/kho phiên thật nên G2 và G7 trả trạng thái chưa cấu hình; **chưa có luồng G7 nào được xác nhận chạy với SQL thật**. Cần duyệt O1–O5 và phụ thuộc G2, hiện thực RPC/permission được duyệt trong môi trường chỉ định, rồi kiểm thử tích hợp/đồng thời/rollback/audit và UI ở lượt riêng. Không tuyên bố đã nhận việc, làm sạch, block hoặc trả đồ trong SQL.
