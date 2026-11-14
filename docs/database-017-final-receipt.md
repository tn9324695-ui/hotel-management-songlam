# Kết quả gói 017/017a — 14/11/2026

Phê duyệt 017 và bản vá 017a được người dùng xác nhận riêng. Target `.\SQLEXPRESS / SongLamPms_Design`, GUID `C4DD399E-5661-4741-A424-5ABFEEFBC1AC`, marker `test`. Không thay schema, stored procedure, trigger hoặc quyền SQL.

- Backup COPY_ONLY/CHECKSUM: `C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\Backup\SongLamPms_Design_Day017_20261114_7bb2fadc.bak`, UUID `D1E9B4E7-0F29-4A3A-B8A6-91B8FD099C1B`. `RESTORE VERIFYONLY WITH CHECKSUM` đạt hai lần. Chưa diễn tập restore.
- Lần chạy đầu lỗi kiểu `nvarchar(max)` tại extended property, transaction rollback; kiểm lại không có dòng 017 nào. Bản sửa 017a hash `679AE3CCD6CCDDBF7FD202E0ED61EB7A64420B345365EC8FAB49C496290D182C` sau đó **commit thành công**. RequestId `CCD10839-68D6-4AAB-91AE-C0599B54C042`, actor AppUser 2. Receipt trong ApiRequest và extended property `SongLam.Day017.Release`.
- Đối chiếu SQL sau commit: BusinessDay 11/10/2026 `CLOSED`, bốn tổng snapshot đều **0** lấy từ view nguồn; BusinessDay 14/11/2026 `OPEN`; HotelSettings.WorkingDate `2026-11-14`. Chính xác 1 ApiRequest, 2 AuditLog gắn cùng transaction; CommandExecution 0 sau commit. Khoảng ngày 12/10–13/11 được ghi rõ là không có BusinessDay, không tạo giao dịch/ngày giả.
- Stays, folios, deposits, payments, refunds, shifts, invoices, service orders, minibar audits vẫn **0**. Booking 7, BookingRoom 10, Room 420 và RateRule 20 không đổi. Không có FK/check constraint/trigger bị tắt.
- Backend thử nghiệm chạy lại dưới service principal riêng: SQL identity verified. 016 đọc xác minh 8 module, 5 EXECUTE/2 DENY; `checkInDateReady=true`. Release được cập nhật đúng trạng thái **`CHECK_IN_WRITES_NOT_RELEASED`**, chỉ 6 thao tác booking/khách cũ mở; check-in ghi vẫn khóa, không lẫn với vấn đề ngày nữa.
- Hồi quy: `npm.cmd test` **181/181 fixture pass**, `reconcile-booking.mjs --read-only` **76 SQL checks pass**, `checkin-016-read.mjs` **9 HTTP checks pass**. Chưa có check-in commit/folio trên SQL; không nghiệm thu G6 bằng những kết quả này.
- `verify-day017-readonly.mjs` đối chiếu receipt trong extended property **bằng** ApiRequest, hai AuditLog cùng RequestId/actor, hai BusinessDay, số bản ghi nguồn không đổi; `usp_AssertBusinessState` đạt khi giữ khóa inventory trong transaction chỉ đọc rồi rollback.

Bước tiếp theo cần phát hành ghi `stays.checkIn` 016 riêng, tạo booking thử đúng ngày và đối chiếu đầy đủ giao dịch. G7–G10 vẫn chưa có hợp đồng SQL vận hành được nạp.
