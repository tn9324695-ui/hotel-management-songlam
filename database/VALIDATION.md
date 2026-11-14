# Kết quả xác minh — 08/11/2026

**Bản ghi lịch sử v1.** Xem [kết quả nâng cấp hiện tại](VALIDATION_V2.md). Các số lượng đối tượng và giới hạn dưới đây phản ánh v1 trước nâng cấp.

Đã chạy thực tế trên máy Windows của dự án. SQL Server: `.\SQLEXPRESS`, **2022 Express 16.0.1000.6**. Database thiết kế giữ lại để xem trong SSMS: **`SongLamPms_Design`**.

| Lệnh/kiểm tra | Kết quả |
| --- | --- |
| `001_schema.sql` qua sqlcmd | Tạo thành công 47 bảng, 102 FK và các CHECK/chỉ mục |
| `002_views_and_inventory.sql` | Tạo thành công 6 view, 2 thủ tục, 4 trigger |
| `003_reference_seed.sql` | 6 vai trò, 19 quyền; không có dữ liệu vận hành hoặc tài khoản đăng nhập mẫu |
| `python tests/sqlserver/run_database_tests.py` | **30/30 PASS** trên database tạm riêng |
| `node tests/view-data.test.js` | **8/8 PASS** |
| `python run_suite.py` | **18/18 PASS**, Edge headless với hồ sơ tạm |
| `python run_ui_checks.py` | **100/100 PASS**, không ghi nhận lỗi trong các ca chạy |
| Bộ cài với tên database đã tồn tại | Dừng đúng trước khi thay đổi database |
| `DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS` | Không báo vi phạm ràng buộc trong database thiết kế |
| Cú pháp Node.js/Python/PowerShell và `git diff --check` | Đạt; Git chỉ cảnh báo chuẩn hóa LF/CRLF ở các tệp đã sửa trước đó |

30 ca SQL bao gồm biên dịch toàn bộ script trên engine thật; seed sạch; đối chiếu ma trận RBAC với `js/data.js`; số tiền/ngày/khóa ngoại; idempotency; một ngày nghiệp vụ mở; khóa bắt buộc; đơn chưa gán phòng; chống vượt quỹ phòng; chống lịch trùng; khoảng thuê giờ nối tiếp; block bảo trì; hủy đơn; nâng hạng; phòng vô hiệu hóa; một lượt ở thực tế mỗi phòng; trạng thái vệ sinh độc lập; chuyển nợ về master và giữ nợ sau checkout; cọc không tạo doanh thu; dòng tiền âm; liên kết khoản hoàn; webhook trùng; lịch sử folio bất biến; hai kết nối tranh cùng khóa và giải phóng khóa khi rollback.

Bộ SQL kiểm thử trên `SongLamDesignTest_<UUID>`, rollback dữ liệu tổng hợp sau từng ca và xóa database tạm của chính lần chạy ở `finally`. Database thiết kế và localStorage không nhận fixture. Kiểm thử giao diện dùng bộ có sẵn tại 1366×768, 1920×1080 và 390×844; lần này không chụp lại bộ ảnh vì không đổi UI.

Các lỗi gặp và đã sửa:

- sqlcmd trong sandbox ban đầu không mở được kết nối Windows/SSL. Kết nối cục bộ `lpc:.\SQLEXPRESS`, Windows Authentication và cho phép tin cậy chứng chỉ cục bộ đã chạy được ngoài sandbox; không đổi cấu hình SQL Server hay mở cổng mạng.
- SQL Server từ chối tạo chỉ mục lọc khi `QUOTED_IDENTIFIER` chưa bật. Đã bổ sung đầy đủ SET options vào script, transaction lỗi được rollback rồi chạy lại thành công.
- Bộ chạy Python ban đầu dùng biểu thức f-string có escape không tương thích interpreter hiện tại. Đã chuyển chuỗi ra biến riêng.
- Ca đồng thời ban đầu chờ thông báo stdout từ sqlcmd, nhưng đầu ra bị giữ đệm nên kết nối thứ hai chạy sau lúc khóa đã nhả. Đã thay bằng quan sát khóa thực tế qua `sys.dm_tran_locks`; chạy lại đạt đủ 30 ca.
- Máy mặc định chặn chạy tệp PowerShell. Hướng dẫn bộ cài dùng `-ExecutionPolicy RemoteSigned` riêng cho tiến trình; đã kiểm tra bộ cài từ chối tên database có sẵn. Không đổi policy toàn máy. Cài cấu trúc thực tế trong đợt này được thực hiện bằng sqlcmd trực tiếp.

Giới hạn: các ca tài chính xác minh ràng buộc DDL và cách tính số dư trên fixture hợp lệ; **không chứng minh đã có API thu/hoàn tiền an toàn hoặc đầy đủ kiểm soát tổng nhiều bảng**. Chống vượt tổng hoàn, phân bổ quá Payment, cọc âm, cặp chuyển không cân, kiểm tra RBAC từng endpoint và giao thức transaction vẫn là công việc backend được liệt kê trong [thiết kế](README.md). Chưa kiểm thử ngân hàng, hóa đơn điện tử, migration localStorage, tải nhiều người dùng hoặc khôi phục backup. Không tuyên bố các phần đó đã hoàn thành.
