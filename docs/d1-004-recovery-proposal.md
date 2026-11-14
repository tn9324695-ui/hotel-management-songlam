# D1-004 — Phương án khắc phục cửa sổ ngừng ghi

**Tạm dừng theo yêu cầu mới của người dùng:** không tiếp tục 004r trong lượt chạy thử frontend/backend. File đề xuất giữ nguyên và không thực thi; ưu tiên kiểm tra đăng nhập/dữ liệu thật trong giới hạn hợp đồng SQL đã được duyệt.

**Chỉ là đề xuất, chưa chạy.** 000 đã chạy/VERIFYONLY đạt; 004 đã được duyệt nhưng chưa thực thi. Không có bằng chứng cho khoảng sau backup cũ nên không tự đổi `WritersStoppedConfirmed=1`. Không phát hiện bằng chứng lỗi cú pháp qua đọc code; 004 chưa được thực thi/biên dịch trên SQL Server. Chốt an toàn đang từ chối đúng điều kiện thiếu.

## Gói cần duyệt riêng

File cụ thể: [004r-controlled-window.sql.pending](../database/proposals/auth-v1/004r-controlled-window.sql.pending). Guard `@ControlledWindowApprovalReference=NULL` dừng trước mọi ghi. Đây là phiên bản thao tác bảo trì mở rộng, **không tự hưởng phê duyệt của 004**.

| Thao tác | Phạm vi/tác động | Điều kiện dừng |
| --- | --- | --- |
| Kiểm target/GUID/trạng thái/marker/path | Đúng `.\SQLEXPRESS / SongLamPms_Design`; physical GUID cũ; không đổi file backup cũ | Target lệch, DB không ONLINE/MULTI_USER hoặc marker/path mới đã tồn tại |
| `SET SINGLE_USER WITH NO_WAIT` | Tạm thay chế độ truy cập database; một kết nối sqlcmd đang ở database giữ quyền truy cập trong cả khoảng backup → marker | Có tranh chấp thì từ chối; không kill session/ROLLBACK IMMEDIATE, không tự đóng SSMS |
| Backup mới COPY_ONLY/CHECKSUM, VERIFYONLY | File mới bên dưới + lịch sử msdb; receipt mới thực tế, không dùng UUID cũ | Backup/verify/history sai: không ghi marker; giữ file dở dang |
| Ghi hai marker, transaction, readback | Chính hai tên/giá trị đã duyệt của 004; không thay dữ liệu nghiệp vụ | Lỗi trong transaction: rollback; sau commit: đọc lại, không thử lại mù |
| `SET MULTI_USER WITH NO_WAIT` | Trả lại chế độ truy cập ban đầu trước khi báo hoàn tất | Không trả được thì báo recovery required, không báo toàn bộ thành công |

Backup mới **dự kiến**, chưa tồn tại và không phải bằng chứng đã thực hiện:

```text
C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\Backup\SongLamPms_Design_D1R_20261112_b5f52bd3-8131-4193-954d-69cc81fca420.bak
```

Media/name: `SongLamPms_Design_D1R_20261112_b5f52bd3-8131-4193-954d-69cc81fca420`. Backup_set_uuid phải lấy từ msdb sau backup thật, không lấy UUID tên file. Giữ backup cũ nguyên vẹn.

## Trước chạy

1. Duyệt riêng backup mới + tạm SINGLE_USER/khôi phục MULTI_USER + dùng marker trong cùng kết nối theo file 004r. Không bao gồm 001/002/002b/003/005, seed hoặc thay quyền.
2. Dừng preview/importer thuộc dự án; kiểm lại SQL Agent/job/task và các nguồn ghi. Hai preview đã dừng ở lần preflight trước phải được kiểm lại, không suy diễn trạng thái cũ.
3. Người phụ trách kết thúc các kết nối SSMS vào database đích; không tự kill session hoặc đóng ứng dụng có công việc chưa lưu. NO_WAIT là chốt từ chối nếu vẫn tranh chấp. Không dùng Object Explorer/pool để chạy gói này.
4. Kiểm lại quyền backup/ALTER DATABASE/extended properties hiện có, dung lượng, thư mục và hash bản sẽ chạy; không tự cấp thêm quyền. SQL deployment identity không dùng làm service pool.
5. Script từ chối nếu AUTO_UPDATE_STATISTICS_ASYNC đang bật, không tự đổi. DBA phải xác nhận không có thành phần nền tranh slot SINGLE_USER. Căn cứ [Microsoft: ALTER DATABASE SET options](https://learn.microsoft.com/en-us/sql/t-sql/statements/alter-database-transact-sql-set-options?view=sql-server-ver16). Không khẳng định script đã kiểm chứng tích hợp.

Lệnh đề nghị sau phê duyệt, chưa chạy:

```powershell
Get-FileHash -Algorithm SHA256 database/proposals/auth-v1/004r-controlled-window.sql.pending
sqlcmd -S 'lpc:.\SQLEXPRESS' -E -d SongLamPms_Design -b -r1 -i database/proposals/auth-v1/004r-controlled-window.sql.pending -o tools/sql/private/d1-004r-output.txt
```

Chỉ điền mã phê duyệt thật sau khi được duyệt. Không chạy 004 gốc tiếp sau 004r: hai property đã tồn tại phải được xác minh, không thêm lần hai.

## Kiểm chứng và phục hồi

- Chỉ nhận kết quả hoàn tất khi sqlcmd exit 0, backup/VERIFYONLY/history khớp, hai property đọc đúng và database đã MULTI_USER. Lưu hash script, raw output riêng, UUID mới, giờ bắt đầu/kết thúc và readback thành receipt thực thi.
- Kiểm tra chuỗi lệnh/fixture ngoại tuyến không phải chứng minh độc quyền SQL thật. Một quản trị viên khác thay access mode giữa cửa sổ nằm ngoài kiểm soát của script, cần cửa sổ bảo trì được người phụ trách quản lý.
- Mất kết nối/timeout có thể để database SINGLE_USER hoặc marker đã commit. Không báo thất bại đồng nghĩa chưa ghi. DBA đọc mode/marker/msdb trước retry; có thể cần kết nối quản trị chuyên dụng để phục hồi. Không tự rollback marker đã commit.
- Lệnh phục hồi mode cần DBA xác nhận đúng đích và không còn thao tác bảo trì: `ALTER DATABASE [SongLamPms_Design] SET MULTI_USER WITH NO_WAIT;`. Chỉ trình, không chạy trong lượt chuẩn bị này; không dùng ROLLBACK IMMEDIATE để ép thoát.
- Không RESTORE DATABASE, không xóa backup hoặc dữ liệu. VERIFYONLY vẫn không phải diễn tập restore. Nếu cần xóa marker/restore phải duyệt riêng; giữ mọi giao dịch phát sinh.

Sau duyệt sẽ kiểm lại trạng thái thực tế, chạy đúng gói, lưu receipt rồi cập nhật D1. Chưa mở pool/đăng nhập/nguồn ghi vận hành.
