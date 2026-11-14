# Gói duyệt 011 — nhập dữ liệu nền 420 phòng

**Cập nhật: người dùng đã duyệt riêng gói 011 và lô dữ liệu nêu dưới. Backup/VERIFYONLY, triển khai RPC, nhập và replay đã thực hiện thành công.** Kết quả mới nhất ở [biên bản thực thi](foundation-base420-execution.md); các guard NULL và bước chưa chạy bên dưới ghi lại giai đoạn trình duyệt, không phải trạng thái hiện tại.

## Các quyết định đã có

- Người dùng chọn bản `Danh_muc_Muong_Thanh_Luxury_Song_Lam_hoan_thien.xlsx` làm dữ liệu chính của đồ án. Giữ nguyên nhãn “Giả định đồ án” trong nguồn để truy vết; chưa xác minh độc lập là dữ liệu vận hành khách sạn thực.
- Ngày nghiệp vụ **11/10/2026** → `2026-10-11`, ưu tiên xác nhận trực tiếp của người dùng thay cho ngày 01/11/2026 trong Excel.
- Dùng 11 mã hạng đã chốt. Ánh xạ PDK → PRE-K, PDT → PRE-T theo tên hạng và quyết định trước; giữ DLX-TR trong danh mục, không tạo phòng hoặc giá cho hạng này.
- Nhập trước **420 phòng**, cách ly **501, 902, 1303, 1704, 2105**. Không đổi bảo trì thành inactive để làm dữ liệu có vẻ hợp lệ. Nguồn gốc vẫn đủ 425, không mất dấu 5 phòng chưa nhập.

Các quyết định này **chưa cấp quyền chạy thủ tục SQL mới**. Guard duyệt triển khai/ghi vẫn NULL/false; backend vẫn frozen.

## Nội dung cụ thể trình duyệt

| Thao tác | Phạm vi |
| --- | --- |
| 011-foundation-backup.sql.pending | COPY_ONLY/CHECKSUM + VERIFYONLY mới, không RESTORE; dừng nếu lỗi |
| 011-foundation-base420.sql.pending | Tạo duy nhất RPC maintenance `pms.usp_SeedFoundationBatch`; không GRANT hoặc đổi role/user/login |
| Gọi RPC qua CLI nội bộ | Thêm 1 BusinessDay OPEN ngày 2026-10-11; 1 HotelSettings; 11 RoomType; 420 Room; 15 Service trong **một transaction** |
| Receipt SQL | Thêm duy nhất database extended property `SongLam.FoundationBatch.FOUNDATION_2E1E523B_BASE420`, chứa batch/source/payload hash, counts, thời điểm và ORIGINAL_LOGIN; commit cùng dữ liệu |
| Replay | Cùng payload trả lại mapping source ID → SQL ID; không thêm bản ghi, không sửa nguồn cũ |

Không tạo bảng/trigger, không đổi quyền, không tạo tài khoản, không tạo PrincipalBinding. Không ghi RatePlan/RateRule/PolicyVersion, Booking/Stay, cọc, thu/hoàn, Folio/AuditLog nghiệp vụ hoặc RoomAllocation/bảo trì. Receipt là nhật ký setup bảo trì có Windows login thực, không giả làm audit của một nhân viên thao tác nghiệp vụ.

## Payload được review

Nguồn mới SHA-256: `2e1e523b3c0463e07a744a78b68fe9ec1c7d3dc05bacb7bb974b95f19daade5d`. Nguồn hạng DLX-TR giữ từ workbook trước SHA-256 `76ad26790afe131e9fcb15ecb12c075d85bd6cdc79a6075261212e1db6d75964`.

Payload cố định ở `tools/sql/private/foundation-base420-20261112/payload.local.json`. Hash của canonical JSON **UTF-16LE** (khớp SQL nvarchar HASHBYTES): **52CB39B0D301C1C64DF0DDF6F4A293040C22CE6F52B585B3E297A75DE37CBAEC**. Đây là checksum dữ liệu, không phải mật khẩu/hash mật khẩu.

- 10 hạng trong workbook mới được đề xuất active; DLX-TR giữ inactive, 0 phòng và chưa có giá. Đây là giá trị khởi tạo trong payload để duyệt cùng gói, không phải kết luận DLX-TR ngừng khai thác thật.
- 420 phòng: **405 CLEAN, 9 DIRTY, 6 CLEANING**, IsActive=true theo cột “Khai thác” của nguồn. Không tạo Stay: hiện diện trống được view suy ra từ việc không có segment. Không tự đánh dấu các phòng bẩn/đang dọn là sạch.
- 15 dịch vụ được đề xuất active; mã nhóm FNB/SPA/TRANSPORT/LAUNDRY/MINIBAR/COMPLIMENTARY. FREE-01 có giá 0 đúng dữ liệu, tách khỏi MB-01 tính phí.
- Múi giờ SQL SE Asia Standard Time ánh xạ từ Asia/Ho_Chi_Minh có trong nguồn; VND, nhận 14:00, trả 12:00. Giữ tên/địa chỉ/số liên hệ trong bản mới. TaxCode=NULL vì ô nguồn là MST-DEMO-SONGLAM, không nhập làm MST pháp lý thật.
- Ngày nghiệp vụ mở là đề xuất khởi tạo cần duyệt cùng lô. Không tự chốt ngày khác đã mở: nếu bất kỳ dữ liệu nền hiện có thì command dừng.
- Giá file chỉ từ 01/11/2026 đến hết 31/12/2027. Không tạo giá cho 11–31/10, không đổi kỳ hiệu lực. Chính sách/giá để ở review riêng; chưa kích hoạt giá giờ, cọc 30%, hủy/hoàn, trả sớm hoặc phụ thu chỉ từ văn bản Excel.

## Ràng buộc và preflight

Đích duy nhất `.\SQLEXPRESS / SongLamPms_Design`, server identity `DESKTOP-9EPI86K\SQLEXPRESS`, physical GUID `C4DD399E-5661-4741-A424-5ABFEEFBC1AC`, hai marker test đã biết. Thực thi setup bằng Windows operator hiện có `DESKTOP-9EPI86K\Thang DZ` **chỉ cho maintenance**, không thay danh tính pool dịch vụ.

Preflight chỉ đọc đã chạy: RoomType/Room/Service/HotelSettings/BusinessDay đều 0; chưa có usp_SeedFoundationBatch; không có trigger trên năm bảng ở lần kiểm tra này. Cần kiểm lại lúc thực thi, không dùng kết quả cũ để giả định đích chưa đổi.

Backup directory SQL Server đã truy cập được ở các gói trước:

`C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\Backup\`

File mới dự kiến `SongLamPms_Design_Foundation420_<NEWID>.bak`, không ghi đè backup cũ. Backup_set_uuid chỉ ghi từ kết quả SQL thực. VERIFYONLY đạt chưa đồng nghĩa đã thử restore. Backup hoặc preflight lỗi → **dừng trước triển khai/nhập**.

RPC giữ applock và range locks trên các bảng nền, từ chối trigger mới thay vì tắt/bỏ qua. Payload hash cố định, scope/count/quarantine kiểm lại server-side. Không có auto-split lô. Nếu chưa có receipt mà bảng đã có dữ liệu thì dừng; không nhận lại hoặc sửa dữ liệu hiện có.

Receipt và dữ liệu commit nguyên tử. Replay so hash và các projection typed, giữ null và phân biệt hoa/thường bằng JSON hash, phát hiện thay đổi sau nhập thay vì sửa. CLI timeout/thiếu mapping báo FOUNDATION_OUTCOME_UNKNOWN, không tự retry hay đổi batch. Nếu SQL xác nhận nhưng ghi receipt file lỗi thì báo SQL_CONFIRMED_LOCAL_RECEIPT_FAILED.

## Lệnh chỉ chạy sau duyệt riêng

1. Kiểm hash file/payload và preflight; chạy backup với sqlcmd **-I**, xác nhận VERIFYONLY.
2. Điền đúng tham chiếu duyệt vào guard triển khai và guard ghi trong bản 011; lưu bản trước/sau và hash execution. Không sửa logic khác.
3. Chạy 011 bằng sqlcmd -I trên đúng target; readback definition và kiểm không có web EXECUTE grant.
4. Cập nhật approval.local.json với bằng chứng deployment và tham chiếu cấp phép maintenance/data writes; không đưa bí mật vào file.
5. Chạy `node tools/sql/foundation-batch.mjs import <absolute-payload-path> <absolute-approval-path>`; CLI chỉ gọi đúng RPC, typed nvarchar parameter.
6. Đối chiếu mapping 11/420/15, dữ liệu từng trường, 5 phòng cách ly và receipt. Replay cùng lô phải created=false. Kiểm giao diện SQL thật với 5 vai trò, bộ lọc, chi tiết và các trạng thái.

Các kiểm tra HTTP cũ giả định bảng rỗng phải được thay bằng đối chiếu payload đã nhập trước khi chạy lại; không sửa test để bỏ qua dữ liệu sai. Chưa thực hiện các lệnh trên trong lượt chuẩn bị.

## Kiểm thử và phục hồi

**153/153 fixture đạt**, gồm chuẩn bị đúng 420/5, không kích hoạt giá/chính sách, missing approval không mở SQL, replay mapping đầy đủ và timeout không retry. SQL 011 chưa chạy hoặc nghiệm thu tích hợp. Code CLI/importer/payload đã chuẩn bị, không giả lập kết quả nhập.

Lỗi trong transaction rollback toàn bộ lô và receipt. Sau commit, trước mọi hoàn tác phải backup hiện trạng và đối chiếu tham chiếu/giao dịch mới. Không tự DROP RPC, DELETE danh mục, xóa receipt hay restore backup cũ. Khôi phục dữ liệu/đối tượng cần lệnh cụ thể được duyệt riêng. Backend không bật ghi nghiệp vụ hoặc cắt chuyển G12 sau seed này.
