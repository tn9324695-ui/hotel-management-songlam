# Đăng nhập thử — triển khai nhóm việc được chọn, 12/11/2026

**Cập nhật sau lần bàn giao này:** người dùng đã yêu cầu chỉ làm mục 1–2, xác nhận 004r rồi 001/003. Cả hai mục đã hoàn tất/kiểm chứng SQL thật; xem [biên bản](first-two-execution-2026-11-12.md). D1 không còn chặn, nhưng service principal/session/user bootstrap/R1 vẫn chưa triển khai. Nội dung bên dưới là trạng thái trước lần thực thi đó, không phải bằng chứng marker hiện còn thiếu.

## Quyết định và hiện trạng

Người dùng chọn **001/003, D2-P, 005/D3-P, bootstrap nhân viên và R1** rồi yêu cầu thực hiện. Ghi nhận tại `deploy/login-sql-decisions.json`. Không xin lại quyền sử dụng database hoặc phạm vi năm tài khoản. Các artifact bổ sung mới bên dưới đã được viết thành nội dung cụ thể để review; guard thực thi vẫn khóa khi chưa đủ căn cứ áp dụng.

**Điểm chặn SQL hiện tại là D1:** kiểm tra SELECT thực tế vẫn không có hai marker; AppUser=0, chỉ có 7 procedure nền. 001/003/005 đều yêu cầu marker. Người dùng đang tạm dừng 004r; không tự chạy lại, ghi marker hoặc bỏ guard. Không cố chạy DDL để tạo deployment dở dang khi đã biết điều kiện trước không đạt.

## Phần code đã hoàn thiện trong lượt này

| Mục | File cụ thể | Nội dung và giới hạn |
| --- | --- | --- |
| D2-P | `database/proposals/auth-v1/003p-service-principal.sql.pending` | Target/GUID/marker và 001/003 trước; CREATE LOGIN Windows `DESKTOP-9EPI86K\songlam_pms_test`, user `pms_web_auth_test`, CONNECT, membership auth duy nhất. Từ chối principal đã tồn tại; không cấp admin/SELECT rộng |
| D3-P | `005p-session-membership.sql.pending` | Chỉ thêm service user có SID khớp vào role phiên sau khi 005 đủ; không tạo bảng hoặc mở actor command |
| Bootstrap | `006-test-staff-bootstrap.sql.pending`, nguồn `contracts/test-staff-body.sql` | Tạo RPC maintenance-only `pms.usp_SeedTestStaffBatch`, không GRANT cho web. Đúng batch `B20261112_UI01`, đúng năm role/usernames, đóng JSON, hash version cụ thể; một transaction AppUser/UserRole, khóa lô, replay nguyên bundle, từ chối lô khác/partial. Không cập nhật tài khoản cũ, RolePermission, PrincipalBinding hoặc AuditLog/CommandOnly |
| R1 | `007-catalog-read.sql.pending`, nguồn `contracts/catalog-read-body.sql` | Tạo `pms.usp_AppCatalogRead` và role `pms_web_catalog_reader` với đúng một EXECUTE. Static SELECT/projection cho RoomType, vRoomStatus, Service, HotelSettings, BusinessDay; tham số có validation/filter/page, escape LIKE literal; quyền hiện tại được giữ nhất quán trong transaction. Không dynamic business SQL, private helper, SELECT grant hoặc impersonation |
| R1 membership | `007p-catalog-membership.sql.pending` | Chỉ thêm đúng service SID vào role catalog sau triển khai R1; không thay quyền ứng dụng |
| CLI nội bộ | `tools/sql/test-staff.mjs` | Prepare không mở SQL; import đòi manifest/target/maintenance principal/TLS/marker và RPC thật, gửi hash bằng typed parameters. Không API import. Lỗi/ACK sai sau phát lệnh giữ kết quả UNKNOWN, không tự retry hoặc đổi batch |
| Build artifact | `tools/sql/render-login-contracts.mjs` | Tạo 006/007 từ nguồn, không chạy SQL. Guard approval trước DDL; không ghi đè objects cũ. Không render lại bản đã điền approval/hash thực thi; lưu bản thực thi riêng trước triển khai |
| Manifest | `deploy/test-staff-seed.example.json`, `catalog-read.example.json` | Mẫu giữ approved=false; không chứa secret và không tự bật runtime. Manifest SQL seed và runtime website tách biệt |

003p/005p/006/007/007p **chưa thực thi hoặc biên dịch trên SQL Server**. Đọc nguồn và kiểm thử fixture không chứng minh SQL integration đạt. 001/003/005 giữ nguyên guard và nội dung hiện có; không chỉnh chúng để bỏ D1.

## R1 phòng là đọc trạng thái, chưa là xác nhận nhận phòng

R1 hiện chỉ đọc trạng thái từ `pms.vRoomStatus` đã có. Manifest mới khai báo rõ `CURRENT_STATUS_ONLY_V1` và `current-status-only`; backend trả meta `readScope=CURRENT_STATUS_ONLY, eligibilityVerified=false`. Frontend lễ tân hiển thị cảnh báo không dùng danh sách này làm chứng cứ khả dụng/đủ điều kiện check-in. Không suy diễn trống là sạch.

Manifest cũ thiếu eligibility vẫn bị chặn như trước. Không đổi logic availability/check-in của G5/G6/G7 hoặc cho phép command ghi. Chưa triển khai rate plans/rules/policy, customer search R2 hoặc timeline từ R1 mới; các capability đó tiếp tục bị khóa, không giả kết quả. Năm resource ban đầu có DTO giới hạn, không trả CustomerIdentity, PasswordHash, ExternalSubject hoặc dữ liệu tài chính.

## Bundle bí mật đã chuẩn bị, chưa nhập SQL

File thực, Git-ignore và ngoài static allowlist:

```text
C:\Users\Thang DZ\.gemini\antigravity\scratch\hotel-management-songlam\tools\sql\private\test-staff-B20261112_UI01\credentials.local.json
```

5 mật khẩu ngẫu nhiên khác nhau, salt riêng, `$pbkdf2-sha256-v1$600000$...` đúng verifier thực tế. Không mặc định thuật toán của dữ liệu cũ; database chưa có tài khoản. Không in mật khẩu/hash lên chat/log. **Prepared=5, SQL created=0. Chưa đăng nhập được bằng bundle này.**

CLI prepare đã chạy lại thành công với `reused=true`, giữ nguyên credential, không sinh tài khoản/lô mới. Xem trên máy chủ tài khoản Windows của người vận hành:

```powershell
notepad .\tools\sql\private\test-staff-B20261112_UI01\credentials.local.json
```

Đã phát hiện và sửa lỗi ACL do sandbox identity khác người vận hành. CLI nay từ chối prepare dưới sandbox và yêu cầu đúng operator; native icacls đặt owner/DACL rồi đọc lại xác minh: protected, một ACE FullControl duy nhất của operator. Đã chuyển owner/ACL bundle thực về chủ máy, loại sandbox; không cấp Everyone/Users hoặc sửa quyền SQL. Các lỗi Set-Acl/privilege trước đó không được coi là thành công, đã kiểm lại bằng CLI thực dưới operator.

## Lệnh đã chạy

```powershell
node tools/sql/render-login-contracts.mjs
node tools/sql/test-staff.mjs prepare
# prepare được chạy dưới đúng operator, không phải sandbox/service pool.
node --test backend/tests/test-staff-cli.test.js
node --test backend/tests/catalog-status-scope.test.js
node --test tests/frontend-services.test.mjs
node tests/frontend-api.browser.mjs
```

`npm.cmd test` trong backend: **129/129 đạt**, 0 trượt/skip. Trong đó CLI mới 4/4, scope catalog 2/2. Frontend service 7/7; browser hồi quy **67/67**, có fixture status-only mới. Tất cả đều có nguồn fixture/HTTP chưa cấu hình, **SQL nghiệp vụ = 0**.

Lần gọi render/check-syntax từ nhầm cwd backend báo MODULE_NOT_FOUND; đã sửa chạy từ repo root và render/check lại thành công. Không có SQL được chạy bởi lỗi CLI này.

SQL thực chỉ chạy SELECT metadata/counts: đúng target/GUID; các cột R1 được đối chiếu không có cột thiếu; 0 trigger active trên AppUser/UserRole, 0 AppUser, 0 marker. Không dùng việc không có trigger làm quyền tự INSERT.

## Trình tự áp dụng còn chờ

1. Giải quyết bằng chứng/marker D1 theo quyết định riêng của người dùng; 004r vẫn tạm dừng. Không cần duyệt lại database hoặc năm role.
2. Đối chiếu hash/reference các artifact cụ thể; triển khai 001 → 003; provision Windows account non-admin theo D2-P, rồi 003p. Kiểm effective quyền và runner thật, không dùng tài khoản metadata cho backend.
3. Triển khai 005 → 005p; cấp epoch ngoài SQL/Git, chứng minh TLS thật, không tự bật trustServerCertificate.
4. Sau review nội dung 006, triển khai RPC bootstrap bằng deployment identity, không service website. `prepare` đã có bundle; import chỉ sau khi manifest private có reference thật. Lệnh đề nghị, **chưa chạy**:

```powershell
node tools/sql/test-staff.mjs import 'C:\duong-dan-da-duyet\test-staff-seed.local.json'
```

5. Review/triển khai 007 → 007p, đặt contract đã được duyệt trong runtime manifest private. Entry point hiện có nạp gateway, không cần backend thứ hai. Không dùng file example như một phê duyệt.
6. Chạy login/me/permissions và từng role, room types/rooms/settings dưới service principal thật; lưu Network/request ID ↔ RPC/response, test thu hồi quyền và actor. Chỉ sau bằng chứng mới gọi là kết nối SQL thật.

Khôi phục: không tự DROP/thu hồi quyền/xóa nhân viên. Lỗi deployment trước commit rollback transaction; timeout đọc metadata trước retry. Seed đã commit nhưng lỗi receipt cục bộ có code riêng `STAFF_RECEIPT_WRITE_FAILED_SQL_CONFIRMED`; không hiểu là chưa ghi SQL. Seed timeout giữ bundle/batch; replay chỉ sau đối chiếu. Backup cũ giữ nguyên; không restore hoặc xóa để gỡ lỗi.

Trong lượt này không thay schema/procedure/trigger/quyền SQL, không tạo Windows principal, không import bundle, không seed bảng và không mở G12. Có mã nguồn/artifact mới, chưa có đăng nhập SQL thật.
