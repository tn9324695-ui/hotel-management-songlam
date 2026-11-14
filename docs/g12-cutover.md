# G12 — chuẩn bị cắt chuyển, CHƯA thực hiện

Cập nhật sau lượt rà soát: frontend login đã nối API G2 có điều kiện và chạy đạt với Express/SQL pool fixture, nhưng server mặc định vẫn chưa có hợp đồng SQL thật. Kết quả độc lập và các lỗi đã sửa tại [báo cáo sau G12](verification-g0-g12.md); không dùng kết quả này để đánh dấu nghiệm thu vận hành hoặc mở cắt chuyển.

Chỉ viết code/cấu hình mẫu/tài liệu. Không viết hoặc chạy kiểm thử, không chạy ứng dụng/trình duyệt/CLI cắt chuyển, không thay `.env` thật, SQL, quyền hoặc localStorage. Không có bằng chứng nghiệm thu vận hành. Không dùng các kết quả kiểm tra G0–G2 hay parse cú pháp G11 làm bằng chứng G12.

Đã đọc cấu hình Express, HTTP client, Store và các module/gateway G0–G10; G11 exporter/plan/reconciliation/importer và tài liệu. Không thấy AGENTS.md trong repo/các thư mục cha đã kiểm tra. Hiện G11 ghi rõ chưa chạy và importer khóa; báo cáo tiền còn coverage UNRESOLVED, nên **chưa đủ điều kiện bắt đầu cắt chuyển thật**. SQL script trên đĩa không phải xác minh SQL đang chạy. Các đề xuất SQL/quyền chưa được coi là đã duyệt.

## Công tắc và chốt bảo vệ

| PMS_WRITE_MODE | localStorage | API nghiệp vụ ghi | Giao diện |
| --- | --- | --- | --- |
| demo (mặc định hiện giữ) | Demo cũ, có kiểm soát lease khi Express phục vụ | Khóa bởi chốt G12 | Giao diện demo hiện hữu; thông báo rõ chưa cắt chuyển |
| frozen | Chặn khởi tạo/chuẩn hóa Store và mọi public method | Khóa | Trang API chỉ đọc; lễ tân chưa nối API chuyển sang trang trạng thái |
| api-readonly | Chặn Store | Khóa | Đọc bằng API/G2 nếu hợp đồng cho phép; không lấy demo khi lỗi |
| sql | Chặn Store | Chỉ mở operation đã duyệt, đủ G11/evidence/probe/receipt, đúng deployment | Các trang API hiện có; module/màn hình chưa nghiệm thu vẫn khóa |

Biến mẫu thêm trong `backend/.env.example`: PMS_WRITE_MODE, PMS_BUILD_ID, PMS_RELEASE_FILE. File mẫu `deploy/cutover/release.example.json` để trống target, mã duyệt và bằng chứng; **không tự chọn database vận hành**. Cấu hình backend G0 hiện vẫn chỉ chấp nhận SQL_DATABASE=SongLamPms_Design, nhưng không kết nối SQL; muốn dùng tên DB khác cần đối chiếu lại các manifest/gateway và duyệt cấu hình tương ứng, không tự đổi qua PostgreSQL hay DB mới.

Không có lệnh/API đổi mode, tạo DB hoặc restore. Người phụ trách chỉ được chỉnh cấu hình triển khai thật và restart theo phê duyệt riêng. File release phải được bảo quản ngoài webroot/Git, ACL hạn chế, đường dẫn tuyệt đối; mọi đường dẫn evidence là file nội bộ. Không chứa credential hoặc dữ liệu khách. BuildId phải là định danh artifact bất biến đã xác minh ngoài quy trình này; điền một chuỗi không chứng minh build đúng.

Release cần PASS theo thứ tự [runbook](g12-runbook.md), mỗi mốc có owner/start/end/evidence/approval/decision; acceptedOperations có operationEvidence riêng cùng cấu trúc. Kiểm report G11 và verification snapshot bằng hash canonical, batch/source/target fingerprint. G11 report được bổ sung `targetSha256`/`targetDatabaseFingerprint` để ràng buộc snapshot đích; báo cáo cũ không đủ ràng buộc cần tạo lại bằng công cụ đã duyệt sau này, không sửa kết quả cũ thành PASS.

Runtime còn yêu cầu probe tin cậy mới trong 15 giây: SQL/session/xác thực/actor/receipt/monitor bền vững, từng operation đã được triển khai đúng, đối chiếu baseline và delta/watermark, không chênh tiền/ghi kép/unknown. `createApp` nhận `cutoverDependencies`/`receiptGateway` từ bootstrap đã duyệt trong tương lai; **server.js hiện không cung cấp**, không đọc module tùy ý từ JSON/CLI. Auth G2 thực tế còn được kiểm lại, không chỉ tin cờ authentication của probe. File release không tự mở được ghi. `/ready` với cấu hình mặc định vẫn 503; chỉ trả 200 trong phạm vi operation đã nghiệm thu khi mọi dependency/auth thực tế và hồ sơ đều đạt, không chỉ vì điền đủ hồ sơ.

## API/trang bổ sung

- `GET /api/v1/deployment`: chỉ mode/build/deployment, writable và danh sách operation/điểm chặn, không trả DB hostname, người dùng hoặc số dư. Danh sách này không thay quyền G2.
- `GET /internal/status`: phiên G2 và quyền `systemConfig` hiện có; kiểm lại quyền qua auth. Proxy phải giới hạn `/internal` theo mạng quản trị; không mở endpoint quản trị đổi mode hay xóa stop latch.
- `POST /api/v1/requests/lookup`: phiên/Origin/CSRF/reject actor, tra cứu receipt chỉ đọc theo actor gốc và quyền hiện tại. Default 503 RECEIPT_CONTRACT_PENDING. Không SQL adapter giả hoặc query vào private gateway. Chỉ trả COMMITTED/REJECTED/PENDING/UNKNOWN + mã receipt/thời điểm, không trả payload/cookie/hash/số dư.
- `operations-status.html`: tải mode, mã chờ trong tab, nhập mã gốc để tra cứu sau khôi phục phiên; không có nút thu lại/hoàn lại hoặc tự tạo idempotency key mới.
- `/js/deployment-config.js` do Express phục vụ không cache, trước Store; bản static trên đĩa chỉ dành demo. Sau chuyển phải chặn host static demo cũ, không để người dùng mở một bản lưu ngoài origin vận hành rồi tiếp tục ghi.

Backend chốt mọi command trước handler; auth/login/logout, báo giá, preview chỉ đọc và lookup không bị nhầm là ghi nghiệp vụ. G2/CSRF/validation/quyền và SQL checks vẫn chạy ở route/service/gateway hiện có. G12 không cấp thêm quyền. Các trường hợp không nhận diện nằm trong trạng thái khóa, không coi là command được phép.

Store guard trước khởi tạo, public methods và persistence; giao diện legacy trên Express được chuyển hướng sang API/status. Script mới lease demo 15s, poll 5s, mất xác minh thì khóa. **Không phải cơ chế khóa toàn cục với tab/code cũ hoặc origin offline**. Không ghi freeze flag vào dữ liệu khách; phải kiểm kê tất cả máy/origin/tab, đóng chúng và có xác nhận trước bản xuất cuối. `test_runner.html`/các trang ngoài danh sách triển khai không phải giao diện vận hành, không được proxy công khai sau chuyển.

## Timeout, gửi lặp và phục hồi phiên

HTTP client không retry/fallback. Trước command ghi, coordinator kiểm mode/operation, lưu metadata mã yêu cầu/khóa/digest body/deployment/thời điểm vào **sessionStorage riêng tab**, không lưu payload tài chính, dữ liệu khách hoặc token. Nếu không giữ được metadata thì khóa ghi. Không ghi song song nghiệp vụ vào localStorage và SQL.

Một tab chỉ có một yêu cầu chưa xác định. Mất mạng/abort/phản hồi sai/thiếu committed=true giữ UNKNOWN, khóa cả gửi lại cùng khóa và tạo yêu cầu mới, hướng sang lookup. Receipt COMMITTED từ SQL cho phép tải lại để xem kết quả gốc; không re-execute. REJECTED phải là kết quả cuối cùng của đúng yêu cầu, không suy từ một 401/404 lần tra cứu. PENDING/UNKNOWN hoặc thiếu quyền/phiên vẫn giữ chờ. Form G7/G8/G9 không còn nút gửi lại khi unknown.

SessionStorage chỉ tồn tại trong tab: đóng tab/mất máy không bảo đảm giữ metadata. Nhật ký/receipt SQL bền vững và hồ sơ sự cố mã gốc là bắt buộc; các tab/máy khác không được coordinator đồng bộ khóa toàn cục. SQL phải chống duplicate theo actor+operation+key và binding payload; monitor phải khóa toàn deployment khi có unknown/ghi kép/chênh tiền. Không dùng sessionStorage hoặc log HTTP làm bằng chứng đã commit. Login UI hiện vẫn báo chưa cấu hình theo G1; nối login thật/khôi phục phiên và nghiệm thu G2 là điều kiện còn thiếu, không mở giả trong G12.

## Giám sát

`/health` chỉ liveness/build, không báo SQL khỏe. Request ID dùng UUID để không nhận chuỗi tên/điện thoại tùy ý vào log. Log G12 chỉ event/code/requestId/operation/deployment, không body/query/cookie/key idempotency/payload/hash mật khẩu. Handler cũ giữ DTO/audit theo actor G2.

Lỗi sau khi đã vào command hoặc mất phản hồi sẽ chốt stop latch trong process; đọc/lookup vẫn cho phép. Probe báo chênh tiền/ghi kép/unknown cũng giữ latch. Không có API tự reset; restart không được coi là đã xử lý sự cố. Counts/latch/log tại Node không bền vững, nên probe yêu cầu durable monitor trước mở SQL; cần dịch vụ lưu sự cố/receipt và đối chiếu các instance theo hợp đồng được duyệt. Log command_response chỉ là đã gửi response, không phải chứng từ commit.

CLI review ngoại tuyến, **chưa chạy**:

```powershell
node tools/cutover/cli.mjs review --release "D:\PMS-private\release.local.json" --baseline "D:\PMS-private\final-g11-report.json" --baseline-target "D:\PMS-private\final-verification.json" --delta "D:\PMS-private\post-switch-readback.json" --out "D:\PMS-private\g12-review-001.json"
```

Không `--delta` thì ghi NOT_CHECKED/FAIL, không tạo bộ số liệu 0. Chỉ đọc file do RPC/readback đã duyệt cung cấp; không truy cập browser/SQL. So baseline hash/fingerprint, watermark/phạm vi, duplicate receipts, opening+signed change=closing theo booking/stay/master/metric, exceptions/count chênh tiền. Không thể chứng minh file phản ánh DB thật chỉ bằng checksum; đầu ra tốt nhất REQUIRES_OPERATOR_APPROVAL, không là lệnh bật ghi hay chứng nhận độc lập. File output phải mới, không ghi đè. Delta cần nguồn và hợp đồng [đề xuất](g12-sql-proposals.md), hiện chưa có.

## File G12

Backend: `modules/cutover/{runtime,operations,routes}.js`, app/server/environment/request-context; `.env.example`. Frontend: deployment config/controller/CSS, write coordinator/HTTP client, status page, ba form API G7–G9, các HTML entry thêm bootstrap. G11 reconcile thêm hash snapshot đích. Cấu hình mẫu/review CLI/.gitignore và bộ tài liệu G12. Không chạy test, không đánh dấu đạt. [Nghiệm thu vai trò/giao diện](g12-acceptance.md) đều đang **chưa kiểm tra**.

`test_runner.html` chỉ thêm dependency bootstrap trước Store để bộ chạy demo cũ không thiếu controller nguồn ghi; không thêm/sửa ca kiểm thử và không chạy bộ kiểm thử.

Rà soát cú pháp bằng `node --check` trên 18 tệp JS/MJS liên quan; không thực thi các module. Đây không phải kiểm thử API/UI/SQL, CLI import/review hoặc nghiệm thu các luồng vận hành.
