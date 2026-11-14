import { assertActor } from '../auth/security.js';
import { AppError } from '../../shared/errors.js';
export const managementError = (code, message, status = 422) => new AppError(status, code, message);
export const invalidManagementSql = () => managementError('MANAGEMENT_SQL_RESPONSE_INVALID', 'SQL chưa trả đúng hợp đồng quản trị/báo cáo G10.', 502);
export const managementResources = Object.freeze({
  users: { path: '/users', permissions: ['systemConfig'] }, roles: { path: '/roles', permissions: ['systemConfig'] },
  permissions: { path: '/permissions', permissions: ['systemConfig'] }, audit: { path: '/audit', permissions: ['viewAuditLog'] },
  exceptions: { path: '/exceptions', permissions: ['manageCheckIn', 'systemConfig'] }
});
export const reportPermissions = ['viewRoomRack', 'createBooking', 'manageCheckIn', 'manageCheckOut', 'viewDailyRevenue', 'collectPayment'];
export function requireManagementPermission(actor, resource, operation) {
  assertActor(actor);
  const permissions = resource === 'context' ? [...reportPermissions, 'systemConfig', 'viewAuditLog'] : resource === 'reports'
    ? operation === 'receivables' ? ['collectPayment'] : ['cash-flow', 'revenue'].includes(operation) ? ['viewDailyRevenue'] : reportPermissions
      : managementResources[resource]?.permissions;
  if (!permissions?.some(permission => actor.permissions.includes(permission))) throw managementError('FORBIDDEN', 'Bạn không có quyền xem dữ liệu này.', 403);
}
