import { bookingError, version } from './validation.js';
import { isCalendarDate } from '../catalog/validation.js';
import { nightDates } from '../pricing/validation.js';

export const invalidBookingSql = () => bookingError('BOOKING_SQL_RESPONSE_INVALID', 'SQL không trả đúng hợp đồng đặt phòng đã cấu hình.', 502);
export function sqlId(value, nullable = false) { if (nullable && value === null) return null; if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) throw invalidBookingSql(); return value; }
export function sqlText(value, max, nullable = false) { if (nullable && value === null) return null; if (typeof value !== 'string' || value.length > max) throw invalidBookingSql(); return value; }
export function sqlInteger(value, max = 2147483647) { if (!Number.isSafeInteger(value) || value < 0 || value > max) throw invalidBookingSql(); return value; }
export function sqlUtc(value) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) || !isCalendarDate(value.slice(0, 10)) || !Number.isFinite(Date.parse(value))) throw invalidBookingSql(); return value; }
export function sqlVersion(value) { try { return version(value); } catch { throw invalidBookingSql(); } }
export function money(value) { if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,18})$/.test(value)) throw invalidBookingSql(); return value; }
function choose(value, values) { if (!values.includes(value)) throw invalidBookingSql(); return value; }
export const bookingStatuses = Object.freeze(['PENDING', 'CONFIRMED', 'PARTIALLY_CHECKED_IN', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW']);
const roomStatuses = ['HELD', 'CONFIRMED', 'IN_HOUSE', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

export function financialSummary(raw, cancellation = false) {
  if (!raw) throw invalidBookingSql();
  const result = {};
  for (const field of ['collectedVnd', 'refundedVnd', 'appliedVnd', 'retainedVnd', 'pendingRefundVnd', 'remainingVnd', 'receivedAllocationBeforeVnd', 'receivedAllocationAfterVnd']) result[field] = money(raw[field]);
  if (BigInt(result.collectedVnd) !== ['refundedVnd', 'appliedVnd', 'retainedVnd', 'pendingRefundVnd', 'remainingVnd'].reduce((sum, field) => sum + BigInt(result[field]), 0n)) throw invalidBookingSql();
  if (cancellation && result.receivedAllocationBeforeVnd !== result.receivedAllocationAfterVnd) throw bookingError('DEPOSIT_REALLOCATION_FORBIDDEN', 'Hủy phần chưa nhận không được tự dồn cọc sang phòng đã nhận.', 409);
  if (raw.refundExecution !== 'NOT_EXECUTED') throw bookingError('REFUND_EXECUTION_OUT_OF_SCOPE', 'G5 không thực hiện giao dịch hoàn tiền.', 502);
  return { ...result, refundExecution: 'NOT_EXECUTED' };
}
function bookingRoom(raw) {
  if (!raw || typeof raw !== 'object') throw invalidBookingSql();
  const status = choose(raw.status, roomStatuses), start = sqlUtc(raw.startsAtUtc), end = sqlUtc(raw.endsAtUtc);
  if (Date.parse(end) <= Date.parse(start) || !isCalendarDate(raw.arrivalDate) || !isCalendarDate(raw.departureDate)) throw invalidBookingSql();
  if (!Array.isArray(raw.allocations) || new Set(raw.allocations.map(row => row.id)).size !== raw.allocations.length) throw invalidBookingSql();
  const allocations = raw.allocations.map(row => {
    if (!row || typeof row !== 'object') throw invalidBookingSql();
    const startsAtUtc = sqlUtc(row.startsAtUtc), endsAtUtc = sqlUtc(row.endsAtUtc);
    if (Date.parse(endsAtUtc) <= Date.parse(startsAtUtc)) throw invalidBookingSql();
    return { id: sqlId(row.id), roomId: sqlId(row.roomId), version: sqlVersion(row.version), startsAtUtc, endsAtUtc };
  });
  const reason = sqlText(raw.cancellationReason, 1000, true);
  if (status === 'CANCELLED' && !reason?.trim()) throw invalidBookingSql();
  const base = money(raw.quotedRoomBaseVnd), surcharge = money(raw.estimatedBoundarySurchargesVnd), total = money(raw.estimatedAccommodationTotalVnd);
  if (BigInt(base) + BigInt(surcharge) !== BigInt(total) || !['ESTIMATE', 'LOCKED'].includes(raw.priceState)
    || ['CONFIRMED', 'IN_HOUSE', 'COMPLETED'].includes(status) && raw.priceState !== 'LOCKED' || status === 'HELD' && raw.priceState !== 'ESTIMATE') throw invalidBookingSql();
  if (!Array.isArray(raw.guests)) throw invalidBookingSql();
  const guests = raw.guests.map(guest => {
    if (!guest || typeof guest.isLead !== 'boolean') throw invalidBookingSql();
    return { customerId: sqlId(guest.customerId), isLead: guest.isLead };
  });
  if (new Set(guests.map(guest => guest.customerId)).size !== guests.length || guests.filter(guest => guest.isLead).length > 1 || !raw.adults) throw invalidBookingSql();
  return { id: sqlId(raw.id), roomTypeId: sqlId(raw.roomTypeId), ratePlanId: sqlId(raw.ratePlanId), policyVersionId: sqlId(raw.policyVersionId),
    stayType: choose(raw.stayType, ['NIGHTLY', 'HOURLY']), arrivalDate: raw.arrivalDate, departureDate: raw.departureDate, startsAtUtc: start, endsAtUtc: end,
    adults: sqlInteger(raw.adults, 32767), children: sqlInteger(raw.children, 32767), status, version: sqlVersion(raw.version), cancellationReason: reason,
    quotedRoomBaseVnd: base, estimatedBoundarySurchargesVnd: surcharge, estimatedAccommodationTotalVnd: total, priceState: raw.priceState,
    plannedRoomIds: [...new Set(allocations.map(row => row.roomId))], allocations, guests };
}
export function bookingDto(raw, { detail = false, financial = false } = {}) {
  if (!raw || typeof raw !== 'object') throw invalidBookingSql();
  const result = { id: sqlId(raw.id), code: sqlText(raw.code, 40), kind: choose(raw.kind, ['INDIVIDUAL', 'GROUP', 'WALK_IN']), status: choose(raw.status, bookingStatuses),
    version: sqlVersion(raw.version), customerId: sqlId(raw.customerId), groupName: sqlText(raw.groupName, 200, true), contactName: sqlText(raw.contactName, 160),
    contactPhone: sqlText(raw.contactPhone, 30, true), roomCount: sqlInteger(raw.roomCount), createdAtUtc: sqlUtc(raw.createdAtUtc) };
  if (!result.roomCount) throw invalidBookingSql();
  if (detail) {
    if (!Array.isArray(raw.rooms) || raw.rooms.length !== result.roomCount) throw invalidBookingSql();
    result.rooms = raw.rooms.map(bookingRoom);
    if (new Set(result.rooms.map(room => room.id)).size !== result.rooms.length) throw invalidBookingSql();
    result.totals = { quotedRoomBaseVnd: result.rooms.reduce((sum, room) => sum + BigInt(room.quotedRoomBaseVnd), 0n).toString(),
      estimatedBoundarySurchargesVnd: result.rooms.reduce((sum, room) => sum + BigInt(room.estimatedBoundarySurchargesVnd), 0n).toString(),
      estimatedAccommodationTotalVnd: result.rooms.reduce((sum, room) => sum + BigInt(room.estimatedAccommodationTotalVnd), 0n).toString() };
    if (financial) result.depositSummary = financialSummary(raw.depositSummary);
  }
  return result;
}
export function pageDto(raw, count, query) {
  if (!raw || raw.offset !== query.offset || raw.limit !== query.limit || count > query.limit || !(raw.hasMore === null || typeof raw.hasMore === 'boolean')) throw invalidBookingSql();
  if (raw.total !== null && (typeof raw.total !== 'string' || !/^\d{1,19}$/.test(raw.total))) throw invalidBookingSql();
  return { offset: query.offset, limit: query.limit, returned: count, total: raw.total, hasMore: raw.hasMore };
}
export function availabilityDto(raw, input) {
  if (!raw || raw.from !== input.from || raw.to !== input.to || raw.roomTypeId !== input.roomTypeId || raw.complete !== true
    || raw.interval !== '[start,end)' || raw.countBasis !== 'SAME_INSTANT_AT_MIN_AVAILABLE' || !Array.isArray(raw.nights)) throw invalidBookingSql();
  const dates = nightDates(input.from, input.to);
  if (raw.nights.length !== dates.length) throw invalidBookingSql();
  const nights = raw.nights.map((row, index) => {
    if (row.date !== dates[index]) throw invalidBookingSql();
    const counts = {};
    for (const field of ['capacity', 'reservedUnreceived', 'occupied', 'blocked', 'available']) counts[field] = sqlInteger(row[field]);
    if (counts.capacity !== counts.reservedUnreceived + counts.occupied + counts.blocked + counts.available) throw invalidBookingSql();
    return { date: row.date, ...counts };
  });
  return { kind: 'AVAILABILITY_ESTIMATE', reservationCreated: false, interval: '[start,end)', asOfUtc: sqlUtc(raw.asOfUtc), timeZone: sqlText(raw.timeZone, 100),
    roomTypeId: input.roomTypeId, from: input.from, to: input.to, nights, minimumAvailable: Math.min(...nights.map(row => row.available)) };
}
export function timelineDto(raw, input) {
  if (!raw || raw.from !== input.from || raw.to !== input.to || !Array.isArray(raw.segments)) throw invalidBookingSql();
  const windowStart = sqlUtc(raw.windowStartsAtUtc), windowEnd = sqlUtc(raw.windowEndsAtUtc);
  if (Date.parse(windowEnd) <= Date.parse(windowStart)) throw invalidBookingSql();
  const segments = raw.segments.map(row => {
    const start = sqlUtc(row.startsAtUtc), end = sqlUtc(row.endsAtUtc), kind = choose(row.kind, ['BOOKING', 'STAY', 'BLOCK']);
    if (Date.parse(start) >= Date.parse(end) || Date.parse(start) >= Date.parse(windowEnd) || Date.parse(end) <= Date.parse(windowStart)) throw invalidBookingSql();
    const roomId = sqlId(row.roomId, kind === 'BOOKING'), roomTypeId = sqlId(row.roomTypeId);
    if (input.roomId && roomId !== input.roomId || input.roomTypeId && roomTypeId !== input.roomTypeId) throw invalidBookingSql();
    return { id: sqlText(row.id, 100), kind, roomId, roomTypeId, startsAtUtc: start, endsAtUtc: end,
      bookingId: sqlId(row.bookingId, kind === 'BLOCK'), bookingRoomId: sqlId(row.bookingRoomId, kind === 'BLOCK'),
      status: kind === 'BOOKING' ? choose(row.status, ['HELD', 'CONFIRMED']) : kind === 'STAY' ? choose(row.status, ['IN_HOUSE', 'CHECKED_OUT']) : 'BLOCKED' };
  });
  if (new Set(segments.map(row => row.id)).size !== segments.length) throw invalidBookingSql();
  const bookingSegments = new Map();
  for (const segment of segments) {
    if (segment.kind === 'BLOCK') continue;
    const prior = bookingSegments.get(segment.bookingRoomId) || [];
    if (prior.some(other => other.kind !== segment.kind && Date.parse(other.startsAtUtc) < Date.parse(segment.endsAtUtc) && Date.parse(segment.startsAtUtc) < Date.parse(other.endsAtUtc))) throw invalidBookingSql();
    prior.push(segment); bookingSegments.set(segment.bookingRoomId, prior);
  }
  return { data: { from: input.from, to: input.to, interval: '[start,end)', asOfUtc: sqlUtc(raw.asOfUtc), timeZone: sqlText(raw.timeZone, 100), segments }, meta: pageDto(raw.page, segments.length, input) };
}
export function receiptDto(raw, { actor, operation, intentHash, expectedLineKeys, expectedRoomIds, expectedReason, expectedBookingId, expectedTargetRoomId }) {
  if (!raw || raw.actorId !== actor.appUserId || raw.operation !== operation || raw.intentHash !== intentHash || raw.status !== 'SUCCEEDED'
    || raw.committed !== true || raw.atomic !== true || raw.inventoryCheckedUnderLock !== true || typeof raw.replayed !== 'boolean') throw invalidBookingSql();
  const booking = bookingDto(raw.booking);
  if (expectedBookingId && booking.id !== expectedBookingId) throw invalidBookingSql();
  if (operation === 'create' && (!['PENDING', 'CONFIRMED'].includes(booking.status) || booking.roomCount !== expectedLineKeys?.length)) throw invalidBookingSql();
  if (!Array.isArray(raw.rooms) || !raw.rooms.length || raw.rooms.some(row => !row || typeof row !== 'object') || new Set(raw.rooms.map(row => row.id)).size !== raw.rooms.length) throw invalidBookingSql();
  if (expectedLineKeys && (raw.rooms.length !== expectedLineKeys.length || new Set(raw.rooms.map(row => row.lineKey)).size !== expectedLineKeys.length || raw.rooms.some(row => !expectedLineKeys.includes(row.lineKey)))) throw invalidBookingSql();
  if (expectedRoomIds && (raw.rooms.length !== expectedRoomIds.length || raw.rooms.some(row => !expectedRoomIds.includes(row.id)))) throw invalidBookingSql();
  if (raw.rooms.some(row => operation.startsWith('cancel') ? row.status !== 'CANCELLED' || row.cancellationReason !== expectedReason : !['HELD', 'CONFIRMED'].includes(row.status))) throw invalidBookingSql();
  let assignment;
  if (operation === 'assign') {
    const value = raw.assignment;
    if (!value || value.roomId !== expectedTargetRoomId || value.bookingRoomId !== expectedRoomIds?.[0] || value.isCancelled !== false) throw invalidBookingSql();
    assignment = { id: sqlId(value.id), bookingRoomId: sqlId(value.bookingRoomId), roomId: sqlId(value.roomId), version: sqlVersion(value.version),
      startsAtUtc: sqlUtc(value.startsAtUtc), endsAtUtc: sqlUtc(value.endsAtUtc), isCancelled: false };
    if (Date.parse(assignment.endsAtUtc) <= Date.parse(assignment.startsAtUtc)) throw invalidBookingSql();
  }
  return { operationId: sqlText(raw.operationId, 80), operation, committed: true, replayed: raw.replayed, booking,
    rooms: raw.rooms.map(row => ({ id: sqlId(row.id), lineKey: row.lineKey == null ? null : sqlText(row.lineKey, 40), status: choose(row.status, roomStatuses), version: sqlVersion(row.version),
      ...(operation.startsWith('cancel') ? { cancellationReason: row.cancellationReason } : {}) })),
    ...(assignment ? { assignment } : {}), depositSummary: financialSummary(raw.depositSummary, operation.startsWith('cancel')) };
}
