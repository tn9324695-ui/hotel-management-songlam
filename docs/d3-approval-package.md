# D3 — S0 kho phiên SQL: gói duyệt riêng

**Cập nhật yêu cầu mới:** nhóm 005/D3-P đã được người dùng chọn để triển khai; ghi nhận trong `deploy/login-sql-decisions.json`. Chưa áp dụng do phụ thuộc marker D1 và D2. D3-P đã có artifact `005p-session-membership.sql.pending`; driver và runtime đã có trong entrypoint opt-in, không phải đã kết nối SQL. Xem [bàn giao hiện tại](login-packages-implementation.md); nội dung gói gốc tiếp theo không thay thế trạng thái này.

Trạng thái: **đã có adapter, phần ghép nối và fixture; chưa áp dụng SQL, chưa nghiệm thu phiên SQL thật**. Yêu cầu tiếp tục code không thay thế phê duyệt chạy từng file pending. Database ghi thử SongLamPms_Design trên .\SQLEXPRESS đã xác nhận; không cần chọn lại.

## Phạm vi đề nghị

Artifact `database/proposals/auth-v1/005-session-store.sql.pending`:

| Đối tượng | Nội dung |
| --- | --- |
| `pms.WebSession` | EpochHash/SessionKeyHash, AppUserId FK tới AppUser(UserId), SecurityVersion, CsrfToken, ExpiresAtUtc, CreatedAtUtc |
| Khóa/chỉ mục | PK (EpochHash,SessionKeyHash), IX_WebSession_Expiry, IX_WebSession_User; kiểm định dạng hash và expiry |
| RPC | `pms.usp_WebSessionProbe`, `pms.usp_WebSessionCreate`, `pms.usp_WebSessionGet`, `pms.usp_WebSessionDestroy` |
| Role | `pms_web_session_executor` owner dbo, đúng bốn quyền EXECUTE cho bốn RPC này |

Không cấp SELECT/DML trực tiếp hoặc quyền purge, không tạo nhân viên, không ghi đặt phòng/tiền. Create không ghi đè phiên; Get kiểm active/RowVer/expiry; Destroy idempotent. RPC tự sở hữu transaction khi cần; không bọc cùng transaction nghiệp vụ.

## Điều kiện và lệnh đề nghị — CHƯA chạy

1. D1 backup/verify và marker được duyệt, chạy thành công; D2 service principal/ba RPC đã triển khai và kiểm chứng. AppUser thử phải có đề xuất dữ liệu/phê duyệt riêng trước happy-path login.
2. Duyệt 005 DDL/EXECUTE **và session writes riêng**. Điền `@ApprovedDatabase`, `@ApprovalReference`, `@SessionWriteApprovalReference`; hiện NULL. Guard cố định server/physical GUID/logical marker theo D1; từ chối ambient transaction và WebSession/RPC/role tồn tại, tránh nhận dùng lại objects chưa rà soát.
3. Chỉ sau duyệt mới chạy bởi DBA, không dùng danh tính DBA làm pool:

```powershell
Get-FileHash -Algorithm SHA256 database/proposals/auth-v1/005-session-store.sql.pending
sqlcmd -S 'lpc:.\SQLEXPRESS' -E -d SongLamPms_Design -b -r1 -i database/proposals/auth-v1/005-session-store.sql.pending
```

Membership sau đây là phạm vi **D3-P riêng**, không tự kèm 005, chỉ khi D2-P đã tạo đúng principal và rà soát quyền hiệu lực:

```sql
-- Đề nghị, chưa chạy; đúng database SongLamPms_Design.
ALTER ROLE [pms_web_session_executor] ADD MEMBER [pms_web_auth_test];
```

Không cấp actor helper/command nghiệp vụ cho role phiên. Nếu lỗi DDL/grant: dừng, rollback transaction trong file; không tự tạo lại hay bật login. Nếu timeout deployment: đọc metadata trước retry, vì commit có thể đã xảy ra.

## Quản lý khóa và cấu hình ứng dụng

- Cookie opaque CSPRNG 32 byte; SQL chỉ giữ SHA-256 cookie. Cookie HttpOnly/SameSite=Lax, Secure trên HTTPS; không truyền role/actor trong cookie.
- `SONGLAM_SESSION_EPOCH`: CSPRNG 32 byte base64url, cấp qua secret store/môi trường riêng, không chat/repo/log/backup SQL. SQL chỉ giữ hash epoch. Mọi instance phải cùng epoch.
- TTL đề nghị 8h, giới hạn 24h, expiry tuyệt đối; không tự gia hạn. Cần clock backend/SQL đồng bộ; SQL từ chối độ lệch TTL/expiry >5s. Chưa có quyền cleanup job; DBA trình riêng nếu cần.
- Sau restore hoặc nghi lộ cookie: khóa login/command, xoay epoch ngoài SQL trên tất cả instance, đối chiếu active/role/credential và dữ liệu mới trước mở lại. Không khôi phục epoch cũ cùng SQL backup.
- `deploy/sql-session-manifest.example.json` approved/sessionWritesApproved=false. `auth-bootstrap.js` kiểm target, S0 manifest, epoch/hash format/TTL **trước mở pool**, rồi kiểm Environment và S0 probe; chỉ đọc khi chuẩn bị, không tạo phiên sẵn.
- Chưa tự nạp bootstrap từ server.js; chưa cài/chọn driver Windows Integrated Authentication/TLS; không chỉnh .env hoặc mở login bằng cờ. Không coi test provider là driver vận hành.

## Kiểm chứng sau duyệt và phục hồi

Kiểm metadata/DDL/grant/membership đúng; dùng đúng service principal, gọi Probe; create/get/logout/replay/expiry/khóa user/revoke role/mất kết nối và hai instance. So cookie không nằm trong SQL/log; restore kiểm thử + epoch mới không hồi sinh phiên cũ. Chỉ ghi PASS khi thực sự chạy SQL.

Rollback ứng dụng: dừng runner, thu hồi D3-P membership/EXECUTE mới sau duyệt và xoay epoch; giữ WebSession/backup theo chính sách lưu giữ. Không tự DROP bảng có phiên hoặc restore DB mất dữ liệu mới. Rủi ro: lộ CSRF/session backup, TTL lệch clock, epoch không đồng bộ, login chung quá quyền. Hướng dẫn này không tự cấp quyền thực hiện phục hồi.
