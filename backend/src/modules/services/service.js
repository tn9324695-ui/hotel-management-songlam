import { assertActor } from '../auth/security.js';
import { idempotencyKey } from '../bookings/validation.js';
import { intentHash, canonicalIntent } from '../bookings/intent.js';
import { sqlUtc } from '../bookings/dto.js';
import { consumptionActions, requireConsumptionPermission } from './permissions.js';
import { consumptionError, invalidConsumptionSql } from './amounts.js';
import { consumptionInput } from './validation.js';
import { catalogItem, consumptionContext, consumptionRecord, consumptionEvent, pageDto } from './dto.js';

function mayTransition(resource, operation, row) {
  if (resource === 'orders') return row.source === 'SERVICE' && (operation === 'deliver' ? row.status === 'OPEN' : operation === 'cancel' && ['OPEN', 'DELIVERED'].includes(row.status));
  return operation === 'confirm' ? ['PENDING', 'DISPUTED'].includes(row.status) : operation === 'dispute' && row.status === 'PENDING';
}
const frozenLines = (resource, row) => canonicalIntent(row.lines.map(line => ({ serviceId: line.serviceId, serviceVersionAtPricing: line.serviceVersionAtPricing,
  unitPriceVnd: line.unitPriceVnd, amountVnd: line.amountVnd, ...(resource === 'orders' ? { id: line.id, quantity: line.quantity } : { consumedQuantity: line.consumedQuantity }) })));

export function createConsumptionService({ gateway, resource }) {
  function allowed(actor, operation, row) {
    try { requireConsumptionPermission(actor, resource, operation); return gateway.supports(resource, operation) && (!row || mayTransition(resource, operation, row)); } catch { return false; }
  }
  const decorate = (actor, row) => ({ ...row, allowedActions: consumptionActions[resource].filter(operation => operation !== 'create' && allowed(actor, operation, row)) });
  return Object.freeze({
    capabilities(actor) {
      assertActor(actor);
      const supported = operation => allowed(actor, operation);
      let visible = false; try { requireConsumptionPermission(actor, resource, 'list'); visible = true; } catch {}
      return { resource, visible, readable: supported('list'), catalogReadable: supported('catalog'), contextReadable: supported('context'),
        creatable: supported('create'), maxLines: gateway.limits.maxLines, maxLimit: gateway.limits.maxLimit,
        code: !gateway.supports(resource, 'list') ? 'CONSUMPTION_CONTRACT_NOT_APPROVED' : null };
    },
    async read(actor, operation, input, requestId) {
      requireConsumptionPermission(actor, resource, operation);
      const raw = await gateway.read(actor, resource, operation, input, requestId);
      if (raw.resource !== resource || raw.operation !== operation) throw invalidConsumptionSql();
      const meta = { asOfUtc: sqlUtc(raw.asOfUtc) };
      if (operation === 'context') {
        if (raw.context === null) throw consumptionError('CONSUMPTION_CONTEXT_UNAVAILABLE', 'Không có lượt đang ở/folio mở/segment hợp lệ trong phạm vi được phép.', 409);
        const data = consumptionContext(raw.context, resource);
        if (data.stayId !== input.stayId || resource === 'audits' && data.roomSegmentId !== input.roomSegmentId) throw invalidConsumptionSql();
        return { data, meta };
      }
      if (operation === 'detail') {
        if (raw.row === null) throw consumptionError('NOT_FOUND', 'Không tìm thấy đơn/biên bản.', 404);
        const data = consumptionRecord(resource, raw.row, gateway.limits.maxLines, true);
        if (data.id !== input.id) throw invalidConsumptionSql();
        return { data: decorate(actor, data), meta };
      }
      if (!Array.isArray(raw.rows) || raw.rows.length > input.limit) throw invalidConsumptionSql();
      const data = raw.rows.map(row => operation === 'catalog' ? catalogItem(row, resource) : decorate(actor, consumptionRecord(resource, row, gateway.limits.maxLines)));
      if (new Set(data.map(row => row.id || row.serviceId)).size !== data.length || input.stayId && data.some(row => row.stayId !== input.stayId)
        || input.status && data.some(row => row.status !== input.status)) throw invalidConsumptionSql();
      return { data, meta: { ...pageDto(raw.page, data.length, input), ...meta } };
    },
    async write(actor, operation, id, body, key, requestId) {
      requireConsumptionPermission(actor, resource, operation); idempotencyKey(key);
      const input = consumptionInput(resource, operation, id, body, gateway.limits.maxLines), digest = intentHash({ resource, operation, input });
      // Exactly one approved SQL command owns source, fees, versions, audit and receipt.
      const raw = await gateway.execute(actor, resource, operation, input, digest, key, requestId);
      if (raw.committed !== true || typeof raw.replayed !== 'boolean' || raw.resource !== resource || raw.operation !== operation
        || raw.actorId !== actor.appUserId || raw.intentHash !== digest || raw.idempotencyKey !== key) throw invalidConsumptionSql();
      const row = consumptionRecord(resource, raw.row, gateway.limits.maxLines, true), event = consumptionEvent(raw.event), context = consumptionContext(raw.contextBefore, resource);
      if (event.actorId !== actor.appUserId || event.operation !== operation || event.reason !== (input.reason ?? input.note ?? null)
        || context.stayId !== row.stayId || context.stayVersion !== input.expectedStayVersion || context.folioId !== input.folioId || context.folioVersion !== input.expectedFolioVersion) throw invalidConsumptionSql();
      if (resource === 'audits' && (context.occupancyToken !== input.occupancyToken || context.inspectionScopeToken !== input.inspectionScopeToken || row.inspectionScopeToken !== input.inspectionScopeToken)) throw invalidConsumptionSql();
      if (operation === 'create') {
        if ((raw.before ?? null) !== null || row.stayId !== input.stayId || row.lines.length !== input.lines.length || row.status !== (resource === 'orders' ? 'OPEN' : 'PENDING')) throw invalidConsumptionSql();
        for (const requested of input.lines) {
          const stored = row.lines.find(line => line.serviceId === requested.serviceId);
          if (!stored || stored.serviceVersionAtPricing !== requested.expectedServiceVersion || (resource === 'orders' ? stored.quantity !== requested.quantity : stored.consumedQuantity !== requested.consumedQuantity)) throw invalidConsumptionSql();
        }
        if (resource === 'orders' && (row.orderedById !== actor.appUserId || row.source !== 'SERVICE')
          || resource === 'audits' && (row.checkedById !== actor.appUserId || row.roomId !== input.roomId || row.roomSegmentId !== input.roomSegmentId || row.zeroConsumptionConfirmed !== input.zeroConsumptionConfirmed)) throw invalidConsumptionSql();
      } else {
        const before = consumptionRecord(resource, raw.before, gateway.limits.maxLines, true);
        if (row.id !== input.id || before.id !== row.id || before.version !== input.expectedVersion || row.version === before.version || before.stayId !== row.stayId
          || !mayTransition(resource, operation, before) || frozenLines(resource, before) !== frozenLines(resource, row) || before.pricedAtUtc !== row.pricedAtUtc) throw invalidConsumptionSql();
        if (resource === 'audits' && (before.roomId !== row.roomId || before.roomSegmentId !== row.roomSegmentId || before.checkedAtUtc !== row.checkedAtUtc || before.checkedById !== row.checkedById || before.inspectionScopeToken !== row.inspectionScopeToken)) throw invalidConsumptionSql();
        if (resource === 'orders' && (before.orderedById !== row.orderedById || before.orderedAtUtc !== row.orderedAtUtc || before.source !== row.source)) throw invalidConsumptionSql();
        if (resource === 'orders' && operation === 'cancel' && before.deliveredAtUtc !== row.deliveredAtUtc) throw invalidConsumptionSql();
        for (const previous of before.lines) {
          const current = row.lines.find(line => line.serviceId === previous.serviceId);
          if (previous.charge && canonicalIntent(previous.charge) !== canonicalIntent(current.charge)) throw invalidConsumptionSql();
          for (const oldCredit of previous.credits) if (!current.credits.some(credit => canonicalIntent(credit) === canonicalIntent(oldCredit))) throw invalidConsumptionSql();
          if (operation !== 'cancel' && canonicalIntent(previous.credits) !== canonicalIntent(current.credits)) throw invalidConsumptionSql();
          if (operation === 'cancel') {
            const priorCredit = previous.credits.reduce((sum, credit) => sum + BigInt(credit.amountVnd), 0n);
            const remaining = previous.charge ? BigInt(previous.charge.amountVnd) - priorCredit : 0n;
            const added = current.credits.filter(credit => !previous.credits.some(old => old.id === credit.id));
            if (added.length !== (remaining > 0n ? 1 : 0) || added.length && BigInt(added[0].amountVnd) !== remaining) throw invalidConsumptionSql();
          }
        }
      }
      const expected = { deliver: 'DELIVERED', cancel: 'CANCELLED', confirm: 'CONFIRMED', dispute: 'DISPUTED' }[operation];
      if (expected && row.status !== expected || operation === 'cancel' && row.cancellationReason !== input.reason) throw invalidConsumptionSql();
      if (resource === 'audits' && (row.roomId !== context.roomId || row.roomSegmentId !== context.roomSegmentId)) throw invalidConsumptionSql();
      for (const line of row.lines) if (line.charge && line.charge.folioId !== input.folioId) throw invalidConsumptionSql();
      return { committed: true, replayed: raw.replayed, row: decorate(actor, row), event };
    }
  });
}
export const createServicesService = ({ gateway }) => createConsumptionService({ gateway, resource: 'orders' });
