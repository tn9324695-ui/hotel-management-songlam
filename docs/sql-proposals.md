# Đề xuất phụ thuộc SQL cho G2 — CHƯA ĐƯỢC THỰC THI

G10 read-only dashboard/reports/accounts/roles/audit/exceptions và đối soát chỉ số/redaction/journal: [g10-sql-proposals.md](g10-sql-proposals.md). Chưa thực thi hoặc mặc định phê duyệt; không cấp thêm quyền.

G9 tài chính/checkout/ca-ngày/phiếu nội bộ, receipt nguyên tử và các policy cần duyệt: [g9-sql-proposals.md](g9-sql-proposals.md). Chưa áp dụng; không đồng nghĩa được cấp quyền hoặc bật giao dịch thật.

G8 về dịch vụ/minibar/folio tối thiểu, snapshot/segment/phạm vi kiểm, credit và 0đ: [g8-sql-proposals.md](g8-sql-proposals.md). Chưa được áp dụng hoặc mặc định phê duyệt.

Đề xuất mới G7 về RPC vận hành, sự kiện/custody/CAS, eligibility và quyền nghiệm thu được tách tại [g7-sql-proposals.md](g7-sql-proposals.md). Chưa có phê duyệt hoặc thực thi SQL cho các mục này.

Cập nhật sau khi viết code G2: vẫn chưa tìm thấy phê duyệt riêng A1/A2/A3. Chưa thực thi SQL. Backend có adapter và kiểm thử fixture, server mặc định tiếp tục khóa đăng nhập. Xem [trạng thái và hợp đồng G2](g2-authentication.md); code hoặc fixture không phải bằng chứng phê duyệt SQL.

Tài liệu nghiên cứu, không phải migration. G0–G1 không kết nối SQL Server, không chạy câu SQL, không tạo/sửa thủ tục, trigger, bảng, dữ liệu, user hoặc quyền. Không có driver SQL trong backend G1.

## Căn cứ và giới hạn

- Quyết định đã xác nhận: nhân viên đăng nhập username/password trên website; backend Node.js/Express; đích SongLamPms_Design; giữ cơ chế phân quyền hiện tại.
- Script nguồn `001_schema.sql` có AppUser với Username, PasswordHash, ExternalSubject, IsActive, RowVer.
- Script nguồn `006_command_gateway.sql` xác định actor của public Query/ExecuteCommand qua DATABASE_PRINCIPAL_ID và PrincipalBinding; private helper nhận ActorId và kiểm tra quyền.
- Script nguồn `007_enforce_access.sql` mô tả tài khoản ứng dụng không đọc/ghi bảng nền trực tiếp.
- Đây là phân tích script trong checkout. Tên/phiên bản/định nghĩa đang triển khai, quyền thực tế và trạng thái dữ liệu trên server phải kiểm tra lại bằng truy vấn chỉ đọc trước khi chốt G2. Không lấy các con số ghi trong tài liệu cũ làm bằng chứng mới.

## A1 — Tra cứu xác thực dành riêng cho backend

**Mục tiêu:** xác thực tài khoản website; không dùng password Windows/SQL của nhân viên.

Đề xuất một hợp đồng riêng, tên SQL chính thức chưa chốt:

- Input: username được chuẩn hóa theo quy tắc được duyệt; không nhận role hoặc actor do frontend gửi.
- Output riêng cho bộ xác thực backend: UserId, hash có thông tin thuật toán, IsActive và phiên bản bảo mật có thể lấy từ RowVer nếu phù hợp.
- Không cung cấp hash cho endpoint `/auth/me`, quản trị danh sách, audit hoặc log. Không thêm PasswordHash vào cổng mutation tổng quát rồi để audit chụp toàn dòng.
- Backend xác minh mật khẩu bằng thư viện hashing đã duyệt. Phản hồi sai username/password/disabled không tiết lộ tồn tại tài khoản.
- Chỉ principal dịch vụ xác thực được gọi; không cấp SELECT bảng hoặc public EXECUTE.
- Chính sách hash, giới hạn đăng nhập, reset/kích hoạt, tài khoản quản trị đầu tiên và nơi lưu phiên: chưa được phê duyệt.

**Cần duyệt:** hợp đồng đầu vào/đầu ra, caller tin cậy, quyền module, quản lý hash và tài khoản thật được khởi tạo. G1 không tự tạo tài khoản/phiên.

## A2 — Hồ sơ và quyền của nhân viên hiện tại

**Mục tiêu:** `/auth/me`, `/auth/permissions` có nguồn tin cậy, không dựa trên role mô phỏng hoặc localStorage.

- Actor lấy từ phiên đã xác thực của backend.
- Trả hồ sơ tối thiểu, trạng thái hoạt động và quyền hiệu lực theo các role đang active.
- Không trả PasswordHash, credential, giấy tờ hoặc số liệu tài chính không liên quan.
- Kiểm tra lại trạng thái/quyền để việc khóa tài khoản hoặc thu quyền có tác dụng.
- Không tự thay đổi ma trận hiện tại. Các chênh lệch đọc/ghi phải lập đề xuất riêng.

**Cần duyệt:** trường dữ liệu được trả, quy tắc phiên/cache/quyền, principal được gọi và cách xử lý thay đổi quyền giữa các request.

## A3 — Ủy quyền actor qua SQL connection pool

**Vấn đề:** pool chung mang một danh tính SQL. Public gateway mô tả trong script sẽ ánh xạ danh tính connection, không tự biết nhân viên website.

**Đề xuất:** cổng dịch vụ chuyên biệt xác minh caller backend, nhận AppUserId chỉ từ phiên backend đã xác thực và tái sử dụng kiểm tra quyền/transaction nghiệp vụ hiện có.

Yêu cầu:

1. Không tin UserId/CreatedBy/RecordedBy/ApprovedBy trong body, query hoặc header do frontend gửi.
2. Không sửa PrincipalBinding theo từng request; không dùng SESSION_CONTEXT có thể tự ghi làm chứng cứ xác thực.
3. Không dùng EXECUTE AS và REVERT thành các request rời trong pool.
4. Giữ kiểm tra AppUser active và quyền SQL tại thời điểm xử lý.
5. Cổng nghiệp vụ quản lý transaction; không bọc thêm transaction Node nếu hợp đồng SQL cấm ambient transaction.
6. AuditLog.ActorId và các trường nghiệp vụ phải là nhân viên đúng; log backend liên kết HTTP request ID với SQL RequestId.
7. Chỉ cấp EXECUTE cho principal dịch vụ hẹp, không db_owner/sysadmin/SELECT hoặc DML bảng nền. Module signing hay ownership chain phải được thiết kế và kiểm chứng; không xem ký module là xác thực người dùng HTTP.
8. Idempotency không được thay actor/payload khi retry; không giữ actor trong trạng thái connection dùng chung.

**Kiểm thử cần có sau phê duyệt:** hai nhân viên cùng pool nhưng audit tách đúng; giả actor bị chặn; quyền bị thu có tác dụng; lỗi/timeout/retry không làm rò danh tính; caller khác không gọi được cổng dịch vụ; không mất transaction hoặc tạo tiền hai lần.

**Cần duyệt:** cổng mới hay điều chỉnh cổng hiện tại, caller/SQL role/chứng chỉ, các quyền EXECUTE và hợp đồng truyền actor. Không thực hiện thay đổi nào trong G1.

## Phụ thuộc khác phải trình riêng

| Mục | Nội dung cần xác nhận |
| --- | --- |
| Khởi tạo | AppUser thật, cơ chế kích hoạt/reset, cấu hình khách sạn và ngày nghiệp vụ; không seed demo |
| Quyền đọc ngữ cảnh | Checkout cho thu ngân; dịch vụ/minibar; khách dự kiến; không cấp đọc tài chính rộng để tránh lỗi |
| Truy vấn đọc | ID, lọc, lịch, báo cáo, projection audit và hợp đồng số tiền/ID không mất chính xác |
| Điều kiện kết nối | Tài khoản dịch vụ, driver, cổng và chứng chỉ thực tế; không mặc định dùng sa hoặc cổng lịch sử |
| Dữ liệu thật | Browser/profile/origin, snapshot nguyên gốc, demo/thật, ánh xạ và đường nhập lịch sử; chưa xuất/nhập |
| Kiểm thử SQL | Môi trường được phép ghi; không tự chạy các test hiện có tạo/xóa database |

## Bảng phê duyệt G2

| Mã | SQL đề xuất | Quyền/dữ liệu đề xuất | Lý do | Ảnh hưởng nếu chưa duyệt |
| --- | --- | --- | --- | --- |
| A1 | Hợp đồng tra cứu xác thực | EXECUTE giới hạn; dữ liệu mật khẩu riêng cho verifier | Đăng nhập website | Login tiếp tục không khả dụng |
| A2 | Hợp đồng hồ sơ/quyền | Projection tối thiểu theo actor; không tự cấp quyền mới | Menu và API lấy quyền thật | Chưa triển khai me/permissions |
| A3 | Cổng ủy quyền actor | Principal dịch vụ, quyền module và audit được kiểm soát | Pool chung ghi đúng nhân viên | Không ghi nghiệp vụ qua pool chung |
| D1 | Đường khởi tạo được kiểm soát | Nhân viên/cấu hình thật do người quản trị xác nhận | Điều kiện chạy ứng dụng thật | Không tự tạo account/ngày làm việc |

Phê duyệt code G0–G1 không phải phê duyệt các mục trên. Chờ quyết định riêng trước G2.
