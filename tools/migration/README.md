# G11 — công cụ diễn tập chuyển dữ liệu SongLam PMS

**Chỉ dùng nội bộ, Node.js >=22, không cần cài thư viện.** G11 chưa kết nối SQL, chưa nhập/đối chiếu dữ liệu thật, chưa kiểm thử. Không có API import, không có lệnh tạo DB, khôi phục DB hoặc cắt chuyển G12. Không sửa frontend/nguồn ghi hiện hành.

## Căn cứ và giới hạn

- Đọc `js/data.js`, `js/store.js`, các script SQL trong repository và tài liệu G2/G8/G9/G10. Không tìm thấy AGENTS.md tại repo/các đường dẫn cha đã kiểm tra. Không đọc database đang chạy hoặc dữ liệu trình duyệt của người dùng.
- Key đã xác minh trong mã: `songlam_hotel_pms_data_v2`; Store ghi version `2.1.0`. `INITIAL_DATA` tự ghi rõ dữ liệu học phần minh họa. **Chưa xác định key trong trình duyệt hiện chứa bao nhiêu dữ liệu thật/demo.** Không gọi Store để xuất: khởi tạo Store có thể ghi/chuẩn hóa nguồn.
- Script `001_schema.sql` có `pms.MigrationMap`; chưa thấy hợp đồng nhập lịch sử trong `004_business_contract.sql`/`006_command_gateway.sql` hoặc phê duyệt riêng trong docs. Sự tồn tại MigrationMap không chứng minh nhập nguyên tử/idempotent. Chưa xác minh schema/quyền SQL đang triển khai.
- `sql-adapter.mjs` luôn từ chối. Chỉnh JSON, thêm cờ hoặc ghi chữ “approved” không mở SQL. Cần duyệt và triển khai adapter/RPC riêng sau này. Bộ phân tích tạo **ánh xạ nháp**, không tạo payload được phép ghi SQL.

## 1. Người vận hành chủ động xuất

1. Mở đúng website/origin chứa dữ liệu cần bảo toàn. Không mở ứng dụng mới để tạo demo rồi coi là dữ liệu thật.
2. Đọc `browser-export.js`, dán nội dung vào DevTools. Thao tác này chỉ định nghĩa hàm; chưa đọc localStorage.
3. Chủ động chạy `await SongLamMigrationExport()` và xác nhận hộp thoại. Hàm chỉ `getItem` đúng một key. Không gọi SongLamStore, không đọc cookie/sessionStorage/key khác, không ghi/xóa localStorage, không gửi mạng.
4. Lưu file `songlam-export-<UUID>.json` vào thư mục riêng, không ghi đè file cũ. Trình duyệt quyết định nơi tải/tên khi trùng; mỗi lần xuất tạo UUID mới. Không đổi batchId để né xung đột nguồn.

Bản xuất là **snapshot đã lọc**, không phải bản JSON nguyên văn chứa bí mật. Mật khẩu/hash/token/session/credential và dữ liệu thẻ/payload thanh toán không được xuất theo bộ lọc tên trường; văn bản tự do và trường chưa biết bị giữ lại khỏi bản xuất. Các vị trí bị giữ lại có trong `manifest.redactions`; trường chưa biết giữ vị trí/count bằng null. Dữ liệu khách được phép giữ (tên/liên lạc/giấy tờ) vẫn là dữ liệu nhạy cảm. Người vận hành phải rà soát nội dung trước khi chuyển giao vì giá trị nhập vào trường tên/liên lạc có thể là văn bản bất kỳ. Không đưa bí mật vào trường nghiệp vụ.

Manifest chứa UUID lô, thời điểm UTC, version nguồn hoặc UNKNOWN, origin (không URL/query), inventory gốc, count/checksum từng tập đã xuất, SHA-256 của chuỗi gốc và JSON chuẩn hóa sau lọc. Checksum gốc chỉ để nhận dạng, không lưu lại bản gốc có bí mật. SHA-256 phát hiện thay đổi, **không phải chữ ký hay chứng cứ tính xác thực của browser**. Không thể tự khôi phục trường đã loại từ snapshot; cần quy trình xem xét bằng nguồn chứng cứ riêng an toàn. Mọi vị trí loại bỏ đều cản nhập tự động.

Không tự sửa snapshot để “làm sạch” lỗi. Giữ file tải xuống bất biến, bản sao dự phòng, manifest và lịch sử duyệt riêng. Có thể đặt quyền chỉ đọc/WORM theo quy trình đơn vị; code dùng create-new, không tự thay ACL của máy.

## 2. CLI ngoại tuyến

Các lệnh sau **chưa được chạy trong lượt G11**, chỉ là hướng dẫn. Chạy tại thư mục gốc repo, thay đường dẫn bằng nơi được phép lưu dữ liệu. Các thư mục `tools/migration/private/` và `artifacts/` đã bị loại khỏi Git; khuyến nghị dùng ổ mã hóa ngoài repository, quyền NTFS giới hạn người phụ trách. Node mode 0600/0700 không thay thế ACL Windows. Không tải dữ liệu khách lên Git, chat công cộng, dịch vụ phân tích hoặc log CI.

```powershell
node tools/migration/cli.mjs unpack --package "D:\PMS-private\songlam-export-UUID.json" --out "D:\PMS-private\batch-UUID"
node tools/migration/cli.mjs analyze --source "D:\PMS-private\batch-UUID\source.json" --manifest "D:\PMS-private\batch-UUID\manifest.json" --out "D:\PMS-private\analysis-UUID-01"
```

`unpack` kiểm checksum/coverage rồi tạo `source.json`, `manifest.json`, `package-integrity.json`. File/thư mục tồn tại sẽ bị từ chối, kể cả output dở dang. Lỗi giữa chừng giữ lại phần đã tạo để điều tra; dùng thư mục output mới, không xóa/ghi đè nguồn.

`analyze` tạo:

- `plan.json`: inventory gồm bản ghi gốc/nested, sourceRef băm từ JSON pointer, sourceHash, entity/field mapping nháp, trạng thái/lý do và tiền quan sát. Không chạy mã `js/data.js` hoặc `js/store.js`.
- `review-template.json`: phân loại UNKNOWN/REAL/DEMO và nơi ghi mã phê duyệt, chứng cứ tiền, ánh xạ nhân viên. Tạo bản review mới, không chỉnh snapshot.
- `crosswalk-template.json`: sourceIndex với old ID, pointer, parent và hash; entries chứa ID đích **chỉ sau khi đã xác minh**. Không tự tạo ID SQL. Không gộp khách theo tên/điện thoại. Dòng không có ID dùng pointer bất biến trong đúng lô nguồn; reorder/thay nội dung nguồn là nguồn khác.
- `quarantine.json`: vị trí và lý do cách ly; không loại bỏ record lỗi để báo thành công.
- `preflight-reconciliation.json`: FAIL khi chưa có readback SQL/chưa đầy đủ ánh xạ và sổ tiền. Đây không phải kết quả đã nhập.

Phân loại từng bản ghi và nested riêng. DEMO cần mã duyệt; REAL cũng cần mã xác nhận. Cùng mã khách demo nhưng khác thông tin khách ở là xung đột, không tự hợp nhất. `--baseline <source.json>` chỉ so fingerprint chính xác với một baseline JSON đã được người vận hành duyệt/xuất cùng cách; kết quả chỉ là gợi ý. Không đọc/eval INITIAL_DATA để biến nó thành dữ liệu thật. Chưa có baseline đáng tin thì demoHint = NOT_ESTABLISHED.

Entry crosswalk (nằm trong file riêng, gắn batchId/sourceSha256):

```json
{
  "sourceRef": "src:<pointer-sha256>",
  "sourceHash": "<record-sha256>",
  "targetEntity": "Room",
  "component": "room",
  "targetId": "<verified-positive-SQL-ID>",
  "approvalReference": "<review-ticket>"
}
```

Một nguồn có thể sinh nhiều thành phần đích; component phải ổn định theo hợp đồng duyệt. Không chia roomQuantity thành nhiều dòng bằng phỏng đoán. Chạy lại analyze bằng `--review`, `--crosswalk` vào thư mục mới; mã duyệt không tự giải quyết thiếu nghiệp vụ, không nâng QUARANTINED thành IMPORT_READY. Bản plan có timestamp/checksum riêng: resume phải dùng nguyên plan, không chạy analyze lại rồi thay plan giữa lô.

## 3. Nhập thử — đang khóa

```powershell
node tools/migration/cli.mjs import --environment rehearsal --config "D:\PMS-private\rehearsal.local.json" --source "D:\PMS-private\batch-UUID\source.json" --manifest "D:\PMS-private\batch-UUID\manifest.json" --plan "D:\PMS-private\analysis-UUID-01\plan.json" --aggregates "D:\PMS-private\approved-aggregates.json" --checkpoints "D:\PMS-private\checkpoints-UUID"
```

Không chạy lệnh này trước phê duyệt/backup môi trường kiểm thử. `rehearsal.example.json` không chứa bí mật, không mặc định server/actor. Từ chối DB vận hành `SongLamPms_Design` và tên DB không có rehearsal/test/sandbox. Tên DB và testOnly chưa đủ chứng minh là môi trường test: adapter tương lai phải xác minh fingerprint/marker server và bản restore. Công cụ không tự tạo bản clone.

Ngay cả cấu hình đủ trường, adapter hiện tại vẫn ném `SQL_IMPORT_LOCKED_NO_APPROVED_CONTRACT_OR_REHEARSAL_ADAPTER`; không tải driver, không kết nối SQL. Cần hoàn thiện hợp đồng, mapping lịch sử, ledger và adapter đã duyệt trước khi có plan IMPORT_READY. Không mở bằng cách tự sửa blockers/plan hash.

`lib/import-engine.mjs` là khung chưa nối: kiểm giới hạn server cho **toàn bộ aggregate nguyên tử** trước ghi, không chia đoàn/sổ tiền; đăng ký binding nguồn/plan/aggregate và operator; đọc receipt cũ theo batch+ordinal; SQL phải commit dữ liệu/crosswalk/receipt/checkpoint cùng transaction. Nhật ký local chỉ ghi hash/count/trạng thái, create-new; checkpoint local không phải bằng chứng commit.

Timeout sau commit: đọc receipt đúng khóa/nội dung, trả kết quả cũ; không sinh khóa mới/thu lại tiền. Nếu không xác định commit thì dừng, không sang batch tiếp. Receipt registry phía SQL phải phát hiện cùng batchId nhưng đổi nguồn/plan/payload trên mọi máy, không chỉ dựa file local. Khi SQL rollback một batch, batch trước đã commit vẫn giữ và resume bằng receipts; không hứa rollback toàn bộ đợt nhiều transaction.

## 4. Đối chiếu

```powershell
node tools/migration/cli.mjs reconcile --plan "D:\PMS-private\analysis-UUID-01\plan.json" --target "D:\PMS-private\verification-UUID.json" --out "D:\PMS-private\reconcile-UUID-01"
```

Không có `--target` cũng tạo báo cáo FAIL nêu thiếu snapshot. Exit code: 0 tác vụ ngoại tuyến hoàn tất (analyze không đồng nghĩa nghiệp vụ đạt); 1 bị chặn/lỗi; 2 đối chiếu FAIL. Stdout/stderr không in record, đường dẫn, lỗi SQL hoặc stack.

Snapshot đích đề xuất, **chưa có RPC được duyệt để sinh**: format `songlam-migration-verification/1`, batchId/sourceSha256/planSha256, environment=rehearsal, databaseFingerprint, approvalReference, readContractVersion, complete=true, `records[]` và `money[]`. Phải đọc nhất quán toàn bộ phạm vi nhập, không ghép một trang list API G3/G9 thành toàn sổ. Hiện không tự tạo snapshot đích rỗng để báo đạt.

Mỗi record đích: sourceRef, sourceHash, targetEntity, component, targetId, relationshipsVerified, valuesVerified. Hai cờ verified phải do RPC đối chiếu nội dung/quan hệ sinh, không lấy từ browser. Mỗi dòng tiền: scopeKind BOOKING/STAY/MASTER, scopeSourceRef, sourceRef, metric, component, amountVnd chuỗi nguyên. RPC phải xác nhận line linkage, reversal/transfer pairs và snapshot giá, không chỉ kiểm ID/count.

So cả bản ghi thiếu/dư/thay ID/nội dung/quan hệ và từng dòng tiền, sau đó tổng riêng từng booking/stay/master/metric. Chênh lệch bù trừ nhau vẫn FAIL. Thiếu tiền là null/chưa xác định, không coi bằng 0. Báo cáo nêu sourceRef/pointer để người được phép tìm đúng nguồn; không in tên/giấy tờ. Quan sát số dư cũ không được cộng thành các giao dịch mới. **Code hiện luôn giữ blocker hợp đồng nhập và coverage tiền UNRESOLVED, vì vậy chưa thể có PASS hợp lệ.**

## 5. Backup, khôi phục và bảo quản

Trước nhập thật vào test: DBA xác định DB nguồn/đích và owner; duyệt quyền hẹp, nơi lưu backup, khóa mã hóa và thời gian lưu; backup SQL bằng quy trình đã duyệt (COPY_ONLY/CHECKSUM khi phù hợp), kiểm tra backup và phục hồi thử vào **đích kiểm thử riêng**. Ghi fingerprint bản restore và biên bản backup vào cấu hình. Không chạy install/seed/upgrade trong repository để “chuẩn bị” một DB đang có dữ liệu.

Backup cả snapshot/manifest, review/chứng cứ, crosswalk, plan/aggregate đã duyệt, checkpoint và readback cùng version bộ công cụ. Giữ chuỗi kiểm soát bàn giao; chứng cứ ngân hàng không đặt vào log hoặc snapshot browser. Chỉ tham chiếu mã hồ sơ nội bộ được cấp quyền xem.

Nếu diễn tập sai: dừng importer, giữ mọi bằng chứng và receipt; DBA xem phạm vi đã commit, xác nhận DB kiểm thử/đích restore chính xác và phê duyệt khôi phục riêng. Phục hồi lại baseline đã kiểm chứng hoặc tạo môi trường test khác theo quy trình DBA; không xóa dòng tiền/crosswalk hoặc tự chạy DELETE/rollback bù. Sau restore, fingerprint/receipts thay đổi: không dùng checkpoint cũ cho DB mới nếu chưa có kế hoạch duyệt lại. Công cụ **không có lệnh restore/delete**.

Điều kiện trước diễn tập: [đề xuất SQL G11](../../docs/g11-sql-proposals.md); [ma trận mapping và trạng thái](../../docs/g11-migration.md). G12 không nằm trong phạm vi.
