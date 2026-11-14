import { shape, identifier, label } from '../bookings/validation.js';
import { instant } from '../pricing/validation.js';
import { isCalendarDate } from '../catalog/validation.js';
import { managementError } from './model.js';
export function pageQuery(query, filters = []) {
  shape(query, ['offset', 'limit', ...filters], []); const result = { offset: 0, limit: 50 };
  for (const field of ['offset', 'limit']) if (query[field] !== undefined) {
    if (typeof query[field] !== 'string' || !/^\d{1,7}$/.test(query[field]) || Number(query[field]) > (field === 'limit' ? 200 : 1000000) || field === 'limit' && Number(query[field]) === 0) throw managementError('INVALID_PAGE', 'Phân trang không hợp lệ.', 400);
    result[field] = Number(query[field]);
  }
  return result;
}
export function reportQuery(report, query) {
  const base = ['from', 'to', 'timeZone'], extra = report === 'receivables' ? ['bookingId', 'folioKind', 'offset', 'limit'] : ['offset', 'limit'];
  shape(query, [...base, ...extra], base);
  if (!isCalendarDate(query.from) || !isCalendarDate(query.to) || query.to <= query.from) throw managementError('INVALID_REPORT_PERIOD', 'Kỳ phải là [từ ngày, đến trước ngày), ngày kết thúc sau ngày bắt đầu.', 400);
  const days = (Date.parse(query.to + 'T00:00:00Z') - Date.parse(query.from + 'T00:00:00Z')) / 86400000;
  if (days > 366) throw managementError('REPORT_PERIOD_TOO_LONG', 'Kỳ vượt trần 366 ngày của ứng dụng.', 400);
  const timeZone = label(query.timeZone, 60, 'timeZone');
  try { new Intl.DateTimeFormat('vi-VN', { timeZone }); } catch { throw managementError('INVALID_TIME_ZONE', 'Cần múi giờ IANA đã được SQL xác nhận.', 400); }
  const result = { ...pageQuery(query, [...base, 'bookingId', 'folioKind']), from: query.from, to: query.to, timeZone };
  if (query.bookingId !== undefined) result.bookingId = identifier(query.bookingId);
  if (query.folioKind !== undefined) { if (!['MASTER', 'ROOM', 'INCIDENTAL'].includes(query.folioKind)) throw managementError('INVALID_FOLIO_KIND', 'Loại folio không hợp lệ.', 400); result.folioKind = query.folioKind; }
  return result;
}
export function adminQuery(resource, operation, query) {
  const log = ['audit', 'exceptions'].includes(resource), fields = log ? ['fromUtc', 'toUtc', 'timeZone', 'performedBy', 'action', 'entityType', 'entityKey', 'result', 'reference', ...(resource === 'exceptions' ? ['status', 'kind'] : [])]
    : resource === 'users' ? ['q', 'active', 'roleCode'] : resource === 'roles' ? ['q', 'active'] : ['q'];
  const result = pageQuery(query, fields);
  if (log) {
    if (query.fromUtc === undefined || query.toUtc === undefined || query.timeZone === undefined) throw managementError('LOG_PERIOD_REQUIRED', 'Phải chọn rõ khoảng UTC và múi giờ hiển thị nhật ký.', 400);
    const start = instant(query.fromUtc, 'fromUtc'), end = instant(query.toUtc, 'toUtc');
    if (end.ms <= start.ms || end.ms - start.ms > 366 * 86400000) throw managementError('INVALID_LOG_PERIOD', 'Khoảng nhật ký không hợp lệ hoặc vượt 366 ngày.', 400);
    result.fromUtc = new Date(start.ms).toISOString(); result.toUtc = new Date(end.ms).toISOString(); result.timeZone = label(query.timeZone, 60, 'timeZone');
    try { new Intl.DateTimeFormat('vi-VN', { timeZone: result.timeZone }); } catch { throw managementError('INVALID_TIME_ZONE', 'Múi giờ nhật ký không hợp lệ.', 400); }
    // A performer filter is never the actor used to authorize/query SQL.
    if (query.performedBy !== undefined) result.performedBy = identifier(query.performedBy, 'performedBy');
  }
  for (const field of fields.filter(field => !['fromUtc', 'toUtc', 'timeZone', 'performedBy'].includes(field))) if (query[field] !== undefined) {
    if (field === 'active') { if (!['true', 'false'].includes(query[field])) throw managementError('INVALID_ACTIVE_FILTER', 'Bộ lọc tài khoản không hợp lệ.', 400); result.active = query[field] === 'true'; }
    else if (field === 'result') { if (!['SUCCEEDED', 'REJECTED', 'FAILED', 'UNKNOWN'].includes(query[field])) throw managementError('INVALID_RESULT_FILTER', 'Kết quả lọc không hợp lệ.', 400); result.result = query[field]; }
    else result[field] = label(query[field], field === 'q' ? 100 : 80, field);
  }
  return result;
}
