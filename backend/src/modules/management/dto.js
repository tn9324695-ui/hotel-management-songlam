import { sqlId, sqlText, sqlUtc, pageDto } from '../bookings/dto.js';
import { isCalendarDate } from '../catalog/validation.js';
import { invalidManagementSql } from './model.js';
export const pick = (value, values) => { if (!values.includes(value)) throw invalidManagementSql(); return value; };
export const flag = value => { if (typeof value !== 'boolean') throw invalidManagementSql(); return value; };
export const array = (value, max = 200) => { if (!Array.isArray(value) || value.length > max) throw invalidManagementSql(); return value; };
export const code = (value, max = 80) => { if (typeof value !== 'string' || value.length > max || !/^[A-Za-z][A-Za-z0-9_.:-]*$/.test(value)) throw invalidManagementSql(); return value; };
export function reference(value) { if (value === null) return null; if (typeof value !== 'string' || !/^[A-Za-z0-9_.:/,=-]{1,100}$/.test(value)) throw invalidManagementSql(); return value; }
export function integer(value, signed = false, maxDigits = 38) {
  if (typeof value !== 'string' || !(signed ? /^(0|-?[1-9]\d*)$/ : /^(0|[1-9]\d*)$/).test(value) || value.replace('-', '').length > maxDigits) throw invalidManagementSql(); return value;
}
export function managementClock(raw) {
  if (!raw || !isCalendarDate(raw.businessDate) || !isCalendarDate(raw.nextBusinessDate) || raw.nextBusinessDate <= raw.businessDate) throw invalidManagementSql();
  const timeZone = sqlText(raw.timeZone, 60); try { new Intl.DateTimeFormat('vi-VN', { timeZone }); } catch { throw invalidManagementSql(); }
  const cutoffLocalTime = sqlText(raw.cutoffLocalTime, 8); if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(cutoffLocalTime)) throw invalidManagementSql();
  const fromUtc = sqlUtc(raw.defaultFromUtc), toUtc = sqlUtc(raw.defaultToUtc); if (Date.parse(toUtc) <= Date.parse(fromUtc)) throw invalidManagementSql();
  return { businessDate: raw.businessDate, nextBusinessDate: raw.nextBusinessDate, timeZone, cutoffLocalTime,
    defaultFromUtc: fromUtc, defaultToUtc: toUtc, asOfUtc: sqlUtc(raw.asOfUtc), policyReference: sqlText(raw.policyReference, 160) };
}
export function roleDto(raw) { return { id: sqlId(raw.id), code: code(raw.code, 40), name: sqlText(raw.name, 120), active: flag(raw.active) }; }
export function permissionDto(raw) { return { id: sqlId(raw.id), code: code(raw.code), description: sqlText(raw.description, 250) }; }
export function userDto(raw) {
  const roles = array(raw.roleAssignments, 100).map(roleDto);
  if (new Set(roles.map(row => row.id)).size !== roles.length) throw invalidManagementSql();
  return { id: sqlId(raw.id), username: sqlText(raw.username, 100), fullName: sqlText(raw.fullName, 160), active: flag(raw.active), createdAtUtc: sqlUtc(raw.createdAtUtc), roleAssignments: roles };
}
export function auditDto(raw, actor) {
  const actorId = sqlId(raw.actorId, true), actorKind = pick(raw.actorKind, ['USER', 'SYSTEM', 'UNIDENTIFIED']);
  if ((actorKind === 'USER') !== (actorId !== null)) throw invalidManagementSql();
  const result = { id: sqlId(raw.id), actorId, actorKind, action: code(raw.action), entityType: code(raw.entityType, 60), entityKey: reference(raw.entityKey),
    result: pick(raw.result, ['SUCCEEDED', 'REJECTED', 'FAILED', 'UNKNOWN']), outcomeScope: pick(raw.outcomeScope, ['DATABASE_COMMIT', 'HTTP_REQUEST', 'UNKNOWN']),
    reference: reference(raw.reference), atUtc: sqlUtc(raw.atUtc), errorCode: raw.errorCode === null ? null : code(raw.errorCode) };
  if (actor.permissions.includes('systemConfig')) result.actorName = sqlText(raw.actorName, 160, true);
  // Never return Reason, Description, BeforeJson, AfterJson, request bodies or provider text.
  return result;
}
const exceptionMessages = Object.freeze({ PENDING_RECONCILIATION: 'Giao dịch đang chờ đối soát; chưa ghi nhận thực thu.', MISSING_SOURCE_LINK: 'Dữ liệu phát sinh thiếu liên kết nguồn cần xác minh.',
  REQUEST_REJECTED: 'Thao tác bị từ chối; cần đối chiếu mã tham chiếu.', MISSING_ROOM_LINK: 'Thiếu liên kết phòng/lưu trú cần xử lý.', DEPOSIT_DISPUTE: 'Khoản cọc cần được người có quyền kiểm tra.' });
export function exceptionDto(raw, actor) {
  const financialAccess = actor.permissions.includes('systemConfig') || actor.permissions.includes('collectPayment'), kind = code(raw.kind, 40);
  const observation = raw.sourceKind === 'DERIVED_OBSERVATION';
  const sensitivity = pick(raw.sensitivity, ['OPERATIONAL', 'FINANCIAL', 'SECURITY']);
  if (observation && (sensitivity === 'FINANCIAL' && !financialAccess || sensitivity === 'SECURITY' && !actor.permissions.includes('systemConfig'))) throw invalidManagementSql();
  const canIdentify = sensitivity === 'SECURITY' ? actor.permissions.includes('systemConfig') : financialAccess || sensitivity === 'OPERATIONAL';
  const id = observation ? reference(raw.id) : sqlId(raw.id); if (id === null) throw invalidManagementSql();
  return { id, sourceKind: pick(raw.sourceKind, ['EXCEPTION_CASE', 'DERIVED_OBSERVATION']),
    kind, status: pick(raw.status, ['OPEN', 'RESOLVED', 'REJECTED']), actorId: sqlId(raw.actorId, true), action: code(raw.action), entityType: code(raw.entityType, 60),
    entityKey: canIdentify ? reference(raw.entityKey) : null,
    reference: canIdentify ? reference(raw.reference) : null,
    result: pick(raw.result, ['SUCCEEDED', 'REJECTED', 'FAILED', 'UNKNOWN']), atUtc: sqlUtc(raw.atUtc), resolvedAtUtc: raw.resolvedAtUtc === null ? null : sqlUtc(raw.resolvedAtUtc),
    message: exceptionMessages[kind] || 'Ngoại lệ cần xác minh theo phạm vi được cấp quyền.',
    persistence: observation ? 'DERIVED_NOT_PERSISTED' : 'PERSISTED_CASE' };
}
export const adminRecord = (resource, raw, actor) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw invalidManagementSql();
  return { users: userDto, roles: roleDto, permissions: permissionDto, audit: row => auditDto(row, actor), exceptions: row => exceptionDto(row, actor) }[resource](raw);
};
export { pageDto };
