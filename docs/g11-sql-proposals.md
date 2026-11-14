# G11 — đề xuất hợp đồng nhập lịch sử, CHƯA ĐƯỢC ÁP DỤNG

Đây là tài liệu xin duyệt riêng; không phải migration, không có SQL thực thi. Chưa tìm thấy phê duyệt hợp đồng nhập hoặc môi trường rehearsal trong repository. Chưa xác minh trực tiếp SongLamPms_Design. Không dùng việc yêu cầu viết G11 làm phê duyệt SQL.

`pms.MigrationMap` trong `001_schema.sql` có SourceDataset/SourceCollection/LegacyId/TargetEntity/TargetId/ImportedAtUtc. Khóa chính chứa cả TargetId, nên tự nó không ngăn cùng một nguồn tạo nhiều target khác nhau, không có checksum nguồn/plan/receipt/commit checkpoint hoặc chứng cứ tiền. Các gateway mutation thường phục vụ nghiệp vụ hiện tại, không phải importer lịch sử. Không đi vòng bằng quyền INSERT/SELECT toàn bảng, private mutation hoặc giả session actor.

| Hạng mục cần duyệt | Hợp đồng tối thiểu | Nếu chưa duyệt |
| --- | --- | --- |
| Môi trường riêng | Server/DB kiểm thử đã restore, fingerprint/marker kiểm thử kiểm chứng được, baseline backup và DBA/owner; không chọn DB vận hành | CLI cấm SongLamPms_Design; không kết nối |
| Quyền công cụ nội bộ | Principal hẹp chỉ EXECUTE RPC nhập/đọc verification đã nêu rõ; kho credential ngoài package/log; không db_owner/sysadmin/SELECT toàn bảng | Adapter luôn khóa, không tự cấp quyền |
| Actor | Operator AppUser thật, crosswalk nhân viên lịch sử đã duyệt; audit phân biệt người nhập và nhân viên gốc/source provenance. Không suy từ tên, không đổi PrincipalBinding/SESSION_CONTEXT theo lô | Bản ghi liên quan actor bị cách ly |
| Registry nguồn | Unique batchId gắn SHA-256 source/manifest/plan/aggregate/operator; cùng ID đổi nội dung/actor từ bất kỳ máy nào bị từ chối | Hash local không đủ để mở nhập SQL |
| Nhập aggregate lịch sử | Một RPC nguyên tử cho connected booking/stay/guest/segments/charges/credits/deposits/payments/transfer/master. Giữ thời điểm/trạng thái/policy snapshot, kiểm FK/inventory/source line; không chạy lại thu tiền/check-in/checkout hiện hành | Không nhập tuần tự rồi báo thành công một phần |
| Dữ liệu lịch sử không đầy đủ | Quy tắc walk-in không booking, khách trùng ID khác người, timezone thiếu giờ, nightly snapshot thiếu, group line thiếu; quyết định cách ly/ngoại lệ được duyệt theo từng nguồn | Không tự bịa khách/booking/giá/thời gian hoặc loại bỏ bản ghi thật |
| Sổ tiền/chứng cứ | Mapping từng dòng nguồn tới Payment/DepositMovement/FolioEntry, loại/gốc/credit/transfer pairs, ca/ngày/folio/master, cash evidence và bank/provider evidence xác thực; pending giữ pending | Không coi browser success/gatewayVerified là đã thu, không tạo tiền từ số dư |
| Minibar/dịch vụ | Chốt giá cũ; source-line uniqueness; resolve mirror servicesUsed/itemsUsed; biên bản 0đ; kiểm đúng stay/segment và actor | Không double fee, không tạo phí 0 để “đủ dữ liệu” |
| PII | Phân loại giấy tờ, quốc gia, encryption/HMAC/key-version của CustomerIdentity; hồ sơ redaction/text cần rà soát riêng, chính sách bảo quản dữ liệu | Không ghi plaintext vào NumberCiphertext hoặc hash giả; không nhập trường đã loại |
| Receipt/checkpoint server | Unique batch+ordinal+payload; dữ liệu/crosswalk/receipt/checkpoint commit cùng transaction; rollback toàn batch khi lỗi; replay trả receipt cũ. Timeout đọc lại receipt bằng cùng khóa; unknown phải dừng | Framework chưa nghiệm thu exactly-once, không retry bằng khóa khác |
| Limits/concurrency | Max records/JSON bytes, aggregate scope/khóa, giới hạn thời gian; không split đoàn/graph; isolation/khóa kiểm quan hệ, source identity và chống đè | Aggregate quá giới hạn bị chặn, không import dở dang |
| Crosswalk | Stable source namespace/ID/pointer/hash/component; uniqueness theo mapping cardinality đã duyệt, reuse target chỉ khi xác minh là cùng entity; resolve quan hệ trong transaction | Crosswalk local chỉ là đề xuất/tham chiếu |
| Verification read RPC | Snapshot hoàn chỉnh nhất quán trong đúng run/DB/source/plan, kiểm nội dung/relations/rates, missing/extra, source ledger và target ledger từng booking/stay/master, signed/trusted receipt provenance | Không PASS từ count/total toàn hệ thống hoặc cờ do browser tự khai |
| Restore | DBA duyệt đường dẫn và đúng DB test, fingerprint baseline, quản lý receipt sau restore; không phải chức năng CLI | Không tự restore/xóa/đảo bút toán |

Tên RPC/đối tượng SQL mới, payload chi tiết, thay đổi MigrationMap hay bảng receipt/registry/quarantine và quyền cụ thể **chưa được chốt**. Cần xem định nghĩa đang chạy và giới hạn thật rồi trình DDL/procedure/permission riêng để duyệt; không phát minh tên thủ tục đã tồn tại. Cờ trong JSON không phải chứng cứ phê duyệt.

Sau phê duyệt mới triển khai adapter typed-parameter, aggregate planner và ledger resolver theo đúng hợp đồng; khi được yêu cầu mới viết/chạy kiểm thử lỗi, timeout sau commit, replay, sửa nguồn cùng batch, rollback atomic, hai người nhập đồng thời, mirror fee, PII/log, count/money/relations reconciliation. Chỉ chốt PASS khi mọi bản ghi thật được bao phủ hoặc có ngoại lệ loại bỏ được duyệt và không còn chênh lệch tiền. Không cắt chuyển G12.
