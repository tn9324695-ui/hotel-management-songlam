# Runbook cắt chuyển và phục hồi — CHƯA THỰC HIỆN

Không chạy lệnh cấu hình vận hành, SQL/import/restore hoặc cắt chuyển trong phiên viết G12. Không có API tự kích hoạt. Quy trình dưới đây là chỉ dẫn cho người phụ trách thực hiện **sau phê duyệt riêng**, không phải báo cáo đã làm.

## Hồ sơ bắt buộc cho mỗi mốc

Ghi mã phát hành/định danh artifact và hash, người chịu trách nhiệm cụ thể, người duyệt, thời điểm bắt đầu/kết thúc UTC (kèm hiển thị giờ khách sạn), file/link bằng chứng được bảo quản nội bộ và checksum, kết quả PASS/FAIL/NOT_CHECKED, quyết định CONTINUE/STOP. Không có bằng chứng hoặc chưa chạy = NOT_CHECKED/STOP. Role owner trong file mẫu là vị trí phụ trách, phải thay bằng người thực tế trong hồ sơ riêng; không ghi thông tin này vào public endpoint/log.

| Thứ tự | Mốc / người phụ trách | PASS chỉ khi | FAIL / hành động dừng | Hiện tại |
| --- | --- | --- | --- | --- |
| 1 build | Phụ trách phát hành | Artifact bất biến, dependencies/config/route map xác nhận; kiểm thử và nghiệm thu build đúng phiên bản có chứng cứ | Build/hash khác hoặc chưa kiểm thử: STOP | Chưa kiểm tra |
| 2 access | DBA/bảo mật | Auth/password format/session/actor/role và quyền SQL hẹp đã duyệt/kiểm chứng; quyền bị thu hồi có hiệu lực | Chưa duyệt, quyền quá rộng, giả actor: STOP | Chưa kiểm tra |
| 3 target | DBA/chủ hệ thống | Chỉ định đúng server/DB/fingerprint/môi trường, TLS/credential ngoài repo; không dựa tên mặc định | Target không rõ/nhầm môi trường: STOP; không tạo DB mới | Chưa kiểm tra |
| 4 backup | DBA/chủ dữ liệu | SQL backup kiểm checksum/restore thử, snapshot browser trước freeze, kế hoạch phục hồi và owner được duyệt | Backup không phục hồi được hoặc không rõ phạm vi: STOP | Chưa kiểm tra |
| 5 legacyFreeze | Trưởng lễ tân/phát hành | Phê duyệt cửa sổ ngừng; chuyển deployment quản lý sang frozen, chặn truy cập host/bản static cũ; kiểm kê và đóng mọi tab/máy/origin; chờ hết lease; ghi lại giao dịch thủ công ngoài hệ thống | Còn máy ghi/không có xác nhận: STOP; chưa xuất bản cuối | Chưa kiểm tra |
| 6 finalExport | Chủ dữ liệu | Xuất chủ động từng origin hợp lệ bằng G11, immutable manifest/hash/count, phân loại thật/demo/redaction và không nguồn thay đổi sau freeze | Không đủ tất cả nguồn hoặc có ghi sau snapshot: STOP; lấy lại bản cuối theo duyệt | Chưa kiểm tra |
| 7 import | DBA/chủ dữ liệu | Hợp đồng nhập môi trường đích được duyệt riêng; receipt/crosswalk/graph atomic/idempotency đầy đủ, không batch unknown | SQL/importer chưa duyệt, lỗi/timeout chưa rõ commit: STOP, tra receipt | Chưa kiểm tra |
| 8 reconciliation | Kế toán/chủ dữ liệu | Báo cáo G11 PASS: không thiếu/dư/mất liên kết hoặc chênh tiền; bản ghi thật cách ly chưa duyệt không tồn tại; fingerprint đúng target cuối | Chênh 1 VND, orphan, duplicate, loại dữ liệu chưa duyệt: STOP | Chưa kiểm tra |
| 9 roles | Đại diện từng vai trò/bảo mật | Nghiệm thu các luồng trong g12-acceptance trên đúng build/DB; operation evidence riêng; màn chưa đạt khóa | Thiếu luồng bắt buộc hoặc bypass quyền: STOP; không dùng demo thay | Chưa kiểm tra |
| 10 monitoring | Trực vận hành/kế toán | Collector bền vững, receipt lookup, SQL probes, baseline watermark và cảnh báo/stop đa instance kiểm chứng; lịch đối chiếu/tổ trực được duyệt | Chỉ có log console hoặc không phát hiện unknown/ghi kép: STOP | Chưa kiểm tra |
| 11 goLiveApproval | Người có thẩm quyền | Chấp thuận bằng chứng 1–10, phạm vi operation/màn hình, thời điểm bật và kế hoạch rollback riêng | Không có phê duyệt cụ thể: STOP | Chưa kiểm tra |
| 12 bật API | Phát hành + DBA trực | Chỉ người phụ trách đổi PMS_WRITE_MODE=sql/đúng release/build sau duyệt; probe xác minh mới, readonly chuyển write đúng phạm vi, ghi activation marker/watermark bền vững | Không ghi được marker, probe/ready không đạt: vẫn khóa; không thử thu tiền để “kiểm tra” | Chưa kiểm tra |
| 13 theo dõi | Trực vận hành/kế toán | Readback delta đủ phạm vi từ marker, receipt từng giao dịch, balances theo booking/stay/master khớp và kiểm vai trò sau bật; ký biên bản cuối | Có tiền lệch, ghi kép, unknown hoặc mất monitor: khóa ghi toàn deployment | Chưa kiểm tra |

Không tự mặc định hồ sơ G11 diễn tập ở clone là phê duyệt nhập vận hành. Nếu đích thực khác fingerprint/source/release thì cần backup/import/readback/đối chiếu cuối trên đúng đích được duyệt. Không thể vượt mốc bằng cách chỉnh status trong JSON. Runtime kiểm shape/hash/probe, người duyệt chịu trách nhiệm tính xác thực bằng chứng.

## Điều kiện dừng ngay

- Bất kỳ chênh lệch tiền dù tổng toàn hệ thống vẫn khớp; thiếu credit/transfer/deposit link hoặc phí/phát sinh bị trùng.
- Có ghi mới vào localStorage sau thời điểm freeze, browser fallback, hai nguồn ghi cùng hoạt động.
- Không xác định commit, request timeout chưa có receipt cuối, không biết có giao dịch mới từ mốc activation hay không.
- Mất kết nối/session/actor/monitor bền vững, target/build sai, thu hồi quyền không hiệu lực, tài khoản buồng phòng xem được số dư ngoài quyền.

Giữ truy cập tra cứu có quyền; chặn command mới tại deployment/reverse proxy/maintenance theo quy trình được duyệt và ở mọi instance, không chỉ process báo lỗi. Lưu mã yêu cầu/receipt/watermark/log đã che dữ liệu nhạy cảm, thông báo người trực qua kênh được phép; không tự gửi tin từ công cụ. Dừng nghiệp vụ thu/hoàn lặp. Không reset latch/restart để che sự cố. Ghi incident, owner và quyết định phục hồi mới.

## Rollback A — chưa bật API ghi

1. Xác nhận activation marker chưa có và kiểm SQL receipt/journal không có command vận hành mới, không dựa màn hình trống hoặc log Node.
2. Giữ SQL nhập lịch sử và bằng chứng G11 nguyên vẹn. Nếu cần phục hồi môi trường test/đích, DBA trình target/backup/phạm vi và xin duyệt riêng; công cụ không restore/delete.
3. Chủ dữ liệu xác nhận snapshot browser cuối và nguồn thật còn bảo toàn, không mở demo seed/reset. Xử lý mọi giao dịch ghi tay trong thời gian freeze theo quy trình duyệt riêng.
4. Chỉ sau phê duyệt riêng mới khôi phục **đúng nguồn legacy được bảo toàn**. Đóng nguồn API ghi ở tất cả instance trước đó. Ghi biên bản, thời gian, hash và người chịu trách nhiệm. Không tự đổi config ở lượt G12.

## Rollback B — đã bật API nhưng được chứng minh chưa có giao dịch mới

1. Khóa toàn bộ command API, giữ lookup/đọc có quyền; chờ mọi request in-flight kết thúc và tra receipt.
2. DBA lấy snapshot SQL/journal/receipt từ activation watermark đến mốc khóa; chứng minh zero commit, zero pending/unknown ở mọi instance/provider. Không biết hoặc thiếu readback thì **chuyển sang C**, không coi bằng 0.
3. Backup trạng thái SQL hiện tại và toàn bộ evidence. Người có thẩm quyền duyệt quay về legacy cuối, xử lý công việc ngoại tuyến trong cửa sổ ngừng.
4. Thực hiện theo A. Không restore backup cũ chỉ vì chưa nhìn thấy giao dịch trong UI; giữ nguyên journal để điều tra.

## Rollback C — SQL đã có giao dịch mới hoặc chưa xác định được

1. Khóa mọi nguồn ghi và giao dịch tiền mới, giữ read/lookup, ghi activation/stop watermark. Không mở lại localStorage snapshot cũ.
2. Backup SQL hiện tại **bao gồm toàn bộ giao dịch mới**, receipt/source lineage/folio/cọc/thanh toán/ca/ngày; bảo toàn chứng cứ provider và log, không xóa/đảo tiền để giảm chênh.
3. DBA/kế toán đối chiếu từng request và booking/stay/master từ backup cuối qua import đến activation và mọi delta sau đó. Unknown được xử lý bằng receipt/provider evidence, không retry với key mới. Pending ngoài hệ thống không được giả SUCCEEDED.
4. Ưu tiên sửa tiến trên nguồn SQL với kế hoạch được duyệt. Nếu bắt buộc quay về nguồn khác: cần thiết kế xuất/ánh xạ/replay các giao dịch mới **được duyệt riêng**, bảo toàn ID/policy/actor/giá/credits/deposit/ca/ngày, atomic/idempotent và đối chiếu lại đầy đủ trước mở ghi. G12 không có reverse importer và không hứa tự động đồng bộ SQL về Store.
5. Chỉ DBA/người có thẩm quyền mới trình và thực hiện restore sau khi có bản sao mọi giao dịch mới, target được kiểm chứng và phê duyệt cụ thể. Không có lệnh phá hủy/restore tự động trong repo. Không ghi đè giao dịch mới bằng backup cũ.
6. Owner ký biên bản tiền/coverage, người duyệt quyết định giữ đóng/mở lại. Nếu chưa có phương án chuyển delta hợp lệ thì tiếp tục khóa/khắc phục trên SQL, không trở lại demo để bán phòng.

Mọi phục hồi phải giữ phiên bản build/config, ACL và audit; kiểm lại phiên/quyền/múi giờ/ca và các luồng nghiệm thu trước mở lại. Các checklist ở đây chưa có mục nào được đánh dấu đạt.
