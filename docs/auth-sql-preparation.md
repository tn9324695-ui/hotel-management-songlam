# Chuẩn bị nối database hiện có — 11/11/2026

Bản quyết định mới cùng ngày tại [D1–D4](auth-sql-decisions.md) thay phạm vi proposal cũ: 001/003 chỉ còn 3 RPC/1 role auth; ActorProbe tách 002b; S0 có draft 005. Số đếm dữ liệu và kết quả test mới nhất ở bản đó; nội dung dưới đây ghi nhận lượt chuẩn bị trước.

Giữ `SongLamPms_Design` trên `.\SQLEXPRESS`, không tạo database mới. **Trạng thái 12/11/2026:** 000 đã chạy backup/VERIFYONLY đạt, 004 đã được duyệt riêng nhưng chưa chạy vì thiếu bằng chứng ngừng ghi. 001/002/002b/003/005 chưa được duyệt/chạy. Xem [D1](d1-approval-package.md), [preflight](d1-004-preflight.md) và [D2](d2-approval-package.md). Nội dung tiếp theo là lịch sử lượt chuẩn bị 11/11, không phải trạng thái mới.

## Đã thực hiện

1. Đọc repository/config/auth adapter/runtime/session store, schema script, quy tắc SQL guard và tài liệu phê duyệt. Không thấy AGENTS.md trong repo/các đường dẫn cha đã kiểm tra.
2. Dùng `sqlcmd` với Windows token để đọc **riêng system catalog** trên DB đã có: DB tồn tại; chín bảng tài khoản/quyền/audit cần thiết có mặt; cột đối chiếu phù hợp. Không đọc PasswordHash, tài khoản, khách, tiền hoặc các bản ghi nghiệp vụ. Chưa kiểm deployment/định nghĩa đầy đủ các trigger/procedure cũ.
3. Xác minh chưa có AppEnvironment/AppAuthLookup/AppIdentity/AppActorProbe; chuẩn bị 4 RPC đọc A0/A1/A2/A3-probe, 2 helper private A3, 2 role EXECUTE hẹp và mẫu marker test, đều ở `database/proposals/auth-v1/*.sql.pending`. Các file khóa mặc định, không chạy bằng SQLCMD hoặc tự triển khai. Không có CREATE DATABASE/login/admin/seed/reset hoặc đổi PrincipalBinding.
4. Viết bộ kiểm tra profile/pool timeout/cancel/close và target identity. Auth adapter hỗ trợ database đích được cấp rõ ràng; actor probe không trả ack ghi hoặc audit giả. Không tự mở pool/driver từ server.js.
5. Viết 6 test mới dùng provider giả, chạy riêng **6/6 đạt**; chạy toàn bộ backend **95/95 đạt, 0 trượt**. Không gọi đây là kiểm thử pool SQL thật.

Chi tiết SQL/đối tượng/quyền/chỗ A3 còn thiếu: [bản duyệt](../database/proposals/auth-v1/README.md).

## File thêm/sửa

- `backend/src/adapters/sql/test-profile.js`, `test-pool.js`; cập nhật `approved-contracts.js`.
- `backend/tests/sql-test-setup.test.js`.
- `deploy/sql-test-profile.example.json`, `deploy/sql-target.observed.example.json`.
- `tools/sql/check-profile.mjs`, `.gitignore`.
- `database/proposals/auth-v1/001-auth-read.sql.pending`, `002-actor-internals.sql.pending`, `003-rpc-permissions.sql.pending`, `004-test-marker.sql.pending`, README.
- Tài liệu này và README gốc. Không sửa `.env` thật, SQL đã cài, dữ liệu hoặc quyền; không chạy G11/G12/import.

## Lệnh và kết quả

```powershell
# backend/
node --test tests/sql-test-setup.test.js
npm.cmd test
# root — kiểm profile ngoại tuyến, không kết nối SQL
node tools/sql/check-profile.mjs --profile deploy/sql-test-profile.example.json
git diff --check
```

Test riêng 6/6, toàn bộ 95/95. CLI từ chối file mẫu với SQL_TEST_APPROVAL_REQUIRED/exit 1 **đúng chủ đích**, không báo connected hoặc login sẵn sàng. `git diff --check` không lỗi; có cảnh báo LF/CRLF ở các file cũ.

Metadata đã đọc bằng `sqlcmd -S 'lpc:.\SQLEXPRESS' -E -d SongLamPms_Design` với SELECT trên sys.tables/sys.schemas/sys.procedures/sys.columns/sys.types và DB_NAME(). Không chạy lệnh DDL/DML/GRANT/DENY/EXECUTE procedure đề xuất, không cài thư viện mới hoặc kiểm thử UI trong lượt này. Các kết quả UI/demo ở [báo cáo trước](verification-g0-g12.md) là lịch sử, không phải kết quả mới.

## Cần chốt trước khi áp dụng SQL

- Duyệt cụ thể 001/003 (bốn RPC đọc và hai role EXECUTE). 002 private helper và 004 marker test là các phạm vi riêng; không mở command nghiệp vụ chỉ vì có probe actor.
- Đích SongLamPms_Design đã được phép ghi dữ liệu kiểm thử. Còn chờ duyệt riêng chạy backup 000, marker 004, session 005 và lô dữ liệu cụ thể; không tự chạy luồng ghi.
- Service principal hẹp và phương thức auth của **backend**: Windows service identity hoặc SQL login riêng. Windows token đã đọc metadata không chứng minh phù hợp làm pool. Không gửi password trong chat; secrets chỉ qua môi trường/kho bí mật riêng.
- Kho phiên bền vững và thuật toán PasswordHash thực tế. S0 SQL session store được mô tả cụ thể trong bản duyệt nhưng chưa tự tạo bảng; chọn/duyệt rồi mới triển khai adapter/store thật. Không tự tạo nhân viên/mật khẩu mẫu.

Backend vận hành hiện vẫn chưa có driver/provider/pool/session store được phê duyệt, login SQL thật chưa nghiệm thu. Chuẩn bị code/SQL không đồng nghĩa đã nối DB cho các màn đặt phòng/thu tiền; các B/C/O/S/F/R còn theo thứ tự phê duyệt riêng.
