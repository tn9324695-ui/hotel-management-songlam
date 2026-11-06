/**
 * DỮ LIỆU MINH HỌA HỆ THỐNG QUẢN LÝ KHÁCH SẠN SÔNG LAM
 * Tham khảo nghiệp vụ và hạng phòng: Mường Thanh Luxury Sông Lam (TP. Vinh, Nghệ An)
 * Lưu ý: Đây là dữ liệu minh họa phục vụ đồ án "Phân tích và thiết kế hệ thống quản lý khách sạn",
 * không phải dữ liệu vận hành thực tế của khách sạn Mường Thanh Luxury Sông Lam.
 */

const INITIAL_DATA = {
  hotelInfo: {
    name: "Khách sạn Sông Lam",
    brandReference: "Mường Thanh Luxury Sông Lam",
    address: "Số 13 đường Quang Trung, Phường Quang Trung, TP. Vinh, Tỉnh Nghệ An",
    phone: "0238 3737 666",
    email: "info@songlamhotel.vn",
    taxCode: "Mã số thuế mô phỏng đồ án",
    taxDisclaimer: "Bản mô phỏng học phần, chưa kết nối hệ thống hóa đơn điện tử cơ quan thuế",
    currency: "VNĐ",
    workingDate: "2026-10-25"
  },

  // 10 hạng phòng chuẩn theo cấu trúc Mường Thanh Luxury Sông Lam với diện tích đã thống nhất
  // Lưu ý: Các thông số sức chứa, giá và tiện nghi là dữ liệu giả định phục vụ mô phỏng đồ án.
  roomClasses: [
    {
      id: "SUP-K",
      code: "SUP-K",
      name: "Superior King",
      area: 24,
      standardOccupancy: 2,
      maxOccupancy: 3,
      bedConfig: "1 Giường đôi lớn (King 2.0m x 2.0m)",
      basePrice: 1200000,
      weekendPrice: 1400000,
      holidayPrice: 1700000,
      amenities: ["Điều hòa trung tâm", "Smart TV", "Minibar", "Két an toàn", "Bồn tắm đứng", "Máy sấy tóc", "Wifi"],
      description: "Hạng phòng Superior King diện tích 24 m² (Dữ liệu cấu hình và tiện nghi mô phỏng đồ án).",
      status: "active"
    },
    {
      id: "DLX-T",
      code: "DLX-T",
      name: "Deluxe Twin",
      area: 34,
      standardOccupancy: 2,
      maxOccupancy: 3,
      bedConfig: "2 Giường đơn (Twin 1.2m x 2.0m)",
      basePrice: 1350000,
      weekendPrice: 1550000,
      holidayPrice: 1850000,
      amenities: ["Điều hòa trung tâm", "Smart TV", "Bàn làm việc", "Minibar", "Két sắt", "Phòng tắm riêng", "Áo choàng"],
      description: "Hạng phòng Deluxe Twin diện tích 34 m² (Dữ liệu cấu hình và tiện nghi mô phỏng đồ án).",
      status: "active"
    },
    {
      id: "PRM-K",
      code: "PRM-K",
      name: "Premium Deluxe King",
      area: 43,
      standardOccupancy: 2,
      maxOccupancy: 3,
      bedConfig: "1 Giường King lớn",
      basePrice: 1650000,
      weekendPrice: 1850000,
      holidayPrice: 2200000,
      amenities: ["Điều hòa", "Smart TV", "Bồn tắm nằm", "Minibar", "Két an toàn"],
      description: "Hạng phòng Premium Deluxe King diện tích 43 m² (Dữ liệu cấu hình và tiện nghi mô phỏng đồ án).",
      status: "active"
    },
    {
      id: "PRM-T",
      code: "PRM-T",
      name: "Premium Deluxe Twin",
      area: 43,
      standardOccupancy: 2,
      maxOccupancy: 3,
      bedConfig: "2 Giường đơn",
      basePrice: 1650000,
      weekendPrice: 1850000,
      holidayPrice: 2200000,
      amenities: ["Điều hòa", "Smart TV", "Bồn tắm", "Bàn làm việc", "Két an toàn"],
      description: "Hạng phòng Premium Deluxe Twin diện tích 43 m² (Dữ liệu cấu hình và tiện nghi mô phỏng đồ án).",
      status: "active"
    },
    {
      id: "JUN-S",
      code: "JUN-S",
      name: "Junior Suite",
      area: 48,
      standardOccupancy: 2,
      maxOccupancy: 3,
      bedConfig: "1 Giường King + Khu vực tiếp khách",
      basePrice: 2400000,
      weekendPrice: 2700000,
      holidayPrice: 3200000,
      amenities: ["Phòng ngủ & tiếp khách", "Sofa", "Bồn tắm", "Quầy minibar", "Wifi"],
      description: "Hạng phòng Junior Suite diện tích 48 m² (Dữ liệu cấu hình và tiện nghi mô phỏng đồ án).",
      status: "active"
    },
    {
      id: "CLB-S",
      code: "CLB-S",
      name: "Club Suite",
      area: 55,
      standardOccupancy: 2,
      maxOccupancy: 4,
      bedConfig: "1 Giường Super King + Khu vực tiếp khách riêng",
      basePrice: 3100000,
      weekendPrice: 3500000,
      holidayPrice: 4200000,
      amenities: ["Phòng khách riêng", "Bàn ăn", "Phòng tắm lớn", "Minibar", "Két sắt"],
      description: "Hạng phòng Club Suite diện tích 55 m² (Dữ liệu cấu hình và tiện nghi mô phỏng đồ án).",
      status: "active"
    },
    {
      id: "EXE-S",
      code: "EXE-S",
      name: "Executive Suite",
      area: 68,
      standardOccupancy: 2,
      maxOccupancy: 4,
      bedConfig: "1 Giường Super King + Phòng khách & bàn làm việc",
      basePrice: 4200000,
      weekendPrice: 4700000,
      holidayPrice: 5500000,
      amenities: ["Phòng khách", "Khu làm việc", "Bồn tắm lớn", "Minibar", "Két sắt"],
      description: "Hạng phòng Executive Suite diện tích 68 m² (Dữ liệu cấu hình và tiện nghi mô phỏng đồ án).",
      status: "active"
    },
    {
      id: "GRD-S",
      code: "GRD-S",
      name: "Grand Suite",
      area: 80,
      standardOccupancy: 4,
      maxOccupancy: 5,
      bedConfig: "Không gian suite lớn với khu vực ngủ và tiếp khách",
      basePrice: 5800000,
      weekendPrice: 6500000,
      holidayPrice: 7600000,
      amenities: ["Phòng sinh hoạt rộng", "Bàn ăn gia đình", "Phòng tắm lớn", "Minibar", "Két an toàn"],
      description: "Hạng phòng Grand Suite diện tích 80 m² (Dữ liệu cấu hình và tiện nghi mô phỏng đồ án).",
      status: "active"
    },
    {
      id: "ROY-S",
      code: "ROY-S",
      name: "Royal Suite",
      area: 102,
      standardOccupancy: 4,
      maxOccupancy: 6,
      bedConfig: "Không gian Royal Suite với khu vực ngủ và tiếp khách cao cấp",
      basePrice: 8900000,
      weekendPrice: 9900000,
      holidayPrice: 11500000,
      amenities: ["Phòng khách sang trọng", "Bàn tiếp khách", "Phòng tắm cao cấp", "Minibar", "Két sắt"],
      description: "Hạng phòng Royal Suite diện tích 102 m² (Dữ liệu cấu hình và tiện nghi mô phỏng đồ án).",
      status: "active"
    },
    {
      id: "PRS-S",
      code: "PRS-S",
      name: "Presidential Suite",
      area: 325,
      standardOccupancy: 4,
      maxOccupancy: 6,
      bedConfig: "Không gian Presidential Suite đa chức năng",
      basePrice: 18000000,
      weekendPrice: 20000000,
      holidayPrice: 24000000,
      amenities: ["Phòng tiếp khách lớn", "Phòng họp/làm việc", "Phòng ăn", "Phòng tắm cao cấp", "Minibar VIP"],
      description: "Hạng phòng Presidential Suite diện tích 325 m² (Dữ liệu cấu hình và tiện nghi mô phỏng đồ án).",
      status: "active"
    }
  ],

  // Danh mục phòng thực tế (42 phòng phân bổ từ tầng 4 đến tầng 15)
  // Các trạng thái:
  // - stayStatus: 'vacant' (Trống) | 'occupied' (Đang có khách)
  // - cleanStatus: 'clean' (Sạch) | 'dirty' (Chờ dọn) | 'cleaning' (Đang dọn) | 'inspecting' (Chờ kiểm tra)
  // - exploitationStatus: 'active' (Hoạt động) | 'maintenance' (Tạm khóa / bảo trì)
  rooms: [
    // TẦNG 4
    { id: "401", number: "401", floor: 4, classCode: "SUP-K", stayStatus: "occupied", cleanStatus: "clean", exploitationStatus: "active", currentStayId: "LT-20261024-01", notes: "Khách VIP thường niên" },
    { id: "402", number: "402", floor: 4, classCode: "SUP-K", stayStatus: "vacant", cleanStatus: "clean", exploitationStatus: "active", currentStayId: null, notes: "Sẵn sàng đón khách" },
    { id: "403", number: "403", floor: 4, classCode: "DLX-T", stayStatus: "vacant", cleanStatus: "dirty", exploitationStatus: "active", currentStayId: null, notes: "Khách trả phòng lúc 11:30" },
    { id: "404", number: "404", floor: 4, classCode: "DLX-T", stayStatus: "occupied", cleanStatus: "clean", exploitationStatus: "active", currentStayId: "LT-20261025-02", notes: "Khách đề nghị không làm phiền trước 10:00" },
    { id: "405", number: "405", floor: 4, classCode: "SUP-K", stayStatus: "vacant", cleanStatus: "cleaning", exploitationStatus: "active", currentStayId: null, notes: "Nhân viên Mai đang dọn" },
    { id: "406", number: "406", floor: 4, classCode: "DLX-T", stayStatus: "vacant", cleanStatus: "inspecting", exploitationStatus: "active", currentStayId: null, notes: "Chờ giám sát kiểm tra sau tổng vệ sinh" },
    { id: "407", number: "407", floor: 4, classCode: "SUP-K", stayStatus: "vacant", cleanStatus: "dirty", exploitationStatus: "maintenance", currentStayId: null, notes: "Hỏng vòi xịt vệ sinh, đang chờ linh kiện thay thế" },

    // TẦNG 5
    { id: "501", number: "501", floor: 5, classCode: "SUP-K", stayStatus: "occupied", cleanStatus: "clean", exploitationStatus: "active", currentStayId: "LT-20261024-03", notes: "Gia đình có trẻ nhỏ" },
    { id: "502", number: "502", floor: 5, classCode: "SUP-K", stayStatus: "occupied", cleanStatus: "clean", exploitationStatus: "active", currentStayId: "LT-20261025-04", notes: "Khách đi công tác Tập đoàn Dầu khí" },
    { id: "503", number: "503", floor: 5, classCode: "DLX-T", stayStatus: "occupied", cleanStatus: "clean", exploitationStatus: "active", currentStayId: "LT-20261023-05", notes: "Đoàn kỹ sư Nhật Bản" },
    { id: "504", number: "504", floor: 5, classCode: "DLX-T", stayStatus: "vacant", cleanStatus: "clean", exploitationStatus: "active", currentStayId: null, notes: "Phòng thoáng, view đẹp" },
    { id: "505", number: "505", floor: 5, classCode: "PRM-K", stayStatus: "vacant", cleanStatus: "clean", exploitationStatus: "active", currentStayId: null, notes: "Sẵn sàng đón khách" },
    { id: "506", number: "506", floor: 5, classCode: "PRM-T", stayStatus: "occupied", cleanStatus: "clean", exploitationStatus: "active", currentStayId: "LT-20261024-06", notes: "Đã yêu cầu thêm 1 nôi trẻ em" },

    // TẦNG 6
    { id: "601", number: "601", floor: 6, classCode: "PRM-K", stayStatus: "occupied", cleanStatus: "clean", exploitationStatus: "active", currentStayId: "LT-20261025-07", notes: "Khách trăng mật - Setup hoa tươi" },
    { id: "602", number: "602", floor: 6, classCode: "PRM-K", stayStatus: "vacant", cleanStatus: "clean", exploitationStatus: "active", currentStayId: null, notes: "Sẵn sàng đón khách" },
    { id: "603", number: "603", floor: 6, classCode: "PRM-T", stayStatus: "occupied", cleanStatus: "clean", exploitationStatus: "active", currentStayId: "LT-20261024-08", notes: "Khách đoàn VinFast" },
    { id: "604", number: "604", floor: 6, classCode: "PRM-T", stayStatus: "vacant", cleanStatus: "dirty", exploitationStatus: "active", currentStayId: null, notes: "Khách vừa check-out lúc 12:15" },
    { id: "605", number: "605", floor: 6, classCode: "JUN-S", stayStatus: "occupied", cleanStatus: "clean", exploitationStatus: "active", currentStayId: "LT-20261024-09", notes: "Khách thanh toán trước toàn bộ" },
    { id: "606", number: "606", floor: 6, classCode: "JUN-S", stayStatus: "vacant", cleanStatus: "cleaning", exploitationStatus: "active", currentStayId: null, notes: "Đang hút bụi thảm" },

    // TẦNG 7
    { id: "701", number: "701", floor: 7, classCode: "PRM-K", stayStatus: "occupied", cleanStatus: "clean", exploitationStatus: "active", currentStayId: "LT-20261025-10", notes: "Khách nhận phòng trễ 18:00" },
    { id: "702", number: "702", floor: 7, classCode: "PRM-K", stayStatus: "vacant", cleanStatus: "clean", exploitationStatus: "active", currentStayId: null, notes: "Sẵn sàng đón khách" },
    { id: "703", number: "703", floor: 7, classCode: "PRM-T", stayStatus: "vacant", cleanStatus: "clean", exploitationStatus: "active", currentStayId: null, notes: "Sẵn sàng đón khách" },
    { id: "704", number: "704", floor: 7, classCode: "JUN-S", stayStatus: "occupied", cleanStatus: "clean", exploitationStatus: "active", currentStayId: "LT-20261024-11", notes: "Khách quen - Yêu cầu gối lông vũ" },
    { id: "705", number: "705", floor: 7, classCode: "JUN-S", stayStatus: "vacant", cleanStatus: "dirty", exploitationStatus: "active", currentStayId: null, notes: "Chờ dọn sau tiệc sinh nhật nhỏ" },
    { id: "706", number: "706", floor: 7, classCode: "CLB-S", stayStatus: "occupied", cleanStatus: "clean", exploitationStatus: "active", currentStayId: "LT-20261023-12", notes: "Hội viên Kim Cương Mường Thanh" },

    // TẦNG 8
    { id: "801", number: "801", floor: 8, classCode: "CLB-S", stayStatus: "vacant", cleanStatus: "clean", exploitationStatus: "active", currentStayId: null, notes: "Phòng VIP đón tiếp khách dự kiến chiều nay" },
    { id: "802", number: "802", floor: 8, classCode: "CLB-S", stayStatus: "occupied", cleanStatus: "clean", exploitationStatus: "active", currentStayId: "LT-20261025-13", notes: "Khách chuyên gia giáo dục" },
    { id: "803", number: "803", floor: 8, classCode: "EXE-S", stayStatus: "occupied", cleanStatus: "clean", exploitationStatus: "active", currentStayId: "LT-20261024-14", notes: "Lãnh đạo đối tác Ngân hàng BIDV" },
    { id: "804", number: "804", floor: 8, classCode: "EXE-S", stayStatus: "vacant", cleanStatus: "clean", exploitationStatus: "active", currentStayId: null, notes: "Sẵn sàng đón tiếp" },
    { id: "805", number: "805", floor: 8, classCode: "GRD-S", stayStatus: "occupied", cleanStatus: "clean", exploitationStatus: "active", currentStayId: "LT-20261023-15", notes: "Gia đình doanh nhân Hà Nội 5 người" },
    { id: "806", number: "806", floor: 8, classCode: "GRD-S", stayStatus: "vacant", cleanStatus: "dirty", exploitationStatus: "maintenance", currentStayId: null, notes: "Bảo dưỡng điều hòa trung tâm tầng 8" },

    // TẦNG 10
    { id: "1001", number: "1001", floor: 10, classCode: "EXE-S", stayStatus: "vacant", cleanStatus: "clean", exploitationStatus: "active", currentStayId: null, notes: "Sẵn sàng đón khách" },
    { id: "1002", number: "1002", floor: 10, classCode: "EXE-S", stayStatus: "occupied", cleanStatus: "clean", exploitationStatus: "active", currentStayId: "LT-20261025-16", notes: "Khách lưu trú dài hạn 10 ngày" },
    { id: "1003", number: "1003", floor: 10, classCode: "GRD-S", stayStatus: "vacant", cleanStatus: "clean", exploitationStatus: "active", currentStayId: null, notes: "Sẵn sàng đón khách" },
    { id: "1004", number: "1004", floor: 10, classCode: "ROY-S", stayStatus: "occupied", cleanStatus: "clean", exploitationStatus: "active", currentStayId: "LT-20261024-17", notes: "Khách nghệ sĩ biểu diễn tại TP Vinh" },

    // TẦNG 12
    { id: "1201", number: "1201", floor: 12, classCode: "ROY-S", stayStatus: "vacant", cleanStatus: "clean", exploitationStatus: "active", currentStayId: null, notes: "Căn hộ hoàng gia sẵn sàng" },
    { id: "1202", number: "1202", floor: 12, classCode: "ROY-S", stayStatus: "occupied", cleanStatus: "clean", exploitationStatus: "active", currentStayId: "LT-20261025-18", notes: "Đoàn ngoại giao quá cảnh" },
    { id: "1203", number: "1203", floor: 12, classCode: "ROY-S", stayStatus: "vacant", cleanStatus: "dirty", exploitationStatus: "active", currentStayId: null, notes: "Chờ kiểm tra sau bảo dưỡng sàn gỗ" },

    // TẦNG 14 & 15 (TẦNG ĐỈNH CAO VIP)
    { id: "1401", number: "1401", floor: 14, classCode: "ROY-S", stayStatus: "occupied", cleanStatus: "clean", exploitationStatus: "active", currentStayId: "LT-20261024-19", notes: "Khách mời danh dự hội thảo kinh tế miền Trung" },
    { id: "1402", number: "1402", floor: 14, classCode: "PRS-S", stayStatus: "vacant", cleanStatus: "clean", exploitationStatus: "active", currentStayId: null, notes: "Phòng Tổng Thống Đông - Chuẩn bị đón đoàn khảo sát quốc tế" },
    { id: "1501", number: "1501", floor: 15, classCode: "PRS-S", stayStatus: "occupied", cleanStatus: "clean", exploitationStatus: "active", currentStayId: "LT-20261025-20", notes: "Phòng Tổng Thống Tây - Khách Chủ tịch Tập đoàn Tài chính" }
  ],

  // Danh mục lưu trú hiện tại (In-house Stays)
  stays: [
    {
      id: "LT-20261024-01",
      bookingId: "DP-20261020-001",
      roomNumber: "401",
      roomClassCode: "SUP-K",
      guest: {
        id: "KH-001",
        name: "Nguyễn Văn Hùng",
        phone: "0912 345 678",
        identityCard: "040089001234",
        email: "hung.nguyen@vietsov.vn",
        address: "Hà Nội"
      },
      companions: [
        { name: "Phạm Thị Thảo", identityCard: "040192005678", relation: "Vợ" }
      ],
      checkInDate: "2026-10-24 14:15",
      expectedCheckOutDate: "2026-10-26 12:00",
      actualCheckOutDate: null,
      roomRate: 1200000,
      nights: 2,
      depositAmount: 1200000,
      guaranteeDeposit: 500000, // Khoản đảm bảo (không tự động tính vào tiền đã thu)
      status: "in_house", // 'in_house' | 'checked_out'
      servicesUsed: [
        { serviceId: "DV-01", name: "Minibar - Nước ngọt & Bia", quantity: 3, unitPrice: 35000, amount: 105000, orderTime: "2026-10-24 21:00" },
        { serviceId: "DV-03", name: "Giặt là cao cấp (Áo sơ mi + Quần tây)", quantity: 2, unitPrice: 70000, amount: 140000, orderTime: "2026-10-25 08:30" }
      ],
      surcharges: [],
      discount: 0,
      notes: "Cần hóa đơn VAT xuất về Tổng công ty Dầu khí"
    },
    {
      id: "LT-20261025-02",
      bookingId: "DP-20261022-004",
      roomNumber: "404",
      roomClassCode: "DLX-T",
      guest: {
        id: "KH-002",
        name: "Lê Hoàng Long",
        phone: "0983 456 789",
        identityCard: "038095009876",
        email: "long.le@techcombank.com.vn",
        address: "TP. Hồ Chí Minh"
      },
      companions: [
        { name: "Nguyễn Minh Đức", identityCard: "038096001122", relation: "Đồng nghiệp" }
      ],
      checkInDate: "2026-10-25 09:30",
      expectedCheckOutDate: "2026-10-27 12:00",
      actualCheckOutDate: null,
      roomRate: 1350000,
      nights: 2,
      depositAmount: 1500000,
      guaranteeDeposit: 0,
      status: "in_house",
      servicesUsed: [
        { serviceId: "DV-06", name: "Ăn sáng gọi thêm tại phòng (Phở bò Sông Lam)", quantity: 2, unitPrice: 120000, amount: 240000, orderTime: "2026-10-25 10:00" }
      ],
      surcharges: [
        { name: "Phụ thu nhận phòng sớm trước 10h (50% giá phòng)", amount: 675000 }
      ],
      discount: 0,
      notes: "Nhận phòng sớm ca sáng"
    },
    {
      id: "LT-20261024-03",
      bookingId: "DP-20261021-008",
      roomNumber: "501",
      roomClassCode: "SUP-K",
      guest: {
        id: "KH-003",
        name: "Hoàng Thị Mai Lan",
        phone: "0904 112 233",
        identityCard: "001188004567",
        email: "lan.hoang@gmail.com",
        address: "Hải Phòng"
      },
      companions: [
        { name: "Đoàn Quốc Tuấn", identityCard: "001186007890", relation: "Chồng" },
        { name: "Đoàn Bảo Nam", identityCard: "Trẻ em (5 tuổi)", relation: "Con" }
      ],
      checkInDate: "2026-10-24 15:00",
      expectedCheckOutDate: "2026-10-25 12:00", // Khách sắp trả phòng hôm nay
      actualCheckOutDate: null,
      roomRate: 1200000,
      nights: 1,
      depositAmount: 1200000,
      guaranteeDeposit: 0,
      status: "in_house",
      servicesUsed: [
        { serviceId: "DV-02", name: "Minibar - Hạt điều & Snack", quantity: 2, unitPrice: 45000, amount: 90000, orderTime: "2026-10-24 20:15" }
      ],
      surcharges: [],
      discount: 50000,
      notes: "Dự kiến trả phòng lúc 11:45 để ra sân bay Vinh"
    },
    {
      id: "LT-20261025-04",
      bookingId: "DP-20261024-012",
      roomNumber: "502",
      roomClassCode: "SUP-K",
      guest: {
        id: "KH-004",
        name: "Đặng Quang Huy",
        phone: "0977 889 900",
        identityCard: "031092003344",
        email: "huy.dang@petrovietnam.com.vn",
        address: "Vũng Tàu"
      },
      companions: [],
      checkInDate: "2026-10-25 13:00",
      expectedCheckOutDate: "2026-10-28 12:00",
      actualCheckOutDate: null,
      roomRate: 1200000,
      nights: 3,
      depositAmount: 2000000,
      guaranteeDeposit: 1000000,
      status: "in_house",
      servicesUsed: [],
      surcharges: [],
      discount: 0,
      notes: "Khách đi công tác 3 đêm"
    },
    {
      id: "LT-20261023-05",
      bookingId: "DP-20261019-015",
      roomNumber: "503",
      roomClassCode: "DLX-T",
      guest: {
        id: "KH-005",
        name: "Kenji Sato",
        phone: "+81 90 1234 5678",
        identityCard: "Passport TK9988776",
        email: "sato.kenji@jica-project.org",
        address: "Tokyo, Japan"
      },
      companions: [
        { name: "Takashi Tanaka", identityCard: "Passport TK1122334", relation: "Đồng nghiệp" }
      ],
      checkInDate: "2026-10-23 16:20",
      expectedCheckOutDate: "2026-10-26 12:00",
      actualCheckOutDate: null,
      roomRate: 1350000,
      nights: 3,
      depositAmount: 4050000,
      guaranteeDeposit: 2000000,
      status: "in_house",
      servicesUsed: [
        { serviceId: "DV-03", name: "Giặt là cao cấp", quantity: 5, unitPrice: 65000, amount: 325000, orderTime: "2026-10-24 09:00" },
        { serviceId: "DV-04", name: "Sen Spa Massage trị liệu 60p", quantity: 2, unitPrice: 450000, amount: 900000, orderTime: "2026-10-24 19:30" }
      ],
      surcharges: [],
      discount: 0,
      notes: "Yêu cầu phục vụ nhân viên giao tiếp tiếng Anh"
    },
    {
      id: "LT-20261024-06",
      bookingId: "DP-20261020-019",
      roomNumber: "506",
      roomClassCode: "PRM-T",
      guest: {
        id: "KH-006",
        name: "Trần Bảo Ngọc",
        phone: "0918 776 655",
        identityCard: "042194002233",
        email: "ngoc.tran@vietjetair.com",
        address: "Đà Nẵng"
      },
      companions: [
        { name: "Vũ Hải Đăng", identityCard: "042192004455", relation: "Chồng" }
      ],
      checkInDate: "2026-10-24 14:00",
      expectedCheckOutDate: "2026-10-25 12:00", // Khách sắp trả phòng
      actualCheckOutDate: null,
      roomRate: 1650000,
      nights: 1,
      depositAmount: 1650000,
      guaranteeDeposit: 0,
      status: "in_house",
      servicesUsed: [],
      surcharges: [],
      discount: 0,
      notes: "Khách đang thu dọn hành lý chuẩn bị thanh toán"
    },
    {
      id: "LT-20261025-07",
      bookingId: "DP-20261022-021",
      roomNumber: "601",
      roomClassCode: "PRM-K",
      guest: {
        id: "KH-007",
        name: "Ngô Trí Dũng",
        phone: "0936 999 888",
        identityCard: "038097004411",
        email: "dungngo@gmail.com",
        address: "TP. Vinh, Nghệ An"
      },
      companions: [
        { name: "Chu Bích Phương", identityCard: "038198006622", relation: "Vợ" }
      ],
      checkInDate: "2026-10-25 14:00",
      expectedCheckOutDate: "2026-10-27 12:00",
      actualCheckOutDate: null,
      roomRate: 1650000,
      nights: 2,
      depositAmount: 1650000,
      guaranteeDeposit: 1000000,
      status: "in_house",
      servicesUsed: [
        { serviceId: "DV-07", name: "Rượu vang Chile cao cấp tại phòng", quantity: 1, unitPrice: 850000, amount: 850000, orderTime: "2026-10-25 16:30" }
      ],
      surcharges: [],
      discount: 0,
      notes: "Kỷ niệm ngày cưới, tặng bánh kem nhỏ"
    },
    {
      id: "LT-20261024-08",
      bookingId: "DP-20261021-025",
      roomNumber: "603",
      roomClassCode: "PRM-T",
      guest: {
        id: "KH-008",
        name: "Bùi Văn Nam",
        phone: "0962 114 477",
        identityCard: "034091005599",
        email: "nam.bv@vinfast.vn",
        address: "Hải Phòng"
      },
      companions: [
        { name: "Trịnh Quang Vinh", identityCard: "034093006688", relation: "Đồng nghiệp" }
      ],
      checkInDate: "2026-10-24 16:00",
      expectedCheckOutDate: "2026-10-26 12:00",
      actualCheckOutDate: null,
      roomRate: 1650000,
      nights: 2,
      depositAmount: 2000000,
      guaranteeDeposit: 0,
      status: "in_house",
      servicesUsed: [
        { serviceId: "DV-01", name: "Minibar", quantity: 4, unitPrice: 35000, amount: 140000, orderTime: "2026-10-24 22:00" }
      ],
      surcharges: [],
      discount: 0,
      notes: "Đoàn VinFast công tác tại showroom Vinh"
    },
    {
      id: "LT-20261024-09",
      bookingId: "DP-20261020-030",
      roomNumber: "605",
      roomClassCode: "JUN-S",
      guest: {
        id: "KH-009",
        name: "Võ Thị Quỳnh Như",
        phone: "0945 332 211",
        identityCard: "040190008899",
        email: "nhu.vo@goldenstar.vn",
        address: "Hà Nội"
      },
      companions: [],
      checkInDate: "2026-10-24 14:30",
      expectedCheckOutDate: "2026-10-27 12:00",
      actualCheckOutDate: null,
      roomRate: 2400000,
      nights: 3,
      depositAmount: 5000000,
      guaranteeDeposit: 1500000,
      status: "in_house",
      servicesUsed: [
        { serviceId: "DV-04", name: "Sen Spa - Trị liệu body tinh dầu", quantity: 1, unitPrice: 550000, amount: 550000, orderTime: "2026-10-25 15:00" }
      ],
      surcharges: [],
      discount: 0,
      notes: "Khách lưu trú công vụ dài ngày"
    },
    {
      id: "LT-20261025-10",
      bookingId: "DP-20261023-033",
      roomNumber: "701",
      roomClassCode: "PRM-K",
      guest: {
        id: "KH-010",
        name: "Lâm Đình Trọng",
        phone: "0915 223 344",
        identityCard: "001087002233",
        email: "trong.lam@mbpath.com",
        address: "Hà Nội"
      },
      companions: [],
      checkInDate: "2026-10-25 17:30",
      expectedCheckOutDate: "2026-10-27 12:00",
      actualCheckOutDate: null,
      roomRate: 1650000,
      nights: 2,
      depositAmount: 1650000,
      guaranteeDeposit: 0,
      status: "in_house",
      servicesUsed: [],
      surcharges: [],
      discount: 0,
      notes: "Khách vừa hoàn tất thủ tục nhận phòng"
    },
    {
      id: "LT-20261024-11",
      bookingId: "DP-20261018-038",
      roomNumber: "704",
      roomClassCode: "JUN-S",
      guest: {
        id: "KH-011",
        name: "Nguyễn Hải Yến",
        phone: "0989 667 788",
        identityCard: "038191007744",
        email: "yen.nguyen@vinhinvest.com",
        address: "Nghệ An"
      },
      companions: [
        { name: "Nguyễn Tùng Lâm", identityCard: "038090001155", relation: "Chồng" }
      ],
      checkInDate: "2026-10-24 15:15",
      expectedCheckOutDate: "2026-10-25 13:30", // Sắp check-out
      actualCheckOutDate: null,
      roomRate: 2400000,
      nights: 1,
      depositAmount: 2400000,
      guaranteeDeposit: 0,
      status: "in_house",
      servicesUsed: [
        { serviceId: "DV-05", name: "Đưa đón sân bay Vinh (xe 7 chỗ Fortuner)", quantity: 1, unitPrice: 350000, amount: 350000, orderTime: "2026-10-25 14:00" }
      ],
      surcharges: [
        { name: "Phụ thu trả phòng muộn sau 12h (30% giá phòng)", amount: 720000 }
      ],
      discount: 0,
      notes: "Đã đăng ký xe tiễn sân bay lúc 14h00"
    },
    {
      id: "LT-20261023-12",
      bookingId: "DP-20261017-041",
      roomNumber: "706",
      roomClassCode: "CLB-S",
      guest: {
        id: "KH-012",
        name: "Đoàn Minh Khang",
        phone: "0903 884 411",
        identityCard: "079080003322",
        email: "khang.doan@saigontourist.vn",
        address: "TP. Hồ Chí Minh"
      },
      companions: [
        { name: "Lê Mỹ Dung", identityCard: "079184005511", relation: "Vợ" }
      ],
      checkInDate: "2026-10-23 18:00",
      expectedCheckOutDate: "2026-10-26 12:00",
      actualCheckOutDate: null,
      roomRate: 3100000,
      nights: 3,
      depositAmount: 6000000,
      guaranteeDeposit: 2000000,
      status: "in_house",
      servicesUsed: [
        { serviceId: "DV-08", name: "Set menu Á cao cấp tại Nhà hàng Cung Đình", quantity: 2, unitPrice: 650000, amount: 1300000, orderTime: "2026-10-24 19:00" }
      ],
      surcharges: [],
      discount: 300000,
      notes: "Hội viên Kim Cương Mường Thanh (giảm 10% dịch vụ ẩm thực)"
    },
    {
      id: "LT-20261025-13",
      bookingId: "DP-20261022-045",
      roomNumber: "802",
      roomClassCode: "CLB-S",
      guest: {
        id: "KH-013",
        name: "PGS.TS Nguyễn Trọng Nghĩa",
        phone: "0913 204 555",
        identityCard: "001068001199",
        email: "nghia.nt@vnu.edu.vn",
        address: "Hà Nội"
      },
      companions: [],
      checkInDate: "2026-10-25 11:00",
      expectedCheckOutDate: "2026-10-28 12:00",
      actualCheckOutDate: null,
      roomRate: 3100000,
      nights: 3,
      depositAmount: 4000000,
      guaranteeDeposit: 1500000,
      status: "in_house",
      servicesUsed: [],
      surcharges: [],
      discount: 0,
      notes: "Bàn làm việc cần bổ sung văn phòng phẩm & đèn đọc sách"
    },
    {
      id: "LT-20261024-14",
      bookingId: "DP-20261019-048",
      roomNumber: "803",
      roomClassCode: "EXE-S",
      guest: {
        id: "KH-014",
        name: "Phan Đình Thắng",
        phone: "0988 555 444",
        identityCard: "038085002288",
        email: "thang.pd@bidv.com.vn",
        address: "Hà Nội"
      },
      companions: [
        { name: "Phan Tuấn Kiệt", identityCard: "038092003311", relation: "Trợ lý" }
      ],
      checkInDate: "2026-10-24 14:00",
      expectedCheckOutDate: "2026-10-26 12:00",
      actualCheckOutDate: null,
      roomRate: 4200000,
      nights: 2,
      depositAmount: 5000000,
      guaranteeDeposit: 3000000,
      status: "in_house",
      servicesUsed: [
        { serviceId: "DV-09", name: "Sử dụng phòng họp nhỏ tầng 8 (2 giờ)", quantity: 2, unitPrice: 500000, amount: 1000000, orderTime: "2026-10-25 09:00" }
      ],
      surcharges: [],
      discount: 0,
      notes: "Lãnh đạo Ngân hàng BIDV làm việc với UBND tỉnh"
    },
    {
      id: "LT-20261023-15",
      bookingId: "DP-20261016-052",
      roomNumber: "805",
      roomClassCode: "GRD-S",
      guest: {
        id: "KH-015",
        name: "Đỗ Gia Huy",
        phone: "0908 777 666",
        identityCard: "001083009944",
        email: "huy.do@geleximco.vn",
        address: "Hà Nội"
      },
      companions: [
        { name: "Tạ Thu Thủy", identityCard: "001185003366", relation: "Vợ" },
        { name: "Đỗ Gia Khang", identityCard: "Học sinh (12 tuổi)", relation: "Con" },
        { name: "Đỗ Linh Đan", identityCard: "Trẻ em (7 tuổi)", relation: "Con" }
      ],
      checkInDate: "2026-10-23 15:30",
      expectedCheckOutDate: "2026-10-26 12:00",
      actualCheckOutDate: null,
      roomRate: 5800000,
      nights: 3,
      depositAmount: 10000000,
      guaranteeDeposit: 5000000,
      status: "in_house",
      servicesUsed: [
        { serviceId: "DV-04", name: "Sen Spa trọn gói gia đình", quantity: 2, unitPrice: 800000, amount: 1600000, orderTime: "2026-10-24 16:00" },
        { serviceId: "DV-01", name: "Minibar & Đồ uống", quantity: 6, unitPrice: 40000, amount: 240000, orderTime: "2026-10-24 22:30" }
      ],
      surcharges: [],
      discount: 0,
      notes: "Gia đình du lịch nghỉ dưỡng"
    },
    {
      id: "LT-20261025-16",
      bookingId: "DP-20261021-055",
      roomNumber: "1002",
      roomClassCode: "EXE-S",
      guest: {
        id: "KH-016",
        name: "David Miller",
        phone: "+1 415 889 0011",
        identityCard: "Passport US5566778",
        email: "david.miller@chevron.com",
        address: "California, USA"
      },
      companions: [],
      checkInDate: "2026-10-25 15:00",
      expectedCheckOutDate: "2026-11-04 12:00",
      actualCheckOutDate: null,
      roomRate: 3800000, // Giá hợp đồng dài hạn
      nights: 10,
      depositAmount: 20000000,
      guaranteeDeposit: 10000000,
      status: "in_house",
      servicesUsed: [],
      surcharges: [],
      discount: 0,
      notes: "Chuyên gia dầu khí lưu trú 10 đêm, hóa đơn thanh toán qua thẻ Corporate"
    },
    {
      id: "LT-20261024-17",
      bookingId: "DP-20261019-059",
      roomNumber: "1004",
      roomClassCode: "ROY-S",
      guest: {
        id: "KH-017",
        name: "Vũ Cát Tường",
        phone: "0909 112 888",
        identityCard: "079092004455",
        email: "management@vucattuong.com",
        address: "TP. Hồ Chí Minh"
      },
      companions: [
        { name: "Nguyễn Thùy Linh", identityCard: "079193006677", relation: "Quản lý" }
      ],
      checkInDate: "2026-10-24 18:30",
      expectedCheckOutDate: "2026-10-26 12:00",
      actualCheckOutDate: null,
      roomRate: 8900000,
      nights: 2,
      depositAmount: 17800000,
      guaranteeDeposit: 5000000,
      status: "in_house",
      servicesUsed: [
        { serviceId: "DV-08", name: "Tiệc tối phục vụ tại phòng Royal Suite", quantity: 1, unitPrice: 2200000, amount: 2200000, orderTime: "2026-10-24 20:30" }
      ],
      surcharges: [],
      discount: 0,
      notes: "Nghệ sĩ biểu diễn tại sự kiện Nghệ Tĩnh, cần bảo mật lịch trình"
    },
    {
      id: "LT-20261025-18",
      bookingId: "DP-20261023-062",
      roomNumber: "1202",
      roomClassCode: "ROY-S",
      guest: {
        id: "KH-018",
        name: "His Excellency Somphone Vongsay",
        phone: "+856 20 5566 7788",
        identityCard: "Diplomatic Passport LA009988",
        email: "somphone.v@mofa.gov.la",
        address: "Vientiane, Lao PDR"
      },
      companions: [
        { name: "Khamla Phomvihane", identityCard: "Diplomatic Passport LA009989", relation: "Tùy viên ngoại giao" }
      ],
      checkInDate: "2026-10-25 16:00",
      expectedCheckOutDate: "2026-10-27 12:00",
      actualCheckOutDate: null,
      roomRate: 8900000,
      nights: 2,
      depositAmount: 15000000,
      guaranteeDeposit: 5000000,
      status: "in_house",
      servicesUsed: [],
      surcharges: [],
      discount: 0,
      notes: "Đoàn Ngoại giao Lào làm việc hữu nghị với tỉnh Nghệ An"
    },
    {
      id: "LT-20261024-19",
      bookingId: "DP-20261020-067",
      roomNumber: "1401",
      roomClassCode: "ROY-S",
      guest: {
        id: "KH-019",
        name: "GS. Đặng Vũ Minh",
        phone: "0912 001 122",
        identityCard: "001048000011",
        email: "minh.dangvu@vass.gov.vn",
        address: "Hà Nội"
      },
      companions: [],
      checkInDate: "2026-10-24 10:00",
      expectedCheckOutDate: "2026-10-26 12:00",
      actualCheckOutDate: null,
      roomRate: 8900000,
      nights: 2,
      depositAmount: 17800000,
      guaranteeDeposit: 0,
      status: "in_house",
      servicesUsed: [
        { serviceId: "DV-03", name: "Giặt là veston", quantity: 1, unitPrice: 150000, amount: 150000, orderTime: "2026-10-24 11:30" }
      ],
      surcharges: [],
      discount: 0,
      notes: "Khách mời danh dự hội thảo quy hoạch sông Lam"
    },
    {
      id: "LT-20261025-20",
      bookingId: "DP-20261022-070",
      roomNumber: "1501",
      roomClassCode: "PRS-S",
      guest: {
        id: "KH-020",
        name: "Ông Trịnh Văn Tuấn",
        phone: "0903 999 999",
        identityCard: "001072008888",
        email: "tuan.tv@ocb.com.vn",
        address: "TP. Hồ Chí Minh"
      },
      companions: [
        { name: "Bà Nguyễn Thị Mai", identityCard: "001174007777", relation: "Phu nhân" },
        { name: "Đào Văn Cường", identityCard: "034088001122", relation: "Trưởng ban An ninh riêng" }
      ],
      checkInDate: "2026-10-25 15:30",
      expectedCheckOutDate: "2026-10-28 12:00",
      actualCheckOutDate: null,
      roomRate: 18000000,
      nights: 3,
      depositAmount: 54000000,
      guaranteeDeposit: 20000000,
      status: "in_house",
      servicesUsed: [
        { serviceId: "DV-10", name: "Dịch vụ Quản gia & Đầu bếp VIP phục vụ tiệc riêng", quantity: 1, unitPrice: 3500000, amount: 3500000, orderTime: "2026-10-25 18:00" }
      ],
      surcharges: [],
      discount: 0,
      notes: "Chủ tịch Tập đoàn Tài chính - Phục vụ tiêu chuẩn nguyên thủ cao nhất"
    }
  ],

  // Danh mục đơn đặt phòng (Reservations / Bookings)
  bookings: [
    {
      id: "DP-20261025-001",
      guestName: "Trần Anh Quân",
      phone: "0918 223 344",
      email: "quan.ta@fpt.com",
      checkInDate: "2026-10-25",
      checkOutDate: "2026-10-27",
      roomClassCode: "SUP-K",
      roomQuantity: 1,
      assignedRooms: ["402"], // Đã gán phòng hoặc chưa
      totalEstimated: 2400000,
      depositAmount: 1200000,
      paymentStatus: "deposited", // 'unpaid' | 'deposited' | 'fully_paid' | 'refunded'
      bookingStatus: "confirmed", // 'pending' | 'confirmed' | 'checked_in' | 'cancelled'
      createdAt: "2026-10-22 10:15",
      notes: "Khách dự kiến check-in lúc 19:30 tối nay"
    },
    {
      id: "DP-20261025-002",
      guestName: "Công ty Dược phẩm Codupha",
      phone: "0982 334 455",
      email: "booking@codupha.com.vn",
      checkInDate: "2026-10-25",
      checkOutDate: "2026-10-28",
      roomClassCode: "DLX-T",
      roomQuantity: 2,
      assignedRooms: ["504"], // Mới gán 1 phòng, 1 phòng chờ phân bổ
      totalEstimated: 8100000,
      depositAmount: 4000000,
      paymentStatus: "deposited",
      bookingStatus: "confirmed",
      createdAt: "2026-10-21 14:30",
      notes: "Đoàn hội thảo Dược, check-in sau 18:00"
    },
    {
      id: "DP-20261025-003",
      guestName: "Bà Phạm Phương Thảo",
      phone: "0902 888 777",
      email: "thao.pham@sunhouse.com.vn",
      checkInDate: "2026-10-25",
      checkOutDate: "2026-10-27",
      roomClassCode: "CLB-S",
      roomQuantity: 1,
      assignedRooms: ["801"],
      totalEstimated: 6200000,
      depositAmount: 6200000,
      paymentStatus: "fully_paid",
      bookingStatus: "confirmed",
      createdAt: "2026-10-20 09:00",
      notes: "Đã thanh toán đủ qua cổng OnePay, khách VIP"
    },
    {
      id: "DP-20261026-004",
      guestName: "Nguyễn Thế Bảo",
      phone: "0934 112 233",
      email: "bao.nt@vinaphone.vn",
      checkInDate: "2026-10-26",
      checkOutDate: "2026-10-29",
      roomClassCode: "PRM-K",
      roomQuantity: 1,
      assignedRooms: [],
      totalEstimated: 4950000,
      depositAmount: 2000000,
      paymentStatus: "deposited",
      bookingStatus: "confirmed",
      createdAt: "2026-10-24 16:40",
      notes: "Check-in ngày mai"
    },
    {
      id: "DP-20261026-005",
      guestName: "Đoàn Khách Du lịch Saigontourist",
      phone: "0903 111 222",
      email: "tour.danang@saigontourist.net",
      checkInDate: "2026-10-26",
      checkOutDate: "2026-10-28",
      roomClassCode: "DLX-T",
      roomQuantity: 3,
      assignedRooms: [],
      totalEstimated: 8100000,
      depositAmount: 4000000,
      paymentStatus: "deposited",
      bookingStatus: "confirmed",
      createdAt: "2026-10-23 11:20",
      notes: "Đoàn 6 khách, yêu cầu các phòng cùng tầng"
    },
    {
      id: "DP-20261025-006",
      guestName: "Lê Minh Tuấn",
      phone: "0971 665 544",
      email: "tuanlm@yahoo.com",
      checkInDate: "2026-10-25",
      checkOutDate: "2026-10-26",
      roomClassCode: "SUP-K",
      roomQuantity: 1,
      assignedRooms: [],
      totalEstimated: 1200000,
      depositAmount: 0,
      paymentStatus: "unpaid",
      bookingStatus: "pending",
      createdAt: "2026-10-25 08:15",
      notes: "Đặt qua điện thoại sáng nay, cam kết cọc trước 17:00"
    },
    {
      id: "DP-20261024-007",
      guestName: "Hồ Xuân Hùng",
      phone: "0913 889 911",
      email: "hung.hx@evn.com.vn",
      checkInDate: "2026-10-24",
      checkOutDate: "2026-10-26",
      roomClassCode: "JUN-S",
      roomQuantity: 1,
      assignedRooms: [],
      totalEstimated: 4800000,
      depositAmount: 0,
      paymentStatus: "unpaid",
      bookingStatus: "cancelled",
      createdAt: "2026-10-20 15:00",
      notes: "Khách bận lịch công tác đột xuất, đã hủy trước 48h theo chính sách"
    }
  ],

  // Danh mục dịch vụ (Service Catalog)
  services: [
    { id: "DV-01", code: "MB-BEV", name: "Minibar - Đồ uống giải khát (Nước ngọt, Bia, Nước suối)", unit: "Lon/Chai", price: 35000, category: "Minibar", status: "active" },
    { id: "DV-02", code: "MB-SNK", name: "Minibar - Snack & Hạt điều sấy cao cấp", unit: "Gói/Hộp", price: 45000, category: "Minibar", status: "active" },
    { id: "DV-03", code: "LND-STD", name: "Giặt là thường (Áo sơ mi / Quần tây)", unit: "Chiếc", price: 70000, category: "Giặt là", status: "active" },
    { id: "DV-04", code: "SPA-60M", name: "Sen Spa - Massage thư giãn toàn thân tinh dầu 60 phút", unit: "Lượt", price: 550000, category: "Spa & Chăm sóc sức khỏe", status: "active" },
    { id: "DV-05", code: "TRN-AIR", name: "Đưa đón sân bay Vinh (Xe 7 chỗ Fortuner cao cấp)", unit: "Chuyến", price: 350000, category: "Vận chuyển", status: "active" },
    { id: "DV-06", code: "RES-BF", name: "Bữa sáng gọi thêm tại phòng (Phở bò Sông Lam / Bánh mỳ Âu)", unit: "Suất", price: 120000, category: "Nhà hàng Cung Đình", status: "active" },
    { id: "DV-07", code: "RES-WINE", name: "Rượu vang đỏ Montes Alpha Cabernet Sauvignon", unit: "Chai", price: 850000, category: "Ẩm thực & Bar", status: "active" },
    { id: "DV-08", code: "RES-SET", name: "Set menu Á đặc sản xứ Nghệ tại Nhà hàng Cung Đình", unit: "Suất", price: 650000, category: "Nhà hàng Cung Đình", status: "active" },
    { id: "DV-09", code: "CF-ROOM", name: "Thuê phòng họp nhỏ tầng 8 (Bao gồm trà, máy chiếu)", unit: "Giờ", price: 500000, category: "Hội nghị & Sự kiện", status: "active" },
    { id: "DV-10", code: "VIP-BUTLER", name: "Dịch vụ Đầu bếp & Quản gia VIP phục vụ riêng tại Suite", unit: "Buổi", price: 3500000, category: "Dịch vụ VIP", status: "active" }
  ],

  // Danh sách công việc Buồng phòng (Housekeeping Tasks)
  housekeepingTasks: [
    {
      id: "HK-20261025-01",
      roomNumber: "403",
      taskType: "checkout_clean", // 'daily_clean' | 'checkout_clean' | 'deep_clean' | 'inspection'
      taskTypeName: "Dọn phòng khách trả",
      assignedStaff: "Lê Thị Hoa",
      assignedTime: "2026-10-25 11:45",
      status: "pending", // 'pending' | 'in_progress' | 'inspecting' | 'completed'
      inspectionResult: "Chưa kiểm tra",
      notes: "Khách trả phòng lúc 11:30, cần thay toàn bộ chăn ga gối mới"
    },
    {
      id: "HK-20261025-02",
      roomNumber: "405",
      taskType: "daily_clean",
      taskTypeName: "Dọn phòng định kỳ",
      assignedStaff: "Trần Thị Mai",
      assignedTime: "2026-10-25 13:00",
      status: "in_progress",
      inspectionResult: "Đang thực hiện",
      notes: "Khách gửi chìa khóa lễ tân nhờ dọn lúc 13h"
    },
    {
      id: "HK-20261025-03",
      roomNumber: "406",
      taskType: "deep_clean",
      taskTypeName: "Tổng vệ sinh định kỳ",
      assignedStaff: "Nguyễn Thị Sen",
      assignedTime: "2026-10-25 09:30",
      status: "inspecting",
      inspectionResult: "Chờ giám sát buồng phòng duyệt",
      notes: "Đã hoàn thành giặt thảm và đánh bóng gương"
    },
    {
      id: "HK-20261025-04",
      roomNumber: "407",
      taskType: "maintenance_check",
      taskTypeName: "Bảo trì & Sự cố",
      assignedStaff: "Phạm Văn Bình (Kỹ thuật)",
      assignedTime: "2026-10-25 10:15",
      status: "in_progress",
      inspectionResult: "Chưa đạt - Đang sửa chữa",
      notes: "Thay vòi xịt vệ sinh phòng tắm, dự kiến xong 16:00"
    },
    {
      id: "HK-20261025-05",
      roomNumber: "604",
      taskType: "checkout_clean",
      taskTypeName: "Dọn phòng khách trả",
      assignedStaff: "Lê Thị Hoa",
      assignedTime: "2026-10-25 12:30",
      status: "pending",
      inspectionResult: "Chờ tiếp nhận",
      notes: "Khách check-out lúc 12:15, chuẩn bị đón khách check-in tối"
    },
    {
      id: "HK-20261025-06",
      roomNumber: "606",
      taskType: "daily_clean",
      taskTypeName: "Dọn phòng định kỳ",
      assignedStaff: "Trần Thị Mai",
      assignedTime: "2026-10-25 14:00",
      status: "in_progress",
      inspectionResult: "Đang thực hiện",
      notes: "Phòng Junior Suite, cần thêm 2 bộ khăn tắm"
    },
    {
      id: "HK-20261025-07",
      roomNumber: "705",
      taskType: "checkout_clean",
      taskTypeName: "Dọn phòng khách trả",
      assignedStaff: "Chưa phân công",
      assignedTime: "2026-10-25 14:20",
      status: "pending",
      inspectionResult: "Chưa kiểm tra",
      notes: "Phòng khách trả trưa nay, cần phân công nhân viên ca chiều"
    },
    {
      id: "HK-20261025-08",
      roomNumber: "1203",
      taskType: "inspection",
      taskTypeName: "Kiểm tra sau bảo dưỡng",
      assignedStaff: "Hoàng Minh Thu (Giám sát)",
      assignedTime: "2026-10-25 15:00",
      status: "pending",
      inspectionResult: "Chờ kiểm tra",
      notes: "Kiểm tra mùi sơn bóng sàn gỗ trước khi mở bán"
    }
  ],

  // Bảng phân quyền hệ thống (RBAC Matrix)
  roles: [
    {
      id: "ROLE_RECEPTIONIST",
      code: "receptionist",
      name: "Lễ tân",
      description: "Quản lý sơ đồ phòng, đặt phòng, thủ tục nhận/trả phòng, thêm dịch vụ và thanh toán cơ bản.",
      permissions: {
        viewRoomRack: true,
        manageCheckIn: true,
        manageCheckOut: true,
        manageRoomTransfer: true,
        createBooking: true,
        cancelBooking: true,
        addServiceOrder: true,
        cancelServiceOrder: false,
        updateCleanStatus: false,
        manageHousekeepingTasks: false,
        reportMaintenance: true,
        collectPayment: true,
        approveRefund: false,
        printVatInvoice: true,
        viewDailyRevenue: false, // Không xem doanh thu tổng
        exportReports: false,
        editRoomClasses: false,
        systemConfig: false,
        viewAuditLog: false
      }
    },
    {
      id: "ROLE_HOUSEKEEPING",
      code: "housekeeping",
      name: "Nhân viên buồng phòng",
      description: "Xem sơ đồ phòng, cập nhật tình trạng vệ sinh phòng, nhận việc dọn phòng, báo cáo sự cố.",
      permissions: {
        viewRoomRack: true,
        manageCheckIn: false,
        manageCheckOut: false,
        manageRoomTransfer: false,
        createBooking: false,
        cancelBooking: false,
        addServiceOrder: false,
        cancelServiceOrder: false,
        updateCleanStatus: true,
        manageHousekeepingTasks: true,
        reportMaintenance: true,
        collectPayment: false,
        approveRefund: false,
        printVatInvoice: false,
        viewDailyRevenue: false,
        exportReports: false,
        editRoomClasses: false,
        systemConfig: false,
        viewAuditLog: false
      }
    },
    {
      id: "ROLE_SERVICE",
      code: "service_staff",
      name: "Nhân viên dịch vụ",
      description: "Tiếp nhận và xử lý yêu cầu dịch vụ ẩm thực, minibar, spa, giặt là gắn với phòng lưu trú.",
      permissions: {
        viewRoomRack: true,
        manageCheckIn: false,
        manageCheckOut: false,
        manageRoomTransfer: false,
        createBooking: false,
        cancelBooking: false,
        addServiceOrder: true,
        cancelServiceOrder: false,
        updateCleanStatus: false,
        manageHousekeepingTasks: false,
        reportMaintenance: false,
        collectPayment: false,
        approveRefund: false,
        printVatInvoice: false,
        viewDailyRevenue: false,
        exportReports: false,
        editRoomClasses: false,
        systemConfig: false,
        viewAuditLog: false
      }
    },
    {
      id: "ROLE_CASHIER",
      code: "cashier",
      name: "Thu ngân / Kế toán",
      description: "Quyết toán hóa đơn, tra cứu giao dịch, xác thực thanh toán điện tử, đề xuất hoàn tiền, lập báo cáo doanh thu.",
      permissions: {
        viewRoomRack: true,
        manageCheckIn: false,
        manageCheckOut: true,
        manageRoomTransfer: false,
        createBooking: false,
        cancelBooking: false,
        addServiceOrder: false,
        cancelServiceOrder: false,
        updateCleanStatus: false,
        manageHousekeepingTasks: false,
        reportMaintenance: false,
        collectPayment: true,
        approveRefund: false, // Chỉ đề xuất hoàn tiền, quản lý duyệt
        printVatInvoice: true,
        viewDailyRevenue: true,
        exportReports: true,
        editRoomClasses: false,
        systemConfig: false,
        viewAuditLog: true
      }
    },
    {
      id: "ROLE_MANAGER",
      code: "manager",
      name: "Quản lý khách sạn",
      description: "Toàn quyền quản trị vận hành khách sạn, duyệt hoàn tiền, điều chỉnh giá & chính sách, xem mọi báo cáo.",
      permissions: {
        viewRoomRack: true,
        manageCheckIn: true,
        manageCheckOut: true,
        manageRoomTransfer: true,
        createBooking: true,
        cancelBooking: true,
        addServiceOrder: true,
        cancelServiceOrder: true,
        updateCleanStatus: true,
        manageHousekeepingTasks: true,
        reportMaintenance: true,
        collectPayment: true,
        approveRefund: true, // Có quyền duyệt hoàn tiền
        printVatInvoice: true,
        viewDailyRevenue: true,
        exportReports: true,
        editRoomClasses: true,
        systemConfig: true,
        viewAuditLog: true
      }
    },
    {
      id: "ROLE_ADMIN",
      code: "admin",
      name: "Quản trị viên hệ thống",
      description: "Quản lý tài khoản người dùng, phân quyền, cấu hình thông số hệ thống và tra cứu nhật ký thao tác audit log.",
      permissions: {
        viewRoomRack: true,
        manageCheckIn: false,
        manageCheckOut: false,
        manageRoomTransfer: false,
        createBooking: false,
        cancelBooking: false,
        addServiceOrder: false,
        cancelServiceOrder: false,
        updateCleanStatus: false,
        manageHousekeepingTasks: false,
        reportMaintenance: false,
        collectPayment: false,
        approveRefund: false,
        printVatInvoice: false,
        viewDailyRevenue: false, // Quản trị IT không mặc định xem dữ liệu tài chính
        exportReports: false,
        editRoomClasses: true,
        systemConfig: true,
        viewAuditLog: true
      }
    }
  ],

  // Danh sách tài khoản người dùng nội bộ
  users: [
    { id: "NV-01", username: "hoang.manager", fullName: "Nguyễn Văn Hoàng", roleCode: "manager", roleName: "Quản lý khách sạn", email: "hoang.nv@songlamhotel.vn", status: "active" },
    { id: "NV-02", username: "huong.letan", fullName: "Trần Thu Hương", roleCode: "receptionist", roleName: "Lễ tân trưởng", email: "huong.tt@songlamhotel.vn", status: "active" },
    { id: "NV-03", username: "tuan.letan", fullName: "Phan Anh Tuấn", roleCode: "receptionist", roleName: "Nhân viên Lễ tân", email: "tuan.pa@songlamhotel.vn", status: "active" },
    { id: "NV-04", username: "mai.buongphong", fullName: "Trần Thị Mai", roleCode: "housekeeping", roleName: "Nhân viên Buồng phòng", email: "mai.tt@songlamhotel.vn", status: "active" },
    { id: "NV-05", username: "thu.giamsat", fullName: "Hoàng Minh Thu", roleCode: "housekeeping", roleName: "Giám sát Buồng phòng", email: "thu.hm@songlamhotel.vn", status: "active" },
    { id: "NV-06", username: "quang.dichvu", fullName: "Vũ Đình Quang", roleCode: "service_staff", roleName: "Nhân viên Dịch vụ ẩm thực", email: "quang.vd@songlamhotel.vn", status: "active" },
    { id: "NV-07", username: "lan.ketoan", fullName: "Nguyễn Phương Lan", roleCode: "cashier", roleName: "Kế toán / Thu ngân", email: "lan.np@songlamhotel.vn", status: "active" },
    { id: "NV-08", username: "admin.sys", fullName: "Lê Quốc Bảo", roleCode: "admin", roleName: "Quản trị viên hệ thống", email: "admin@songlamhotel.vn", status: "active" }
  ],

  // Hồ sơ Khách hàng & Đoàn / Công ty (Customer CRM)
  customers: [
    { id: "KH-001", name: "Nguyễn Văn An", phone: "0912 345 678", identityCard: "040085012345", email: "an.nguyen@gmail.com", address: "TP. Vinh, Nghệ An", tier: "VIP Diamond", totalStays: 12, totalSpent: 28500000, type: "individual" },
    { id: "KH-002", name: "Trần Thị Mai", phone: "0987 654 321", identityCard: "038192004567", email: "mai.tran@vinhnet.vn", address: "Hà Tĩnh", tier: "VIP Gold", totalStays: 6, totalSpent: 14200000, type: "individual" },
    { id: "KH-003", name: "Lê Hoàng Long", phone: "0903 112 233", identityCard: "001090001234", email: "long.lh@petrovietnam.vn", address: "Ba Đình, Hà Nội", tier: "VIP Diamond", totalStays: 15, totalSpent: 42000000, type: "individual" },
    { id: "KH-004", name: "Phạm Phương Thảo", phone: "0918 998 877", identityCard: "079188009876", email: "thao.pp@vietjetair.com", address: "Quận 1, TP. Hồ Chí Minh", tier: "VIP Platinum", totalStays: 8, totalSpent: 22800000, type: "individual" },
    { id: "KH-005", name: "Công ty Cổ phần Tập đoàn TH", phone: "0238 8899 999", identityCard: "2901234567 (MST)", email: "contact@thmilk.vn", address: "Nghĩa Đàn, Nghệ An", tier: "Doanh nghiệp / Đoàn", totalStays: 24, totalSpent: 168000000, type: "group", representative: "Bà Thái Hương", companyCode: "TH-GROUP" },
    { id: "KH-006", name: "Tổng Công ty XD Dầu khí Nghệ An", phone: "0238 3844 555", identityCard: "2900987654 (MST)", email: "pvc.nghean@pvn.vn", address: "TP. Vinh, Nghệ An", tier: "Doanh nghiệp / Đoàn", totalStays: 18, totalSpent: 96000000, type: "group", representative: "Nguyễn Văn Thắng", companyCode: "PV-NGHEAN" },
    { id: "KH-007", name: "Công ty Lữ hành Vietravel - CN Vinh", phone: "0238 3552 233", identityCard: "0300456789 (MST)", email: "tour.vinh@vietravel.com", address: "Quang Trung, TP. Vinh", tier: "Đối tác Lữ hành", totalStays: 35, totalSpent: 215000000, type: "group", representative: "Trần Thu Hà", companyCode: "VIETRAVEL-VINH" }
  ],

  // Lịch sử giao dịch thanh toán (Transactions)
  transactions: [
    {
      id: "GD-20261025-001",
      referenceCode: "VNPAY-88291039",
      stayId: "LT-20261025-07",
      bookingId: "DP-20261022-021",
      customerName: "Ngô Trí Dũng",
      amount: 1650000,
      paymentMethod: "vnpay_qr", // 'cash' | 'bank_transfer' | 'vnpay_qr' | 'onepay'
      methodName: "Cổng thanh toán VNPay QR",
      type: "deposit", // 'deposit' | 'final_payment' | 'refund'
      status: "success", // 'pending' | 'success' | 'failed' | 'expired'
      gatewayVerified: true, // Nghiệp vụ: Cổng thanh toán trực tuyến phải được verify từ nhà cung cấp
      timestamp: "2026-10-25 14:10:22",
      cashier: "Hệ thống VNPay (Tự động xác thực Webhook IPN)",
      notes: "Thanh toán cọc phòng 601"
    },
    {
      id: "GD-20261025-002",
      referenceCode: "VCB-MB-20261025-9921",
      stayId: "LT-20261025-04",
      bookingId: "DP-20261024-012",
      customerName: "Đặng Quang Huy",
      amount: 2000000,
      paymentMethod: "bank_transfer",
      methodName: "Chuyển khoản Vietcombank",
      type: "deposit",
      status: "success",
      gatewayVerified: true,
      timestamp: "2026-10-25 13:05:45",
      cashier: "Nguyễn Phương Lan (Kế toán)",
      notes: "Xác thực tiền nổi tài khoản VCB 0101000889988"
    },
    {
      id: "GD-20261025-003",
      referenceCode: "CASH-REC-20261025-01",
      stayId: "LT-20261025-02",
      bookingId: "DP-20261022-004",
      customerName: "Lê Hoàng Long",
      amount: 1500000,
      paymentMethod: "cash",
      methodName: "Tiền mặt tại quầy lễ tân",
      type: "deposit",
      status: "success",
      gatewayVerified: true,
      timestamp: "2026-10-25 09:35:10",
      cashier: "Trần Thu Hương (Lễ tân)",
      notes: "Thu tiền mặt khi nhận phòng sớm"
    },
    {
      id: "GD-20261025-004",
      referenceCode: "ONEPAY-77123984",
      stayId: null,
      bookingId: "DP-20261025-003",
      customerName: "Bà Phạm Phương Thảo",
      amount: 6200000,
      paymentMethod: "onepay",
      methodName: "Cổng OnePay (Thẻ Visa Quốc tế)",
      type: "final_payment",
      status: "success",
      gatewayVerified: true,
      timestamp: "2026-10-25 08:45:12",
      cashier: "Cổng thanh toán OnePay (Đã nhận IPN)",
      notes: "Khách thanh toán trước 100% qua cổng OnePay"
    },
    {
      id: "GD-20261025-005",
      referenceCode: "VNPAY-99384721",
      stayId: null,
      bookingId: "DP-20261025-006",
      customerName: "Lê Minh Tuấn",
      amount: 1200000,
      paymentMethod: "vnpay_qr",
      methodName: "Cổng thanh toán VNPay QR",
      type: "deposit",
      status: "pending", // ĐANG CHỜ XÁC THỰC
      gatewayVerified: false,
      timestamp: "2026-10-25 15:20:00",
      cashier: "Chờ cổng thanh toán phản hồi",
      notes: "Giao dịch đang chờ khách quét mã thanh toán hoặc IPN từ VNPay"
    }
  ],

  // Bảng yêu cầu hoàn tiền (Refund Requests)
  refundRequests: [
    {
      id: "REF-20261025-01",
      bookingId: "DP-20261024-007",
      customerName: "Hồ Xuân Hùng",
      originalAmount: 2400000,
      refundAmount: 2400000,
      reason: "Khách hủy phòng trước 48 giờ theo đúng chính sách hoàn 100%",
      requestedBy: "Trần Thu Hương (Lễ tân)",
      requestedAt: "2026-10-24 16:00",
      status: "approved", // 'pending' | 'approved' | 'rejected'
      approvedBy: "Nguyễn Văn Hoàng (Quản lý)",
      approvedAt: "2026-10-25 08:30",
      notes: "Đã hoàn trả vào số tài khoản VCB 001100456789 của khách"
    }
  ],

  // Bảng chính sách giá & hủy phòng
  policies: {
    checkInTime: "14:00",
    checkOutTime: "12:00",
    earlyCheckInRules: [
      { condition: "Nhận phòng trước 06:00", surchargeRate: 100, note: "Phụ thu 100% giá phòng đêm hôm trước" },
      { condition: "Nhận phòng từ 06:00 đến 09:00", surchargeRate: 50, note: "Phụ thu 50% giá phòng" },
      { condition: "Nhận phòng từ 09:00 đến 12:00", surchargeRate: 30, note: "Phụ thu 30% giá phòng (tùy tình trạng phòng sẵn sàng)" }
    ],
    lateCheckOutRules: [
      { condition: "Trả phòng từ 12:00 đến 15:00", surchargeRate: 30, note: "Phụ thu 30% giá phòng" },
      { condition: "Trả phòng từ 15:00 đến 18:00", surchargeRate: 50, note: "Phụ thu 50% giá phòng" },
      { condition: "Trả phòng sau 18:00", surchargeRate: 100, note: "Phụ thu 100% giá phòng (tính trọn đêm)" }
    ],
    cancellationPolicy: [
      { condition: "Hủy trước 48 giờ trước ngày nhận phòng", penaltyRate: 0, note: "Miễn phí hoàn cọc 100%" },
      { condition: "Hủy trong vòng 24 - 48 giờ trước ngày nhận phòng", penaltyRate: 50, note: "Thu phí 50% tiền cọc" },
      { condition: "Hủy trong vòng 24 giờ hoặc không đến (No-show)", penaltyRate: 100, note: "Không hoàn lại tiền cọc" }
    ],
    depositPolicy: "Tối thiểu 50% giá trị đặt phòng trong vòng 24 giờ kể từ khi xác nhận đơn đặt phòng."
  },

  // Nhật ký thao tác (Audit Logs)
  auditLogs: [
    { id: 101, timestamp: "2026-10-25 17:35:12", user: "huong.letan", action: "Nhận phòng", target: "Phòng 701 - Lâm Đình Trọng", ip: "192.168.1.45" },
    { id: 102, timestamp: "2026-10-25 16:32:05", user: "quang.dichvu", action: "Thêm đơn dịch vụ", target: "Rượu vang Montes Alpha - P.601", ip: "192.168.1.62" },
    { id: 103, timestamp: "2026-10-25 15:45:18", user: "huong.letan", action: "Nhận phòng", target: "Phòng 1501 (Presidential Suite) - Ông Trịnh Văn Tuấn", ip: "192.168.1.45" },
    { id: 104, timestamp: "2026-10-25 15:05:40", user: "mai.buongphong", action: "Cập nhật vệ sinh", target: "Phòng 406 - Hoàn tất tổng vệ sinh, chuyển kiểm tra", ip: "192.168.1.88" },
    { id: 105, timestamp: "2026-10-25 14:12:30", user: "vnpay_gateway", action: "Webhook xác thực IPN", target: "Giao dịch GD-20261025-001 (1.650.000 VNĐ)", ip: "118.69.177.10" },
    { id: 106, timestamp: "2026-10-25 13:08:15", user: "lan.ketoan", action: "Xác nhận thanh toán VCB", target: "Giao dịch GD-20261025-002 - P.502", ip: "192.168.1.50" },
    { id: 107, timestamp: "2026-10-25 10:20:00", user: "thu.giamsat", action: "Khóa phòng bảo trì", target: "Phòng 407 - Hỏng thiết bị vệ sinh", ip: "192.168.1.80" },
    { id: 108, timestamp: "2026-10-25 08:35:45", user: "hoang.manager", action: "Duyệt yêu cầu hoàn tiền", target: "Yêu cầu REF-20261025-01 (2.400.000 VNĐ)", ip: "192.168.1.10" }
  ],

  // Dữ liệu chuyên biệt Giao diện Buồng phòng: Kiểm tra Minibar phòng khách trả
  minibarAudits: [
    {
      id: "MB-AUDIT-501",
      stayId: "LT-20261024-03",
      roomNumber: "501",
      checkoutTime: "2026-10-25 11:30",
      inspectedBy: "Lê Thị Hoa",
      status: "reported",
      itemsUsed: [
        { name: "Minibar - Hạt điều & Snack", quantity: 2, price: 45000 }
      ],
      totalAmount: 90000,
      notes: "Đã kiểm kê và đồng bộ vào Folio lượt lưu trú P.501 (Khách: Hoàng Thị Mai Lan)"
    },
    {
      id: "MB-AUDIT-506",
      stayId: "LT-20261024-06",
      roomNumber: "506",
      checkoutTime: "2026-10-25 11:45",
      inspectedBy: "Trần Thị Mai",
      status: "no_consumption",
      itemsUsed: [],
      totalAmount: 0,
      notes: "Buồng phòng đã kiểm tra - Khách không sử dụng minibar (nguyên seal)"
    },
    {
      id: "MB-AUDIT-704",
      stayId: "LT-20261024-11",
      roomNumber: "704",
      checkoutTime: "2026-10-25 12:00",
      inspectedBy: "Lê Thị Hoa",
      status: "no_consumption",
      itemsUsed: [],
      totalAmount: 0,
      notes: "Buồng phòng đã kiểm tra - Tủ lạnh nguyên seal, sẵn sàng thanh toán"
    },
    {
      id: "MB-AUDIT-01",
      stayId: "LT-20261023-HIST-01",
      roomNumber: "403",
      checkoutTime: "2026-10-25 11:30",
      inspectedBy: "Lê Thị Hoa",
      status: "reported",
      itemsUsed: [
        { name: "Bia Tiger bạc", quantity: 2, price: 35000 },
        { name: "Hạt điều sấy cao cấp", quantity: 1, price: 45000 }
      ],
      totalAmount: 115000,
      notes: "Đã báo lễ tân ghi nhận vào hóa đơn trước khi khách rời quầy"
    },
    {
      id: "MB-AUDIT-02",
      stayId: "LT-20261023-HIST-02",
      roomNumber: "604",
      checkoutTime: "2026-10-25 12:15",
      inspectedBy: "Trần Thị Mai",
      status: "reported",
      itemsUsed: [
        { name: "Nước ngọt Coca Cola", quantity: 1, price: 35000 }
      ],
      totalAmount: 35000,
      notes: "Khách xác nhận đã uống khi trả phòng"
    },
    {
      id: "MB-AUDIT-03",
      stayId: "LT-20261023-HIST-03",
      roomNumber: "705",
      checkoutTime: "2026-10-25 14:20",
      inspectedBy: "Chưa kiểm tra",
      status: "pending",
      itemsUsed: [],
      totalAmount: 0,
      notes: "Phòng vừa check-out lúc 14:20, nhân viên buồng phòng cần vào kiểm tra tủ lạnh ngay"
    }
  ],

  // Dữ liệu chuyên biệt Buồng phòng: Đồ khách để quên (Lost & Found)
  lostAndFound: [
    {
      id: "LF-20261025-01",
      roomNumber: "501",
      foundDate: "2026-10-24 16:30",
      itemDescription: "Đồng hồ Citizen dây da màu nâu nam",
      foundBy: "Lê Thị Hoa",
      storageLocation: "Két đồ thất lạc Buồng phòng tầng 4",
      guestContact: "Đoàn Quốc Tuấn - 0904 112 233",
      status: "stored", // 'stored' | 'returned'
      notes: "Khách báo sẽ quay lại nhận vào chiều 26/10"
    },
    {
      id: "LF-20261025-02",
      roomNumber: "402",
      foundDate: "2026-10-25 09:15",
      itemDescription: "Sạc dự phòng Anker 20.000 mAh màu đen",
      foundBy: "Trần Thị Mai",
      storageLocation: "Đã bàn giao quầy Lễ tân",
      guestContact: "Đang tra cứu hồ sơ khách lưu trú cũ",
      status: "stored",
      notes: "Để quên tại ngăn bàn làm việc"
    },
    {
      id: "LF-20261025-03",
      roomNumber: "1202",
      foundDate: "2026-10-25 16:00",
      itemDescription: "Áo khoác vest nam Giovanni màu ghi",
      foundBy: "Hoàng Minh Thu (Giám sát)",
      storageLocation: "Tủ treo đồ thất lạc VIP",
      guestContact: "Đoàn Ngoại giao Lào",
      status: "returned",
      notes: "Đã bàn giao lại cho tùy viên Khamla lúc 17:00"
    }
  ],

  // Dữ liệu sự cố & bảo trì phòng (Maintenance Tickets)
  maintenanceTickets: [
    {
      id: "SC-407",
      roomNumber: "407",
      issueDescription: "Hỏng vòi xịt vệ sinh phòng tắm, rò rỉ nước sàn",
      reportedBy: "Trần Thị Mai (Buồng phòng)",
      reportedAt: "2026-10-25 10:15",
      technician: "Phạm Văn Bình (Kỹ thuật)",
      status: "in_progress", // 'in_progress' | 'completed'
      estimatedFinish: "2026-10-25 16:00",
      roomLocked: true
    },
    {
      id: "SC-806",
      roomNumber: "806",
      issueDescription: "Bảo dưỡng định kỳ hệ thống điều hòa trung tâm tầng 8",
      reportedBy: "Lê Thị Hoa (Buồng phòng)",
      reportedAt: "2026-10-25 08:30",
      technician: "Tổ Cơ điện khách sạn",
      status: "in_progress",
      estimatedFinish: "2026-10-26 11:00",
      roomLocked: true
    },
    {
      id: "SC-606",
      roomNumber: "606",
      issueDescription: "Đèn đọc sách đầu giường bị chập chờn tiếp xúc",
      reportedBy: "Trần Thị Mai",
      reportedAt: "2026-10-25 14:10",
      technician: "Chưa phân công",
      status: "pending",
      estimatedFinish: "Hôm nay",
      roomLocked: false
    }
  ]
};

// Lưu vào Window để các script khác sử dụng
if (typeof window !== "undefined") {
  window.HOTEL_DATA = INITIAL_DATA;
}

