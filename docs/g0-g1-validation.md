# Bàn giao G0–G1 — 08/11/2026

## Phạm vi hoàn thành

Đã kiểm kê repository, dựng nền Express, cấu hình môi trường có validation, tách app/server, xử lý lỗi JSON, request ID, kiểm tra đầu vào và trang đăng nhập dùng Tabler cục bộ. HTTP client mới chưa được gắn vào các controller nghiệp vụ demo.

G1 chưa có driver/pool SQL, xác thực tài khoản, phiên thật hoặc API đặt phòng/thanh toán. Không có migration/seed/import hoặc câu lệnh thay đổi SQL nào được thực thi trong lượt này. Không chạy các kiểm thử SQL có khả năng tạo/xóa database hay ghi fixture.

## Tệp tạo mới và chỉnh sửa trong G0–G1

| Nhóm | Tệp |
| --- | --- |
| Backend và dependency | `backend/package.json`, `backend/package-lock.json`, `backend/.env.example`, `backend/README.md` |
| Khởi động/cấu hình | `backend/src/app.js`, `backend/src/server.js`, `backend/src/config/environment.js` |
| Hạ tầng HTTP | `backend/src/shared/errors.js`, `backend/src/middleware/request-context.js`, `backend/src/middleware/error-handler.js`, `backend/src/middleware/validate.js`, `backend/src/modules/status/readiness.js` |
| Frontend mới | `login.html`, `css/login.css`, `js/api/http-client.js`, `js/pages/login.js` |
| Kiểm thử mới | `backend/tests/helpers.js`, `backend/tests/config.test.js`, `backend/tests/api.test.js`, `backend/tests/http-client.test.js`, `backend/tests/login.test.js`, `backend/tests/browser/login.browser.js` |
| Tài liệu | `docs/source-inventory.md`, `docs/sql-proposals.md`, tài liệu này; bổ sung đầu `README.md` |
| Bảo vệ cấu hình | `.gitignore` |
| Bằng chứng kiểm tra | `screenshots/g1/login-1366.png`, `login-1920.png`, `login-390.png`, `browser-checks.json`; chạy lại tạo báo cáo `screenshots/ui-checks.json` |

Đã cài Express **5.3.0**, khóa phiên bản bằng package-lock; `npm install` báo 0 lỗ hổng tại thời điểm chạy. Chưa cài driver SQL, thư viện auth hoặc backend PostgreSQL.

Checkout đã có các thay đổi chưa commit từ trước. Đối chiếu SHA-256 với snapshot đầu G0–G1: **34/34 tệp có sẵn được bảo toàn**, gồm các tệp gốc trong `js/`, `css/`, `database/` và các HTML/controller/bộ chạy hồi quy được kiểm kê. Báo cáo này không quy các thay đổi cũ trong `git status` thành thay đổi mới của G1.

## Cách chạy đã xác minh

Từ thư mục dự án:

```powershell
cd backend
node --env-file=.env.example src/server.js
```

Đã thực sự khởi động bằng entry point trên, rồi gọi HTTP tại `http://127.0.0.1:3000`:

| Đường dẫn | Kết quả |
| --- | --- |
| `/login.html` | 200, HTML |
| `/health` | 200, JSON, chỉ xác nhận tiến trình HTTP |
| `/ready` | 503, JSON, `ready: false` |
| `/api/v1/auth/status` | 200, JSON, `loginEnabled: false` |

Để dùng `npm.cmd start`, tạo `.env` từ mẫu nếu chưa tồn tại; xem [hướng dẫn backend](../backend/README.md). Không ghi đè `.env` đang có. Trên máy mới dùng `npm.cmd ci --ignore-scripts` trước khi chạy.

Đường chạy demo cũ vẫn là `python -m http.server 8080 --bind 127.0.0.1` từ thư mục gốc. Phải giữ đúng origin đang dùng nếu cần xem cùng localStorage. Origin 3000 và 8080 có kho dữ liệu riêng, không tự đồng bộ. Đường demo vẫn công khai như trước, không được xem là ứng dụng đã có bảo vệ đăng nhập.

## Kiểm thử thực tế

| Lệnh | Kết quả | Nội dung |
| --- | --- | --- |
| `cd backend; npm.cmd test` | **31/31 đạt** | Config thiếu/sai, startup, health/readiness, request ID, validation/JSON/media type/giới hạn payload, lỗi bất ngờ, static allowlist, client và login không thành công giả |
| `cd backend; npm.cmd run test:browser` | **13/13 đạt** | Edge headless thực tế, API thật, 3 viewport, console/tài nguyên/liên kết, login khóa, submit cưỡng bức và API mất kết nối |
| `node tests/view-data.test.js` | **8/8 đạt** | Trạng thái phòng độc lập, lịch, tiền thực thu, doanh thu/công nợ và không tạo số liệu giả |
| `python run_suite.py` | **18/18 đạt** | Đặt đoàn, chặn trùng phòng, thu/cọc/idempotency, nhận/trả phòng, hoàn, chốt ngày, báo cáo, minibar và bảo trì |
| `python run_ui_checks.py` | **100/100 đạt** | Hồi quy giao diện hiện có; không có lỗi trong báo cáo |
| `git diff --check` | Đạt | Có cảnh báo chuyển LF sang CRLF của Git, không có lỗi whitespace |

Các kiểm thử Edge dùng profile tạm riêng, không dùng profile chứa dữ liệu thật. Kiểm thử login chỉ đặt sentinel trong profile do chính nó tạo, sau đó xác minh giữ nguyên giá trị; không xuất dữ liệu qua SongLamStore. Bộ hồi quy demo chạy fixture trong profile tạm của nó.

Đã mở và xem ảnh tại 1366×768, 1920×1080 và 390×844. Form tiếng Việt, nút/ô nhập bị khóa và thông báo “Chưa cấu hình đăng nhập” hiển thị rõ; không tràn ngang. Console không có exception/error và tài nguyên trang không tải lỗi trong lần kiểm tra G1. Cưỡng bức submit không gửi POST đăng nhập, cấp cookie/phiên, chuyển trang hay thay localStorage của profile kiểm thử. Kiểm tra này không phải kiểm chứng đăng nhập thật hoặc kết nối SQL.

Ảnh: [1366×768](../screenshots/g1/login-1366.png), [1920×1080](../screenshots/g1/login-1920.png), [390×844](../screenshots/g1/login-390.png). [Báo cáo browser](../screenshots/g1/browser-checks.json).

## Giả định chưa xác minh và điều kiện trước G2

1. Chưa xác định browser profile/origin chứa dữ liệu thật; chưa sao lưu hay phân loại demo/thật. Không xóa, chuẩn hóa hoặc chuyển dữ liệu cũ.
2. Chưa kiểm tra live SQL trong lượt này: định nghĩa thủ tục, số lượng đối tượng/bản ghi, quyền hiện hành và trạng thái AppUser/PrincipalBinding chưa được tái xác minh. Script nguồn là tài liệu đối chiếu, không chứng minh server đã triển khai giống hệt.
3. Chưa có hợp đồng xác thực đã duyệt, thuật toán/chính sách hash, principal dịch vụ, TLS/cổng SQL, kho phiên hay đường cấp/reset tài khoản thật.
4. Chưa có hợp đồng ủy quyền nhân viên qua connection pool bảo đảm AuditLog đúng actor. Không dùng role trong trình duyệt hoặc SESSION_CONTEXT tự ghi để thay thế xác thực.
5. Ma trận quyền hiện tại được giữ nguyên; việc thiếu quyền hoặc mâu thuẫn chỉ được nghiên cứu và trình riêng.

Các mục cần phê duyệt riêng đã ghi trong [sql-proposals.md](sql-proposals.md): **A1** tra cứu xác thực, **A2** hồ sơ/quyền, **A3** cổng ủy quyền actor và **D1** khởi tạo dữ liệu/tài khoản thật theo kiểm soát. Chưa thực hiện các đề xuất này. G2 và các API nghiệp vụ chưa hoàn thành.
