# Frontend — bản chạy thử sau khi tạm dừng backend

Giữ HTML/CSS/JavaScript và Tabler miễn phí đã có trong repository. Không sửa backend/database, không bật API SQL hoặc nguồn ghi vận hành. Dữ liệu và vai trò trong ba workspace hiện là chế độ demo trình duyệt; màn hình API giữ thông báo chưa cấu hình nếu backend chưa sẵn sàng.

## Thay đổi

- `index.html`, `reception.html`, `housekeeping.html`: làm gọn phần giới thiệu demo trong menu; bỏ tên giai đoạn G7–G10 khỏi nhãn sản phẩm, giữ liên kết tới màn hình máy chủ riêng.
- `js/pms-ui.js`: đưa thông báo triển khai sống vào hàng trạng thái riêng, giữ cảnh báo yêu cầu chưa đối chiếu; chuyển màn hình cuộn về đầu. Không sửa Store, trạng thái nghiệp vụ hoặc ma trận quyền.
- `css/pms.css`: bố cục status sticky trong luồng CSS, không che logo/topbar; thông báo dài tự xuống dòng; sửa sidebar che nút menu khi đổi sang chiều rộng nhỏ. Không cần JavaScript đo chiều cao.
- `js/deployment.js`: nhãn thông báo ngắn, tiếng Việt; giữ nguyên gate nguồn ghi và cảnh báo giao dịch chưa rõ kết quả.
- `tests/ui.js`: thêm ba trường hợp kiểm status/topbar/content và nút menu tại ba kích thước; đổi nhãn test KPI thành demo để không nhầm dữ liệu SQL.
- `tools/open_frontend_preview.py`: mở Edge bằng profile tạm mới; không đọc/copy profile thật, không xuất localStorage, không SQL. Dùng Python đã có, không cần đổi PowerShell ExecutionPolicy.

## Chạy thử

Từ thư mục gốc, chạy máy chủ frontend **chỉ trên localhost**:

```powershell
python -m http.server 8080 --bind 127.0.0.1
```

Giữ terminal này mở. Đây là máy chủ tệp phục vụ phát triển, không phải deployment vận hành/backend API. Không mở cổng ra mạng hoặc dùng để phục vụ cấu hình thật. Ba trang:

- Quản trị: http://127.0.0.1:8080/index.html
- Lễ tân: http://127.0.0.1:8080/reception.html
- Buồng phòng: http://127.0.0.1:8080/housekeeping.html

Mở cửa sổ thử riêng:

```powershell
python tools/open_frontend_preview.py
```

Mỗi lần chạy launcher tạo profile mới, nên dữ liệu thử của lần trước không nằm trong cửa sổ mới. Dùng cùng cửa sổ khi muốn giữ các thao tác thử. Không có tài khoản đăng nhập thật được tạo; login.html vẫn khóa khi chưa cấu hình.

## Kết quả thực tế

| Lệnh | Kết quả | Phạm vi |
| --- | --- | --- |
| `python run_ui_checks.py` | **103/103 đạt**, không ghi nhận lỗi browser/tài nguyên | Edge profile riêng; admin/lễ tân/buồng phòng, 1366×768, 1920×1080, 390×844; menu, tìm kiếm, dialog, quyền demo, lưu biểu mẫu demo |
| `python run_ui_checks.py --screenshots` | Tạo 8 ảnh preview, đã xem dashboard desktop và mobile | Overview 3 kích thước; timeline/sơ đồ/booking/billing/report desktop; không phải ảnh toàn bộ màn hình |
| `python run_suite.py` | **18/18 đạt** | Nghiệp vụ demo/localStorage, không SQL |
| `node tests/view-data.test.js` | **8/8 đạt** | Fixture cho room states, báo cáo, công nợ và timeline |
| `npm.cmd test` tại backend | **114/114 đạt** | Hồi quy với HTTP nội bộ và fixture/mock; không thêm/sửa backend trong lượt này |

Edge headless trong sandbox ban đầu lỗi GPU/cache trước khi chạy kiểm tra; chạy lại ngoài sandbox bằng profile kiểm thử riêng thành công. Kiểm UI mới từng phát hiện banner và sidebar che nút menu trên mobile; đã sửa và chạy lại đạt. Không dùng kết quả fixture/demo để kết luận SQL nghiệp vụ đã nghiệm thu.

Ảnh tại `screenshots/redesign_*.png`, báo cáo máy đọc `screenshots/ui-checks.json`. Thử tạo đặt phòng, mở nhận/trả phòng, khách đoàn/folio và các thao tác khác qua nghiệp vụ demo hiện có; các kiểm tra này không xác minh giao dịch SQL hoặc thanh toán thật.
