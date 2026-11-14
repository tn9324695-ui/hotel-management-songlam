import { createHash, randomUUID } from 'node:crypto';
import { createBatch } from '../bookings/batch.js';
import { bookingError } from '../bookings/validation.js';
import { money, sqlId, sqlUtc, sqlVersion } from '../bookings/dto.js';
import { calculateQuote } from '../pricing/engine.js';
import { priceSnapshotHash } from '../pricing/stay-change.js';
import { invalidStaySql, roomState } from './dto.js';

const operationKey = (actor, op, key, unit, category) => 's6:' + createHash('sha256').update([actor.appUserId, op, key, unit, category].join('|')).digest('hex');
function ready(raw) {
  const room = roomState(raw);
  if (room.occupancyStatus !== 'VACANT' || room.cleanlinessStatus !== 'CLEAN' || room.exploitationStatus !== 'ACTIVE') throw bookingError('ROOM_NOT_READY', 'Phòng đích chưa trống, sạch hoặc đang khai thác.', 409);
  return room;
}
function approvedRoomType(prepared, bookingRoomId, requestedType, target) {
  if (target.roomTypeId === requestedType) return;
  const approval = prepared.upgrade;
  if (!approval || approval.status !== 'APPROVED' || approval.bookingRoomId !== bookingRoomId || approval.targetRoomId !== target.id
    || approval.targetRoomTypeId !== target.roomTypeId || approval.policyHash !== prepared.policy?.hash) throw bookingError('ROOM_TYPE_CHANGE_NOT_APPROVED', 'Đổi hạng phòng chưa có phê duyệt SQL đúng phạm vi.', 409);
  sqlId(approval.id); sqlId(approval.approvedByUserId);
  if (approval.priceEffect !== 'NO_CHANGE') throw bookingError('UPGRADE_REQUOTE_REQUIRED', 'Thay đổi hạng có tiền cần hợp đồng báo giá/chốt lại riêng.', 503);
}
function openFolio(raw, bookingId, bookingRoomId) {
  if (!raw || raw.status !== 'OPEN' || raw.bookingId !== bookingId || raw.bookingRoomId !== null && raw.bookingRoomId !== bookingRoomId) throw bookingError('OPEN_FOLIO_REQUIRED', 'Cần folio mở đúng đơn/phòng theo hợp đồng SQL; không tự tạo folio rời.', 503);
  sqlId(raw.id); sqlVersion(raw.version); return raw.id;
}
function checkInFolio(batch, unit, booking, booked, index, profile) {
  if (unit.folio) return openFolio(unit.folio, booking.id, booked.id);
  const creation = unit.folioCreation;
  if (profile !== 'ATOMIC_ROOM_FOLIO_V1' || creation?.profile !== profile || creation.kind !== 'ROOM'
    || creation.bookingId !== booking.id || creation.bookingRoomId !== booked.id
    || creation.payerCustomerId !== booking.customerId || creation.payerOrganizationId !== null) {
    throw bookingError('CHECK_IN_FOLIO_CONTRACT_MISSING', 'Nhận phòng cần tạo folio cùng transaction; chưa có hợp đồng được duyệt, không mở folio bằng lệnh rời.', 503);
  }
  const ref = 'checkin_folio_' + index;
  batch.append({ entity: 'Folio', verb: 'insert', ref, data: { Code: 'FO-' + randomUUID(), BookingId: sqlId(booking.id), BookingRoomId: sqlId(booked.id),
    Kind: 'ROOM', Status: 'OPEN', PayerCustomerId: sqlId(creation.payerCustomerId), PayerOrganizationId: null } });
  return '$' + ref;
}
function charge(batch, folioId, stayId, category, amountVnd, description, key) {
  if (BigInt(money(amountVnd)) === 0n) return;
  batch.append({ entity: 'FolioEntry', verb: 'insert', data: { FolioId: folioId, StayId: stayId, Kind: 'CHARGE', Category: category, AmountVnd: amountVnd, Description: description, OperationKey: key } });
}
export function currentStay(prepared, input) {
  const stay = prepared.stay, room = prepared.bookingRoom, allocation = prepared.currentAllocation, segment = prepared.currentSegment;
  if (!stay || stay.id !== input.stayId || stay.status !== 'IN_HOUSE' || stay.checkedOutAtUtc !== null || sqlVersion(stay.version) !== input.expectedVersion
    || !room || room.id !== stay.bookingRoomId || room.status !== 'IN_HOUSE' || sqlVersion(room.version) !== input.bookingRoomVersion
    || !segment || segment.id !== input.currentSegmentId || segment.stayId !== stay.id || segment.departedAtUtc !== null
    || !allocation || allocation.id !== input.currentAllocationId || segment.allocationId !== allocation.id || segment.roomId !== allocation.roomId
    || allocation.bookingRoomId !== room.id || allocation.isCancelled !== false || sqlVersion(allocation.version) !== input.currentAllocationVersion) throw bookingError('STAY_VERSION_CONFLICT', 'Lượt ở hoặc hiện diện/phân phòng đã thay đổi; cần tải lại.', 409);
  sqlId(stay.bookingId); sqlId(room.id); sqlId(room.roomTypeId); sqlId(segment.roomId);
  if (!Number.isInteger(room.adults) || room.adults < 1 || room.adults > 32767 || !Number.isInteger(room.children) || room.children < 0 || room.children > 32767) throw invalidStaySql();
  sqlUtc(stay.checkedInAtUtc); sqlUtc(stay.expectedOutAtUtc); sqlUtc(room.startsAtUtc); sqlUtc(room.endsAtUtc); sqlUtc(segment.arrivedAtUtc); sqlUtc(allocation.startsAtUtc); sqlUtc(allocation.endsAtUtc);
  if (Date.parse(stay.expectedOutAtUtc) !== Date.parse(room.endsAtUtc) || Date.parse(stay.expectedOutAtUtc) > Date.parse(allocation.endsAtUtc)) throw invalidStaySql();
  if (!stay.pricingSnapshot || !room.pricingSnapshot || priceSnapshotHash(stay.pricingSnapshot) !== priceSnapshotHash(room.pricingSnapshot)) throw bookingError('LOCKED_PRICE_SNAPSHOT_CONFLICT', 'Snapshot của lượt ở và phần đặt phòng không khớp; không tự lấy giá mới sửa lại.', 409);
  return { stay, room, allocation, segment };
}
export function compileCheckIn(prepared, input, limits, actor, key, nowMs, folioProfile = null) {
  if (prepared.booking?.id !== input.bookingId || sqlVersion(prepared.booking.version) !== input.expectedVersion || !Array.isArray(prepared.units)
    || prepared.units.length !== input.rooms.length || new Set(prepared.units.map(unit => unit.bookingRoom?.id)).size !== input.rooms.length) throw invalidStaySql();
  const at = sqlUtc(prepared.checkedInAtUtc);
  if (Date.parse(at) > nowMs) throw bookingError('FUTURE_CHECK_IN_FORBIDDEN', 'Không ghi nhận khách đang ở bằng giờ nhận phòng tương lai.', 409);
  if (prepared.chargingMode !== 'FROZEN_ROOM_AND_AGREED_EARLY_V1') throw bookingError('CHECK_IN_CHARGE_POLICY_MISSING', 'Chưa có chính sách hạch toán phí đã chốt khi nhận phòng.', 503);
  const batch = createBatch(limits);
  for (let index = 0; index < input.rooms.length; index++) {
    const requested = input.rooms[index], unit = prepared.units.find(item => item.bookingRoom?.id === requested.bookingRoomId);
    if (!unit) throw invalidStaySql();
    const booked = unit.bookingRoom, physical = ready(unit.room), allocation = unit.allocation;
    if (booked.bookingId !== input.bookingId || booked.status !== 'CONFIRMED' || unit.existingStayId !== null || sqlVersion(booked.version) !== requested.expectedVersion) throw bookingError('BOOKING_ROOM_NOT_RECEIVABLE', 'Phần đặt phòng chưa xác nhận, đã nhận hoặc đã đổi phiên bản.', 409);
    if (physical.id !== requested.roomId || physical.version !== requested.roomVersion || !allocation || allocation.id !== requested.allocationId
      || sqlVersion(allocation.version) !== requested.allocationVersion || allocation.roomId !== physical.id || allocation.bookingRoomId !== booked.id || allocation.isCancelled !== false) throw bookingError('ALLOCATION_VERSION_CONFLICT', 'Phòng dự kiến hoặc phiên bản phân phòng không khớp.', 409);
    sqlUtc(booked.startsAtUtc); sqlUtc(booked.endsAtUtc); sqlUtc(allocation.startsAtUtc); sqlUtc(allocation.endsAtUtc);
    if (Date.parse(at) < Date.parse(booked.startsAtUtc)) throw bookingError('EARLY_ARRIVAL_REQUIRES_BOOKING_CHANGE', 'Nhận trước khoảng đã chốt cần điều chỉnh đặt phòng và giá được duyệt trước.', 409);
    if (Date.parse(at) >= Date.parse(booked.endsAtUtc) || Date.parse(at) < Date.parse(allocation.startsAtUtc) || Date.parse(booked.endsAtUtc) > Date.parse(allocation.endsAtUtc)) throw bookingError('ALLOCATION_INTERVAL_CONFLICT', 'Giờ thực tế/phòng phân không phủ đủ khoảng lưu trú.', 409);
    if (!Number.isInteger(booked.adults) || booked.adults < 1 || !Number.isInteger(booked.children) || booked.children < 0 || !Number.isInteger(unit.room.maxOccupancy)
      || booked.adults + booked.children > unit.room.maxOccupancy || requested.guestCustomerIds.length > booked.adults + booked.children || unit.guestRosterVerified !== true) throw bookingError('STAY_GUEST_VALIDATION_REQUIRED', 'Khách hoặc sức chứa chưa được SQL xác minh.', 409);
    approvedRoomType({ ...prepared, upgrade: unit.upgrade }, booked.id, booked.roomTypeId, physical);
    const deposit = unit.depositRequirement;
    if (!deposit || typeof deposit.required !== 'boolean' || deposit.required && (deposit.satisfied !== true || deposit.paymentState !== 'VERIFIED_SUCCEEDED') || !deposit.required && deposit.paymentState !== 'NOT_REQUIRED') throw bookingError('VERIFIED_DEPOSIT_REQUIRED', 'Không có cọc/đảm bảo đã được xác thực theo chính sách; pending không được tính đã thu.', 409);
    const snapshot = booked.pricingSnapshot;
    if (snapshot?.schema !== 'songlam.quote.snapshot.v1' || snapshot.engineVersion !== 'songlam.pricing.v1' || snapshot.input?.rooms !== 1) throw bookingError('COMMITTED_PRICE_FORMAT_UNSUPPORTED', 'Snapshot giá đã chốt cần mapper G4 được duyệt; không lấy bảng giá mới thay thế.', 501);
    const original = calculateQuote(snapshot.pricingContext, snapshot.input, booked.stayType, snapshot.quotedAt);
    const validatedSnapshot = { ...original.snapshotCandidate, sourceQuoteId: snapshot.sourceQuoteId };
    if (typeof snapshot.sourceQuoteId !== 'string' || !/^[a-f0-9-]{36}$/i.test(snapshot.sourceQuoteId) || priceSnapshotHash(snapshot) !== priceSnapshotHash(validatedSnapshot)) throw bookingError('COMMITTED_PRICE_FORMAT_UNSUPPORTED', 'Snapshot không khớp profile G4 đã chốt; cần mapper được duyệt, không sửa/ngầm chuẩn hóa giá.', 501);
    if (original.perRoom.roomBaseVnd !== money(booked.quotedRoomBaseVnd) || snapshot.roomBaseVnd !== original.perRoom.roomBaseVnd || snapshot.policyHash !== original.policy.hash
      || snapshot.boundarySurchargesVnd !== original.perRoom.boundarySurchargesVnd || snapshot.accommodationTotalVnd !== original.perRoom.accommodationTotalVnd
      || snapshot.policyVersionId !== booked.policyVersionId || original.ratePlanId !== booked.ratePlanId || original.roomTypeId !== booked.roomTypeId
      || Date.parse(snapshot.input.checkInAt) !== Date.parse(booked.startsAtUtc) || Date.parse(snapshot.input.checkOutAt) !== Date.parse(booked.endsAtUtc)
      || snapshot.input.adultsPerRoom !== booked.adults || snapshot.input.childrenPerRoom !== booked.children) throw invalidStaySql();
    if (booked.stayType === 'HOURLY' && prepared.hourlyBillingAnchor !== 'BOOKED_INTERVAL') throw bookingError('HOURLY_CHECK_IN_POLICY_MISSING', 'Chưa chốt cách giữ giá gói giờ khi nhận thực tế khác giờ đã đặt.', 503);
    const folioId = checkInFolio(batch, unit, prepared.booking, booked, index, folioProfile), ref = 'stay_' + index;
    batch.append({ entity: 'BookingRoom', verb: 'update', key: { BookingRoomId: booked.id }, version: booked.version, data: { Status: 'IN_HOUSE' } });
    batch.append({ entity: 'Stay', verb: 'insert', ref, data: { Code: 'ST-' + randomUUID(), BookingRoomId: booked.id, Status: 'IN_HOUSE', CheckedInAtUtc: at, ExpectedOutAtUtc: booked.endsAtUtc, PricingSnapshotJson: validatedSnapshot } });
    batch.append({ entity: 'StayRoomSegment', verb: 'insert', data: { StayId: '$' + ref, AllocationId: allocation.id, RoomId: physical.id, ArrivedAtUtc: at } });
    for (const customerId of requested.guestCustomerIds) batch.append({ entity: 'StayGuest', verb: 'insert', data: { StayId: '$' + ref, CustomerId: customerId, ArrivedAtUtc: at, IsLead: customerId === requested.leadCustomerId } });
    charge(batch, folioId, '$' + ref, 'ROOM', original.perRoom.roomBaseVnd, 'Giá phòng đã chốt', operationKey(actor, 'check-in', key, booked.id, 'room'));
    if (booked.stayType === 'NIGHTLY') charge(batch, folioId, '$' + ref, 'SURCHARGE', original.breakdown.find(line => line.kind === 'EARLY_ARRIVAL').amountPerRoomVnd, 'Phụ thu nhận sớm đã thỏa thuận', operationKey(actor, 'check-in', key, booked.id, 'early'));
  }
  return { batch: batch.finish(), proof: { source: 'COMMITTED_G4_BOOKING_SNAPSHOTS', snapshotHashes: prepared.units.map(unit => ({ bookingRoomId: unit.bookingRoom.id, hash: priceSnapshotHash(unit.bookingRoom.pricingSnapshot) })) } };
}
export function compileTransfer(prepared, input, limits, nowMs) {
  const { stay, room, allocation, segment } = currentStay(prepared, input), target = ready(prepared.targetRoom), at = sqlUtc(prepared.effectiveAtUtc);
  if (target.id !== input.targetRoomId || target.version !== input.targetRoomVersion || target.id === segment.roomId) throw bookingError('TRANSFER_TARGET_CONFLICT', 'Phòng đích/phiên bản không hợp lệ hoặc trùng phòng hiện tại.', 409);
  if (Date.parse(at) > nowMs || Date.parse(at) < Date.parse(segment.arrivedAtUtc) || Date.parse(at) <= Date.parse(allocation.startsAtUtc) || Date.parse(at) >= Date.parse(stay.expectedOutAtUtc)) throw bookingError('TRANSFER_TIME_CONFLICT', 'Thời điểm chuyển không nằm trong khoảng lưu trú/hiện diện hợp lệ.', 409);
  if (!Number.isInteger(prepared.targetRoom.maxOccupancy) || prepared.targetRoom.maxOccupancy < room.adults + room.children) throw bookingError('ROOM_CAPACITY_EXCEEDED', 'Phòng đích không đủ sức chứa.', 409);
  approvedRoomType(prepared, room.id, room.roomTypeId, target);
  const batch = createBatch(limits);
  batch.append({ entity: 'StayRoomSegment', verb: 'update', key: { SegmentId: segment.id }, data: { DepartedAtUtc: at, TransferReason: input.reason } });
  batch.append({ entity: 'RoomAllocation', verb: 'update', key: { AllocationId: allocation.id }, version: allocation.version, data: { EndsAtUtc: at } });
  batch.append({ entity: 'RoomAllocation', verb: 'insert', ref: 'transfer_allocation', data: { RoomId: target.id, BookingRoomId: room.id, StartsAtUtc: at, EndsAtUtc: stay.expectedOutAtUtc } });
  batch.append({ entity: 'StayRoomSegment', verb: 'insert', data: { StayId: stay.id, AllocationId: '$transfer_allocation', RoomId: target.id, ArrivedAtUtc: at, TransferReason: input.reason } });
  return { batch: batch.finish(), proof: { priceUnchanged: true, sourceSnapshotHash: priceSnapshotHash(stay.pricingSnapshot), oldRoomId: segment.roomId, newRoomId: target.id, effectiveAtUtc: at, reason: input.reason } };
}
export function compilePriceChange(prepared, input, proposal, limits, actor, key) {
  const { stay, room, allocation } = currentStay(prepared, input);
  if (proposal.beforeSnapshotHash !== priceSnapshotHash(stay.pricingSnapshot) || proposal.stayId !== stay.id || proposal.stayType !== room.stayType
    || proposal.roomTypeId !== room.roomTypeId || proposal.ratePlanId !== room.ratePlanId || proposal.policyVersionId !== room.policyVersionId
    || Date.parse(proposal.oldExpectedOutAtUtc) !== Date.parse(stay.expectedOutAtUtc) || Date.parse(proposal.startsAtUtc) !== Date.parse(room.startsAtUtc) || proposal.before.roomBaseVnd !== money(room.quotedRoomBaseVnd)) throw bookingError('STAY_PRICE_VERSION_CONFLICT', 'Đề xuất G4 không khớp giá/phiên bản đã chốt của lượt ở.', 409);
  if (!Array.isArray(prepared.bookingNightRates)) throw invalidStaySql();
  const old = new Map(prepared.bookingNightRates.map(row => [row.date, money(row.priceVnd)]));
  if (old.size !== prepared.bookingNightRates.length || proposal.beforeNightlyRates.length !== old.size || proposal.beforeNightlyRates.some(row => old.get(row.date) !== row.priceVnd)) throw invalidStaySql();
  const folioId = openFolio(prepared.folio, stay.bookingId, room.id), batch = createBatch(limits), next = new Map(proposal.nightlyRates.map(row => [row.date, row.priceVnd]));
  batch.append({ entity: 'BookingRoom', verb: 'update', key: { BookingRoomId: room.id }, version: room.version, data: { ArrivalDate: proposal.arrivalDate, DepartureDate: proposal.departureDate,
    StartsAtUtc: room.startsAtUtc, EndsAtUtc: proposal.newExpectedOutAtUtc, QuotedTotalVnd: proposal.after.roomBaseVnd, RateSnapshotJson: proposal.snapshotCandidate } });
  for (const [date, price] of old) {
    if (!next.has(date)) batch.append({ entity: 'BookingNightRate', verb: 'delete', key: { BookingRoomId: room.id, NightDate: date }, data: {} });
    else if (next.get(date) !== price) throw bookingError('LOCKED_NIGHT_PRICE_CHANGED', 'Không thay giá đêm đã chốt.', 409);
  }
  for (const row of proposal.nightlyRates) if (!old.has(row.date)) batch.append({ entity: 'BookingNightRate', verb: 'insert', data: { BookingRoomId: room.id, NightDate: row.date, PriceVnd: row.priceVnd, RateReason: null } });
  batch.append({ entity: 'RoomAllocation', verb: 'update', key: { AllocationId: allocation.id }, version: allocation.version, data: { EndsAtUtc: proposal.newExpectedOutAtUtc } });
  batch.append({ entity: 'Stay', verb: 'update', key: { StayId: stay.id }, version: stay.version, data: { ExpectedOutAtUtc: proposal.newExpectedOutAtUtc, PricingSnapshotJson: proposal.snapshotCandidate } });
  for (let index = 0; index < proposal.ledgerChanges.length; index++) {
    const row = proposal.ledgerChanges[index];
    batch.append({ entity: 'FolioEntry', verb: 'insert', data: { FolioId: folioId, StayId: stay.id, Kind: row.kind, Category: row.category, AmountVnd: row.amountVnd, Description: row.description,
      ReversesEntryId: row.reversesEntryId, OperationKey: operationKey(actor, input.direction, key, stay.id, String(index)) } });
  }
  return { batch: batch.finish(), proof: proposal };
}
