import { idempotencyKey, bookingError } from '../bookings/validation.js';
import { intentHash } from '../bookings/intent.js';
import { pageDto, sqlId, sqlText, sqlUtc, sqlVersion } from '../bookings/dto.js';
import { requireStayPermission } from '../../adapters/sql/stays-gateway.js';
import { priceSnapshotHash, stayChangeAcceptanceHash } from '../pricing/stay-change.js';
import { randomUUID } from 'node:crypto';
import { instant } from '../pricing/validation.js';
import { checkInInput, stayMutationInput } from './validation.js';
import { checkInReceipt, invalidStaySql, mutationReceipt, readinessDto, stayDto } from './dto.js';
import { compileCheckIn, compilePriceChange, compileTransfer, currentStay } from './commands.js';

export function createStaysService({ gateway, pricingService, now = () => new Date() }) {
  async function priceChange(actor, operation, input, prepared, requestId) {
    const { stay } = currentStay(prepared, input), at = sqlUtc(prepared.effectiveAtUtc), end = instant(input.newExpectedOutAt, 'newExpectedOutAt').ms;
    if (Date.parse(at) > now().getTime() || end <= Date.parse(at) || end <= now().getTime() || end <= Date.parse(stay.checkedInAtUtc)) throw bookingError('UNUSED_INTERVAL_REQUIRED', 'Chỉ điều chỉnh phần thời gian chưa sử dụng; trả phòng thực tế thuộc quyết toán.', 409);
    if (operation === 'extend' && end <= Date.parse(stay.expectedOutAtUtc) || operation === 'shorten' && end >= Date.parse(stay.expectedOutAtUtc)) throw bookingError('STAY_INTERVAL_DIRECTION_INVALID', 'Ngày trả mới không đúng chiều gia hạn/trả sớm.', 400);
    return pricingService.quoteStayChange(actor, { stayId: input.stayId, direction: operation, expectedVersion: input.expectedVersion,
      bookingRoomVersion: input.bookingRoomVersion, newExpectedOutAt: input.newExpectedOutAt, reason: input.reason, sourceSnapshotHash: priceSnapshotHash(stay.pricingSnapshot) }, requestId);
  }
  async function prepare(actor, operation, input, key, requestId) {
    gateway.assertWrite(actor, operation, input); idempotencyKey(key);
    const digest = intentHash(input), prepared = await gateway.prepare(actor, operation, input, digest, key, requestId);
    return { digest, prepared };
  }
  return Object.freeze({
    async previewPriceChange(actor, operation, stayId, body, requestId) {
      const input = stayMutationInput(stayId, operation, body, { preview: true });
      // Approved prepare must be read-only. This private throwaway key never
      // becomes a business receipt and cannot reuse a browser write key.
      const { prepared } = await prepare(actor, operation, input, 'preview:' + randomUUID(), requestId);
      if (prepared.replayed) throw invalidStaySql();
      const proposal = await priceChange(actor, operation, input, prepared, requestId);
      return { kind: proposal.kind, committed: false, stayId, direction: operation, quotedAt: proposal.quotedAt,
        before: proposal.before, after: proposal.after, differenceVnd: proposal.differenceVnd,
        oldExpectedOutAtUtc: proposal.oldExpectedOutAtUtc, newExpectedOutAtUtc: proposal.newExpectedOutAtUtc,
        nightlyRates: proposal.nightlyRates, policyVersionId: proposal.policyVersionId,
        acceptanceHash: stayChangeAcceptanceHash(proposal), refundExecution: 'NOT_PERFORMED' };
    },
    async read(actor, operation, input, requestId) {
      requireStayPermission(actor, operation, input);
      const raw = await gateway.read(actor, operation, input, requestId);
      if (operation === 'readiness') {
        if (raw.readiness === null) throw bookingError('STAY_RESOURCE_NOT_FOUND', 'Không tìm thấy phần đặt/phòng/lượt ở phù hợp.', 404);
        return { data: readinessDto(raw.readiness, input) };
      }
      if (operation === 'detail') {
        if (raw.stay === null) throw bookingError('STAY_NOT_FOUND', 'Không tìm thấy lượt lưu trú.', 404);
        const result = stayDto(raw.stay, { detail: true, canReadGuests: actor.permissions.includes('manageCheckIn'), canReadSegments: actor.permissions.includes('viewRoomRack') });
        if (result.id !== input.stayId) throw invalidStaySql();
        return { data: result };
      }
      if (operation === 'arrivals') {
        if (raw.date !== input.date || !Array.isArray(raw.arrivals)) throw invalidStaySql();
        const rows = raw.arrivals.map(row => {
          if (!row || !['HELD', 'CONFIRMED', 'IN_HOUSE'].includes(row.status) || input.bookingId && row.bookingId !== input.bookingId) throw invalidStaySql();
          return { bookingId: sqlId(row.bookingId), bookingCode: sqlText(row.bookingCode, 40), bookingVersion: sqlVersion(row.bookingVersion),
            bookingRoomId: sqlId(row.bookingRoomId), bookingRoomVersion: sqlVersion(row.bookingRoomVersion), roomTypeId: sqlId(row.roomTypeId),
            startsAtUtc: sqlUtc(row.startsAtUtc), endsAtUtc: sqlUtc(row.endsAtUtc), status: row.status, plannedRoomId: sqlId(row.plannedRoomId, true) };
        });
        if (new Set(rows.map(row => row.bookingRoomId)).size !== rows.length) throw invalidStaySql();
        return { data: rows, meta: { ...pageDto(raw.page, rows.length, input), date: input.date } };
      }
      if (!Array.isArray(raw.stays)) throw invalidStaySql();
      const rows = raw.stays.map(row => stayDto(row));
      if (new Set(rows.map(row => row.id)).size !== rows.length || input.status && rows.some(row => row.status !== input.status) || input.bookingId && rows.some(row => row.bookingId !== input.bookingId)) throw invalidStaySql();
      return { data: rows, meta: pageDto(raw.page, rows.length, input) };
    },
    async checkIn(actor, body, key, requestId) {
      const input = checkInInput(body);
      if (input.rooms.length > gateway.limits.maxUnits) throw bookingError('STAY_BATCH_LIMIT_EXCEEDED', 'Số phần phòng vượt giới hạn nhận nguyên tử của SQL.');
      const { prepared, digest } = await prepare(actor, 'check-in', input, key, requestId);
      if (prepared.replayed) return checkInReceipt(prepared.result, actor, digest, input);
      const { batch, proof } = compileCheckIn(prepared, input, gateway.limits, actor, key, now().getTime(), gateway.checkInFolioPolicy);
      const raw = await gateway.commit(actor, 'check-in', input, digest, key, prepared, batch, proof, requestId);
      return checkInReceipt(raw, actor, digest, input);
    },
    async mutate(actor, operation, stayId, body, key, requestId) {
      const input = stayMutationInput(stayId, operation, body);
      const { prepared, digest } = await prepare(actor, operation, input, key, requestId);
      if (prepared.replayed) return mutationReceipt(prepared.result, actor, digest, operation, input);
      let compiled;
      if (operation === 'transfer-room') compiled = compileTransfer(prepared, input, gateway.limits, now().getTime());
      else {
        const end = instant(input.newExpectedOutAt, 'newExpectedOutAt').ms;
        const proposal = await priceChange(actor, operation, input, prepared, requestId);
        if (input.acceptedProposalHash !== stayChangeAcceptanceHash(proposal)) throw bookingError('STAY_QUOTE_CHANGED', 'Giá, chính sách hoặc nội dung điều chỉnh đã đổi. Xem lại giá trước khi xác nhận.', 409);
        if (end <= now().getTime()) throw bookingError('UNUSED_INTERVAL_REQUIRED', 'Mốc trả mới đã qua trong lúc xử lý; chưa ghi thay đổi.', 409);
        compiled = compilePriceChange(prepared, { ...input, direction: operation }, proposal, gateway.limits, actor, key);
      }
      const raw = await gateway.commit(actor, operation, input, digest, key, prepared, compiled.batch, compiled.proof, requestId);
      return mutationReceipt(raw, actor, digest, operation, input, compiled.proof);
    }
  });
}
