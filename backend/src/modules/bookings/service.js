import { requireBookingPermission } from '../../adapters/sql/bookings-gateway.js';
import { bookingError, createBookingInput, assignmentInput, cancellationInput, identifier, idempotencyKey } from './validation.js';
import { availabilityDto, bookingDto, financialSummary, invalidBookingSql, money, pageDto, receiptDto, sqlId, sqlUtc, sqlVersion, timelineDto } from './dto.js';
import { appendPricedRoom, bookingHeader, createBatch } from './batch.js';
import { intentHash } from './intent.js';
import { quoteAcceptanceHash } from '../pricing/engine.js';
function preparedBooking(prepared, input) {
  if (prepared.booking?.id !== input.bookingId || sqlVersion(prepared.booking.version) !== input.expectedVersion) throw bookingError('BOOKING_VERSION_CONFLICT', 'Đơn đã thay đổi hoặc ngữ cảnh không khớp; cần tải lại.', 409);
}
function targetRooms(prepared) {
  if (!Array.isArray(prepared.rooms) || !prepared.rooms.length || new Set(prepared.rooms.map(room => room.id)).size !== prepared.rooms.length) throw invalidBookingSql();
  return prepared.rooms.map(room => {
    sqlId(room.id); sqlId(room.roomTypeId); sqlVersion(room.version); sqlUtc(room.startsAtUtc); sqlUtc(room.endsAtUtc);
    if (!['HELD', 'CONFIRMED'].includes(room.status)) throw bookingError('BOOKING_ROOM_NOT_EDITABLE', 'Chỉ thay đổi/hủy phần phòng chưa nhận đang giữ quỹ.', 409);
    if (Date.parse(room.endsAtUtc) <= Date.parse(room.startsAtUtc) || !Array.isArray(room.allocations)) throw invalidBookingSql();
    const ids = new Set();
    for (const allocation of room.allocations) {
      sqlId(allocation.id); sqlId(allocation.roomId); sqlVersion(allocation.version);
      if (ids.has(allocation.id) || allocation.bookingRoomId !== room.id || allocation.isCancelled !== false) throw invalidBookingSql();
      ids.add(allocation.id);
    }
    return room;
  });
}
function releaseAllocations(batch, room) {
  for (const allocation of room.allocations) batch.append({ entity: 'RoomAllocation', verb: 'update', key: { AllocationId: allocation.id }, version: allocation.version, data: { IsCancelled: true } });
}
function addCancellationAccounting(batch, changes, reason) {
  if (!Array.isArray(changes)) throw bookingError('CANCELLATION_ACCOUNTING_INCOMPLETE', 'SQL chưa cung cấp đầy đủ các dòng nghĩa vụ giữ cọc/chờ hoàn.', 503);
  for (const change of changes) {
    // Generated only by the approved read-only SQL preparation contract. No
    // Payment/DepositMovement writes and no completed refunds are accepted.
    const data = change?.data;
    const allowed = change?.entity === 'RefundRequest' ? ['OriginalPaymentId', 'AmountVnd', 'Reason', 'Status', 'FolioId', 'DepositAccountId']
      : change?.entity === 'FolioEntry' ? ['FolioId', 'StayId', 'Kind', 'Category', 'AmountVnd', 'Description', 'OperationKey'] : null;
    if (!allowed || change.verb !== 'insert' || !data || typeof data !== 'object' || Array.isArray(data)
      || Object.keys(change).some(key => !['entity', 'verb', 'data'].includes(key)) || Object.keys(data).some(key => !allowed.includes(key)) || BigInt(money(data.AmountVnd)) <= 0n) throw invalidBookingSql();
    if (change.entity === 'RefundRequest') {
      if (data.Status !== 'PENDING' || data.Reason !== reason) throw invalidBookingSql();
      sqlId(data.OriginalPaymentId);
      if ((data.DepositAccountId === null) === (data.FolioId === null)) throw invalidBookingSql();
      if (data.DepositAccountId !== null) sqlId(data.DepositAccountId);
      if (data.FolioId !== null) sqlId(data.FolioId);
    } else {
      if (data.Kind !== 'CHARGE' || data.Category !== 'CANCELLATION' || data.StayId !== null || typeof data.Description !== 'string' || !data.Description.trim()
        || data.Description.length > 500 || typeof data.OperationKey !== 'string' || !/^[A-Za-z0-9._:-]{1,150}$/.test(data.OperationKey)) throw invalidBookingSql();
      sqlId(data.FolioId);
    }
    batch.append({ entity: change.entity, verb: 'insert', data: { ...data } });
  }
}

export function createBookingsService({ gateway, pricingService, now = () => new Date() }) {
  async function prepare(actor, operation, input, key, requestId) {
    requireBookingPermission(actor, operation); gateway.assertWrite(actor, operation);
    const digest = intentHash(input), result = await gateway.prepare(actor, operation, input, digest, idempotencyKey(key), requestId);
    return { result, digest };
  }
  function receipt(raw, actor, operation, digest, options = {}) { return receiptDto(raw, { actor, operation, intentHash: digest, ...options }); }
  return Object.freeze({
    async read(actor, operation, input, requestId) {
      requireBookingPermission(actor, operation);
      const raw = await gateway.read(actor, operation, input, requestId);
      if (operation === 'availability') return { data: availabilityDto(raw, input) };
      if (operation === 'timeline') return timelineDto(raw, input);
      if (operation === 'detail') {
        if (raw.booking === null) throw bookingError('BOOKING_NOT_FOUND', 'Không tìm thấy đơn đặt phòng.', 404);
        const result = bookingDto(raw.booking, { detail: true, financial: actor.permissions.includes('collectPayment') });
        if (result.id !== input.bookingId) throw invalidBookingSql();
        return { data: result };
      }
      if (!Array.isArray(raw.bookings)) throw invalidBookingSql();
      const rows = raw.bookings.map(row => bookingDto(row));
      if (new Set(rows.map(row => row.id)).size !== rows.length) throw invalidBookingSql();
      return { data: rows, meta: pageDto(raw.page, rows.length, input) };
    },
    async create(actor, body, key, requestId, groupOnly = false) {
      const input = { ...createBookingInput(body, groupOnly), entryPoint: groupOnly ? 'groups' : 'single' }, limits = gateway.limits;
      if (input.rooms.length > limits.maxRooms || input.rooms.reduce((sum, room) => sum + room.guestCustomerIds.length, 0) > limits.maxGuestLinks) throw bookingError('BOOKING_BATCH_LIMIT_EXCEEDED', 'Lô vượt giới hạn số phòng hoặc liên kết khách của hợp đồng SQL; không tự chia lô.');
      const { result: prepared, digest } = await prepare(actor, 'create', input, key, requestId);
      const expectedLineKeys = input.rooms.map(room => room.lineKey);
      if (prepared.replayed) return receipt(prepared.result, actor, 'create', digest, { expectedLineKeys });
      const decision = prepared.creation;
      if (!decision || !['PENDING', 'CONFIRMED'].includes(decision.status) || !Array.isArray(decision.rooms) || decision.rooms.length !== input.rooms.length
        || new Set(decision.rooms.map(room => room.lineKey)).size !== input.rooms.length || decision.rooms.some(room => !expectedLineKeys.includes(room.lineKey))
        || !Array.isArray(prepared.accountingChanges) || prepared.accountingChanges.length) throw invalidBookingSql();
      const expectedHeader = decision.rooms.some(room => room.status === 'CONFIRMED') ? 'CONFIRMED' : 'PENDING';
      if (decision.status !== expectedHeader) throw invalidBookingSql();
      for (const room of decision.rooms) {
        if (!['HELD', 'CONFIRMED'].includes(room.status) || typeof room.requiresVerifiedDeposit !== 'boolean') throw invalidBookingSql();
        // G5 does not implement a pre-booking payment-intent verification API.
        // Required deposit can only leave the new booking HELD, never "paid".
        if (room.requiresVerifiedDeposit && room.status === 'CONFIRMED') throw bookingError('VERIFIED_DEPOSIT_REQUIRED', 'Chưa có hợp đồng xác thực cọc để xác nhận đơn này; chỉ có thể giữ phòng theo chính sách SQL.', 503);
        if (room.status === 'HELD') { sqlUtc(room.holdExpiresAtUtc); if (Date.parse(room.holdExpiresAtUtc) <= now().getTime()) throw bookingError('HOLD_POLICY_EXPIRED', 'Thời hạn giữ phòng đã hết trước khi tạo đơn.', 409); }
        else if (room.holdExpiresAtUtc !== null) throw invalidBookingSql();
      }
      const batch = createBatch(limits), proofs = [];
      batch.append(bookingHeader(input, decision));
      for (let index = 0; index < input.rooms.length; index++) {
        const room = input.rooms[index], state = decision.rooms.find(item => item.lineKey === room.lineKey);
        // Read/quote calls may fail; no SQL write has happened at this point.
        const quote = await pricingService.quote(actor, room.stayType === 'NIGHTLY' ? 'nightly' : 'hourly', { roomTypeId: room.roomTypeId, ratePlanId: room.ratePlanId,
          checkInAt: room.checkInAt, checkOutAt: room.checkOutAt, rooms: 1, adultsPerRoom: room.adults, childrenPerRoom: room.children }, requestId);
        if (!quote.snapshotCandidate || quote.acceptanceHash !== quoteAcceptanceHash(quote.snapshotCandidate)) throw invalidBookingSql();
        if (room.acceptedQuoteHash !== quote.acceptanceHash) throw bookingError('BOOKING_QUOTE_CHANGED', 'Giá hoặc chính sách đã thay đổi so với báo giá đã xem. Vui lòng kiểm quỹ và xem lại báo giá trước khi xác nhận.', 409);
        appendPricedRoom(batch, room, quote, state, index);
        proofs.push({ lineKey: room.lineKey, snapshotSha256: quote.snapshotSha256, acceptanceHash: quote.acceptanceHash, quotedAt: quote.quotedAt, policy: quote.policy, approval: quote.approval });
      }
      const completed = await gateway.commit(actor, 'create', input, digest, key, prepared, batch.finish(), proofs, requestId);
      return receipt(completed, actor, 'create', digest, { expectedLineKeys });
    },
    async assign(actor, bookingId, bookingRoomId, body, key, requestId) {
      const input = { bookingId: identifier(bookingId), bookingRoomId: identifier(bookingRoomId), ...assignmentInput(body) };
      const { result: prepared, digest } = await prepare(actor, 'assign', input, key, requestId);
      const expected = { expectedBookingId: input.bookingId, expectedRoomIds: [input.bookingRoomId], expectedTargetRoomId: input.roomId };
      if (prepared.replayed) return receipt(prepared.result, actor, 'assign', digest, expected);
      preparedBooking(prepared, input);
      const rooms = targetRooms(prepared), room = rooms[0], target = prepared.targetRoom;
      if (rooms.length !== 1 || room.id !== input.bookingRoomId || target?.id !== input.roomId || target.active !== true) throw invalidBookingSql();
      if (room.allocations.length !== input.expectedAllocationVersions.length || room.allocations.some(allocation => !input.expectedAllocationVersions.some(expected => expected.id === allocation.id && expected.version === sqlVersion(allocation.version)))) throw bookingError('ASSIGNMENT_VERSION_CONFLICT', 'Phân phòng dự kiến đã đổi từ khi tải đơn; không ghi đè lựa chọn của nhân viên khác.', 409);
      if (target.roomTypeId !== room.roomTypeId) throw bookingError('ROOM_TYPE_CHANGE_REQUIRES_REQUOTE', 'Đổi hạng phòng cần luồng báo giá lại được duyệt; không tự đổi snapshot khi gán phòng.', 409);
      const batch = createBatch(gateway.limits);
      releaseAllocations(batch, room);
      batch.append({ entity: 'RoomAllocation', verb: 'insert', data: { RoomId: input.roomId, BookingRoomId: room.id, StartsAtUtc: room.startsAtUtc, EndsAtUtc: room.endsAtUtc } });
      const completed = await gateway.commit(actor, 'assign', input, digest, key, prepared, batch.finish(), [], requestId);
      return receipt(completed, actor, 'assign', digest, expected);
    },
    async cancel(actor, bookingId, body, key, requestId, partial = false) {
      const operation = partial ? 'cancel-rooms' : 'cancel', input = { bookingId: identifier(bookingId), ...cancellationInput(body, partial) };
      const { result: prepared, digest } = await prepare(actor, operation, input, key, requestId);
      if (prepared.replayed) return receipt(prepared.result, actor, operation, digest, { expectedBookingId: input.bookingId, expectedRoomIds: input.bookingRoomIds, expectedReason: input.reason });
      preparedBooking(prepared, input);
      if (!Array.isArray(prepared.receivedRoomIds)) throw invalidBookingSql();
      prepared.receivedRoomIds.forEach(id => sqlId(id));
      if (!partial && prepared.receivedRoomIds.length) throw bookingError('PARTIAL_CANCELLATION_REQUIRED', 'Đoàn đã nhận một phần; phải chọn rõ phần phòng chưa nhận để hủy.', 409);
      const rooms = targetRooms(prepared), ids = rooms.map(room => room.id);
      if (ids.some(id => prepared.receivedRoomIds.includes(id)) || partial && (ids.length !== input.bookingRoomIds.length || ids.some(id => !input.bookingRoomIds.includes(id)))) throw bookingError('CANCELLATION_SCOPE_CONFLICT', 'Phạm vi hủy có phòng đã nhận hoặc không khớp lựa chọn.', 409);
      const finance = financialSummary(prepared.depositSummary, true);
      if (!partial && BigInt(finance.remainingVnd) !== 0n) throw bookingError('CANCELLATION_MONEY_UNRESOLVED', 'Cọc của đơn hủy toàn bộ chưa được phân loại hết thành phần giữ lại/chờ hoàn.', 409);
      if (prepared.cancellationAccountingComplete !== true) throw bookingError('CANCELLATION_ACCOUNTING_INCOMPLETE', 'Chưa có đủ dữ liệu xử lý cọc khi hủy.', 503);
      const batch = createBatch(gateway.limits);
      for (const room of rooms) {
        batch.append({ entity: 'BookingRoom', verb: 'update', key: { BookingRoomId: room.id }, version: room.version, data: { Status: 'CANCELLED', CancellationReason: input.reason } });
        releaseAllocations(batch, room);
      }
      addCancellationAccounting(batch, prepared.accountingChanges, input.reason);
      const completed = await gateway.commit(actor, operation, input, digest, key, prepared, batch.finish(), [], requestId);
      return receipt(completed, actor, operation, digest, { expectedBookingId: input.bookingId, expectedRoomIds: ids, expectedReason: input.reason });
    }
  });
}
