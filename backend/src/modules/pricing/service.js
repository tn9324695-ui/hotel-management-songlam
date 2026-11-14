import { AppError } from '../../shared/errors.js';
import { assertActor } from '../auth/security.js';
import { calculateEarlyDeparture, calculateQuote } from './engine.js';
import { quoteInput } from './validation.js';
import { validateStayPriceChange } from './stay-change.js';

export function createPricingService({ gateway, stayChangeGateway, now = () => new Date() }) {
  return Object.freeze({
    async quoteStayChange(actor, input, requestId) {
      assertActor(actor);
      if (!actor.permissions.includes('manageCheckIn')) throw new AppError(403, 'FORBIDDEN', 'Không có quyền điều chỉnh lưu trú.');
      if (!stayChangeGateway) throw new AppError(503, 'STAY_PRICE_CONTRACT_NOT_APPROVED', 'Chưa cấu hình hợp đồng G4 cho gia hạn/trả sớm.');
      const quotedAt = now().toISOString(), raw = await stayChangeGateway.loadStayChange(actor, input, quotedAt, requestId);
      return validateStayPriceChange(raw, input, quotedAt);
    },
    async quote(actor, operation, body, requestId) {
      assertActor(actor);
      if (!actor.permissions.includes('viewRoomRack') || operation === 'early-departure' && !actor.permissions.includes('manageCheckOut')) throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện báo giá này.');
      const input = quoteInput(body, operation), quotedAt = now().toISOString();
      const { payload, policyApprovalReference, calendarApprovalReference, contractApprovalReference } = await gateway.loadContext(actor, operation, input, quotedAt, requestId);
      const result = operation === 'early-departure' ? calculateEarlyDeparture(payload, input, quotedAt)
        : calculateQuote(payload, input, operation === 'nightly' ? 'NIGHTLY' : 'HOURLY', quotedAt);
      return { ...result, approval: { policyReference: policyApprovalReference, calendarReference: calendarApprovalReference, contractReference: contractApprovalReference } };
    }
  });
}
