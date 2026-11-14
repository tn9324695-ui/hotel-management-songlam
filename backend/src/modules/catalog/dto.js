import { AppError } from '../../shared/errors.js';
import { isCalendarDate } from './validation.js';

export const invalidSqlResponse = () => new AppError(502, 'SQL_RESPONSE_INVALID', 'Dữ liệu SQL không đúng hợp đồng đọc đã cấu hình.');
function text(value, max, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || value.length > max) throw invalidSqlResponse();
  return value;
}
function id(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw invalidSqlResponse();
  if (!['string', 'number', 'bigint'].includes(typeof value)) throw invalidSqlResponse();
  const output = String(value);
  if (!/^[1-9]\d{0,18}$/.test(output) || BigInt(output) > 9223372036854775807n) throw invalidSqlResponse();
  return output;
}
function count(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 32767) throw invalidSqlResponse();
  return value;
}
function flag(value) {
  if (![true, false, 1, 0].includes(value)) throw invalidSqlResponse();
  return value === true || value === 1;
}
function decimal(value, scale, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value === 'number' && (!Number.isFinite(value) || (scale === 0 && !Number.isSafeInteger(value)))) throw invalidSqlResponse();
  if (!['string', 'number'].includes(typeof value)) throw invalidSqlResponse();
  const output = String(value);
  if (!(scale === 0 ? /^\d{1,19}$/ : /^\d{1,6}(?:\.\d{1,2})?$/).test(output)) throw invalidSqlResponse();
  return output; // VND decimal(19,0) must not lose precision through Number.
}
function choice(value, choices) { if (!choices.includes(value)) throw invalidSqlResponse(); return value; }
function date(value) { if (!isCalendarDate(value)) throw invalidSqlResponse(); return value; }
function time(value) { if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value)) throw invalidSqlResponse(); return value; }
function utc(value) {
  if (value === null) return null;
  if (value instanceof Date) { if (!Number.isFinite(value.getTime())) throw invalidSqlResponse(); return value.toISOString(); }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?Z$/.test(value)
    || !isCalendarDate(value.slice(0, 10)) || !Number.isFinite(Date.parse(value))) throw invalidSqlResponse();
  return value;
}

const projections = Object.freeze({
  ratePlans: row => ({ id: id(row.RatePlanId), code: text(row.Code, 40), name: text(row.Name, 120),
    stayType: choice(row.StayType, ['NIGHTLY', 'HOURLY']), policyVersionId: id(row.PolicyVersionId), active: flag(row.IsActive) }),
  rateRules: row => ({ id: id(row.RateRuleId), ratePlanId: id(row.RatePlanId), roomTypeId: id(row.RoomTypeId), validFrom: date(row.ValidFrom), validTo: date(row.ValidTo),
    dayKind: choice(row.DayKind, ['BASE', 'WEEKEND', 'HOLIDAY', 'SPECIFIC']), priority: signedSmallInt(row.Priority), priceVnd: decimal(row.PriceVnd, 0),
    includedMinutes: nullableMinutes(row.IncludedMinutes), extraBlockMinutes: nullableMinutes(row.ExtraBlockMinutes), extraBlockPriceVnd: decimal(row.ExtraBlockPriceVnd, 0, true) }),
  policyVersions: row => ({ id: id(row.PolicyVersionId), code: text(row.Code, 40), version: positiveInt(row.Version), effectiveFromUtc: utc(row.EffectiveFromUtc) }),
  roomTypes: row => ({ id: id(row.RoomTypeId), code: text(row.Code, 30), name: text(row.Name, 120),
    areaM2: decimal(row.AreaM2, 2, true), standardOccupancy: count(row.StandardOccupancy), maxOccupancy: count(row.MaxOccupancy),
    bedConfiguration: text(row.BedConfiguration, 250, true), description: text(row.Description, 1000, true), active: flag(row.IsActive) }),
  rooms: row => ({ id: id(row.RoomId), number: text(row.Number, 20), roomTypeId: id(row.RoomTypeId), floor: text(row.FloorLabel, 30),
    occupancyStatus: choice(row.StayStatus, ['VACANT', 'OCCUPIED']),
    cleanlinessStatus: choice(row.CleanStatus, ['CLEAN', 'DIRTY', 'CLEANING', 'INSPECTING']),
    exploitationStatus: choice(row.ExploitationStatus, ['ACTIVE', 'INACTIVE', 'MAINTENANCE']) }),
  services: row => ({ id: id(row.ServiceId), code: text(row.Code, 40), name: text(row.Name, 160), category: text(row.Category, 30),
    unit: text(row.Unit, 30), priceVnd: decimal(row.PriceVnd, 0), active: flag(row.IsActive) }),
  hotelSettings: row => ({ id: id(row.HotelId), name: text(row.Name, 200), address: text(row.Address, 500, true),
    phone: text(row.Phone, 30, true), email: text(row.Email, 254, true), timeZoneId: text(row.TimeZoneId, 60),
    currency: choice(row.Currency, ['VND']), workingDate: date(row.WorkingDate), checkInTime: time(row.CheckInTime), checkOutTime: time(row.CheckOutTime) }),
  businessDays: row => ({ date: date(row.BusinessDate), status: choice(row.Status, ['OPEN', 'CLOSED']), closedAtUtc: utc(row.ClosedAtUtc) }),
  customers: row => ({ id: id(row.CustomerId), code: text(row.Code, 40), fullName: text(row.FullName, 160),
    phone: text(row.Phone, 30, true), active: flag(row.IsActive) })
});

function signedSmallInt(value) { if (!Number.isInteger(value) || value < -32768 || value > 32767) throw invalidSqlResponse(); return value; }
function positiveInt(value) { if (!Number.isInteger(value) || value < 1 || value > 2147483647) throw invalidSqlResponse(); return value; }
function nullableMinutes(value) { return value === null ? null : positiveInt(value); }

export function toCatalogDto(resource, row) {
  if (!Object.hasOwn(projections, resource) || !row || typeof row !== 'object' || Array.isArray(row)) throw invalidSqlResponse();
  // Construct every DTO explicitly. SQL extras (hashes, IDs of documents, free
  // notes, financial snapshots, etc.) are never spread or returned to the client.
  return projections[resource](row);
}
