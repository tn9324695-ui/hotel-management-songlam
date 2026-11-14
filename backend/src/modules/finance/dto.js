import { sqlId, sqlText, sqlUtc, sqlVersion, pageDto } from '../bookings/dto.js';
import { isCalendarDate } from '../catalog/validation.js';
import { stateToken } from '../operations/validation.js';
import { money, signedMoney, amount, equal, folioBalance, depositBalance, due, debitKinds, invalidFinanceSql } from './money.js';
import { refundMethods } from './model.js';
export function choice(value, values) { if (!values.includes(value)) throw invalidFinanceSql(); return value; }
const nullableTime = value => value === null ? null : sqlUtc(value);
const nullableVersion = value => value === null ? null : sqlVersion(value);
export function token(value) { try { return stateToken(value); } catch { throw invalidFinanceSql(); } }
export function date(value) { if (!isCalendarDate(value)) throw invalidFinanceSql(); return value; }
export function list(value, max = 200) { if (!Array.isArray(value) || value.length > max) throw invalidFinanceSql(); return value; }
export function flag(value) { if (typeof value !== 'boolean') throw invalidFinanceSql(); return value; }
export function clock(raw) {
  const timeZone = sqlText(raw.timeZone, 60), cutoffLocalTime = sqlText(raw.cutoffLocalTime, 8);
  try { new Intl.DateTimeFormat('vi-VN', { timeZone }); } catch { throw invalidFinanceSql(); }
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(cutoffLocalTime)) throw invalidFinanceSql();
  return { businessDate: date(raw.businessDate), timeZone, cutoffLocalTime, policyReference: sqlText(raw.policyReference, 160) };
}
export function contextDto(raw, resource, operation, id) {
  if (!raw || raw.resource !== resource || raw.operation !== operation || raw.subjectId !== (id ?? null)) throw invalidFinanceSql();
  return { resource, operation, subjectId: raw.subjectId, subjectVersion: nullableVersion(raw.subjectVersion), contextToken: token(raw.contextToken),
    validUntilUtc: sqlUtc(raw.validUntilUtc), ...clock(raw), blockers: list(raw.blockers, 50).map(row => ({ code: sqlText(row.code, 80), message: sqlText(row.message, 400) })) };
}
export function folioDto(raw) {
  if (!raw) throw invalidFinanceSql();
  const totals = {};
  for (const key of ['chargesVnd', 'creditsVnd', 'paymentsVnd', 'refundsVnd', 'depositAppliedVnd', 'depositUnappliedVnd', 'transferInVnd', 'transferOutVnd']) totals[key] = money(raw.totals?.[key]);
  const balanceVnd = signedMoney(raw.balanceVnd); equal(balanceVnd, folioBalance(totals));
  const result = { id: sqlId(raw.id), version: sqlVersion(raw.version), code: sqlText(raw.code, 40), bookingId: sqlId(raw.bookingId), bookingRoomId: sqlId(raw.bookingRoomId, true),
    kind: choice(raw.kind, ['MASTER', 'ROOM', 'INCIDENTAL']), status: choice(raw.status, ['OPEN', 'CLOSED']), payerCustomerId: sqlId(raw.payerCustomerId, true), payerOrganizationId: sqlId(raw.payerOrganizationId, true),
    closedAtUtc: nullableTime(raw.closedAtUtc), totals, balanceVnd, ...due(balanceVnd), reservedRefundVnd: money(raw.reservedRefundVnd) };
  if ((result.payerCustomerId === null) === (result.payerOrganizationId === null) || (result.kind === 'MASTER') !== (result.bookingRoomId === null)
    || result.status === 'CLOSED' && (balanceVnd !== '0' || !result.closedAtUtc) || result.status === 'OPEN' && result.closedAtUtc
    || BigInt(result.reservedRefundVnd) > BigInt(result.creditVnd)) throw invalidFinanceSql();
  return result;
}
export function entryDto(raw) {
  const kind = choice(raw.kind, ['CHARGE', 'CHARGE_CREDIT', 'PAYMENT', 'REFUND', 'TRANSFER_DEBIT', 'TRANSFER_CREDIT', 'DEPOSIT_APPLY', 'DEPOSIT_UNAPPLY']);
  const amountVnd = amount(raw.amountVnd, { positive: true, sql: true });
  const result = { id: sqlId(raw.id), folioId: sqlId(raw.folioId), stayId: sqlId(raw.stayId, true), kind,
    category: raw.category === null ? null : choice(raw.category, ['ROOM', 'SERVICE', 'SURCHARGE', 'DISCOUNT', 'CANCELLATION']), amountVnd,
    signedAmountVnd: signedMoney(raw.signedAmountVnd), description: sqlText(raw.description, 500), businessDate: date(raw.businessDate),
    createdById: sqlId(raw.createdById), createdAtUtc: sqlUtc(raw.createdAtUtc), paymentId: sqlId(raw.paymentId, true), depositMovementId: sqlId(raw.depositMovementId, true),
    serviceOrderLineId: sqlId(raw.serviceOrderLineId, true), reversesEntryId: sqlId(raw.reversesEntryId, true), transferPairId: raw.transferPairId === null ? null : sqlText(raw.transferPairId, 36) };
  equal(result.signedAmountVnd, debitKinds.has(kind) ? amountVnd : '-' + amountVnd);
  if (['CHARGE', 'CHARGE_CREDIT'].includes(kind) !== (result.category !== null) || ['PAYMENT', 'REFUND'].includes(kind) !== (result.paymentId !== null)
    || ['DEPOSIT_APPLY', 'DEPOSIT_UNAPPLY'].includes(kind) !== (result.depositMovementId !== null)
    || ['TRANSFER_DEBIT', 'TRANSFER_CREDIT'].includes(kind) !== (result.transferPairId !== null)
    || result.serviceOrderLineId !== null && (kind !== 'CHARGE' || result.category !== 'SERVICE')
    || result.reversesEntryId !== null && (kind !== 'CHARGE_CREDIT' || result.reversesEntryId === result.id)) throw invalidFinanceSql();
  return result;
}
export function depositDto(raw) {
  const totals = {};
  for (const key of ['receivedVnd', 'refundedVnd', 'appliedVnd', 'unappliedVnd', 'allocatedInVnd', 'allocatedOutVnd']) totals[key] = money(raw.totals?.[key]);
  const balanceVnd = money(raw.balanceVnd); equal(balanceVnd, depositBalance(totals));
  const reservedRefundVnd = money(raw.reservedRefundVnd), availableVnd = money(raw.availableVnd); equal(availableVnd, BigInt(balanceVnd) - BigInt(reservedRefundVnd));
  const result = { id: sqlId(raw.id), bookingId: sqlId(raw.bookingId), bookingRoomId: sqlId(raw.bookingRoomId, true), kind: choice(raw.kind, ['BOOKING', 'GUARANTEE']),
    stateToken: token(raw.stateToken), totals, balanceVnd, reservedRefundVnd, availableVnd };
  if (result.kind === 'GUARANTEE' && !result.bookingRoomId) throw invalidFinanceSql();
  return result;
}
export function movementDto(raw) {
  const result = { id: sqlId(raw.id), depositAccountId: sqlId(raw.depositAccountId), kind: choice(raw.kind, ['RECEIVE', 'REFUND', 'APPLY', 'UNAPPLY', 'ALLOCATE_IN', 'ALLOCATE_OUT']), amountVnd: amount(raw.amountVnd, { positive: true, sql: true }),
    paymentId: sqlId(raw.paymentId, true), reversesMovementId: sqlId(raw.reversesMovementId, true), businessDate: date(raw.businessDate), createdById: sqlId(raw.createdById), createdAtUtc: sqlUtc(raw.createdAtUtc) };
  if (['RECEIVE', 'REFUND'].includes(result.kind) !== (result.paymentId !== null) || (result.kind === 'UNAPPLY') !== (result.reversesMovementId !== null)) throw invalidFinanceSql();
  if (result.kind.startsWith('ALLOCATE_')) {
    Object.assign(result, { allocationPairId: sqlText(raw.allocationPairId, 36), counterpartyDepositAccountId: sqlId(raw.counterpartyDepositAccountId), originalReceiveMovementId: sqlId(raw.originalReceiveMovementId) });
    if (result.counterpartyDepositAccountId === result.depositAccountId) throw invalidFinanceSql();
  }
  return result;
}
export function paymentDto(raw) {
  const result = { id: sqlId(raw.id), code: sqlText(raw.code, 50), version: sqlVersion(raw.version), bookingId: sqlId(raw.bookingId), direction: choice(raw.direction, ['IN', 'OUT']),
    purpose: choice(raw.purpose, ['BOOKING_DEPOSIT', 'GUARANTEE_DEPOSIT', 'SETTLEMENT', 'SERVICE', 'REFUND']), method: choice(raw.method, refundMethods), status: choice(raw.status, ['PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED']),
    amountVnd: amount(raw.amountVnd, { positive: true, sql: true }), originalPaymentId: sqlId(raw.originalPaymentId, true), refundRequestId: sqlId(raw.refundRequestId, true),
    recordedById: sqlId(raw.recordedById), shiftId: sqlId(raw.shiftId, true), businessDate: date(raw.businessDate), createdAtUtc: sqlUtc(raw.createdAtUtc), succeededAtUtc: nullableTime(raw.succeededAtUtc) };
  if ((result.status === 'SUCCEEDED') !== (result.succeededAtUtc !== null) || result.method === 'CASH' && result.shiftId === null
    || (result.direction === 'OUT') !== (result.originalPaymentId !== null && result.refundRequestId !== null && result.purpose === 'REFUND')
    || result.direction === 'IN' && (result.originalPaymentId !== null || result.refundRequestId !== null || result.purpose === 'REFUND')) throw invalidFinanceSql();
  // Provider secrets, bank payloads and full references are not sent to the UI.
  return result;
}
export function refundDto(raw) {
  const result = { id: sqlId(raw.id), version: sqlVersion(raw.version), originalPaymentId: sqlId(raw.originalPaymentId), folioId: sqlId(raw.folioId, true), depositAccountId: sqlId(raw.depositAccountId, true),
    amountVnd: amount(raw.amountVnd, { positive: true, sql: true }), status: choice(raw.status, ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED']), reason: sqlText(raw.reason, 1000),
    requestedById: sqlId(raw.requestedById), requestedAtUtc: sqlUtc(raw.requestedAtUtc), approvedById: sqlId(raw.approvedById, true), approvedAtUtc: nullableTime(raw.approvedAtUtc), refundPaymentId: sqlId(raw.refundPaymentId, true) };
  if ((result.folioId === null) === (result.depositAccountId === null) || ['APPROVED', 'COMPLETED'].includes(result.status) && (!result.approvedById || !result.approvedAtUtc)
    || (result.status === 'COMPLETED') !== (result.refundPaymentId !== null)) throw invalidFinanceSql();
  return result;
}
export function shiftDto(raw) {
  const result = { id: sqlId(raw.id), version: sqlVersion(raw.version), cashierId: sqlId(raw.cashierId), businessDate: date(raw.businessDate),
    status: choice(raw.status, ['OPEN', 'CLOSED']), openedAtUtc: sqlUtc(raw.openedAtUtc), closedAtUtc: nullableTime(raw.closedAtUtc), openingCashVnd: money(raw.openingCashVnd),
    cashInVnd: money(raw.cashInVnd), cashOutVnd: money(raw.cashOutVnd), expectedCashVnd: signedMoney(raw.expectedCashVnd),
    countedCashVnd: raw.countedCashVnd === null ? null : money(raw.countedCashVnd), varianceVnd: raw.varianceVnd === null ? null : signedMoney(raw.varianceVnd),
    pendingPaymentCount: Number.isSafeInteger(raw.pendingPaymentCount) && raw.pendingPaymentCount >= 0 ? raw.pendingPaymentCount : (() => { throw invalidFinanceSql(); })(), notes: sqlText(raw.notes, 1000, true) };
  equal(result.expectedCashVnd, BigInt(result.openingCashVnd) + BigInt(result.cashInVnd) - BigInt(result.cashOutVnd));
  if (result.status === 'CLOSED') {
    if (!result.closedAtUtc || result.countedCashVnd === null || result.varianceVnd === null || result.pendingPaymentCount) throw invalidFinanceSql();
    equal(result.varianceVnd, BigInt(result.countedCashVnd) - BigInt(result.expectedCashVnd));
    if (result.varianceVnd !== '0' && !result.notes?.trim()) throw invalidFinanceSql();
  } else if (result.closedAtUtc) throw invalidFinanceSql();
  return result;
}
export function dayDto(raw) {
  const result = { id: date(raw.id), version: sqlVersion(raw.version), ...clock(raw), status: choice(raw.status, ['OPEN', 'CLOSED']), closedAtUtc: nullableTime(raw.closedAtUtc), closedById: sqlId(raw.closedById, true),
    collectedVnd: money(raw.collectedVnd), refundedVnd: money(raw.refundedVnd), netReceiptsVnd: signedMoney(raw.netReceiptsVnd), cashInVnd: money(raw.cashInVnd), cashOutVnd: money(raw.cashOutVnd),
    settledRevenueVnd: money(raw.settledRevenueVnd), outstandingVnd: money(raw.outstandingVnd) };
  equal(result.netReceiptsVnd, BigInt(result.collectedVnd) - BigInt(result.refundedVnd));
  if (result.id !== result.businessDate || result.status === 'CLOSED' && (!result.closedAtUtc || !result.closedById)) throw invalidFinanceSql();
  return result;
}
export function invoiceDto(raw) {
  if (raw.documentKind !== 'RECEIPT') throw invalidFinanceSql();
  const result = { id: sqlId(raw.id), version: sqlVersion(raw.version), folioId: sqlId(raw.folioId), internalNumber: sqlText(raw.internalNumber, 50), documentKind: 'RECEIPT',
    sourceType: choice(raw.sourceType, ['PAYMENT', 'REFUND', 'SETTLEMENT']), sourceId: sqlId(raw.sourceId), status: choice(raw.status, ['DRAFT', 'ISSUED', 'CANCELLED']),
    buyerName: sqlText(raw.buyerName, 200), netVnd: signedMoney(raw.netVnd), taxVnd: money(raw.taxVnd), totalVnd: signedMoney(raw.totalVnd), issuedAtUtc: nullableTime(raw.issuedAtUtc),
    createdById: sqlId(raw.createdById), eInvoiceStatus: 'NOT_INTEGRATED' };
  equal(result.totalVnd, BigInt(result.netVnd) + BigInt(result.taxVnd));
  if (result.status === 'ISSUED' && !result.issuedAtUtc) throw invalidFinanceSql();
  return result;
}
export function checkoutSummary(raw) {
  const result = {};
  for (const key of ['roomVnd', 'serviceVnd', 'minibarVnd', 'surchargeVnd', 'discountVnd', 'chargesVnd', 'depositAppliedVnd', 'paymentsVnd', 'refundsVnd', 'transferInVnd', 'transferOutVnd']) result[key] = money(raw[key]);
  const charges = BigInt(result.roomVnd) + BigInt(result.serviceVnd) + BigInt(result.minibarVnd) + BigInt(result.surchargeVnd) - BigInt(result.discountVnd);
  equal(result.chargesVnd, charges);
  result.balanceVnd = signedMoney(raw.balanceVnd);
  equal(result.balanceVnd, charges - BigInt(result.depositAppliedVnd) - BigInt(result.paymentsVnd) + BigInt(result.refundsVnd) + BigInt(result.transferInVnd) - BigInt(result.transferOutVnd));
  return { ...result, ...due(result.balanceVnd) };
}
export function checkoutDto(raw) {
  const result = { id: sqlId(raw.id), version: sqlVersion(raw.version), bookingId: sqlId(raw.bookingId), bookingRoomId: sqlId(raw.bookingRoomId), status: choice(raw.status, ['IN_HOUSE', 'CHECKED_OUT']),
    roomId: sqlId(raw.roomId), folioId: sqlId(raw.folioId), checkedOutAtUtc: nullableTime(raw.checkedOutAtUtc), summary: checkoutSummary(raw.summary) };
  if (result.status === 'CHECKED_OUT' && !result.checkedOutAtUtc) throw invalidFinanceSql();
  return result;
}
export const financeRecord = (resource, raw) => {
  if (!raw || typeof raw !== 'object') throw invalidFinanceSql();
  return { folios: folioDto, deposits: depositDto, payments: paymentDto, refunds: refundDto, cashier: shiftDto, days: dayDto, invoices: invoiceDto, checkouts: checkoutDto }[resource](raw);
};
export function previewDto(resource, raw) {
  if (!raw || !/^[a-f0-9]{64}$/.test(raw.planDigest || '')) throw invalidFinanceSql();
  const result = { resource, subjectId: resource === 'days' ? date(raw.subjectId) : sqlId(raw.subjectId), previewToken: token(raw.previewToken), contextToken: token(raw.contextToken),
    expectedVersion: sqlVersion(raw.expectedVersion), planDigest: raw.planDigest, expiresAtUtc: sqlUtc(raw.expiresAtUtc), ...clock(raw),
    blockers: list(raw.blockers, 50).map(item => ({ code: sqlText(item.code, 80), message: sqlText(item.message, 400) })), canComplete: flag(raw.canComplete) };
  if (result.canComplete && result.blockers.length) throw invalidFinanceSql();
  if (resource === 'checkouts') {
    Object.assign(result, { before: checkoutSummary(raw.before), after: checkoutSummary(raw.after),
      master: raw.master === null ? null : { folioId: sqlId(raw.master.folioId), balanceBeforeVnd: signedMoney(raw.master.balanceBeforeVnd), balanceAfterVnd: signedMoney(raw.master.balanceAfterVnd), transferredVnd: money(raw.master.transferredVnd) },
      minibarCoverageComplete: flag(raw.minibarCoverageComplete),
      minibarCoverage: list(raw.minibarCoverage, 125).map(row => ({ segmentId: sqlId(row.segmentId), auditId: sqlId(row.auditId, true), status: choice(row.status, ['MISSING', 'DISPUTED', 'CONFIRMED', 'QUICK_PROPOSED']), amountVnd: row.amountVnd === null ? null : money(row.amountVnd) })) });
    if (result.canComplete && (result.after.balanceVnd !== '0' || result.minibarCoverage.some(row => !['CONFIRMED', 'QUICK_PROPOSED'].includes(row.status)))) throw invalidFinanceSql();
    if (new Set(result.minibarCoverage.map(row => row.segmentId)).size !== result.minibarCoverage.length
      || result.canComplete && (!result.minibarCoverage.length || !result.minibarCoverageComplete)
      || result.minibarCoverage.some(row => row.status === 'CONFIRMED' && (row.auditId === null || row.amountVnd === null))) throw invalidFinanceSql();
    if (result.master) equal(result.master.balanceAfterVnd, BigInt(result.master.balanceBeforeVnd) + BigInt(result.master.transferredVnd));
  } else if (resource === 'cashier') {
    Object.assign(result, { shift: shiftDto(raw.shift), countedCashVnd: money(raw.countedCashVnd), varianceVnd: signedMoney(raw.varianceVnd) });
    equal(result.varianceVnd, BigInt(result.countedCashVnd) - BigInt(result.shift.expectedCashVnd));
    if (result.shift.id !== result.subjectId || result.shift.version !== result.expectedVersion) throw invalidFinanceSql();
  }
  else if (resource === 'days') {
    Object.assign(result, { day: dayDto(raw.day), nextBusinessDate: date(raw.nextBusinessDate) });
    if (result.day.id !== result.subjectId || result.day.version !== result.expectedVersion) throw invalidFinanceSql();
  }
  else throw invalidFinanceSql();
  return result;
}
export { pageDto };
