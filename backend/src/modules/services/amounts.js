import { AppError } from '../../shared/errors.js';

export const consumptionError = (code, message, status = 422) => new AppError(status, code, message);
export const invalidConsumptionSql = () => consumptionError('CONSUMPTION_SQL_RESPONSE_INVALID', 'SQL chưa trả đúng hợp đồng dịch vụ/minibar.', 502);
const decimal19 = 9999999999999999999n;
export function vnd(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,18})$/.test(value) || BigInt(value) > decimal19) throw invalidConsumptionSql();
  return value;
}
export function quantity(value) {
  // SQL decimal(12,3), strictly decimal strings; never use binary floating point.
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,8})(?:\.\d{1,3})?$/.test(value)) throw consumptionError('INVALID_QUANTITY', 'Số lượng phải là chuỗi thập phân dương, tối đa 999999999.999 và 3 số lẻ.', 400);
  const [whole, fraction = ''] = value.split('.'), scaled = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
  if (scaled <= 0n || scaled > 999999999999n) throw consumptionError('INVALID_QUANTITY', 'Số lượng vượt giới hạn decimal(12,3).', 400);
  return { text: whole + '.' + fraction.padEnd(3, '0'), scaled };
}
export function lineAmount(quantityText, priceText) {
  // Positive quantities/prices: SQL ROUND(x,0) is half away from zero.
  const amount = (quantity(quantityText).scaled * BigInt(vnd(priceText)) + 500n) / 1000n;
  if (amount > decimal19) throw consumptionError('SERVICE_AMOUNT_OVERFLOW', 'Thành tiền vượt giới hạn decimal(19,0).');
  return amount.toString();
}
export function totalAmount(lines) {
  const total = lines.reduce((sum, row) => sum + BigInt(vnd(row.amountVnd)), 0n);
  if (total > decimal19) throw consumptionError('SERVICE_TOTAL_OVERFLOW', 'Tổng tiền vượt giới hạn decimal(19,0).');
  return total.toString();
}
