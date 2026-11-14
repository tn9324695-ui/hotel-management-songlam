import { shape, identifier, version, label } from '../bookings/validation.js';
import { isCalendarDate } from '../catalog/validation.js';
import { stateToken } from '../operations/validation.js';
import { amount, financeError, sum } from './money.js';
import { financeResources, refundMethods } from './model.js';
export function financeRequestToken(value) {
  try { return stateToken(value); } catch { throw financeError('INVALID_FINANCE_TOKEN', 'Ngữ cảnh tài chính không hợp lệ; hãy xác minh lại từ server.', 400); }
}
export function financeId(resource, value) {
  if (resource !== 'days') return identifier(value);
  if (!isCalendarDate(value)) throw financeError('INVALID_BUSINESS_DATE', 'Ngày kinh doanh không hợp lệ.', 400);
  return value;
}
export function financeQuery(resource, operation, query) {
  const filters = { folios: ['bookingId', 'status'], deposits: ['bookingId'], payments: ['bookingId', 'shiftId', 'businessDate', 'status'], refunds: ['status'],
    checkouts: ['bookingId', 'stayId', 'status'], invoices: ['status'], cashier: ['businessDate', 'status'], days: ['businessDate', 'status'] };
  const allowed = operation === 'context' ? ['operation', 'id', 'bookingId', 'paymentId', 'sourceId', 'sourceType'] : ['offset', 'limit', ...filters[resource]];
  shape(query, allowed, operation === 'context' ? ['operation'] : []);
  const result = operation === 'context' ? {} : { offset: 0, limit: 50 };
  for (const [field, value] of Object.entries(query)) {
    if (typeof value !== 'string') throw financeError('VALIDATION_ERROR', 'Mỗi bộ lọc chỉ nhận một chuỗi.', 400);
    if (field === 'id') result.id = financeId(resource, value);
    else if (field.endsWith('Id')) result[field] = identifier(value, field);
    else if (field === 'businessDate') result.businessDate = financeId('days', value);
    else if (field === 'operation') {
      if (!Object.hasOwn(financeResources[resource].commands, value) && value !== 'preview') throw financeError('OPERATION_NOT_SUPPORTED', 'Thao tác tài chính chưa hỗ trợ.', 501);
      result.operation = value;
    } else if (field === 'sourceType') {
      if (!['PAYMENT', 'REFUND', 'SETTLEMENT'].includes(value)) throw financeError('INVALID_DOCUMENT_SOURCE', 'Nguồn phiếu nội bộ không hợp lệ.', 400);
      result.sourceType = value;
    } else if (field === 'status') result.status = label(value, 20, 'status');
    else { if (!/^\d{1,7}$/.test(value) || Number(value) > (field === 'limit' ? 200 : 1000000) || field === 'limit' && Number(value) === 0) throw financeError('INVALID_PAGE', 'Phân trang không hợp lệ.', 400); result[field] = Number(value); }
  }
  if (operation === 'context' && !['create', 'open'].includes(result.operation) && !result.id) throw financeError('CONTEXT_SUBJECT_REQUIRED', 'Phải chọn đúng đối tượng trước khi xác minh ngữ cảnh.', 400);
  return result;
}
function allocations(rows, maxLines) {
  if (!Array.isArray(rows) || !rows.length || rows.length > maxLines) throw financeError('FINANCE_BATCH_LIMIT_EXCEEDED', 'Phân bổ vượt giới hạn hoặc rỗng; không tự chia lô.');
  const seen = new Set();
  return rows.map(row => {
    shape(row, ['folioId', 'depositAccountId', 'amountVnd'], ['amountVnd']);
    if ((row.folioId == null) === (row.depositAccountId == null)) throw financeError('ALLOCATION_TARGET_REQUIRED', 'Mỗi phân bổ cần đúng một folio hoặc tài khoản cọc.', 400);
    const result = { folioId: row.folioId == null ? null : identifier(row.folioId), depositAccountId: row.depositAccountId == null ? null : identifier(row.depositAccountId), amountVnd: amount(row.amountVnd, { positive: true }) };
    const key = result.folioId ? 'F:' + result.folioId : 'D:' + result.depositAccountId;
    if (seen.has(key)) throw financeError('DUPLICATE_ALLOCATION', 'Không lặp đích phân bổ trong cùng khoản thu.', 400);
    seen.add(key); return result;
  });
}
export function financeInput(resource, operation, id, body, maxLines = 125) {
  const spec = financeResources[resource], definition = spec.commands[operation];
  if (!definition) throw financeError('OPERATION_NOT_SUPPORTED', 'Thao tác chưa hỗ trợ.', 501);
  const existing = !['create', 'open'].includes(operation), common = ['contextToken', ...(existing && spec.versioned ? ['expectedVersion'] : [])];
  shape(body, [...common, ...definition.fields], [...common, ...definition.fields.filter(field => !definition.optional.includes(field))]);
  const result = { contextToken: stateToken(body.contextToken) };
  if (existing) result.id = financeId(resource, id);
  if (existing && spec.versioned) result.expectedVersion = version(body.expectedVersion);
  for (const field of definition.fields) {
    const value = body[field];
    if (field === 'plan') result.plan = checkoutPlan(result.id, value, maxLines);
    else if (field.endsWith('Token')) result[field] = stateToken(value);
    else if (field.endsWith('Version')) result[field] = version(value);
    else if (field.endsWith('Id')) result[field] = value == null && definition.optional.includes(field) ? null : identifier(value, field);
    else if (field.endsWith('Vnd')) result[field] = amount(value, { positive: field === 'amountVnd' });
    else if (field === 'allocations') result.allocations = allocations(value, maxLines);
    else if (field === 'method') { if (!refundMethods.includes(value)) throw financeError('PAYMENT_METHOD_NOT_SUPPORTED', 'Phương thức chưa có trong schema.', 400); result.method = value; }
    else if (field === 'purpose') { if (!['BOOKING_DEPOSIT', 'GUARANTEE_DEPOSIT', 'SETTLEMENT', 'SERVICE'].includes(value)) throw financeError('INVALID_PAYMENT_PURPOSE', 'Mục đích thu không hợp lệ.', 400); result.purpose = value; }
    else if (field === 'decision') { if (!['APPROVED', 'REJECTED'].includes(value)) throw financeError('INVALID_REFUND_DECISION', 'Quyết định hoàn tiền không hợp lệ.', 400); result.decision = value; }
    else if (field === 'sourceType') { if (!['PAYMENT', 'REFUND', 'SETTLEMENT'].includes(value)) throw financeError('INVALID_DOCUMENT_SOURCE', 'Phiếu nội bộ cần giao dịch nguồn hợp lệ.', 400); result.sourceType = value; }
    else result[field] = label(value, 1000, field);
  }
  if (resource === 'payments' && operation === 'create') {
    if (sum(result.allocations.map(row => row.amountVnd)) !== result.amountVnd) throw financeError('PAYMENT_ALLOCATION_MISMATCH', 'Tổng phân bổ phải bằng khoản thu.');
    if (result.method === 'CASH' && !result.shiftId || result.method !== 'CASH' && result.shiftId) throw financeError('INVALID_PAYMENT_SHIFT', 'Tiền mặt cần ca đang mở; khoản ngoài tiền mặt chưa đối soát không được đưa vào ca tiền mặt.');
    const deposit = ['BOOKING_DEPOSIT', 'GUARANTEE_DEPOSIT'].includes(result.purpose);
    if (result.allocations.some(row => deposit ? !row.depositAccountId : !row.folioId)) throw financeError('PAYMENT_PURPOSE_MISMATCH', 'Khoản cọc và khoản thanh toán phải phân bổ đúng loại đích.');
  }
  if (resource === 'refunds' && operation === 'create' && (result.folioId === null) === (result.depositAccountId === null)) throw financeError('REFUND_SOURCE_REQUIRED', 'Yêu cầu hoàn phải trỏ đúng một phân bổ của khoản thu gốc.');
  if (result.plan && (result.plan.contextToken !== result.contextToken || result.plan.expectedVersion !== result.expectedVersion)) throw financeError('CHECKOUT_PLAN_MISMATCH', 'Phương án checkout phải khớp đúng ngữ cảnh và phiên bản đã xem trước.');
  if (resource === 'folios' && operation === 'transfer' && result.targetFolioId === result.id || resource === 'deposits' && operation === 'allocate' && result.targetDepositAccountId === result.id) throw financeError('SAME_TRANSFER_TARGET', 'Bên nhận phải khác bên chuyển.');
  return result;
}
export function checkoutPlan(id, body, maxLines = 125) {
  shape(body, ['contextToken', 'expectedVersion', 'depositApplications', 'cashReceipt', 'refundRequestIds', 'transferToMaster', 'quickMinibarSegments']);
  const result = { id: identifier(id), contextToken: stateToken(body.contextToken), expectedVersion: version(body.expectedVersion) };
  for (const field of ['depositApplications', 'refundRequestIds', 'quickMinibarSegments']) if (!Array.isArray(body[field]) || body[field].length > maxLines) throw financeError('FINANCE_BATCH_LIMIT_EXCEEDED', 'Phương án vượt giới hạn nguyên tử; không chia lần quyết toán.');
  result.depositApplications = body.depositApplications.map(row => { shape(row, ['depositAccountId', 'amountVnd']); return { depositAccountId: identifier(row.depositAccountId), amountVnd: amount(row.amountVnd, { positive: true }) }; });
  result.refundRequestIds = body.refundRequestIds.map(row => identifier(row));
  result.cashReceipt = body.cashReceipt === null ? null : (() => { shape(body.cashReceipt, ['shiftId', 'amountVnd']); return { shiftId: identifier(body.cashReceipt.shiftId), amountVnd: amount(body.cashReceipt.amountVnd, { positive: true }) }; })();
  result.transferToMaster = body.transferToMaster === null ? null : (() => { shape(body.transferToMaster, ['targetFolioId', 'amountVnd']); return { targetFolioId: identifier(body.transferToMaster.targetFolioId), amountVnd: amount(body.transferToMaster.amountVnd, { positive: true }) }; })();
  result.quickMinibarSegments = body.quickMinibarSegments.map(row => { shape(row, ['segmentId', 'occupancyToken', 'inspectionScopeToken', 'zeroConsumptionConfirmed']); if (row.zeroConsumptionConfirmed !== true) throw financeError('ZERO_INSPECTION_REQUIRED', 'Xác nhận nhanh chỉ khi đã kiểm thực tế không tiêu thụ.'); return { segmentId: identifier(row.segmentId), occupancyToken: stateToken(row.occupancyToken), inspectionScopeToken: stateToken(row.inspectionScopeToken), zeroConsumptionConfirmed: true }; });
  for (const rows of [result.depositApplications.map(row => row.depositAccountId), result.refundRequestIds, result.quickMinibarSegments.map(row => row.segmentId)]) if (new Set(rows).size !== rows.length) throw financeError('DUPLICATE_SETTLEMENT_SOURCE', 'Không lặp nguồn cọc, hoàn hoặc kiểm minibar.');
  if (result.depositApplications.length + result.refundRequestIds.length + result.quickMinibarSegments.length > maxLines) throw financeError('FINANCE_BATCH_LIMIT_EXCEEDED', 'Toàn phương án vượt giới hạn; không chia lô.');
  return result;
}
