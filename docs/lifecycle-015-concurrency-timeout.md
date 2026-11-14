# Diễn tập đồng thời và timeout 015 — 13/11/2026

Đã chạy thật trên `.\SQLEXPRESS / SongLamPms_Design`, thông qua G2/service pool hiện có. Không áp dụng SQL mới, không mở G6–G12, không sửa năm đơn gốc và không phát sinh giao dịch tiền.

## Bằng chứng đã chạy

`tools/verify/lifecycle-015-concurrency.mjs`: **6 kiểm tra đạt**, hai tài khoản lễ tân/quản lý G2 thật, một đơn đoàn mới **Booking 9**, hai phần phòng. Dữ liệu gắn `SONGLAM_TEST_015_RACE_...`; input/key/UUID gốc được lưu trước khi gửi trong `tools/sql/private/lifecycle/concurrency.json`.

- Cùng phiên bản đơn, cùng phần phòng, hai lệnh phân vào hai phòng khác nhau gửi đồng thời: một 200, một 409.
- Hai request song song cùng khóa của lệnh thắng: cùng operationId/replayed, không thêm allocation.
- Đọc lại SQL: chỉ một phân phòng còn hiệu lực, đúng phòng của lệnh thắng.
- Hai nhân viên cùng hủy phần phòng: một 200, một 409; phần đó giải phóng allocation, phần còn lại vẫn CONFIRMED.

`tools/verify/lifecycle-015-timeout.mjs`: **7 kiểm tra đạt** bằng Chrome headless và HTTP client/coordinator frontend thật. Hủy phần còn lại của Booking 9 dưới tài khoản quản lý. Chrome nhận server status **200** tại giai đoạn Response rồi công cụ chỉ gây lỗi truyền tải `TimedOut`; không tạo phản hồi API giả.

- Client không báo thành công, journal chuyển UNKNOWN.
- Lệnh ghi mới bị chặn trước khi gửi.
- Lookup SQL theo operation/key/UUID gốc trả COMMITTED.
- Journal chỉ được giải phóng sau xác nhận lookup; nguồn ghi hoạt động lại.
- Đọc SQL qua API: đơn CANCELLED, cả hai phần CANCELLED, không còn phân phòng hiệu lực.

`tools/sql/reconcile-015-race.mjs`: readback SQL đạt. Có 3 receipt mutation SUCCEEDED và 3 audit tương ứng, actor khớp người thắng từng cuộc đua và quản lý hủy cuối; 1 allocation đã hủy, 2 phần đã hủy, 4 EXECUTE đúng service user. Payment/DepositAccount/Folio của đơn 9 đều bằng 0. Receipt/audit được kiểm riêng theo UUID, không suy từ toast giao diện.

`tools/sql/reconcile-booking.mjs --read-only`: **76 kiểm tra hồi quy SQL đạt**, năm đơn gốc và hash toàn bộ 420 phòng giữ nguyên. Không gọi tổng giá đặt phòng là doanh thu hoặc tiền thực thu.

Hai script có checkpoint/khóa gốc cho thao tác ghi. Sau khi lô đã hủy hoàn toàn, không chạy lại toàn bộ script concurrency để khẳng định trạng thái trung gian; dùng readback và receipt đã lưu. Lần diễn tập mới cần một batch rõ ràng mới, không tự xóa checkpoint để âm thầm tạo thêm đơn.

## Phần tiếp theo chưa hoàn thành

- Đã viết `database/proposals/stays/016a-arrivals-read.sql.pending`: một RPC đọc danh sách khách đến theo ngày, version/bookingRoom/room dự kiến và phân trang; kiểm đúng quyền G2 hiện có, đề xuất một EXECUTE hẹp. Chưa áp dụng hoặc kiểm SQL. Đây chỉ là bước đọc đầu của G6, không phải hợp đồng nhận phòng đã hoàn tất.
- Check-in + mở folio/phí/khách/segment, chuyển phòng + DIRTY/task, thay đổi khoảng ở + ledger và checkout + tiền/minibar/master còn cần hợp đồng nguyên tử 16/17 riêng. Các quyết định maker-checker và quản lý duyệt từng trường hợp vẫn giữ nguyên.
- Chưa chốt giờ chốt ngày/quy trình chi hoàn và journal phân bổ cọc; không tự thay WorkingDate, CHECK/view của DepositMovement hay quyền SQL để mở chức năng.
- Diễn tập này xác minh các kịch bản 015 nêu trên, không phải nghiệm thu G6/G9 hoặc toàn bộ hệ thống vận hành. Các nhánh lỗi có tiền/Stay/bảo trì và phạm vi nghiệp vụ khác chưa được chạy trong lô này.
