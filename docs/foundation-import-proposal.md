# Mục 7 — hợp đồng dữ liệu nền cần duyệt

**Cập nhật:** RPC nhập nền của gói 011 đã được duyệt riêng, áp dụng và nhập lô 420 phòng thành công; [biên bản và phạm vi thực](foundation-base420-execution.md). Nội dung dưới ghi lại đề xuất ban đầu trước khi có nguồn/lô cụ thể, không phải trạng thái chờ duyệt hiện tại.

Chỉ chuẩn bị; chưa có RPC nhập danh mục đã được phê duyệt hoặc áp dụng. Không INSERT trực tiếp, không dùng operator làm pool, không cập nhật PrincipalBinding để vượt actor. Các trigger trên RoomType/Room/Service/HotelSettings/BusinessDay không tồn tại ở lần đọc 12/11/2026; điều này không phải quyền tự ghi. Cần kiểm lại trigger trước lô thực tế và dừng nếu có chốt mới.

## Dữ liệu cần người vận hành xác nhận

- Nguồn thật hoặc bộ kiểm thử riêng; batch ID và bằng chứng duyệt nội dung. Không tự đọc browser hoặc gọi SongLamStore để xuất dữ liệu.
- Hạng phòng: mã, tên, diện tích hoặc null, sức chứa chuẩn/tối đa, giường/mô tả hoặc null, hoạt động.
- Phòng: mã/số, hạng tham chiếu, tầng, vệ sinh do người vận hành xác nhận, hoạt động, ghi chú hoặc null. Hiện diện lấy từ Stay; không thêm trường “đang ở” vào nguồn phòng. Block/bảo trì phải là dữ liệu vận hành riêng.
- Cấu hình: tên/địa chỉ/liên hệ, mã thuế hoặc null, tiền tệ, múi giờ, ngày nghiệp vụ, giờ nhận/trả. CHECK SQL hiện hành yêu cầu VND và SE Asia Standard Time; không tự đặt ngày hoặc giờ mặc định.
- Dịch vụ/minibar: danh mục, đơn vị, đơn giá VND nguyên được duyệt; thiếu giá là lỗi, không thay bằng 0. Không nhập tồn kho/tiêu thụ hoặc ghi folio trong lô này.
- Bảng giá, gói giờ, cuối tuần/ngày lễ và phụ thu cần hợp đồng giá riêng; không lấy giá demo làm chính sách thật.

Mẫu nguồn chưa điền: `deploy/foundation-data.example.json`. Công cụ phân tích **không mở kết nối SQL**:

```powershell
node tools/migration/foundation-plan.mjs C:\duong-dan\foundation.json C:\duong-dan\foundation-plan-moi.json
```

Input/output phải là đường dẫn tuyệt đối khác nhau; output tạo bằng wx, không ghi đè nguồn/bản kế hoạch cũ. Có checksum bytes nguồn, đếm từng tập, ánh xạ source ID → natural key và danh sách lỗi có vị trí. Không có new SQL ID vì chưa nhập. Không dùng output planner làm bằng chứng SQL đã đối chiếu. Bảo quản file nguồn vì có thông tin khách sạn nội bộ; không đưa credential, khách hoặc giao dịch vào nguồn này.

## Hợp đồng SQL đề xuất, chưa triển khai

Tên dự kiến: `pms.usp_SeedTestFoundationBatch`, caller bảo trì đã được duyệt riêng, không cấp EXECUTE cho web service. Đề xuất triển khai cụ thể phải được review sau khi có dữ liệu nguồn; chưa có file SQL thực thi cho hợp đồng này và không coi đây là phê duyệt chung.

Input tối thiểu: batch ID, source checksum, JSON danh mục được duyệt, logical/physical target identity. Một transaction và applock cho toàn lô; validate closed objects, FK, CHECK/unique, scope/giới hạn lô và trigger trước ghi. Không chia lô thành chuỗi ghi từng bảng rồi báo thành công một phần. RoomType phải trước Room; BusinessDay phải trước HotelSettings vì WorkingDate có FK tới ngày nghiệp vụ; Service độc lập. Tất cả trong cùng transaction hoặc rollback tất cả; không ghi giá khi chưa có chính sách. Phải kiểm lại FK/index trên đích trước triển khai. Nếu đã có ngày OPEN khác, dừng thay vì tự chốt ngày hoặc đổi WorkingDate; unique index hiện hành chỉ cho một ngày OPEN.

Replay phải kiểm batch/checksum, natural keys và toàn bộ giá trị đã lưu; trả lại old ID → SQL ID đúng, không reset trạng thái, sửa phòng đang dùng hoặc tự ghi đè giá. Muốn lưu receipt/batch checksum bền vững cần xác định bảng/command hợp lệ; **không tự tạo bảng receipt hoặc dùng bảng tài chính làm nơi chứa marker**. Đây là điểm cần duyệt cùng thiết kế SQL cụ thể.

Output: batch, checksum, created/replayed, mapping, số lượng; không có bí mật hoặc số dư tài chính. Đối chiếu từng trường/key từ SQL R1 sau nhập, so tổng phòng từng hạng và ba trạng thái; ghi rõ R1 current-status chưa đủ xác minh block theo khoảng ngày.

## Điều kiện chạy và phục hồi

Chỉ chạy sau khi người dùng chốt nguồn/dữ liệu và duyệt file SQL cụ thể. Kiểm lại đúng .\SQLEXPRESS/SongLamPms_Design, physical GUID/marker, quyền bảo trì hẹp phù hợp, backup mới COPY_ONLY/CHECKSUM và VERIFYONLY; dừng nếu bất kỳ điều kiện nào thất bại. Giữ nguyên tài khoản/dữ liệu ngoài lô.

Lỗi trong transaction phải rollback toàn lô. Sau commit không tự DELETE lô hoặc restore backup đè dữ liệu mới: backup hiện trạng, đối chiếu mọi tham chiếu và giao dịch phát sinh rồi trình phương án hoàn tác riêng. Backup cũ đã VERIFYONLY không đồng nghĩa đã kiểm thử restore.
