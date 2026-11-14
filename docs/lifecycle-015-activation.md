# Kích hoạt và chạy thử 015 — 13/11/2026

Người dùng yêu cầu thực hiện phần kích hoạt/kiểm thử còn lại của gói 015. Đã nạp manifest có receipt SQL thật, xác minh bốn hash RPC/backup binding qua service pool và mở sáu operation: ba operation tạo khách/booking cũ, `bookings.assign`, `bookings.cancel`, `bookings.cancelRooms`. Không mở tài chính/G6–G12.

Đã sửa hai lỗi code phát hiện khi chạy thật: biểu mẫu đổi phòng gửi phiên bản BookingRoom thay vì Booking; JSON SQL trả null/bỏ trường allocation khi chưa phân phòng. Mapper chỉ áp dụng cho đúng RPC 012/015 đã xác minh, chuyển danh sách rỗng sang DTO []; khi commit khôi phục đúng biểu diễn prepare để SQL so tập/version. Không thay SQL, schema hoặc quyền trong lượt kích hoạt.

Lô `SONGLAM_TEST_015` được lưu nhận diện đầy đủ trong `tools/sql/private/lifecycle/rehearsal.json`: tạo Booking 8 gồm hai phòng mới, phân một phòng, replay không tạo thêm allocation, hủy phần đó, phần còn lại vẫn CONFIRMED; hủy phần còn lại, replay cùng receipt và lookup COMMITTED. Cuối cùng cả hai phần CANCELLED, allocation duy nhất đã hủy, không giữ quỹ phòng. Không sửa năm đơn cũ.

Kết quả thực tế:

- HTTP qua backend/service pool/SQL: 9 kiểm tra đạt. Các lần thử đầu lỗi đọc DTO được sửa rồi chạy tiếp cùng ID/key; không dùng lỗi cũ làm kết quả đạt.
- SQL readback riêng đơn 8 đạt: 2 phần hủy, 1 allocation hủy, 3 mutation receipts SUCCEEDED và 3 audit cùng actor 4/UUID gốc; 4 EXECUTE đúng service user; Payment/DepositAccount/Folio của đơn đều 0.
- Hồi quy SQL lô cũ: 76 kiểm tra đạt, hash 420 Room nguyên vẹn.
- Browser readback: 13 kiểm tra đạt ở 1366/1920/390; lần khởi động Chrome đầu timeout, chạy lại đạt. Đây là kiểm tra giao diện đọc và hồi quy, không phải bằng chứng đã bấm toàn bộ thao tác mới trên UI.
- `npm.cmd test`: 178/178 fixture đạt, không dùng kết quả fixture làm kết quả SQL.

Chưa diễn tập riêng cạnh tranh đồng thời hai nhân viên đổi/hủy, lỗi truyền tải sau commit của 015 hoặc mọi nhánh từ chối có tiền/Stay/bảo trì. Replay và lookup đã chạy thật; không coi chúng là thay thế toàn bộ các kịch bản trên. Không tuyên bố nghiệm thu đầy đủ hoặc sẵn sàng vận hành. Đổi/hủy có cọc/folio vẫn bị từ chối để chờ hợp đồng tài chính/quản lý; không giả số dư hay hoàn tiền.

Mở `Start-SongLamPMS.cmd` → `http://127.0.0.1:8093/login.html`, dùng tài khoản thử có `createBooking`/`cancelBooking`. Vào Lễ tân → Đơn đặt phòng → chi tiết/phần phòng. Backend luôn kiểm quyền, version và lịch; frontend không thay quyền actor.
