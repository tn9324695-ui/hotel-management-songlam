import { shape, identifier, label, version } from '../bookings/validation.js';
import { stateToken } from '../operations/validation.js';
import { consumptionError, quantity } from './amounts.js';

export const maximumConsumptionLines = 125; // Application ceiling; approved RPC can be smaller.
export function consumptionQuery(resource, operation, query) {
  const fields = operation === 'context' ? ['stayId', ...(resource === 'audits' ? ['roomSegmentId'] : [])]
    : operation === 'catalog' ? ['q', 'offset', 'limit'] : ['stayId', 'status', 'offset', 'limit'];
  shape(query, fields, operation === 'context' ? fields : []);
  const result = operation === 'context' ? {} : { offset: 0, limit: 50 };
  for (const [key, value] of Object.entries(query)) {
    if (typeof value !== 'string') throw consumptionError('VALIDATION_ERROR', 'Bộ lọc phải có một giá trị chuỗi.', 400);
    if (key.endsWith('Id')) result[key] = identifier(value, key);
    else if (key === 'q') result.q = label(value, 120, 'q');
    else if (key === 'status') {
      if (!(resource === 'orders' ? ['OPEN', 'DELIVERED', 'CANCELLED'] : ['PENDING', 'CONFIRMED', 'DISPUTED']).includes(value)) throw consumptionError('VALIDATION_ERROR', 'Trạng thái không hợp lệ.', 400);
      result.status = value;
    } else {
      if (!/^\d{1,7}$/.test(value) || Number(value) > (key === 'limit' ? 200 : 1000000) || key === 'limit' && Number(value) < 1) throw consumptionError('VALIDATION_ERROR', 'Giới hạn trang không hợp lệ.', 400);
      result[key] = Number(value);
    }
  }
  return result;
}
export function consumptionLines(values, resource, maxLines) {
  if (!Array.isArray(values) || values.length > Math.min(maxLines, maximumConsumptionLines)) throw consumptionError('CONSUMPTION_BATCH_LIMIT_EXCEEDED', 'Số dòng vượt giới hạn lô được duyệt; không tự chia lần ghi.');
  if (resource === 'orders' && !values.length) throw consumptionError('SERVICE_LINES_REQUIRED', 'Đơn dịch vụ phải có ít nhất một dòng.', 400);
  const seen = new Set();
  return values.map(row => {
    shape(row, ['serviceId', 'expectedServiceVersion', resource === 'orders' ? 'quantity' : 'consumedQuantity']);
    const serviceId = identifier(row.serviceId, 'serviceId', false);
    if (seen.has(serviceId)) throw consumptionError('DUPLICATE_SERVICE_LINE', 'Mỗi mặt hàng chỉ xuất hiện một lần trong yêu cầu.', 400);
    seen.add(serviceId);
    const result = { serviceId, expectedServiceVersion: version(row.expectedServiceVersion) };
    if (resource === 'orders') result.quantity = quantity(row.quantity).text;
    else {
      // ConsumedQuantity is int, but downstream ServiceOrderLine.Quantity is decimal(12,3).
      if (!Number.isSafeInteger(row.consumedQuantity) || row.consumedQuantity < 0 || row.consumedQuantity > 999999999) throw consumptionError('INVALID_CONSUMED_QUANTITY', 'Số lượng minibar phải là số nguyên từ 0 đến 999999999.', 400);
      result.consumedQuantity = row.consumedQuantity;
    }
    return result;
  });
}
export function consumptionInput(resource, operation, id, body, maxLines) {
  const common = ['expectedStayVersion', 'folioId', 'expectedFolioVersion'];
  const fields = operation === 'create' ? ['stayId', ...common, 'lines', 'note', ...(resource === 'audits' ? ['roomId', 'roomSegmentId', 'occupancyToken', 'inspectionScopeToken', 'zeroConsumptionConfirmed'] : [])]
    : ['expectedVersion', ...common, ...(resource === 'audits' ? ['occupancyToken', 'inspectionScopeToken'] : []), ...(['cancel', 'dispute'].includes(operation) ? ['reason'] : ['note'])];
  shape(body, fields, fields.filter(field => field !== 'note'));
  const result = { expectedStayVersion: version(body.expectedStayVersion), folioId: identifier(body.folioId, 'folioId'), expectedFolioVersion: version(body.expectedFolioVersion) };
  if (operation === 'create') {
    result.stayId = identifier(body.stayId, 'stayId');
    result.lines = consumptionLines(body.lines, resource, maxLines);
  } else { result.id = identifier(id); result.expectedVersion = version(body.expectedVersion); }
  if (fields.includes('reason')) result.reason = label(body.reason, 500, 'reason');
  else result.note = label(body.note, 1000, 'note', true);
  if (resource === 'audits') {
    result.occupancyToken = stateToken(body.occupancyToken);
    result.inspectionScopeToken = stateToken(body.inspectionScopeToken);
    if (operation === 'create') {
      result.roomId = identifier(body.roomId, 'roomId', false);
      result.roomSegmentId = identifier(body.roomSegmentId, 'roomSegmentId');
      if (typeof body.zeroConsumptionConfirmed !== 'boolean' || body.zeroConsumptionConfirmed !== result.lines.every(row => row.consumedQuantity === 0)) throw consumptionError('ZERO_CONSUMPTION_CONFIRMATION_REQUIRED', 'Phải xác nhận rõ không tiêu thụ khi biên bản không có lượng dùng; không được đánh dấu 0 khi có tiêu thụ.', 400);
      result.zeroConsumptionConfirmed = body.zeroConsumptionConfirmed;
    }
  }
  return result;
}
