# Hồ sơ phê duyệt gói ngày nghiệp vụ 017

**Trạng thái cuối:** người dùng đã duyệt gói 017 và bản sửa 017a. Backup/VERIFYONLY đạt; bản 017 đầu rollback do lỗi `sql_variant`; 017a commit và đối chiếu đạt. [Receipt thực thi](database-017-final-receipt.md) là trạng thái hiện hành.

Target `.\SQLEXPRESS / SongLamPms_Design`, GUID `C4DD399E-5661-4741-A424-5ABFEEFBC1AC`, marker `test`. Chỉ bảo trì ngày nghiệp vụ thử; không mở G6 ghi, G7–G12, thu/hoàn hoặc vận hành thật.

| File được trình và duyệt | SHA-256 | Tác động |
| --- | --- | --- |
| `database/proposals/business-day/017-backup.sql.pending` | `66C2EB5F3C1F10D5A5981FADF4AD154C1508F3CDFEEDE577B0487FC2D15106C7` | Backup COPY_ONLY/CHECKSUM mới tại thư mục SQL Server, RESTORE VERIFYONLY. |
| `database/proposals/business-day/017-align-test-day.sql.pending` | `A8090729014CE905A08D64F866241BDE0FC896649237166D43DDF18A975A40D6` | Đóng 11/10/2026 bằng tổng tính từ SQL, mở 14/11/2026, audit/receipt cùng transaction. Lần đầu rollback. |
| `database/proposals/business-day/017a-align-test-day-sqlvariant.sql.pending` | `679AE3CCD6CCDDBF7FD202E0ED61EB7A64420B345365EC8FAB49C496290D182C` | Chỉ sửa kiểu receipt cho extended property và mã duyệt riêng. Lần thứ hai commit. |

Trước khi chạy: SQL thật có duy nhất 11/10 OPEN; tiền/ca/stay/folio/dịch vụ/minibar đều 0; sáu phần phòng CONFIRMED có ngày đến sớm nhất 13/12; actor AppUser 2 active, có `systemConfig`. Backend thử nghiệm được dừng; không thấy tiến trình importer. Backup mới phải đạt VERIFYONLY trước transaction. Trong transaction giữ khóa `SongLam:Inventory`, kiểm target/test marker, ngày khách sạn, rowversion và số liệu; lỗi sẽ rollback. Không tạo bản ghi BusinessDay giả cho khoảng 12/10–13/11.

Backup thực: `C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\Backup\SongLamPms_Design_Day017_20261114_7bb2fadc.bak`, UUID `D1E9B4E7-0F29-4A3A-B8A6-91B8FD099C1B`; VERIFYONLY hai lần đạt. Chưa diễn tập restore. Sau commit, 11/10 CLOSED với bốn tổng 0, 14/11 OPEN, HotelSettings trỏ 14/11; đúng 1 ApiRequest, 2 AuditLog và 1 extended property receipt. Các bảng booking/tiền/stay khác không đổi.

Phục hồi: trước commit rollback tự động. Sau commit, không tự khôi phục backup cũ vì có thể đã phát sinh giao dịch mới; phải dừng ghi, backup/đối chiếu giao dịch mới, rồi phê duyệt phương án reverse/restore riêng. Check-in 016 ghi vẫn khóa chờ phát hành và diễn tập riêng.
