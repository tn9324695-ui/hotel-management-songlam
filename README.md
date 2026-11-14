# Trạng thái hiện tại — 13/11/2026

**Đã chạy luồng thật Browser → frontend → Express → SQL Server `.\SQLEXPRESS / SongLamPms_Design`: báo giá, tạo/chọn khách và đặt phòng.** Dùng `Start-SongLamPMS.cmd`, đăng nhập tại **http://127.0.0.1:8093/login.html** bằng tài khoản thử lễ tân/quản lý; tải lại trang để nạp giao diện mới. Chỉ mở ghi khách và booking, không phải mock/localStorage và chưa cắt chuyển G12.

Đã áp dụng 012/013/014, mỗi gói có backup mới + VERIFYONLY; giữ nguyên hash 420 phòng dự án (không xác nhận là danh sách phòng thật của Mường Thanh). 1 policy, 2 plan, 20 giá **riêng của nhóm** có hiệu lực 01/11/2026–31/12/2027. Đã tạo 1 khách có nhãn thử và 5 đơn (6 phòng), kiểm tranh phòng/gửi lặp/đoàn/timeout sau commit. **76 kiểm tra đối chiếu SQL đạt**; audit/receipt và từng dòng tiền dự kiến khớp. Tổng dự kiến 71.750.000đ, **thực thu/cọc 0đ**, không phải doanh thu.

[Bàn giao đầy đủ: API, file, migration/backup, mã đơn, kiểm tra thực tế và giới hạn](docs/booking-sql-execution-2026-11-13.md). Các dòng “chưa có giá”, “chưa mở ghi” bên dưới là lịch sử trước gói 012, không còn là trạng thái của luồng khách/đặt phòng. G6–G12 và quyết toán vẫn khóa.

## Lịch sử trước gói 012

**Mở hệ thống qua backend:** nhấp `Start-SongLamPMS.cmd` ở thư mục dự án. Launcher kiểm tra API/SQL và dùng tài khoản dịch vụ đã cấu hình nếu cần khởi động; không migration/seed hoặc mở ghi nghiệp vụ. URL đăng nhập: **http://127.0.0.1:8093/login.html**. Đã chạy kiểm tra launcher `-NoOpen` với backend đang hoạt động và đối chiếu lại đủ 5 vai trò qua 35 kiểm tra HTTP/SQL thật.

**011 đã nhập dữ liệu nền và đối chiếu SQL thật:** 420 phòng, 11 hạng, 15 dịch vụ, cấu hình khách sạn/ngày nghiệp vụ **11/10/2026**. 5 phòng bảo trì cách ly đúng quyết định; replay không tạo trùng. **35 kiểm tra HTTP đối chiếu dữ liệu, 120 kiểm tra browser cho 5 vai trò, 153/153 fixture đạt**. Mở **http://127.0.0.1:8093/reception-api.html** hoặc **/catalog-api.html**. Chưa nhập bảng giá/chính sách và chưa mở ghi nghiệp vụ/G12. [Receipt, backup, dữ liệu đã nhập và giới hạn](docs/foundation-base420-execution.md). Các ghi nhận bảng trống/chờ gói 011 bên dưới là lịch sử trước lần nhập này.

**Tiếp tục mục 7–8:** có màn hình **http://127.0.0.1:8093/catalog-api.html** đọc đủ các nguồn R1 theo quyền, bộ lọc/phân trang/chi tiết và nguồn API/SQL. Các module chưa có SQL hiển thị Chưa khả dụng, lễ tân khóa lịch/quỹ/báo giá chưa hỗ trợ. **57 kiểm tra HTTP/SQL thật, 102 kiểm tra browser thật, 142/142 fixture đạt**. Mục 7 chưa nhập vì chờ nguồn/dữ liệu và hợp đồng nhập riêng; không tạo giá/ngày giả. [Bàn giao, matrix màn hình–SQL và phần cần duyệt](docs/foundation-frontend-handoff.md).

**Mục 5–6 đã chạy thử SQL thật:** 5 nhân viên thử đã nhập, replay không tạo trùng; 010 đã sửa chuyển đổi RowVer theo phê duyệt riêng. Login/me/permissions/logout và R1 đọc danh mục đạt **57 kiểm tra HTTP**, **37 kiểm tra browser** cho 5 vai trò ở 1366×768 và 1920×1080; **137/137 fixture đạt**. Mở **http://127.0.0.1:8093/login.html**. Phòng/hạng phòng hiện trống, không có dữ liệu demo thay thế; ghi nghiệp vụ vẫn frozen. [Bàn giao, tài khoản cục bộ và bằng chứng](docs/staff-catalog-execution-2026-11-12.md).

Các số đếm/trạng thái AppUser=0 và các điểm chặn đăng nhập bên dưới là lịch sử trước mục 5–6; bản bàn giao trên là trạng thái mới nhất.

**Mục 3–4 đã triển khai SQL và kiểm chứng pool thật:** tài khoản Windows `songlam_pms_test` thuộc Users, không Administrators; SQL user có hai role với 7 quyền EXECUTE hẹp; `WebSession` và bốn RPC đã áp dụng. Backend kiểm thử đang ở **http://127.0.0.1:8093/login.html**, dùng SQL thật và ngoại lệ chứng chỉ riêng đã duyệt, mã hóa vẫn bật. AppUser=0 nên **chưa có đăng nhập nhân viên thành công**; ghi nghiệp vụ frozen, chưa cắt chuyển vận hành. [Bằng chứng, cách chạy và giới hạn](docs/service-session-execution-2026-11-12.md).

Kiểm thử mới: **134/134 fixture backend**, kiểm tra SQL/pool và HTTP thực được ghi riêng trong tài liệu trên. Các mục bên dưới là lịch sử, được giữ để truy vết; các câu “service principal/kho phiên chưa có” không còn phản ánh trạng thái hiện tại.

# Lịch sử D1/D2 — Cập nhật quyết định môi trường kiểm thử, 11/11/2026

**Đã hoàn tất hai mục đầu trên SQL thật:** 004r tạo backup mới/VERIFYONLY, ghi marker và trả MULTI_USER; 001/003 tạo ba RPC xác thực và role với đúng ba EXECUTE. [Receipt, hash và kiểm chứng](docs/first-two-execution-2026-11-12.md). Chưa làm mục 3–8: service principal/kho phiên/tài khoản thử vẫn chưa có, chưa mở đăng nhập website hoặc pool backend. Các trạng thái D1 bị chặn ở ghi nhận cũ bên dưới đã được thay thế bởi biên bản này.

**Rà soát code mới nhất:** [báo cáo 12/11/2026](docs/repository-audit-2026-11-12.md). Đã sửa race frontend khi khôi phục phiên và trạng thái readiness; backend 131/131, frontend service 9/9, browser 67/67, demo 18/18 đạt. Đây không phải nghiệm thu SQL. Runtime vận hành/receipt/monitoring còn thiếu ngoài các phụ thuộc SQL; không đánh giá hoàn thành theo số file hoặc endpoint.

**Nhóm đăng nhập được chọn:** đã viết artifact D2-P/D3-P, bootstrap nhân viên và R1, CLI chuẩn bị/import và test; bundle bí mật 5 người đã chuẩn bị, **chưa nhập SQL**. 129/129 test backend và 67/67 browser fixture/HTTP đạt; SQL nghiệp vụ chưa chạy vì D1 marker chưa có, 004r tạm dừng. [Bàn giao code, lệnh và điểm chặn](docs/login-packages-implementation.md).

**Preview mới nhất:** frontend + Express chạy tại `http://127.0.0.1:8091/login.html`; pool SQL/đăng nhập thật vẫn bị chặn bởi RPC, service principal, kho phiên và bootstrap nhân viên chưa được duyệt/áp dụng. 004r tạm dừng. [Bảng kết quả, lệnh chạy, nguồn SQL thật và hợp đồng còn thiếu](docs/live-sql-preview.md). Không có tài khoản thử SQL được tạo hoặc cắt chuyển vận hành.

Kết nối 12/11/2026: đã cài driver SQL Server/Windows Authentication, thêm runtime opt-in vào entrypoint và chỉ báo kết nối frontend. [Trạng thái thực tế, kiểm thử và các phê duyệt còn chờ](docs/sql-connection-status.md). Native driver nạp được; pool ứng dụng vẫn khóa vì SQL chưa có RPC/marker/principal và AppUser=0. Test backend 121/121, không phải nghiệm thu SQL thật.

Frontend tiếp tục ngày 12/11/2026: [bảng bàn giao từng màn hình, API và trạng thái dữ liệu](docs/frontend-completion.md). Có màn hình `reception-api.html` cho lịch/đặt phòng/lưu trú, lớp phiên/quyền và component dùng chung với các trang API hiện có. Đọc dữ liệu bằng HTTP; SQL chưa sẵn sàng thì khóa ghi, không lấy demo thay thế. Xem thử cùng Express tại `http://127.0.0.1:8090/reception-api.html` khi chạy theo hướng dẫn trong tài liệu. Không có luồng SQL thật được đánh dấu nghiệm thu.

Rà soát backend mới: [đường nối API → gateway → SQL, backlog theo thứ tự và tiêu chí nghiệm thu](docs/backend-completion-audit.md). Đã sửa kiểm tra SQL_SERVER và chẩn đoán cổng named-instance; suite **114/114 fixture/mock**, 113 tệp nguồn qua kiểm tra cú pháp. Backend chưa được coi là hoàn tất trên SQL thật.

Đã tiếp tục phần code D2–D4: ghép auth/session có điều kiện, sửa RowVer binary/text, bổ sung gói duyệt S0 và actor/audit. [Bàn giao và kết quả fixture](docs/d2-d4-handoff.md), [D3](docs/d3-approval-package.md), [D4](docs/d4-approval-package.md). Chưa chạy SQL pending hoặc nối frontend ghi SQL thật.

**D1 hiện tại:** dùng `SongLamPms_Design` trên `.\SQLEXPRESS` để ghi kiểm thử đã xác nhận. **000 đã chạy backup/VERIFYONLY thành công; 004 đã được duyệt riêng, chưa chạy vì thiếu bằng chứng cửa sổ ngừng ghi**. [Gói D1](docs/d1-approval-package.md), [preflight hiện tại](docs/d1-004-preflight.md). 001/002/002b/003/005 chưa duyệt/chạy. Driver đã cài; pool/đăng nhập/nghiệp vụ SQL chưa được xác minh, AppUser=0. Hai backend preview 8090/8091 đã được dừng để kiểm tra nguồn ghi. Các mục lịch sử bên dưới không thay thế trạng thái này; số test fixture không phải SQL integration.

# Bảng quyết định trước SQL — 11/11/2026

Đã kiểm chỉ đọc số đếm dữ liệu pms: bảng nghiệp vụ và AppUser hiện 0; dữ liệu vai trò/quyền/rule tham chiếu còn nguyên. Đã tách A3 khỏi gói đăng nhập, chuẩn bị S0 SQL/session adapter mặc định khóa và bản backup pending. Test backend **102/102 đạt với fixture/provider giả**, chưa chạy SQL pending/backup/marker/fixture hay pool thật. Xem [bảng duyệt D1–D4, điều kiện, kiểm chứng và phục hồi](docs/auth-sql-decisions.md).

# Chuẩn bị kết nối database hiện có — 11/11/2026

Đã xác minh chỉ đọc system catalog của `SongLamPms_Design` trên `.\SQLEXPRESS`, không tạo DB mới. Đã chuẩn bị SQL A1/A2/A3 và quyền hẹp để duyệt riêng, code profile/pool preflight và 6 test mới; backend **95/95 đạt với fixture/provider giả**. Chưa áp dụng SQL, chưa có pool SQL thật hoặc đăng nhập vận hành. Xem [bàn giao](docs/auth-sql-preparation.md), [bản SQL cần duyệt](database/proposals/auth-v1/README.md).

# Rà soát sau G12 — kết quả độc lập SQL

Đã sửa và chạy lại: backend **89/89**, model **8/8 assertions**, nghiệp vụ demo **18/18**, UI demo **100/100**, browser API/login **29/29**, browser auth qua Express với SQL pool fixture **8/8**. Sửa login UI nối G2 khi configured, chặn receipt PENDING bị ghi COMMITTED trong importer và điều chỉnh bootstrap/test harness G12. **SQL nghiệp vụ: 0 bài chạy**, chưa có DB test/approval; không kết luận đã nối SQL thật hoặc sẵn sàng vận hành. Xem [báo cáo/matrix và lệnh](docs/verification-g0-g12.md), [hợp đồng thiếu và môi trường cần cung cấp](docs/sql-verification-prerequisites.md).

# G12 — Chuẩn bị cắt chuyển, CHƯA kích hoạt

Đã bổ sung công tắc `PMS_WRITE_MODE` (demo/frozen/api-readonly/sql), chốt ghi backend/Store, metadata yêu cầu chờ và trang tra cứu receipt, trạng thái nội bộ, cấu hình mẫu và CLI review ngoại tuyến. Mặc định vẫn demo; thiếu G11 PASS, xác minh SQL/session/actor/receipt/monitor đã duyệt thì API ghi tiếp tục khóa. Không thay `.env` thật, không SQL/import/restore/cắt chuyển và chưa viết/chạy kiểm thử G12. Xem [bàn giao](docs/g12-cutover.md), [checklist và rollback](docs/g12-runbook.md), [nghiệm thu chưa kiểm tra](docs/g12-acceptance.md), [phụ thuộc cần duyệt](docs/g12-sql-proposals.md).

# G10 — Dashboard, báo cáo và quản trị — 09/11/2026

Đã viết reports/users/roles/audit/exceptions và màn hình `admin-api.html`, với định nghĩa chỉ số trong code, kỳ/múi giờ từ SQL, trạng thái 0/rỗng/thiếu đối soát tách biệt. Không dùng KPI demo dự phòng, không sửa quyền hoặc lộ credential/raw audit payload. Log HTTP đã lọc tách khỏi journal SQL bền vững còn chờ duyệt. **Chưa nghiệm thu SQL thật**, chưa viết/chạy kiểm thử, không thay SQL. Xem [G10 và bảng chỉ số](docs/g10-management.md), [hợp đồng cần duyệt](docs/g10-sql-proposals.md). index.html vẫn là demo riêng, có link API rõ ràng.

# G9 — Tài chính và checkout — 09/11/2026

Đã viết modules/API folio, cọc, payments, refunds, checkout, phiếu nội bộ, ca và ngày; form API tại `finance-api.html`, tách demo/localStorage. **Chưa nghiệm thu SQL thật**: RPC tài chính nguyên tử/receipt, policy duyệt hoàn/clock và các linkage cọc-master-minibar còn chờ duyệt. Ngân hàng chỉ PENDING, hóa đơn điện tử/điều chỉnh sau chốt không bật. Không thay SQL, chưa viết/chạy kiểm thử. Xem [bàn giao G9](docs/g9-finance.md), [SQL cần duyệt](docs/g9-sql-proposals.md).

# G8 — Dịch vụ và minibar — 09/11/2026

Đã viết backend service-orders/minibar-audits và form API riêng tại `services-api.html`, có nhiều dòng/giá chốt, giao dịch vụ, hủy bằng credit liên kết và biên bản minibar 0đ. **Chưa nghiệm thu SQL thật**: ngữ cảnh folio hẹp, snapshot/phạm vi kiểm/segment, hủy OPEN và policy 0đ còn chờ hợp đồng được duyệt. Không thay SQL, không viết/chạy kiểm thử trong lượt G8. Xem [bàn giao G8](docs/g8-services-minibar.md), [SQL/folio cần duyệt](docs/g8-sql-proposals.md). Demo cũ giữ riêng, không ghi kép; chưa làm G9.

# G7 — Buồng phòng, bảo trì, đồ thất lạc — 08/11/2026

Đã viết backend G7 và nối biểu mẫu API tại [`housekeeping-api.html`](housekeeping-api.html), tách khỏi demo/localStorage. **Chưa nghiệm thu SQL thật**: hợp đồng actor/command/event/custody/eligibility và quyền nghiệm thu còn chờ phê duyệt; giao diện báo chưa cấu hình, không giả thành công. Không thay SQL, không viết/chạy test trong lượt G7. Xem [bàn giao G7](docs/g7-operations.md), [đề xuất cần duyệt](docs/g7-sql-proposals.md) và [cách chạy backend](backend/README.md).

# Backend G6 — 08/11/2026

Đã viết nhận/chuyển phòng, gia hạn và shorten tại backend cùng API client riêng; chưa nối biểu mẫu hoặc nghiệm thu SQL thật. Không check-out/quyết toán G9, không tự thu/hoàn tiền/đóng folio. Xem [G6 và các phần còn chặn](docs/g6-stays.md), [hợp đồng SQL cần phê duyệt](docs/g6-sql-proposals.md). Chỉ viết code, không tạo/chạy kiểm thử trong lượt này.

# Backend G5 — 08/11/2026

Đã viết backend đặt/quỹ/lịch/gán/hủy và API client độc lập, tái sử dụng giá G4. **Chưa nghiệm thu G5**: chưa có hợp đồng SQL được duyệt và kiểm chứng đặt đoàn nguyên tử/xung đột đồng thời. Chưa nối giao diện, chưa check-in/out/thu cọc thật, không thay SQL hoặc dữ liệu. Xem [bàn giao G5](docs/g5-bookings.md), [đề xuất SQL G5](docs/g5-sql-proposals.md). Lượt G5 không tạo/chạy kiểm thử.

# Backend G4 — 08/11/2026

Đã viết module giá đêm/giờ, phụ thu theo chính sách tường minh và chênh lệch trả sớm từ snapshot đã chốt. Chưa có phê duyệt hợp đồng SQL/chính sách/lịch để bật vận hành, không dùng giá demo hoặc ghi booking/tiền/snapshot. Xem [bàn giao G4](docs/g4-pricing.md). Không tạo/chạy kiểm thử trong lượt này.

# Backend G3 — 08/11/2026

Đã bổ sung code API đọc danh mục, phòng với ba trạng thái độc lập, cấu hình/ngày nghiệp vụ và tra cứu khách hàng. Chưa bật SQL thật khi thiếu hợp đồng/quyền được duyệt; chưa nối frontend hoặc sửa nghiệp vụ. Lượt G3 không tạo/chạy kiểm thử. Xem [API, giới hạn và đề xuất SQL G3](docs/g3-sql-proposals.md).

# Backend G2 — 08/11/2026

Đã viết API xác thực, quản lý phiên/CSRF, quyền và adapter actor qua pool; kiểm thử bằng fixture. **G2 chưa nghiệm thu đăng nhập thật** vì chưa có phê duyệt A1/A2/A3, định dạng hash thực tế và kho phiên vận hành. Không thay đổi SQL hoặc nghiệp vụ demo. Xem [bàn giao G2 và phần còn chặn](docs/g2-authentication.md).

# Backend G0–G1 — 08/11/2026

Đã bổ sung khung Express, `/health`, `/ready`, HTTP client và `login.html`. Login hiển thị **“Chưa cấu hình đăng nhập”**, không cấp phiên hoặc xác nhận thành công giả. Backend chưa kết nối SQL và chưa thay nguồn dữ liệu demo.

Xem [cách chạy backend](backend/README.md), [kiểm kê nguồn](docs/source-inventory.md), [đề xuất SQL cần duyệt cho G2](docs/sql-proposals.md) và [kết quả kiểm thử G0–G1](docs/g0-g1-validation.md). Đường chạy demo Python bên dưới vẫn được giữ. Các ghi chép trước đây là lịch sử; số lượng đối tượng SQL không được kiểm tra lại trong G0–G1.

# Database SQL Server — cập nhật 08/11/2026

Đã nâng cấp [database và cổng nghiệp vụ SQL](database/README.md) tới **schema 3**: 51 bảng, 108 khóa ngoại, 122 CHECK, 28 trigger; 72/72 ca kiểm thử SQL đạt. Ghi dữ liệu phải qua kiểm tra quyền, quỹ phòng, lưu trú, cọc, thu/hoàn tiền, folio và chốt ngày trong transaction. Database: `SongLamPms_Design` trên `.\SQLEXPRESS`. Giao diện vẫn dùng localStorage; HTTP backend, chuyển dữ liệu và tích hợp ngân hàng/hóa đơn thật chưa triển khai.

[Kết quả nâng cấp database và hồi quy ứng dụng](database/VALIDATION_V2.md). Các thay đổi giao diện bên dưới được giữ nguyên.

# Giao diện quản trị Sông Lam — cập nhật 07/11/2026

Ứng dụng giữ nguyên HTML/CSS/JavaScript thuần, ba phân hệ và lớp nghiệp vụ `SongLamStore`. Không thay đổi `js/store.js` hoặc dữ liệu khởi tạo `js/data.js`. Không tìm thấy `AGENTS.md` trong checkout hoặc các thư mục cha khi bắt đầu rà soát.

Thiết kế dùng [bố cục Tabler miễn phí](https://docs.tabler.io/ui/layout) và bản Tabler 1.7.3 đã có trong dự án: menu dọc, thanh công cụ, nền sáng, màu xanh dương, bảng và bộ lọc. Biểu tượng Lucide 0.468.0 được lưu cục bộ cùng giấy phép ISC; không còn phụ thuộc CDN biểu tượng hay Google Fonts khi chạy.

## Chạy ứng dụng

Tại thư mục dự án, chạy Python 3:

```powershell
python -m http.server 8080 --bind 127.0.0.1
```

- Quản trị: http://127.0.0.1:8080/index.html
- Lễ tân: http://127.0.0.1:8080/reception.html
- Buồng phòng: http://127.0.0.1:8080/housekeeping.html

Dùng cùng một địa chỉ host và cổng ở cả ba phân hệ để chia sẻ dữ liệu. `localhost` và `127.0.0.1` là hai origin riêng nên không dùng chung localStorage. Không cần npm, cài framework hoặc bước build.

## Các màn hình và tệp đã thay đổi

| Phần | Thay đổi |
| --- | --- |
| Tổng quan | 8 chỉ số lấy từ dữ liệu hiện có; danh sách khách đến/trả; việc cần xử lý; tách doanh thu và dòng tiền |
| Sơ đồ phòng | Bộ lọc lưu trú, vệ sinh, khai thác độc lập; số phòng thực tế; bộ lọc nhanh được xóa trạng thái cũ trước khi áp dụng |
| Lịch đặt phòng ở quản trị và lễ tân | Thành phần dùng chung, cuộn ngang/dọc, cố định cột phòng và ngày, hiện đúng đêm cuối, các khoảng giao nhau ở hàng riêng, tìm phòng/khách, nút Hôm nay hoạt động |
| Đặt phòng, khách hàng | Tìm kiếm, lọc trạng thái, trạng thái rỗng, giữ focus khi gõ; nút thao tác theo ma trận quyền |
| Phòng, hạng phòng, giá, dịch vụ | Bảng nhất quán, tìm kiếm; sửa biểu mẫu sức chứa để đọc/ghi đúng `standardOccupancy` và `maxOccupancy` |
| Thanh toán, hóa đơn, hoàn tiền, báo cáo | Tìm bảng; giữ các luồng thu/hoàn hiện có; ghi rõ phiếu thanh toán mô phỏng; bỏ báo cáo kênh bán dùng tỷ lệ cố định; công nợ lấy từ folio |
| Tài khoản, vai trò, nhật ký, chốt ca | Menu và tab theo quyền; đúng tài khoản theo vai trò; đóng biểu mẫu khi đổi vai trò; nối lại nút ngoại lệ/chốt ca/chốt ngày với hàm xử lý sẵn có |
| Lễ tân, buồng phòng | Cùng layout; menu di động; bảng cuộn; giữ các nghiệp vụ nhận/trả phòng, thuê giờ, trả sớm, minibar và khách đoàn |

Các tệp chính:

- `index.html`, `reception.html`, `housekeeping.html`: nạp layout/tài nguyên chung.
- `css/pms.css`: thiết kế responsive; tiếp tục dùng `css/style.css` và `css/tabler.min.css` có sẵn.
- `js/pms-ui.js`: layout, dashboard, lịch, báo cáo, tìm kiếm bảng và kiểm tra quyền giao diện dùng chung.
- `js/pms-data.js`: mô hình dữ liệu chỉ đọc cho thống kê và lịch; không ghi giao dịch.
- `js/app.js`, `js/reception.js`, `js/housekeeping.js`: tích hợp giao diện và sửa các liên kết hàm/trường dữ liệu nêu trên.
- `js/lucide.min.js`, `js/lucide.LICENSE`, `favicon.svg`: tài nguyên cục bộ.
- `run_suite.py`, `run_ui_checks.py`, `tests/`: bộ chạy kiểm tra và kiểm thử bổ sung.
- `screenshots/redesign_*.png`, `screenshots/ui-checks.json`: ảnh và kết quả kiểm tra.

## Định nghĩa số liệu và giới hạn hiện tại

- **Ngày hôm nay** trên dashboard là ngày nghiệp vụ do hệ thống quản lý, không tự thay bằng ngày máy tính.
- **Phòng trống sạch** phải đồng thời trống, sạch và đang khai thác. Phòng chờ dọn chỉ đếm `dirty`; đang dọn và chờ kiểm tra hiển thị riêng.
- **Doanh thu đã quyết toán** là tổng chi phí folio của các lượt đã trả trong kỳ; ưu tiên snapshot đã lưu lúc trả phòng. Không coi tiền cọc là doanh thu.
- **Thu/chi** chỉ lấy giao dịch thành công; loại phân bổ và khấu trừ nội bộ. Dòng tiền thuần có thể âm.
- **Công nợ** theo số dư folio. Khoản phòng đã chuyển về Master Folio đoàn vẫn được theo dõi sau khi trả phòng; không cộng lại giá dự kiến của đơn đặt. Bảng đoàn đánh dấu đơn chưa có lưu trú là “Chưa lưu trú”.
- Lịch tổng quan hiển thị theo ngày/đêm. Chi tiết thuê giờ tiếp tục xử lý qua biểu mẫu và folio hiện có; chưa có lịch chia ô theo giờ.
- Chưa có backend, đăng nhập an toàn, cơ sở dữ liệu nhiều người dùng, đồng bộ nhiều thiết bị, cổng thanh toán/ngân hàng thật, hóa đơn điện tử, xuất Excel hoặc phân tích nguồn khách có dữ liệu chuẩn. Các mục chưa có được ghi rõ trên giao diện. Vai trò chuyển trong ứng dụng là mô phỏng; kiểm tra quyền ở trình duyệt không thay thế kiểm soát truy cập phía server.
- Master Folio đang có logic chuyển tiền phòng và số dư; chưa có quy trình thu/đối soát công nợ đoàn tập trung hoàn chỉnh. Không tạo thao tác thu nợ giả.

## Kiểm tra đã thực hiện

Sau khi khởi động HTTP server:

```powershell
python run_suite.py
node tests/view-data.test.js
python run_ui_checks.py
python run_ui_checks.py --screenshots
```

Hai bộ Python dùng Microsoft Edge tại đường dẫn cài đặt chuẩn Windows, với **hồ sơ tạm riêng** để không chạm dữ liệu khách sạn trong trình duyệt của người dùng. Cần môi trường cho phép khởi chạy Edge; bộ chạy sẽ trả mã lỗi nếu trình duyệt không chạy hoặc không có ca thử, không báo thành công `0/0`.

Kết quả thực chạy:

- **18/18** kiểm thử nghiệp vụ sẵn có: đặt trùng, khách đoàn, phân bổ cọc, idempotency thu tiền, hoàn cọc, chốt ngày, nhận sớm, tháng nhuận, minibar và phòng bảo trì.
- **100/100** kiểm tra trình duyệt: 28 màn hình ở 1366×768, 1920×1080 và 390×844; menu, liên kết nội bộ, tài nguyên, bộ lọc, lịch, các tab, biểu mẫu, phân quyền và lưu khách hàng/sức chứa/vệ sinh. Không ghi nhận lỗi JavaScript trong các thao tác kiểm tra hoặc tài nguyên tải thất bại.
- **8/8** kiểm tra đối chứng dashboard/lịch: trạng thái phòng độc lập, ngày và lượt đến, dòng tiền âm, loại giao dịch nội bộ, snapshot doanh thu, công nợ Master Folio sau trả phòng, dữ liệu rỗng và lịch giao nhau/nối tiếp.
- Kiểm tra cú pháp JavaScript và `git diff --check` đạt. Đã mở và xem các ảnh do Edge dựng cho dashboard desktop/mobile, lịch, sơ đồ phòng, đặt phòng, thanh toán và báo cáo.
- Công cụ điều khiển trình duyệt trực tiếp dừng vì chưa hỗ trợ kiểm soát URL trên trình duyệt Windows hiện tại. Phần xác minh giao diện sử dụng kiểm thử Edge headless và ảnh chụp, không tuyên bố đã thao tác thủ công đầy đủ.

Ảnh tham khảo: [Dashboard 1366](screenshots/redesign_overview_1366.png), [Dashboard 1920](screenshots/redesign_overview_1920.png), [Mobile 390](screenshots/redesign_overview_390.png), [Lịch phòng](screenshots/redesign_timeline_1366.png).

---

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
