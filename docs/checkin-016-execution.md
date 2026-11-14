# Thực thi gói 016 — 14/11/2026

Người dùng duyệt riêng gói 016 bằng “duyệt hãy tiếp tục làm”; reference `USER-20261114-016`. Không bao gồm đổi ngày nghiệp vụ, thu/hoàn tiền hoặc G9.

## Đã áp dụng trên SQL thật

- Target `.\SQLEXPRESS / SongLamPms_Design`, GUID `C4DD399E-5661-4741-A424-5ABFEEFBC1AC`.
- Hash gói đã đối chiếu `bd7c9040def8bf00a00771f8c6f30088f3034a30dcdd3170c878ad59e73989a5`; đủ 26 hash baseline khớp trước chạy.
- Khi bắt đầu không có listener backend 8093. Các lần kiểm tra DMV trước backup/trong transaction/trước commit không thấy phiên người dùng khác ở database. Không tự điền cờ xác nhận con người đã ngừng ghi.
- Backup COPY_ONLY/CHECKSUM + VERIFYONLY đạt: `C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\Backup\SongLamPms_Design_CheckIn016_20261113_d6a7d1e0.bak`.
- Backup UUID thật `DFAD262B-E306-4C83-AFA0-32270BF06ACB`. Chưa diễn tập restore.
- 8 đối tượng được CREATE, 5 EXECUTE và 2 DENY đúng service user, receipt `SongLam.CheckIn016.Release` commit cùng transaction. Không ALTER bảng/trigger/thủ tục cũ, không sửa RolePermission, WorkingDate hoặc seed dữ liệu.
- Readback SQL xác nhận đủ tám hash, ANSI_NULLS/QUOTED_IDENTIFIER ON, đúng năm GRANT/hai DENY. Receipt/hash lưu ở `tools/sql/private/lifecycle/deployment-016.json`, backup receipt và `verification-016.json`.

## Trạng thái runtime

Đã nạp code và contract 016 vào staging dưới tài khoản dịch vụ riêng; proof tám module và workflow policy/source policy được kiểm từ SQL thật. Đã mở **đọc** G6; giữ sáu thao tác ghi khách/booking/015 cũ.

`release.checkIn.writesEnabled=false`: ngày nghiệp vụ SQL là **11/10/2026 OPEN**, còn ngày thực tế khách sạn do SQL xác định là **14/11/2026**. `/deployment` trả `checkInReadVerified=true`, `checkInWriteBlocker=BUSINESS_DATE_REVIEW_REQUIRED`; không có `stays.checkIn` trong danh sách thao tác được mở. Giao diện giải thích khóa ngày thay vì nói chưa triển khai SQL. SQL commit cũng có chốt ngày độc lập.

Không tạo Stay, Folio, Payment hoặc DepositAccount; readback sau triển khai đều 0. Không tạo đặt phòng thử mới chỉ để vượt chốt ngày. Không thay đồng hồ SQL/backend/browser hoặc dùng mock cho kết quả đạt.

## Kiểm tra thực tế

| Kiểm tra | Kết quả |
| --- | --- |
| `npm.cmd test` | 181/181 fixture đạt; khác kiểm thử SQL thật |
| `verify-checkin-016.mjs` | Tám định nghĩa, năm EXECUTE/hai DENY, clock và counts SQL thật đạt |
| `checkin-016-read.mjs` | 9 kiểm tra HTTP thật đạt: list rỗng, khách đến tương lai, readiness có blocker, 404, quyền buồng phòng, khóa check-in và sáu operation cũ |
| `booking-sql-ui-readback.mjs` | 13 kiểm tra browser đạt ở 1366/1920/390 |
| `reconcile-booking.mjs --read-only` | 76 kiểm tra hồi quy SQL đạt, giữ nguyên năm đơn gốc và hash 420 Room |
| Launcher | Xác minh backend/SQL thật; `http://127.0.0.1:8093/login.html` |

Đã biên dịch/CREATE SQL 016 thành công; chưa chạy nhận phòng ghi thành công, concurrency check-in, timeout check-in hoặc đối chiếu phí/segment mới. Không dùng kết quả đọc hoặc fixture để nghiệm thu các luồng đó.

## Phụ thuộc cần duyệt tiếp

Cần phương án riêng cho ngày nghiệp vụ. Không tự sửa HotelSettings/BusinessDay trong phạm vi 016. Trước khi đề xuất điều chỉnh phải kiểm các ca, Payment, FolioEntry, StaySettlement, DepositMovement, refund/invoice và mọi chứng từ; nếu có phát sinh thì không được đóng ngày bằng snapshot 0.

Phương án chỉ dành cho môi trường test, nếu xác minh hoàn toàn chưa có phát sinh tài chính/lưu trú/ca: backup mới, đóng ngày test cũ với snapshot đối chiếu thật, mở ngày test đúng ngày khách sạn và cập nhật WorkingDate cùng transaction; không tạo giao dịch giả cho các ngày bỏ qua, không đổi giá/lịch đặt, audit/receipt đúng actor maintenance và không cấp backend quyền chốt ngày. Phải trình script và được duyệt riêng trước khi chạy. Đây chưa phải gói SQL đã áp dụng hoặc phê duyệt G9.

Khi ngày đủ điều kiện mới lập hồ sơ mở `stays.checkIn`, tạo lô SONGLAM_TEST mới theo giờ thực và chạy các kịch bản nhận phòng. Chuyển phòng/gia hạn/trả sớm/checkout/thu/hoàn vẫn chưa mở trong gói này.
