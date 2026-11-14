import { sqlId, sqlText, sqlUtc, sqlVersion, pageDto } from '../bookings/dto.js';
import { vnd, quantity, lineAmount, totalAmount, invalidConsumptionSql } from './amounts.js';
import { stateToken } from '../operations/validation.js';

function choose(value, values) { if (!values.includes(value)) throw invalidConsumptionSql(); return value; }
const nullableTime = value => (value === null || value === undefined) ? null : sqlUtc(value);
function flag(value) { if (typeof value !== 'boolean') throw invalidConsumptionSql(); return value; }
export function catalogItem(raw, resource) {
  if (!raw || typeof raw !== 'object') throw invalidConsumptionSql();
  if (resource === 'audits' ? raw.category !== 'MINIBAR' : raw.category === 'MINIBAR') throw invalidConsumptionSql();
  return { serviceId: sqlId(raw.serviceId), code: sqlText(raw.code, 40), name: sqlText(raw.name, 160), category: sqlText(raw.category, 30),
    unit: sqlText(raw.unit, 30), unitPriceVnd: vnd(raw.unitPriceVnd), version: sqlVersion(raw.version), active: flag(raw.active) };
}
export function consumptionContext(raw, resource) {
  if (!raw || typeof raw !== 'object') throw invalidConsumptionSql();
  const result = { stayId: sqlId(raw.stayId), stayCode: sqlText(raw.stayCode, 40), stayVersion: sqlVersion(raw.stayVersion),
    stayStatus: choose(raw.stayStatus, ['IN_HOUSE']), folioId: sqlId(raw.folioId), folioVersion: sqlVersion(raw.folioVersion), folioStatus: choose(raw.folioStatus, ['OPEN']) };
  if (resource === 'audits') {
    let token, scope; try { token = stateToken(raw.occupancyToken); scope = stateToken(raw.inspectionScopeToken); } catch { throw invalidConsumptionSql(); }
    Object.assign(result, { roomId: sqlId(raw.roomId), roomSegmentId: sqlId(raw.roomSegmentId), occupancyToken: token, inspectionScopeToken: scope });
  }
  // No balance, deposits, payments, other stays' charges or guest identity fields.
  return result;
}
function charge(raw, stayId, amountVnd, sourceLineId) {
  if (raw === null) return null;
  if (!raw || raw.kind !== 'CHARGE' || raw.category !== 'SERVICE' || raw.stayId !== stayId || raw.amountVnd !== amountVnd || BigInt(amountVnd) <= 0n || raw.serviceOrderLineId !== sourceLineId) throw invalidConsumptionSql();
  return { id: sqlId(raw.id), folioId: sqlId(raw.folioId), stayId: sqlId(raw.stayId), serviceOrderLineId: sqlId(raw.serviceOrderLineId), amountVnd: vnd(raw.amountVnd), kind: 'CHARGE', category: 'SERVICE' };
}
function credits(rows, original, cancelled) {
  if (!Array.isArray(rows) || rows.length > 200) throw invalidConsumptionSql();
  const result = rows.map(raw => {
    if (!original || raw.kind !== 'CHARGE_CREDIT' || raw.category !== 'SERVICE' || raw.reversesEntryId !== original.id
      || raw.folioId !== original.folioId || raw.stayId !== original.stayId) throw invalidConsumptionSql();
    const amountVnd = vnd(raw.amountVnd);
    if (BigInt(amountVnd) <= 0n || BigInt(amountVnd) > BigInt(original.amountVnd)) throw invalidConsumptionSql();
    if (raw.id === original.id) throw invalidConsumptionSql();
    return { id: sqlId(raw.id), folioId: original.folioId, stayId: original.stayId, amountVnd,
      kind: 'CHARGE_CREDIT', category: 'SERVICE', reversesEntryId: original.id };
  });
  const reversed = result.reduce((sum, row) => sum + BigInt(row.amountVnd), 0n);
  if (original && (reversed > BigInt(original.amountVnd) || cancelled && reversed !== BigInt(original.amountVnd))) throw invalidConsumptionSql();
  return result;
}
function array(raw, maximum) { if (!Array.isArray(raw) || raw.length > maximum) throw invalidConsumptionSql(); return raw; }
function unique(rows, key) { if (new Set(rows.map(row => row[key])).size !== rows.length) throw invalidConsumptionSql(); }

export function consumptionRecord(resource, raw, maxLines, detail = false) {
  if (!raw || typeof raw !== 'object') throw invalidConsumptionSql();
  const result = { id: sqlId(raw.id), version: sqlVersion(raw.version), stayId: sqlId(raw.stayId),
    status: choose(raw.status, resource === 'orders' ? ['OPEN', 'DELIVERED', 'CANCELLED'] : ['PENDING', 'CONFIRMED', 'DISPUTED']),
    pricedAtUtc: sqlUtc(raw.pricedAtUtc), totalVnd: vnd(raw.totalVnd) };
  if (resource === 'orders') Object.assign(result, { source: choose(raw.source, ['SERVICE', 'MINIBAR']), orderedById: sqlId(raw.orderedById),
    orderedAtUtc: sqlUtc(raw.orderedAtUtc), deliveredAtUtc: nullableTime(raw.deliveredAtUtc), cancellationReason: sqlText(raw.cancellationReason, 500, true) });
  else {
    let scope; try { scope = stateToken(raw.inspectionScopeToken); } catch { throw invalidConsumptionSql(); }
    Object.assign(result, { roomId: sqlId(raw.roomId), roomSegmentId: sqlId(raw.roomSegmentId), checkedById: sqlId(raw.checkedById), checkedAtUtc: sqlUtc(raw.checkedAtUtc),
      inspectionScopeToken: scope, zeroConsumptionConfirmed: flag(raw.zeroConsumptionConfirmed), notes: sqlText(raw.notes, 1000, true) });
  }
  if (resource === 'orders' && (result.status === 'CANCELLED' && !result.cancellationReason?.trim() || result.status === 'DELIVERED' && !result.deliveredAtUtc || result.status === 'OPEN' && result.deliveredAtUtc)) throw invalidConsumptionSql();
  if (!detail) return result;
  result.lines = array(raw.lines, maxLines).map(row => {
    if (!row || typeof row !== 'object') throw invalidConsumptionSql();
    const line = { serviceId: sqlId(row.serviceId), description: sqlText(row.description, 200), serviceVersionAtPricing: sqlVersion(row.serviceVersionAtPricing), unitPriceVnd: vnd(row.unitPriceVnd), amountVnd: vnd(row.amountVnd) };
    if (resource === 'orders') {
      line.id = sqlId(row.id);
      try { line.quantity = quantity(row.quantity).text; } catch { throw invalidConsumptionSql(); }
      if (lineAmount(line.quantity, line.unitPriceVnd) !== line.amountVnd) throw invalidConsumptionSql();
    } else {
      if (!Number.isSafeInteger(row.consumedQuantity) || row.consumedQuantity < 0 || row.consumedQuantity > 999999999) throw invalidConsumptionSql();
      line.consumedQuantity = row.consumedQuantity;
      if ((line.consumedQuantity ? lineAmount(String(line.consumedQuantity), line.unitPriceVnd) : '0') !== line.amountVnd) throw invalidConsumptionSql();
      line.serviceOrderId = sqlId(row.serviceOrderId, true); line.serviceOrderLineId = sqlId(row.serviceOrderLineId, true);
      if ((line.serviceOrderId === null) !== (line.serviceOrderLineId === null) || result.status !== 'CONFIRMED' && line.serviceOrderLineId !== null
        || result.status === 'CONFIRMED' && (line.consumedQuantity > 0) !== (line.serviceOrderLineId !== null)) throw invalidConsumptionSql();
      if (line.serviceOrderLineId !== null) {
        const source = row.sourceLine;
        if (!source || source.id !== line.serviceOrderLineId || source.serviceOrderId !== line.serviceOrderId || source.serviceId !== line.serviceId
          || source.stayId !== result.stayId || source.orderStatus !== 'DELIVERED' || source.unitPriceVnd !== line.unitPriceVnd || source.amountVnd !== line.amountVnd
          || source.quantity !== quantity(String(line.consumedQuantity)).text) throw invalidConsumptionSql();
      } else if (row.sourceLine !== null) throw invalidConsumptionSql();
    }
    line.charge = charge(row.charge, result.stayId, line.amountVnd, resource === 'orders' ? line.id : line.serviceOrderLineId);
    line.credits = credits(row.credits, line.charge, resource === 'orders' && result.status === 'CANCELLED');
    const charged = resource === 'orders' ? result.deliveredAtUtc !== null : result.status === 'CONFIRMED';
    if ((charged && BigInt(line.amountVnd) > 0n) !== (line.charge !== null)) throw invalidConsumptionSql();
    return line;
  });
  if (resource === 'orders' && !result.lines.length) throw invalidConsumptionSql();
  unique(result.lines, 'serviceId'); if (resource === 'orders') unique(result.lines, 'id');
  const chargeIds = result.lines.filter(row => row.charge).map(row => row.charge.id);
  const ledgerIds = [...chargeIds, ...result.lines.flatMap(row => row.credits.map(credit => credit.id))];
  if (new Set(ledgerIds).size !== ledgerIds.length || totalAmount(result.lines) !== result.totalVnd) throw invalidConsumptionSql();
  if (resource === 'audits') {
    const linked = result.lines.filter(row => row.serviceOrderLineId !== null);
    unique(linked, 'serviceOrderLineId');
    if (new Set(linked.map(row => row.serviceOrderId)).size > 1) throw invalidConsumptionSql();
  }
  if (resource === 'audits' && result.zeroConsumptionConfirmed !== result.lines.every(row => row.consumedQuantity === 0)) throw invalidConsumptionSql();
  return result;
}
export function consumptionEvent(raw) {
  if (!raw || typeof raw !== 'object') throw invalidConsumptionSql();
  return { actorId: sqlId(raw.actorId), atUtc: sqlUtc(raw.atUtc), operation: sqlText(raw.operation, 16), reason: sqlText(raw.reason, 1000, true) };
}
export { pageDto };
