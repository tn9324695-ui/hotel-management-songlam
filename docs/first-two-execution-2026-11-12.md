# Hoàn tất mục 1–2: D1 và SQL đăng nhập — 12/11/2026

## Kết quả trên SQL Server thật

Người dùng xác nhận **“đúng rồi hãy sửa lại cho nó chạy được”** sau câu hỏi nêu rõ chạy 004r (backup mới, SINGLE_USER NO_WAIT, marker, MULTI_USER) rồi 001/003, không làm các mục 3–8. Tham chiếu: `USER-20261112-D1R-AND-AUTH-READ` và `USER-20261112-FIRST-TWO-001-003`.

Đích đã kiểm lại: `.\SQLEXPRESS`, server identity `DESKTOP-9EPI86K\SQLEXPRESS`, database `SongLamPms_Design`, physical GUID `C4DD399E-5661-4741-A424-5ABFEEFBC1AC`. Không tạo database mới hoặc dùng danh tính deployment làm service pool.

| Mục | Kết quả thực tế |
| --- | --- |
| 1 — D1 | 004r sqlcmd exit 0; có backup mới COPY_ONLY/CHECKSUM và VERIFYONLY đạt; hai marker commit/readback đúng; database đã MULTI_USER/ONLINE |
| 2 — 001 | sqlcmd exit 0; ba RPC SQL_STORED_PROCEDURE tồn tại và định nghĩa khớp source sau chuẩn hóa header SQL Server |
| 2 — 003 | sqlcmd exit 0; role pms_web_auth_reader có đúng 3 GRANT EXECUTE cấp object trên ba RPC, không có quyền rộng hơn trên role này |
| Kiểm caller âm | Cả ba RPC từ chối deployment caller chưa được gán role, ERROR_NUMBER=53010; không tạo user giả/EXECUTE AS để làm test đẹp |

Thực thi 004r khoảng **16:17:56–16:17:57 giờ Việt Nam**; SQL trả CompletedAtUtc `2026-11-12 09:17:57.0460626`. Không ép ngắt session hoặc rollback transaction của người khác.

## D1 — Backup và marker

Backup_set_uuid thực: **`50C40A72-2373-40B5-805D-6D249ACA9CA0`**. Tên UUID trong filename là định danh kế hoạch, khác UUID backup SQL thực.

```text
C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\Backup\SongLamPms_Design_D1R_20261112_b5f52bd3-8131-4193-954d-69cc81fca420.bak
```

Backup cũ của 000 giữ nguyên. Trước chạy: ONLINE/MULTI_USER, async statistics OFF, không có phiên/transaction khác trên đích; SQL Agent Stopped, không có enabled job nhắc database; không còn backend/importer thuộc pattern đã kiểm; ổ C còn hơn 107 GB. Script giữ cùng kết nối trong SINGLE_USER từ trước backup đến sau marker, NO_WAIT từ chối tranh chấp thay vì ép ngắt. Sau đó trả MULTI_USER và kiểm lại bằng một kết nối khác.

Giá trị đã đọc từ SQL sau commit:

| Property | Giá trị |
| --- | --- |
| SongLam.Environment | `test` |
| SongLam.TestIdentity | `eb18c6f2-373d-4a83-a34f-d9809f1cbc7a` |

**Không chạy file 004 gốc.** Receipt backup 000 cũ vẫn ghi stopped-writers=false đúng lịch sử; không sửa thành true. D1 được hoàn thành qua backup mới/cửa sổ kiểm soát của 004r, không giả định khoảng thời gian sau backup cũ không đổi. CLI d1-review cho kế hoạch gốc không phải trình đọc trạng thái SQL mới; dùng receipt thực thi mới và readback ở đây.

## 001/003 — Đối tượng và quyền đã áp dụng

- `pms.usp_AppEnvironment()`.
- `pms.usp_AppAuthLookup(@Username nvarchar(100))`.
- `pms.usp_AppIdentity(@AppUserId bigint)`.
- Role `pms_web_auth_reader`, đúng ba `GRANT EXECUTE ON OBJECT::pms.<RPC>` tương ứng. Role có **0 thành viên**; chưa cấp service user/login hoặc SELECT/DML/schema-wide EXECUTE.

Hash definition: so source literal 001 với `sys.sql_modules` sau bỏ CR. SQL Server lưu header mới từ `CREATE OR ALTER PROCEDURE` thành `CREATE   PROCEDURE`; verifier chỉ chấp nhận hai header chính xác này, không bỏ qua khác biệt trong body. Ba module khớp. Không đọc/ghi giá trị PasswordHash; chỉ kiểm hash **mã nguồn procedure**, không phải hash mật khẩu.

SHA256 file đã thực thi:

| File | SHA256 |
| --- | --- |
| 004r-controlled-window.sql.pending | `9DA88FAE4EE483D523C64F02A32CA80273B97035A0F68A472A51A2D41FDF2F7F` |
| 001-auth-read.sql.pending | `56929142B2AF79555C5253D61D5FAFBE1378C209DA109EE04C8ED9212143B6FC` |
| 003-rpc-permissions.sql.pending | `0C3E66D98603BD0C15B10CAFBA69E2FB7544FC1C64470AD3FC7750E82EE544DF` |

Chỉ điền target/approval/comment của các file, không thay logic auth để vượt chốt. DDL trong 001/003 chạy bằng transaction của từng script; bước trước đạt mới làm bước sau. Không chạy lại các file này vào database đã có object/backup; guard sẽ từ chối. Không tự rollback objects hoặc restore database sau thành công.

## Bằng chứng và lệnh đã chạy

Thư mục riêng Git-ignore `tools/sql/private/first-two-20261112/` chứa bản SQL thực thi, SHA256, output 004r/001/003, kết quả caller âm, SQL readback JSON và `receipt.json`.

Các lệnh thực thi chính, lần lượt sau khi hash/preflight đạt:

```powershell
sqlcmd -S 'lpc:.\SQLEXPRESS' -E -d SongLamPms_Design -b -r1 -l 15 -i database/proposals/auth-v1/004r-controlled-window.sql.pending
sqlcmd -S 'lpc:.\SQLEXPRESS' -E -d SongLamPms_Design -b -r1 -l 15 -i database/proposals/auth-v1/001-auth-read.sql.pending
sqlcmd -S 'lpc:.\SQLEXPRESS' -E -d SongLamPms_Design -b -r1 -l 15 -i database/proposals/auth-v1/003-rpc-permissions.sql.pending
```

Lệnh thực tế có `-o` tới output riêng và định dạng `-W -s '|'`; không có credential trong argv. Kiểm chứng bằng `tools/sql/readback-first-two.sql` (chỉ SELECT) và `tools/sql/verify-first-two.mjs` (chỉ đọc evidence) cho `FIRST_TWO_SQL_VERIFIED`. Verifier không tự kết nối SQL và không cấp runtime approval. Receipt ghi false rõ ràng cho login/servicePool/restoreRehearsal.

Lỗi ở bước **xuất readback**, không phải deployment: sqlcmd từ chối -y10000 (tối đa 8000), sau đó alias SQL `backup` cần `[backup]`; đã sửa helper SELECT và chạy lại. Lần so hash đầu nhận khác biệt header CREATE OR ALTER của SQL Server, đã kiểm prefix/suffix/byte length và sửa so sánh giới hạn đúng header. Không chạy lại backup/DDL hoặc sửa procedure để khắc phục lỗi định dạng này.

## Giới hạn: chưa phải đăng nhập website thành công

Readback thật: AppUser=0, UserRole=0, PrincipalBinding=0, auth role members=0, WebSession chưa có. Không tạo Windows account, SQL login/user, phiên hay nhập 5 tài khoản thử. Không chạy 002/002b/003p/005/005p/006/007/007p. Không sửa RolePermission, dữ liệu phòng/khách/booking/tiền, `.env` hay mở G12.

Điều kiện D1 **không còn là điểm chặn**. Bước tiếp theo theo danh sách người dùng là **mục 3 — service principal cho backend**, rồi mục 4 — kho phiên. Chưa được gọi là pool backend kết nối SQL hoặc đăng nhập thật trước khi những phần đó được làm và kiểm chứng. Kiểm thử caller hợp lệ dưới service principal dành cho bước sau; không dùng danh tính metadata/admin làm người dùng ứng dụng.

## Kiểm thử code sau cập nhật trạng thái triển khai

- `node --test tests/d1-review.test.js tests/first-two-evidence.test.js` trong backend: **9/9 đạt**, kiểm guard đã ghi phê duyệt và so sánh evidence synthetic, không chạy SQL.
- `npm.cmd test` trong backend: **133/133 đạt**, 0 trượt/skip. Đây là fixture/unit/HTTP, không phải 133 lần đăng nhập hoặc nghiệp vụ SQL thật.
- `node tools/sql/verify-first-two.mjs`: receipt hiện tại đạt; chạy lại cho `receiptReused=true`, không ghi đè receipt hoặc kết nối SQL.
- SQL thật riêng biệt: ba lệnh triển khai 004r/001/003 đều exit 0; readback marker/access mode/backup, module hashes, grant set đạt; **3 kiểm tra từ chối caller** đạt. Chưa kiểm caller hợp lệ/login/pool/restore.
- `git diff --check`: không lỗi whitespace, chỉ cảnh báo LF/CRLF có sẵn ở run_suite.py.

File code kiểm chứng bổ sung: `tools/sql/readback-first-two.sql`, `verify-first-two.mjs`, `backend/tests/first-two-evidence.test.js`; cập nhật `d1-review.test.js` để không giả định 001/003 còn guard NULL sau phê duyệt. Tài liệu/descriptor ghi 004 gốc chưa chạy được phân biệt với marker đã commit qua 004r; các ghi nhận lịch sử không được dùng để báo D1 hiện còn thiếu.
