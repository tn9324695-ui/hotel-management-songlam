import { assertActor } from '../auth/security.js';
import { idempotencyKey, shape } from '../bookings/validation.js';
import { intentHash } from '../bookings/intent.js';
import { sqlUtc } from '../bookings/dto.js';
import { financeResources, requireFinancePermission, requireSettlementPermissions } from './model.js';
import { financeInput, checkoutPlan, financeRequestToken } from './validation.js';
import { financeRecord, entryDto, movementDto, previewDto, contextDto, pageDto } from './dto.js';
import { financeError, invalidFinanceSql, amount } from './money.js';
import { financeReceipt } from './receipt.js';
import { version } from '../bookings/validation.js';

function transition(resource, operation, row, actor) {
  if (resource === 'folios') return row.status === 'OPEN' && (operation === 'close' ? row.balanceVnd === '0' : operation !== 'transfer' || BigInt(row.balanceVnd) > 0n);
  if (resource === 'deposits') return operation === 'unapply' || BigInt(row.availableVnd) > 0n;
  if (resource === 'payments') return operation === 'cancel' && row.status === 'PENDING' && row.method !== 'CASH';
  if (resource === 'refunds') return operation === 'decide' ? row.status === 'PENDING' && row.requestedById !== actor.appUserId : operation === 'complete' && row.status === 'APPROVED';
  if (resource === 'checkouts') return row.status === 'IN_HOUSE';
  if (resource === 'invoices') return row.status === 'DRAFT';
  if (resource === 'cashier') return row.status === 'OPEN' && row.cashierId === actor.appUserId;
  return row.status === 'OPEN';
}
export function createFinanceService({ gateway, resource }) {
  function permitted(actor, operation) { try { requireFinancePermission(actor, resource, operation); return true; } catch { return false; } }
  const allowed = (actor, operation, row) => permitted(actor, operation) && gateway.supports(resource, 'context') && gateway.supports(resource, operation, 'command')
    && (!['checkouts', 'cashier', 'days'].includes(resource) || ['create', 'open'].includes(operation) || permitted(actor, 'preview') && gateway.supports(resource, 'preview'))
    && (!row || transition(resource, operation, row, actor));
  const decorate = (actor, row) => ({ ...row, allowedActions: Object.keys(financeResources[resource].commands).filter(operation => !['create', 'open'].includes(operation) && allowed(actor, operation, row)) });
  return Object.freeze({
    capabilities(actor) {
      assertActor(actor);
      return { resource, visible: permitted(actor, 'list'), readable: permitted(actor, 'list') && gateway.supports(resource, 'list'),
        maxLines: gateway.limits.maxLines, maxLimit: gateway.limits.maxLimit,
        previewSupported: ['checkouts', 'cashier', 'days'].includes(resource) && permitted(actor, 'preview') && gateway.supports(resource, 'preview'),
        commands: Object.fromEntries(Object.entries(financeResources[resource].commands).filter(([operation]) => permitted(actor, operation)).map(([operation, spec]) => [operation, {
          enabled: allowed(actor, operation), needsSubject: !['create', 'open'].includes(operation), versioned: financeResources[resource].versioned,
          fields: spec.fields, optional: spec.optional, code: allowed(actor, operation) ? null : 'FINANCE_CONTRACT_OR_POLICY_PENDING'
        }])), eInvoiceStatus: 'NOT_INTEGRATED', bankConfirmationStatus: 'NOT_CONFIGURED', postSettlementAdjustmentsEnabled: false };
    },
    async read(actor, operation, input, requestId) {
      requireFinancePermission(actor, resource, operation === 'context' ? input.operation : operation);
      const raw = await gateway.read(actor, resource, operation, input, requestId);
      if (raw.resource !== resource || raw.operation !== operation) throw invalidFinanceSql();
      const meta = { asOfUtc: sqlUtc(raw.asOfUtc) };
      if (operation === 'context') {
        if (raw.context === null) throw financeError('FINANCE_CONTEXT_UNAVAILABLE', 'Thiếu ngữ cảnh tài chính hoặc đối tượng không đủ điều kiện.', 409);
        const context = contextDto(raw.context, resource, input.operation, input.id);
        if (financeResources[resource].versioned && !['create', 'open'].includes(input.operation) && !context.subjectVersion) throw invalidFinanceSql();
        return { data: context, meta };
      }
      if (operation === 'detail') {
        if (raw.row === null) throw financeError('NOT_FOUND', 'Không tìm thấy đối tượng tài chính.', 404);
        const row = financeRecord(resource, raw.row); if (row.id !== input.id) throw invalidFinanceSql();
        return { data: decorate(actor, row), meta };
      }
      if (!Array.isArray(raw.rows) || raw.rows.length > input.limit) throw invalidFinanceSql();
      const rows = raw.rows.map(row => operation === 'entries' ? entryDto(row) : operation === 'movements' ? movementDto(row) : decorate(actor, financeRecord(resource, row)));
      if (new Set(rows.map(row => row.id)).size !== rows.length || operation === 'entries' && rows.some(row => row.folioId !== input.id)
        || operation === 'movements' && rows.some(row => row.depositAccountId !== input.id)
        || input.bookingId && rows.some(row => row.bookingId !== input.bookingId) || input.status && rows.some(row => row.status !== input.status)
        || input.shiftId && rows.some(row => row.shiftId !== input.shiftId) || input.businessDate && rows.some(row => row.businessDate !== input.businessDate)
        || input.stayId && rows.some(row => resource === 'checkouts' ? row.id !== input.stayId : row.stayId !== input.stayId)) throw invalidFinanceSql();
      return { data: rows, meta: { ...pageDto(raw.page, rows.length, input), ...meta } };
    },
    async preview(actor, id, body, requestId) {
      requireFinancePermission(actor, resource, 'preview');
      let input;
      if (resource === 'checkouts') {
        input = checkoutPlan(id, body, gateway.limits.maxLines); requireSettlementPermissions(actor, input); gateway.assertPolicy(resource, 'preview', input);
      } else {
        shape(body, ['contextToken', 'expectedVersion', ...(resource === 'cashier' ? ['countedCashVnd'] : [])]);
        input = { id, contextToken: financeRequestToken(body.contextToken), expectedVersion: version(body.expectedVersion), ...(resource === 'cashier' ? { countedCashVnd: amount(body.countedCashVnd) } : {}) };
      }
      const raw = await gateway.read(actor, resource, 'preview', input, requestId);
      if (raw.resource !== resource || raw.operation !== 'preview') throw invalidFinanceSql();
      const result = previewDto(resource, raw.preview);
      if (result.subjectId !== id || result.contextToken !== input.contextToken || result.expectedVersion !== input.expectedVersion || result.planDigest !== intentHash(input)) throw invalidFinanceSql();
      if (resource === 'checkouts' && result.minibarCoverage.length > gateway.limits.maxLines) throw financeError('CHECKOUT_COVERAGE_LIMIT_EXCEEDED', 'Số segment vượt giới hạn đối soát nguyên tử của hợp đồng; không chia checkout thành nhiều lần.');
      if (resource === 'cashier' && result.countedCashVnd !== input.countedCashVnd) throw invalidFinanceSql();
      const { id: _subjectId, ...planBody } = input;
      return { data: { ...result, ...(resource === 'checkouts' ? { planBody } : {}) }, meta: { asOfUtc: sqlUtc(raw.asOfUtc) } };
    },
    async write(actor, operation, id, body, key, requestId) {
      requireFinancePermission(actor, resource, operation); idempotencyKey(key);
      const input = financeInput(resource, operation, id, body, gateway.limits.maxLines), digest = intentHash({ resource, operation, input });
      if (input.plan) { requireSettlementPermissions(actor, input.plan); gateway.assertPolicy(resource, operation, input.plan); }
      // No local balance update, multi-request payout or application-owned money transaction.
      const raw = await gateway.execute(actor, resource, operation, input, digest, key, requestId);
      const result = financeReceipt(raw, actor, resource, operation, input, key, digest, gateway);
      return { ...result, row: decorate(actor, result.row) };
    }
  });
}
