# Rà soát repository SongLam PMS — 12/11/2026

**Thực thi sau audit:** mục 1–2 (004r/D1 rồi 001/003) đã hoàn tất trên SQL thật, [receipt](first-two-execution-2026-11-12.md). Vì vậy D1/auth-DDL không còn ở trạng thái chưa áp dụng; các phát hiện runtime/receipt/monitoring, phiên/service principal và SQL nghiệp vụ trong audit vẫn còn. Audit dưới đây giữ nguyên bằng chứng theo thời điểm chạy.

## Kết luận

Repository có frontend demo, frontend API và backend Express G0–G12 ở các mức độ khác nhau. Khung ứng dụng chạy và các bộ kiểm thử độc lập hiện đạt. **Chưa có bằng chứng đăng nhập/đặt phòng/thu tiền/checkout chạy xuyên suốt Browser → API → SQL Server.** Không có cơ sở kết luận hoàn tất 95% hoặc sẵn sàng vận hành.

Điểm cần chỉnh trong đánh giá trước: phần còn thiếu **không chỉ là chạy SQL pending**. Runtime hiện chỉ cho môi trường test, luôn trả `businessWritesEnabled=false`; entrypoint chưa cấp adapter kiểm tra release/receipt/monitoring cho cutover. Vì vậy áp dụng auth/catalog SQL không tự mở các lệnh ghi nghiệp vụ. Đây là phần tích hợp code vận hành còn thiếu, không phải lỗi cần bỏ guard.

## Phạm vi đã kiểm tra

- Đọc git status; giữ nguyên thay đổi cũ, không stage/commit/revert. Nhiều file backend/API/docs hiện còn untracked; diff stat chỉ phản ánh tracked files, không đại diện toàn bộ công việc. Snapshot tại `screenshots/audit/git-status.txt`.
- Kiểm cú pháp toàn bộ JS/MJS first-party trong backend/src, backend/tests, js, tools, database generators; bỏ vendor Tabler/Lucide. Kiểm asset references của 11 HTML gốc và JSON cấu hình không bí mật. Bỏ private/artifacts/node_modules/.git; không đọc credential hoặc localStorage thật.
- Đọc entrypoint/config, runtime/pool/auth/session, routes, gateway contract gates, các service nghiệp vụ, pricing/money/DTO/validation, API clients, session/permission services, migration/cutover; đối chiếu SQL schema/proposal source. Các file SQL pending **chưa được biên dịch/thực thi trong lượt này**.
- Chạy các test Node, Edge fixture/HTTP chưa cấu hình, model và demo Store với profile trình duyệt mới. Chưa đo statement/branch coverage; số test không chứng minh bao phủ toàn bộ trạng thái nghiệp vụ.
- Không kết nối SQL, thay schema/procedure/trigger/quyền, seed/import, đọc hash hoặc đổi nguồn ghi vận hành trong lượt audit này. Hiện trạng SQL/tài khoản nêu dưới dựa trên inventory thật của lượt trước và trạng thái triển khai lưu trong repo, không giả nhận là kiểm tra SQL mới.

## Lỗi code tái hiện và đã sửa

| Mức | Phát hiện | Bằng chứng | Sửa/kiểm lại |
| --- | --- | --- | --- |
| P2 | Restore phiên cũ có thể hồi sinh state sau clear/logout/401; /me và permissions có thể bị trộn khi cookie đổi giữa hai request | Probe fixture trước sửa: REVIEW-SESSION-RACE reproduced=true; không phải bằng chứng vượt quyền backend | `js/services/session-service.js`: generation token, vô hiệu pending khi clear, bỏ response cũ; chỉ task hiện tại được xóa pending; xác nhận lại /me cùng UserId/CSRF trước publish. Hai regression tests cho response cũ và đổi nhân viên, đều đạt |
| P2 | /ready chỉ cập nhật trạng thái SQL connection nhưng giữ nhãn auth/session/catalog pending cố định dù runtime configured | REVIEW-READINESS-DIAGNOSTICS reproduced=true với runtime fixture nhất quán | `backend/src/app.js`: đối chiếu auth runtime và SQL snapshot; báo configured và configured_not_exercised, không coi là login/SQL nghiệp vụ đã thử. /ready vẫn 503 khi cutover chưa đủ; 2 regression tests đạt |
| Test harness | Bộ demo phụ thuộc server 8080; khi chuyển sang Express, inline code của test_runner bị CSP chặn | Lần đầu ERR_CONNECTION_REFUSED; lần test server đầu 0 ca, không báo PASS | `tools/verify/legacy-suite.mjs`: Express test tạm với static allowlist; nonce cho đúng script inline của test page, giữ CSP app thật; chạy lại 18/18 |

Trước/sau: `screenshots/audit/review-probes-before.json` có 2 lỗi reproduced=true; `review-probes.json` sau sửa cả hai false, stale response bị từ chối. Đây là phép thử synthetic, không chứng cứ session SQL thật.

Việc xác nhận /me bổ sung một request cho mỗi restore đầy đủ. Cần đo độ trễ/pool với SQL thật sau triển khai; chưa benchmark tải vận hành.

## Màn hình → backend → SQL và công việc còn lại

| Nhóm | Mã nguồn/đường đi đã có | Phần thực sự đã kiểm | Chưa hoàn tất |
| --- | --- | --- | --- |
| G0–G1 HTTP/static | server → createApp, config, lỗi/request ID, health/readiness/static allowlist | Node/HTTP tests, asset và browser tests | Không dùng health=200 để kết luận database hoặc nghiệp vụ ready |
| G2 login/me/permissions | login.html → client/session → auth routes/runtime → approved SQL adapter + store | Hash formats, phiên/CSRF/revoke/actor bằng fixture; đã sửa race frontend | D1 marker, 001/003, D2-P, 005/D3-P, service runner thật, TLS/epoch, 5 tài khoản SQL, 5 role UI/API thật |
| G3 danh mục | reception-api → catalog routes/service/DTO/gateway → R1 draft | Scope trạng thái phòng được gắn `eligibilityVerified=false`, guards/DTO bằng fixture | 007/007p chưa triển khai. R1 mới chỉ 5 resource; customer search và rate plan/rule/policy không có trong artifact này |
| G4 giá | pricing routes/service/engine, snapshot và early departure | Nightly/hourly, thiếu/xung đột giá, early departure, VND bằng synthetic domain tests | SQL pricing context/calendar/policy hợp lệ chưa nối; không có giá thật để nghiệm thu; không tự đặt tỷ lệ/ngày lễ |
| G5 đặt phòng/quỹ/lịch | booking client → routes/service → prepare/commit gateway, batch/snapshot | Validation giao nhau/giới hạn và timeline UI fixture | SQL giữ quỹ/khóa đồng thời, đoàn nguyên tử, receipt/replay và timeline cần hợp đồng thật. Chưa chứng minh hai nhân viên không đặt trùng qua SQL |
| G6 lưu trú | stays client → service/compiler → gateway, G4 price change | Compiler từ chối phòng sai trạng thái bằng fixture | SQL segment/nhận từng phòng/transfer/extend/shorten nguyên tử chưa kiểm. Nút gia hạn UI vẫn khóa do chưa có preview giá; đơn giờ UI cũng khóa vì thiếu availability theo khung giờ |
| G7 buồng phòng/bảo trì/thất lạc | API pages → operations service/model → gateway | Màn hình blocked/fixture; nghiệm thu không mở khi thiếu quyền | Vòng đời G7 có phase/CAS/history mà source schema cũ chưa cung cấp đầy đủ; inspection authority và ROOM_ELIGIBILITY_V1 chưa có chứng cứ SQL |
| G8 dịch vụ/minibar | clients → consumption service → một command gateway | Validation dòng/giá/biên bản 0đ; UI/receipt fixture | Atomic source→FolioEntry, credit/ref nguyên gốc, chống trùng concurrent và scope quyền phải triển khai/kiểm SQL |
| G9 tiền/checkout | finance page/client → shared finance service/DTO/receipt/gateway | Arithmetic ledger và input/ACK guards, UI fixture | SQL atomic settlement/deposit/master/payment/refund/shift/day còn thiếu chứng cứ. Không có đối chiếu tiền thật hoặc timeout sau commit thật; bank/e-invoice/duyệt hoàn chưa chốt vẫn khóa |
| G10 quản trị/báo cáo | admin-api → management/reports services → gateway; metric definitions rõ | KPI/empty/error/role removal UI fixture | Read contracts chưa triển khai/đối soát. Users/roles hiện read-only, không có CRUD quản trị vận hành; durable exception journal chưa có |
| G11 chuyển dữ liệu | Export/analyze/map/reconcile/import engine + CLI | Unit/fixture rehearsal logic | `tools/migration/sql-adapter.mjs` vẫn THROW `SQL_IMPORT_LOCKED_NO_APPROVED_CONTRACT_OR_REHEARSAL_ADAPTER`; chưa có importer SQL thực hoặc rehearsal đạt |
| G12 vận hành | Config/release/checklists, guards, receipt lookup interface | Write gating, pending journal, unknown outcome bằng fixture | Runtime production, receipt gateway, durable monitoring/reconciliation/live dependency inspector chưa nối ở server entrypoint; chưa cắt chuyển, chưa restore rehearsal |

## Phân biệt nguồn dữ liệu frontend

- `index.html`, `reception.html`, `housekeeping.html` là đường demo, dùng Store/localStorage; không phải SQL thật. Các file app/reception/housekeeping/pms-ui/pms-data thuộc đường này còn được giữ để bảo toàn demo.
- `login.html`, `reception-api.html`, `housekeeping-api.html`, `services-api.html`, `finance-api.html`, `admin-api.html` dùng client/API và backend permissions. Browser tests kiểm không có SongLamStore/fallback giả khi API lỗi. Chúng chưa chạy được dữ liệu SQL nghiệp vụ khi auth/provider chưa sẵn sàng.
- `write-coordinator.js` dùng localStorage để giữ metadata yêu cầu chưa rõ kết quả, không phải ghi bản sao booking/tiền vào cả hai nguồn. Không được gom mọi xuất hiện của từ localStorage thành lỗi ghi kép.
- Không phát hiện ghi kép trong các luồng API đã thử. Chưa chứng minh mọi luồng với SQL thật không ghi kép, chưa audit security bằng công cụ chuyên dụng hoặc test tải.

## Trạng thái SQL/phụ thuộc đọc từ repo

000 đã backup/VERIFYONLY đạt; 004 đã duyệt nhưng chưa thực thi, 004r tạm dừng. Các nhóm 001/003, D2-P, 005/D3-P đã được người dùng yêu cầu thực hiện, không được tiếp tục mô tả như chưa có yêu cầu. Tuy nhiên guard D1 chưa đủ nên chưa áp dụng. 003p/005p/006/007/007p đã có artifact; phần bổ sung cụ thể còn cần review đúng phạm vi trước áp dụng.

Bundle bí mật có 5 người chuẩn bị cục bộ, được ACL bảo vệ; **không đồng nghĩa 5 AppUser SQL đã được tạo**. Theo inventory trước: AppUser=0, RoomType/Room/HotelSettings=0, thiếu auth/session RPC/service principal/marker. Lượt này không đọc lại SQL hoặc credential để đổi các con số đó thành một kiểm chứng mới.

## Lệnh và kết quả lần audit

| Lệnh | Kết quả thực | Giới hạn |
| --- | --- | --- |
| `node tools/verify/repository-audit.mjs` | 192 JS/MJS, 11 HTML, 10 JSON; 0 lỗi cú pháp/reference/parse trong phạm vi kiểm | Không parse SQL/CSS semantics; bỏ 2 vendor JS và private |
| Python `ast.parse` qua các file .py first-party | 6 file, 0 lỗi | Không chạy database test Python |
| `npm.cmd test` trong backend, sau sửa | 131/131, 0 trượt/skip | Fixture/provider/HTTP unit; SQL integration=0 |
| `node --test tests/frontend-services.test.mjs` | 9/9 | Fixture, gồm race và cookie switch mới |
| `node tests/view-data.test.js` | 8/8 | Model dữ liệu demo, không SQL |
| `node --test tests/domain.test.js` trong backend | 11/11, đã nằm trong tổng backend | Không cộng lại vào tổng; pricing/validation/arithmetic/compiler synthetic |
| `node tests/frontend-api.browser.mjs` sau sửa | 67/67 | Edge, HTTP chưa cấu hình và các fixture được gắn nhãn; SQL=0 |
| `node tools/verify/legacy-suite.mjs` | 18/18 | Edge profile riêng, Store demo/localStorage thử |
| `node tools/verify/review-probes.mjs` | Hai lỗi không còn tái hiện sau sửa | Diagnostic fixture, không SQL |
| `git diff --check` | Không lỗi whitespace; cảnh báo LF/CRLF sẵn có của run_suite.py | Không sửa file cũ đó trong lượt này |

Không chạy npm audit/network vulnerability scan, migration/seed hay SQL test. Không đưa credentials/cookie/hash/connection string có mật khẩu vào report.

## Thứ tự nên xử lý tiếp

1. Khép điều kiện D1 theo quyết định người dùng, không tự mở lại 004r.
2. Triển khai/kiểm auth + service principal + session store, import đúng lô 5 người; login/me/permissions thật cho từng role.
3. R1 đọc dữ liệu thật, bổ sung cấu hình/danh mục qua hợp đồng được duyệt; không seed giá/phòng tùy ý.
4. Chốt SQL commands theo mức rủi ro: chống trùng phòng/đoàn nguyên tử → tiền/cọc/master/checkout/idempotency → G7/G8 và báo cáo; chạy concurrency và đối chiếu ledger thật.
5. Hoàn thiện runtime/receipt/monitoring vận hành, G11 adapter/rehearsal và G12 chỉ sau nghiệm thu/phê duyệt. Không bỏ write gate để “cho chạy”.

Không có SQL nào được áp dụng hoặc tiền/booking mới được tạo trong lượt audit này.
