# Tài khoản thử — dữ liệu đã cho phép, cơ chế bootstrap còn thiếu

Yêu cầu mới đã cho phép tạo một AppUser thử cho mỗi vai trò admin, manager, receptionist, cashier, housekeeping trên SongLamPms_Design. Không xin lại quyền dùng database hoặc phạm vi năm tài khoản. **Đã chuẩn bị bundle bí mật cục bộ 5 người, chưa nhập SQL hoặc cấp tài khoản hoạt động**. CLI, artifact cụ thể và giới hạn tại [bàn giao mới](login-packages-implementation.md).

## Bằng chứng hiện tại

- SQL thật: AppUser=0, UserRole=0, PrincipalBinding=0. Các role cần thiết đã tồn tại.
- `pms.usp_ExecuteCommand` lấy actor từ PrincipalBinding; không có actor khởi tạo. MutationRule có RBAC cho UserRole nhưng không có AppUser hoặc PrincipalBinding.
- Script bảo vệ hiện tại không gắn CommandOnly vào AppUser/UserRole; điều đó **không phải quyền tự INSERT**, cũng không làm gateway tự hỗ trợ bootstrap tài khoản. Không bỏ qua gateway hoặc tạo binding cho tài khoản metadata để khởi tạo actor giả.
- Backend verifier hỗ trợ chính xác `pbkdf2-sha256-v1`, `scrypt-v1`; không bật format mặc định. Database chưa có user nên không có thuật toán dữ liệu thật để suy luận. Không tự chọn Argon2id hoặc dùng hash của tài khoản khác.

## Hợp đồng cần duyệt trước nhập tài khoản

Đã viết hợp đồng nội bộ **`pms.usp_SeedTestStaffBatch`** trong `006-test-staff-bootstrap.sql.pending`, nguồn tại `contracts/test-staff-body.sql`; chưa triển khai trên SQL. Đây không phải API công khai, không cấp EXECUTE cho tài khoản web. Artifact mới giữ guard NULL để đối chiếu/phê duyệt nội dung cụ thể trước áp dụng; dữ liệu năm người đã được cho phép không bỏ qua điều kiện D1 hoặc tự cấp quyền triển khai.

| Input/output | Ràng buộc cần có |
| --- | --- |
| BatchCode varchar(40) | Ví dụ đề nghị `B20261112_UI01`, cố định khi chạy lại |
| AccountsJson nvarchar(max) | Đúng 5 dòng, mỗi role đúng một dòng; username, fullName, encoded PasswordHash; không nhận role/actor từ browser |
| Target | Server/GUID/database khớp D1 và môi trường thử đã xác minh; từ chối DB vận hành hoặc caller không được duyệt |
| Tạo tài khoản | Một transaction cho cả 5 AppUser + 5 UserRole; dùng role active hiện có; không sửa RolePermission, account khác hoặc PrincipalBinding |
| Chống trùng | Khóa lô transaction và unique Username; cùng batch/payload trả đúng các ID cũ. Bất kỳ dòng tồn tại khác nội dung/role/hash hoặc lô dở dang thì từ chối toàn lô, không reset mật khẩu/nhập tiếp một phần |
| Kết quả | Batch, UserId/Username/RoleCode, created/replayed; không trả hash/password. Receipt và dấu vết triển khai phải được chốt cùng phạm vi ghi được duyệt; không vượt trigger AuditLog để chèn nhật ký |

Username đề nghị (chưa tạo): `SONGLAM_TEST_B20261112_UI01_ADMIN`, `_MANAGER`, `_RECEPTIONIST`, `_CASHIER`, `_HOUSEKEEPING`. Các tài khoản là AppUser nghiệp vụ, không phải SQL login/user; không cấp SQL sysadmin/db_owner.

## Quản lý mật khẩu sau khi có hợp đồng

CLI `tools/sql/test-staff.mjs prepare` đã tạo mật khẩu/salt riêng, PBKDF2-SHA256 v1 600000 vòng tương thích verifier. Bundle ở `tools/sql/private/test-staff-B20261112_UI01/credentials.local.json`, Git-ignore và ngoài static allowlist. **File thực đã tồn tại, chỉ là dữ liệu chuẩn bị chưa nhập SQL**. Đã kiểm owner và DACL đúng người vận hành, không sandbox/Everyone/Users. Không truyền mật khẩu/hash qua argv, sqlcmd substitution, log/chat. Importer dùng typed SQL parameter; replay nguyên bundle, không reset mật khẩu hoặc sinh lô mới.

Xem cục bộ bằng `notepad .\tools\sql\private\test-staff-B20261112_UI01\credentials.local.json` trong PowerShell của chủ máy. Không đăng nhập được cho đến khi RPC/phiên và import thực sự đạt. Timeout sau khi phát lệnh trả `STAFF_IMPORT_OUTCOME_UNKNOWN`, không tự retry/lập lô mới; chạy lại cùng bundle chỉ sau đối chiếu để nhận replay an toàn. Import vẫn bị khóa khi thiếu approval/marker.
