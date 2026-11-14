# Gói 016 nhận phòng — bản xin duyệt, 14/11/2026

> Cập nhật: gói đã được người dùng duyệt và áp dụng ngày 14/11/2026. Phần đọc G6 chạy SQL thật; check-in ghi phí vẫn khóa do lệch ngày nghiệp vụ. Xem [receipt thực thi và kết quả kiểm tra](checkin-016-execution.md). Nội dung bên dưới là bản review lịch sử, không thay thế receipt triển khai.

**Chưa chạy SQL, chưa mở nhận phòng, chưa nghiệm thu SQL.** Yêu cầu tiếp tục được dùng để hoàn thiện code/gói review; vẫn giữ ranh giới người dùng yêu cầu phê duyệt riêng procedure/quyền SQL.

## Phạm vi cụ thể

Nhận từ BookingRoom CONFIRMED chưa có Stay, cùng hạng phòng, đã phân đúng phòng. Có thể chọn từng phòng của đoàn; tối đa 25 phòng, 125 liên kết khách và 500 thay đổi trong một transaction. Kiểm phiên bản Booking/BookingRoom/Room/Allocation, khách chính/khách đi cùng đã khai báo, phòng CLEAN/VACANT/ACTIVE, không trùng Stay/block/bảo trì trên khoảng còn lại. Giữ thời gian thật từ SQL và snapshot G4 đã chốt; không đọc bảng giá mới để thay giá cũ.

Tạo Folio ROOM mới (người trả là khách đặt), Stay, StayGuest, StayRoomSegment, phí ROOM và phụ thu nhận sớm đã thỏa thuận; cập nhật trạng thái phần phòng/đơn, audit và receipt cùng commit. Cả lô lỗi thì rollback. Không ghi Payment/DepositMovement, không đối trừ cọc, không ghi phí trả muộn dự kiến, không mở MASTER tự động. Đơn có folio trước đó hoặc nâng hạng nằm ngoài profile này và bị từ chối.

Chính sách không bắt buộc cọc chỉ áp dụng đúng sourcePolicyVersionId của gói giá 012 đã duyệt. Không coi giao dịch pending là đã thu. Ngày hạch toán phải là WorkingDate OPEN **và khớp ngày khách sạn thực tế**; lệch ngày trả `BUSINESS_DATE_REVIEW_REQUIRED`, không tự đổi ngày hoặc ghi lùi.

## SQL cần duyệt

Target duy nhất `.\SQLEXPRESS / SongLamPms_Design`, GUID `C4DD399E-5661-4741-A424-5ABFEEFBC1AC`. Toàn bộ file nằm trong `database/proposals/stays/`; thứ tự/hash được cố định trong `docs/artifacts/checkin-016-review.json`.

| File | Đối tượng/tác động |
| --- | --- |
| `016-backup.sql.pending` | Backup mới COPY_ONLY/CHECKSUM và VERIFYONLY, không ghi đè file |
| `016-preflight.sql.pending` | Target/test marker, 015, đối tượng chưa tồn tại, service không sysadmin/db_owner, UUID backup thật; đối chiếu thêm 26 hash baseline |
| `016-stay-json.sql.pending` | CREATE FUNCTION `pms.fn_WebStay016Json`, projection Stay/guests/segments/giá đã chốt, không trả bí mật/số dư folio |
| `016-checkin-context.sql.pending` | CREATE private RPC `pms.usp_WebCheckInContext`, chỉ đọc/kiểm điều kiện |
| `016a-arrivals-read.sql.pending` | CREATE private RPC `pms.usp_AppStayArrivals`, đọc khách đến có lọc/phân trang |
| `016-stay-read.sql.pending` | CREATE public RPC `pms.usp_AppStayRead016`, list/detail/arrivals/readiness theo quyền G2 |
| `016-checkin-prepare.sql.pending` | CREATE public RPC `pms.usp_AppCheckInPrepare`, prepare chỉ đọc/replay có kiểm quyền |
| `016-checkin-commit.sql.pending` | CREATE public RPC `pms.usp_AppCheckInCommit`, transaction/khóa inventory, quyền giữ ổn định đến commit, version, nguồn phí, audit và receipt |
| `016-proof-and-receipt.sql.pending` | CREATE public RPC `pms.usp_WebCheckInRuntime`, `pms.usp_WebCheckInReceipt`, bằng chứng hash/lookup đúng actor/key/UUID |
| `016-grants.sql.pending` | Đúng 5 EXECUTE trên public RPC cho `pms_web_auth_test`; DENY EXECUTE trực tiếp trên hai private RPC |

Tổng **8 đối tượng mới: 1 function + 7 procedure**. Không ALTER bảng/trigger/thủ tục cũ, không sửa RolePermission hoặc cấp quyền SELECT/DML/schema/db_owner. Một extended property mới `SongLam.CheckIn016.Release` lưu receipt có approvalReference riêng, package hash, backup UUID thật, workflow policy id/hash, sourcePolicyVersionId, baseDeploymentId và operationalCutover=false.

Backup dự kiến: `C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\Backup\SongLamPms_Design_CheckIn016_20261113_d6a7d1e0.bak`. Ngày trong tên là mã gói từ lúc chuẩn bị, không phải bằng chứng đã backup. Nếu file tồn tại hoặc backup/VERIFYONLY thất bại thì dừng, không ghi đè/khôi phục tự động. Chưa có backup 016 thực tế.

Trước triển khai phải dừng đúng backend/importer/job ghi, kiểm session và giữ khóa inventory; không tự đánh dấu cửa sổ dừng ghi. CREATE + quyền + receipt trong cùng transaction, SET ANSI_NULLS/QUOTED_IDENTIFIER ON, rollback nếu lỗi. Không chạy từng file rời để báo thành công một phần. Chưa parse/compile các SQL pending trên server vì chưa có phê duyệt chạy; lỗi SQL phát hiện sau duyệt phải được xử lý trong phạm vi được phép và kiểm lại, không coi fixture là chứng cứ SQL.

## Code và cấu hình đã chuẩn bị

- G6 compiler đã tạo folio và phí trong cùng batch; kiểm profile, payer và snapshot. DTO readiness báo sai hạng/sức chứa thành blocker. Gateway phân biệt lỗi ngày nghiệp vụ và operation chưa hỗ trợ.
- Dùng chung proof adapter cho 015/016; startup yêu cầu receipt/hash của đủ tám module, đúng workflow policy/source policy và đúng contract G6. Một cờ approved không mở được SQL chưa triển khai.
- Runtime chỉ thêm `stays.checkIn` khi có proof 016 thực và release khớp; các thao tác chuyển/gia hạn/trả sớm/checkout/thu tiền vẫn khóa.
- `prepare-checkin-review.mjs --prepare` chỉ đóng gói offline. `prepare-checkin-runtime.mjs --prepare --approval=<mã duyệt>` chỉ tạo hai cấu hình private sau khi có `deployment-016.json` thật, không chép lên staging/khởi động/ghi SQL.
- Frontend lễ tân/HTTP client/G2 có sẵn được tái sử dụng. Không ghi kép hoặc fallback localStorage. Chưa kiểm tra nút nhận phòng thành công qua SQL vì chưa áp dụng gói.

## Kiểm thử và nghiệm thu sau duyệt

Đã chạy `npm.cmd test`: **181/181 fixture đạt**, gồm batch nhận phòng tạo folio/phí, từ chối profile chưa duyệt/payer sai và blockers hạng/sức chứa. Đã sửa lỗi source T-SQL tổng hợp chứa subquery bằng COUNT/CROSS APPLY. Đây là rà soát source, chưa phải bằng chứng SQL biên dịch/transaction đạt.

Sau khi được duyệt và ngày nghiệp vụ đủ điều kiện: tạo lô SONGLAM_TEST mới theo giờ thực và giá có hiệu lực, không nhận năm đơn gốc ở tương lai. Chạy thành công/đoàn nhận từng phòng; dirty/occupied/block/bảo trì/sai hạng/sai khách/version bị từ chối; hai nhân viên tranh cùng phần phòng; retry/timeout sau commit. Đối chiếu Stay/Guest/Segment, Folio/Entry và snapshot, quỹ không đếm trùng, audit đúng actor, một receipt, không có Payment/DepositMovement mới. Chỉ đánh dấu đạt khi có bằng chứng thực tế.

Rollback: trước commit triển khai thì rollback transaction; sau commit nhưng chưa kích hoạt thì giữ runtime cũ, chỉ gỡ đối tượng/quyền mới sau phê duyệt. Khi có Stay/charge mới, phải đóng băng ghi, backup và đối chiếu chúng trước mọi khôi phục; không restore backup cũ đè lên giao dịch mới.

## Hai quyết định còn chờ

1. Duyệt riêng triển khai SQL gói 016 nêu trên, không bao gồm đổi ngày nghiệp vụ hoặc mở G9.
2. Xác minh/nghiệm thu quy trình ngày nghiệp vụ: giá trị trước đây là 11/10/2026, ngày hiện tại 14/11/2026. Không tự cập nhật HotelSettings/BusinessDay. Nếu còn lệch thì gói có thể triển khai cấu trúc nhưng **chưa chạy check-in ghi phí**; phải có phương án ngày nghiệp vụ được duyệt riêng.
