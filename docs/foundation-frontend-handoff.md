# Mục 7–8 — dữ liệu nền và frontend, 12/11/2026

**Trạng thái mới nhất:** gói 011 đã được duyệt và nhập 420 phòng/11 hạng/15 dịch vụ/config/ngày, cách ly 5 phòng. Đối chiếu populated R1 đạt 35 kiểm tra HTTP và 120 kiểm tra browser; 153/153 fixture đạt. Xem [biên bản thực thi 011](foundation-base420-execution.md). Phần bên dưới là bàn giao frontend trước seed; các câu nguồn chưa chọn/chưa có dữ liệu không còn là trạng thái hiện tại.

## Phạm vi thực hiện

Mục 7 chưa nhập: nguồn dữ liệu thật/bộ thử chưa được người dùng chọn, chưa có danh mục/giờ/ngày/giá được chốt và chưa có hợp đồng nhập nền được duyệt. Đã hỏi nguồn dữ liệu trong tác vụ, không tự mở browser của người dùng, xuất SongLamStore hoặc lấy demo làm dữ liệu thật.

Mục 8 đã nối các phần có SQL được duyệt. **Không tuyên bố toàn bộ nghiệp vụ frontend đã chạy SQL**: hiện runtime thật chỉ có auth/session và catalogGateway. Giữ demo cho đường chạy demo; trong frozen các trang cũ chuyển sang trang API, không ghi localStorage. Không bật G12 hoặc ghi nghiệp vụ.

## File và chức năng

| File | Thay đổi |
| --- | --- |
| catalog-api.html, js/pages/catalog-api.js | Màn hình danh mục/cấu hình chỉ đọc, điều hướng theo quyền/khả năng backend, bộ lọc, phân trang, chi tiết, nguồn dữ liệu và request ID; loading/empty/error |
| js/api/catalog-api.js | Dùng HTTP client hiện có; thêm capabilities, hỗ trợ key ngày nghiệp vụ khi đọc chi tiết |
| backend/src/modules/catalog/routes.js, service.js, adapters/sql/catalog-gateway.js | GET /api/v1/catalog/capabilities; G2 xác thực, lọc resource theo quyền server, không lộ tên procedure/approval hoặc cấp quyền mới |
| js/components/workspace.js | Menu danh mục dùng chung; cảnh báo trên buồng phòng/dịch vụ/tài chính/quản trị khi gateway SQL tương ứng chưa cấu hình |
| js/pages/reception-api.js | Chỉ tải nguồn tham chiếu đã được backend cho đọc; khóa lịch/quỹ/khách/bảng giá chưa có hợp đồng; khóa báo giá khi chưa có pricing gateway |
| backend/src/app.js | Cho phép phục vụ catalog-api.html; reception.html ở frozen chuyển tới reception-api.html thay vì trang trạng thái |
| deploy/foundation-data.example.json | Mẫu chưa điền, không có phòng/giá/ngày giả |
| tools/migration/foundation-plan.mjs | CLI phân tích chỉ đọc, checksum nguồn, mapping natural key, kiểm tham chiếu/trùng/tiền/ngày/giờ; output wx, không kết nối hoặc ghi SQL |
| backend/tests/catalog-status-scope.test.js, cutover-boundaries.test.js, foundation-plan.test.js | Kiểm quyền/capability, route legacy và từ chối nguồn thiếu/không hợp lệ |
| tools/verify/staff-sql-browser.mjs | Kiểm 5 vai trò trên danh mục mới và các module bị chặn, desktop/mobile |

Không sửa css/tabler.min.css; tái sử dụng Tabler, layout, component và HTTP/session client hiện có.

## Đối chiếu màn hình → API → SQL

| Màn hình | API/backend | SQL/thực thể | Trạng thái thực tế |
| --- | --- | --- | --- |
| Đăng nhập, menu, logout | auth/* → G2 | AppAuthLookup/AppIdentity + WebSession RPC → AppUser/UserRole/RolePermission/WebSession | Đã chạy SQL thật 5 vai trò; không đổi quyền |
| Danh mục hạng/phòng/dịch vụ | room-types, rooms, services → catalog service/gateway | usp_AppCatalogRead → RoomType/vRoomStatus/Service | SQL thật, rỗng đúng dữ liệu; backend từ chối thiếu quyền |
| Cấu hình/ngày nghiệp vụ | hotel-settings, business-days → catalog | usp_AppCatalogRead → HotelSettings/BusinessDay | List rỗng hoặc singleton 404; không tự tạo cấu hình/ngày |
| Lịch/quỹ/đặt phòng | bookings/* → bookingsGateway | Chưa có hợp đồng gateway được duyệt/nạp | Khóa tab và ghi; R1 phòng không thay thế kiểm tồn theo khoảng ngày |
| Báo giá | pricing/*, rate-plans → pricing/catalog | R1 không hỗ trợ ratePlans/rules/policy; pricingGateway chưa nạp | Chưa khả dụng, không lấy giá demo |
| Lưu trú | stays/* → staysGateway/stayPricingGateway | Chưa có hợp đồng nguyên tử/version/giá được duyệt/nạp | Chưa khả dụng; không check-in/chuyển/gia hạn/trả sớm giả |
| Buồng phòng/bảo trì/thất lạc | housekeeping/*, maintenance/*, lost-found/* → operationsGateway | Chưa có hợp đồng operational/inspection được duyệt/nạp | Cảnh báo rõ, ghi khóa; không nghiệm thu sạch |
| Dịch vụ/minibar vận hành | service-orders/*, minibar-audits/* → consumptionGateway | Chưa có hợp đồng source-line/folio/idempotency được duyệt/nạp | Danh mục dịch vụ R1 đọc được theo quyền; tạo phí/giao/hủy chưa khả dụng |
| Folio/thu/hoàn/checkout/ca | Các API G9 → financeGateway | Thiếu hợp đồng ghi/audit/receipt nguyên tử đã duyệt | Khóa ghi; không giao dịch ngân hàng/hóa đơn điện tử giả |
| Báo cáo/tài khoản/audit | reports/*, users/*, roles/*, audit/* → managementGateway | Thiếu hợp đồng đọc đối soát/quản trị đã duyệt/nạp | Có giao diện và capability từ backend, cảnh báo chưa có SQL; không KPI demo |

002/002b còn chưa áp dụng. Không coi chỉ áp dụng helper actor là đủ để mở nghiệp vụ: mỗi gateway vẫn cần hợp đồng cụ thể, quyền, atomic commit/audit/receipt/idempotency, hạn mức lô và kiểm thử SQL riêng. Chưa có file SQL triển khai tất cả module trên được phê duyệt trong lượt này.

## Kết quả đã chạy

- `npm.cmd test` tại backend: **142/142 fixture đạt**. Không dùng kết quả này để suy ra nghiệp vụ SQL đúng.
- `node tools/sql/staff-catalog-http-check.mjs --approved=USER-20261112-MODULES-5-6`: **57 kiểm tra SQL/HTTP thật đạt**, 5 vai trò.
- `node tools/verify/staff-sql-browser.mjs --approved=USER-20261112-MODULES-5-6`: **102 kiểm tra browser thật đạt**, 5 vai trò; không fixture/interception; không JavaScript exception hoặc tài nguyên lỗi. Kiểm 1366×768, 1920×1080 và 390×844. Đã xem ảnh danh mục 1366 và mobile.
- Planner chạy với mẫu trống: **BLOCKED, 7 vấn đề, sqlWritesEnabled=false** đúng kỳ vọng; không phải nhập thành công. Output private `tools/sql/private/modules-7-8-20261112/empty-template-plan.json`.
- SQL readback: RoomType/Room/Service/HotelSettings/BusinessDay/RatePlan đều 0. Pool PID **12320**, Windows service identity riêng, đúng database, encrypt_option=TRUE. Không thay schema/procedure/trigger/quyền SQL trong lượt 7–8, không nhập dữ liệu nền. Auth tạo/hủy phiên thử qua hợp đồng G2 đã duyệt.

Evidence HTTP/browser: `tools/sql/private/modules-5-6-20261112/http-integration.json` và `screenshots/staff-sql/report.json`; bản chụp receipt lượt này ở `tools/sql/private/modules-7-8-20261112/`. Không lưu mật khẩu/hash/cookie/CSRF vào evidence. Snapshot kiểm thử đồng bộ các file thay đổi; epoch được giữ qua restart.

## Chạy và phần cần quyết định

Mở **http://127.0.0.1:8093/catalog-api.html**, đăng nhập tại `/login.html`. Khi listener đã dừng, dùng launcher service test ở `tools/sql/start-service-test.ps1` theo hướng dẫn mục 3–4; không chạy pool dưới operator metadata. `/ready` vẫn 503 vì chưa nghiệm thu vận hành.

Trước nhập mục 7: chọn nguồn thật hoặc bộ thử riêng → chốt danh mục/cấu hình/giờ/ngày/giá → phân tích JSON bằng planner → review mapping/cách ly và file SQL nhập cụ thể → duyệt hợp đồng/quyền bảo trì/lô → backup/VERIFYONLY mới → nhập thử nguyên tử → đối chiếu R1 từng trường/key. Chi tiết và mẫu trường ở [đề xuất nhập nền](foundation-import-proposal.md).

Không tự sửa bộ dữ liệu localStorage cũ hoặc cắt chuyển nguồn ghi. Các module chưa có hợp đồng trên tiếp tục khóa cho đến khi được duyệt và kiểm thử SQL thật.
