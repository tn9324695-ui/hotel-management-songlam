# D1-000 — Bằng chứng thực thi ngày 12/11/2026

## Phạm vi và quyết định

Người dùng trả lời **“hãy làm”** ngay sau yêu cầu duyệt riêng file 000 để backup/VERIFYONLY. Tham chiếu nội bộ: `USER-20261112-D1-000-BACKUP-VERIFYONLY`. Chỉ điền approval reference và chú thích trong 000; không thay target/path/media hoặc câu lệnh backup. Không có phê duyệt đi kèm cho 004, D2 hoặc tài khoản nhân viên.

## Kết quả thực tế

| Bằng chứng | Giá trị |
| --- | --- |
| Instance / database | `DESKTOP-9EPI86K\SQLEXPRESS` / `SongLamPms_Design` |
| Physical database GUID | `C4DD399E-5661-4741-A424-5ABFEEFBC1AC` |
| Kết thúc backup, theo SQL Server | `2026-11-12T04:07:18Z` (11:07:18 giờ Việt Nam) |
| sqlcmd exit code | `0` |
| Backup set UUID thực | `DEF5A5E8-833A-4D0E-A886-7286CC10BE13` |
| COPY_ONLY / backup checksum / position | `true` / `true` / `1` |
| Kích thước theo msdb | `8,085,504` bytes |
| VERIFYONLY | `The backup set on file 1 is valid.` |
| Kết luận | `BACKUP_VERIFYONLY_SUCCEEDED_NOT_RESTORE_TESTED` |
| SHA256 script đã chạy | `58771C96C3F9B7B85BAC13C133D88E38E5400F3E9B61B7891D4542AE72264C70` |

File backup trên máy SQL Server, giữ nguyên đường dẫn đã được duyệt (ngày trong tên là ngày lập gói, không phải ngày thực thi):

```text
C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\Backup\SongLamPms_Design_D1_20261111_284d423e-e6ee-428b-b4cf-67531facd064.bak
```

Trước chạy đã đọc lại đúng server/database/GUID; SQL nhìn thấy thư mục; file chưa tồn tại. Windows CIM ghi nhận ổ C còn `107,786,530,816` bytes; database cấp phát `16,777,216` bytes. Không thay ACL, quyền SQL hoặc cấu hình server. Danh tính triển khai dùng Windows Authentication qua sqlcmd; không cấu hình danh tính đó cho pool backend.

Lệnh thực thi chính:

```powershell
sqlcmd -S 'lpc:.\SQLEXPRESS' -E -d SongLamPms_Design -b -r1 -W -s '|' -i database/proposals/auth-v1/000-backup-plan.sql.pending -o tools/sql/private/d1-000-20261112/sqlcmd-output.txt
```

File 000 thực hiện `BACKUP DATABASE ... WITH COPY_ONLY,CHECKSUM,NOFORMAT,NOINIT,NOSKIP`, `RESTORE VERIFYONLY ... FILE=1,CHECKSUM` và đối chiếu đúng một lịch sử backup. Đã đọc lại msdb theo backup UUID thực để tạo receipt. Một lần truy vấn xuất receipt lỗi do sqlcmd không cho kết hợp `-h -1` với `-y 0`; đã sửa thành `-y 4000` và đọc thành công, **không chạy lại BACKUP**.

Bằng chứng riêng không đưa vào Git: `tools/sql/private/d1-000-20261112/receipt.json`, `sqlcmd-output.txt`, `script.sha256`. Receipt ghi `writersStoppedConfirmed=false`: không có bằng chứng cửa sổ ngừng ghi liên tục, không suy diễn từ backup thành công.

## Giới hạn và điểm dừng

Chỉ tạo file backup và lịch sử backup hệ thống trong msdb. Không ghi bảng nghiệp vụ, tạo marker, fixture, tài khoản hay quyền. SELECT sau backup xác nhận số marker `SongLam.Environment` / `SongLam.TestIdentity` là **0**. Không chạy 001/002/002b/003/004/005. Không bật runtime hoặc đăng nhập thật.

VERIFYONLY không phải diễn tập restore hoặc kiểm thử nghiệp vụ. Chưa kiểm thử khôi phục database, không có bằng chứng luồng frontend → backend → SQL nghiệp vụ. Không tự xóa file backup/khôi phục DB. File chứa nội dung database, cần bảo quản theo chính sách backup hiện tại; không tự mở rộng quyền đọc file.

Bước tiếp theo **004 đã được duyệt riêng** sau lần backup này, nhưng chưa thực thi; xem [preflight hiện tại](d1-004-preflight.md). Vẫn phải xác minh người phụ trách/cửa sổ ngừng ghi, đánh giá khoảng thời gian từ backup đến marker và kiểm chứng lại backup. Nếu không bảo đảm cửa sổ liên tục, phải xem xét lại tính đủ mới của backup và trình backup mới để duyệt; không tự dùng receipt để bật marker. D2 và kho phiên vẫn cần các phê duyệt riêng đã ghi trong gói tương ứng.
