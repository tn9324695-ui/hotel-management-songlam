# Kết nối frontend → backend → SQL Server — 12/11/2026

**Cập nhật triển khai mới nhất:** 004r đã backup/VERIFYONLY/marker/MULTI_USER đạt, 001/003 đã tạo ba RPC auth và role/ba EXECUTE trên SQL thật. [Biên bản](first-two-execution-2026-11-12.md). Không đồng nghĩa pool backend hoặc login website đã hoạt động; service principal/phiên/tài khoản chưa làm. Những trạng thái D1/001/003 chưa áp dụng ở báo cáo gốc dưới đây đã được thay thế.

**Trạng thái D1 hiện tại:** 000 đã chạy backup/VERIFYONLY thành công; xem [biên bản](d1-000-execution.md). 004 đã được duyệt riêng, chưa thực thi do thiếu bằng chứng ngừng ghi; xem [preflight](d1-004-preflight.md). Các mô tả chưa chạy SQL bên dưới là lịch sử lượt nối runtime trước 000. 001/002/002b/003/005 chưa được duyệt/chạy. Pool ứng dụng, đăng nhập và nghiệp vụ SQL thật chưa được xác minh. Hai backend preview 8090/8091 đã dừng trong preflight mới.

## Đã thực hiện

Frontend tiếp tục gọi cùng origin `/api/v1` bằng client/phiên/quyền dùng chung, không có đường ghi kép hoặc fallback demo. Đã cài/pin `mssql@12.7.14`, `msnodesqlv8@6.2.2` và cập nhật `backend/package-lock.json`. Node hiện tại 26.13.0; import driver native và native types thành công **không mở pool**. ODBC Driver 17 hiện có trong registry 64-bit, dùng rõ tên này thay vì Native Client mặc định.

Driver Windows Authentication dùng module `mssql/msnodesqlv8`, native types từ cùng module và `trustedConnection=true`, theo [tài liệu node-mssql](https://github.com/tediousjs/node-mssql#readme). TLS bắt buộc; không tự bật trust certificate. Khi exception certificate đã được duyệt trong profile, option tương ứng được truyền rõ qua ODBC `beforeConnect`; chưa kiểm TLS handshake với SQL thật.

Đã viết và nối vào entrypoint:

- `backend/src/adapters/sql/windows-provider.js`: kiểm đúng Windows service principal bằng `whoami.exe` **trước tạo pool**, kiểm lại khi tạo; không dùng metadata token làm fallback, không SQL login/password/impersonation. Có error listener chỉ log mã an toàn; không log connection string.
- `backend/src/adapters/sql/runtime.js`: đọc JSON tối đa 512 KiB từ đường dẫn tuyệt đối, ràng buộc server/database/port với config, kiểm approval và S0/epoch/hash policy trước nạp provider; ghép auth và 9 gateway hiện có; đóng pool khi khởi tạo lỗi.
- `backend/src/server.js`: nạp runtime opt-in, truyền dependencies vào app, không nghe HTTP nếu runtime được yêu cầu nhưng bị từ chối; đóng pool khi listen lỗi hoặc shutdown. Không tự chạy migration/seed.
- `backend/src/config/environment.js`, `.env.example`: `SQL_RUNTIME_FILE` mặc định rỗng; hiện chỉ cho runtime được duyệt trong `NODE_ENV=test`.
- `backend/src/app.js`: thêm `GET /api/v1/connection/status` và trạng thái kết nối trong `/ready`; không trả server/login/path/secret qua endpoint này. `/ready` không chuyển thành đạt chỉ vì pool kết nối, còn phải qua các chốt vận hành G12.
- `js/components/workspace.js`: hiển thị trạng thái kết nối do backend cung cấp; không dùng nhãn này để tự cấp quyền.
- `deploy/sql-runtime.example.json`: mẫu đầy đủ nhưng **approved=false**; profile và S0 đều chưa approved, epoch không nằm trong JSON; các gateway chưa có hợp đồng được duyệt đặt null.
- `tools/sql/check-runtime.mjs`: kiểm ngoại tuyến, không mở driver/pool. Mẫu bị từ chối `SQL_RUNTIME_APPROVAL_REQUIRED` đúng chủ đích.

`businessWritesEnabled` của runtime mới luôn false: phần này chuẩn bị nối auth/đọc, không cấp receipt/monitor/release G12 để mở command chưa nghiệm thu. Gateway chỉ được cấu hình từ manifest đúng database/environment/protocol/approval; null giữ khóa. Không đổi mô hình phân quyền SQL hay PrincipalBinding.

## Những gì SQL thật xác nhận chỉ đọc

Đã chạy sqlcmd Windows Authentication với SELECT metadata/số đếm, không chạy pending hoặc ghi dữ liệu:

| Kiểm tra | Kết quả |
| --- | --- |
| Instance/database | `DESKTOP-9EPI86K\SQLEXPRESS` / `SongLamPms_Design` |
| Authentication mode | Windows only (`IsIntegratedSecurityOnly=1`) |
| `pms.AppUser` | **0** tài khoản; không đọc hash hoặc mật khẩu |
| `usp_AppEnvironment`, `usp_AppAuthLookup`, `usp_AppIdentity` | Chưa tồn tại |
| `usp_WebSessionProbe/Create/Get/Destroy` | Chưa tồn tại |
| Marker `SongLam.Environment`, `SongLam.TestIdentity` | Chưa tồn tại |
| DB principal `pms_web_auth_test`, `pms_web_auth_reader`, `pms_web_session_executor` | Chưa tồn tại |

Chỉ xác nhận database phục vụ được truy vấn metadata bởi danh tính kiểm tra. **Không phải pool backend kết nối**, không phải nhân viên website đăng nhập, không phải nghiệp vụ chạy qua SQL. Windows service account đề xuất chưa được runner xác minh/cấp quyền; không dùng danh tính đang đọc metadata để chữa thiếu principal.

## Chạy HTTP hiện tại

Đã chạy code mới tại `http://127.0.0.1:8091`, với `SQL_RUNTIME_FILE` rỗng và SQL server config rỗng: không nạp driver vào runtime hoặc tạo pool.

| Request thực | Kết quả |
| --- | --- |
| `/health` | 200/ok |
| `/api/v1/connection/status` | 200, configured=false, sqlConnected=false, identityVerified=false, authentication=false |
| `/api/v1/auth/status` | 200/not_configured |
| `/ready` | 503/ready=false |

Xem giao diện: `/reception-api.html`; trạng thái chưa kết nối được phản ánh đúng, không có tài khoản hoặc session giả.

## Điều kiện bật runtime sau khi từng mục được duyệt

1. [D1](d1-approval-package.md): duyệt/chạy **000 backup** trước; backup/VERIFYONLY thất bại thì dừng. Sau receipt thật mới xét **004 marker riêng**.
2. [D2](d2-approval-package.md): duyệt/chạy **001/003**, tạo/bind service principal đúng phạm vi D2-P, runner Windows non-admin chạy dưới account đó. Không thay bằng tài khoản metadata.
3. [D3](d3-approval-package.md): duyệt/chạy **005** và membership/session writes riêng; cấp epoch ngoài DB; không gửi secret trong chat.
4. Duyệt dữ liệu nhân viên thử/hash format/quyền gán hiện có riêng; không tự tạo quản trị hoặc sửa RolePermission. Hiện AppUser=0 nên chưa có happy path login thật.
5. Lưu manifest private `.local.json` ngoài Git, điền reference **đã duyệt thực**, backup receipt/marker thật và từng contract thực tế; thêm `SONGLAM_SESSION_EPOCH` qua secret environment. `SQL_RUNTIME_FILE` trỏ file tuyệt đối, `NODE_ENV=test`, SQL_SERVER/SQL_DATABASE/SQL_PORT phải khớp profile. Không bật approved bằng cách sao chép số liệu metadata hoặc lời yêu cầu kết nối chung.
6. Chạy identity handshake/S0/auth/read integration trên đúng database được phép, rồi từng family nghiệp vụ/D4 và G12 theo phê duyệt riêng. Không cấp quyền schema-wide, SELECT rộng, db_owner/sysadmin hoặc tự bật ghi vận hành.

Quyền sử dụng SongLamPms_Design để ghi dữ liệu kiểm thử **đã xác nhận**. Các bước trên là quyền thực thi object/quyền/dữ liệu cụ thể còn pending; không yêu cầu chọn lại database. Chưa thay `.env` thật hay tạo manifest approved thật trong lượt này.

## Kiểm tra đã chạy

- `npm.cmd install --save-exact mssql@12.7.14 msnodesqlv8@6.2.2 --no-audit --no-fund`: thành công; không chạy migration/SQL. npm cảnh báo postinstall msnodesqlv8 chưa nằm trong allowScripts; không tự mở rộng allowScripts. Driver native trong package vẫn import thành công, đã kiểm thực.
- `node --test tests/sql-runtime.test.js`: **7/7 đạt**. Fixture kiểm thiếu approval, sai principal trước constructor/connect, TLS/options/log an toàn, wiring gateway, shutdown/error cleanup, file/config lỗi không mở HTTP. Một test nạp thư viện native thật; không gọi connect.
- `npm.cmd test`: **121/121 đạt**, 0 trượt/skip. Đây không phải 121 bài nghiệp vụ trên SQL thật.
- `node tools/sql/check-runtime.mjs deploy/sql-runtime.example.json`: exit 1/SQL_RUNTIME_APPROVAL_REQUIRED, đúng dự kiến.
- `node tests/frontend-api.browser.mjs`: **66/66 đạt**, SQL tests=0. HTTP backend thiếu phụ thuộc và private read/write/receipt fixtures được ghi nhãn riêng.

Chưa chạy SQL schema/procedure/trigger/grant, session CRUD thật, login thật, ghi booking hoặc giao dịch tiền. Không có backup/marker mới được tạo trong lượt này. Các file pending vẫn chưa được áp dụng.
