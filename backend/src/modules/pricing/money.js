import { pricingError } from './validation.js';
const maximum = 9999999999999999999n; // SQL decimal(19,0).
export function vnd(value) {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,18})$/.test(value)) throw pricingError('PRICE_INVALID', 'Giá VND phải là chuỗi số nguyên không âm chính xác.');
  return BigInt(value);
}
export function amount(value) {
  if (value < 0n || value > maximum) throw pricingError('PRICE_OVERFLOW', 'Số tiền vượt phạm vi VND được hỗ trợ.');
  return value.toString();
}
export function roundedRatio(base, numerator, denominator, rounding) {
  const n = vnd(numerator), d = vnd(denominator);
  if (!d || !['DOWN', 'UP', 'HALF_UP'].includes(rounding)) throw pricingError('ROUNDING_POLICY_MISSING', 'Thiếu quy tắc làm tròn tiền hợp lệ.');
  const product = base * n, quotient = product / d, remainder = product % d;
  return quotient + (rounding === 'UP' && remainder > 0n || rounding === 'HALF_UP' && remainder * 2n >= d ? 1n : 0n);
}
