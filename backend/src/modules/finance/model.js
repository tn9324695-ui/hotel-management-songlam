import { assertActor } from '../auth/security.js';
import { financeError } from './money.js';
const command = (rights, fields, optional = []) => Object.freeze({ rights: Object.freeze(rights), fields: Object.freeze(fields), optional: Object.freeze(optional) });
// Permission names from the checked-in SQL contract, never role names from a browser.
export const financeResources = Object.freeze({
  folios: { path: '/folios', read: ['collectPayment'], versioned: true, commands: {
    transfer: command(['collectPayment'], ['targetFolioId', 'targetVersion', 'amountVnd', 'reason']),
    credit: command(['systemConfig'], ['originalEntryId', 'amountVnd', 'reason']),
    close: command(['collectPayment'], ['reason']) } },
  deposits: { path: '/deposit-accounts', read: ['collectPayment'], versioned: false, commands: {
    apply: command(['collectPayment'], ['targetFolioId', 'targetVersion', 'amountVnd', 'reason']),
    unapply: command(['collectPayment'], ['originalMovementId', 'reason']),
    allocate: command(['collectPayment'], ['targetDepositAccountId', 'amountVnd', 'reason']) } },
  payments: { path: '/payments', read: ['collectPayment'], versioned: true, commands: {
    create: command(['collectPayment'], ['bookingId', 'purpose', 'method', 'amountVnd', 'shiftId', 'allocations', 'reason'], ['shiftId']),
    cancel: command(['collectPayment'], ['reason']) } },
  refunds: { path: '/refunds', read: ['collectPayment', 'approveRefund'], versioned: true, commands: {
    create: command(['collectPayment'], ['originalPaymentId', 'folioId', 'depositAccountId', 'amountVnd', 'reason'], ['folioId', 'depositAccountId']),
    decide: command(['approveRefund'], ['decision', 'reason']),
    complete: command(['collectPayment'], ['shiftId', 'reason']) } },
  checkouts: { path: '/checkouts', read: ['manageCheckOut'], versioned: true, commands: {
    complete: command(['manageCheckOut'], ['previewToken', 'plan']) } },
  invoices: { path: '/invoices', read: ['printVatInvoice'], versioned: true, commands: {
    create: command(['printVatInvoice'], ['sourceType', 'sourceId']), issue: command(['printVatInvoice'], ['reason']) } },
  cashier: { path: '/cashier/shifts', read: ['collectPayment'], versioned: true, commands: {
    open: command(['collectPayment'], ['openingCashVnd', 'reason']),
    close: command(['collectPayment'], ['previewToken', 'countedCashVnd', 'reason']) } },
  days: { path: '/finance/business-days', read: ['viewDailyRevenue'], versioned: true, commands: {
    close: command(['systemConfig'], ['previewToken', 'reason']) } }
});
export function requireFinancePermission(actor, resource, operation) {
  assertActor(actor);
  const spec = Object.hasOwn(financeResources, resource) && financeResources[resource];
  const read = ['list', 'detail', 'entries', 'movements', 'preview'].includes(operation);
  if (!spec || !(read ? spec.read.some(right => actor.permissions.includes(right)) : spec.commands[operation]?.rights.every(right => actor.permissions.includes(right)))) {
    throw financeError('FORBIDDEN', 'Bạn không có quyền thực hiện thao tác tài chính này.', 403);
  }
}
export const refundMethods = Object.freeze(['CASH', 'BANK_TRANSFER', 'VIETQR', 'VNPAY_QR', 'ONEPAY', 'POS_CARD']);
export function requireSettlementPermissions(actor, plan) {
  if (plan.depositApplications.length || plan.cashReceipt || plan.refundRequestIds.length || plan.transferToMaster) {
    if (!actor.permissions.includes('collectPayment')) throw financeError('FORBIDDEN', 'Phương án quyết toán này cần quyền thu/đối trừ tiền.', 403);
  }
}
