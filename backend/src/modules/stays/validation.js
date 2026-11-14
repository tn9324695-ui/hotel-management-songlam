import { bookingError, identifier, shape, version } from '../bookings/validation.js';
import { isCalendarDate } from '../catalog/validation.js';
import { instant } from '../pricing/validation.js';

const invalid = field => bookingError('VALIDATION_ERROR', 'Dữ liệu lưu trú không hợp lệ: ' + field + '.', 400);
export function checkInInput(body) {
  shape(body, ['bookingId', 'expectedVersion', 'rooms']);
  if (!Array.isArray(body.rooms) || !body.rooms.length || body.rooms.length > 499) throw invalid('rooms');
  const units = body.rooms.map(room => {
    shape(room, ['bookingRoomId', 'expectedVersion', 'roomId', 'roomVersion', 'allocationId', 'allocationVersion', 'guestCustomerIds', 'leadCustomerId']);
    if (!Array.isArray(room.guestCustomerIds) || !room.guestCustomerIds.length || room.guestCustomerIds.length > 499) throw invalid('guestCustomerIds');
    const guests = room.guestCustomerIds.map(id => identifier(id, 'guestCustomerIds'));
    const lead = identifier(room.leadCustomerId, 'leadCustomerId');
    if (new Set(guests).size !== guests.length || !guests.includes(lead)) throw invalid('leadCustomerId');
    return { bookingRoomId: identifier(room.bookingRoomId), expectedVersion: version(room.expectedVersion), roomId: identifier(room.roomId, 'roomId', false),
      roomVersion: version(room.roomVersion), allocationId: identifier(room.allocationId), allocationVersion: version(room.allocationVersion), guestCustomerIds: guests, leadCustomerId: lead };
  });
  if (new Set(units.map(unit => unit.bookingRoomId)).size !== units.length || new Set(units.map(unit => unit.roomId)).size !== units.length) throw invalid('rooms');
  if (units.reduce((count, unit) => count + 3 + unit.guestCustomerIds.length, 0) > 500) throw bookingError('STAY_BATCH_LIMIT_EXCEEDED', 'Lô nhận phòng vượt 500 thay đổi ngay trước khi thêm phí; không chia lô.');
  return { bookingId: identifier(body.bookingId), expectedVersion: version(body.expectedVersion), rooms: units };
}
export function stayReadInput(operation, query) {
  const allowed = operation === 'arrivals' ? ['date', 'bookingId', 'offset', 'limit'] : operation === 'readiness' ? ['bookingRoomId', 'stayId', 'roomId']
    : ['status', 'bookingId', 'roomId', 'from', 'to', 'offset', 'limit'];
  shape(query, allowed, operation === 'arrivals' ? ['date'] : []);
  const result = {};
  for (const field of ['bookingRoomId', 'bookingId', 'roomId', 'stayId']) if (query[field] !== undefined) result[field] = identifier(query[field], field, field !== 'roomId');
  if (operation === 'readiness') {
    if (Boolean(result.bookingRoomId) === Boolean(result.stayId) || result.stayId && !result.roomId) throw invalid('bookingRoomId/stayId/roomId');
    return result;
  }
  for (const [field, maximum, fallback] of [['offset', 1000000, 0], ['limit', 200, 50]]) {
    const value = query[field];
    if (value !== undefined && (typeof value !== 'string' || !/^\d{1,7}$/.test(value) || Number(value) > maximum || field === 'limit' && Number(value) < 1)) throw invalid(field);
    result[field] = value === undefined ? fallback : Number(value);
  }
  if (operation === 'arrivals') { if (!isCalendarDate(query.date)) throw invalid('date'); result.date = query.date; }
  if (query.status !== undefined) { if (!['IN_HOUSE', 'CHECKED_OUT'].includes(query.status)) throw invalid('status'); result.status = query.status; }
  if (query.from !== undefined || query.to !== undefined) {
    if (!isCalendarDate(query.from) || !isCalendarDate(query.to) || query.to <= query.from || Date.parse(query.to) - Date.parse(query.from) > 366 * 86400000) throw invalid('dateRange');
    result.from = query.from; result.to = query.to;
  }
  return result;
}

export function stayMutationInput(stayId, operation, body, { preview = false } = {}) {
  if (!['transfer-room', 'extend', 'shorten'].includes(operation) || preview && operation === 'transfer-room') throw invalid('operation');
  const common = ['expectedVersion', 'bookingRoomVersion', 'currentSegmentId', 'currentAllocationId', 'currentAllocationVersion', 'reason'];
  const fields = operation === 'transfer-room' ? [...common, 'targetRoomId', 'targetRoomVersion'] : [...common, 'newExpectedOutAt', ...(!preview ? ['acceptedProposalHash'] : [])];
  shape(body, fields);
  const result = { stayId: identifier(stayId), expectedVersion: version(body.expectedVersion), bookingRoomVersion: version(body.bookingRoomVersion),
    currentSegmentId: identifier(body.currentSegmentId), currentAllocationId: identifier(body.currentAllocationId), currentAllocationVersion: version(body.currentAllocationVersion),
    reason: typeof body.reason === 'string' ? body.reason.trim() : '' };
  if (!result.reason || result.reason.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result.reason)) throw invalid('reason');
  if (operation === 'transfer-room') { result.targetRoomId = identifier(body.targetRoomId, 'targetRoomId', false); result.targetRoomVersion = version(body.targetRoomVersion); }
  else {
    instant(body.newExpectedOutAt, 'newExpectedOutAt'); result.newExpectedOutAt = body.newExpectedOutAt;
    if (!preview) {
      if (typeof body.acceptedProposalHash !== 'string' || !/^[a-f0-9]{64}$/.test(body.acceptedProposalHash)) throw invalid('acceptedProposalHash');
      result.acceptedProposalHash = body.acceptedProposalHash;
    }
  }
  return result;
}
