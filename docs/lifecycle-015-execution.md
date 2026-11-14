# Receipt triển khai 015 — 13/11/2026

Người dùng duyệt riêng gói 015 qua phản hồi “hãy làm đi” vào yêu cầu gồm backup, bốn RPC, bốn EXECUTE và receipt; reference `USER-20261113-015`.

- Hash gói đối chiếu: `1b47ffd431b635801dde95e11507257be2daa1632835099136d7335e57b34393`.
- Target: `.\SQLEXPRESS / SongLamPms_Design`, GUID `C4DD399E-5661-4741-A424-5ABFEEFBC1AC`.
- Backend PID 19948 đã dừng bằng helper dưới service identity; listener 8093 không còn. DMV không phát hiện phiên người dùng khác ở database tại các mốc kiểm tra trước backup, trong transaction và trước commit. Đây là quan sát tiến trình/phiên, không phải khẳng định đã phỏng vấn mọi người dùng ngoài hệ thống.
- Backup COPY_ONLY/CHECKSUM và VERIFYONLY thành công: `C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\Backup\SongLamPms_Design_Lifecycle015_20261113_935b5e35.bak`.
- Backup UUID: `97513463-3FBD-47CE-8601-794C2FD346FC`. Chưa diễn tập restore.
- Bốn CREATE, bốn GRANT EXECUTE đúng service user và extended property `SongLam.Booking015.Release` đã commit cùng transaction. Không đổi RolePermission, bảng, trigger, giá hoặc dữ liệu nghiệp vụ.
- Định nghĩa bốn module được đọc lại và lưu vào `tools/sql/private/lifecycle/deployment-015.json`.
- `prepare-lifecycle-runtime.mjs` đã tạo cấu hình private **chưa kích hoạt**; chưa chép cấu hình đổi/hủy vào runtime đang chạy.
- Đối chiếu SQL sau triển khai: **76 kiểm tra đạt**, giữ nguyên 5 đơn, 6 dòng phòng/allocations, 1 khách thử, 6 receipt nghiệp vụ cũ, 28 audit và hash toàn bộ 420 Room. Thực thu/cọc 0đ.
- Launcher đã khởi động lại backend thử, PID 1352 và xác minh kết nối SQL thật, giữ nguyên ba thao tác ghi cũ. URL `http://127.0.0.1:8093/login.html`.

Chưa kiểm thử command đổi/hủy, concurrency hoặc timeout của 015 qua service pool/giao diện; chưa nghiệm thu nghiệp vụ 015. Không mở G6–G12 hoặc tài chính. Báo cáo review trước triển khai ở `lifecycle-next-approval.md` là lịch sử phạm vi đề xuất, được receipt này cập nhật về trạng thái SQL đã áp dụng.
