# Thực thi gói 011 và dữ liệu nền

## Kết quả ngày 12/11/2026

Người dùng đã chọn bản Excel hoàn thiện làm dữ liệu chính của đồ án, xác nhận ngày nghiệp vụ **11/10/2026**, duyệt nhập 420 phòng/cách ly 5 phòng, và sau đó **duyệt riêng gói 011 cùng lô dữ liệu**. Tham chiếu `USER-FOUNDATION-011-BACKUP-DEPLOY-IMPORT`. Giữ nhãn/phạm vi nguồn trong bản sao và receipt; không tuyên bố xác minh độc lập hoạt động thực tế của khách sạn.

Đích đã kiểm chứng `.\SQLEXPRESS / SongLamPms_Design`, physical GUID `C4DD399E-5661-4741-A424-5ABFEEFBC1AC`. Trước nhập, 5 bảng nền đều trống và chưa có RPC seed. Không tạo database mới, không dùng metadata identity làm pool backend, không tạo tài khoản hoặc đổi quyền.

| Dữ liệu | Kết quả SQL thật |
| --- | --- |
| Hạng phòng | 11; 10 active, DLX-TR inactive/không có phòng/giá |
| Phòng | 420; 405 CLEAN, 9 DIRTY, 6 CLEANING; hiện diện VACANT, khai thác ACTIVE |
| Cách ly khỏi lô nhập | 501, 902, 1303, 1704, 2105 — không tự đổi bảo trì thành ngừng hoặc sạch |
| Dịch vụ | 15; giá so khớp từng dòng, FREE-01 giá 0 tách khỏi MB-01 tính phí |
| Khách sạn/ngày | 1 HotelSettings, 1 BusinessDay OPEN 2026-10-11; VND, múi giờ SE Asia Standard Time, nhận 14:00/trả 12:00 |
| Dữ liệu giữ nguyên | 6 AppUser hiện có, quyền và PrincipalBinding; không nhập khách/booking/stay hoặc giao dịch tài chính |
| Giá/chính sách | RatePlan vẫn 0; chưa nhập hoặc kích hoạt chính sách từ Excel |

PDK/PDT được ánh xạ PRE-K/PRE-T theo 11 mã đã chốt. DLX-TR giữ từ nguồn trước, không tự tạo phòng hoặc giá cho hạng vắng trong nguồn mới. TaxCode=NULL vì file ghi mã thuế giả; không dùng để xuất hóa đơn thật. Ngày 11/10/2026 theo người dùng được ưu tiên hơn 01/11/2026 trong Excel; không kéo giá kỳ 01/11/2026–31/12/2027 ngược về tháng 10.

## Những gì đã chạy

1. `sqlcmd -I ... -i 011-foundation-backup.sql.pending`: COPY_ONLY/CHECKSUM và VERIFYONLY thành công.
2. `sqlcmd -I ... -i 011-foundation-base420.sql.pending`: tạo duy nhất `pms.usp_SeedFoundationBatch`; hai tham chiếu duyệt triển khai/ghi đã điền đúng phạm vi. Không GRANT, role/user/login mới.
3. `node tools/sql/foundation-batch.mjs import <payload> <approval>`: `FOUNDATION_BATCH_CONFIRMED`, created=true.
4. `node tools/sql/verify-foundation-http.mjs --approved=USER-FOUNDATION-011`: **35 kiểm tra SQL/HTTP thật đạt**, đủ 5 vai trò. Duyệt toàn bộ trang API: đối chiếu 420 phòng theo số/hạng/tầng/3 trạng thái, 11 hạng từng trường, 15 dịch vụ/đơn giá, cấu hình, ngày, chi tiết, quyền; không chỉ so tổng.
5. Chạy lại cùng lệnh import/payload: created=false; mapping source ID → SQL ID trả lại đầy đủ, số lượng không tăng.
6. `node tools/verify/staff-sql-browser.mjs --approved=USER-FOUNDATION-011 --foundation-batch`: **120 kiểm tra browser thật đạt**, 5 vai trò, 1366×768/1920×1080/390×844. Kiểm lưới phòng, 11 hạng, lọc đúng 9 phòng bẩn, modal chi tiết, giá 0, menu mobile và khóa các module chưa có SQL. Không JavaScript exception hoặc lỗi tài nguyên. Đã xem ảnh populated reception 1366 và danh mục mobile.
7. Probe chạy thật dưới service account: EXECUTE RPC seed bị SQL từ chối **229**. Không thêm quyền cho backend.
8. `npm.cmd test` tại backend: **153/153 fixture đạt**. Tách biệt với kiểm chứng SQL thật ở trên. Các test bảng rỗng trước seed chỉ còn là kết quả lịch sử; dùng verifier foundation cho đích đã có dữ liệu.

Backup UUID thực: **4FEDF086-47ED-4935-BBF4-29D492352F69**.

```text
C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\Backup\SongLamPms_Design_Foundation420_561C3A04-B6A7-46A1-AA25-694CC2D07878.bak
```

Đã VERIFYONLY, chưa thử RESTORE. Không ghi đè backup cũ.

## Transaction, chống trùng và bằng chứng

RPC chỉ cho maintenance caller hợp lệ, pin đích vật lý/marker và canonical payload hash. Dùng applock + khóa bảng/range phù hợp; cả 11/420/15/config/day và extended property receipt commit trong cùng transaction. Phát hiện trigger hoặc bảng nền có dữ liệu mà không có receipt thì dừng, không tắt trigger/nhận lại/ghi đè. Replay so projection typed bằng JSON hash, có phân biệt null và hoa/thường; drift phải báo lỗi.

Receipt property: `SongLam.FoundationBatch.FOUNDATION_2E1E523B_BASE420`. Chứa batch/source/payload checksum, counts, timestamp, SQL ORIGINAL_LOGIN thực; không phải audit nghiệp vụ giả dưới AppUser. Hai marker môi trường D1 giữ nguyên.

Payload checksum SHA-256 UTF-16LE: `52CB39B0D301C1C64DF0DDF6F4A293040C22CE6F52B585B3E297A75DE37CBAEC`. Mapping, approval, reviewed/executed SQL copies, outputs, readback, receipts và đối chiếu tại `tools/sql/private/foundation-base420-20261112/`. Thư mục private ngoài Git, không public static. Nguồn Excel gốc bất biến; snapshot và source provenance được giữ.

Ảnh/report browser: `screenshots/foundation-sql/`. Không lưu password/hash mật khẩu/cookie/CSRF hoặc connection string vào evidence. Windows identity của maintenance có thể có SQL login alias; receipt giữ ORIGINAL_LOGIN thực trong evidence riêng tư, không công bố thông tin tài khoản cá nhân ở đây.

## Chạy thử và giới hạn

Có thể nhấp `Start-SongLamPMS.cmd` tại repo để mở giao diện qua backend. Script `tools/sql/open-songlam-test.ps1` kiểm tra connection/status và auth/status thật; nếu chưa có listener, dùng launcher service đã duyệt. Không kill process chiếm cổng, không chạy pool dưới operator, không migration/seed/fallback. Nhánh `-NoOpen` với backend đang chạy đã được kiểm chứng; chưa diễn tập cold start trong lần bổ sung launcher này.

Mở **http://127.0.0.1:8093/login.html**, sau đăng nhập dùng **/reception-api.html** hoặc **/catalog-api.html**. Credential nhân viên thử giữ ở `tools/sql/private/test-staff-B20261112_UI01/credentials.local.json`, chỉ xem cục bộ.

Backend vẫn dùng Windows service identity riêng và session store SQL, mode frozen. Không dùng lệnh import bằng web account. RPC 011 đã tồn tại nên không chạy lại DDL để ghi đè. Import CLI không tự retry khi timeout; đối chiếu receipt và cùng batch/hash trước mọi thao tác tiếp theo. File receipt ghi thất bại sau ACK được báo riêng là SQL đã xác nhận.

**Chưa mở đặt phòng, availability/timeline theo khoảng ngày, check-in/out, housekeeping/bảo trì operational, folio, thu/hoàn, giá phòng hoặc báo cáo doanh thu.** Chúng còn thiếu hợp đồng/quyền/kiểm chứng riêng; không giả lập thành công hoặc fallback localStorage. 5 phòng cách ly chưa có bản ghi Room và phải xử lý bằng hợp đồng bảo trì phù hợp khi có khoảng thời gian được duyệt.

Không cắt chuyển G12 hoặc nghiệm thu vận hành toàn hệ thống. Muốn hoàn tác sau commit cần backup hiện trạng và kiểm tham chiếu/giao dịch mới rồi duyệt lệnh cụ thể; không tự DELETE, drop receipt/RPC hoặc restore backup cũ.
