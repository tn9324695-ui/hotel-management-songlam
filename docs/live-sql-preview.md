# Chạy thử frontend/Express và trạng thái SQL — 12/11/2026

**Sau lượt preview này:** 004r/D1 và 001/003 đã triển khai thành công trên SQL; [biên bản mới](first-two-execution-2026-11-12.md). Ba RPC auth đã tồn tại, không còn điểm chặn D1; service principal, kho phiên và AppUser vẫn chưa có. Các status API và inventory bên dưới là bằng chứng của lượt preview trước triển khai, không phải kiểm tra live mới hoặc đăng nhập đã mở.

## Kết luận thực tế

Frontend đang chạy với Express thật tại **http://127.0.0.1:8091/login.html** và `/reception-api.html`. Cùng origin, cùng HTTP client/phiên/quyền; không cần server frontend riêng. Backend đang ở môi trường test, khóa ghi (`PMS_WRITE_MODE=frozen`), **không phải cắt chuyển G12**. Không chạy 004r theo yêu cầu mới. Không chạy 001/002/002b/003/004/005 hoặc seed.

**Chưa hoàn tất đường Browser → API → SQL nghiệp vụ.** Không mở pool bằng danh tính metadata quản trị. Metadata đọc bằng sqlcmd xác nhận SQL instance/database thật tồn tại, nhưng không phải chứng cứ pool Express kết nối. Driver mssql/msnodesqlv8 đã cài đúng lockfile và native import thành công, chưa handshake/TLS thật dưới service principal.

## SQL đã kiểm chỉ đọc

`tools/sql/login-preflight-readonly.sql` đã chạy bằng sqlcmd, output riêng tại `tools/sql/private/live-preview-20261112/login-preflight-readonly.txt`. Target: `DESKTOP-9EPI86K\SQLEXPRESS / SongLamPms_Design`, physical GUID `C4DD399E-5661-4741-A424-5ABFEEFBC1AC`; Windows Authentication only.

- Có 7 procedure: usp_ApplyCommand, usp_AssertBusinessState, usp_AssertInventory, usp_ExecuteCommand, usp_LockInventory, usp_Query, usp_ReadResource.
- Cả 7 RPC auth/phiên yêu cầu đều chưa tồn tại: usp_AppEnvironment, usp_AppAuthLookup, usp_AppIdentity, usp_WebSessionProbe/Create/Get/Destroy.
- Chưa có service login `DESKTOP-9EPI86K\songlam_pms_test`, database user `pms_web_auth_test`, role auth/session đề xuất hoặc WebSession. Chưa có hai marker D1.
- AppUser, UserRole, PrincipalBinding, RoomType, Room và HotelSettings đều 0. Giao diện không dùng số đếm metadata này như dữ liệu API hoặc trả danh sách rỗng giả; API danh mục vẫn báo thiếu cấu hình xác thực.
- Role admin=4 quyền, manager=19, receptionist=10, cashier=7, housekeeping=4. Không thay quyền. Tên admin không được frontend hiểu thành toàn quyền.
- Gateway công khai hiện có lấy actor qua PrincipalBinding, không nhận actor của website đã xác thực. MutationRule không có AppUser/bootstrap; không gọi private helper để vượt quyền. [Hợp đồng seed còn thiếu](test-staff-bootstrap-proposal.md).

## Màn hình → API → service → SQL

| Màn hình/luồng | API → service/gateway | SQL thật qua API | Vai trò đã thử thật | Kết quả chạy UI | Lỗi sửa/phần còn chặn |
| --- | --- | --- | --- | --- | --- |
| Đăng nhập | auth/status, login → auth runtime → approved auth adapter | Chưa | 0 | Trạng thái chưa cấu hình, form khóa | Sửa form còn mở khi phụ thuộc mất sau status; help text cập nhật đúng; thiếu D2/S0/user |
| Khôi phục phiên/menu | auth/me, permissions → G2 | Chưa | 0 | 503 AUTH_NOT_CONFIGURED, không có phiên giả | Sửa nhãn xác minh vô hạn; hướng về phân hệ theo quyền, không ưu tiên viewRoomRack chung cho mọi nhân viên |
| Hạng phòng/sơ đồ | room-types, rooms, hotel-settings → catalog service → catalog gateway | Chưa | 0 | API 503; lỗi rõ, không Store/demo | Thiếu login và R1 đọc theo actor; không giả empty từ SQL |
| Lịch tương lai | bookings/timeline → bookings service → gateway | Chưa | 0 | GET khoảng 01–04/12/2026 bị chặn xác thực | Chưa có contract timeline/quyền được duyệt; không vẽ lịch demo |
| Buồng phòng/bảo trì | operations/capabilities, housekeeping/tasks → operations gateway | Chưa | 0 | Trang tải, khóa ghi và hiển thị lỗi phụ thuộc | Thiếu auth và hợp đồng G7, không bật nghiệm thu |
| Dịch vụ/minibar | service-orders, minibar-audits → consumption gateway | Chưa | 0 | Trang tải, không dữ liệu thay thế | Thiếu auth/G8/folio tối thiểu |
| Thu ngân/báo cáo/quản trị | folios/reports/users → finance/management gateway | Chưa | 0 | Trang tải, không số dư/KPI demo | Thiếu auth/G9/G10; không ghi tiền |

## Lệnh đã chạy và bằng chứng

- `npm.cmd ci --ignore-scripts --no-audit --no-fund --offline` trong backend: thành công khi chạy ngoài sandbox để đọc npm cache. Lần đầu bị EPERM cache; không đổi lockfile hoặc tự cho phép postinstall.
- Import `mssql/msnodesqlv8` thật thành công; không tạo/mở pool.
- `npm.cmd test`: **123/123 đạt**, 0 trượt/skip, unit/HTTP fixture/provider giả. Không phải 123 test SQL thật.
- `node --test tests/frontend-services.test.mjs`: **7/7 đạt**, gồm năm bộ quyền làm fixture để kiểm trang đích; không phải năm tài khoản SQL đăng nhập.
- `node tools/verify/frontend-live.mjs http://127.0.0.1:8091`: **27/27 kiểm tra đạt**, 0 lỗi console/tài nguyên, Edge thật với profile riêng, không intercept/mock API. Sáu trang ở 1366×768 và 1920×1080 không tràn ngang; đã xem ảnh login 1366 và sơ đồ 1920. Bằng chứng tại `screenshots/sql-preview/live-preview.json` và ảnh cùng thư mục, chỉ lưu path/status/request ID, không cookie/token/body nhạy cảm. Probe đăng nhập trực tiếp dùng input ngẫu nhiên không phải tài khoản thật để xác minh 503/không cookie; không phải kiểm thử mật khẩu hay quyền nhân viên trên SQL.
- `node tests/frontend-api.browser.mjs`: **66/66 đạt**, các lượt HTTP chưa cấu hình và fixture đọc/ghi/quyền được tách nhãn. `SQL tests=0`, không dùng làm bằng chứng pool kết nối. Kết quả `screenshots/frontend-api/report.json`.
- `/health` 200, `/ready` 503, `/connection/status` báo sqlConnected=false/identityVerified=false/authentication=false; `/auth/status` loginEnabled=false; /me, /permissions, /room-types, /rooms và /bookings/timeline trả 503 AUTH_NOT_CONFIGURED. Đây là request browser → frontend → Express thật; chưa tới RPC SQL.

**Tài khoản thử đã tạo: 0/5. SQL nghiệp vụ đã kiểm thử: 0.** Chưa có file mật khẩu hoặc credential dùng được; không in/hash/mật khẩu vào Git/log/chat. Không dùng kết quả fixture để nghiệm thu quyền/actor hoặc tiền/phòng.

## File code/tài liệu bổ sung trong lượt này

- `login.html`, `js/pages/login.js`, `backend/tests/login.test.js`: nhãn nguồn dữ liệu, help theo trạng thái và tự khóa lại khi phụ thuộc đăng nhập mất khả dụng; regression test.
- `js/components/workspace.js`: xóa trạng thái xác minh vô hạn khi restore phiên thất bại.
- `js/services/permission-service.js`, `tests/frontend-services.test.mjs`: trang đích dựa trên nhóm quyền từ phiên, không dùng viewRoomRack chung để đưa mọi người vào lễ tân. Các ca năm bộ quyền là fixture.
- `tools/verify/frontend-live.mjs`: probe browser thật trên server đang chạy, không dựng test server/provider trong script và không intercept API.
- `tools/sql/login-preflight-readonly.sql`: inventory SQL thực chỉ đọc, không hash/dữ liệu khách.
- `docs/test-staff-bootstrap-proposal.md`, tài liệu này, README, trạng thái D2/004r và `deploy/sql-target.observed.example.json`: cập nhật dữ liệu năm tài khoản đã được cho phép, cơ chế seed còn thiếu, 004r tạm dừng.

Không sửa schema/procedure/trigger/quyền, không ghi dữ liệu SQL hoặc localStorage, không tạo bí mật và không sửa `.env` thật trong lượt này.

## Cách khởi động lại preview hiện tại

Từ thư mục repository, PowerShell:

```powershell
Set-Location backend
$env:NODE_ENV='test'
$env:HOST='127.0.0.1'
$env:PORT='8091'
$env:PUBLIC_ORIGIN='http://127.0.0.1:8091'
$env:DATABASE_PROVIDER='sqlserver'
$env:SQL_DATABASE='SongLamPms_Design'
$env:SQL_SERVER='.\SQLEXPRESS'
$env:SQL_PORT=''
$env:SQL_RUNTIME_FILE=''
$env:PMS_WRITE_MODE='frozen'
$env:PMS_RELEASE_FILE=''
$env:PMS_BUILD_ID=''
node src/server.js
```

Đây là lệnh HTTP preview chưa mở SQL runtime, không phải lệnh kết nối SQL thành công. Chỉ để trống runtime khi hợp đồng chưa đủ; sau triển khai được duyệt, dùng entrypoint này dưới service principal non-admin với manifest thật và epoch secret ngoài Git. Không dùng account metadata để thử mở pool, không tự bật approved trong file example.

## Thứ tự phụ thuộc còn thiếu, chưa tự áp dụng

| Thứ tự | File/gói | Tác động cần duyệt hoặc điều kiện cần giải quyết |
| --- | --- | --- |
| 1 | 004 gốc / trạng thái D1 | 004 đã duyệt nhưng chưa áp dụng do cửa sổ ngừng ghi; 004r tạm dừng. Auth draft hiện yêu cầu marker. Không bỏ guard hoặc tự dùng physical GUID thay logical marker |
| 2 | 001-auth-read.sql.pending rồi 003-rpc-permissions.sql.pending | Ba RPC Environment/AuthLookup/Identity và role auth với đúng ba EXECUTE. Chưa được duyệt/chạy |
| 3 | D2-P trong docs/d2-approval-package.md | Provision Windows runner non-admin; SQL Windows login/user; CONNECT và membership auth hẹp. Chưa được duyệt/cấp; không SELECT rộng/db_owner/sysadmin |
| 4 | 005-session-store.sql.pending + D3-P | Bảng WebSession, 4 RPC, role và membership/kho phiên thực; epoch bên ngoài DB. Chưa được duyệt/chạy, không MemoryStore thay thế |
| 5 | Hợp đồng bootstrap nhân viên mới | Dữ liệu năm tài khoản đã cho phép; cơ chế bootstrap nguyên tử/idempotent, thuật toán hash và quyền caller còn cần chốt/duyệt. Chưa có RPC seed; không INSERT trực tiếp |
| 6 | G3 R1 tại docs/g3-sql-proposals.md | RPC đọc theo actor website, allowlist DTO/filter/page, kiểm quyền server; chưa có tên procedure chính thức/file SQL có thể chạy. Phải chốt hợp đồng trước viết DDL triển khai |
| 7 | G5 timeline/read contracts | Lịch khoảng ngày và trạng thái tương lai không đếm trùng Stay/Booking; hợp đồng còn chờ. Chưa mở command đặt phòng/tiền |

002/002b không phải điều kiện bắt buộc của login/read. Không tự chạy để “hoàn thiện” audit nghiệp vụ; từng command sau đó vẫn cần phê duyệt riêng. TLS chưa được xác minh trên service pool; không tự tắt encryption hoặc bật trustServerCertificate.
