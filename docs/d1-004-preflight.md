# D1-004 — Đã duyệt, còn thiếu xác nhận ngừng ghi

**Lịch sử preflight, không còn là điểm chặn hiện tại:** 004r sau đó được duyệt riêng và đã commit marker/VERIFYONLY/MULTI_USER thành công; 001/003 cũng đã áp dụng. Xem [biên bản hiện tại](first-two-execution-2026-11-12.md). Các quan sát chưa đủ bằng chứng bên dưới vẫn được giữ đúng lịch sử; không sửa thành đã xác minh cho khoảng backup cũ.

Người dùng đã duyệt riêng bằng câu **“duyệt 004”**, tham chiếu `USER-20261112-D1-004-MARKER`. Đã điền tham chiếu và receipt backup thực trong script; giữ `@WritersStoppedConfirmed=0`. Chưa thực thi file 004, chưa ghi extended properties.

Kiểm tra thực tế ngày 12/11/2026 sau phê duyệt, bằng sqlcmd Windows Authentication:

- Đúng `DESKTOP-9EPI86K\SQLEXPRESS`, database `SongLamPms_Design`, physical GUID `C4DD399E-5661-4741-A424-5ABFEEFBC1AC`.
- Hai marker vẫn chưa tồn tại: số đếm `0`.
- Số phiên người dùng khác hiện chọn database: `0`; số transaction database của session khác tại thời điểm kiểm tra: `0`.
- Lịch sử backup khớp UUID `DEF5A5E8-833A-4D0E-A886-7286CC10BE13`; COPY_ONLY và checksum đều `1`.
- Chạy lại `RESTORE VERIFYONLY ... WITH FILE=1,CHECKSUM` thành công: `The backup set on file 1 is valid.`; sqlcmd exit `0`.

Số đếm phiên/transaction là quan sát nhất thời, **không chứng minh không có ai ghi từ lúc backup hoặc không có chương trình sẽ kết nối lại**. Theo điều kiện đã nêu trong gói D1 và biên bản 000, cần người phụ trách xác nhận các nguồn ghi đã dừng và không có thay đổi từ backup lúc 11:07:18 ngày 12/11/2026 (giờ Việt Nam). Chưa có thông tin này nên chưa bật biến xác nhận và chưa ghi marker. Không tự chuyển database sang SINGLE_USER/READ_ONLY, kill session hoặc thay quyền để ép ngừng ghi.

Nếu có ghi hoặc không xác định được khoảng thời gian này: xem xét backup mới và trình duyệt riêng đường dẫn/receipt mới, không tự dùng lại tên backup cũ hay ghi đè. Phê duyệt 004 đã ghi nhận, không cần xin lại; phần thiếu là xác nhận thực tế về nguồn ghi/cửa sổ bảo trì.

## Kiểm tra lại 12/11/2026, 11:17–11:19 giờ Việt Nam

- SHA256 file 000 khớp receipt: `58771C96C3F9B7B85BAC13C133D88E38E5400F3E9B61B7891D4542AE72264C70`.
- SHA256 file 004 đã điền approval/receipt nhưng vẫn giữ `@WritersStoppedConfirmed=0`: `A9C143FF69D604FA06B94112188615AB172ECB9723DAD194EE238645A25DDE63`.
- UUID backup, server/database/GUID khớp receipt. Nội dung 004 chỉ ghi hai extended properties trong transaction sau guard và VERIFYONLY, không gọi SQL khác. VERIFYONLY riêng được chạy lại thành công, sqlcmd exit 0.
- Hai backend preview được xác định bằng PID/cổng, command pattern `src/server.js`, health `service=songlam-pms`, auth chưa cấu hình: PID 4020/cổng 8090 và PID 18276/cổng 8091. Stop-Process lỗi NullReference, không dừng được; sau đó Win32_Process.Terminate đúng hai PID trả 0. Lúc 11:19:29 xác minh không còn hai PID và không còn listener 8090/8091. Giữ hai preview dừng; không tắt Python static server 8080 hoặc process không xác định.
- Không phát hiện importer trong process Node/Python quan sát. Kiểm 189 tác vụ Windows: 0 action khớp repo/tên SongLam/database, không loại trừ launcher chung hoặc máy khác. SQL Agent Stopped; msdb có 1 job enabled nhưng 0 job enabled có step nhắc database đích. Không sửa job/service.
- Bảng nghiệp vụ, AppUser, PrincipalBinding, AuditLog, CommandExecution hiện đều 0. Tham chiếu: SchemaVersion=3, AppRole=6, Permission=19, RolePermission=46, MutationRule=100, StatusTransition=43. Không có snapshot nội dung tại backup để đối chiếu toàn bộ; số đếm không chứng minh nội dung chưa đổi.
- Có SSMS session 52/PID 20548, hiện chọn database khác, sleeping, 0 transaction; thêm session telemetry SQLServerCEIP. Phiên ở database khác vẫn có thể đổi context/truy cập tên ba phần. Không tắt SSMS/kill session chưa xác minh thuộc dự án, tránh tác động công việc khác.
- Lúc 11:19:34 transaction khác trên database = 0, marker = 0. Không có server audit/database audit specification enabled tại thời điểm kiểm, chưa có bằng chứng lịch sử liên tục để kết luận không có ghi từ backup 11:07:18 đến nay.

**Quyết định:** dừng riêng 004, không thực thi file/không tạo receipt MARKER_COMMITTED. Receipt backup giữ `writersStoppedConfirmed=false`, không bật biến xác nhận. Thiếu (1) bằng chứng không thay đổi sau backup hoặc phương án backup mới được duyệt, (2) kiểm soát nguồn ghi/kết nối có thể tái kết nối trong cửa sổ trước commit. Không đổi SINGLE_USER/READ_ONLY/quyền, không tạo audit, không dùng metadata account làm pool. Tổng hợp riêng tại `tools/sql/private/d1-004-20261112/preflight.json`.

Code độc lập marker: sửa unit tests D1 đang thừa kế approval thật làm fixture mặc định và giả định biến SQL luôn NULL; thêm `markerApproval`/`stoppedWriterEvidence` cho CLI để phân biệt đã duyệt với đủ điều kiện. CLI không kết nối SQL hoặc tự cấp quyền thực thi.

Kiểm thử đã chạy sau sửa: `node --test tests/d1-review.test.js` **7/7 đạt**; `npm.cmd test` **122/122 đạt**, 0 trượt/skip. Lần chạy D1 trước sửa có 3/6 trượt do fixture/kiểm tra NULL đã cũ; đã tái hiện và chạy lại sau sửa. Tất cả là kiểm thử code/fixture, không phải marker commit hoặc luồng SQL nghiệp vụ. Kiểm tra SQL thực tế trong lượt này chỉ là SELECT và VERIFYONLY.

## Phương án xử lý điểm chặn đã chuẩn bị

[Gói 004r](d1-004-recovery-proposal.md) đề nghị backup mới và marker trong một kết nối SINGLE_USER/NO_WAIT, trả lại MULTI_USER. Không tái sử dụng khoảng thời gian không xác minh của receipt cũ. Guard phê duyệt riêng vẫn NULL; không áp dụng thay đổi database trong lượt chuẩn bị này. Quyền chạy 004 gốc vẫn giữ nguyên, phần bổ sung backup/access mode cần duyệt riêng.
