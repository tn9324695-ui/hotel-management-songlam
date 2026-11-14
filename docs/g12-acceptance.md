# Nghiệm thu vận hành G12 — tất cả CHƯA KIỂM TRA

Tài liệu để thực hiện sau phê duyệt trên đúng build/environment/DB. Chưa viết/chạy test hay mở trình duyệt trong lượt G12. Không tick PASS từ việc code có route hoặc từ kết quả demo. Mỗi ca kiểm cần người thực hiện, quyền thực tế, ngày giờ, buildId/target fingerprint, request/receipt/source reference, ảnh hoặc báo cáo được che dữ liệu khách, kết quả mong đợi/thực tế và người duyệt. Hồ sơ lưu riêng ngoài Git/public API.

| Vai trò | Luồng kiểm thực tế bắt buộc | Điều kiện đạt | Hiện tại |
| --- | --- | --- | --- |
| Lễ tân | Đăng nhập, hết hạn, khóa user/thu hồi quyền, khôi phục phiên | Backend xác minh người thật; phiên cũ hết quyền không ghi; unknown request không mất khi đăng nhập lại; không giả đăng nhập | Chưa kiểm tra; login UI vẫn khóa |
| Lễ tân | Tìm phòng, timeline [nhận,trả), đặt lẻ/đoàn, gửi lặp và hai nhân viên đồng thời | Đúng từng đêm, không overbook, đoàn atomic, snapshot giá giữ nguyên, tương lai không thành đang ở | Chưa kiểm tra; màn lễ tân API chưa nối |
| Lễ tân | Gán/đổi phòng dự kiến; hủy toàn phần/phần chưa nhận | Block/maintenance xung đột bị từ chối; lý do/audit; phân bổ cọc không bị dồn ngầm | Chưa kiểm tra |
| Lễ tân | Nhận từng phòng đoàn, khách đồng hành | Đúng booking-room/guest/room, sạch/khai thác hợp lệ, không double-count stay+booking, pending cọc không thành đã thu | Chưa kiểm tra |
| Lễ tân | Chuyển phòng, gia hạn, trả sớm | Lịch segment/actor/lý do đủ, version chống đè, kiểm khoảng thời gian, giá trước/sau đúng; không quyết toán/hoàn ngầm | Chưa kiểm tra |
| Buồng phòng | Claim/start/submit/unable/inspect | Hai người không nhận trùng, chỉ người có quyền nghiệm thu đánh sạch; chưa chốt quyền thì dừng ở chờ kiểm tra | Chưa kiểm tra |
| Buồng phòng | Bảo trì/block, sau sửa, đồ thất lạc | Không âm thầm chuyển/hủy khách; block tác động quỹ/phân/check-in; sửa xong không tự sạch; custody không trả hai lần | Chưa kiểm tra |
| Dịch vụ/buồng phòng | Ghi/giao/hủy dịch vụ, kiểm minibar 0đ và có tiêu thụ | Đúng stay/segment/giá chốt, một phí mỗi dòng, cancel credit có nguồn; buồng phòng không thấy dư nợ ngoài quyền | Chưa kiểm tra |
| Thu ngân/kế toán | Cọc thu/apply/unapply/hoàn/phân bổ | Có movement và entry gốc, available không âm, giữ lịch sử; không biến số dư nhập thành giao dịch mới | Chưa kiểm tra |
| Thu ngân/kế toán | Tiền mặt, ngân hàng pending, refund/request/approval/complete | Thu/hoàn đúng một lần; không browser-confirm bank; quyền tạo/duyệt đúng policy; không có policy thì khóa | Chưa kiểm tra |
| Thu ngân/kế toán | Checkout phòng riêng và từng phòng đoàn/master | Preview khớp từng nguồn, minibar 0đ hợp lệ, cọc/thu/hoàn/transfer đúng; toàn transaction hoặc không gì; phòng về bẩn/chờ dọn | Chưa kiểm tra |
| Thu ngân/kế toán | Mở/kiểm đếm/chốt ca, chốt ngày/phiếu | Cash drawer/phương thức/actor/ngày đúng timezone; chênh lệch giữ nguyên; không ghi lùi ngày đã đóng; e-invoice chưa tích hợp không báo phát hành | Chưa kiểm tra |
| Quản lý | Dashboard, doanh thu/thực thu/công nợ; lọc kỳ/nhóm | Định nghĩa/nguồn/kỳ rõ, số 0 thật khác thiếu đối soát, master đúng; không demo KPI/thống kê tăng trưởng bịa | Chưa kiểm tra |
| Quản lý/bảo mật | Users/roles/audit/exceptions/internal status | Không lộ hash/token/session/giấy tờ/số dư ngoài quyền; không sửa/xóa audit; không cấp quyền mới; exceptions không thành doanh thu | Chưa kiểm tra |
| Trực vận hành | G11 baseline và delta từ activation watermark | Không bỏ bản ghi thật; zero money diff theo từng booking/stay/master; links/receipts đầy đủ, unknown/ghi kép khóa mọi instance | Chưa kiểm tra; thiếu hợp đồng delta |

## Giao diện, lỗi và phục hồi

| Môi trường/tình huống | Điều kiện đạt cần chứng cứ thực tế | Hiện tại |
| --- | --- | --- |
| 1366×768 | Banner/menu/modal không che nút; bảng lọc/phân trang/thao tác dùng được; không tràn trang làm mất thao tác | Chưa kiểm tra |
| 1920×1080 | Bảng, cột tiền/trạng thái và kỳ báo cáo đọc rõ; không khoảng trắng gây lạc luồng | Chưa kiểm tra |
| Màn nhỏ (ví dụ 390×844) | Menu thu gọn có bàn phím/aria, bảng cuộn ngang trong vùng, form/đối chiếu mã không bị cắt, nút đủ chạm | Chưa kiểm tra |
| Đang tải / rỗng / lỗi | Không chèn demo; phân biệt “không dữ liệu” và “chưa đối soát”, mã lỗi/request ID có thể tra | Chưa kiểm tra |
| Mất mạng trước gửi | Không ghi localStorage thay thế; thao tác không báo thành công; giữ mã nếu chưa chắc đã gửi | Chưa kiểm tra |
| Timeout sau SQL commit | Chỉ một receipt/giao dịch; giữ key gốc, lookup COMMITTED hiển thị kết quả cũ; không thu lại | Chưa kiểm tra |
| Bấm lặp / hai tab / hai máy | Không duplicate booking/fee/cọc/payment/refund; không dựa khóa trong RAM/tab; SQL receipt uniqueness kiểm chứng | Chưa kiểm tra |
| SQL lỗi/rollback batch | Không báo commit một phần, nguồn/crosswalk/receipt nhất quán; unknown được tra trước mọi retry | Chưa kiểm tra |
| Refresh trang / hết phiên / đổi nhân viên | Không cache token/PII; metadata tab còn, quyền mới kiểm lại; actor khác không tra/nhận receipt của người cũ | Chưa kiểm tra |
| Đóng tab/mất máy | Mã gốc từ hồ sơ sự cố/journal SQL phục hồi được theo quyền; không coi thiếu sessionStorage là zero pending | Chưa kiểm tra |
| Tab legacy trước G12/offline/static host cũ | Kiểm kê và đóng đủ, có bằng chứng không ghi sau freeze; không cho xem lease như khóa toàn cục | Chưa kiểm tra |
| Monitor/process restart | Unknown/ghi kép/chênh tiền vẫn tồn tại trong collector bền vững; restart không tự mở lại ghi | Chưa kiểm tra |
| Rollback A/B/C | Diễn tập trên test được duyệt; nhận diện chính xác delta, backup mới và đối soát trước phục hồi; không đè giao dịch mới | Chưa kiểm tra |

Không nghiệm thu cắt chuyển toàn hệ thống khi các luồng bắt buộc chưa có API/UI hoặc atomic SQL. Nếu duyệt vận hành giới hạn phải nêu rõ phần bị khóa và quy trình thay thế được phê duyệt; không cho nhân viên quay lại demo để ghi cùng nghiệp vụ.
