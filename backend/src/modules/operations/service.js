import { assertActor } from '../auth/security.js';
import { intentHash } from '../bookings/intent.js';
import { resources } from './model.js';
import { operationError, writeInput } from './validation.js';
import { recordDto, historyDto, pageDto, invalidResult } from './dto.js';
import { sqlUtc } from '../bookings/dto.js';

export function requireOperationPermission(actor, resource, action = 'read', inspectionAuthorization) {
  assertActor(actor);
  const rights = action === 'read' ? resources[resource]?.read : resources[resource]?.actions[action];
  if (!rights || !rights.every(right => actor.permissions.includes(right))) throw operationError('FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.', 403);
  if (action.startsWith('inspect-') && !(inspectionAuthorization?.approved === true
    && typeof inspectionAuthorization.reference === 'string' && inspectionAuthorization.reference.trim()
    && typeof inspectionAuthorization.permissionCode === 'string' && inspectionAuthorization.permissionCode.trim()
    && actor.permissions.includes(inspectionAuthorization.permissionCode))) {
    throw operationError('INSPECTION_AUTHORIZATION_PENDING', 'Chưa có quyền nghiệm thu được phê duyệt; công việc vẫn chờ kiểm tra.', 503);
  }
}
function transition(resource, action, row, actor) {
  const mine = row.assignedToId === actor.appUserId;
  if (resource === 'tasks') {
    if (action === 'claim') return row.status === 'PENDING' && !row.assignedToId && !row.unable;
    if (action === 'assign') return row.status === 'PENDING' && !row.unable;
    if (action === 'start') return row.phase === 'CLAIMED' && mine;
    if (action === 'submit') return row.phase === 'CLEANING' && mine;
    if (action === 'unable') return ['CLAIMED', 'CLEANING'].includes(row.phase) && mine;
    if (action === 'resume') return row.phase === 'UNABLE' && mine;
    if (action.startsWith('inspect-')) return row.phase === 'AWAITING_INSPECTION' && !mine;
  }
  if (resource === 'tickets') {
    if (action === 'claim') return row.status === 'OPEN' && !row.assignedToId;
    if (action === 'assign') return row.status === 'OPEN';
    if (action === 'start') return row.status === 'OPEN' && mine && row.workMode !== 'UNDECIDED';
    if (['progress', 'resolve'].includes(action)) return row.status === 'IN_PROGRESS' && mine;
  }
  if (resource === 'blocks') return action === 'cancel' ? row.state === 'SCHEDULED' : action === 'end' && row.state === 'ACTIVE';
  if (resource === 'items') return row.status === 'STORED' && row.custodianId === actor.appUserId;
  return resource === 'rooms' && action === 'mark-dirty' && row.cleanlinessStatus !== 'DIRTY';
}
export function createOperationsService({ gateway }) {
  function allowed(actor, resource, action, row) {
    try {
      requireOperationPermission(actor, resource, action, gateway.inspectionAuthorization);
      return gateway.supports(resource, action) && (!row || transition(resource, action, row, actor));
    } catch { return false; }
  }
  const decorate = (actor, resource, row) => ({ ...row,
    allowedActions: Object.keys(resources[resource].actions).filter(action => action !== 'create' && allowed(actor, resource, action, row)) });
  function capabilities(actor) {
    assertActor(actor);
    return { resources: Object.fromEntries(Object.keys(resources).map(resource => {
      const permitted = resources[resource].read.every(right => actor.permissions.includes(right));
      return [resource, { visible: permitted, readable: permitted && gateway.supports(resource, 'read'),
        maxLimit: gateway.supports(resource, 'read') ? gateway.maxLimit : null,
        creatable: allowed(actor, resource, 'create'), code: permitted && !gateway.supports(resource, 'read') ? 'OPERATIONS_CONTRACT_NOT_APPROVED' : null }];
    })), inspection: { enabled: allowed(actor, 'tasks', 'inspect-approve'),
      message: 'Chỉ nghiệm thu khi quyền riêng và hợp đồng SQL nguyên tử đã được phê duyệt. Dọn xong chỉ chuyển sang chờ kiểm tra.' } };
  }
  async function read(actor, resource, operation, input, requestId) {
    requireOperationPermission(actor, resource);
    const raw = await gateway.read(actor, resource, operation, input, requestId);
    if (raw.resource !== resource || raw.operation !== operation || operation !== 'list' && raw.recordId !== input.id) throw invalidResult();
    const asOfUtc = sqlUtc(raw.asOfUtc);
    if (operation === 'detail') {
      if (raw.row === null) throw operationError('NOT_FOUND', 'Không tìm thấy bản ghi.', 404);
      const row = recordDto(resource, raw.row);
      if (row.id !== input.id) throw invalidResult();
      return { data: decorate(actor, resource, row), meta: { asOfUtc } };
    }
    if (!Array.isArray(raw.rows) || raw.rows.length > input.limit) throw invalidResult();
    const rows = operation === 'history' ? raw.rows.map(historyDto) : raw.rows.map(row => decorate(actor, resource, recordDto(resource, row)));
    if (new Set(rows.map(row => row.id)).size !== rows.length) throw invalidResult();
    return { data: rows, meta: { ...pageDto(raw.page, rows.length, input), asOfUtc } };
  }
  async function write(actor, resource, action, id, body, key, requestId) {
    requireOperationPermission(actor, resource, action, gateway.inspectionAuthorization);
    const input = writeInput(resource, action, id, body);
    if (action === 'handoff' && input.recipientEmployeeId === actor.appUserId) throw operationError('SAME_CUSTODIAN', 'Người nhận bàn giao phải khác người đang giữ đồ.');
    const digest = intentHash({ resource, action, input });
    // Exactly one atomic RPC, including state/ownership checks, CAS, audit and receipt.
    // No read-then-write claim and no application-side multi-command transaction.
    const raw = await gateway.execute(actor, resource, action, input, digest, key, requestId);
    if (raw.committed !== true || typeof raw.replayed !== 'boolean' || raw.actorId !== actor.appUserId
      || raw.resource !== resource || raw.action !== action || raw.intentHash !== digest || raw.idempotencyKey !== key) throw invalidResult();
    const row = recordDto(resource, raw.row), event = historyDto(raw.event);
    if (action !== 'create' && row.id !== id || event.actorId !== actor.appUserId || event.action !== action) throw invalidResult();
    let before = null;
    if (action !== 'create') {
      before = recordDto(resource, raw.before);
      const field = resource === 'items' ? 'stateToken' : 'version', expectedField = resource === 'items' ? 'expectedStateToken' : 'expectedVersion';
      if (before.id !== row.id || before[field] !== input[expectedField] || row[field] === before[field]
        || !transition(resource, action, before, actor)) throw invalidResult();
      if (action.startsWith('inspect-') && before.roomVersion !== input.expectedRoomVersion) throw invalidResult();
    } else if ((raw.before ?? null) !== null) throw invalidResult();
    const expected = resource === 'tasks' ? { create: 'QUEUED', claim: 'CLAIMED', assign: 'CLAIMED', start: 'CLEANING', submit: 'AWAITING_INSPECTION', unable: 'UNABLE', 'inspect-approve': 'COMPLETED', 'inspect-reject': 'CLEANING' }
      : resource === 'tickets' ? { create: 'OPEN', claim: 'OPEN', assign: 'OPEN', start: 'IN_PROGRESS', progress: 'IN_PROGRESS', resolve: 'RESOLVED' }
        : resource === 'blocks' ? { cancel: 'CANCELLED', end: 'ENDED' } : resource === 'items' ? { create: 'STORED', handoff: 'STORED', return: 'RETURNED' } : { 'mark-dirty': 'DIRTY' };
    const state = resource === 'tasks' ? row.phase : resource === 'rooms' ? row.cleanlinessStatus : resource === 'blocks' ? row.state : row.status;
    if (expected[action] && state !== expected[action] || event.toState !== state) throw invalidResult();
    const beforeState = before === null ? null : resource === 'tasks' ? before.phase : resource === 'rooms' ? before.cleanlinessStatus : resource === 'blocks' ? before.state : before.status;
    if (event.fromState !== beforeState) throw invalidResult();
    if (action === 'resume' && row.phase !== (before.status === 'PENDING' ? 'CLAIMED' : 'CLEANING')) throw invalidResult();
    if (action === 'create' && (row.roomId !== input.roomId || resource === 'tasks' && row.taskType !== input.taskType
      || resource === 'tickets' && (row.reportedById !== actor.appUserId || row.description !== input.description || row.priority !== input.priority)
      || resource === 'items' && (row.description !== input.description || row.foundLocation !== input.foundLocation || row.storageLocation !== input.storageLocation || row.foundAtUtc !== input.foundAt)
      || resource === 'blocks' && (row.createdById !== actor.appUserId || row.reason !== input.reason))) throw invalidResult();
    if (event.note !== (input.note ?? input.reason ?? null)) throw invalidResult();
    if (action === 'unable' && row.unable?.reason !== input.note) throw invalidResult();
    if (['claim', 'start', 'submit', 'unable', 'resume', 'progress', 'resolve'].includes(action) && ['tasks', 'tickets'].includes(resource) && row.assignedToId !== actor.appUserId
      || action === 'assign' && row.assignedToId !== input.assigneeId
      || resource === 'items' && (action === 'create' && (row.foundById !== actor.appUserId || row.custodianId !== actor.appUserId)
        || action === 'handoff' && (row.custodianId !== input.recipientEmployeeId || event.recipientEmployeeId !== input.recipientEmployeeId || row.storageLocation !== input.storageLocation)
        || action === 'return' && (row.returnedToCustomerId !== input.recipientCustomerId || event.recipientCustomerId !== input.recipientCustomerId || !row.resolvedAtUtc))) throw invalidResult();
    if (action === 'inspect-approve' && (row.inspectedById !== actor.appUserId || row.cleanlinessStatus !== 'CLEAN')
      || resource === 'blocks' && action === 'create' && (!['ACTIVE', 'SCHEDULED'].includes(row.state) || row.roomId !== input.roomId || row.startsAtUtc !== input.startsAt || row.endsAtUtc !== input.endsAt)) throw invalidResult();
    if (resource === 'tasks' && (action === 'start' && row.cleanlinessStatus !== 'CLEANING'
      || action === 'submit' && row.cleanlinessStatus !== 'INSPECTING'
      || action === 'inspect-reject' && row.cleanlinessStatus !== 'CLEANING')) throw invalidResult();
    return { committed: true, replayed: raw.replayed, row: decorate(actor, resource, row), event };
  }
  return Object.freeze({ capabilities, read, write });
}
