/* Regenerate ONLY from the reviewed role matrix; never import demonstration users. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../js/data.js'), 'utf8');
const roles = vm.runInNewContext(source + '\nINITIAL_DATA.roles;', Object.create(null));
const literal = value => "N'" + value.replaceAll("'", "''") + "'";
const permissions = [...new Set(roles.flatMap(role => Object.keys(role.permissions)))];
const descriptions = {
  viewRoomRack: 'Xem sơ đồ phòng', manageCheckIn: 'Nhận phòng', manageCheckOut: 'Trả phòng',
  manageRoomTransfer: 'Chuyển phòng', createBooking: 'Tạo đặt phòng', cancelBooking: 'Hủy đặt phòng',
  addServiceOrder: 'Thêm dịch vụ', cancelServiceOrder: 'Hủy dịch vụ', updateCleanStatus: 'Cập nhật vệ sinh',
  manageHousekeepingTasks: 'Quản lý công việc buồng phòng', reportMaintenance: 'Báo bảo trì',
  collectPayment: 'Thu tiền', approveRefund: 'Duyệt hoàn tiền', printVatInvoice: 'Lập/in hóa đơn',
  viewDailyRevenue: 'Xem doanh thu ngày', exportReports: 'Xuất báo cáo', editRoomClasses: 'Sửa hạng phòng',
  systemConfig: 'Cấu hình hệ thống', viewAuditLog: 'Xem nhật ký'
};
const sql = [
  '-- Generated from js/data.js roles. Initial configuration only; no operational sample data.',
  '-- Do not rerun against customized RBAC. No implicit admin/superuser bypass.',
  'SET XACT_ABORT ON; SET NOCOUNT ON; SET QUOTED_IDENTIFIER ON; SET ANSI_NULLS ON;',
  "IF EXISTS(SELECT 1 FROM pms.AppRole) OR EXISTS(SELECT 1 FROM pms.Permission) THROW 51000,'RBAC already configured; use an explicit migration.',1;",
  'BEGIN TRANSACTION;',
  'INSERT pms.Permission(Code,Description) VALUES\n' + permissions.map(p => `(${literal(p)},${literal(descriptions[p] || p)})`).join(',\n') + ';',
  'INSERT pms.AppRole(Code,Name) VALUES\n' + roles.map(r => `(${literal(r.code)},${literal(r.name)})`).join(',\n') + ';',
  ...roles.map(role => `INSERT pms.RolePermission(RoleId,PermissionId) SELECT r.RoleId,p.PermissionId FROM pms.AppRole r CROSS JOIN pms.Permission p WHERE r.Code=${literal(role.code)} AND p.Code IN (${Object.entries(role.permissions).filter(([, granted]) => granted).map(([p]) => literal(p)).join(',')});`),
  'COMMIT;', ''
].join('\n');
fs.writeFileSync(path.join(__dirname, '003_reference_seed.sql'), sql, 'utf8');
console.log(`Generated initial RBAC: ${roles.length} roles, ${permissions.length} permissions.`);
