# Đổi/hủy phòng, lưu trú và tài chính — trạng thái 13/11/2026

Đã sửa code, **chưa mở ghi SQL các nghiệp vụ mới**. Quyền chạy SQL của lượt trước chỉ thuộc giá/khách/tạo đặt phòng. Yêu cầu phê duyệt riêng thay đổi procedure/quyền vẫn áp dụng cho giai đoạn này. Hai quyết định nghiệp vụ dưới đây không phải receipt triển khai SQL.

## Quy tắc người dùng đã chốt

- Người tạo yêu cầu hoàn không tự duyệt; chỉ quyền `approveRefund` hiện có được duyệt. Không cấp thêm quyền. Thiếu quyền thì khóa duyệt/chi.
- Cọc khi hủy và khoản chênh trả sớm chờ quản lý quyết định từng trường hợp. Giữ nguyên Payment gốc, không tự đặt tỷ lệ giữ cọc, không tự hoàn.
- Chưa chốt quy trình chi hoàn, giờ chốt ngày, xử lý ngày kinh doanh đang mở từ 11/10/2026, tích hợp ngân hàng hoặc hóa đơn điện tử.

Quyết định được ghi trong `deploy/lifecycle-policy-decisions.json`; không được nạp nó làm manifest SQL đã duyệt.

## Những việc đã làm trong lượt này

| Phần | Code thực tế | Trạng thái SQL |
| --- | --- | --- |
| Đổi phòng dự kiến | G5 kiểm receipt đúng booking/phòng đích và phân phòng mới; gateway hỗ trợ RPC riêng theo operation | Gói 015 pending |
| Hủy toàn đơn/phần chưa nhận | SQL đề xuất kiểm version, tập allocation, lý do, không có Stay và không có tiền/folio; hủy nguyên tử, giữ snapshot và lịch sử | Gói 015 pending; có tiền/folio thì từ chối, không giả số dư 0 |
| Gia hạn/trả sớm | Thêm `POST /api/v1/stays/:id/price-change-preview`; G4 tính, G6 kiểm `acceptedProposalHash` trước commit; giao diện dùng cùng đề xuất cho cả hai chiều | Thiếu RPC đọc/ghi G6 và G4 stay-change; trả 503 trung thực |
| Nhận phòng + mở folio | Compiler có đường `ATOMIC_ROOM_FOLIO_V1`, đưa Folio vào cùng lô, không gọi API mở folio trước rồi check-in sau | Chưa có hợp đồng SQL composite được duyệt; đường mới vẫn khóa |
| Checkout/minibar | Không coi biên bản 0đ là chưa kiểm; từ chối đổi audit hoặc đổi tiền tiêu thụ sau preview | Chưa có RPC quyết toán G9 |
| Hủy đối trừ cọc | Kiểm bút toán gốc phải thật sự là DEPOSIT_APPLY, đúng tiền movement APPLY | Chưa có RPC/journal G9 |
| Phục hồi sau timeout đổi/hủy | Adapter kiểm receipt SQL, 4 hash module, backup binding, quyền actor; lookup theo UUID/key/actor gốc | SQL/runtime mới chưa triển khai, không bật bằng cờ |

Frontend mới không ghi localStorage, không có mock success. Lỗi đọc preview không bị ghi thành giao dịch tiền UNKNOWN; các yêu cầu ghi vẫn đi qua coordinator hiện có. Đổi giờ/lý do trong lúc xem giá làm đề xuất hết hiệu lực. Hash chấp nhận bỏ thời điểm đọc mới, nhưng giữ tiền, nguồn giá, chính sách, lý do và snapshot nguồn.

## Gói SQL 015 xin duyệt riêng

Mục tiêu: chỉ đổi phòng dự kiến **cùng hạng**, hủy đơn/phần phòng **chưa nhận và chưa có bất kỳ Payment/DepositAccount/Folio**. Không nhận/trả phòng, ghi tiền, đổi hạng hoặc thay giá. Không gọi gateway ghi tổng quát cũ.

Các file dưới `database/proposals/booking-lifecycle/`:

1. `015-backup.sql.pending`: đích đúng GUID, backup mới COPY_ONLY/CHECKSUM, VERIFYONLY; không ghi đè file. Đường dự kiến SQL Server truy cập: `C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\Backup\SongLamPms_Design_Lifecycle015_20261113_935b5e35.bak`.
2. Batch đầu `015-preflight-and-grants.sql.pending`: kiểm target/test marker/014/service không sysadmin/db_owner, bốn đối tượng chưa tồn tại. `@VerifiedBackupSetUuid` cố ý NULL: phải dùng UUID thật sau backup, không tự điền giả. Phải đối chiếu đủ 22 hash baseline tại thời điểm áp dụng, SET ANSI_NULLS/QUOTED_IDENTIFIER ON và ghi nhận cửa sổ dừng ghi thực tế.
3. `015-booking-mutation-prepare.sql.pending`: CREATE `pms.usp_AppBookingMutationPrepare`, prepare chỉ đọc, quyền còn hiệu lực được kiểm cả khi replay.
4. `015-booking-mutation-commit.sql.pending`: CREATE `pms.usp_AppBookingMutationCommit`, tự tái dựng/đối chiếu toàn lô, không tin Changes/PreparedJson của client; khóa `SongLam:Inventory`, version và tập phân phòng; kiểm xung đột phòng/Stay/block/bảo trì; audit/receipt và cập nhật cùng transaction. Lỗi rollback toàn bộ, không đổi occupancy/cleanliness.
5. `015-proof-and-receipt.sql.pending`: CREATE `pms.usp_WebBookingMutationRuntime`, `pms.usp_WebBookingMutationReceipt`. Chỉ trả metadata/hash hoặc receipt thuộc actor hiện tại; không cấp xem toàn bảng.
6. Batch sau file preflight/grants: cấp đúng **4 EXECUTE** trên bốn RPC vừa nêu cho `pms_web_auth_test`. Giữ nguyên mọi RolePermission, bảng, trigger, quyền cũ và DENY generic gateway.

Bốn CREATE + bốn GRANT + receipt `SongLam.Booking015.Release` phải nằm trong **một transaction triển khai** sau backup. Receipt cần `baseDeploymentId`, `approvalReference` mới được người dùng duyệt, `packageSha256`, `backupSetUuid` thực và `operationalCutover=false`. Không tạo receipt trước khi biết kết quả transaction. Không dùng lại approval giá/khách/booking cũ cho 015. Nội dung/hashes gói và 22 baseline nằm tại `docs/artifacts/lifecycle-015-review.json`; đổi SQL phải tái lập gói và duyệt lại.

Chưa có lệnh apply tự chạy gói này. Không chạy nguyên file preflight/grants trước CREATE. Các file là gói review, chưa được parse/compile/execute trên SQL Server; chỉ kiểm tra code/fixture ứng dụng đã chạy. Không coi nhận xét source là bằng chứng SQL transaction/concurrency đạt.

Sau khi áp dụng được duyệt, người triển khai lưu receipt thật `tools/sql/private/lifecycle/deployment-015.json` (`status=SQL_015_COMMITTED`, target/GUID, baseDeploymentId, approvalReference, packageSha256, backupSetUuid, backupVerifyOnlyPassed, 4 định nghĩa, operationalCutover=false). `prepare-lifecycle-runtime.mjs --prepare --approval=<mã đã duyệt>` chỉ tạo hai file private chuẩn bị, không kết nối SQL hoặc kích hoạt. Startup còn phải kiểm receipt/hash SQL thực. Không chép manifest mới lên staging trước khi SQL và quyền được kiểm chứng.

Kiểm chứng sau duyệt: dùng lô mới gắn SONGLAM_TEST qua API tạo đơn hiện có, không sửa năm đơn đã đối chiếu; đổi cùng hạng thành công, trùng phòng/bảo trì/sai version bị từ chối, hai người đổi đồng thời chỉ một thắng; hủy từng phần/đơn có lý do; có tiền/Stay bị từ chối; retry/timeout lookup giữ cùng receipt. Đối chiếu allocation cũ/hủy, allocation mới, quỹ theo từng khoảng, snapshot không đổi, audit đúng actor và receipt cùng commit. Không dùng kết quả fixture làm kết quả nghiệm thu này.

Phục hồi: nếu backup/VERIFYONLY/hash/target/quyền không đạt thì dừng trước CREATE. Nếu triển khai lỗi thì rollback transaction. Nếu đã commit nhưng chưa kích hoạt, giữ source/manifest cũ, chỉ gỡ bốn đối tượng/quyền mới sau phê duyệt và kiểm không có caller. Nếu đã phát sinh lệnh mới thì đóng băng ghi, backup/đối chiếu mọi giao dịch mới; không restore backup cũ đè lên chúng. Công cụ không tự restore/xóa bản ghi thử.

## Các phụ thuộc sau 015 — chưa coi là đã làm xong

| Thứ tự | Hợp đồng cần bổ sung/duyệt | Lý do chưa mở |
| --- | --- | --- |
| 16a | Đọc Stay/arrivals/readiness; prepare/commit check-in + Folio ROOM + phí từ snapshot + guests/segment trong một transaction | Không có các RPC G6 thực tế trong manifest; không tạo folio rời; nhận theo giờ SQL thực, không nhận các đơn tương lai thành hiện diện hôm nay |
| 16b | Chuyển phòng + segment/allocation + phòng cũ DIRTY/tác vụ dọn; kiểm sạch/khả dụng và version | Chưa có command nguyên tử, không mở quyền nghiệm thu CLEAN |
| 16c | G4 stay-change + commit gia hạn/trả sớm, kiểm giá đã xem và policy mới, credit có liên kết, lịch sử trước/sau | Không tự tính lại đêm cũ bằng bảng giá mới; trả sớm có tiền cần quyết định quản lý cụ thể |
| 17a | Folio, mở ca, thu CASH, cọc RECEIVE/APPLY/UNAPPLY, chuyển master theo cặp và nguồn phân bổ | Cần journal và token tập ledger; schema hiện chỉ có bốn Kind DepositMovement, chưa có hai Kind ALLOCATE_IN/OUT mà API đề xuất; không tự sửa CHECK/view |
| 17b | Yêu cầu/duyệt hoàn theo maker-checker đã chốt; chi hoàn có ca/két đủ tiền và receipt | Chính sách người tạo/người duyệt đã chốt; quy trình chi và hợp đồng SQL chưa duyệt. Ngân hàng giữ pending |
| 17c | Preview/commit checkout tất cả hiệu ứng: minibar G8 thật kể cả 0đ, quyết toán từng phòng/master, đóng stay/folio, phòng DIRTY, audit/receipt | Chưa có Stay/Folio/MinibarAudit để chạy SQL; không tự tạo biên bản 0đ hoặc đóng thiếu bước |
| 17d | Chốt ca/ngày, phiếu nội bộ có nguồn; quyền đọc báo cáo đối soát | Cần chốt clock/cutoff và cách xử lý ngày OPEN 11/10/2026; không tự đổi WorkingDate, phát hành eInvoice hay xóa lịch sử để khớp tổng |

Đây là danh sách còn phải triển khai, không phải migration 16/17 đã viết xong hay được duyệt. Chi tiết contracts đã có ở `g6-sql-proposals.md`, `g9-sql-proposals.md`. Các adapter/UI cũ không đủ để kết luận nghiệp vụ đã chạy SQL.

## Kết quả kiểm tra của lượt này

- `inspect-lifecycle.mjs --read-only`: SQL thật, 5 Booking, 0 Stay/Folio/Payment/DepositAccount/RefundRequest/CashierShift/MinibarAudit; 179 cột và 28 trigger được kiểm metadata. Không xuất dữ liệu cá nhân.
- `npm.cmd test`: **178/178 fixture đạt**, gồm consent, quyền, chống activate từ manifest giả, drift hash/SET options và minibar 0đ. Không phải kiểm thử G6/G9 bằng SQL thật.
- `lifecycle-blockers-http.mjs --read-only`: **8 kiểm tra HTTP thật đạt**, phiên G2 SQL hiện có; endpoint preview mới 503 đúng chỗ bị chặn, CSRF/actor/quyền đúng; ghi tài chính vẫn khóa. Không tạo dữ liệu nghiệp vụ.
- `booking-sql-ui-readback.mjs`: **13 kiểm tra browser hồi quy đạt**, đọc năm đơn đã có từ SQL và layout 1366/1920/390. Không thử nhận/trả/thu/hoàn thành công.
- `reconcile-booking.mjs --read-only` trên bản cuối: **76 kiểm tra SQL đạt**; 5 Booking, 6 BookingRoom, 10 BookingNightRate, 6 allocation, 1 khách thử, 6 receipt, 28 audit; hash 420 Room không đổi. Tổng giá lưu trú dự kiến 71.750.000đ; thực thu/cọc 0đ, chưa là doanh thu. Đây là hồi quy dữ liệu booking cũ, không phải nghiệm thu SQL 015/G6/G9.
- Launcher `open-songlam-test.ps1 -NoOpen` xác nhận backend thử đã kết nối; source mới chạy dưới đúng service account, vẫn chỉ ba operation cũ. Không có migration, seed tài khoản hay dữ liệu nghiệp vụ mới trong lượt này. Đọc metadata/đối chiếu không ghi SQL; đăng nhập kiểm tra sử dụng kho phiên SQL G2 đã được duyệt.

Danh sách thay đổi chính: backend G5 DTO/service/gateway; G6 validation/service/compiler/routes/gateway; G4 stay-change hash; G9 receipt; cutover gate/proof adapter; frontend lễ tân/stays client/write coordinator/banner; launcher; tools metadata/review/runtime preparation/HTTP verification và hai test fixture mới. Giữ nguyên mọi thay đổi có sẵn của repository.
