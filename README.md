# ĐỒ ÁN: PHÂN TÍCH VÀ THIẾT KẾ HỆ THỐNG QUẢN LÝ KHÁCH SẠN
## PHẦN MỀM: QUẢN LÝ KHÁCH SẠN SÔNG LAM (SONG LAM HOTEL PMS v2.3.0)
*Tham khảo mô hình nghiệp vụ & cơ cấu phòng Mường Thanh Luxury Sông Lam (TP. Vinh, Nghệ An)*

---

## MỤC LỤC TỔNG QUAN
1. [Tuyên bố bản quyền & Phạm vi mô phỏng đồ án (Academic Disclaimer)](#1-tuyen-bo-pham-vi-mo-phong-do-an)
2. [Kiến trúc hệ thống & Hướng dẫn khởi chạy](#2-kien-truc-he-thong--huong-dan-khoi-chay)
3. [Bảng danh mục 10 lỗi nghiệp vụ, nguyên nhân gốc & cách khắc phục](#3-danh-muc-10-loi-nghiep-vu-nguyen-nhan--cach-khac-phuc)
4. [Báo cáo kết quả kiểm thử 18 tiêu chí nghiệm thu bắt buộc (18/18 PASS - 100%)](#4-ket-qua-kiem-thu-18-tieu-chi-nghiem-thu-bat-buoc)
5. [Hướng dẫn chuyển đổi dữ liệu cũ (Migration Guide) & Cơ chế sao lưu](#5-huong-dan-chuyen-doi-du-lieu-cu-migration-guide--sao-luu)
6. [Mô hình dữ liệu thực thể (Data Model) & Máy trạng thái (State Machines)](#6-mo-hinh-du-lieu-thuc-the--may-trang-thai)
7. [Ma trận phân quyền vai trò (RBAC Matrix)](#7-ma-tran-phan-quyen-vai-tro-rbac-matrix)
8. [Phân định ranh giới: Đã làm - Đang mô phỏng - Ngoài phạm vi](#8-phan-dinh-ranh-gioi-da-lam---dang-mo-phong---ngoai-pham-vi)
9. [Kịch bản chi tiết trình diễn bảo vệ đồ án (Demo Defense Script)](#9-kich-ban-chi-tiet-trinh-dien-bao-ve-do-an)

---

## 1. TUYÊN BỐ PHẠM VI MÔ PHỎNG ĐỒ ÁN (ACADEMIC DISCLAIMER)
> [!IMPORTANT]
> **TUYÊN BỐ PHẠM VI HỌC THUẬT:**
> - Dự án này được thiết kế và triển khai hoàn toàn phục vụ mục đích **nghiên cứu, báo cáo và bảo vệ đồ án học phần công nghệ thông tin**.
> - Hệ thống tham khảo tên gọi, cơ cấu 10 hạng phòng (42 phòng vật lý) và vị trí thực tế của khách sạn Mường Thanh Luxury Sông Lam (TP. Vinh, Nghệ An) để tạo bộ dữ liệu minh họa chân thực.
> - **KHÔNG TUYÊN BỐ** đây là quy trình nội bộ, phần mềm chính thức hoặc tài sản của Tập đoàn Mường Thanh.
> - Dữ liệu vận hành chạy trên nền tảng trình duyệt Web (`HTML5 / CSS3 / JavaScript`), lưu trữ qua `localStorage` và đồng bộ đa tab qua `BroadcastChannel`. Chưa có máy chủ tập trung (backend), cơ sở dữ liệu quan hệ (RDBMS) đa người dùng, hóa đơn điện tử cơ quan thuế (VN-eInvoice) hoặc tích hợp cổng thanh toán IPN ngân hàng thật. Mọi cổng thanh toán (VietQR, VNPay QR, OnePay) được triển khai dưới dạng **mô phỏng nghiệp vụ có kiểm soát (Sandbox Mock Engine)**.

---

## 2. KIẾN TRÚC HỆ THỐNG & HƯỚNG DẪN KHỞI CHẠY

### 2.1. Kiến trúc 3 Không gian làm việc Độc lập
Hệ thống tuân thủ nguyên tắc phân tách trách nhiệm vật lý (Physical Separation of Concerns) thành 3 không gian làm việc riêng biệt, chia sẻ chung một lớp nghiệp vụ và dữ liệu duy nhất (`SongLamStore` tại `js/store.js`):

```
       +-------------------------------------------------------------+
       |           SONGLAM HOTEL PMS - CORE BUSINESS ENGINE          |
       |                    (js/store.js - v2.3.0)                   |
       |  - Ràng buộc tồn kho từng đêm      - Phân bổ tiền cọc       |
       |  - Idempotency chống ghi trùng     - Kiểm soát tiền đảm bảo  |
       |  - Đồng bộ BroadcastChannel        - Điều chỉnh đến sớm     |
       |  - Báo cáo tài chính chuẩn nửa mở  - Night Audit nguyên tử   |
       +-------------------------------------------------------------+
               |                           |                       |
               v                           v                       v
     [index.html]                 [reception.html]        [housekeeping.html]
     GIAO DIỆN TỔNG                QUẦY LỄ TÂN             BUỒNG PHÒNG
     (Quản lý & Thu ngân)          (Lễ tân trực ca)        (Dọn phòng & Giám sát)
```

- **Giao diện Tổng (`index.html`):** Dành cho Quản lý khách sạn, Thu ngân và Quản trị viên. Quản lý danh mục 10 hạng phòng, bảng giá theo đêm, phê duyệt ngoại lệ, chốt ca, chốt ngày (Night Audit) và dashboard doanh thu thuần / thu-chi chuẩn KiotViet.
- **Quầy Lễ Tân (`reception.html`):** Dành riêng cho nhân viên lễ tân trực sảnh. Sơ đồ phòng trực quan 42 phòng, Lịch phòng ma trận (Tape Chart), đặt phòng lẻ/đoàn, check-in, check-out, gọi dịch vụ F&B và thu tiền.
- **Buồng Phòng (`housekeeping.html`):** Dành riêng cho nhân viên buồng phòng và giám sát viên. Luồng vệ sinh 4 bước (Chờ dọn → Đang dọn → Chờ KT → Đã sạch), kiểm kê minibar phòng trả, báo sự cố và đồ thất lạc.

### 2.2. Hướng dẫn Khởi chạy Tiêu chuẩn
Do trình duyệt chặn giao tiếp `BroadcastChannel` và `localStorage` trên giao thức tệp cục bộ (`file:///`), hệ thống **bắt buộc** phải được chạy qua một Web Server cục bộ cùng cổng (Same-Origin):

```bash
# Bước 1: Mở Terminal tại thư mục gốc dự án
cd "hotel-management-songlam"

# Bước 2: Khởi động HTTP Server cục bộ (Python 3 tích hợp sẵn)
python -m http.server 8080

# Bước 3: Mở trình duyệt Web truy cập:
# - Giao diện Quản lý / Thu ngân: http://localhost:8080/index.html
# - Giao diện Lễ tân:             http://localhost:8080/reception.html
# - Giao diện Buồng phòng:        http://localhost:8080/housekeeping.html
# - Bộ kiểm thử tự động 18 ca:    http://localhost:8080/test_runner.html
```

---

## 3. DANH MỤC 10 LỖI NGHIỆP VỤ, NGUYÊN NHÂN & CÁCH KHẮC PHỤC

| STT | Tên Lỗi Nghiệp Vụ | Nguyên Nhân Gốc (Root Cause) | Cách Khắc Phục Kiến Trúc (Architectural Fix) | Vị Trí Mã Nguồn Sửa |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **Cọc khách đoàn không được phân bổ** | `allocateBookingDeposit(booking, roomIndex)` kỳ vọng đối tượng đơn đặt, nhưng `createGroupBooking` truyền `(depositAmount, totalRooms)` trả về 0. Đơn con và lượt lưu trú nhận cọc bằng 0. | Nạp chồng (overload) hàm `allocateBookingDeposit`: hỗ trợ cả chữ ký `(depositAmount, totalRooms)` trả mảng phân bổ nguyên dư và `(booking, roomIndex)` trả số tiền từng phòng. Lưu vết `allocatedDeposits` trên đơn con và gắn `allocatedDepositTxId` vào master deposit transaction. | `js/store.js` (`allocateBookingDeposit`, `createGroupBooking`, `checkInBookingRoom`) |
| **2** | **Đặt đoàn vượt quỹ phòng chung** | `createGroupBooking` kiểm tra từng dòng phân bổ độc lập với quỹ phòng ban đầu. Hai dòng cùng hạng cùng ngày đều nhìn thấy số phòng trống như nhau, dẫn đến xác nhận vượt quỹ. | Tính nhu cầu cộng dồn giữa tất cả các dòng trong đơn theo từng hạng và từng đêm (`demandByClassNight`). Kiểm tra tổng nhu cầu từng đêm so với số phòng trống thực tế. Chặn toàn bộ đơn trước khi ghi, không lưu một phần. | `js/store.js` (`createGroupBooking`) |
| **3** | **Phân cùng phòng cho 2 đơn trùng lịch** | `bulkAssignRooms` chỉ kiểm tra trùng phòng trong cùng một lần gọi, không kiểm tra xung đột với các đơn đặt khác đã được phân phòng đó hoặc khách đang lưu trú trong khoảng ngày giao nhau. | Kiểm tra khoảng ngày giao nhau `[targetCheckIn, targetCheckOut)` với mọi đơn khác đã được gán phòng này (`b.assignedRooms.includes(r.number)`) và lượt ở `in_house`. Báo lỗi rõ phòng và đơn xung đột. Cho phép hai khoảng ngày nối tiếp (check-out ngày A = check-in ngày B). | `js/store.js` (`bulkAssignRooms`) |
| **4** | **`recordPayment()` thiếu ràng buộc** | Hàm chấp nhận số tiền âm, không kiểm tra quyền `collectPayment`, cho phép truyền `stayId` không tồn tại, và cho phép client tự set `status = 'success'` và `gatewayVerified = true` cho cổng online. | Kiểm tra quyền `collectPayment` qua RBAC; chặn tiền âm / NaN / vượt 1 tỷ; kiểm tra tồn tại và tính nhất quán của `stayId` và `bookingId`; áp dụng whitelist phương thức và loại giao dịch (chặn `type: 'refund'`); ép cổng trực tuyến bắt đầu ở trạng thái `pending`. | `js/store.js` (`recordPayment`) |
| **5** | **Ghi trùng giao dịch (Thiếu Idempotency)** | Gọi `recordPayment` 2 lần cùng mã giao dịch tạo 2 bản ghi riêng biệt, làm số tiền thu bị nhân đôi. ID sinh bằng `Date.now().slice(-6)` dễ trùng lặp. | Thêm cơ chế Idempotency qua `idempotencyKey` / `referenceCode`. Nếu trùng khóa và cùng nội dung: trả lại kết quả cũ (replay idempotent); nếu trùng khóa nhưng khác số tiền/đối tượng: ném lỗi `409 Conflict`. Sinh ID chống va chạm. | `js/store.js` (`recordPayment`) |
| **6** | **Phân bổ cọc làm tăng giả tiền thu** | `checkInBookingRoom` tạo giao dịch mới `GD-ALLOC-...` với `type: 'deposit'`. Báo cáo tài chính cộng cả giao dịch cọc gốc lẫn các khoản phân bổ, làm nhân đôi doanh thu/dòng tiền. | Tuyệt đối không sinh giao dịch thu tiền mới cho phân bổ nội bộ. Lưu cọc phân bổ trực tiếp trên `stay.allocatedDeposit` để đối trừ Folio. Lọc bỏ các bản ghi phân bổ nội bộ khỏi báo cáo dòng tiền/doanh thu. Thêm migration chuẩn hóa bản ghi cũ. | `js/store.js` (`checkInBookingRoom`, `calculateStayFolio`, `getAnalyticsReportData`) |
| **7** | **Số dư tiền đảm bảo sai sau trả phòng** | Sau khi khấu trừ 1,4tr và hoàn 600k, `stay.guaranteeDeposit` vẫn giữ nguyên 2 triệu. Tính lại Folio tiếp tục đề xuất khấu trừ 600k và hoàn 1,4tr. | Phân tách rõ ràng: `guaranteeDepositCollected`, `guaranteeDepositDeducted`, `guaranteeDepositRefunded`, `guaranteeDepositPendingRefund`, và `guaranteeDepositAvailable`. Sau quyết toán, số dư khả dụng bằng 0. Tách trạng thái trả phòng (`vacant`/`dirty`) và quyết toán tài chính (`pending_refund`). | `js/store.js` (`calculateStayFolio`, `settleAndCheckout`) |
| **8** | **Chốt ngày báo thành công nhưng mất dữ liệu** | `runNightAudit` sửa dữ liệu trong bộ nhớ rồi gọi `setWorkingDate()`. Hàm này gọi `reloadLatest()`, nạp lại storage cũ đè lên dữ liệu vừa sửa trước khi kịp lưu sổ chốt và no-show. | Cập nhật sổ chốt `dailyLedgers`, trạng thái `no_show`, cờ `isOverstay` và `workingDate` trực tiếp trên `_currentData` trong bộ nhớ, sau đó gọi `_commitData` đúng 1 lần duy nhất. Kiểm soát chống chốt lặp cùng một ngày kinh doanh. | `js/store.js` (`runNightAudit`) |
| **9** | **Nhận đơn tương lai không đổi lịch và giá** | `checkInBookingRoom` cho phép nhận phòng vào ngày làm việc hiện tại dù đơn đặt ở tương lai, nhưng giữ nguyên số đêm và giá của khoảng ngày cũ. | Chặn nhận phòng nếu `booking.checkInDate !== wDate`. Cung cấp hàm `adjustBookingForEarlyArrival`: tính lại số đêm thực tế, kiểm tra quỹ phòng khoảng ngày đến sớm, định giá động từng đêm, ghi nhật ký kiểm toán rồi mới cho nhận phòng. | `js/store.js` (`checkInBookingRoom`, `adjustBookingForEarlyArrival`) |
| **10** | **Báo cáo tháng lấy giao dịch tháng sau** | `getAnalyticsReportData` tính ngày cuối tháng bằng cách lấy đầu tháng cộng 30 ngày và dùng điều kiện `<= endDate`. Tháng 4 có 30 ngày nên cộng 30 ra 01/05, gom cả giao dịch ngày 01/05 vào tháng 4. | Sử dụng khoảng nửa mở toán học chuẩn `[đầu tháng hiện tại, đầu tháng tiếp theo)`: lọc với điều kiện `tDate >= startDate && tDate < startOfNextMonth`. Xử lý chính xác tháng 28, 29 (năm nhuận 2028), 30, 31 ngày và chuyển năm tháng 12 sang tháng 1. | `js/store.js` (`getAnalyticsReportData`) |

---

## 4. KẾT QUẢ KIỂM THỬ 18 TIÊU CHÍ NGHIỆM THU BẮT BUỘC

> Toàn bộ 18 tiêu chí được kiểm thử tự động độc lập qua trình duyệt Microsoft Edge (Headless), xác thực trực tiếp qua nạp lại `localStorage`. Kết quả đạt **18/18 PASS (100%)**.

| Mã Ca | Tên Tiêu Chí Nghiệm Thu | Dữ Liệu Đầu Vào | Thao Tác Nghiệp Vụ | Kết Quả Mong Đợi Độc Lập | Kết Quả Thực Tế Đo Được | Trạng Thái |
| :---: | :--- | :--- | :--- | :--- | :--- | :---: |
| **TC-01** | Đoàn 2 phòng cọc 1.000.000đ | Đoàn 2 phòng PRM-K, cọc 1.000.000đ | Gọi `allocateBookingDeposit` cho phòng 0 và phòng 1 | P0: 500.000đ, P1: 500.000đ, Tổng: 1.000.000đ | P0: 500.000đ, P1: 500.000đ, Tổng: 1.000.000đ | **PASS** |
| **TC-02** | Chia cọc 1.000.000đ cho 3 phòng | Số tiền: 1.000.000đ, Số phòng: 3 | Gọi `allocateBookingDeposit(1000000, 3)` | Mảng `[333.334đ, 333.333đ, 333.333đ]`, Tổng: 1.000.000đ | Mảng `[333.334đ, 333.333đ, 333.333đ]`, Tổng: 1.000.000đ | **PASS** |
| **TC-03** | Đặt đoàn cùng hạng không vượt quỹ | Hạng PRM-K có 5 phòng; Dòng 1: 5P, Dòng 2: 1P | Gọi `createGroupBooking` | Ném ngoại lệ chặn đặt vì tổng nhu cầu (6P) vượt quá quỹ phòng chung (5P) | Bắt lỗi thành công: "Không đủ quỹ phòng: Hạng PRM-K..." | **PASS** |
| **TC-04** | Đặt đoàn giao nhau một phần | Hạng PRM-K; Dòng 1: 15-18/11 (5P), Dòng 2: 17-20/11 (1P) | Gọi `createGroupBooking` | Chặn và báo rõ thiếu phòng vào đêm giao nhau 2026-11-17 | Bắt lỗi thành công: "Không đủ quỹ phòng... vào đêm 2026-11-17" | **PASS** |
| **TC-05** | Hai đơn trùng ngày không phân cùng phòng | Đơn A (01-04/11, P.505), Đơn B (02-05/11), Đơn C nối tiếp (04-06/11) | `bulkAssignRooms` gán P.505 cho Đơn B và Đơn C | Đơn B bị chặn do trùng lịch 02-04/11; Đơn C nối tiếp ngày 04/11 được chấp thuận | Đơn B bị chặn xung đột lịch phòng; Đơn C gán P.505 thành công | **PASS** |
| **TC-06** | `recordPayment` chặn tham số sai & ép pending cổng online | amount = -100k, role = housekeeping, stayId ảo, type = refund, vnpay_qr | Gọi `recordPayment` với từng bộ dữ liệu | Toàn bộ tham số bất hợp lệ bị chặn; VNPay QR tạo giao dịch status = pending | Tiền âm bị chặn; Quyền bị chặn; StayId ảo bị chặn; Type refund bị chặn; Online tạo pending | **PASS** |
| **TC-07** | Chống ghi nhận lặp giao dịch (Idempotency Replay) | Khóa: `IDEM-KEY-777`, Số tiền: 300.000đ, Lượt ở hợp lệ | Gọi `recordPayment()` 2 lần cùng khóa và cùng số tiền | Lần 1 tạo mới (count+1); Lần 2 trả lại kết quả lần 1 mà không thêm giao dịch | Lần 1 ID = Lần 2 ID; Số lượng giao dịch trong sổ giữ nguyên không đổi | **PASS** |
| **TC-08** | Cùng khóa khác nội dung bị từ chối | Khóa: `IDEM-KEY-777`, Số tiền mới: 500.000đ (khác số tiền cũ 300k) | Gọi `recordPayment()` cùng khóa nhưng đổi amount | Ném lỗi 409 Conflict cảnh báo mâu thuẫn nội dung khóa idempotency | Bắt lỗi thành công: "409 Conflict: Khóa giao dịch... đã tồn tại nhưng có nội dung khác" | **PASS** |
| **TC-09** | Thu cọc 1 triệu nhận 2 phòng không nhân đôi tiền | Đơn 2 phòng cọc 1 triệu; nhận P.505 và P.602 (phân bổ 500k/phòng) | `checkInBookingRoom` và kiểm tra `getAnalyticsReportData` | totalIncome trước = totalIncome sau = 1.000.000đ; Folio mỗi phòng ghi nhận cọc 500k | Thực thu trước: 1.000.000đ; Thực thu sau nhận 2 phòng: 1.000.000đ; P505 cọc 500k; P602 cọc 500k | **PASS** |
| **TC-10** | Cọc đảm bảo 2 triệu, phí 1,4 triệu, hoàn 600k | Cọc đảm bảo: 2.000.000đ, Chi phí phòng: 1.400.000đ | `settleAndCheckout()` và tính lại `calculateStayFolio()` | Đã khấu trừ 1.4tr, đã hoàn 600k, available = 0, tính lại không đề xuất xử lý lần nữa | Khấu trừ: 1.400.000đ; Đã hoàn: 600.000đ; Khả dụng: 0đ; Đề xuất tính lại: Khấu trừ 0đ, Hoàn 0đ | **PASS** |
| **TC-11** | Trả phòng có khoản hoàn đang chờ chuyển khoản | P.702 cọc đảm bảo 1tr, phí 600k, hoàn 400k chờ chuyển khoản | `settleAndCheckout({ pendingRefund: true })` | Phòng: vacant/dirty + tạo việc buồng; Lượt ở: checked_out nhưng settlementStatus = pending_refund | Phòng: vacant/dirty; Việc buồng tạo thành công; Quyết toán: pending_refund (chờ hoàn 400.000đ) | **PASS** |
| **TC-12** | Chốt ngày lưu được sổ ledger & no-show vào localStorage | Ngày 25/10, đơn đặt phòng confirmed đến ngày 25/10 | `runNightAudit()` rồi đọc trực tiếp raw localStorage | dailyLedgers có bản ghi ngày 25/10, đơn chuyển no_show, workingDate = 2026-10-26 | Ledger lưu thành công; Đơn chuyển no_show; Ngày làm việc mới lưu đúng 2026-10-26 | **PASS** |
| **TC-13** | Chống chốt lặp ngày kinh doanh | Gửi lại yêu cầu chốt ngày 25/10 khi hệ thống đã ở ngày 26/10 | Gọi `runNightAudit()` với ngày cũ | Bị từ chối, ngày làm việc được giữ nguyên 2026-10-26, không chốt tiếp sang 27/10 | Bắt lỗi thành công: Ngày đã được chốt sổ trước đó; Ngày làm việc giữ nguyên 2026-10-26 | **PASS** |
| **TC-14** | Chốt ngày thất bại không làm đổi ngày một phần | Ngày 25/10, user buồng phòng không có quyền quản lý | `runNightAudit()` gặp lỗi phân quyền | Ném ngoại lệ, ngày làm việc trong storage giữ nguyên tuyệt đối 2026-10-25 | Bắt lỗi phân quyền thành công; Ngày làm việc trước và sau giữ nguyên 2026-10-25 | **PASS** |
| **TC-15** | Đơn tương lai không nhận ngay; điều chỉnh hợp lệ mới nhận | Đơn đặt 20-22/11 (2 đêm). Ngày hệ thống 25/10. Khách đến sớm 25/10. | Check-in trực tiếp bị chặn -> Gọi `adjustBookingForEarlyArrival()` -> Check-in | Chặn check-in sai ngày; Điều chỉnh thành 28 đêm và cập nhật giá động; Nhận phòng thành công | Bắt lỗi chặn sai ngày; Đã điều chỉnh thành 28 đêm; Nhận phòng P.505 thành công | **PASS** |
| **TC-16** | Báo cáo tháng 4 loại trừ ngày 01/05 | Giao dịch ngày 30/04 (500k) và giao dịch 01/05 (77.777đ) | `getAnalyticsReportData("2026-04-15", "this_month")` | startDate: 2026-04-01, endDate: 2026-05-01, không chứa giao dịch ngày 01/05 | Khoảng lọc: [2026-04-01 -> 2026-05-01); Giao dịch ngày 01/05 bị loại trừ hoàn toàn | **PASS** |
| **TC-17** | Tháng 2 nhuận 2028 & Tháng 12 chuyển năm tính đúng | Mốc ngày: 2028-02-15 và 2026-12-20 | `getAnalyticsReportData()` cho tháng 2/2028 và tháng 12/2026 | Tháng 2/2028: [2028-02-01, 2028-03-01); Tháng 12/2026: [2026-12-01, 2027-01-01) | Tháng 2 nhuận: [2028-02-01 -> 2028-03-01); Tháng 12: [2026-12-01 -> 2027-01-01) | **PASS** |
| **TC-18** | Hồi quy tổng hợp: Minibar, sức chứa, phòng bảo trì | Ràng buộc vận hành cốt lõi đã hoàn thiện | Checkout chưa kiểm minibar, check-in quá người, check-in phòng đang khóa bảo trì | Cả 3 trường hợp vi phạm quy định đều bị chặn đúng với thông báo nghiệp vụ | Minibar chặn đúng; Sức chứa chặn đúng; Phòng bảo trì P.407 chặn đúng | **PASS** |

---

## 5. HƯỚNG DẪN CHUYỂN ĐỔI DỮ LIỆU CŨ (MIGRATION GUIDE) & SAO LƯU

### 5.1. Cơ chế Chuyển đổi Dữ liệu `GD-ALLOC` Cũ
Trong các phiên bản trước, việc phân bổ cọc vô tình sinh ra các bản ghi giao dịch ảo mang mã `GD-ALLOC-...` hoặc mã tham chiếu `ALLOC-...`, gây tăng ảo dòng tiền trong các báo cáo tài chính.
Hệ thống v2.3.0 tự động kích hoạt hàm chuyển đổi `_ensureSchemaCollections(data)` ngay khi nạp dữ liệu từ `localStorage`:
- **Đánh dấu phân bổ nội bộ:** Mọi giao dịch có ID bắt đầu bằng `GD-ALLOC-` hoặc `referenceCode` bắt đầu bằng `ALLOC-` được tự động gán thuộc tính `isInternalAllocation = true` và `type = 'internal_allocation'`.
- **Bảo toàn nhật ký:** Hệ thống không tự ý xóa các bản ghi này để giữ nguyên tính toàn vẹn chứng từ lịch sử.
- **Cách ly khỏi báo cáo:** Mọi hàm tính toán dòng tiền (`getAnalyticsReportData`, `runNightAudit`, Dashboard Thu-Chi) đều chủ động bỏ qua các bản ghi có cờ `isInternalAllocation`.

### 5.2. Sao lưu và Khôi phục Dữ liệu
- **Khóa lưu trữ trình duyệt:** `songlam_hotel_pms_data_v2`.
- **Khôi phục dữ liệu gốc chuẩn:** Khi cần làm mới toàn bộ dữ liệu mẫu phục vụ trình diễn đồ án, mở Console trình duyệt và thực thi:
  ```javascript
  SongLamStore.resetToInitialData(true);
  location.reload();
  ```
- **Xuất bản sao lưu:** Mở tab Quản trị & Phân quyền trên `index.html`, nhấn nút **"Sao lưu dữ liệu JSON"** để tải tệp JSON về máy tính.

---

## 6. MÔ HÌNH DỮ LIỆU THỰC THỂ & MÁY TRẠNG THÁI

### 6.1. Máy Trạng Thái Phòng Vật Lý (3 Chiều Độc Lập)
Mỗi phòng trong số 42 phòng được quản lý bởi 3 trục trạng thái phân tách rõ ràng:
1. **Trạng thái Lưu trú (`stayStatus`):** `vacant` (Trống) &harr; `occupied` (Đang có khách ở).
2. **Trạng thái Vệ sinh (`cleanStatus`):** `dirty` (Bẩn) &rarr; `cleaning` (Đang dọn) &rarr; `inspecting` (Chờ kiểm tra) &rarr; `clean` (Đã sạch đón khách).
3. **Trạng thái Khai thác (`exploitationStatus`):** `active` (Đang kinh doanh) &harr; `maintenance` (Tạm khóa bảo trì).

### 6.2. Luồng Vệ sinh 4 Bước & Tách quyền Giám sát Buồng phòng
- Nhân viên dọn phòng (`housekeeping`): Chuyển phòng sang `cleaning` và `inspecting`.
- Giám sát buồng phòng (`housekeeping_supervisor` / `manager`): Nghiệm thu đạt chuẩn và duyệt phòng sang `clean`. Khi phòng chuyển `clean`, giao diện buồng phòng tự động xóa khỏi danh sách việc cần dọn và chuyển phòng sang trạng thái sẵn sàng đón khách trên sơ đồ lễ tân.

---

## 7. MA TRẬN PHÂN QUYỀN VAI TRÒ (RBAC MATRIX)

| Mã Quyền Chức Năng | Quản lý (`manager`) | Thu ngân (`cashier`) | Lễ tân (`receptionist`) | Giám sát buồng (`supervisor`) | Nhân viên dọn (`housekeeping`) | Kỹ thuật (`technician`) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `viewDashboard` | &check; | &check; | &check; | &check; | &check; | &check; |
| `manageBookings` | &check; | &cross; | &check; | &cross; | &cross; | &cross; |
| `checkInCheckOut` | &check; | &cross; | &check; | &cross; | &cross; | &cross; |
| `collectPayment` | &check; | &check; | &cross; | &cross; | &cross; | &cross; |
| `approveRefund` | &check; | &cross; | &cross; | &cross; | &cross; | &cross; |
| `approveCleanStatus`| &check; | &cross; | &cross; | &check; | &cross; | &cross; |
| `cleanRoom` | &cross; | &cross; | &cross; | &check; | &check; | &cross; |
| `lockMaintenance` | &check; | &cross; | &cross; | &cross; | &cross; | &check; |
| `nightAudit` | &check; | &cross; | &cross; | &cross; | &cross; | &cross; |

---

## 8. PHÂN ĐỊNH RANH GIỚI: ĐÃ LÀM - ĐANG MÔ PHỎNG - NGOÀI PHẠM VI

### 8.1. Đã Triển khai Đầy đủ (Production-Grade in Browser)
- Lớp xử lý nghiệp vụ chung `SongLamStore` hỗ trợ nạp chồng phân bổ cọc, kiểm toán quỹ phòng từng đêm, idempotency và snapshot Folio.
- Đặt phòng khách lẻ, khách đoàn, phân phòng hàng loạt, nhận/trả phòng hàng loạt.
- Tính toán tiền phòng theo đêm, giá cuối tuần/ngày lễ, phụ thu người thêm, giảm giá.
- Quy trình minibar bắt buộc trước quyết toán; xử lý thừa thiếu tiền đảm bảo.
- Điều chỉnh đơn đặt phòng đến sớm ngày (`adjustBookingForEarlyArrival`).
- Chốt ca thu ngân, kiểm đếm tiền két và Chốt ngày kinh doanh (Night Audit).
- Dashboard doanh thu thuần, phân bổ thu - chi theo phương thức thanh toán chuẩn KiotViet.

### 8.2. Đang Mô phỏng Nghiệp vụ (Controlled Mock Sandbox)
- **Cổng thanh toán điện tử:** Quét mã VietQR chuyển khoản, Cổng VNPay QR và OnePay quốc tế mô phỏng webhook IPN phản hồi trạng thái có kiểm soát.
- **Hóa đơn VAT:** Tạo mẫu hiển thị hóa đơn tiền phòng và dịch vụ phục vụ in ấn nội bộ (chưa kết nối API hệ thống HĐĐT Viettel/VNPT/MISA).
- **Đồng bộ liên trình duyệt:** Hoạt động qua `localStorage` và `BroadcastChannel` trên cùng một máy tính hoặc mạng LAN cùng origin.

### 8.3. Ngoài Phạm vi Đồ án (Out of Academic Scope)
- Hệ thống máy chủ phân tán (Microservices Backend) đa người dùng đồng thời cấp độ Cloud.
- Két sắt tiền mặt phần cứng hoặc máy quẹt thẻ POS ngân hàng vật lý.

---

## 9. KỊCH BẢN CHI TIẾT TRÌNH DIỄN BẢO VỆ ĐỒ ÁN (DEMO DEFENSE SCRIPT)

### Kịch bản 1: Đặt đoàn nhiều phòng, thu cọc và nhận phòng
1. Vào `index.html` hoặc `reception.html`, mở mục **Đặt phòng** &rarr; Chọn **Đặt đoàn**.
2. Nhập đoàn 2 phòng hạng `PRM-K` từ 01/11 đến 03/11, cọc 1.000.000đ qua VietQR.
3. Hệ thống tạo mã đoàn `DOAN-...`, phân bổ chuẩn xác mỗi phòng 500.000đ.
4. Nhận phòng 505: Folio hiển thị cọc đã nộp 500.000đ, không sinh giao dịch ảo.
5. Kiểm tra Báo cáo doanh thu: `totalIncome` vẫn đúng 1.000.000đ (không bị nhân đôi).

### Kịch bản 2: Khách đến sớm ngày (Early Arrival Adjustment)
1. Ngày làm việc hiện tại: 25/10/2026.
2. Có đơn đặt phòng tương lai ngày 10/11/2026 đến 12/11/2026.
3. Khi khách đến sảnh ngày 25/10, nhân viên chọn nhận phòng. Hệ thống thông báo chính sách PMS chặn check-in sai ngày và đề xuất điều chỉnh ngày đến sớm.
4. Xác nhận điều chỉnh: Hệ thống tự động tính lại số đêm (18 đêm), kiểm tra quỹ phòng và cập nhật bảng giá động.
5. Hoàn tất nhận phòng với đúng số đêm và bảng giá mới.

### Kịch bản 3: Quyết toán tiền đảm bảo & Hoàn tiền minh bạch
1. Khách check-in phòng 402 nộp tiền cọc đảm bảo 2.000.000đ.
2. Tiền phòng và minibar phát sinh 1.400.000đ.
3. Lễ tân thực hiện trả phòng: Hệ thống khấu trừ 1.400.000đ từ cọc đảm bảo và hoàn trả 600.000đ tiền mặt cho khách.
4. Số dư khả dụng của tiền đảm bảo chuyển về 0đ.
5. In lại hóa đơn Folio: số dư nợ bằng 0đ, không bị khấu trừ lặp lại.

### Kịch bản 4: Chốt ca & Chốt ngày kinh doanh (Night Audit)
1. Thu ngân vào phân hệ **Chốt ca & Night Audit**, nhập tiền két thực tế và bàn giao ca.
2. Quản lý thực hiện **Chốt ngày kinh doanh (Night Audit)** cho ngày 25/10/2026.
3. Hệ thống quét các đơn quá hạn chuyển sang `no_show`, snapshot sổ cái `dailyLedgers` và chuyển ngày làm việc sang `26/10/2026`.
4. Mở tab mới hoặc tải lại trang: Sổ cái và ngày mới được bảo toàn 100% từ `localStorage`.

---

## 10. THIẾT KẾ GIAO DIỆN HIỆN ĐẠI, ĐƠN GIẢN VÀ THÂN THIỆN (MODERN USER-FRIENDLY UI)

Giao diện hệ thống đã được tái thiết kế toàn diện theo triết lý **Tối giản - Trực quan - Thao tác 1 chạm (1-Click Action)**, lấy cảm hứng từ các hệ thống ERP khách sạn cao cấp (Mường Thanh Luxury) kết hợp phong cách quản trị tinh gọn hiện đại của KiotViet:

1. **Bộ chuyển Phân hệ Đỉnh trang (Topbar Portal Switcher - 1 Chạm):**
   - Tích hợp 3 nút chuyển nhanh trực tiếp tại thanh Topbar cố định: `[🏢 Quản lý & Thu ngân]`, `[🛎️ Quầy Lễ Tân]`, `[🧹 Buồng Phòng]`.
   - Đèn chỉ báo phân hệ đang hoạt động (Active Pill) giúp người dùng và hội đồng đánh giá chuyển đổi tức thì giữa 3 góc nhìn vận hành mà không cần gõ lại URL.

2. **Sơ đồ phòng tổng thể (Room Rack) Thân thiện & Tiện dụng:**
   - Thẻ phòng bo góc mềm mại (`border-radius: 12px`), mã màu phân định 3 trạng thái độc lập:
     - **Trống sạch (Vacant Clean):** Viền xanh lá pastel, tag giá/đêm, nút `[+ Nhận phòng ngay]` mở modal Check-in tức thì.
     - **Đang ở (Occupied):** Viền xanh dương dịu, tên khách in đậm, ngày trả phòng và nút `[🚪 Trả phòng]`.
     - **Chờ dọn / Đang dọn (Dirty / Cleaning):** Viền vàng/tím hổ phách, trạng thái vệ sinh rõ ràng, nút gọi buồng phòng.
     - **Bảo trì (Maintenance):** Viền đỏ nhạt, cảnh báo tạm khóa khai thác.

3. **Dashboard Doanh thu & Thu - Chi chuẩn KiotViet:**
   - Trực quan hóa chính xác theo mẫu thiết kế chuẩn: Card trắng bo góc 16px, các chip chỉ số nổi bật (Doanh thu thuần, Số hóa đơn, Doanh thu/ngày, Doanh thu/phòng/ngày).
   - Biểu đồ cột bo góc pill-bar trên rãnh nền xám nhạt (`#f1f5f9`), hỗ trợ chuyển đổi linh hoạt: `Theo ngày`, `Theo giờ`, `Theo thứ`.
   - Khối so sánh Thu - Chi phân tách rõ ràng luồng tiền mặt và thanh toán điện tử.

4. **Tối ưu trải nghiệm Biểu mẫu & Bảng dữ liệu:**
   - Bảng số liệu căn lề số học dạng bảng (`tabular-nums`), tiền tệ định dạng VNĐ chuẩn xác.
   - Hộp thoại Modal & Drawer có hiệu ứng kính mờ (Frosted glass blur `backdrop-filter: blur(4px)`), phím tắt đóng nhanh và nút bấm phân cấp rõ ràng (Primary / Secondary / Danger).
   - Bảo toàn 100% tính tương thích: Không làm thay đổi bất kỳ ID, bộ chọn JavaScript hay logic nghiệp vụ cốt lõi nào của hệ thống.
