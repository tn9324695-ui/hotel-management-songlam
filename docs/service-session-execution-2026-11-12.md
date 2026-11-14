# Mục 3–4: service principal và kho phiên SQL — 12/11/2026

## Phạm vi và kết quả thực tế

Phê duyệt: `USER-20261112-MODULES-3-4`, cùng xác nhận UAC tạo tài khoản và thêm vào Users. Ngoại lệ chứng chỉ được người dùng duyệt riêng: `USER-20261112-TEST-CERTIFICATE-EXCEPTION`. Chỉ áp dụng môi trường thử `.\SQLEXPRESS / SongLamPms_Design`; không triển khai G12.

| Thành phần | Kết quả đã quan sát |
| --- | --- |
| Windows identity | `DESKTOP-9EPI86K\songlam_pms_test` đang bật, thuộc Users, không thuộc Administrators |
| SQL identity | Windows login trên, database user `pms_web_auth_test`; không sysadmin/securityadmin/db_owner/db_datareader/CONTROL SERVER |
| Quyền | CONNECT; hai role `pms_web_auth_reader`, `pms_web_session_executor`; đúng 7 object-level EXECUTE, không cấp đọc/ghi bảng trực tiếp |
| Kho phiên | `pms.WebSession`, khóa ghép epoch/session hash, FK AppUser, index expiry/user; 4 RPC Probe/Create/Get/Destroy đã áp dụng |
| Pool thật | Backend PID 25476; DMV SQL xác nhận login riêng, đúng database, `Shared memory`, `encrypt_option=TRUE` |
| HTTP thật | `http://127.0.0.1:8093/login.html`; connection/status xác nhận pool + identity; auth/status fixture=false |
| Giới hạn | AppUser=0, WebSession=0; chưa đăng nhập đúng, chưa kiểm chứng vòng đời phiên có nhân viên; mọi ghi nghiệp vụ vẫn frozen |

13 kiểm tra SQL thật đạt: Windows identity; kết nối pool; SQL login/database; không quyền quản trị/datareader; environment RPC đúng marker; SELECT trực tiếp AppUser bị từ chối 229; không quyền DML trực tiếp bảng phiên hoặc EXECUTE cấp schema/database; AuthLookup/Identity không có tài khoản trả rỗng; session probe; session không tồn tại trả rỗng; destroy lặp an toàn; create với AppUser không tồn tại bị từ chối 53213. Không tạo tài khoản giả để vượt FK.

7 kiểm tra HTTP thật đạt: health; connection/status; auth/status; `/me` không phiên bị 401; login tài khoản không tồn tại bị 401 và không cấp cookie; `/ready` vẫn 503; trang login được phục vụ. Đây không phải kiểm thử đăng nhập thành công hoặc nghiệp vụ khách sạn.

`npm.cmd test` tại backend: **134/134 đạt**, gồm kiểm tra ngoại lệ chứng chỉ phải có tham chiếu duyệt riêng và vẫn bật mã hóa. Các bài này là **fixture/provider**, tách biệt kiểm tra SQL thật nêu trên. `npm test` qua npm.ps1 bị ExecutionPolicy chặn; dùng npm.cmd, không đổi policy hệ thống. Hai script PowerShell đã qua parser, không có lỗi cú pháp.

## Những gì đã áp dụng và bằng chứng

Chạy đúng thứ tự 003p → 005 → 005p bằng sqlcmd (Windows deployment identity, không dùng identity này cho pool). Các script kiểm tra đích vật lý, marker và phạm vi hiện có; không thay RolePermission, PrincipalBinding hoặc dữ liệu nghiệp vụ.

| Tệp | SHA-256 tại thời điểm chạy |
| --- | --- |
| `database/proposals/auth-v1/003p-service-principal.sql.pending` | D9AD74A70A303C802B6FF7E6F607481DF1B534E36C92F916C009E7E8A9B0676B |
| `database/proposals/auth-v1/005-session-store.sql.pending` | 90F942CF7ACB0DCD1C957C97EDB9CC45A4ADFAC170E3A9539DFA97450DDEF60F |
| `database/proposals/auth-v1/005p-session-membership.sql.pending` | 1CE8B4B12DFEA6F7D1BA39B86C087E17DE2E142A723CB61B15DE810EFE247700 |

Receipt thực: `tools/sql/private/modules-3-4-20261112/receipt.json`; kèm bản script đã chạy, output sqlcmd, metadata-readback, live-pool-readback, service-probe, http-probe. Thư mục private bị Git bỏ qua. Không chạy lại script 005 đã áp dụng: nó cố ý từ chối nhận lại object hiện có.

Backup trước triển khai vẫn giữ nguyên, UUID `50C40A72-2373-40B5-805D-6D249ACA9CA0`, COPY_ONLY/CHECKSUM và VERIFYONLY đã đạt theo receipt mục 1–2; không tuyên bố đã thử restore. Không chạy 002/002b/006/007/007p trong lượt này.

## Cấu hình và khởi động lại

Node dưới tài khoản tiêu chuẩn không đọc được ancestor `.gemini` trong profile người vận hành. Không mở rộng ACL profile. Đã tạo bản triển khai chỉ gồm mã frontend/backend/dependency tại:

`C:\ProgramData\SongLamPmsTest\20261112-modules-3-4`

Chỉ operator có FullControl, service có quyền đọc/chạy; logs riêng cho service ghi. Không sao chép .git, .env, dữ liệu khách, SQL hay credential vào bản mã. Đây là snapshot kiểm thử; sửa repo không tự cập nhật snapshot. Phải triển khai lại có kiểm soát trước khi xác nhận bản sửa mới chạy thật.

Pool trước đó bị `SEC_E_UNTRUSTED_ROOT` (`-2146893019`). Chỉ sau phê duyệt riêng mới đặt Encrypt=true, TrustServerCertificate=true trong manifest kiểm thử. Kết nối vẫn mã hóa nhưng chưa xác minh chuỗi CA/identity chứng chỉ; không dùng ngoại lệ này cho vận hành.

Khi listener 8093 đã dừng, mở PowerShell bằng operator hiện tại, tại repo:

```powershell
.\tools\sql\start-service-test.ps1 -ApprovalReference USER-20261112-MODULES-3-4
node tools/sql/verify-service-http.mjs
```

Script từ chối nếu cổng đã có listener, sai operator hoặc sai manifest. Không chạy `npm start` dưới operator rồi coi đó là pool dịch vụ. Nếu policy chặn script, dùng một tiến trình PowerShell `-ExecutionPolicy RemoteSigned -File ...`; không thay policy toàn máy. Script restart đã kiểm tra cú pháp; chưa chạy restart vì listener hiện tại đang dùng cho kiểm chứng. Manifest và epoch nằm trong `runtime/` của snapshot, logs trong `logs/`. Không expose cổng ra mạng ngoài.

## Bí mật, phiên và phục hồi

- Credential Windows: `tools/sql/private/service-account/credential.clixml`, DPAPI buộc operator/máy; không in mật khẩu, không đưa vào Git hoặc argv. Tài khoản không được cấp quyền quản trị. Theo dõi hết hạn mật khẩu theo chính sách Windows; đổi credential phải phối hợp tài khoản thật và DPAPI, không tự đặt PasswordNeverExpires.
- Epoch: `C:\ProgramData\SongLamPmsTest\20261112-modules-3-4\runtime\session-epoch.secret`; CSPRNG 32 byte, giữ ổn định qua restart, chỉ operator/service đọc. RPC lưu hash epoch và hash session ID, không lưu cookie nguyên bản. Không xoay epoch ở mỗi request/restart; xoay có chủ đích sẽ vô hiệu phiên cũ. Khi phục hồi backup, tạo epoch mới trước khi bật đăng nhập để không làm sống lại phiên đã thu hồi. Không in giá trị epoch vào log/chat.
- Cookie/CSRF/khóa/thu hồi quyền đã có kiểm thử fixture; kiểm chứng SQL thật các trường hợp có phiên còn chờ nhân viên thử. Chưa có tiến trình cleanup phiên hết hạn được triển khai; DBA cần phê duyệt lịch cleanup riêng. GET đã lọc hết hạn và trạng thái nhân viên.
- Dừng listener đúng PID sau khi xác minh owner/command/path; không kill mọi node.exe. Không có giao dịch nghiệp vụ mới trong lượt này. Nếu cần hoàn tác SQL/Windows identity, dừng pool trước, lưu receipt/backup hiện trạng và xin duyệt kế hoạch hoàn tác đối tượng/quyền cụ thể; không tự drop hoặc restore backup cũ.

## Phần chưa làm

Mục 5: hợp đồng bootstrap và nhập 5 nhân viên thử. Mục 6: R1 đọc danh mục. Mục 7: dữ liệu nền. Mục 8: kết nối toàn bộ frontend. Chưa nghiệm thu session create/get/logout/expiry/revocation với nhân viên SQL thật, chưa có bằng chứng audit nghiệp vụ, đặt phòng hoặc tài chính. Trường stage=G12 trong health là nhãn phiên bản code đã có, không có nghĩa đã cắt chuyển: `/ready`=503 và businessWritesEnabled=false.
