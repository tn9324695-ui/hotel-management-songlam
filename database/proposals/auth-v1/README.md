# A1/A2/A3 — trạng thái duyệt SQL theo từng file

Cập nhật 12/11/2026: SongLamPms_Design trên `.\SQLEXPRESS` được phép ghi kiểm thử. **000 đã chạy backup/VERIFYONLY thành công; 004 đã duyệt riêng, chưa thực thi do thiếu bằng chứng ngừng ghi. 001/002/002b/003/005 chưa duyệt/chạy**. Xem [D1](../../../docs/d1-approval-package.md), [preflight](../../../docs/d1-004-preflight.md), [D2](../../../docs/d2-approval-package.md). Phần dưới lưu mô tả đề xuất cũ; các guard thực tế phải đối chiếu từng file/receipt.

**Bản sửa tách phụ thuộc, 11/11/2026:** [bảng quyết định D1–D4](../../../docs/auth-sql-decisions.md) là phạm vi duyệt hiện tại. 001/003 nay chỉ có **3 RPC + 1 role auth**; ActorProbe/role của nó chuyển sang 002b. S0 có draft 005 và backup có draft 000. Chưa áp dụng phiên bản nào.

Ngày 11/11/2026. Giữ **database đã có `SongLamPms_Design` trên `.\SQLEXPRESS`**, không tự tạo DB khác. Phạm vi dùng database ghi dữ liệu kiểm thử **đã xác nhận**; việc thực thi từng file SQL vẫn chưa được duyệt. Không coi quyết định chọn đích là phê duyệt DDL/quyền/backup/marker/fixture.

Đã kết nối **chỉ đọc metadata** `sys.tables`, `sys.procedures`, `sys.columns`, `sys.types`: các bảng AppUser/AppRole/UserRole/Permission/RolePermission/ApiRequest/AuditLog/CommandExecution/PrincipalBinding hiện có. UserId/ActorId là bigint, PasswordHash varchar(512), RowVer timestamp/rowversion, AuditLog.RequestId uniqueidentifier. Không đọc dòng tài khoản, hash, dữ liệu khách hay giao dịch. Chưa xác minh thuật toán hash thật hoặc dữ liệu rỗng. Thủ tục AppEnvironment/AppAuthLookup/AppIdentity/AppActorProbe chưa thấy; các gateway cũ Query/ExecuteCommand đã có. Chưa kiểm tra/biên dịch các file pending trên SQL Server.

## Đối tượng đề xuất cụ thể

| File | Đối tượng | Phạm vi | Cần duyệt |
| --- | --- | --- | --- |
| 001-auth-read.sql.pending | pms.usp_AppEnvironment | Đọc DB/server identity + marker test; không chấp nhận tài khoản pool sysadmin/db_owner | Identity marker và principal ứng dụng |
| Cùng file | pms.usp_AppAuthLookup | A1: tra đúng username; chỉ backend nhận UserId/hash/IsActive/RowVer | EXECUTE hẹp cho dịch vụ auth; xác minh format hash thực tế, không chuyển mật khẩu vào SQL |
| Cùng file | pms.usp_AppIdentity | A2: hai result set profile tối thiểu và quyền từ role đang active; user bigint trả chuỗi, RowVer hex; read transaction nhất quán | Hợp đồng và quyền đọc thực tế; không đổi UserRole/RolePermission |
| 002b-actor-probe.sql.pending | pms.usp_AppActorProbe + pms_web_actor_reader | A3 phần đọc tùy chọn: kiểm user active/quyền và trả AUTHORIZED; grant EXECUTE đúng probe | Duyệt riêng, không cần cho login, không là audit/receipt COMMITTED |
| 002-actor-internals.sql.pending | pms.usp_AppAssertActor | Helper private chỉ trong transaction, giữ khóa user/membership/permission đến cuối transaction | Domain RPC cố định quyền, module/certificate execution chain |
| Cùng file | pms.usp_AppAppendAudit | Helper private, chỉ ghi audit khi đúng CommandExecution/ApiRequest PROCESSING/actor/op/inventory lock; không copy body/hash/session/PII | Quyền module private, chiến lược audit của từng domain và tránh ghi audit trùng |
| 003-rpc-permissions.sql.pending | pms_web_auth_reader | Một DB role mới, chỉ EXECUTE AppEnvironment/AppAuthLookup/AppIdentity | Tên/phạm vi role, kiểm quyền kế thừa, service principal được gán; không tự tạo login/user hoặc gán thành viên |
| 004-test-marker.sql.pending | Extended properties SongLam.Environment, SongLam.TestIdentity | Chỉ ghi marker sau duyệt thực thi 004 riêng; bắt buộc receipt backup 000 thực và VERIFYONLY lại; không ghi đè marker | Quyền dùng đích làm test đã xác nhận; còn chờ duyệt chạy 004/cửa sổ dừng ghi |
| 005-session-store.sql.pending | WebSession, 4 RPC WebSession*, pms_web_session_executor | S0 CRUD phiên theo epoch; không ghi nghiệp vụ | Duyệt DDL/EXECUTE + session writes riêng, epoch bên ngoài DB, backup/expiry |
| 000-backup-plan.sql.pending | Backup full COPY_ONLY + CHECKSUM, VERIFYONLY | Tạo file backup mới, không restore database | Owner/đích/thư mục/ACL và kế hoạch restore riêng |

Mỗi file dùng một batch có `@ApprovedDatabase=NULL` và approval reference trống nên mặc định THROW trước DDL/quyền/ghi marker. Không được installer/server/CLI tự nạp. Các câu CREATE PROCEDURE nằm trong sp_executesql với nội dung cố định để bảo đảm guard đứng trước DDL trong cùng batch, không dùng tên bảng/câu SQL do browser gửi. Không có CREATE DATABASE, tài khoản quản trị, seed, reset password, đổi PrincipalBinding hoặc sửa trigger.

`002` là nền tảng **private**, chưa phải A3 ghi nghiệp vụ hoàn chỉnh. Không có public command tổng quát mới; không trỏ adapter tới `usp_ApplyCommand`/`usp_ReadResource` để vượt DENY. Mỗi B/C/O/S/F command cần hợp đồng nguyên tử/replay/validation riêng được duyệt, gọi assert actor trong chính transaction, giữ guard CommandOnly hiện có và commit audit + nghiệp vụ + receipt cùng lúc. Chưa mở command nào bằng bộ draft này.

Quyền nested-module phải được DBA thiết kế/kiểm chứng riêng (signing/countersigning hoặc context được duyệt), không tự giả định ownership chaining cấp đủ quyền EXECUTE private. Tài liệu Microsoft nêu giới hạn ownership chaining và khác biệt quyền thực thi module; tham khảo [EXECUTE AS](https://learn.microsoft.com/en-us/sql/t-sql/statements/execute-as-clause-transact-sql), [module signatures](https://learn.microsoft.com/en-us/sql/t-sql/statements/add-signature-transact-sql). Không bật cross-database ownership chaining/TRUSTWORTHY hoặc cấp IMPERSONATE/db_owner cho backend.

## Cấu hình/code đã chuẩn bị

- `deploy/sql-target.observed.example.json`: ghi nhận DB hiện có, **không phải cấu hình hay phê duyệt vận hành**.
- `deploy/sql-test-profile.example.json`: không chọn server/DB; mode Windows chỉ là minh họa theo cách đọc metadata vừa dùng, chưa phải lựa chọn cho backend; approved=false. File riêng `.local.json` ngoài Git cần có reference duyệt, target được xác nhận và marker identity khớp. Với SongLamPms_Design/QLKhachSan cần thêm existingDatabaseTestApprovalReference và backupReference, không tự xem là DB test.
- `backend/src/adapters/sql/test-profile.js`: kiểm profile chặt, TLS, refs secrets qua env, procedure allowlist và target binding; không đọc bí mật từ JSON/log.
- `test-pool.js`: provider-neutral factory đã có kiểm timeout/cancel/close, handshake chỉ gọi RPC environment đã duyệt; mặc định **không có provider/driver thực và không được server.js nạp**. Không nói backend đã kết nối SQL vì metadata sqlcmd đọc được.
- `approved-contracts.js`: auth adapter có thể ràng buộc DB đích rõ ràng thay vì bắt buộc tên hard-code; default cũ giữ nguyên để không đổi demo. verifyActor chỉ nhận actor do G2 mint, truyền typed parameters, trả AUTHORIZED/read-only. Command vẫn chưa cấu hình.

Chưa cài driver SQL do phương thức xác thực/provider và target chưa được duyệt. Provider tương lai phải triển khai connect/request/input/execute/cancel/close, connected và typed SQL values, map TLS/auth/pool đúng thư viện đã duyệt; không được bỏ qua transport hoặc handshake. Bật Windows Authentication cho metadata bằng tài khoản đang dùng không đồng nghĩa được dùng tài khoản đó làm service pool, đặc biệt nếu có quyền quản trị.

CLI ngoại tuyến:

```powershell
node tools/sql/check-profile.mjs --profile deploy/sql-test-profile.example.json
```

File mẫu phải bị từ chối `SQL_TEST_APPROVAL_REQUIRED`. Profile đúng shape chỉ báo PROFILE_STRUCTURE_VALID_ONLY, không xác minh lời phê duyệt và không kết nối SQL. Không có --connect/apply/migrate trong CLI này.

## Phụ thuộc để login thật, chưa quyết định thay người dùng

1. Quyền áp dụng 001/003 trên DB hiện có và danh tính dịch vụ có quyền hẹp. Nếu cần tạo login/user mới, trình riêng; không dùng tài khoản metadata admin làm backend.
2. Đã xác nhận dùng database này để ghi dữ liệu kiểm thử. Còn chờ duyệt riêng backup 000, marker 004, session 005 và lô dữ liệu; 004 chỉ xét sau receipt backup đã kiểm chứng.
3. Kho phiên bền vững: **005 chỉ là draft chưa chạy**. PK WebSession nay là (EpochHash,SessionKeyHash), kèm AppUserId FK, SecurityVersion, CsrfToken, ExpiresAtUtc/CreatedAtUtc, index expiry/user; 4 RPC và role session hẹp. Adapter `session-store.js` chưa được bootstrap nạp. Epoch quản lý ngoài DB/backup để thu hồi toàn bộ sau restore; cookie thô không lưu. Cần duyệt S0/DDL/quyền/session writes và key management riêng. Không dùng MemoryStore vận hành.
4. Thuật toán PasswordHash thật chỉ xác định theo format tổng hợp/metadata được phép; không xuất hash/password lên chat/log, không tự sửa/rehash/khởi tạo tài khoản. Backend hiện hỗ trợ các encoding versioned PBKDF2/scrypt khi được cấu hình, không giả định DB đang dùng chúng.

Sau khi có phê duyệt, thứ tự áp dụng/kiểm chứng trên đúng target: backup và xác nhận phạm vi → DBA review/deploy 001/003 (002 chỉ khi domain-signing được chốt; 004 chỉ khi test-use được duyệt) → service principal hẹp → identity handshake → A1/A2/password verifier/session store → login/me/logout/CSRF/locked/revoked → hai actor qua pool + audit trong command đã duyệt → G3 đọc → B1/B2 và các nghiệp vụ tiếp theo. Không chạy cả bộ G3–G12 hoặc mở G12 ngay sau khi có login.
