# D4 — Actor/audit private, không đồng nghĩa command nghiệp vụ hoàn chỉnh

Trạng thái: **helper/adapter/fixture đã có; hợp đồng command nghiệp vụ nguyên tử, signing và kiểm chứng SQL thật chưa hoàn tất/chưa duyệt**. Không mở frontend ghi SQL dựa trên sự tồn tại của helper.

## Các phạm vi duyệt độc lập

| Mục | Artifact/đối tượng | Quyền và dữ liệu |
| --- | --- | --- |
| D4-H | `002-actor-internals.sql.pending`: usp_AppAssertActor, usp_AppAppendAudit | Helper private; không grant trực tiếp cho web. Khi domain RPC hợp lệ gọi, audit ghi AppUserId từ phiên server; bản triển khai helper không tự ghi audit mẫu |
| D4-R tùy chọn | `002b-actor-probe.sql.pending`: usp_AppActorProbe, role pms_web_actor_reader | Đúng một EXECUTE cho probe; trả AUTHORIZED, không ghi nghiệp vụ/audit/receipt |
| D4-P tùy chọn | membership role probe cho pms_web_auth_test | Phải duyệt riêng; không cần cho login |
| D4-C | Domain RPC, certificate/signature, receipt và quyền theo từng family | Chưa có tên/body/owner/certificate cuối được duyệt; không có installer ký/cấp quyền tổng quát |

002/002b đều khóa approval NULL, kiểm instance/GUID/marker D1, không ambient transaction, từ chối helper/probe/role đã tồn tại. Không đổi PrincipalBinding mỗi request, không dùng actor SESSION_CONTEXT trên pool, không nhận actor/role do browser khai.

Lệnh **chỉ đề nghị, chưa chạy**, sau D1 và duyệt riêng từng file/hash/target:

```powershell
Get-FileHash -Algorithm SHA256 database/proposals/auth-v1/002-actor-internals.sql.pending
sqlcmd -S 'lpc:.\SQLEXPRESS' -E -d SongLamPms_Design -b -r1 -i database/proposals/auth-v1/002-actor-internals.sql.pending
# Probe chỉ khi duyệt D4-R; không tự chạy sau helper:
Get-FileHash -Algorithm SHA256 database/proposals/auth-v1/002b-actor-probe.sql.pending
sqlcmd -S 'lpc:.\SQLEXPRESS' -E -d SongLamPms_Design -b -r1 -i database/proposals/auth-v1/002b-actor-probe.sql.pending
```

Membership D4-P đề nghị riêng, chưa chạy:

```sql
ALTER ROLE [pms_web_actor_reader] ADD MEMBER [pms_web_auth_test];
```

## Cơ chế cần duyệt để audit + nghiệp vụ + receipt nguyên tử

Domain RPC phải làm **một transaction**: khóa inventory/request theo cùng thứ tự → assert actor/quyền hiện thời → kiểm intent/replay/version/quỹ/giá → tạo ApiRequest PROCESSING + CommandExecution hợp lệ → ghi graph nghiệp vụ → audit đúng actor/request → receipt cuối cùng → dọn command context → COMMIT → ACK. CATCH rollback toàn bộ; timeout không tự retry như giao dịch mới, tra receipt cùng khóa.

AssertActor hiện yêu cầu exclusive transaction applock `SongLam:Inventory` trước identity locks để tránh đảo lock order. AppendAudit yêu cầu CommandExecution đúng @@SPID, ApiRequest đúng actor/operation/PROCESSING, user active và inventory lock; không tự tạo context để vượt CommandOnly trigger. Actor có quyền từ phiên G2 vẫn phải được kiểm lại ngay trong transaction SQL. Probe đọc không giữ quyền cho command sau đó.

| Family còn chờ D4-C | Hợp đồng liên quan | Phần phải nguyên tử |
| --- | --- | --- |
| Đặt/đoàn/phân/hủy | B2–B4, [G5](g5-sql-proposals.md) | Quỹ từng đêm + snapshot + mọi phòng/khách + cọc/nghĩa vụ hủy + receipt |
| Nhận/chuyển/gia hạn/trả sớm | C2–C4, [G6](g6-sql-proposals.md) | Phần chưa nhận/Stay/segment/availability/giá/folio phù hợp |
| Dọn/kiểm tra/bảo trì/block/đồ thất lạc | [G7](g7-sql-proposals.md) | Version/claim/vòng đời/lịch xung đột/custody/audit |
| Dịch vụ/minibar | [G8](g8-sql-proposals.md) | Dòng nguồn + FolioEntry/credit + trạng thái + chống phí trùng |
| Cọc/thu/hoàn/master/checkout/ca/ngày | F2–F5, [G9](g9-sql-proposals.md) | Các bút toán/receipt/đóng stay/trạng thái phòng/chốt ca, không ACK một phần |

Còn phải chốt: tên và body RPC theo từng family, intent hash/canonicalization, unique scope idempotency, receipt DTO/tra cứu sau timeout, version, deposit/folio locks, batch limit, rollback/replay và policy cụ thể. AppendAudit hiện nhận EntityId bigint; BusinessDay date key hoặc composite key cần hợp đồng riêng, không ép kiểu giả. Nếu gateway cũ đã ghi audit, chọn đúng một audit owner để không ghi hai lần. Không tự dựng một gateway tổng quát nhằm bỏ qua guard.

Nested-module đề nghị certificate user không login có EXECUTE tối thiểu vào helper; chỉ public domain RPC được duyệt mới được ký, countersign helper khi cần bảo toàn signature qua call. Web service không có EXECUTE helper, ALTER/certificate/IMPERSONATE. Phải duyệt tên certificate/owner, bodies/hash, quyền và script ký theo từng module; chưa có đủ thông tin nên không tạo bản ký chạy mù. Không bật TRUSTWORTHY/cross-db chaining hoặc dùng db_owner để chữa lỗi quyền. ALTER module phải kiểm/re-sign trước mở lại.

## Kiểm chứng và phục hồi

Sau duyệt: service gọi helper trực tiếp bị từ chối; module đã ký gọi được đúng phạm vi; không ký/sửa signature thì bị chặn; hai actor cùng pool có audit riêng; lỗi giữa ghi tiền/audit/receipt rollback toàn bộ; replay một kết quả; timeout sau commit tra receipt, không thu thêm. Fixture hiện có kiểm actor/CSRF/revoke/ACK/error isolation, **không chứng minh lock/transaction/unique thực của SQL**.

Rollback: dừng public commands trước, thu hồi grant/membership/signature mới theo phạm vi được duyệt; lưu definition/signature cũ để phục hồi. Giữ audit/receipt và giao dịch mới, không DELETE để làm test sạch, không restore backup cũ đè tiền mới. Rủi ro: nested permission/signature thiếu, lock order/deadlock, audit trùng, receipt không bind intent, khóa entity không đủ kiểu. Nếu không duyệt D4-C, helper có thể được chuẩn bị nhưng **D4 nghiệp vụ vẫn chưa hoàn thành**.
