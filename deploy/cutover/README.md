# Cấu hình G12 — mẫu chưa kích hoạt

Không copy đè `.env` đang chạy. Không sửa target hoặc bật mode SQL trong phiên viết G12. `release.example.json` chỉ là hồ sơ trống; tất cả mốc NOT_CHECKED/STOP, không chứa credential, không tự chọn database.

Sau khi được phê duyệt riêng, người phát hành bảo quản release thật ngoài webroot/Git bằng ACL giới hạn, dùng đường dẫn tuyệt đối cho release và các evidence files. Đối chiếu build/target fingerprint, G11 cuối, từng operation và hợp đồng bootstrap đã triển khai. Mode SQL không hoạt động với bootstrap mặc định hiện tại vì thiếu probe/receipt adapter được duyệt và `/ready` còn 503.

Các giá trị **chỉ để trình bày**, không phải lệnh được chạy:

```dotenv
PMS_WRITE_MODE=frozen
PMS_BUILD_ID=<artifact-id-da-xac-minh>
PMS_RELEASE_FILE=<absolute-private-release-file>
```

Khi đủ điều kiện mới trình quyết định chuyển frozen → api-readonly → sql, thời điểm/watermark và phê duyệt từng bước. Không dùng JSON để cấp quyền SQL hoặc sửa dữ liệu. Giữ no-store cho deployment/config/HTML/API ở proxy; không cache các trang mode demo qua CDN/service worker. Chỉ phục vụ danh sách HTML/tài nguyên vận hành đã duyệt, không public root repository, `/tools`, `/docs`, `/database`, `/deploy`, `.env` hoặc trang test. Giới hạn mạng `/internal`; HTTPS/proxy và secure cookie theo G2.

Tham khảo [kiến trúc G12](../../docs/g12-cutover.md), [runbook và rollback](../../docs/g12-runbook.md), [nghiệm thu](../../docs/g12-acceptance.md), [phụ thuộc cần duyệt](../../docs/g12-sql-proposals.md). Không có script activate/restore/delete.
