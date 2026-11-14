# D2 — Gói đọc xác thực 001/003 và principal

**Hiện tại:** 004r/D1 và 001/003 đã áp dụng/kiểm chứng SQL thật ngày 12/11/2026. Xem [biên bản](first-two-execution-2026-11-12.md). 001 tạo ba RPC, 003 tạo role với đúng ba EXECUTE; chưa có thành viên role. D2-P/service principal thuộc mục 3 chưa triển khai. Nội dung xin duyệt/chưa chạy ở gói gốc bên dưới là lịch sử, không thay thế receipt mới.

D1 chọn SongLamPms_Design để ghi thử đã xác nhận và đã có marker thật. 001/003 hoàn tất phần SQL đọc xác thực; không bao gồm 002/002b, service principal, S0/005 hoặc nghiệp vụ tiền/phòng. Chưa tạo AppUser, chưa mở đăng nhập thật.

## Đối tượng và quyền chính xác

| Artifact | Tác động đề nghị trên SongLamPms_Design |
| --- | --- |
| `001-auth-read.sql.pending` | Tạo `pms.usp_AppEnvironment`, `pms.usp_AppAuthLookup @Username nvarchar(100)`, `pms.usp_AppIdentity @AppUserId bigint` |
| `003-rpc-permissions.sql.pending` | Tạo role `pms_web_auth_reader` owner dbo và đúng ba GRANT EXECUTE bên dưới |

```sql
GRANT EXECUTE ON OBJECT::pms.usp_AppEnvironment TO pms_web_auth_reader;
GRANT EXECUTE ON OBJECT::pms.usp_AppAuthLookup TO pms_web_auth_reader;
GRANT EXECUTE ON OBJECT::pms.usp_AppIdentity TO pms_web_auth_reader;
```

Không cấp SELECT toàn bảng, DML, schema-wide EXECUTE, ALTER, IMPERSONATE, db_owner hoặc sysadmin. Không sửa AppUser/UserRole/RolePermission/PrincipalBinding. AuthLookup trả hash **chỉ cho backend xác minh**, không log hoặc trả qua API; Identity trả người dùng/quyền active, không hash. Environment kiểm DB/server/marker và từ chối caller quản trị. Chưa xác minh thuật toán hash dữ liệu vì AppUser=0.

## Service principal cụ thể đề nghị — phạm vi cấp riêng

SQL Server quan sát `IsIntegratedSecurityOnly=1` (**Windows Authentication only**). Không đề nghị bật mixed mode hoặc tạo SQL password login. Đề nghị:

| Cấp | Tên chính xác | Trạng thái |
| --- | --- | --- |
| Windows account của tiến trình backend test | `DESKTOP-9EPI86K\songlam_pms_test` | Đề xuất; chưa cấp/chưa kiểm chứng có thể chạy backend |
| SQL Windows login | `DESKTOP-9EPI86K\songlam_pms_test` | Chưa tạo; không dùng token metadata hiện tại |
| Database user | `pms_web_auth_test` | Chưa tạo |
| Database role duy nhất đề nghị thêm | `pms_web_auth_reader` | Chưa tạo/cấp |

001/003 **không tự tạo hoặc thêm membership principal này**. Để gói dùng được, người dùng cần duyệt riêng D2-P bên cạnh D2-001/003: DBA xác nhận Windows account riêng, non-admin, credential do Windows/vault quản lý ngoài chat/repo; runner phải chạy thực sự dưới account đó, bằng provider hỗ trợ Integrated Authentication. Chưa chọn/cài driver; chưa provision Windows account, SQL login/user hoặc Windows service. Không mặc nhiên dùng account đang đọc metadata.

Các lệnh D2-P sau **chỉ đề xuất, không được chạy kèm 001/003 khi chưa duyệt D2-P**. DBA kiểm tên không tồn tại hoặc dừng để rà soát nếu đã có, kiểm SID và quyền kế thừa/public/Windows group. Không tự nhận dùng lại principal cũ. Sau khi OS account tồn tại và 003 thành công:

```sql
-- DBA, đúng instance DESKTOP-9EPI86K\SQLEXPRESS; chưa chạy.
USE [master];
CREATE LOGIN [DESKTOP-9EPI86K\songlam_pms_test] FROM WINDOWS;
USE [SongLamPms_Design];
CREATE USER [pms_web_auth_test] FOR LOGIN [DESKTOP-9EPI86K\songlam_pms_test];
GRANT CONNECT TO [pms_web_auth_test];
ALTER ROLE [pms_web_auth_reader] ADD MEMBER [pms_web_auth_test];
```

Lệnh CREATE LOGIN là thay đổi cấp server; phải nằm rõ trong duyệt D2-P. Không tạo AppUser bằng các lệnh này. Không thay auth mode/SQL service account. Nếu không duyệt D2-P, 001/003 chỉ là objects/role chưa có service caller. Khi triển khai D2-P cần tạo artifact khóa theo target/approval/hash trước chạy; đoạn minh họa này không phải installer.

## Trước áp dụng và trình tự đề nghị

1. Ghi người phụ trách/thời gian, xác nhận D1-000 có receipt và D1-004 có marker đúng; lưu backup, số đếm và quyền/định nghĩa cũ. Không coi quyền chọn test DB là quyền chạy D2.
2. Duyệt hash artifacts 001/003 cùng DB/server/GUID; điền riêng `@ApprovedDatabase=N'SongLamPms_Design'`, `@ApprovalReference` sau khi duyệt. Hai file hiện guard NULL, không tự thực thi.
3. Hai draft đã có guard cố định instance/GUID/marker D1, từ chối ambient transaction và objects/role đã tồn tại. Xác nhận ba RPC/role chưa tồn tại như quan sát; nếu hiện trạng khác, dừng để duyệt nâng cấp, không ghi đè. 003 còn yêu cầu đủ ba RPC từ 001. Chạy 001 rồi 003 bằng DBA; lỗi bước nào dừng bước đó, không tự chạy S0 hay binding. Guard draft chưa được biên dịch trên SQL thật.
4. Nếu D2-P được duyệt, provision/bind principal như phạm vi riêng ở trên; kiểm quyền hiệu lực và kết nối bằng đúng danh tính dịch vụ. Không dùng EXECUTE AS để thay chứng cứ kết nối thật.

Lệnh trình duyệt, **chưa chạy**:

```powershell
Get-FileHash -Algorithm SHA256 database/proposals/auth-v1/001-auth-read.sql.pending
Get-FileHash -Algorithm SHA256 database/proposals/auth-v1/003-rpc-permissions.sql.pending
sqlcmd -S 'lpc:.\SQLEXPRESS' -E -d SongLamPms_Design -b -r1 -i database/proposals/auth-v1/001-auth-read.sql.pending
sqlcmd -S 'lpc:.\SQLEXPRESS' -E -d SongLamPms_Design -b -r1 -i database/proposals/auth-v1/003-rpc-permissions.sql.pending
```

## Kiểm chứng và phục hồi

Sau duyệt: sys.procedures/parameters đối chiếu bodies/hash; sys.database_permissions có đúng ba EXECUTE; effective permissions không có quyền ngoài phạm vi qua public/group. Danh tính dịch vụ gọi Environment khớp logical marker/server/database, Identity cho ID không tồn tại trả rỗng; AuthLookup cho username không tồn tại trả rỗng (không log recordset). Caller khác bị từ chối. D2 không đủ để chạy happy-path login vì AppUser=0, S0 chưa duyệt, driver/pool bootstrap chưa có. Không tạo nhân viên hoặc phiên để làm báo cáo đẹp.

Rủi ro: role/group kế thừa quá rộng; AuthLookup lộ hash khi log recordset; ghi đè module cũ; grant nhầm SID; rollback quyền giữa các bước; chưa có driver Integrated Authentication/TLS tin cậy. Kiểm lại toàn bộ trước mở pool. D2 không cho phép command nghiệp vụ/audit helper chỉ vì đã có danh tính.

Phục hồi chỉ sau duyệt riêng: khóa runner, thu hồi membership mới và ba EXECUTE; nếu chắc chắn objects mới không có phụ thuộc, gỡ đúng objects/role/user/login mới theo thứ tự. Nếu trước đó có objects cũ, phục hồi đúng definition/grant/signature đã lưu. Không xóa AppUser, không sửa PrincipalBinding, không restore cả DB làm mất giao dịch mới. Nếu 001 thành công nhưng 003 lỗi, giữ ứng dụng khóa và báo partial deployment; không báo đăng nhập sẵn sàng.
