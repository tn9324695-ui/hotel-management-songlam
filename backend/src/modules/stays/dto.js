import { bookingError } from '../bookings/validation.js';
import { sqlId, sqlText, sqlUtc, sqlVersion } from '../bookings/dto.js';
import { stayPriceTotals } from '../pricing/stay-change.js';

export const invalidStaySql = () => bookingError('STAY_SQL_RESPONSE_INVALID', 'SQL không trả đúng hợp đồng lưu trú.', 502);
function state(value, values) { if (!values.includes(value)) throw invalidStaySql(); return value; }
export function roomState(raw) {
  if (!raw || typeof raw !== 'object') throw invalidStaySql();
  return { id: sqlId(raw.id), roomTypeId: sqlId(raw.roomTypeId), version: sqlVersion(raw.version),
    occupancyStatus: state(raw.occupancyStatus, ['VACANT', 'OCCUPIED']), cleanlinessStatus: state(raw.cleanlinessStatus, ['CLEAN', 'DIRTY', 'CLEANING', 'INSPECTING']),
    exploitationStatus: state(raw.exploitationStatus, ['ACTIVE', 'INACTIVE', 'MAINTENANCE']) };
}
export function stayDto(raw, { detail = false, canReadGuests = false, canReadSegments = false } = {}) {
  if (!raw || typeof raw !== 'object') throw invalidStaySql();
  const result = { id: sqlId(raw.id), code: sqlText(raw.code, 40), bookingId: sqlId(raw.bookingId), bookingRoomId: sqlId(raw.bookingRoomId),
    status: state(raw.status, ['IN_HOUSE', 'CHECKED_OUT']), checkedInAtUtc: sqlUtc(raw.checkedInAtUtc), expectedOutAtUtc: sqlUtc(raw.expectedOutAtUtc),
    checkedOutAtUtc: raw.checkedOutAtUtc === null ? null : sqlUtc(raw.checkedOutAtUtc), version: sqlVersion(raw.version), bookingRoomVersion: sqlVersion(raw.bookingRoomVersion) };
  if (Date.parse(result.expectedOutAtUtc) <= Date.parse(result.checkedInAtUtc)
    || result.status === 'IN_HOUSE' && result.checkedOutAtUtc !== null || result.status === 'CHECKED_OUT' && (result.checkedOutAtUtc === null || Date.parse(result.checkedOutAtUtc) < Date.parse(result.checkedInAtUtc))) throw invalidStaySql();
  if (detail && canReadGuests) {
    if (!Array.isArray(raw.guests) || !raw.guests.length) throw invalidStaySql();
    result.guests = raw.guests.map(guest => {
      if (!guest || typeof guest.isLead !== 'boolean') throw invalidStaySql();
      const arrived = sqlUtc(guest.arrivedAtUtc), departed = guest.departedAtUtc === null ? null : sqlUtc(guest.departedAtUtc);
      if (Date.parse(arrived) < Date.parse(result.checkedInAtUtc) || departed && Date.parse(departed) < Date.parse(arrived)) throw invalidStaySql();
      return { customerId: sqlId(guest.customerId), isLead: guest.isLead, arrivedAtUtc: arrived, departedAtUtc: departed };
    });
    if (new Set(result.guests.map(guest => guest.customerId)).size !== result.guests.length || result.guests.filter(guest => guest.isLead).length !== 1) throw invalidStaySql();
  }
  if (detail && canReadSegments) {
    if (!Array.isArray(raw.segments) || !raw.segments.length) throw invalidStaySql();
    result.segments = raw.segments.map(segment => {
      if (!segment) throw invalidStaySql();
      const arrived = sqlUtc(segment.arrivedAtUtc), departed = segment.departedAtUtc === null ? null : sqlUtc(segment.departedAtUtc);
      if (Date.parse(arrived) < Date.parse(result.checkedInAtUtc) || departed && Date.parse(departed) < Date.parse(arrived)) throw invalidStaySql();
      return { id: sqlId(segment.id), roomId: sqlId(segment.roomId), allocationId: sqlId(segment.allocationId), allocationVersion: sqlVersion(segment.allocationVersion), arrivedAtUtc: arrived, departedAtUtc: departed };
    });
    if (new Set(result.segments.map(segment => segment.id)).size !== result.segments.length || result.segments.filter(segment => segment.departedAtUtc === null).length !== (result.status === 'IN_HOUSE' ? 1 : 0)) throw invalidStaySql();
  }
  if (detail) result.pricing = { ...stayPriceTotals(raw.pricing), policyVersionId: sqlId(raw.pricing?.policyVersionId), priceState: state(raw.pricing?.priceState, ['LOCKED']) };
  return result;
}
export function readinessDto(raw, input) {
  const transfer = Boolean(input.stayId);
  if (!raw || input.bookingRoomId && raw.bookingRoomId !== input.bookingRoomId || transfer && raw.stayId !== input.stayId) throw invalidStaySql();
  sqlId(raw.bookingRoomId);
  const room = raw.room === null ? null : roomState(raw.room), blockers = [];
  if (input.roomId && room?.id !== input.roomId) throw invalidStaySql();
  const status = state(raw.bookingRoomStatus, ['HELD', 'CONFIRMED', 'IN_HOUSE', 'COMPLETED', 'CANCELLED', 'NO_SHOW']);
  const starts = sqlUtc(raw.startsAtUtc), ends = sqlUtc(raw.endsAtUtc), asOfUtc = sqlUtc(raw.asOfUtc);
  if (Date.parse(ends) <= Date.parse(starts)) throw invalidStaySql();
  if (status !== (transfer ? 'IN_HOUSE' : 'CONFIRMED')) blockers.push(transfer ? 'STAY_NOT_IN_HOUSE' : 'BOOKING_ROOM_NOT_CONFIRMED');
  if (Date.parse(asOfUtc) < Date.parse(starts)) blockers.push('BEFORE_CONFIRMED_ARRIVAL');
  if (Date.parse(asOfUtc) >= Date.parse(ends)) blockers.push('AFTER_CONFIRMED_DEPARTURE');
  if (!room) blockers.push('ROOM_ASSIGNMENT_REQUIRED');
  else {
    if (room.occupancyStatus !== 'VACANT') blockers.push('ROOM_OCCUPIED');
    if (room.cleanlinessStatus !== 'CLEAN') blockers.push('ROOM_NOT_CLEAN');
    if (room.exploitationStatus !== 'ACTIVE') blockers.push('ROOM_NOT_ACTIVE');
  }
  let allocation = null;
  if (!transfer && raw.allocation !== null) {
    const item = raw.allocation;
    if (!item || !room || item.roomId !== room.id || item.bookingRoomId !== input.bookingRoomId || item.isCancelled !== false) throw invalidStaySql();
    allocation = { id: sqlId(item.id), version: sqlVersion(item.version), startsAtUtc: sqlUtc(item.startsAtUtc), endsAtUtc: sqlUtc(item.endsAtUtc) };
    if (Date.parse(allocation.startsAtUtc) > Date.parse(asOfUtc) || Date.parse(allocation.endsAtUtc) <= Date.parse(asOfUtc) || Date.parse(allocation.endsAtUtc) < Date.parse(ends)) blockers.push('ALLOCATION_DOES_NOT_COVER_STAY');
  } else if (!transfer) blockers.push('ROOM_ASSIGNMENT_REQUIRED');
  if (typeof raw.intervalConflict !== 'boolean') throw invalidStaySql();
  if (raw.intervalConflict) blockers.push('ROOM_INTERVAL_CONFLICT');
  for (const [field, code] of [['roomTypeCompatible', 'ROOM_TYPE_MISMATCH'], ['capacityFits', 'ROOM_CAPACITY_EXCEEDED']]) {
    if (raw[field] !== undefined) {
      if (typeof raw[field] !== 'boolean') throw invalidStaySql();
      if (!raw[field]) blockers.push(code);
    }
  }
  return { bookingRoomId: raw.bookingRoomId, ...(transfer ? { stayId: input.stayId } : {}), bookingRoomVersion: sqlVersion(raw.bookingRoomVersion), asOfUtc, room, allocation,
    roomReady: Boolean(room && room.occupancyStatus === 'VACANT' && room.cleanlinessStatus === 'CLEAN' && room.exploitationStatus === 'ACTIVE'),
    blockers: [...new Set(blockers)], checkInGuaranteed: false, requiresLockedPolicyAndGuestChecks: true };
}

export function mutationReceipt(raw, actor, digest, operation, input, proof) {
  if (!raw || raw.actorId !== actor.appUserId || raw.intentHash !== digest || raw.operation !== operation || raw.status !== 'SUCCEEDED'
    || raw.committed !== true || raw.atomic !== true || raw.inventoryCheckedUnderLock !== true || typeof raw.replayed !== 'boolean'
    || raw.folioClosed !== false || raw.paymentActions !== 'NOT_PERFORMED' || raw.refundActions !== 'NOT_PERFORMED' || raw.reason !== input.reason) throw invalidStaySql();
  const stay = stayDto(raw.stay);
  if (stay.id !== input.stayId || stay.status !== 'IN_HOUSE') throw invalidStaySql();
  const result = { operationId: sqlText(raw.operationId, 80), operation, committed: true, replayed: raw.replayed, stay, reason: input.reason,
    folioClosed: false, paymentActions: 'NOT_PERFORMED', refundActions: 'NOT_PERFORMED' };
  if (operation === 'transfer-room') {
    if (raw.newRoomId !== input.targetRoomId || raw.oldSegmentId !== input.currentSegmentId || raw.priceUnchanged !== true
      || typeof raw.beforeSnapshotHash !== 'string' || !/^[a-f0-9]{64}$/.test(raw.beforeSnapshotHash) || raw.beforeSnapshotHash !== raw.afterSnapshotHash
      || proof && raw.beforeSnapshotHash !== proof.sourceSnapshotHash) throw invalidStaySql();
    const at = sqlUtc(raw.effectiveAtUtc);
    if (proof && (raw.oldRoomId !== proof.oldRoomId || Date.parse(at) !== Date.parse(proof.effectiveAtUtc))) throw invalidStaySql();
    result.transfer = { oldRoomId: sqlId(raw.oldRoomId), newRoomId: sqlId(raw.newRoomId), oldSegmentId: sqlId(raw.oldSegmentId), newSegmentId: sqlId(raw.newSegmentId), effectiveAtUtc: at, priceUnchanged: true };
    if (result.transfer.oldRoomId === result.transfer.newRoomId || result.transfer.oldSegmentId === result.transfer.newSegmentId) throw invalidStaySql();
  } else {
    if (Date.parse(stay.expectedOutAtUtc) !== Date.parse(input.newExpectedOutAt) || typeof raw.beforeSnapshotHash !== 'string' || !/^[a-f0-9]{64}$/.test(raw.beforeSnapshotHash)
      || typeof raw.afterSnapshotHash !== 'string' || !/^[a-f0-9]{64}$/.test(raw.afterSnapshotHash) || proof && (raw.beforeSnapshotHash !== proof.beforeSnapshotHash || raw.afterSnapshotHash !== proof.afterSnapshotHash)) throw invalidStaySql();
    result.priceHistory = { beforeSnapshotHash: raw.beforeSnapshotHash, afterSnapshotHash: raw.afterSnapshotHash };
    result.priceBefore = stayPriceTotals(raw.priceBefore); result.priceAfter = stayPriceTotals(raw.priceAfter);
    if (proof && Object.keys(result.priceBefore).some(key => result.priceBefore[key] !== proof.before[key] || result.priceAfter[key] !== proof.after[key])) throw invalidStaySql();
  }
  return result;
}
export function checkInReceipt(raw, actor, digest, input) {
  if (!raw || raw.actorId !== actor.appUserId || raw.intentHash !== digest || raw.operation !== 'check-in' || raw.status !== 'SUCCEEDED'
    || raw.committed !== true || raw.atomic !== true || raw.readinessCheckedUnderLock !== true || typeof raw.replayed !== 'boolean'
    || raw.bookingId !== input.bookingId || !['PARTIALLY_CHECKED_IN', 'CHECKED_IN'].includes(raw.bookingStatus)
    || raw.paymentActions !== 'NOT_PERFORMED' || raw.depositActions !== 'NOT_PERFORMED' || !Array.isArray(raw.stays) || raw.stays.length !== input.rooms.length) throw invalidStaySql();
  const stays = raw.stays.map(item => {
    const stay = stayDto(item);
    const requested = input.rooms.find(room => room.bookingRoomId === stay.bookingRoomId);
    if (!requested || stay.status !== 'IN_HOUSE' || stay.bookingId !== input.bookingId || item.roomId !== requested.roomId) throw invalidStaySql();
    return { ...stay, roomId: sqlId(item.roomId) };
  });
  if (new Set(stays.map(stay => stay.id)).size !== stays.length || new Set(stays.map(stay => stay.bookingRoomId)).size !== stays.length) throw invalidStaySql();
  return { operationId: sqlText(raw.operationId, 80), committed: true, replayed: raw.replayed, bookingId: input.bookingId, bookingStatus: raw.bookingStatus,
    bookingVersion: sqlVersion(raw.bookingVersion), stays, paymentActions: 'NOT_PERFORMED', depositActions: 'NOT_PERFORMED' };
}
