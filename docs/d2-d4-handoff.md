# D2–D4 — Phần code chuẩn bị và trạng thái thực tế

Không đánh dấu D2–D4 hoàn tất trên SQL thật. **Cập nhật 12/11:** 000 đã chạy backup/VERIFYONLY thành công; 004 đã duyệt riêng nhưng chưa chạy do thiếu bằng chứng ngừng ghi. D2–D4/001/002/002b/003/005 chưa duyệt/chạy. Driver/runtime đã bổ sung ở lượt sau, xem [trạng thái kết nối](sql-connection-status.md); phần code/test bên dưới là nhật ký lượt bàn giao trước.

| Phần | Đã làm | Chưa hoàn tất |
| --- | --- | --- |
| D2 | Adapter credential/identity đã có; bổ sung auth-bootstrap để ghép target-verified pool và auth runtime khi đủ điều kiện | D1-000/004, triển khai 001/003, cấp service principal riêng, chọn driver/TLS, tài khoản nhân viên thử và thuật toán hash thực |
| D3 | SQL session adapter đã có; bổ sung manifest mẫu và ghép S0 vào session manager/auth; probe trước khi trả runtime | Duyệt/chạy 005, D3-P membership, cấp epoch ngoài DB, kiểm chứng phiên SQL thực |
| D4 | Adapter actor/ACK hiện có; siết target/marker/upgrade guard cho helper/probe draft; hoàn thiện gói duyệt private/nested-module/atomicity | Triển khai 002/002b nếu được duyệt; domain RPC/receipt/locking/signing theo từng B/C/O/S/F chưa được duyệt và chưa có chứng cứ SQL |

## Code và lỗi sửa

- `backend/src/adapters/sql/auth-bootstrap.js`: hàm `prepareApprovedTestAuth` chỉ dùng môi trường test, không được server.js tự gọi; kiểm D2 profile + S0 approval/session-write approval + epoch + password formats + TTL/types trước mở pool, snapshot manifest trước async connect; đóng pool khi S0 probe lỗi. Chỉ nhận provider được cấp rõ, không import driver hoặc chọn instance mặc định.
- Hàm trả authRuntime cho createApp khi chuẩn bị hợp lệ; identity có thể verifyActor nếu probe được duyệt riêng, **không có command contract**, businessWritesEnabled=false. Nó không tự cấp tài khoản hay tạo phiên khi startup. Cần driver thật và triển khai được duyệt mới có thể tích hợp với entrypoint; chưa bật bằng environment flag đơn lẻ.
- `approved-contracts.js`: sửa RowVer dạng Buffer thành `0x` + hex và chuẩn hóa hex string về chữ thường để khớp S0. Trước đây Buffer thành hex thiếu `0x`, làm credential/identity khác nhau hoặc S0 từ chối phiên. Giữ hỗ trợ securityVersion dạng khác cho các hợp đồng/fixture hiện có; S0 vẫn yêu cầu đúng RowVer SQL.
- `deploy/sql-session-manifest.example.json`: mặc định approved=false, sessionWritesApproved=false, không epoch/password/cookie.
- `002-actor-internals.sql.pending`, `002b-actor-probe.sql.pending`, `005-session-store.sql.pending`: thêm guard instance/GUID/marker D1, no ambient transaction, không nhận dùng lại objects/role đã tồn tại. Chỉ sửa tệp dự thảo; chưa compile/execute SQL.
- `backend/tests/sql-auth-bootstrap.test.js`, `sql-contracts.test.js`: regression tests; không viết dữ liệu SQL thật.

## Kiểm thử thực sự đã chạy

```powershell
# backend/
node --test tests/sql-auth-bootstrap.test.js tests/sql-contracts.test.js tests/sql-session-store.test.js
npm.cmd test
# root/
node tools/sql/d1-review.mjs deploy/d1-review.json
git diff --check
```

Lượt đầu kiểm ba file **16/16 đạt**. Toàn bộ suite **112/112 đạt, 0 trượt/skip**; bốn test mới gồm: thiếu approval/epoch/hash/types không gọi provider; startup chỉ probe/không tạo session/không mở command; HTTP login→me→CSRF/logout dùng RowVer binary/text; khóa account trong phiên cũ bị từ chối. Các kết quả này là HTTP nội bộ + fixture/provider giả, **không phải kiểm thử SQL Server**. Kiểm SQL lock/transaction/audit/tiền đồng thời chưa thực hiện. Không chạy kiểm tra trình duyệt mới vì chưa sửa frontend.

CLI D1 vẫn báo test-use CONFIRMED, backup pending, marker BLOCKED. `git diff --check` không lỗi whitespace, có cảnh báo LF/CRLF file cũ. Kết quả suite gần nhất sau phần siết preflight được xác nhận khi bàn giao; không coi 102/108 test lịch sử là chứng cứ SQL.

## Gói cần duyệt theo thứ tự

1. [D1-000 và D1-004](d1-approval-package.md): 000 đã chạy/verify đạt; 004 đã duyệt, chưa chạy vì thiếu bằng chứng ngừng ghi.
2. [D2-001/003 và D2-P](d2-approval-package.md): đúng ba RPC/EXECUTE, principal Windows riêng; chưa chạy.
3. [D3-005 và D3-P](d3-approval-package.md): schema/RPC/quyền phiên, membership và session writes riêng; chưa chạy.
4. [D4-H/R/P/C](d4-approval-package.md): helper/probe tùy chọn, signing và từng command nguyên tử; chưa chạy. Không duyệt helper rồi coi command phòng/tiền đã đủ an toàn.

Sau các bước tương ứng được triển khai/kiểm chứng mới nối frontend ghi thật cho module đó. Có thể tiếp tục chuẩn bị giao diện/API client và trạng thái loading/empty/error/blocked ngay, nhưng không gắn nhãn dữ liệu demo là SQL hoặc mở thao tác nghiệp vụ chưa có contract.
