import { sqlId, sqlText, sqlUtc, sqlVersion, pageDto } from '../bookings/dto.js';
import { taskPhase, taskStatuses, ticketStatuses, priorities, taskTypes } from './model.js';
import { operationError, stateToken } from './validation.js';

export const invalidResult = () => operationError('OPERATIONS_SQL_RESPONSE_INVALID', 'SQL chưa trả đúng hợp đồng vận hành G7.', 502);
function pick(value, values) { if (!values.includes(value)) throw invalidResult(); return value; }
function boolean(value) { if (typeof value !== 'boolean') throw invalidResult(); return value; }
const time = value => (value === null || value === undefined) ? null : sqlUtc(value);

// Explicit projections: never spread a SQL row into an HTTP response.
export function roomState(raw) {
  const result = { occupancyStatus: pick(raw.occupancyStatus, ['VACANT', 'OCCUPIED']),
    cleanlinessStatus: pick(raw.cleanlinessStatus, ['DIRTY', 'CLEANING', 'INSPECTING', 'CLEAN']),
    exploitationStatus: pick(raw.exploitationStatus, ['ACTIVE', 'INACTIVE', 'MAINTENANCE']),
    eligibleForCheckIn: boolean(raw.eligibleForCheckIn),
    eligibilityReasons: Array.isArray(raw.eligibilityReasons) && raw.eligibilityReasons.length <= 20
      ? raw.eligibilityReasons.map(value => pick(value, ['INACTIVE', 'OCCUPIED', 'NOT_CLEAN', 'BLOCK', 'BLOCKING_REPAIR', 'POST_REPAIR_INSPECTION', 'ALLOCATION_CONFLICT'])) : (() => { throw invalidResult(); })() };
  const ready = result.occupancyStatus === 'VACANT' && result.cleanlinessStatus === 'CLEAN'
    && result.exploitationStatus === 'ACTIVE' && result.eligibilityReasons.length === 0;
  if (result.eligibleForCheckIn !== ready) throw invalidResult();
  if (result.occupancyStatus === 'OCCUPIED' && !result.eligibilityReasons.includes('OCCUPIED')
    || result.cleanlinessStatus !== 'CLEAN' && !result.eligibilityReasons.includes('NOT_CLEAN')
    || result.exploitationStatus === 'INACTIVE' && !result.eligibilityReasons.includes('INACTIVE')
    || result.exploitationStatus === 'MAINTENANCE' && !result.eligibilityReasons.some(reason => ['BLOCK', 'BLOCKING_REPAIR', 'POST_REPAIR_INSPECTION'].includes(reason))) throw invalidResult();
  return result;
}
export function recordDto(resource, raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw invalidResult();
  const common = { id: sqlId(raw.id) };
  if (resource !== 'items') common.version = sqlVersion(raw.version);
  if (resource === 'rooms') return { ...common, number: sqlText(raw.number, 30), ...roomState(raw) };
  common.roomId = sqlId(raw.roomId, resource === 'items');
  if (resource === 'tasks') {
    const unable = (raw.unable === null || raw.unable === undefined) ? null : {
      reason: sqlText(raw.unable?.reason, 1000), actorId: sqlId(raw.unable?.actorId), atUtc: sqlUtc(raw.unable?.atUtc)
    };
    const row = { ...common, stayId: sqlId(raw.stayId ?? null, true), taskType: pick(raw.taskType, taskTypes), status: pick(raw.status, taskStatuses),
      assignedToId: sqlId(raw.assignedToId ?? null, true), inspectedById: sqlId(raw.inspectedById ?? null, true),
      createdAtUtc: sqlUtc(raw.createdAtUtc), claimedAtUtc: time(raw.claimedAtUtc), startedAtUtc: time(raw.startedAtUtc),
      submittedAtUtc: time(raw.submittedAtUtc), completedAtUtc: time(raw.completedAtUtc), unable,
      notes: sqlText(raw.notes ?? null, 1000, true), roomVersion: sqlVersion(raw.roomVersion), ...roomState(raw) };
    if (unable && (!['PENDING', 'IN_PROGRESS'].includes(row.status) || !unable.reason.trim() || unable.actorId !== row.assignedToId)
      || row.status === 'COMPLETED' && (!row.completedAtUtc || !row.inspectedById)
      || ['IN_PROGRESS', 'INSPECTING'].includes(row.status) && !row.assignedToId) throw invalidResult();
    return { ...row, phase: taskPhase(row) };
  }
  if (resource === 'tickets') {
    const row = { ...common, description: sqlText(raw.description, 2000), priority: pick(raw.priority, priorities),
    status: pick(raw.status, ticketStatuses), reportedById: sqlId(raw.reportedById), assignedToId: sqlId(raw.assignedToId ?? null, true),
    createdAtUtc: sqlUtc(raw.createdAtUtc), resolvedAtUtc: time(raw.resolvedAtUtc),
      workMode: pick(raw.workMode, ['BLOCKING', 'NONBLOCKING', 'UNDECIDED']), notes: sqlText(raw.notes ?? null, 1000, true) };
    if (row.status === 'RESOLVED' && !row.resolvedAtUtc || row.status === 'IN_PROGRESS' && !row.assignedToId) throw invalidResult();
    return row;
  }
  if (resource === 'blocks') {
    const start = sqlUtc(raw.startsAtUtc), end = sqlUtc(raw.endsAtUtc);
    if (Date.parse(end) <= Date.parse(start)) throw invalidResult();
    return { ...common, ticketId: sqlId(raw.ticketId ?? null, true), startsAtUtc: start, endsAtUtc: end,
      reason: sqlText(raw.reason, 500), state: pick(raw.state, ['SCHEDULED', 'ACTIVE', 'ENDED', 'CANCELLED']), createdById: sqlId(raw.createdById) };
  }
  if (resource === 'items') {
    let token; try { token = stateToken(raw.stateToken); } catch { throw invalidResult(); }
    const row = { ...common, stateToken: token, stayId: sqlId(raw.stayId ?? null, true), description: sqlText(raw.description, 1000),
      foundLocation: sqlText(raw.foundLocation, 250), storageLocation: sqlText(raw.storageLocation, 250),
      status: pick(raw.status, ['STORED', 'RETURNED', 'DISPOSED']), foundById: sqlId(raw.foundById), foundAtUtc: sqlUtc(raw.foundAtUtc),
      custodianId: sqlId(raw.custodianId ?? null, true), returnedToCustomerId: sqlId(raw.returnedToCustomerId ?? null, true),
      resolvedAtUtc: time(raw.resolvedAtUtc), notes: sqlText(raw.notes ?? null, 1000, true) };
    if (row.status === 'RETURNED' && (!row.returnedToCustomerId || !row.resolvedAtUtc)
      || row.status === 'DISPOSED' && !row.resolvedAtUtc || row.status === 'STORED' && (row.resolvedAtUtc || row.returnedToCustomerId)) throw invalidResult();
    return row;
  }
  throw invalidResult();
}
export function historyDto(raw) {
  if (!raw || typeof raw !== 'object') throw invalidResult();
  return { id: sqlId(raw.id), action: sqlText(raw.action, 32), actorId: sqlId(raw.actorId), atUtc: sqlUtc(raw.atUtc),
    fromState: sqlText(raw.fromState ?? null, 32, true), toState: sqlText(raw.toState, 32), note: sqlText(raw.note ?? null, 1000, true),
    recipientEmployeeId: sqlId(raw.recipientEmployeeId ?? null, true), recipientCustomerId: sqlId(raw.recipientCustomerId ?? null, true),
    storageLocation: sqlText(raw.storageLocation ?? null, 250, true) };
}
export { pageDto };
