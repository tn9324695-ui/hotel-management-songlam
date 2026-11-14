import { AppError } from '../../shared/errors.js';
import { shape, identifier, label, version } from '../bookings/validation.js';
import { instant } from '../pricing/validation.js';
import { priorities, resources, taskStatuses, taskTypes, ticketStatuses } from './model.js';

export const operationError = (code, message, status = 422) => new AppError(status, code, message);
const invalid = field => new AppError(400, 'VALIDATION_ERROR', 'Tham số vận hành không hợp lệ.', { [field]: 'Kiểm tra định dạng hoặc giới hạn.' });
export function stateToken(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{32,256}$/.test(value)) throw invalid('expectedStateToken');
  return value;
}
export function listQuery(resource, query) {
  const filters = resource === 'rooms' ? ['roomId', 'cleanlinessStatus', 'occupancyStatus', 'exploitationStatus']
    : resource === 'tasks' ? ['roomId', 'status', 'mine'] : resource === 'tickets' ? ['roomId', 'status', 'priority', 'mine']
      : resource === 'blocks' ? ['roomId', 'state'] : ['roomId', 'status'];
  shape(query, [...filters, 'offset', 'limit'], []);
  const result = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value !== 'string') throw invalid(key);
    if (key === 'offset' || key === 'limit') { if (!/^\d{1,7}$/.test(value) || Number(value) > (key === 'limit' ? 200 : 1000000) || key === 'limit' && Number(value) < 1) throw invalid(key); result[key] = Number(value); }
    else if (key === 'roomId') result[key] = identifier(value, key, false);
    else if (key === 'mine') { if (!['true', 'false'].includes(value)) throw invalid(key); result.mine = value === 'true'; }
    else {
      const choices = key === 'cleanlinessStatus' ? ['DIRTY', 'CLEANING', 'INSPECTING', 'CLEAN'] : key === 'occupancyStatus' ? ['VACANT', 'OCCUPIED']
        : key === 'exploitationStatus' ? ['ACTIVE', 'INACTIVE', 'MAINTENANCE'] : key === 'priority' ? priorities : key === 'state' ? ['SCHEDULED', 'ACTIVE', 'ENDED', 'CANCELLED']
          : resource === 'tasks' ? taskStatuses : resource === 'tickets' ? ticketStatuses : ['STORED', 'RETURNED', 'DISPOSED'];
      if (!choices.includes(value)) throw invalid(key); result[key] = value;
    }
  }
  return { offset: 0, limit: 50, ...result };
}
export function writeInput(resource, action, id, body) {
  const spec = resources[resource];
  if (!spec || !Object.hasOwn(spec.actions, action)) throw operationError('OPERATION_NOT_SUPPORTED', 'Thao tác chưa hỗ trợ.', 501);
  const tokenField = spec.token === 'stateToken' ? 'expectedStateToken' : 'expectedVersion';
  const extra = resource === 'tasks' && action === 'create' ? ['roomId', 'stayId', 'taskType', 'note']
    : resource === 'tickets' && action === 'create' ? ['roomId', 'description', 'priority', 'note']
      : resource === 'blocks' && action === 'create' ? ['roomId', 'ticketId', 'startsAt', 'endsAt', 'reason']
        : resource === 'items' && action === 'create' ? ['roomId', 'stayId', 'description', 'foundLocation', 'storageLocation', 'foundAt', 'note']
          : action === 'assign' ? [tokenField, 'assigneeId', 'note']
            : action === 'handoff' ? [tokenField, 'recipientEmployeeId', 'storageLocation', 'note']
              : action === 'return' ? [tokenField, 'recipientCustomerId', 'note']
                : action.startsWith('inspect-') ? [tokenField, 'expectedRoomVersion', 'note'] : [tokenField, 'note'];
  const optional = ['note', 'stayId', 'ticketId', ...(resource === 'items' && action === 'create' ? ['roomId'] : [])];
  shape(body, extra, extra.filter(key => !optional.includes(key)));
  const result = action === 'create' ? {} : { id: identifier(id, 'id', resource !== 'rooms'), [tokenField]: spec.token === 'stateToken' ? stateToken(body[tokenField]) : version(body[tokenField]) };
  for (const field of ['roomId', 'stayId', 'ticketId', 'assigneeId', 'recipientEmployeeId', 'recipientCustomerId']) {
    if (extra.includes(field)) {
      if (body[field] == null && !optional.includes(field)) throw invalid(field);
      result[field] = body[field] == null ? null : identifier(body[field], field, field !== 'roomId');
    }
  }
  result.note = label(body.note, 1000, 'note', !['unable', 'inspect-reject', 'progress', 'resolve', 'end', 'cancel', 'mark-dirty', 'handoff', 'return'].includes(action));
  if (extra.includes('description')) result.description = label(body.description, resource === 'tickets' ? 2000 : 1000, 'description');
  if (extra.includes('taskType')) { if (!taskTypes.includes(body.taskType)) throw invalid('taskType'); result.taskType = body.taskType; }
  if (extra.includes('priority')) { if (!priorities.includes(body.priority)) throw invalid('priority'); result.priority = body.priority; }
  if (extra.includes('reason')) result.reason = label(body.reason, 500, 'reason');
  if (extra.includes('expectedRoomVersion')) result.expectedRoomVersion = version(body.expectedRoomVersion);
  for (const field of ['foundLocation', 'storageLocation']) if (extra.includes(field)) result[field] = label(body[field], 250, field);
  if (extra.includes('foundAt')) {
    const found = instant(body.foundAt, 'foundAt');
    if (found.ms > Date.now()) throw invalid('foundAt');
    result.foundAt = new Date(found.ms).toISOString();
  }
  if (extra.includes('startsAt')) {
    const start = instant(body.startsAt, 'startsAt'), end = instant(body.endsAt, 'endsAt');
    if (end.ms <= start.ms) throw invalid('endsAt');
    result.startsAt = new Date(start.ms).toISOString(); result.endsAt = new Date(end.ms).toISOString();
  }
  return result;
}
