import { AppError } from '../../shared/errors.js';
import { getCatalogResource } from './resources.js';

const invalid = field => new AppError(400, 'VALIDATION_ERROR', 'Tham số đọc dữ liệu không hợp lệ.', { [field]: 'Kiểm tra định dạng hoặc giới hạn cho phép.' });
export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + 'T00:00:00.000Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
function positiveId(value, maximum, field) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > maximum) throw invalid(field);
  return value;
}
export function parseKey(name, value) {
  const definition = getCatalogResource(name);
  if (!definition) throw invalid('resource');
  if (definition.key === 'date') { if (!isCalendarDate(value)) throw invalid('date'); return value; }
  return positiveId(value, definition.key === 'int' ? 2147483647n : 9223372036854775807n, 'id');
}
function integer(value, defaultValue, minimum, maximum, field) {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'string' || !/^\d{1,9}$/.test(value)) throw invalid(field);
  const number = Number(value);
  if (number < minimum || number > maximum) throw invalid(field);
  return number;
}
export function parseCatalogQuery(name, input = {}, operation = 'list') {
  const definition = getCatalogResource(name);
  if (!definition || !input || typeof input !== 'object' || Array.isArray(input)) throw invalid('query');
  if (operation !== 'list') {
    if (Object.keys(input).length) throw invalid('query');
    return Object.freeze({ offset: 0, limit: 1, filters: Object.freeze({}) });
  }
  const filters = {};
  for (const [field, raw] of Object.entries(input)) {
    if (field === 'offset' || field === 'limit') continue;
    if (!Object.hasOwn(definition.filters, field)) throw invalid(field);
    const rule = definition.filters[field];
    if (typeof raw !== 'string') throw invalid(field); // No arrays, repeated keys or nested objects.
    if (rule.type === 'boolean') {
      if (!['true', 'false'].includes(raw)) throw invalid(field);
      filters[field] = raw === 'true';
    } else if (rule.type === 'int') {
      filters[field] = positiveId(raw, 2147483647n, field);
    } else if (rule.type === 'date') {
      if (!isCalendarDate(raw)) throw invalid(field);
      filters[field] = raw;
    } else if (rule.type === 'enum') {
      if (!rule.values.includes(raw)) throw invalid(field);
      filters[field] = raw;
    } else {
      const value = raw.trim();
      if (value.length < (rule.min || 1) || value.length > rule.max || /[\u0000-\u001f\u007f]/.test(value)) throw invalid(field);
      filters[field] = value;
    }
  }
  if (filters.from && filters.to && filters.from > filters.to) throw invalid('to');
  // Searching customers must be intentional; do not expose a bulk contact directory.
  if (name === 'customers' && !filters.q && !filters.phone && !filters.code) throw invalid('q');
  return Object.freeze({ offset: integer(input.offset, 0, 0, 1000000, 'offset'),
    limit: integer(input.limit, Math.min(50, definition.maxLimit), 1, definition.maxLimit, 'limit'), filters: Object.freeze(filters) });
}
