# Báo giá và đặt phòng — bản sửa ngày 12/11/2026

> **Đã có bản tiếp nối 13/11/2026:** [012/013/014 đã áp dụng, luồng UI/API/SQL thật và đối chiếu đạt](booking-sql-execution-2026-11-13.md). Những chỗ ghi chưa có giá/khách/RPC hoặc chưa được phép SQL dưới đây là lịch sử ngày 12/11; không phải trạng thái hiện tại của phạm vi khách/đặt phòng. Không mở G6–G12.

## Trạng thái thực tế

Không có AGENTS.md được tìm thấy bằng tìm kiếm trong checkout. Đã giữ nguyên các thay đổi đang có. Không chạy SQL pending, DDL/DML trực tiếp, seed, cấp quyền hoặc bật nguồn ghi nghiệp vụ trong lượt này. Kiểm tra đăng nhập/logout có tạo và hủy phiên qua RPC kho phiên đã được duyệt, không tạo giá, khách hoặc đơn đặt phòng.

Ứng dụng thử tại <http://127.0.0.1:8093/reception-api.html> chạy dưới Windows service principal riêng như trước. Đã đồng bộ các file ứng dụng sửa vào bản chạy thử, giữ nguyên manifest, khóa phiên và `PMS_WRITE_MODE=frozen`. “Đã kết nối SQL” ở đây là xác thực/danh mục; không phải khả năng ghi đặt phòng.

Kiểm tra metadata chỉ đọc trên `.\SQLEXPRESS / SongLamPms_Design` xác minh server, database GUID và test markers trước khi đếm:

| Thực thể | Bản ghi |
| --- | ---: |
| RoomType / Room | 11 / 420 |
| HotelSettings / BusinessDay | 1 / 1 |
| Customer | 0 |
| PolicyVersion / RatePlan / RateRule | 0 / 0 / 0 |
| Booking / BookingRoom / BookingNightRate / BookingGuest | 0 / 0 / 0 / 0 |
| RoomAllocation / Stay / PrincipalBinding | 0 / 0 / 0 |

Các tên RPC dự kiến `usp_AppPricingContext`, `usp_AppBookingRead`, `usp_AppBookingPrepare`, `usp_AppBookingCommit` không tồn tại tại lần kiểm tra này. `usp_ApplyCommand`, khóa và kiểm tra inventory cũ có tồn tại, **không có nghĩa backend được quyền gọi hoặc tương thích actor/receipt G5**. Không dùng chúng vòng qua CommandOnly, không cập nhật PrincipalBinding theo request.

## Đã sửa

- G4 trả digest điều kiện giá ổn định giữa hai lần báo giá có mã/thời điểm khác nhau. G5 bắt buộc giá đã được xem, tự tính lại bằng G4, từ chối thay đổi thay vì âm thầm lấy bảng giá mới. Hash không thay kiểm tra SQL tại commit.
- Giữ snapshot cũ; policy mới có thể khai rõ biên trả muộn và giới hạn gói giờ. Chưa gắn các tùy chọn vào database hoặc tự duyệt chính sách Excel.
- Biểu mẫu lọc hạng/gói đang hoạt động theo loại giá, bắt buộc tên đoàn, vô hiệu hóa báo giá đã xem khi sửa đơn, trình bày từng dòng bằng tiếng Việt và tổng dự kiến toàn đơn bằng số nguyên VND.
- Nút mở báo giá cho xem rõ lý do thiếu hợp đồng/bảng giá; không giả lập giá. Khi đủ hợp đồng đọc nhưng ghi bị khóa, bản xem đơn có thể kiểm quỹ/báo giá, vẫn không xác nhận đơn.
- Không ghi localStorage nghiệp vụ, không ghi kép, không mở chức năng thu cọc.

## Kiểm chứng đã chạy

| Lệnh | Kết quả | Phạm vi |
| --- | --- | --- |
| `npm.cmd test` trong backend | 165/165 đạt, 0 trượt | Fixture/unit; không phải SQL nghiệp vụ |
| `node --check js/pages/reception-api.js` | Đạt | Cú pháp frontend |
| `node tools/sql/pricing-booking-preflight.mjs --read-only` | Đọc được identity/counts/metadata | SQL thật, chỉ đọc, bằng tài khoản kiểm tra metadata; không dùng làm service pool |
| `node tools/sql/verify-foundation-http.mjs --approved=USER-FOUNDATION-011` | 35 kiểm tra đạt, 5 vai trò | HTTP → pool dịch vụ → SQL thật; đăng nhập/danh mục, không tạo đơn |
| `node tools/verify/staff-sql-browser.mjs --approved=USER-FOUNDATION-011 --foundation-batch` | 141 kiểm tra đạt, 5 vai trò, 0 lỗi JS/tài nguyên | Browser → API → SQL danh mục; 1366×768, 1920×1080, 390×844; biểu mẫu giá khóa đúng khi thiếu dữ liệu; hộp thoại căn giữa, không tràn ngang |

Các ca mới trong `backend/tests/booking-quote.test.js`: hash giá ổn định; đổi giá/policy/khách làm đổi hash; thiếu hash/giá browser bị từ chối; không commit khi một dòng đoàn lỗi giá; toàn đoàn biên dịch một batch; vượt giới hạn không commit; replay giữ receipt cũ và không báo giá lại; receipt khác intent bị từ chối; chưa xác minh cọc không xác nhận; mốc 15:00/18:00; gói giờ 6 giờ; actor giả bị chặn. Đây là fixture, **chưa chứng minh nguyên tử/đặt trùng trên SQL**.

Kiểm tra bố cục bổ sung đã phát hiện hộp thoại dính góc trái do reset CSS; sửa riêng trong `css/pms.css`. Lần kiểm tọa độ đầu thất bại vì so chiều rộng cửa sổ có thanh cuộn với vùng layout không chứa thanh cuộn; đã sửa phép đo theo `documentElement.clientWidth` và chạy lại đủ 141 kiểm tra đạt. Đã xem ảnh hộp thoại 1366 và màn hình nhỏ; tiêu đề/nút đóng được giữ khi cuộn. Không thay kiểm thử SQL nghiệp vụ bằng kết quả bố cục.

Bằng chứng cục bộ: `tools/sql/private/pricing-booking-code-20261112/code-refresh.json`, các `sql-readonly-*.json`, `tools/sql/private/foundation-base420-20261112/http-reconciliation.json`, `screenshots/foundation-sql/report.json`. Báo cáo trình duyệt chứa mã request và đường dẫn, không chứa mật khẩu, cookie hoặc token.

## Phần SQL cần phê duyệt riêng, theo thứ tự phụ thuộc

Đây là danh sách thiết kế cần hoàn thiện thành script có guard/hash/backup để duyệt thực thi; **không phải gói SQL đã được duyệt hoặc đã sẵn sàng chạy**. Không tạo file pending giả chỉ để đánh dấu hoàn thành.

| Mục | Hợp đồng tối thiểu cần bổ sung | Quyền/dữ liệu đề xuất | Chặn việc gì |
| --- | --- | --- | --- |
| P1: dữ liệu giá/chính sách | Nhập RatePlan/RateRule/PolicyVersion nguyên tử, version/hash, nguồn và receipt chống nhập lặp | 10 hạng có giá, 2 loại giá; DLX-TR vẫn không có giá. Không thay RolePermission. CreatedBy từ nhân viên được xác nhận | Mọi báo giá thật |
| P2: đọc giá | RPC theo AppUserId, input typed, trả `songlam.pricing.context.v1`, lịch phân loại ngày và mapping timezone được duyệt; mở đọc ratePlans/rateRules/policyVersions qua gateway danh mục hiện có | EXECUTE từng RPC cho service principal hiện tại; không SELECT bảng rộng. Không tự bật early-departure khi chưa có snapshot Stay | G4 và lựa chọn gói giá trên frontend |
| C1: khách hàng | Tra cứu/tạo khách hợp lệ, chống trùng theo chính sách và version; xử lý thông tin định danh theo quyền | Đọc/ghi qua command được duyệt. Không seed khách thật hoặc khách giả để qua FK | Đơn đầu tiên, hiện Customer=0 |
| B1: quỹ/lịch/đơn | `availability/timeline/list/detail`, half-open toàn khoảng, phân trang SQL, bỏ đếm trùng phần đoàn đã nhận, block/bảo trì | RPC đọc theo actor, trường tiền theo collectPayment; không cho browser tự đếm danh mục phòng thành quỹ | Lịch tương lai và kiểm quỹ |
| B2: ghi đơn/phân/hủy | Prepare chỉ đọc + commit giữ SongLam:Inventory, kiểm giá và rowversion/tập allocation, toàn đoàn nguyên tử, audit + receipt cùng transaction. Rà helper private/nested permissions của 002, không tự áp dụng 002/002b | EXECUTE public wrapper hẹp; helper vẫn private. Không sửa/xóa lịch sử, không cấp db_owner; giữ nguyên quyền nghiệp vụ hiện tại | Ghi đặt phòng/đổi phòng dự kiến/hủy an toàn |
| B3: kết quả gửi lặp | Receipt ràng buộc actor/operation/key/canonical intent gồm acceptedQuoteHash; lookup kiểm quyền hiện tại; timeout sau commit trả receipt cũ | Hợp đồng receipt/lookup được duyệt; không retry với key mới | Xử lý timeout và chống tạo trùng |
| T1: mở thử có giới hạn | Cấu hình profile test có phạm vi booking đã nghiệm thu, không mở mọi command G6–G12; kiểm chứng quyền/actor, concurrent booking, nhóm rollback, replay/timeout | Chỉ sau SQL được duyệt và kiểm thử tích hợp đạt; không cắt chuyển G12 | Nút xác nhận trên giao diện |

Trước bất kỳ triển khai SQL mới nào: backup mới + VERIFYONLY; đối chiếu target/marker/hash định nghĩa/trigger thực; không dùng backup 000/011 cũ giả định database chưa đổi. Nếu không có bằng chứng backup phù hợp, dừng thao tác SQL đó. Phục hồi không tự drop dữ liệu/restore đè: trước khi có booking mới có thể xem xét gỡ đúng hợp đồng mới sau phê duyệt; sau khi có giao dịch mới phải backup và đối chiếu chúng trước phương án rollback. Chưa chạy bất kỳ nhánh này.

## Nguồn giá chuẩn bị để xem xét

`docs/artifacts/pricing-data-proposed.json` được tạo bằng `tools/migration/prepare-pricing-proposal.mjs` từ bản nguồn đã giữ và review Excel: xác minh SHA-256 workbook, đúng 10 hạng/alias, VND nguyên, ngày hiệu lực; ghi mới với `wx`, không ghi đè nguồn hoặc bản đề xuất. Artifact không phải payload seed/manifest vận hành, `sqlExecutionApproved=false`, không import SQL driver.

Giá nguồn bắt đầu **01/11/2026**, kết thúc hết **31/12/2027** (biểu diễn `[2026-11-01,2028-01-01)`). Ngày nghiệp vụ đã chốt vẫn **11/10/2026**, do đó **11/10–31/10 chưa có giá**. Người dùng đã xác nhận giữ nguyên ngày giá theo Excel và đặt thử từ 01/11/2026, không kéo lùi giá. Quyết định ghi trong `deploy/pricing-booking-decisions.json`, chỉ chốt dữ liệu đề xuất, **không phải phê duyệt SQL**.

## File cập nhật trong lượt này

- Backend: `backend/src/modules/pricing/engine.js`, `pricing/policy.js`, `backend/src/modules/bookings/service.js`, `bookings/validation.js`.
- Frontend: `js/pages/reception-api.js`, `css/pms.css` (căn giữa hộp thoại và giữ tiêu đề/nút đóng khi cuộn).
- Kiểm thử: `backend/tests/booking-quote.test.js`, `backend/tests/domain.test.js`, `tools/verify/staff-sql-browser.mjs`.
- Công cụ: `tools/sql/pricing-booking-preflight.mjs`, `tools/sql/refresh-pricing-booking-test-build.ps1`, `tools/migration/prepare-pricing-proposal.mjs`.
- Dữ liệu đề xuất/quyết định: `docs/artifacts/pricing-data-proposed.json`, `deploy/pricing-booking-decisions.json`.
- Tài liệu: bản này, `docs/g4-pricing.md`, `docs/g5-bookings.md`.

Các thay đổi Git đang có từ các lượt trước được giữ nguyên; không gán chúng là kết quả sửa mới của lượt này.

Chính sách khách vượt tiêu chuẩn, tuổi trẻ em/giường phụ, chuyển gói >6 giờ thành một đêm trong ngày, deadline giữ phòng/nhận cọc/xác nhận/hủy cần hợp đồng SQL tương ứng trước khi bật. Không giả định mọi khách đều được tính trong `MaxOccupancy` miễn phí, không lấy transaction pending làm tiền cọc. Không có lịch cuối tuần/ngày lễ được duyệt để tự thêm giá.

## Chưa được nghiệm thu

Chưa chạy tạo đơn thật, hai nhân viên tranh phòng cuối, phân đoàn/hủy đoàn có cọc, timeout sau commit SQL hoặc đối chiếu snapshot đã ghi. Không tuyên bố báo giá/đặt phòng đã chạy SQL thật, dù 165 fixture và danh mục SQL đều đạt.
