# Mục 5–6 — nhân viên thử và R1, 12/11/2026

Phạm vi được giao: hoàn tất mục 5 và 6 trên `.\SQLEXPRESS / SongLamPms_Design`. Tham chiếu `USER-20261112-MODULES-5-6`. Không đổi RolePermission, không thêm phòng/hạng phòng/dịch vụ/giá, không triển khai G12.

## Trạng thái hiện tại

| Thành phần | Kết quả thực tế |
| --- | --- |
| Backup trước triển khai | COPY_ONLY/CHECKSUM + VERIFYONLY đạt; chưa thử restore |
| 006 | Đã triển khai RPC bảo trì `pms.usp_SeedTestStaffBatch`, không cấp cho web pool |
| 007/007p | Đã triển khai `pms.usp_AppCatalogRead`, role và một quyền EXECUTE; gán service user vào role đọc |
| Lô nhân viên | Sau 009, đã tạo 5 nhân viên; chạy lại cùng lô trả createdCount=0/replayed=true |
| R1 trong server | Đã nạp catalogGateway; login và đọc danh mục qua API + trình duyệt thật đạt cho cả 5 vai trò |
| 008 | Đã được duyệt riêng và áp dụng; pattern Unicode đã sửa |
| 009 | Đã được duyệt riêng và áp dụng, metadata hai RPC ANSI_NULLS/QUOTED_IDENTIFIER=ON |
| 010 | Đã được duyệt riêng và áp dụng; chuyển timestamp qua binary(8) trước khi mã hóa hex trong 4 RPC |

Kết quả cuối: **57 kiểm tra HTTP/SQL thật đạt**, **37 kiểm tra trình duyệt thật đạt**, **137/137 fixture đạt**. Chrome riêng kiểm tra cả 5 vai trò, màn hình 1366×768 và 1920×1080; không có JavaScript exception hoặc lỗi tài nguyên. Đã xem ảnh lễ tân ở cả hai kích thước. Không dùng fixture/interception trong hai công cụ kiểm tra SQL/UI thật.

SQL DMV xác nhận backend PID **14384**, login `DESKTOP-9EPI86K\songlam_pms_test`, database đúng, `encrypt_option=TRUE`; không dùng operator làm pool. SQL role có tổng **8 object-level EXECUTE** (3 auth, 4 session, 1 catalog); không thêm quyền bảng hoặc RolePermission. Ghi nghiệp vụ frozen; `/ready` vẫn 503 vì chưa nghiệm thu vận hành/G12.

Credential: mở trên máy bằng `notepad .\tools\sql\private\test-staff-B20261112_UI01\credentials.local.json`. Không gửi nội dung qua chat. Login tại **http://127.0.0.1:8093/login.html**. Chỉ dùng 5 tài khoản SONGLAM_TEST cho môi trường thử, không vận hành.

### Kết quả theo API

| API | Kết quả SQL thật |
| --- | --- |
| POST auth/login, GET auth/me, GET auth/permissions, POST auth/logout | Thành công cả 5 tài khoản; sai mật khẩu 401, không phiên 401, logout thiếu CSRF 403, cookie cũ sau logout 401 |
| GET room-types, GET rooms | Cả 5 vai trò được đọc; []/total=0 đúng dữ liệu SQL; không thay bằng mock |
| GET services | Manager/receptionist/housekeeping: 200 với []; admin/cashier: 403 theo quyền hiện có |
| GET hotel-settings | 404 vì chưa có cấu hình; không tự tạo cấu hình/ngày/múi giờ |
| GET business-days, business-days/current | Manager/cashier: 200 [] hoặc current 404; vai trò khác 403 theo quyền |
| Giả mạo actor/role qua query | 400, không chấp nhận danh tính do browser gửi |

R1 phòng chỉ thể hiện hiện diện/vệ sinh/khai thác hiện tại, có cảnh báo chưa xác minh availability/block theo khoảng ngày. Lịch đặt phòng, quỹ phòng, đặt/nhận/trả phòng và tài chính chưa được nghiệm thu bởi kết quả này. Thiếu dữ liệu nền là mục 7; không tự seed hạng/phòng/giá. Admin hiện có ít quyền nghiệp vụ hơn manager ở một số API; giữ nguyên, không tự mở rộng.

Bằng chứng: `tools/sql/private/modules-5-6-20261112/http-integration.json`, `post-010-readback.txt`, `live-pool-final-readback.txt`, `receipt.json`; browser và 10 ảnh ở `screenshots/staff-sql/`. Đã sửa hai lỗi frontend khi chạy thật: auto-restore login điều hướng lặp sau submit (có fixture hồi quy), và reception không chuyển màn hình khi fragment thay đổi (đã chạy lại browser thật).

Backup trước 010 (bao gồm cả 5 nhân viên và tài khoản ngoài lô): **A88D6794-3C5B-4177-A1DE-9B78E980FDF2**, COPY_ONLY/CHECKSUM + VERIFYONLY đạt, chưa thử restore. Path `C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\Backup\SongLamPms_Design_G56_20261112_AA724C9A-B259-4BFE-AB70-F5ADBEA99748.bak`.

Giới hạn kiểm tra: expiry/revocation/concurrency nghiệp vụ và audit ghi tiền chưa được kiểm chứng SQL thật. Lần browser thất bại đầu tiên để lại một phiên test còn TTL; đã sửa cleanup cho các lần sau, không DELETE/purge trực tiếp. Đối chiếu cuối: 6 AppUser gồm 5 trong lô và letan01 giữ nguyên; 1 WebSession lưu, phòng/hạng/cấu hình đều 0. Phiên hết hạn được RPC bỏ qua; cleanup định kỳ vẫn cần quy trình DBA riêng.

## Nhật ký xử lý trước kết quả cuối

Các câu chờ phê duyệt/chưa kiểm chứng dưới đây ghi lại thời điểm phát hiện lỗi, được thay thế bởi kết quả cuối ở trên. Receipt từng lần vẫn giữ để truy vết.

Backup UUID: `2A0890FB-1716-47E1-8EB0-00E4B617ABDF`.

```text
C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\Backup\SongLamPms_Design_G56_20261112_F7FBA14B-96D1-41C5-B4CB-418BA2EDB2D5.bak
```

Bằng chứng riêng tư: `tools/sql/private/modules-5-6-20261112/` chứa backup output, ba script đã chạy và output sqlcmd. Bundle mật khẩu gốc vẫn ở `tools/sql/private/test-staff-B20261112_UI01/credentials.local.json`, chỉ operator đọc; không sinh lại hoặc in mật khẩu/hash. Không INSERT trực tiếp để vượt RPC.

## Lỗi đã xác định và phạm vi bản vá cần duyệt

1. Code CLI từ chối tên Windows có dấu cách (`Thang DZ`). Đã sửa validation cho dấu cách nội bộ, vẫn chặn đầu/cuối/control character/delimiter. Không dùng operator này làm service pool. Chỉ importer bảo trì dùng operator đã được chỉ định.
2. Lỗi SQL thật: với chuỗi/pattern Unicode dưới `Latin1_General_100_BIN2`, bracket pattern `N'%[^A-Za-z0-9_-]%'` từ chối ký tự `_` và `-` trong base64url hợp lệ. Đã tái hiện bằng alphabet công khai, không in hash. Pattern request ID của R1 có cùng lỗi.
3. CLI đã giữ mã lỗi số SQL (53706) để chẩn đoán nhưng không lộ raw driver message/payload. Sau kết quả chưa rõ, đã đọc lại SQL xác nhận AppUser=0 trước khi gọi lại cùng lô. Không tự tạo lô khác.

File 008 đã được duyệt riêng và thực thi với tham chiếu `USER-20261112-APPROVED-008-UNICODE-FIX`. Chỉ thay 2 pattern base64url trong SeedTestStaffBatch và 1 pattern request ID trong AppCatalogRead sang hyphen-first. Hai ALTER nằm trong cùng transaction; không đổi bảng, trigger, quyền hoặc dữ liệu. Kiểm GUID, marker và SHA-256 định nghĩa hiện hành trước khi áp dụng; sai bất kỳ guard nào thì dừng.

| Procedure | Hash định nghĩa trước vá |
| --- | --- |
| usp_SeedTestStaffBatch | 4494B579DA8E3E3F02BE7A86CF7C820A885018C037DB3DDE9234A8CA3B332229 |
| usp_AppCatalogRead | 92EDC0F323417163C2BB40953CA1983D88B7CFE40BB41555A0667127E419F107 |

Nguồn `contracts/test-staff-body.sql` và `contracts/catalog-read-body.sql` đã sửa để review; 006/007 đã chạy được giữ nguyên để đối chiếu hash. Không render lại hoặc chạy lại 006/007 trên database đã có đối tượng. Nếu transaction vá lỗi, rollback cả hai ALTER; sau commit cần kế hoạch hoàn tác riêng nếu phát hiện vấn đề, không tự restore backup đè dữ liệu.

Sau 008, importer gặp 1934 do metadata `uses_quoted_identifier=0`. Các lần triển khai sqlcmd thiếu `-I` và artifact cũ chưa SET QUOTED_IDENTIFIER ON. Đã sửa renderer cho các bản tạo sau, đồng thời soạn `009-fix-module-set-options.sql.pending` với guard hash định nghĩa sau 008, giữ nguyên toàn bộ thân hai procedure và capture ANSI_NULLS/QUOTED_IDENTIFIER ON trong một transaction. Chưa áp dụng 009 khi chưa được duyệt riêng.

Cập nhật: người dùng đã duyệt 009, tham chiếu `USER-20261112-APPROVED-009-SET-OPTIONS`. Lần đầu 009 rollback do SQL Server chuẩn hóa header ALTER thành CREATE trong OBJECT_DEFINITION; đã sửa chuyển header lại ALTER đúng ý định được duyệt, chạy lại thành công. Giữ cả hai attempt trong evidence. Import lần đầu sau đó xác nhận createdCount=5, replay xác nhận createdCount=0/replayed=true. Không sửa tài khoản ngoài lô.

Backup ngay trước 009 (đã bao gồm tài khoản ngoài lô): UUID `AD456418-7241-47BC-9035-AB0CADE4EC13`, COPY_ONLY/CHECKSUM và VERIFYONLY đạt, chưa thử restore. Path `C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\Backup\SongLamPms_Design_G56_20261112_3BC197AF-0253-4E20-A076-0AFD015AE9A3.bak`.

Đăng nhập HTTP thật hiện trả 503 AUTH_DEPENDENCY_UNAVAILABLE. Chẩn đoán dưới service identity xác nhận SQL `CONVERT(varchar(18),RowVer,1)` trên timestamp trả chuỗi nhị phân dài 8, không phải hex. Truy vấn chỉ đọc đã xác minh `CONVERT(varchar(18),CONVERT(binary(8),RowVer),1)` trả đúng 18 ký tự. Bản vá `010-fix-rowversion-hex.sql.pending` chỉ đổi biểu thức tương ứng trong AppAuthLookup/AppIdentity/WebSessionCreate/WebSessionGet, có guard hash và transaction cả 4 ALTER. Chưa áp dụng khi chưa có phê duyệt riêng; không nới validation backend để nhận phiên sai định dạng.

Trong lúc đối chiếu đã quan sát tài khoản ngoài lô `letan01` xuất hiện, UserRole=0. Công cụ lượt này không tạo/sửa/xóa tài khoản đó; không coi tổng AppUser=1 là tài khoản thử đã seed. Số tài khoản đúng tiền tố lô vẫn là 0. Mọi đối chiếu sau phải tách 5 tài khoản lô khỏi tài khoản hiện có của người dùng.

## Kiểm thử và bước tiếp theo

`npm.cmd test` chạy lại sau 009: **136/136 fixture đạt**. Thêm hồi quy tên Windows có dấu cách và bảo đảm SQL write error chỉ lộ số lỗi, không retry/không in secret. Chưa có login nhân viên thật thành công hoặc API danh mục có phiên thành công. Kiểm chứng SQL thật riêng: 009 metadata ON, 5 nhân viên đúng role, replay không tạo trùng; tổng 6 AppUser gồm tài khoản ngoài lô. Bằng chứng `post-009-readback.txt` và các import receipt trong thư mục private.

Đã bật catalog manifest và khởi động lại dưới service account (PID 14384), giữ epoch, frozen và đích kiểm thử. `node tools/sql/staff-catalog-http-check.mjs --approved=USER-20261112-MODULES-5-6` đã chạy: connection/status đạt, dừng ở login 503 AUTH_DEPENDENCY_UNAVAILABLE. Bằng chứng `http-integration-failure.json`; không coi là PASS. Bộ browser `node tools/verify/staff-sql-browser.mjs --approved=USER-20261112-MODULES-5-6` chưa chạy khi login còn bị chặn.

Sau phê duyệt 010: backup hiện trạng chứa cả 5 nhân viên và tài khoản ngoài lô → áp dụng 010 có receipt → kiểm chứng login/me/permissions/logout/CSRF và đọc R1 bằng hai công cụ trên → kiểm giao diện 5 vai trò. Không tạo lại lô hoặc mật khẩu. Chúng không dùng fixture và không lưu cookie/CSRF/password vào báo cáo. Xem credential trên máy bằng Notepad mở `tools/sql/private/test-staff-B20261112_UI01/credentials.local.json`; không gửi nội dung file qua chat.

Đọc danh mục trống phải trả []/total=0. HotelSettings và current BusinessDay chưa có thì 404 rõ ràng, không tự tạo mặc định. R1 phòng chỉ là `CURRENT_STATUS_ONLY`, chưa thay thế availability/timeline/block/check-in. Giữ nguyên quyền hiện có kể cả khi vai trò admin có ít quyền nghiệp vụ hơn manager; không tự coi tên admin là quyền toàn bộ.
