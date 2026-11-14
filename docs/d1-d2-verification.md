# Ghi nhận chuẩn bị D1/D2 — 11/11/2026

**Trạng thái hiện tại 12/11/2026:** 000 đã chạy backup/VERIFYONLY thành công, 004 đã được duyệt riêng nhưng chưa thực thi do thiếu bằng chứng ngừng ghi; xem [D1](d1-approval-package.md). 001/002/002b/003/005 chưa duyệt/chạy, không marker/fixture/cắt chuyển. **Các mục bên dưới là nhật ký lịch sử ngày 11/11**, gồm hash bản chưa điền approval; hash thực thi mới tại [receipt 000](d1-000-execution.md) và [preflight 004](d1-004-preflight.md).

## File trong phạm vi lượt này

- `docs/d1-approval-package.md`, `d2-approval-package.md`: tách backup 000, marker 004, auth 001/003 và binding principal D2-P; có lệnh đề nghị, điều kiện, điểm dừng và phục hồi.
- `docs/auth-sql-decisions.md`, `auth-sql-preparation.md`, `database/proposals/auth-v1/README.md`, `README.md`: sửa trạng thái đích test đã xác nhận, giữ từng phê duyệt SQL riêng.
- `database/proposals/auth-v1/000-backup-plan.sql.pending`: target/GUID/path/media cố định, guard không ghi đè, backup checksum/VERIFYONLY và receipt lịch sử msdb. Đã chạy sau lượt lịch sử này, ngày 12/11; xem receipt.
- `004-test-marker.sql.pending`: marker dự kiến, receipt 000 thực, reverify backup, cửa sổ dừng ghi và duyệt 004 độc lập trước transaction. Chưa chạy.
- `001-auth-read.sql.pending`, `003-rpc-permissions.sql.pending`: thêm guard physical identity/marker, từ chối transaction bên ngoài và objects/role cũ; 003 yêu cầu đủ RPC từ 001. Chưa chạy/biên dịch SQL.
- `deploy/sql-target.observed.example.json`: target test-use/write-permission confirmed; các execution approval vẫn false. `deploy/d1-review.json`: descriptor đề nghị, không phải runtime profile/receipt.
- `tools/sql/d1-review.mjs`: đọc file ngoại tuyến, phân biệt quyết định đích với quyền thực thi và receipt. Không kết nối, ghi file, chạy subprocess hoặc SQL. JSON receipt chỉ là tài liệu bằng chứng do người phụ trách cung cấp, không tự chứng minh backup có thật.
- `backend/tests/d1-review.test.js`: sáu kiểm tra độc lập, gồm sai target/receipt/checksum, approval thiếu, dừng ghi chưa xác nhận và giá trị cố định giữa plan/SQL.

## Lệnh thực sự đã chạy

| Lệnh | Kết quả | Giới hạn |
| --- | --- | --- |
| `node --test tests/d1-review.test.js` tại backend | **6/6 đạt**, 0 trượt | Synthetic receipt/file assertions; không SQL |
| `npm.cmd test` tại backend, sau thay đổi cuối | **108/108 đạt**, 0 trượt/skip | Unit/fixture/provider giả và request HTTP vào app kiểm thử; không driver SQL thật |
| `node tools/sql/d1-review.mjs deploy/d1-review.json` | Exit 0: test-use CONFIRMED, backup PENDING_SEPARATE_APPROVAL, marker BLOCKED; sqlConnected/writesExecuted false | Chỉ đọc file |
| `node tools/sql/check-profile.mjs --profile deploy/sql-test-profile.example.json` | Exit 1, `SQL_TEST_APPROVAL_REQUIRED`, đúng chủ đích | Runtime profile vẫn khóa; không gọi SQL |
| `git diff --check` | Không lỗi whitespace sau sửa README; cảnh báo LF/CRLF file cũ `run_suite.py` | Không sửa file cũ đó trong lượt này |
| `Get-FileHash -Algorithm SHA256` cho bốn pending 000/004/001/003 | Hash bên dưới | Chỉ đọc file |

102/102 là baseline fixture của lượt trước. Lượt này chạy một lần 107/107 khi mới có năm test mới, sau đó bổ sung kiểm tra đồng nhất artifacts và chạy lại toàn bộ: **108/108**. Không dùng bất kỳ con số này để kết luận SQL, tiền/cọc/folio hoặc nghiệp vụ đã đối soát đạt.

Đã đọc metadata SQL bằng `sqlcmd -S 'lpc:.\SQLEXPRESS' -E -d master` với SELECT SERVERPROPERTY, sys.dm_server_services, sys.dm_os_file_exists, sys.database_recovery_status, sys.extended_properties và tên principal. Không chạy file pending, BACKUP/RESTORE, tạo principal hoặc ghi bảng. Quan sát: server/GUID/path/service account/auth mode trong gói D1/D2; marker chưa có. `Get-Acl` thư mục backup bị từ chối truy cập cả khi thử ngoài sandbox; không chỉnh quyền hoặc tạo file để vượt lỗi. Vì vậy chỉ chứng minh thư mục SQL-visible, chưa chứng minh SQL service ghi được file.

Số đếm nghiệp vụ/AppUser=0 là lần kiểm chỉ đọc được ghi tại [bảng quyết định](auth-sql-decisions.md); không phải trạng thái đóng băng hoặc dữ liệu được seed. **Không có bằng chứng luồng nghiệp vụ chạy qua SQL Server**. Không mở pool ứng dụng bằng token metadata. Không kiểm thử UI mới vì không sửa frontend trong lượt này.

## Hash bản dự thảo đem duyệt

Hash SHA256 trên bytes hiện tại, trước khi điền approval reference/backup receipt. Khi được duyệt và điền các trường cho phép, lưu thêm hash bản thực thi và diff đúng các trường đó; đổi nội dung ngoài phạm vi phải duyệt lại. LF/CRLF đổi cũng làm đổi hash.

| File | SHA256 |
| --- | --- |
| 000-backup-plan.sql.pending | `E21E622BBACD47AD4AA06F94A2CDD3F859287AD9F5E26912FDED278BE36ACCEB` |
| 004-test-marker.sql.pending | `E2179F3D81D48BB9951E7CCDFDFD7093313347999FFB5651620AB9A3E703ED03` |
| 001-auth-read.sql.pending | `22F5E24A6E96A38DB2F18DB75A4E8422ED7AF2D291E7C5637B99257EF4F7FD15` |
| 003-rpc-permissions.sql.pending | `5FB3358B411EB2CBB93D096D1A863CC5ACE2CC8DCE0E12FF46896E959143207C` |

## Điểm chặn tiếp theo

1. D1-000: đã thực thi và VERIFYONLY đạt ngày 12/11, không chạy lại file/path cũ.
2. D1-004: đã duyệt riêng; chỉ còn thiếu bằng chứng ngừng ghi, chưa thực thi. Không tự bật stopped-writer guard.
3. D2-001/003: duyệt đúng ba RPC/ba EXECUTE. D2-P: duyệt riêng danh tính Windows, SQL login/user/membership. Chưa có service principal được cấp để chạy pool.
4. Đăng nhập thật vẫn khóa: AppUser=0, chưa có tài khoản nhân viên thử/phê duyệt fixture, chưa driver/pool bootstrap, S0/005 chưa duyệt. Chưa đủ điều kiện kiểm thử actor/audit hay tiền/phòng qua SQL.
