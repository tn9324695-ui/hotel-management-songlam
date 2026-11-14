import { AppError } from '../../shared/errors.js';
import { isCalendarDate } from '../catalog/validation.js';
import { instant, pricingId } from '../pricing/validation.js';

export const bookingError = (code, message, status = 422) => new AppError(status, code, message);
const invalid = field => new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu đặt phòng không hợp lệ.', { [field]: 'Kiểm tra định dạng hoặc giới hạn.' });
export function shape(value, allowed, required = allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value, key))) throw invalid('body');
}
export function identifier(value, field = 'id', big = true) { return pricingId(value, field, big); }
export function label(value, max, field, nullable = false) {
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw invalid(field);
  return value.trim();
}
export function version(value) { if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{16}$/.test(value)) throw invalid('expectedVersion'); return value.toUpperCase().replace('0X', '0x'); }
export function idempotencyKey(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,120}$/.test(value)) throw invalid('Idempotency-Key'); return value; }
function integer(value, min, max, field) { if (!Number.isSafeInteger(value) || value < min || value > max) throw invalid(field); return value; }
function uniqueIds(values, field, maximum = 499) {
  if (!Array.isArray(values) || !values.length || values.length > maximum) throw invalid(field);
  const ids = values.map(value => identifier(value, field));
  if (new Set(ids).size !== ids.length) throw invalid(field);
  return ids;
}
export function createBookingInput(body, groupOnly = false) {
  shape(body, ['kind', 'customerId', 'organizationId', 'groupName', 'contact', 'sourceCode', 'notes', 'rooms'], ['kind', 'customerId', 'contact', 'sourceCode', 'rooms']);
  if (!['INDIVIDUAL', 'GROUP'].includes(body.kind) || groupOnly && body.kind !== 'GROUP') throw invalid('kind');
  shape(body.contact, ['name', 'phone', 'email'], ['name']);
  if (!Array.isArray(body.rooms) || !body.rooms.length || body.rooms.length > 499) {
    throw bookingError('BOOKING_BATCH_LIMIT_EXCEEDED', 'Số phòng vượt giới hạn lô hoặc không đúng loại đơn; không chia nhỏ đơn để ghi.');
  }
  const keys = new Set();
  const rooms = body.rooms.map(room => {
    shape(room, ['lineKey', 'roomTypeId', 'ratePlanId', 'stayType', 'checkInAt', 'checkOutAt', 'adults', 'children', 'guestCustomerIds', 'leadCustomerId', 'plannedRoomId', 'acceptedQuoteHash'],
      ['lineKey', 'roomTypeId', 'ratePlanId', 'stayType', 'checkInAt', 'checkOutAt', 'adults', 'children', 'acceptedQuoteHash']);
    if (typeof room.acceptedQuoteHash !== 'string' || !/^[a-f0-9]{64}$/.test(room.acceptedQuoteHash)) throw invalid('acceptedQuoteHash');
    if (typeof room.lineKey !== 'string' || !/^[A-Za-z0-9._-]{1,40}$/.test(room.lineKey) || keys.has(room.lineKey)) throw invalid('lineKey');
    keys.add(room.lineKey);
    if (!['NIGHTLY', 'HOURLY'].includes(room.stayType)) throw invalid('stayType');
    const start = instant(room.checkInAt, 'checkInAt'), end = instant(room.checkOutAt, 'checkOutAt');
    if (end.ms <= start.ms || end.ms - start.ms > 366 * 86400000) throw invalid('checkOutAt');
    const adults = integer(room.adults, 1, 32767, 'adults'), children = integer(room.children, 0, 32767, 'children');
    if (room.guestCustomerIds !== undefined && (!Array.isArray(room.guestCustomerIds) || room.guestCustomerIds.length > 499)) throw invalid('guestCustomerIds');
    const guests = (room.guestCustomerIds || []).map(value => identifier(value, 'guestCustomerIds'));
    const lead = room.leadCustomerId == null ? null : identifier(room.leadCustomerId, 'leadCustomerId');
    if (new Set(guests).size !== guests.length || lead && !guests.includes(lead) || guests.length > adults + children) throw invalid('guestCustomerIds');
    return { lineKey: room.lineKey, roomTypeId: identifier(room.roomTypeId, 'roomTypeId', false), ratePlanId: identifier(room.ratePlanId, 'ratePlanId', false), stayType: room.stayType,
      checkInAt: room.checkInAt, checkOutAt: room.checkOutAt, adults, children, guestCustomerIds: guests, leadCustomerId: lead,
      plannedRoomId: room.plannedRoomId == null ? null : identifier(room.plannedRoomId, 'plannedRoomId', false), acceptedQuoteHash: room.acceptedQuoteHash };
  });
  // Local validation is only a fast rejection; SQL must check conflicts globally.
  for (let a = 0; a < rooms.length; a++) for (let b = a + 1; b < rooms.length; b++) {
    if (Date.parse(rooms[a].checkInAt) < Date.parse(rooms[b].checkOutAt) && Date.parse(rooms[b].checkInAt) < Date.parse(rooms[a].checkOutAt)
      && rooms[a].plannedRoomId && rooms[a].plannedRoomId === rooms[b].plannedRoomId) throw bookingError('BOOKING_BATCH_CONFLICT', 'Trong cùng lô có phòng dự kiến bị trùng khoảng ở.', 409);
  }
  const minimumRows = 1 + rooms.reduce((count, room) => count + 1 + room.guestCustomerIds.length + (room.plannedRoomId ? 1 : 0), 0);
  if (minimumRows > 500) throw bookingError('BOOKING_BATCH_LIMIT_EXCEEDED', 'Lô đã vượt 500 dòng trước khi thêm giá từng đêm; không ghi một phần.');
  return { kind: body.kind, customerId: identifier(body.customerId, 'customerId'), organizationId: body.organizationId == null ? null : identifier(body.organizationId, 'organizationId'),
    groupName: body.kind === 'GROUP' ? label(body.groupName, 200, 'groupName') : null, contact: { name: label(body.contact.name, 160, 'contact.name'),
      phone: label(body.contact.phone, 30, 'contact.phone', true), email: label(body.contact.email, 254, 'contact.email', true) },
    sourceCode: label(body.sourceCode, 40, 'sourceCode'), notes: label(body.notes, 2000, 'notes', true), rooms };
}
export function assignmentInput(body) {
  shape(body, ['roomId', 'expectedVersion', 'expectedAllocationVersions']);
  if (!Array.isArray(body.expectedAllocationVersions) || body.expectedAllocationVersions.length > 499) throw invalid('expectedAllocationVersions');
  const allocations = body.expectedAllocationVersions.map(item => {
    shape(item, ['id', 'version']); return { id: identifier(item.id, 'allocationId'), version: version(item.version) };
  });
  if (new Set(allocations.map(item => item.id)).size !== allocations.length) throw invalid('expectedAllocationVersions');
  allocations.sort((a, b) => a.id.localeCompare(b.id));
  return { roomId: identifier(body.roomId, 'roomId', false), expectedVersion: version(body.expectedVersion), expectedAllocationVersions: allocations };
}
export function cancellationInput(body, partial) {
  shape(body, partial ? ['reason', 'expectedVersion', 'bookingRoomIds'] : ['reason', 'expectedVersion']);
  return { reason: label(body.reason, 1000, 'reason'), expectedVersion: version(body.expectedVersion), ...(partial ? { bookingRoomIds: uniqueIds(body.bookingRoomIds, 'bookingRoomIds') } : {}) };
}
function page(query) {
  function number(value, fallback, min, max) { if (value === undefined) return fallback; if (typeof value !== 'string' || !/^\d{1,7}$/.test(value)) throw invalid('pagination'); return integer(Number(value), min, max, 'pagination'); }
  return { offset: number(query.offset, 0, 0, 1000000), limit: number(query.limit, 50, 1, 200) };
}
export function readInput(operation, query) {
  const allowed = operation === 'availability' ? ['roomTypeId', 'from', 'to', 'checkInAt', 'checkOutAt'] : operation === 'timeline' ? ['roomTypeId', 'roomId', 'from', 'to', 'offset', 'limit']
    : ['from', 'to', 'status', 'customerId', 'code', 'offset', 'limit'];
  shape(query, allowed, operation === 'availability' ? ['roomTypeId', 'from', 'to'] : operation === 'timeline' ? ['from', 'to'] : []);
  const input = operation === 'availability' ? {} : page(query);
  if (query.from !== undefined || query.to !== undefined) {
    if (!isCalendarDate(query.from) || !isCalendarDate(query.to) || query.to <= query.from || Date.parse(query.to) - Date.parse(query.from) > 366 * 86400000) throw invalid('dateRange');
    input.from = query.from; input.to = query.to;
  }
  for (const field of ['roomTypeId', 'roomId', 'customerId']) if (query[field] !== undefined) input[field] = identifier(query[field], field, field === 'customerId');
  if (operation === 'availability' && (query.checkInAt !== undefined || query.checkOutAt !== undefined)) {
    const start=instant(query.checkInAt,'checkInAt'),end=instant(query.checkOutAt,'checkOutAt');
    if(end.ms<=start.ms||end.ms-start.ms>366*86400000)throw invalid('checkOutAt');
    const localDate=ms=>new Date(ms+420*60000).toISOString().slice(0,10);
    if(localDate(start.ms)!==input.from||localDate(end.ms)>input.to)throw invalid('dateRange');
    input.checkInAt=query.checkInAt;input.checkOutAt=query.checkOutAt;
  }
  if (query.status !== undefined) {
    if (!['PENDING', 'CONFIRMED', 'PARTIALLY_CHECKED_IN', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(query.status)) throw invalid('status');
    input.status = query.status;
  }
  if (query.code !== undefined) input.code = label(query.code, 40, 'code');
  return input;
}
