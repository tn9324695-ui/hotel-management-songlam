  # Xác minh lớp ràng buộc nghiệp vụ — 08/11/2026

Database: **`SongLamPms_Design`**, SQL Server **2022 Express 16.0.1000.6**, instance **`.\SQLEXPRESS`**. Bản nâng cấp nghiệp vụ được kiểm thử bằng `run_v2_tests.py`; schema cuối là **3**, gồm migration 2 và migration 3 bổ sung lý do hủy bắt buộc.

## Kết quả thực chạy

| Kiểm tra | Kết quả |
| --- | --- |
| `python tests/sqlserver/run_v2_tests.py` | **72/72 PASS**, SQL Server thật, có hai kết nối đồng thời |
| `python tests/sqlserver/test_installation.py` | **2/2 PASS**: cài mới tới schema 3; chạy lại từ chối database có sẵn |
| `node tests/view-data.test.js` | **8/8 PASS** |
| `python run_suite.py` | **18/18 PASS**, Edge headless với hồ sơ tạm |
| `python run_ui_checks.py` | **100/100 PASS**, `failed=[]`, `errors=[]` |
| Nâng cấp database thật | Đã áp dụng 004–007, sau đó 008; không nhập fixture |
| Backup trước mỗi đợt nâng cấp | `COPY_ONLY,CHECKSUM` thành công; `RESTORE VERIFYONLY` báo backup hợp lệ |
| Kiểm tra cuối database thật | Schema 3; 122 CHECK và 28 trigger đều bật; CHECK không bị đánh dấu untrusted |
| `usp_AssertBusinessState`, `DBCC CHECKCONSTRAINTS`, `DBCC CHECKDB` | Hoàn tất, exit code 0, không báo vi phạm hoặc lỗi toàn vẹn |
| Kiểm tra mã/tài liệu | Cú pháp Python/PowerShell, link tài liệu và whitespace đạt; `git diff --check` chỉ cảnh báo LF/CRLF |

Các kiểm thử trình duyệt dùng bộ hiện có với kích thước 1366×768, 1920×1080, 390×844. Không chụp lại ảnh vì đợt này không thay giao diện. Không sửa `js/store.js` hoặc `js/data.js`.

72 ca SQL kiểm tra: biên dịch migration; quyền đọc/ghi; module riêng tư; chặn SQL ghi trực tiếp; giả mạo SESSION_CONTEXT; cột actor giả; rowversion; SQL injection qua tên tài nguyên; khả năng đọc không lộ credential; quỹ phòng đoàn; rollback toàn lô; sức chứa; snapshot giá đêm/giờ; quyền override giá; idempotency; đặt trùng/bảo trì; nhận phòng; dịch vụ và đảo phí; kiểm tra vệ sinh; chuyển phòng sai allocation; ca thu ngân; phân bổ tiền thiếu/thừa; không giả thành công gateway; cọc; cặp chuyển folio; hai kết nối tranh cùng tiền cọc; hoàn tiền và duyệt; khoản hoàn đang chờ; chống trả hai lần; công nợ master sau checkout; minibar; snapshot quyết toán; lịch sử bất biến; phiếu nội bộ; thuê giờ và rút ngắn; lý do hủy; chốt ca/ngày và replay.

Mỗi lần chạy tạo `SongLamV2Test_<UUID>` hoặc `SongLamInstallTest_<UUID>`, dùng dữ liệu tổng hợp và principal `WITHOUT LOGIN`, rồi xóa đúng database kiểm thử. Không cấp tài khoản thử lên database thiết kế. Phiên chạy cuối hoàn tất cleanup, không còn session kiểm thử đang chờ.

Kiểm tra cuối database thiết kế: `CommandExecution=0`, `PrincipalBinding=0`, `Booking=0`, `Payment=0`; không còn database tạm theo hai tiền tố kiểm thử. Lệnh DBCC cuối đã được đợi tới khi kết thúc, không ghi nhận kết quả khi lệnh còn chạy.

## Backup được giữ lại

Thư mục SQL Server:

```text
C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\Backup\
```

- `SongLamPms_Design_pre_v2_0DE7D4B1EF1840CAAF27CD6EAAD33737.bak`: schema 1 trước khi nâng cấp nghiệp vụ.
- `SongLamPms_Design_pre_upgrade_789F81CC0500487FBAD3597035433058.bak`: schema 2 trước khi bổ sung lý do hủy.
- Lần chạy đầu còn tạo `SongLamPms_Design_pre_v2_ECA47A5BD4674E3F815AC2E34327A730.bak`; backup hợp lệ, nhưng bước tải danh sách script sau đó thất bại, chưa sửa database. File này cũng được giữ, không tự xóa.

Đã chạy VERIFYONLY; **chưa thực hiện restore diễn tập**.

## Lỗi phát hiện và đã sửa

- So sánh tên cột JSON bị xung đột collation tiếng Việt với `OPENJSON`: chuyển so sánh tên sang collation nhị phân.
- Chuyển rowversion trực tiếp sang varchar không cho chuỗi hex mong muốn: ép sang binary(8) trước, sau đó chuyển style 1. Kiểm thử public read xác nhận chuỗi Version dùng được.
- Interpreter Python không nhận timestamp SQL có 7 chữ số thập phân: bộ kiểm thử cắt về độ chính xác microsecond trước khi parse.
- sqlcmd phiên bản cục bộ không chấp nhận một số tổ hợp `-h/-y/-W`; bộ chạy đọc JSON đầy đủ và bỏ đúng header.
- Bộ nâng cấp ban đầu ghép các đường dẫn có khoảng trắng thành một tên file: sửa thành một file SQL UTF-8 tạm, chạy trên một kết nối, xóa đúng file tạm sau khi dùng. Đã thử cài mới bằng chính script PowerShell sau khi sửa.
- Đối chiếu với `cancelBooking` phát hiện thiếu lý do hủy trong schema: thêm migration 008, CHECK bắt buộc và hai ca thử từ chối/chấp nhận hủy.

## Giới hạn kết luận

Đây là kiểm thử chức năng và một tình huống tranh chấp tiền cọc thực tế, **không phải chứng nhận bao phủ mọi lỗi hoặc kiểm thử tải sản xuất**. Đã bắt buộc đi qua cổng SQL và kiểm tra những quy tắc được mô tả trong [README](README.md). Việc tự tính toàn bộ phí theo chính sách cũ, HTTP backend, kết nối UI, xác thực gateway, hóa đơn điện tử và migration localStorage chưa được tuyên bố hoàn tất. DBA có quyền đổi cơ chế bảo vệ; tài khoản ứng dụng phải ở vai trò hạn chế.
