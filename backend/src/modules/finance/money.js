import { AppError } from '../../shared/errors.js';
export const financeError = (code, message, status = 422) => new AppError(status, code, message);
export const invalidFinanceSql = () => financeError('FINANCE_SQL_RESPONSE_INVALID', 'SQL chưa trả đúng hợp đồng tài chính/đối soát G9.', 502);
const maximum = 9999999999999999999n;
export function amount(value, { signed = false, positive = false, sql = false } = {}) {
  const pattern = signed ? /^(?:0|-?[1-9]\d{0,18})$/ : /^(?:0|[1-9]\d{0,18})$/;
  if (typeof value !== 'string' || !pattern.test(value) || BigInt(value) > maximum || BigInt(value) < -maximum || positive && BigInt(value) <= 0n) {
    throw sql ? invalidFinanceSql() : financeError('INVALID_VND', 'Tiền VND phải là chuỗi số nguyên đúng giới hạn decimal(19,0).', 400);
  }
  return value;
}
export const money = value => amount(value, { sql: true });
export const signedMoney = value => amount(value, { signed: true, sql: true });
export const sum = values => values.reduce((total, value) => total + BigInt(value), 0n).toString();
export function equal(actual, expected) { if (BigInt(actual) !== BigInt(expected)) throw invalidFinanceSql(); }
export const debitKinds = new Set(['CHARGE', 'REFUND', 'TRANSFER_DEBIT', 'DEPOSIT_UNAPPLY']);
export function folioBalance(t) {
  return (BigInt(t.chargesVnd) - BigInt(t.creditsVnd) - BigInt(t.paymentsVnd) + BigInt(t.refundsVnd)
    - BigInt(t.depositAppliedVnd) + BigInt(t.depositUnappliedVnd) + BigInt(t.transferInVnd) - BigInt(t.transferOutVnd)).toString();
}
export function depositBalance(t) { return (BigInt(t.receivedVnd) + BigInt(t.unappliedVnd) + BigInt(t.allocatedInVnd) - BigInt(t.appliedVnd) - BigInt(t.refundedVnd) - BigInt(t.allocatedOutVnd)).toString(); }
export function due(balance) { const n = BigInt(balance); return { dueVnd: (n > 0n ? n : 0n).toString(), creditVnd: (n < 0n ? -n : 0n).toString() }; }
