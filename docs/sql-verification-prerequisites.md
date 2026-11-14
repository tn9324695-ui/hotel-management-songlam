# Điều kiện mở kiểm thử SQL — chưa được phê duyệt/triển khai

Theo xác nhận mới nhất của người dùng: tiếp tục sửa và kiểm thử code/fixture/API client/UI, **không ghi, import hoặc migration trên bất kỳ SQL instance/database nào trước khi được chỉ định**. SongLamPms_Design không mặc nhiên là DB test. Không yêu cầu mật khẩu trong chat.

Lượt rà soát chỉ truy vấn `sys.databases` trên master của `.\SQLEXPRESS` bằng Windows Integrated Authentication, không đọc dữ liệu khách: thấy SongLamPms_Design và QLKhachSan ONLINE; không có DB test/rehearsal được xác nhận. Không truy vấn dữ liệu nghiệp vụ ở hai DB này. Không chạy các runner `tests/sqlserver/*`: chúng có khả năng CREATE/DROP DB, install schema/seed/procedure, không thuộc phạm vi đã duyệt.

## Hợp đồng còn thiếu và chức năng bị chặn

Đây là danh sách đề xuất chính xác theo mã/tài liệu hiện có, không khẳng định tên RPC đã tồn tại. Các tên thủ tục mới và DDL phải được chốt/duyệt riêng. Bản script 001–008 không chứng minh deployment hiện tại. Không áp dụng bất kỳ SQL nào ở lượt rà soát.

| Hợp đồng | Chức năng bị chặn | Đối tượng/điều chỉnh SQL cần xem xét riêng | Nguồn đặc tả |
| --- | --- | --- | --- |
| A1 | Login username/password thật | RPC hẹp tra hash thực tế, active/security version; chỉ backend auth được gọi, không projection công khai/hash vào audit | sql-proposals.md A1 |
| A2 | Phiên/me/permissions và thu hồi quyền | RPC hồ sơ/quyền hiện tại theo AppUserId và version; xử lý khóa/thu hồi trên phiên cũ | sql-proposals.md A2 |
| A3 | Pool chung và audit đúng nhân viên | Service-principal RPC nhận actor tin cậy, recheck quyền cùng transaction; không đổi PrincipalBinding/SESSION_CONTEXT để giả actor; audit đúng RequestId/AppUserId | sql-proposals.md A3 |
| Kho phiên + thuật toán hash | Phiên vận hành bền vững | Chọn store/TTL/revoke và quyền hẹp; nếu chọn SQL mới trình bảng/RPC/quyền. Xác minh encoding PasswordHash thật, không giả định Argon2/scrypt từ fixture | g2-authentication.md |
| G3 đọc danh mục | RoomType/Room/Service/hotel/day/customer thật | RPC đọc theo actor với field/filter/page/scope được duyệt, tách ba trạng thái phòng; không cấp SELECT toàn bảng | g3-sql-proposals.md |
| P1/G4 | Giá đêm/giờ/early departure trên chính sách thật | RPC đọc đủ rule/calendar/hotel clock/policy version, nguồn ngày lễ/cuối tuần và closed policy profile được duyệt; không lấy tỷ lệ demo | g4-pricing.md P1 |
| B1 | Availability/timeline/booking list/detail thật | RPC khoảng ngày [start,end), từng đêm/khung giờ, room block và trạng thái giữ quỹ, đủ lịch phân phòng | g5-sql-proposals.md |
| B2/B4 | Tạo lẻ/đoàn, phân phòng và replay an toàn | Prepare/commit nguyên tử, khóa quỹ/physical overlap/CAS/version, snapshot G4, idempotency intent/payload + durable receipt; max rows/bytes thực tế | g5-sql-proposals.md |
| B3/B5 | Hủy có cọc, xác nhận HELD/online | Nghĩa vụ giữ/chờ hoàn có nguồn và phân bổ phần phòng; provider xác minh thực thu, pending không được confirmed-paid | g5-sql-proposals.md |
| C1/C2 | Check-in/chuyển/gia hạn/shorten | RPC đọc/prepare/atomic commit, kiểm phòng CLEAN/VACANT/ACTIVE và xung đột toàn khoảng dưới khóa; StayRoomSegment/guests đúng version | g6-sql-proposals.md |
| C3/C4/C5 | Folio/cọc/giá thay đổi/đổi hạng khi ở | Snapshot đã chốt, giá bổ sung/credit theo nguồn, approved upgrade scope; không thu/hoàn ngầm | g6-sql-proposals.md |
| O1/O2 | Lifecycle buồng phòng/bảo trì/lost-found | Atomic command + read/history/custody, CAS, actor, claim duy nhất và handoff/return đúng một lần | g7-sql-proposals.md |
| O3 | Block ảnh hưởng availability/assignment/check-in | ROOM_ELIGIBILITY_V1, kiểm booking/stay/block trong transaction, không coi sửa xong là sạch | g7-sql-proposals.md |
| O4 | Nghiệm thu phòng sạch | Chốt quyền/chính sách inspect; nếu phải thêm quyền/EXECUTE phải duyệt riêng, chưa cấp thêm | g7-sql-proposals.md |
| S1 | Dịch vụ/minibar với folio scope tối thiểu | RPC context đúng stay/segment, projection không lộ số dư buồng phòng | g8-sql-proposals.md |
| S2/S3/S4 | Giao/hủy dịch vụ, kiểm minibar và phí một lần | Snapshot từng line, zero audit, unique source-line, credit link gốc, transaction source+entry+receipt; giữ đúng giá cũ | g8-sql-proposals.md |
| F1/F2 | Folio/cọc/master thật | Read context/ledger; DepositMovement và chuyển hai phía nguyên tử, lineage credit/transfer, reserve cọc/refund không vượt available | g9-sql-proposals.md |
| F3 | Thu/hoàn, retry/timeout sau commit | Durable unique intent/key/receipt, xác minh provider, requester/approver/payout policies; chưa mở bank-confirm/approve chưa chốt | g9-sql-proposals.md |
| F4 | Checkout nguyên tử từng phòng/đoàn | Preview consistent + commit tiền/settlement/folio/stay/room DIRTY trong transaction, minibar coverage gồm 0đ, không ép đóng master | g9-sql-proposals.md |
| F5 | Cashier/day/internal invoice | Clock/timezone/cutoff/ngày kinh doanh, open/close shift/day, receipt uniqueness, khóa ngày đã chốt; e-invoice vẫn chưa tích hợp | g9-sql-proposals.md |
| R1/R2 | Dashboard/revenue/cash/debt đúng nguồn | RPC aggregate nhất quán, metric definitions/scope/asOf/business period được duyệt, đối soát source line, không cộng thu/cọc/transfer vào doanh thu | g10-sql-proposals.md |
| R3/R4 | Users/roles/audit/exceptions | Read projection an toàn theo quyền, nhạy cảm được che; journal bền vững và exceptions không thành revenue | g10-sql-proposals.md |
| G11 import/readback | Nhập thử và PASS thật | Registry source digest, historical graph atomic, crosswalk cardinality, evidence tiền/actor/PII encryption, receipt+checkpoint/readback đầy đủ; không dùng API thu tiền để nhập lịch sử | g11-sql-proposals.md |
| G12 receipt lookup | Tra kết quả giao dịch trên SQL | Protocol songlam.cutover-receipt.v1 được duyệt, actor/rights/ownership/deployment + key hash + original request, không raw payload | g12-sql-proposals.md |
| G12 activation/delta/stop | Cắt chuyển và rollback có giao dịch mới | Marker/watermark, baseline target binding, complete post-switch ledger/receipt reconciliation, incident và stop đa instance bền vững | g12-sql-proposals.md |

`pms.usp_Query`/`pms.usp_ExecuteCommand` trong mã nguồn gắn actor vào SQL principal qua PrincipalBinding, không phải bằng chứng hỗ trợ nhân viên website trên một pool. Không đi vòng qua private helper `usp_ReadResource`/`usp_ApplyCommand`, không cấp db_owner/sysadmin hay SELECT/DML toàn bảng để làm test xanh.

## Thông tin cần người dùng cung cấp/xác nhận

1. **Instance/server:** hostname hoặc `server\instance`; nếu TCP thì port, TLS/certificate/CA và tuyến truy cập được phép.
2. **Database kiểm thử:** tên chính xác, xác nhận là dữ liệu thử hoặc bản sao đã được xử lý phù hợp, owner và cách nhận diện/fingerprint; không tự chọn SongLamPms_Design.
3. **Phương thức xác thực:** Windows Integrated (danh tính dịch vụ được cấp) hoặc SQL login (tên login, bí mật cấp qua biến môi trường/kho bí mật cục bộ được phép). **Không gửi password/token/connection string chứa secret trong chat.** Repo hiện chưa có driver/pool bootstrap thật; sẽ bổ sung trong code khi hợp đồng/đích được duyệt.
4. **Phạm vi quyền:** danh sách RPC/view/read probe được EXECUTE/đọc, quyền session store, audit/receipt; quyền tối thiểu và ai phê duyệt. Không yêu cầu quyền quản trị để vượt gateway.
5. **Quyền ghi dữ liệu thử:** xác nhận rõ được phép INSERT/command nghiệp vụ nào, tạo user fixture/mở ca/ngày/thu-hoàn thử hay không, phạm vi cleanup và backup. Quyền ghi dữ liệu thử **không đồng nghĩa** được sửa schema/procedure/trigger/quyền SQL.
6. **Hợp đồng được phép:** mã phê duyệt, version/procedure names/parameters/projections/guarantees, các policy đã chốt và môi trường deploy, session store/hash support. Nếu cần triển khai SQL mới phải duyệt từng script/object riêng trước.

Hiện một số manifest/config vẫn ràng buộc tên SongLamPms_Design từ các giai đoạn trước. Khi có DB test được chỉ định sẽ phải ràng buộc cấu hình và manifest đúng đích đó bằng code được rà soát; không chỉ đổi tên DB rồi gọi gateway không khớp hoặc chạy installer.

Đề nghị lập hồ sơ test riêng (không chứa mật khẩu trong Git): server/instance/port, database/fingerprint, authMode/service identity, approvedContractReferences, allowedOperations, testWritesAllowed, backupReference/cleanupOwner. Không có thao tác ghi SQL nào được mở chỉ vì các trường này có giá trị.
