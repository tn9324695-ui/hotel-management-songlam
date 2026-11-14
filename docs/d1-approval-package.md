# D1 — Gói duyệt backup và marker, 11/11/2026

**Trạng thái hiện tại 12/11/2026:** D1 đã hoàn tất qua **004r**, backup mới/VERIFYONLY đạt, hai marker commit và database trở lại MULTI_USER. **001/003 đã triển khai/kiểm chứng trên SQL thật.** Xem [biên bản hai mục đầu](first-two-execution-2026-11-12.md). File 004 gốc không chạy và không cần chạy lại. 000/backup cũ giữ nguyên; không ghi fixture hoặc mở nguồn ghi vận hành. Quyết định dùng database kiểm thử giữ nguyên. Những mô tả đề nghị/chưa chạy trong phần kế hoạch gốc bên dưới chỉ là lịch sử, không thay thế receipt mới.

| Mục độc lập | Đề nghị duyệt | Trạng thái |
| --- | --- | --- |
| D1-000 | Chạy đúng `000-backup-plan.sql.pending`, tạo một backup mới và kiểm chứng | Đã duyệt và chạy 12/11/2026; COPY_ONLY/CHECKSUM/VERIFYONLY đạt; chưa restore thử |
| D1-marker | Chạy 004r trong cửa sổ kết nối độc quyền với backup mới | Đã commit/readback đúng; không chạy 004 gốc |
| D2 | 001/003 và lựa chọn service principal | 001/003 đã áp dụng; service principal thuộc mục 3 chưa làm |

Phương án [004r](d1-004-recovery-proposal.md) đã được xác nhận riêng và chạy thành công; receipt mới dùng UUID `50C40A72-2373-40B5-805D-6D249ACA9CA0`. Không tự sửa stopped-writers của backup cũ thành true.

## Đích và vị trí backup

Quan sát chỉ đọc SQL Server, không phải chứng cứ pool ứng dụng kết nối:

- Alias `.\SQLEXPRESS`; server identity `DESKTOP-9EPI86K\SQLEXPRESS`; SQL Server `16.0.1000.6`.
- Database `SongLamPms_Design`; physical database GUID `C4DD399E-5661-4741-A424-5ABFEEFBC1AC`.
- SQL service đang chạy bằng `NT Service\MSSQL$SQLEXPRESS`.
- `SERVERPROPERTY('InstanceDefaultBackupPath')` và `sys.dm_os_file_exists` xác nhận SQL Server **nhìn thấy thư mục** `C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\Backup`.
- Lần backup 000 đã chứng minh SQL service ghi được file cụ thể bên dưới. Không đổi ACL hoặc ghi file thử; quyền truy cập không được tự mở rộng. Kiểm tra ACL trước đây bị từ chối không làm mất bằng chứng backup thực tế.

File backup cụ thể trên máy SQL Server:

```text
C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\Backup\SongLamPms_Design_D1_20261111_284d423e-e6ee-428b-b4cf-67531facd064.bak
```

Media/backup name: `SongLamPms_Design_D1_20261111_284d423e-e6ee-428b-b4cf-67531facd064`. UUID trong tên khác backup_set_uuid thực `DEF5A5E8-833A-4D0E-A886-7286CC10BE13`. File đã tồn tại sau 000; không chạy lại script vào cùng path, không xóa/ghi đè/dùng lại. Bảo quản file vì có thể chứa dữ liệu nhạy cảm; không có phê duyệt đổi mã hóa hoặc ACL.

## D1-000 — Chính xác thao tác đề nghị

Artifact: [000](../database/proposals/auth-v1/000-backup-plan.sql.pending). Đã điền `USER-20261112-D1-000-BACKUP-VERIFYONLY`, chạy và lưu hash trong receipt. Target/path/media giữ nguyên. Không chạy lại file này vì file backup đã tồn tại.

Lệnh bên dưới mô tả bước 000 đã thực hiện; log/output chính xác tại receipt. Không phải hướng dẫn chạy lại. Danh tính triển khai không được dùng làm service pool:

```powershell
Get-FileHash -Algorithm SHA256 database/proposals/auth-v1/000-backup-plan.sql.pending
sqlcmd -S 'lpc:.\SQLEXPRESS' -E -d SongLamPms_Design -b -r1 -i database/proposals/auth-v1/000-backup-plan.sql.pending
```

Toàn bộ guard/SELECT có trong file: kiểm DB/server/GUID, không có transaction bên ngoài, thư mục tồn tại và file đích chưa có. Hai câu thực thi trên file:

```sql
BACKUP DATABASE @ApprovedDatabase TO DISK=@BackupPath
 WITH COPY_ONLY,CHECKSUM,NOFORMAT,NOINIT,NOSKIP,MEDIANAME=@MediaName,NAME=@MediaName;
RESTORE VERIFYONLY FROM DISK=@BackupPath WITH FILE=1,CHECKSUM;
```

Giá trị biến cố định đúng như mục đích/path/media ở trên. **Ghi:** một file `.bak` mới và lịch sử backup chuẩn của SQL Server trong `msdb`. Không ghi bảng nghiệp vụ `pms`, không tạo nhân viên, không ghi marker, không thay quyền, không gọi 004/D2. COPY_ONLY không thay differential base. Đây vẫn là thao tác có ghi file/hệ thống, nên phải duyệt riêng.

Chỉ nhận bằng chứng thành công khi sqlcmd exit 0, VERIFYONLY thành công và đúng một hàng lịch sử khớp database GUID/tên/media/path/type D/position 1/COPY_ONLY/CHECKSUM/finish time. Lưu output `BACKUP_VERIFYONLY_SUCCEEDED_NOT_RESTORE_TESTED`, **backup_set_uuid thực**, thời điểm, người chạy và hash file SQL. Không bịa UUID receipt từ UUID tên media.

**Điểm dừng:** target lệch; file tồn tại; lỗi đọc metadata, quyền, dung lượng, BACKUP, VERIFYONLY hoặc history mismatch: exit khác 0, không cấp receipt thành công, **không chạy 004, D2, seed hay kiểm thử ghi**. File dở dang/history có thể đã được tạo; giữ nguyên để điều tra. Retry cần xét lại tên file mới và duyệt lại, không tự xóa file dở hoặc dùng INIT/FORMAT/REPLACE. Backup thành công không tự cấp quyền bước sau.

VERIFYONLY kiểm tra khả năng đọc/cấu trúc/checksum backup; **không phải diễn tập restore hoặc kiểm thử nghiệp vụ**. Đề nghị DBA restore sang đích tách biệt phải được duyệt riêng cả tên đích, đường dẫn data/log và bảo vệ dữ liệu. Không có lệnh RESTORE DATABASE trong gói này. Nếu khôi phục DB hiện có: dừng ghi, bảo toàn mọi giao dịch sau backup, duyệt kế hoạch riêng và xoay session epoch trước khi mở lại.

## D1-004 — Marker dự kiến, chưa ghi

Artifact: [004](../database/proposals/auth-v1/004-test-marker.sql.pending). Chỉ đề nghị **hai** database-level extended properties:

| Tên | Giá trị dự kiến | Hiện trạng quan sát |
| --- | --- | --- |
| `SongLam.Environment` | `test` | Đã commit/readback qua 004r |
| `SongLam.TestIdentity` | `eb18c6f2-373d-4a83-a34f-d9809f1cbc7a` | Đã commit/readback qua 004r |

Đây là định danh logic mới, khác physical database GUID; không phải dữ liệu đã quan sát. Runtime profile chỉ được dùng giá trị này sau khi 004 thực sự commit và xác minh lại.

Phê duyệt riêng 004 đã ghi nhận (`USER-20261112-D1-004-MARKER`), receipt UUID thực đã điền. Điều kiện còn thiếu là bằng chứng cửa sổ ngừng ghi liên tục và không có nguồn ghi khác. `@WritersStoppedConfirmed=0` vẫn giữ nguyên. Chỉ chuyển thành 1 sau bằng chứng thực tế; số phiên bằng 0 hoặc bảng hiện trống không chứng minh lịch sử không đổi. Nếu cửa sổ không xác minh được, xem xét backup mới với path/receipt được duyệt riêng.

```powershell
# 004 đã được duyệt; chưa chạy vì thiếu bằng chứng ngừng ghi.
Get-FileHash -Algorithm SHA256 database/proposals/auth-v1/004-test-marker.sql.pending
sqlcmd -S 'lpc:.\SQLEXPRESS' -E -d SongLamPms_Design -b -r1 -i database/proposals/auth-v1/004-test-marker.sql.pending
```

Script kiểm đúng target/GUID và receipt `msdb`, chạy **lại** VERIFYONLY đúng file/FILE=1/CHECKSUM trước khi mở transaction. Trong transaction: từ chối nếu một trong hai marker đã tồn tại; `sys.sp_addextendedproperty` ghi `SongLam.Environment=test` và `SongLam.TestIdentity` như trên; commit rồi mới trả `MARKER_COMMITTED`. Không cập nhật marker cũ, không tạo bảng/procedure/login, không ghi khách/phòng/tiền. Lỗi trước hoặc trong transaction: không báo thành công; rollback hai properties nếu chưa commit. Nếu timeout sau commit, đọc lại properties trước mọi retry.

Kiểm chứng sau khi được duyệt:

```sql
SELECT name, CONVERT(nvarchar(128),value) AS Value
FROM sys.extended_properties
WHERE class=0 AND name IN (N'SongLam.Environment',N'SongLam.TestIdentity');
```

Phục hồi marker: khóa ứng dụng, xác minh không còn phụ thuộc, trình riêng việc xóa đúng hai properties vừa thêm. Không xóa dữ liệu hoặc restore cả database chỉ để gỡ marker. Marker không tự chứng minh môi trường an toàn hoặc cấp quyền ghi.

## Kiểm tra ngoại tuyến và phạm vi chưa thực hiện

`deploy/d1-review.json` ghi quyết định chọn test DB và hai phê duyệt thực; không phải runtime profile hay receipt. CLI đọc file báo backup approval recorded, marker approval RECORDED nhưng execution BLOCKED khi thiếu ngừng ghi. Receipt JSON thực ở `tools/sql/private/d1-000-20261112/receipt.json`; CLI chỉ kiểm tính nhất quán, không truy cập SQL hoặc tự chứng minh backup/cửa sổ ngừng ghi.

Quan sát số đếm trước: AppUser=0, UserRole=0, PrincipalBinding=0; các bảng nghiệp vụ chính 0, có bảng tham chiếu. Không có tài khoản nhân viên thử, không nhập fixture, chưa kiểm nguồn localStorage thật. 102/102 trước đây là **fixture/provider giả**, không phải luồng SQL Server; kết quả mới ghi ở [nhật ký lượt này](d1-d2-verification.md).
