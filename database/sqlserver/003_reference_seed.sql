-- Generated from js/data.js roles. Initial configuration only; no operational sample data.
-- Do not rerun against customized RBAC. No implicit admin/superuser bypass.
SET XACT_ABORT ON; SET NOCOUNT ON; SET QUOTED_IDENTIFIER ON; SET ANSI_NULLS ON;
IF EXISTS(SELECT 1 FROM pms.AppRole) OR EXISTS(SELECT 1 FROM pms.Permission) THROW 51000,'RBAC already configured; use an explicit migration.',1;
BEGIN TRANSACTION;
INSERT pms.Permission(Code,Description) VALUES
(N'viewRoomRack',N'Xem sơ đồ phòng'),
(N'manageCheckIn',N'Nhận phòng'),
(N'manageCheckOut',N'Trả phòng'),
(N'manageRoomTransfer',N'Chuyển phòng'),
(N'createBooking',N'Tạo đặt phòng'),
(N'cancelBooking',N'Hủy đặt phòng'),
(N'addServiceOrder',N'Thêm dịch vụ'),
(N'cancelServiceOrder',N'Hủy dịch vụ'),
(N'updateCleanStatus',N'Cập nhật vệ sinh'),
(N'manageHousekeepingTasks',N'Quản lý công việc buồng phòng'),
(N'reportMaintenance',N'Báo bảo trì'),
(N'collectPayment',N'Thu tiền'),
(N'approveRefund',N'Duyệt hoàn tiền'),
(N'printVatInvoice',N'Lập/in hóa đơn'),
(N'viewDailyRevenue',N'Xem doanh thu ngày'),
(N'exportReports',N'Xuất báo cáo'),
(N'editRoomClasses',N'Sửa hạng phòng'),
(N'systemConfig',N'Cấu hình hệ thống'),
(N'viewAuditLog',N'Xem nhật ký');
INSERT pms.AppRole(Code,Name) VALUES
(N'receptionist',N'Lễ tân'),
(N'housekeeping',N'Nhân viên buồng phòng'),
(N'service_staff',N'Nhân viên dịch vụ'),
(N'cashier',N'Thu ngân / Kế toán'),
(N'manager',N'Quản lý khách sạn'),
(N'admin',N'Quản trị viên hệ thống');
INSERT pms.RolePermission(RoleId,PermissionId) SELECT r.RoleId,p.PermissionId FROM pms.AppRole r CROSS JOIN pms.Permission p WHERE r.Code=N'receptionist' AND p.Code IN (N'viewRoomRack',N'manageCheckIn',N'manageCheckOut',N'manageRoomTransfer',N'createBooking',N'cancelBooking',N'addServiceOrder',N'reportMaintenance',N'collectPayment',N'printVatInvoice');
INSERT pms.RolePermission(RoleId,PermissionId) SELECT r.RoleId,p.PermissionId FROM pms.AppRole r CROSS JOIN pms.Permission p WHERE r.Code=N'housekeeping' AND p.Code IN (N'viewRoomRack',N'updateCleanStatus',N'manageHousekeepingTasks',N'reportMaintenance');
INSERT pms.RolePermission(RoleId,PermissionId) SELECT r.RoleId,p.PermissionId FROM pms.AppRole r CROSS JOIN pms.Permission p WHERE r.Code=N'service_staff' AND p.Code IN (N'viewRoomRack',N'addServiceOrder');
INSERT pms.RolePermission(RoleId,PermissionId) SELECT r.RoleId,p.PermissionId FROM pms.AppRole r CROSS JOIN pms.Permission p WHERE r.Code=N'cashier' AND p.Code IN (N'viewRoomRack',N'manageCheckOut',N'collectPayment',N'printVatInvoice',N'viewDailyRevenue',N'exportReports',N'viewAuditLog');
INSERT pms.RolePermission(RoleId,PermissionId) SELECT r.RoleId,p.PermissionId FROM pms.AppRole r CROSS JOIN pms.Permission p WHERE r.Code=N'manager' AND p.Code IN (N'viewRoomRack',N'manageCheckIn',N'manageCheckOut',N'manageRoomTransfer',N'createBooking',N'cancelBooking',N'addServiceOrder',N'cancelServiceOrder',N'updateCleanStatus',N'manageHousekeepingTasks',N'reportMaintenance',N'collectPayment',N'approveRefund',N'printVatInvoice',N'viewDailyRevenue',N'exportReports',N'editRoomClasses',N'systemConfig',N'viewAuditLog');
INSERT pms.RolePermission(RoleId,PermissionId) SELECT r.RoleId,p.PermissionId FROM pms.AppRole r CROSS JOIN pms.Permission p WHERE r.Code=N'admin' AND p.Code IN (N'viewRoomRack',N'editRoomClasses',N'systemConfig',N'viewAuditLog');
COMMIT;
