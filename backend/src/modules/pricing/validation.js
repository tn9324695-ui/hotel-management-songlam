import { AppError } from '../../shared/errors.js';
import { isCalendarDate } from '../catalog/validation.js';

export const pricingError = (code, message, status = 422) => new AppError(status, code, message);
const bad = field => new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu báo giá không hợp lệ.', { [field]: 'Kiểm tra giá trị hoặc định dạng.' });
export function pricingId(value, field = 'id', big = false) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > (big ? 9223372036854775807n : 2147483647n)) throw bad(field);
  return value;
}
export function instant(value, field) {
  const match = typeof value === 'string' && /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.exec(value);
  if (!match || !isCalendarDate(match[1]) || !Number.isFinite(Date.parse(value))) throw bad(field);
  const suffix = match[6];
  const offset = suffix === 'Z' ? 0 : (Number(suffix.slice(1, 3)) * 60 + Number(suffix.slice(4))) * (suffix[0] === '+' ? 1 : -1);
  if (Math.abs(offset) > 840) throw bad(field);
  return { value, ms: Date.parse(value), offset };
}
function integer(value, min, max, field) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw bad(field);
  return value;
}
export function quoteInput(body, mode) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('body');
  const fields = mode === 'early-departure' ? ['stayId', 'newCheckOutAt']
    : ['roomTypeId', 'ratePlanId', 'checkInAt', 'checkOutAt', 'rooms', 'adultsPerRoom', 'childrenPerRoom'];
  if (Object.keys(body).some(key => !fields.includes(key)) || fields.some(key => !Object.hasOwn(body, key))) throw bad('body');
  if (mode === 'early-departure') {
    instant(body.newCheckOutAt, 'newCheckOutAt');
    return Object.freeze({ stayId: pricingId(body.stayId, 'stayId', true), newCheckOutAt: body.newCheckOutAt });
  }
  const start = instant(body.checkInAt, 'checkInAt'), end = instant(body.checkOutAt, 'checkOutAt');
  if (end.ms <= start.ms || end.ms - start.ms > 366 * 86400000) throw bad('checkOutAt');
  return Object.freeze({ roomTypeId: pricingId(body.roomTypeId, 'roomTypeId'), ratePlanId: pricingId(body.ratePlanId, 'ratePlanId'),
    checkInAt: body.checkInAt, checkOutAt: body.checkOutAt, rooms: integer(body.rooms, 1, 50, 'rooms'),
    adultsPerRoom: integer(body.adultsPerRoom, 1, 32767, 'adultsPerRoom'), childrenPerRoom: integer(body.childrenPerRoom, 0, 32767, 'childrenPerRoom') });
}
export function localTime(value, timeZone, checkInputOffset = true) {
  const parsed = instant(value, 'time');
  let parts;
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(parsed.ms)).map(part => [part.type, part.value]));
  } catch { throw pricingError('TIMEZONE_NOT_SUPPORTED', 'Chưa có ánh xạ múi giờ khách sạn hợp lệ.', 501); }
  const localDate = `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`;
  const wall = Date.parse(`${localDate}T${parts.hour}:${parts.minute}:${parts.second}Z`);
  const offset = (wall - Math.floor(parsed.ms / 1000) * 1000) / 60000;
  if (checkInputOffset && parsed.offset !== 0 && offset !== parsed.offset) throw pricingError('TIMEZONE_MISMATCH', 'Offset thời gian đầu vào không khớp múi giờ khách sạn.', 400);
  return { date: localDate, wallMs: (Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)) * 1000 + (parsed.ms % 1000 + 1000) % 1000, offset, ms: parsed.ms };
}
export function requireStableOffset(start, end, timeZone) {
  // Fixed-offset pricing profile only. Do not guess how a wall-clock fee should
  // behave through DST; check intermediate days as well as interval endpoints.
  for (let at = start.ms; at < end.ms; at += 12 * 3600000) {
    if (localTime(new Date(at).toISOString(), timeZone, false).offset !== start.offset) throw pricingError('TIMEZONE_TRANSITION_NOT_SUPPORTED', 'Khoảng ở đi qua thay đổi offset chưa được chính sách hiện tại hỗ trợ.', 501);
  }
  if (end.offset !== start.offset) throw pricingError('TIMEZONE_TRANSITION_NOT_SUPPORTED', 'Khoảng ở đi qua thay đổi offset chưa được chính sách hiện tại hỗ trợ.', 501);
}
export function clockMilliseconds(value) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value)) throw pricingError('POLICY_INVALID', 'Giờ nhận/trả chuẩn trong cấu hình không hợp lệ.');
  const [h, m, s] = value.split(':').map(Number);
  return (h * 3600 + m * 60 + s) * 1000;
}
export function nightDates(start, end) {
  if (!isCalendarDate(start) || !isCalendarDate(end) || end <= start) throw pricingError('INVALID_NIGHT_INTERVAL', 'Khoảng ở theo đêm phải có ít nhất một đêm.');
  const dates = [];
  for (let time = Date.parse(start + 'T00:00:00Z'); time < Date.parse(end + 'T00:00:00Z'); time += 86400000) {
    if (dates.length >= 366) throw pricingError('QUOTE_TOO_LARGE', 'Khoảng báo giá vượt giới hạn xử lý.');
    dates.push(new Date(time).toISOString().slice(0, 10));
  }
  return dates;
}
