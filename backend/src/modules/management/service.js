import { sqlUtc } from '../bookings/dto.js';
import { requireManagementPermission, invalidManagementSql, managementError } from './model.js';
import { adminRecord, roleDto, permissionDto, managementClock, array, pageDto } from './dto.js';
export async function readManagementClock(gateway, actor, requestId) {
  const raw = await gateway.read(actor, 'context', 'current', {}, requestId);
  if (raw.resource !== 'context' || raw.operation !== 'current') throw invalidManagementSql();
  return managementClock(raw.clock);
}
export function createManagementService({ gateway, resource }) {
  return Object.freeze({
    capabilities(actor) {
      let visible = false; try { requireManagementPermission(actor, resource, 'list'); visible = true; } catch {}
      return { resource, visible, readable: visible && gateway.supports(resource, 'list'), maxLimit: gateway.limits.maxLimit,
        readOnly: true, mutationEnabled: false, observationsReadable: resource === 'exceptions' && visible && gateway.supports(resource, 'observations'),
        durableRejectionJournal: false, code: gateway.supports(resource, 'list') ? null : 'MANAGEMENT_READ_CONTRACT_PENDING' };
    },
    async read(actor, operation, input, requestId) {
      requireManagementPermission(actor, resource, operation);
      if (['audit', 'exceptions'].includes(resource) && operation !== 'detail') {
        const clock = await readManagementClock(gateway, actor, requestId);
        if (input.timeZone !== clock.timeZone) throw managementError('MANAGEMENT_TIME_ZONE_CONFLICT', 'Múi giờ bộ lọc không khớp múi giờ khách sạn từ SQL.', 409);
      }
      const raw = await gateway.read(actor, resource, operation, input, requestId);
      if (raw.resource !== resource || raw.operation !== operation) throw invalidManagementSql(); const meta = { asOfUtc: sqlUtc(raw.asOfUtc) };
      if (operation === 'detail') {
        if (raw.row === null) throw managementError('NOT_FOUND', 'Không tìm thấy bản ghi trong phạm vi được phép.', 404);
        const row = adminRecord(resource, raw.row, actor); if (row.id !== input.id) throw invalidManagementSql(); return { data: row, meta };
      }
      const rows = array(raw.rows, input.limit).map(row => operation === 'roles' ? roleDto(row) : operation === 'permissions' ? permissionDto(row) : adminRecord(resource, row, actor));
      if (['roles', 'permissions'].includes(operation) && raw.parentId !== input.id) throw invalidManagementSql();
      if (new Set(rows.map(row => row.id)).size !== rows.length || input.active !== undefined && rows.some(row => row.active !== input.active)) throw invalidManagementSql();
      if (resource === 'users' && operation === 'list' && input.roleCode && rows.some(row => !row.roleAssignments.some(role => role.code === input.roleCode))) throw invalidManagementSql();
      if (['audit', 'exceptions'].includes(resource)) {
        if (rows.some(row => Date.parse(row.atUtc) < Date.parse(input.fromUtc) || Date.parse(row.atUtc) >= Date.parse(input.toUtc) || input.performedBy && row.actorId !== input.performedBy || input.result && row.result !== input.result
          || input.action && row.action !== input.action || input.entityType && row.entityType !== input.entityType || input.status && row.status !== input.status || input.kind && row.kind !== input.kind)) throw invalidManagementSql();
        Object.assign(meta, { period: { fromUtc: input.fromUtc, toUtc: input.toUtc, timeZone: input.timeZone, interval: '[from,to)' }, descriptionsRedacted: true });
        if (resource === 'exceptions' && rows.some(row => row.sourceKind !== (operation === 'observations' ? 'DERIVED_OBSERVATION' : 'EXCEPTION_CASE'))) throw invalidManagementSql();
      }
      return { data: rows, meta: { ...meta, ...pageDto(raw.page, rows.length, input) } };
    }
  });
}
