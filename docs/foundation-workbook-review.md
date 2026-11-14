# Rà soát Excel danh mục khách sạn — 12/11/2026

Đây là báo cáo workbook đầu tiên. Người dùng sau đó cung cấp bản hoàn thiện, chốt ngày 11/10/2026 và duyệt gói 011 nhập 420 phòng/cách ly 5; [kết quả mới nhất](foundation-base420-execution.md). Các chỗ thiếu room register/ngày bên dưới mô tả bản đầu và quyết định tại thời điểm đó, không phải dữ liệu SQL hiện tại.

## Quyết định mới từ người dùng

Người dùng đã chốt dùng **11 mã gợi ý**: SUP-K, DLX-T, DLX-TR, PRE-K, PRE-T, JRS, CLS, EXS, GRS, RYS, PRS. Quyết định được ràng buộc đúng checksum nguồn trong `deploy/foundation-decisions.json`; candidate mới ở `tools/sql/private/foundation-xlsx-20261112/review-codes-confirmed/`. Không sửa workbook hoặc ghi đè các bản review trước.

Ngày người dùng cung cấp là **11/10**, chưa có năm; lưu nguyên văn, chưa chuyển thành ngày SQL và đã hỏi lại năm. Người dùng yêu cầu lấy room register từ Excel: đã đọc lại nguồn và xác nhận sheet 3 chỉ có 3 dòng tổng hợp + 3 phòng hội nghị, không có từng phòng ngủ; đã hỏi rõ và giữ rooms=[] đến khi có dữ liệu. Chốt mã không đồng nghĩa duyệt IsActive, toàn bộ nguồn, chính sách giá hoặc quyền chạy SQL.

Phần mã PMS “chưa chốt” bên dưới mô tả nguyên trạng Excel trước quyết định mới; candidate mới đã áp dụng đúng 11 mã, các điểm thiếu khác vẫn giữ nguyên.

## Nguồn và phạm vi

Nguồn người dùng cung cấp: `C:\Users\Thang DZ\Downloads\Danh_Muc_That_Muong_Thanh_Luxury_Song_Lam.xlsx` (17.049 byte). SHA-256 `76ad26790afe131e9fcb15ecb12c075d85bd6cdc79a6075261212e1db6d75964`.

Đã đọc toàn bộ 5 sheet, 85 dòng có nội dung. Không có formula, macro part hoặc external-workbook link trong cấu trúc XLSX đã kiểm tra. Không mở Excel để thực thi nội dung, không truy cập liên kết trong các ô. Các nhãn “Đã xác thực” là lời ghi trong nguồn, **chưa được tôi xác minh độc lập với khách sạn/cơ quan thuế**. Ghi chú trong workbook là dữ liệu tham khảo, không cấp quyền chạy SQL.

File gốc giữ nguyên. Bản sao bytes bất biến, extraction có tọa độ ô, candidate và review nằm trong `tools/sql/private/foundation-xlsx-20261112/`; output mapping mới nhất ở `review-v2/`. Không nhập SQL, không sửa schema/thủ tục/quyền, không sửa frontend đang chạy trong lượt phân tích file này.

## Kết quả theo nhóm

| Nhóm | Nội dung nguồn | Khả năng ánh xạ và điểm chặn |
| --- | --- | --- |
| Khách sạn | Tên thương mại/pháp nhân, địa chỉ, nhiều điện thoại/email/MST; nhận 14:00, trả 12:00 | Đề xuất ánh xạ tên/địa chỉ/giờ; cần chọn liên hệ/MST chính, xác nhận VND/múi giờ và ngày nghiệp vụ |
| Hạng phòng | 11 dòng; 11 mã PMS ghi chưa chốt, có mã gợi ý riêng | Giữ code=null; không tự dùng cột gợi ý. Chưa có IsActive. Presidential chưa có sức chứa chuẩn/tối đa đơn trị; Triple chưa có diện tích (cột SQL cho null) |
| Phòng | 3 dòng tổng hợp khối 354/69/2 và 3 địa điểm hội nghị | **0 phòng lưu trú có số phòng cụ thể để nhập**. Không sinh 425 số phòng, không nhập Ballroom/phòng họp vào Room |
| Dịch vụ/tiện ích | 14 dòng; 5 có tiền, gồm 2 mục ghi rõ miễn phí; 9 chưa chốt giá | Cả 14 chưa có mã dịch vụ; cần phân loại phụ thu, tiện ích miễn phí, địa điểm và SKU minibar; không mặc định giá thiếu=0 |
| Giá đêm | 11 hạng; 6 giá công bố và 8 giá đại lý có số tiền | Hai nguồn giá độc lập, chưa chọn làm giá áp dụng; **0 dòng có ngày hiệu lực**; chưa kích hoạt chính sách giá/giờ |
| Chính sách | 10 dòng tham khảo phụ thu/tuổi/giường phụ | Cần chốt biên giờ, đơn vị bữa/đêm, ngày hiệu lực và cơ chế tránh phí trùng trước khi ánh xạ G4/G8/G9 |

## Mã hạng chỉ đang đề xuất

Nguồn `2_HangPhong!B4:I14`. Cột B chưa chốt; bảng dưới dùng cột C làm đề xuất để người dùng duyệt, không phải mã đã nhập:

| Dòng | Hạng phòng | Mã gợi ý | Sức chứa cần chú ý |
| --- | --- | --- | --- |
| 4 | Superior King | SUP-K | Chuẩn 2 người lớn, tối đa 4 có điều kiện thành phần |
| 5 | Deluxe Twin | DLX-T | Như trên |
| 6 | Deluxe Triple | DLX-TR | Chuẩn 3 người lớn, tối đa 4; diện tích chưa chốt |
| 7 | Premium Deluxe King | PRE-K | Chuẩn 2, tối đa 4 có điều kiện thành phần |
| 8 | Premium Deluxe Twin | PRE-T | Như trên |
| 9 | Junior Suite | JRS | Như trên |
| 10 | Club Suite | CLS | Như trên |
| 11 | Executive Suite | EXS | Như trên |
| 12 | Grand Suite | GRS | Như trên |
| 13 | Royal Suite | RYS | Như trên |
| 14 | Presidential Suite | PRS | Nguồn ghi chuẩn “2–3 người lớn”, tối đa chưa chốt; không tự lấy 2 hoặc 3 |

`MaxOccupancy=4` không tự thể hiện quy tắc 3 người lớn + 1 trẻ em hoặc 2 người lớn + 2 trẻ em. Candidate giữ mô tả gốc trong provenance; chưa coi chính sách thành phần/tuổi đã được hệ thống ràng buộc. IsActive của hạng/dịch vụ để null đến khi có xác nhận; hết phòng trên kênh online không đồng nghĩa hạng ngừng khai thác.

## Các ô cần quyết định cụ thể

| Ô nguồn | Vấn đề | Xử lý đề xuất, chưa áp dụng |
| --- | --- | --- |
| 1_KhachSan_VanHanh!B9 | Nhiều số điện thoại cùng hotline tập đoàn; vượt varchar(30) nếu giữ nguyên | Người vận hành chọn số chính; giữ nguồn gốc, không cắt chuỗi hoặc bỏ số âm thầm |
| 1_KhachSan_VanHanh!B10:B11 | Email khách sạn/tập đoàn và hai MST trong cùng ô | Chọn email/MST dùng cho khách sạn; không xác minh pháp lý chỉ từ nhãn trong Excel |
| 1_KhachSan_VanHanh!B15 | Ngày nghiệp vụ chưa chốt | Cần ngày YYYY-MM-DD; không lấy ngày khai trương, ngày cấp MST hoặc ngày máy |
| 2_HangPhong!B4:B14 | Mã chính chưa chốt | Cần duyệt mã gợi ý hoặc cung cấp mã khác |
| 2_HangPhong!E14:F14 | Presidential có khoảng chuẩn và thiếu tối đa | Cần số nguyên chuẩn/tối đa và điều kiện người lớn/trẻ em nếu có |
| 3_Phong!A4:F9 | Thiếu room register, trạng thái vận hành | Cần số phòng–hạng–tầng–vệ sinh–khai thác thật. Hội nghị giữ ngoài quỹ phòng lưu trú |
| 4_DichVu_Minibar!B4:G17 | Chưa có mã; các dòng trộn phụ thu, quyền lợi, venue và nhóm dịch vụ | Không tạo tất cả thành SKU thu tiền. Minibar tính phí chưa có từng món/đơn giá |
| 5_GiaPhong_PhuThu!C6:F16 | Hai bảng giá, không có hiệu lực, giờ chưa chốt | Chọn cơ sở giá/kỳ hiệu lực/phiên bản; không mặc định giá đại lý khi cột công bố trống |
| 5_GiaPhong_PhuThu!C24:C25 | “trước 18:00” và “sau 18:00” không phủ đúng 18:00 | Cần xác nhận mức áp dụng tại 18:00, không tự lấp khoảng |
| 5_GiaPhong_PhuThu!C27:E27 | Nội dung 150.000/trẻ/bữa sáng nhưng đơn vị Trẻ/Đêm | Cần chốt đơn vị, điều kiện ăn sáng và số lần thu |
| 4_DichVu_Minibar!F4:F6 và 5_GiaPhong_PhuThu!D27:D29 | Phụ thu xuất hiện ở hai nhóm nguồn | Chỉ một nguồn phát sinh phí; chốt cộng gộp/thay thế giường phụ/người thứ ba để tránh thu trùng |

## Kết quả công cụ và kiểm thử

`read-foundation-xlsx.py` chỉ đọc ZIP/XML bằng thư viện chuẩn, không cài dependency hoặc ghi workbook. Extraction giữ giá trị nguồn, số dòng/ô và metadata formula/style. `map-foundation-workbook.mjs` kiểm layout, giữ mã chưa chốt/range occupancy/giá thiếu là null, giữ giá 0 thực sự, tách room aggregate/meeting facility và bảng giá tham khảo; nguồn không bị chuẩn hóa ngược.

Candidate chỉ dùng định danh nguồn ổn định theo sheet/dòng và batch dựa checksum, **không phải SQL ID hoặc mã PMS đã duyệt**. `reviewedByOperator=false`, `pricing=null`, `rooms=[]`, `sqlWritesEnabled=false`. Kết quả `BLOCKED_REVIEW_REQUIRED_NOT_IMPORTED`; 43 phát hiện theo nguồn và 80 điều kiện chưa đạt của planner (nhiều lỗi lặp theo từng dòng chưa chốt, không phải 80 bản ghi hỏng). Không đưa các giá trị null vào SQL để vượt NOT NULL.

Lệnh đã chạy: Python extractor → Node mapper → `npm.cmd test` tại backend. **145/145 test fixture đạt**, gồm hồi quy mã gợi ý không thành mã chính, range không bị ép số, tổng phòng/hội nghị không thành Room, miễn phí 0 khác giá thiếu, công thức không dùng cached value và layout đổi phải dừng. Đây không phải kiểm thử nhập dữ liệu SQL. Bản sao bytes và file gốc có hash khớp sau khi đọc.

Sau khi người dùng chốt dữ liệu: tạo candidate mới giữ nguyên nguồn → review/cách ly phần thiếu → trình file SQL nhập cụ thể và phạm vi lô để duyệt → backup/VERIFYONLY mới → nhập qua hợp đồng được phép → đối chiếu từng bản ghi trên R1. Hợp đồng ghi dữ liệu nền vẫn chưa được duyệt; không chạy 002/002b hoặc tạo procedure seed mới chỉ vì đã nhận Excel.
