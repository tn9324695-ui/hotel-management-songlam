# G2 — code xác thực và actor, chưa nghiệm thu đăng nhập thật

## Kết quả kiểm tra trước khi sửa

Không tìm thấy AGENTS.md trong checkout hoặc thư mục cha. Đã đọc code G0–G1, báo cáo kiểm thử và `docs/sql-proposals.md`. Đối chiếu với lịch sử hội thoại hiện có: **không có phê duyệt riêng A1/A2/A3**, môi trường SQL kiểm thử được chỉ định hoặc kho phiên đã duyệt. Yêu cầu viết code G2 không được dùng thay thế các phê duyệt này.

| Hợp đồng | Bằng chứng trong repository | Phê duyệt/hiện trạng |
| --- | --- | --- |
| `pms.usp_Query` | `database/sqlserver/006_command_gateway.sql`: actor lấy qua PrincipalBinding/SQL principal; projection đọc loại PasswordHash | Có định nghĩa trong script; chưa kiểm tra deployment SQL thật trong lượt này; không phù hợp để lấy hash đăng nhập |
| `pms.usp_ExecuteCommand` | Cùng script: không nhận actor website, gắn actor theo principal | Có định nghĩa trong script; không dùng làm cổng actor cho pool website |
| Private `usp_ReadResource`/`usp_ApplyCommand` | Script `007_enforce_access.sql` DENY gọi trực tiếp cho pms_executor | Không gọi vòng qua kiểm soát quyền |
| A1: tra cứu xác thực | Đề xuất, chưa có tên thủ tục/đặc tả SQL được chốt | Chưa phê duyệt, chưa triển khai SQL |
| A2: hồ sơ/quyền hiện tại | Đề xuất, chưa có tên thủ tục/đặc tả SQL được chốt | Chưa phê duyệt, chưa triển khai SQL |
| A3: actor qua pool/audit | Đề xuất, gateway cũ không đáp ứng actor website | Chưa phê duyệt, chưa triển khai SQL |
| Đã duyệt nhưng chưa triển khai | Không tìm thấy bằng chứng | Chưa xác định đối tượng nào thuộc nhóm này |

`AppUser.PasswordHash varchar(512)` trong script không chứng minh thuật toán hoặc dữ liệu hash đang dùng. Chưa đọc hash/dữ liệu người dùng thật, chưa xác nhận các bản ghi hoặc quyền hiện hành trên server.

## Code đã triển khai

| API | Khi phụ thuộc được cung cấp trong fixture kiểm thử | Khi chạy server hiện tại |
| --- | --- | --- |
| POST `/api/v1/auth/login` | Validate JSON, kiểm tra nguồn, giới hạn lượt thử, gọi A1, xác minh hash, lấy A2, cấp phiên mới | 503 AUTH_NOT_CONFIGURED, không cookie/phiên |
| POST `/api/v1/auth/logout` | Xác thực phiên + A2 + Origin + CSRF, xóa phiên rồi xóa cookie | 503 AUTH_NOT_CONFIGURED |
| GET `/api/v1/auth/me` | Hồ sơ tối thiểu + CSRF token của phiên; không trả hash/quyền nhạy cảm khác | 503 AUTH_NOT_CONFIGURED |
| GET `/api/v1/auth/permissions` | Quyền lấy mới từ A2 trên mỗi request | 503 AUTH_NOT_CONFIGURED |

`/auth/status` vẫn trả `loginEnabled: false` trên server mặc định. `/health` 200 chỉ chứng minh HTTP sống; `/ready` 503 liệt kê SQL, A1/A2, hash, A3 và session store còn thiếu. Không có biến AUTH_ENABLED hay fixture flag cho server vận hành. Không có route fixture hoặc tài khoản kiểm thử trong server mặc định.

### Phiên và bảo vệ API

- Phiên nằm phía server qua interface store, cookie chỉ chứa 32 byte ngẫu nhiên mã hóa base64url; key lưu trong store là SHA-256 của mã phiên. Không chấp nhận ID tùy ý để tạo phiên.
- Đăng nhập thành công hủy ID trước đó rồi tạo ID và CSRF token mới. Logout chỉ trả thành công khi thao tác hủy phiên thành công. Có thời hạn tuyệt đối, tối đa 24 giờ; mặc định 8 giờ.
- Cookie HttpOnly, SameSite=Lax, Path=/, không Domain. Với HTTPS dùng Secure và tiền tố `__Host-`; cấu hình HTTPS không được dùng cookie thiếu Secure. HTTP chỉ phục vụ kiểm thử/phát triển cục bộ.
- CSRF token gắn phiên, kiểm tra bằng so sánh digest; yêu cầu ghi phải có Origin chính xác và không có Fetch Metadata cross-site. Login bắt buộc JSON và kiểm tra Origin để chặn login CSRF; không dựa riêng vào SameSite.
- Middleware lấy lại tài khoản, trạng thái và quyền qua A2 trên mọi request. Khóa/xóa tài khoản hoặc đổi securityVersion làm phiên mất hiệu lực; thu hồi quyền có tác dụng ở request tiếp theo mà không phụ thuộc quyền cache trong phiên.
- Tài khoản không tồn tại, bị khóa, sai mật khẩu và hash không hỗ trợ trả cùng 401 INVALID_CREDENTIALS. Lỗi SQL/store/timeout trả 503, không trả thông tin exception hay báo thành công.
- Chưa có kho phiên vận hành được duyệt. `createExternalSessionStore` yêu cầu driver bền vững với bằng chứng phê duyệt; không cung cấp MemoryStore mặc định. Map chỉ tồn tại trong `backend/tests/fixtures/`, bị chặn ở mode vận hành. Chưa chọn Redis/SQL session table hoặc tự ghi phiên ra đĩa.
- Giới hạn đăng nhập hiện có là bộ đếm theo IP trong tiến trình, không phải session store. Trước triển khai nhiều instance phải duyệt giải pháp rate limit dùng chung và chính sách TTL/thu hồi phiên. Không tự tin cậy X-Forwarded-For hoặc bật trust proxy.

### PasswordHash

Verifier sử dụng `node:crypto`, bật từng định dạng rõ ràng, không có định dạng bật mặc định. Code hỗ trợ hai encoding có phiên bản để kiểm thử khả năng phân luồng:

```
$pbkdf2-sha256-v1$iterations$saltBase64url$digestBase64url
$scrypt-v1$N$r$p$saltBase64url$digestBase64url
```

Đây là **encoding của code/fixture**, không phải kết luận về dữ liệu SQL đang có hay chính sách hash đã được phê duyệt. Parser giới hạn chi phí/độ dài; định dạng thiếu, sai hoặc chưa hỗ trợ bị từ chối và thực hiện dummy work. Không thử plaintext/MD5, không tự nhận bcrypt/Argon2 là hợp lệ, không cập nhật/rehash mật khẩu trong SQL. Nếu dữ liệu thật dùng định dạng khác, cần xác minh an toàn rồi bổ sung verifier tương ứng; chưa có cơ sở chọn thư viện Argon2id hoặc bcrypt.

### Pool và actor

`backend/src/adapters/sql/approved-contracts.js` nhận pool/types tương thích API request/input/execute của driver SQL Server do bootstrap tin cậy cấp. Mỗi lời gọi tạo request riêng, dùng tham số có type, timeout/cancel và không retry. Không có query SQL động hoặc fallback đọc bảng. Chưa cài/nạp driver, tạo pool thật hay kết nối SQL trong server mặc định.

Actor được middleware tạo từ AppUserId trong phiên sau lookup A2 mới. Command adapter chỉ nhận context đã được middleware xác thực; body/query/header chứa UserId, actor, role hoặc các trường người thực hiện bị từ chối. Bigint giữ dưới dạng chuỗi chính xác, không ép qua Number.

Adapter không cập nhật PrincipalBinding, không ghi SESSION_CONTEXT, không EXECUTE AS/REVERT, không gắn actor vào pool/connection. A3 được yêu cầu kiểm lại tài khoản/quyền và ghi audit trong cùng transaction SQL, bao gồm trường hợp quyền bị thu sau lookup A2. Backend chỉ nhận acknowledgement đúng actor/request và trạng thái COMPLETED. Điều đó chưa chứng minh AuditLog thật đúng: chỉ kiểm thử tích hợp SQL sau phê duyệt mới xác nhận được.

Nếu timeout xảy ra sau SQL commit, kết quả có thể chưa xác định. Backend không báo thành công, không tự retry; đường tra cứu kết quả/idempotency phải nằm trong hợp đồng A3 được duyệt trước khi tích hợp nghiệp vụ tiền/phòng.

## Interface SQL ứng dụng đang chờ chốt

Các tên tham số/recordset dưới đây là **đề xuất interface của adapter**, không phải thủ tục đã tồn tại. Nếu hợp đồng được duyệt khác interface này thì phải cập nhật mapper và kiểm thử trước khi bật.

| Interface | Input parameter hóa | Output tối thiểu dự kiến |
| --- | --- | --- |
| A1 `findCredentials` | Username nvarchar(100) | 0–1 dòng: UserId bigint, PasswordHash, IsActive bit, RowVer; chỉ verifier được nhận hash |
| A2 `getCurrentIdentity` | AppUserId bigint từ phiên | 0–1 hồ sơ: UserId, Username, FullName, IsActive, RowVer; recordset quyền PermissionCode theo role active |
| A3 `executeForActor` | AppUserId, Operation, IdempotencyKey, Changes JSON, RequestId | Acknowledgement ActorId, RequestId, Status=COMPLETED sau commit/audit; SQL vẫn kiểm quyền nguyên tử |

Manifest được snapshot bất biến, giới hạn object thuộc schema pms, đúng database/môi trường và có tham chiếu phê duyệt. Không có manifest vận hành trong repository. Tên `pms.fixture_*` chỉ dùng trong fake pool của unit test, không được tạo trên SQL Server. Các public gateway dựa principal và private helper cũ bị chặn trong adapter này để tránh tái sử dụng sai hợp đồng.

Store session cần chốt driver và interface `probe`, `create(key, record, ttlMs)` nguyên tử create-if-absent kèm expiry, `get`, `destroy` có xác nhận hoàn thành. Kho phải dùng chung giữa các instance, bảo vệ dữ liệu phiên và không khôi phục phiên đã logout sau lỗi/restart. Chưa có implementation driver vận hành được chọn hoặc phê duyệt.

## Tệp và kiểm thử

Tạo mới:

- `backend/src/modules/auth/{security,password-verifier,sessions,runtime,routes}.js`.
- `backend/src/adapters/sql/approved-contracts.js`.
- `backend/tests/auth.test.js`, `backend/tests/sql-contracts.test.js`, `backend/tests/fixtures/auth-fixture.js`.
- Tài liệu này.

Sửa `backend/src/app.js`, `backend/src/server.js`, `backend/src/modules/status/readiness.js`, `backend/README.md`, `README.md` và bổ sung trạng thái trong `docs/sql-proposals.md`. Không sửa login frontend, localStorage hoặc module đặt/thu/trả phòng. Không thêm thư viện.

Chạy `cd backend; npm.cmd test`: **57/57 đạt**, gồm 31 ca G1 và 26 ca mới. Kiểm thử HTTP thực sự qua Express, crypto thật trên hash fixture, fake pool mô phỏng duy nhất một connection vật lý và store Map chỉ trong test. Bao phủ đúng/sai/khóa, hết hạn/logout/rotation, quyền bị thu cả trước và sau lookup A2, CSRF, giả actor, hai nhân viên đồng thời, SQL timeout/cancel và lỗi lưu/hủy phiên. Chưa chạy integration SQL và không coi audit fixture là AuditLog SQL thật.

Các kiểm tra đã chạy thêm sau khi thay đổi G2:

| Lệnh | Kết quả |
| --- | --- |
| `cd backend; npm.cmd run test:browser` | 13/13 đạt; Edge thật, profile tạm, viewport 1366/1920/390, không lỗi console/tài nguyên, không thành công giả |
| `node tests/view-data.test.js` | 8/8 đạt |
| `python run_suite.py` | 18/18 nghiệp vụ demo đạt, profile riêng |
| `python run_ui_checks.py` | 100/100 UI đạt, không lỗi |
| `git diff --check` | Đạt; cảnh báo LF/CRLF của Git không phải lỗi whitespace |

Đã khởi động entry point thật bằng `cd backend; node --env-file=.env.example src/server.js` rồi gọi HTTP: `/health` 200, `/ready` 503; cả 4 API login/logout/me/permissions trả 503 AUTH_NOT_CONFIGURED, không phát Set-Cookie. Đây là kiểm chứng trạng thái chặn đúng, không phải đăng nhập SQL thật. Các server phục vụ kiểm tra được dừng sau khi chạy. Các lệnh chạy ứng dụng giữ nguyên trong [backend/README.md](../backend/README.md).

Đối chiếu SHA-256 với snapshot đầu lượt G2: **38/38 tệp được bảo toàn**, gồm toàn bộ tệp trong `js/`, `css/`, `database/` và các HTML/bộ chạy kiểm thử cũ được kiểm kê. Không có thay đổi frontend, nghiệp vụ hoặc SQL trong nhóm này. Những sửa đổi chưa commit từ các lượt trước vẫn được giữ.

## Chặn nghiệm thu vận hành

**G2 chưa nghiệm thu đăng nhập thật.** Cần phê duyệt và chỉ định riêng:

1. A1/A2: object SQL chính thức, tham số/output, principal được EXECUTE và môi trường kiểm thử; không SELECT toàn bảng hay quyền quản trị.
2. Kiểm tra thuật toán/encoding hash thực tế mà không xuất/log hash; chính sách xác minh/khóa/reset, không tự tạo account.
3. A3: delegated actor, kiểm quyền nguyên tử, audit, transaction/idempotency, timeout và xác minh hai nhân viên trên pool thật.
4. Kho phiên bền vững, TTL, chính sách thu hồi và rate limit dùng chung; cấu hình TLS/proxy đáng tin cậy.
5. Driver và bootstrap pool tài khoản dịch vụ, server/cổng/chứng chỉ/credentials thật qua môi trường bí mật, không đưa vào code/log.

**Không có thay đổi SQL, quyền hoặc dữ liệu nào trong lượt G2 này.** Không có căn cứ phê duyệt để thực hiện thay đổi SQL; không chạy migration/seed/import hay bộ kiểm thử SQL có ghi dữ liệu.

Tham khảo triển khai: [Node.js crypto](https://nodejs.org/api/crypto.html), [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
