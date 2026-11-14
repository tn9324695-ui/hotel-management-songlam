# 017: backup đạt, transaction đầu rollback; 017a đã commit

> Cập nhật cuối: 017a được người dùng phê duyệt và đã commit thành công. Xem [receipt cuối](database-017-final-receipt.md). Các đoạn mô tả “chờ duyệt” bên dưới là trạng thái lịch sử trước lần chạy 017a.

Ngày 14/11/2026, người dùng phê duyệt thực thi gói 017 theo `docs/database-017-approval.md`. Hash hai file 017 khớp tài liệu trước lúc chạy. Backend thử nghiệm PID 13000 tại cổng 8093 được dừng bằng chính service principal; sau dừng không thấy listener hay tiến trình dự án/importer tương ứng. Kiểm tra SQL chỉ đọc trước backup cho thấy đúng target/test, WorkingDate 11/10 OPEN, tất cả bảng tiền/ca/stay nêu trong preflight bằng 0. Cửa sổ ngừng ghi được kiểm tra tại thời điểm đó; **không tự mặc định nó còn hiệu lực ở một lượt sau**.

## Thực thi thực tế

- `017-backup.sql.pending` đã chạy: backup COPY_ONLY/CHECKSUM vào `C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\Backup\SongLamPms_Design_Day017_20261114_7bb2fadc.bak`; `RESTORE VERIFYONLY WITH CHECKSUM` **đạt**. UUID thực `D1E9B4E7-0F29-4A3A-B8A6-91B8FD099C1B`. Chưa thử restore.
- `017-align-test-day.sql.pending` vào transaction rồi SQL Server từ chối `sp_addextendedproperty @value=@receipt`: biến `nvarchar(max)` không tương thích `sql_variant` (206). Catch/rollback chạy; không có commit ACK.
- Kiểm tra lại SQL thật sau lỗi: vẫn một BusinessDay **2026-10-11 OPEN**, HotelSettings.WorkingDate **2026-10-11**, hai RowVer không đổi, ApiRequest **15**, AuditLog **49**, CommandExecution **0**; tất cả bảng tiền/ca/stay vẫn **0**. Kiểm đếm trực tiếp: receipt `SongLam.Day017.Release` **0**, ApiRequest Day017 **0**, AuditLog Day017 **0**. Không tuyên bố 017 hoàn thành.
- Backend thử nghiệm đang **dừng** sau lỗi để tránh ghi mới vào lúc rà soát. Trước lần tiếp theo phải kiểm tra lại tiến trình, phiên SQL, ngày, backup và toàn bộ số liệu; nếu cửa sổ bị gián đoạn thì dừng để chuẩn bị backup mới.

## Bản sửa SQL duy nhất được đề xuất: 017a

File: `database/proposals/business-day/017a-align-test-day-sqlvariant.sql.pending`  
SHA-256: `679AE3CCD6CCDDBF7FD202E0ED61EB7A64420B345365EC8FAB49C496290D182C`

Bản này sao từ file 017 nguyên gốc, thêm biến `@receiptProperty nvarchar(3750)`, kiểm `DATALENGTH(@receipt)<=7500`, chuyển receipt sang kiểu có độ dài cố định trước `sp_addextendedproperty`, và dùng mã duyệt riêng `USER-20261114-DAY017A` trong receipt. Cùng target/ngày/actor/rowversion, cùng thay đổi dự kiến của 017; không sửa bảng, quyền, thủ tục hay dữ liệu ngoài phạm vi đã trình. **Chưa thực thi 017a.**

Điều kiện nếu được duyệt riêng: đối chiếu hash 017a; xác minh backup UUID/VERIFYONLY thật nêu trên; kiểm cửa sổ ngừng ghi và preflight mới ngay trước transaction; xác nhận ngày SQL vẫn 14/11/2026, các version/số liệu chưa đổi. Nếu bất kỳ điều kiện nào thay đổi, dừng và xin gói backup/ngày mới. Sau commit cần đối chiếu hai BusinessDay, HotelSettings, hai AuditLog, ApiRequest/receipt, extended property, toàn bộ bảng tiền/ca/stay và booking không đổi. Không tự bật `stays.checkIn` trong 017a.

**Cần phê duyệt riêng file 017a và việc dùng lại backup đã VERIFYONLY** trước khi chạy. Phê duyệt 017 ban đầu chỉ áp dụng file có hash cũ, không bao gồm thay đổi SQL này.
