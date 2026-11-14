# G3 — code đọc danh mục và các hợp đồng SQL còn chặn

## Phạm vi lượt này

Đã đọc cấu trúc repository, code G0–G2 và tài liệu phê duyệt hiện có. Không tìm thấy AGENTS.md trong checkout/thư mục cha. Không có bằng chứng phê duyệt riêng A1/A2/A3 hoặc hợp đồng đọc ủy quyền actor cho pool website. Tài liệu này là đề xuất, **không phải migration hoặc phê duyệt**.

Chỉ viết code, đọc lại tệp và đối chiếu diff. Theo yêu cầu, không tạo test, không chạy bộ kiểm thử hay khởi động ứng dụng trong lượt G3. Chưa kiểm chứng runtime, kết nối SQL hoặc quyền SQL thật. Không cài thư viện, sửa SQL, nhập dữ liệu hoặc nối frontend.

## API đã đăng ký

Tất cả đường dẫn dưới đây có tiền tố `/api/v1`, dùng GET, qua G2 authenticate → kiểm actor → service → SQL gateway.

| API | Quyền đọc đối chiếu từ script hiện có (OR khi có nhiều quyền) | Query ứng dụng đã có parser, còn phụ thuộc khả năng SQL |
| --- | --- | --- |
| `/room-types`, `/room-types/:id` | viewRoomRack | q, active, offset, limit |
| `/rooms`, `/rooms/:id` | viewRoomRack | q, roomTypeId, floor, occupancyStatus, cleanlinessStatus, exploitationStatus, offset, limit |
| `/services`, `/services/:id` | addServiceOrder hoặc manageHousekeepingTasks | q, category, active, offset, limit |
| `/hotel-settings` | viewRoomRack | Không nhận query; singleton HotelId=1 |
| `/business-days`, `/business-days/:date` | viewDailyRevenue | from, to, status, offset, limit trên danh sách |
| `/business-days/current` | viewDailyRevenue | Không nhận query; cần SQL đọc theo HotelSettings.WorkingDate |
| `/customers`, `/customers/:id` | createBooking hoặc manageCheckOut | q/phone/code, active, offset, limit; danh sách phải có ít nhất một tiêu chí tìm |

Quyền trên lấy từ bảng rule của `pms.usp_ReadResource` trong `006_command_gateway.sql`, không phải quyền mới cấp hoặc kết luận về quyền live. Chưa thay role, quyền hoặc cơ chế G2. Có thể có vai trò cần ngày nghiệp vụ nhưng thiếu viewDailyRevenue; chỉ ghi nhận khoảng trống, không mở rộng quyền để lách lỗi.

Parser giới hạn offset 0–1.000.000, limit mặc định 50, tối đa 200; khách hàng tối đa 50. Chi tiết/singleton/current không nhận bộ lọc hay phân trang. Chỉ chấp nhận tên và kiểu tham số đã định nghĩa. Không nhận quyền/actor do trình duyệt cung cấp. Giới hạn trong manifest đã duyệt có thể thấp hơn; request vượt giới hạn không được tự nới.

## SQL hiện có và giới hạn xác minh

- Đã đọc script `006_command_gateway.sql`: public `pms.usp_Query(@Entity,@Offset,@Limit)` gắn actor qua SQL principal/PrincipalBinding. Nó không có filter, key tra chi tiết, tìm kiếm, total count hoặc delegated actor website. Limit 1–200 trong private reader.
- Reader xuất JSON bằng FOR JSON PATH, đọc nhiều cột nền ngoại trừ PasswordHash/ExternalSubject. Không xem JSON nhiều cột đó là DTO an toàn cho mọi giao diện.
- `002_views_and_inventory.sql` có `vRoomStatus` với StayStatus, CleanStatus và ExploitationStatus riêng. Code G3 dựa trên projection đó; không suy đoán trống là sạch hoặc có thể bán.
- Đây là bằng chứng **từ script**, chưa kiểm tra deployment/database thật trong lượt này. Không gọi public Query trên pool dịch vụ rồi giả actor website, không gọi private helper đang bị DENY, không SELECT bảng nền.

## Hợp đồng R1 đề xuất — đọc theo actor website

Tên thủ tục chính thức chưa xác định. Adapter `createCatalogSqlGateway` yêu cầu manifest từ bootstrap tin cậy, có:

- `approved: true`, `approvalReference` có căn cứ thực tế, database SongLamPms_Design và đúng environment.
- `protocol: songlam.catalog.v1`, `actorMode: app-user-parameter`, procedure thuộc schema pms, không trỏ vào gateway theo principal hoặc private helper cũ.
- `resources` khai báo riêng các key roomTypes/rooms/services/hotelSettings/businessDays/customers: operations được duyệt (list/detail/singleton/current), filters được hỗ trợ, pagination=true cho danh sách và maxLimit tùy chọn.

Hiện repository không cung cấp manifest vận hành, driver hoặc pool thật. Không có biến môi trường tự bật phê duyệt. Việc viết interface này không xác nhận SQL đã hỗ trợ nó.

### Interface tham số dự kiến, chưa phải thủ tục SQL đã có

| Tham số | Nguồn/ý nghĩa |
| --- | --- |
| AppUserId bigint | Context G2 được xác thực; không lấy từ HTTP body/query/header |
| Resource nvarchar(128) | Allowlist nội bộ: RoomType, vRoomStatus, Service, HotelSettings, BusinessDay, Customer |
| Mode varchar(12) | list/detail/singleton/current, phải thuộc capabilities đã duyệt |
| RecordKey nvarchar(40) | ID nguyên dương chính xác hoặc ngày YYYY-MM-DD; chỉ dùng cho detail |
| Offset/Limit int | Đầu vào đã kiểm tra giới hạn |
| FiltersJson nvarchar(max) | JSON gồm các filter đã duyệt; không phải chuỗi SQL |
| RequestId nvarchar(80) | Mã theo dõi request, không chứa credential hoặc cookie |

SQL cần kiểm lại AppUser active, quyền role active và phạm vi resource tại thời điểm đọc. Mỗi lời gọi dùng request mới trên pool; không lưu actor trong connection, không đổi PrincipalBinding/SESSION_CONTEXT hoặc EXECUTE AS/REVERT qua request rời. Chỉ EXECUTE hợp đồng hẹp cho principal dịch vụ; không db_owner/sysadmin hoặc SELECT toàn bảng.

### Output và ngữ nghĩa cần duyệt

1. Recordset đầu là các dòng projection của resource. Không dùng output JSON tự do của Query cũ thay cho protocol này. Các cột cần cho DTO phải hiện diện; sai schema trả 502 thay vì tự tạo giá trị mặc định.
2. ID bigint/decimal VND phải giữ chính xác (chuỗi khi vượt khả năng biểu diễn an toàn của JavaScript); ngày trả YYYY-MM-DD, giờ HH:mm:ss; timestamp đóng ngày UTC. Không đoán múi giờ từ Date driver hoặc lấy ngày hệ điều hành làm ngày nghiệp vụ.
3. Danh sách có thể có recordset metadata chứa tối đa một dòng TotalCount/HasMore; nếu SQL không cung cấp thì API trả null cho thông tin đó, không đoán tổng số từ số dòng trang. Phân trang/lọc cần ordering ổn định và count nhất quán với filter/quyền.
4. Chi tiết trả 0–1 dòng đúng key. HotelSettings singleton phải là HotelId=1. Current business day phải đọc đúng WorkingDate hiện hành của HotelSettings trong SQL, không dùng ngày hôm nay hoặc tự chọn ngày OPEN mới nhất. Không có dữ liệu trả 404, không seed hoặc tạo ngày mới.
5. Tìm khách hàng cần search server-side theo q/phone/code được duyệt, scope quyền, giới hạn kết quả và chính sách xử lý LIKE/wildcard/collation rõ ràng. Không tải mọi khách hàng về Node rồi lọc một trang. Chưa có hợp đồng search/detail trong Query cũ.
6. DTO khách hàng chỉ gồm id, code, fullName, phone và active; không đọc/trả CustomerIdentity, số giấy tờ, ngày sinh, địa chỉ, ghi chú hoặc lịch sử lưu trú. Nếu cần thêm trường phải xét lại mục đích/quyền.
7. BusinessDay chỉ trả date/status/closedAtUtc; loại SnapshotJson, số thu/hoàn/doanh thu/công nợ khỏi API dữ liệu nền. HotelSettings loại TaxCode/RowVer. Mọi DTO được tạo bằng danh sách trường cụ thể, không spread dòng SQL.

DTO phòng trả độc lập:

- occupancyStatus: VACANT/OCCUPIED từ StayStatus.
- cleanlinessStatus: CLEAN/DIRTY/CLEANING/INSPECTING từ CleanStatus.
- exploitationStatus: ACTIVE/INACTIVE/MAINTENANCE từ ExploitationStatus.

Không tạo isAvailable hoặc suy ra khoảng phòng đặt; lịch đặt/phân phòng không thuộc G3.

## Trạng thái lỗi và các điểm bị chặn

| Trường hợp | Phản hồi trong code |
| --- | --- |
| G2 chưa có hợp đồng xác thực/kho phiên | 503 AUTH_NOT_CONFIGURED, trước khi gọi gateway G3 |
| G2 đã sẵn sàng nhưng không có phiên hợp lệ | 401 UNAUTHENTICATED |
| Actor không có quyền đọc resource | 403 FORBIDDEN |
| Chưa có manifest/hợp đồng đọc được duyệt | 503 READ_CONTRACT_NOT_APPROVED |
| Hợp đồng không hỗ trợ thao tác hoặc phân trang yêu cầu | 501 READ_OPERATION_NOT_SUPPORTED |
| Bộ lọc hợp lệ về cú pháp nhưng SQL chưa hỗ trợ | 400 READ_FILTER_NOT_SUPPORTED |
| Sai tham số/ID/ngày hoặc query không cho phép | 400 VALIDATION_ERROR |
| SQL đã trả kết quả hợp lệ nhưng không có đối tượng | 404 RESOURCE_NOT_FOUND |
| SQL trả sai schema, sai key hoặc metadata mâu thuẫn | 502 SQL_RESPONSE_INVALID |
| SQL từ chối quyền EXECUTE/đọc | 403 SQL_READ_FORBIDDEN |
| Pool chưa kết nối/lỗi SQL | 503 SQL_READ_UNAVAILABLE |
| Đọc SQL quá hạn | 504 SQL_READ_TIMEOUT, cancel request, không tự retry |

**Chưa có API G3 nào được xác nhận hoạt động với SQL thật.** Đã hoàn thiện route, service, validation, DTO và adapter có tham số. Tất cả endpoint còn chờ G2 vận hành và R1/quyền đọc được phê duyệt; search/detail/current còn cần ngữ nghĩa SQL tương ứng.

## Việc cần phê duyệt riêng

| Mục | Đề xuất | Nếu chưa duyệt |
| --- | --- | --- |
| R1 | Hợp đồng delegated read, signature/output/capabilities, chỉ định môi trường kiểm thử | Các API G3 tiếp tục bị chặn, không dùng Query cũ thay thế |
| R2 | Search/detail khách hàng, bộ lọc/phân trang/count ở SQL và projection ít dữ liệu | Không tìm hoặc tra chi tiết bằng cách quét/lọc trên Node |
| R3 | Current business day và cấu hình singleton đúng WorkingDate | Không tự chọn ngày hoặc tạo cấu hình |
| Quyền | EXECUTE tối thiểu cho tài khoản dịch vụ; rà soát khoảng trống viewDailyRevenue nếu có | Giữ ma trận hiện tại, trả thiếu quyền thay vì cấp thêm |
| Phụ thuộc G2 | A1/A2/A3, verifier theo hash thật, kho phiên và cấu hình pool | Không có đăng nhập website vận hành hoặc actor đọc tin cậy |

Không có thay đổi SQL/quyền/dữ liệu nào đã thực hiện trong G3. Không có dữ liệu giả, fallback localStorage, đồng bộ kép, endpoint ghi hoặc thay đổi frontend.

## Tệp tạo/sửa trong G3

- Tạo `backend/src/modules/catalog/resources.js`, `validation.js`, `dto.js`, `service.js`, `routes.js`.
- Tạo `backend/src/adapters/sql/catalog-gateway.js`.
- Sửa `backend/src/app.js` để đăng ký route và dependency, `backend/src/server.js` và `backend/src/modules/status/readiness.js` để ghi nhận G3 và dependency đọc còn thiếu.
- Bổ sung tài liệu này, cập nhật `backend/README.md` và đầu `README.md`.
- Không thay đổi các tệp xác thực G2, các tệp frontend, `database/`, package/dependency hoặc bộ kiểm thử. Các chỉnh sửa có sẵn từ các lượt trước vẫn được giữ.

Đã rà soát tĩnh và chạy `git diff --check`, không có lỗi whitespace (Git có cảnh báo LF/CRLF của các tệp đã có). Không chạy syntax checker, test hoặc ứng dụng; không coi rà soát tĩnh là nghiệm thu runtime.
