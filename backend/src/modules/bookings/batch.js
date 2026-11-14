import { randomUUID } from 'node:crypto';
import { bookingError } from './validation.js';
import { localTime } from '../pricing/validation.js';

// Verified in the checked-in usp_ApplyCommand script; not a live SQL approval.
export const sourceBatchLimits = Object.freeze({ maxChanges: 500, maxChangeBytes: 4000000 });
export function createBatch(limits = sourceBatchLimits) {
  const changes = []; let bytes = 4; // UTF-16 [] plus commas below.
  return Object.freeze({
    append(change) {
      const extra = Buffer.byteLength(JSON.stringify(change), 'utf16le') + (changes.length ? 2 : 0);
      if (changes.length + 1 > limits.maxChanges || bytes + extra > limits.maxChangeBytes) throw bookingError('BOOKING_BATCH_LIMIT_EXCEEDED', 'Toàn lô vượt giới hạn số dòng hoặc byte UTF-16 của SQL; không chia thành nhiều command.');
      changes.push(change); bytes += extra;
    },
    finish() { if (!changes.length) throw bookingError('EMPTY_BOOKING_COMMAND', 'Không có thay đổi hợp lệ để ghi.'); return { changes, json: JSON.stringify(changes), rowCount: changes.length, utf16Bytes: bytes }; }
  });
}
export function bookingHeader(intent, decision) {
  return { entity: 'Booking', verb: 'insert', ref: 'booking', data: { Code: 'SL-' + randomUUID(), BookingKind: intent.kind, CustomerId: intent.customerId,
    OrganizationId: intent.organizationId, GroupName: intent.groupName, ContactName: intent.contact.name, ContactPhone: intent.contact.phone,
    ContactEmail: intent.contact.email, SourceCode: intent.sourceCode, Status: decision.status, Notes: intent.notes } };
}
export function appendPricedRoom(batch, room, quote, decision, index) {
  const snapshot = quote.snapshotCandidate, timezone = snapshot?.pricingContext?.hotel?.TimeZoneIana;
  if (!snapshot || quote.committed !== false || quote.kind !== 'ESTIMATE' || quote.stayType !== room.stayType || snapshot.input.rooms !== 1
    || quote.roomTypeId !== room.roomTypeId || quote.ratePlanId !== room.ratePlanId || snapshot.input.checkInAt !== room.checkInAt
    || snapshot.input.checkOutAt !== room.checkOutAt || snapshot.input.adultsPerRoom !== room.adults || snapshot.input.childrenPerRoom !== room.children) throw bookingError('G4_SNAPSHOT_INVALID', 'G4 không trả snapshot một phòng đúng yêu cầu.', 502);
  const start = localTime(room.checkInAt, timezone), end = localTime(room.checkOutAt, timezone), ref = 'room_' + index;
  batch.append({ entity: 'BookingRoom', verb: 'insert', ref, data: { BookingId: '$booking', LineNumber: index + 1, RoomTypeId: room.roomTypeId,
    RatePlanId: room.ratePlanId, PolicyVersionId: snapshot.policyVersionId, StayType: room.stayType, ArrivalDate: start.date, DepartureDate: end.date,
    StartsAtUtc: new Date(start.ms).toISOString(), EndsAtUtc: new Date(end.ms).toISOString(), Adults: room.adults, Children: room.children,
    Status: decision.status, HoldExpiresAtUtc: decision.holdExpiresAtUtc, QuotedTotalVnd: quote.perRoom.roomBaseVnd, RateSnapshotJson: snapshot } });
  // No second rate formula: persist G4's exact per-night output. Do not use a
  // nonempty override reason to bypass a disagreement with SQL published rates.
  for (const line of snapshot.breakdown.filter(line => line.kind === 'NIGHT')) batch.append({ entity: 'BookingNightRate', verb: 'insert', data: {
    BookingRoomId: '$' + ref, NightDate: line.date, PriceVnd: line.amountPerRoomVnd, RateReason: null } });
  for (const customerId of room.guestCustomerIds) batch.append({ entity: 'BookingGuest', verb: 'insert', data: { BookingRoomId: '$' + ref, CustomerId: customerId, IsLead: customerId === room.leadCustomerId } });
  if (room.plannedRoomId) batch.append({ entity: 'RoomAllocation', verb: 'insert', data: { BookingRoomId: '$' + ref, RoomId: room.plannedRoomId,
    StartsAtUtc: new Date(start.ms).toISOString(), EndsAtUtc: new Date(end.ms).toISOString() } });
}
