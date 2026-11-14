import { createHash } from 'node:crypto';
import { pricingError } from './validation.js';
import { vnd } from './money.js';

export const dayKinds = Object.freeze(['BASE', 'WEEKEND', 'HOLIDAY', 'SPECIFIC']);
export const hashText = text => createHash('sha256').update(text).digest('hex');
const unsupported = () => pricingError('POLICY_FORMAT_NOT_SUPPORTED', 'Chính sách chưa có định dạng hoặc ngữ nghĩa tính giá được hỗ trợ/phê duyệt.', 501);
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw unsupported();
}
export function readPolicy(json) {
  if (typeof json !== 'string' || Buffer.byteLength(json) > 65536) throw unsupported();
  let policy;
  try { policy = JSON.parse(json); } catch { throw unsupported(); }
  // Proposed closed format, not an interpretation of arbitrary existing RulesJson.
  object(policy, ['schema', 'moneyRounding', 'occupancy', 'effectiveBasis', 'selection', 'boundaryClock', 'earlyArrival', 'lateDeparture', 'earlyDeparture', 'hourlyRateBasis', 'lateDepartureInterval', 'hourlyMaximumMinutes']);
  if (policy.schema !== 'songlam.policy.v1' || !['DOWN', 'UP', 'HALF_UP'].includes(policy.moneyRounding)
    || policy.occupancy !== 'INCLUDED_UP_TO_MAX' || !['QUOTE_TIME', 'ARRIVAL_TIME'].includes(policy.effectiveBasis)) throw unsupported();
  if (policy.boundaryClock !== undefined && policy.boundaryClock !== 'HOTEL_WALL_CLOCK') throw unsupported();
  // Existing snapshots retain their original (from,to] semantics. A new
  // approved policy can explicitly select [from,to), e.g. 15:00 starts 50%.
  if (policy.lateDepartureInterval !== undefined && !['LEFT_OPEN_RIGHT_CLOSED', 'LEFT_CLOSED_RIGHT_OPEN'].includes(policy.lateDepartureInterval)) throw unsupported();
  if (policy.hourlyMaximumMinutes !== undefined && (!Number.isSafeInteger(policy.hourlyMaximumMinutes) || policy.hourlyMaximumMinutes < 1 || policy.hourlyMaximumMinutes > 527040)) throw unsupported();
  object(policy.selection, ['order', 'priority', 'dayKindOrder', 'fallback']);
  if (!['DAY_KIND_THEN_PRIORITY', 'PRIORITY_THEN_DAY_KIND'].includes(policy.selection.order)
    || !['HIGHER_WINS', 'LOWER_WINS'].includes(policy.selection.priority)
    || !Array.isArray(policy.selection.dayKindOrder) || policy.selection.dayKindOrder.length !== 4
    || new Set(policy.selection.dayKindOrder).size !== 4 || policy.selection.dayKindOrder.some(kind => !dayKinds.includes(kind))
    || !['ALLOW_ELIGIBLE_RULES', 'REQUIRE_HIGHEST_DAY_KIND'].includes(policy.selection.fallback)
    || policy.selection.fallback === 'REQUIRE_HIGHEST_DAY_KIND' && policy.selection.order !== 'DAY_KIND_THEN_PRIORITY') throw unsupported();
  for (const name of ['earlyArrival', 'lateDeparture']) {
    if (policy[name] === undefined) continue;
    if (policy.boundaryClock !== 'HOTEL_WALL_CLOCK' || !Array.isArray(policy[name]) || policy[name].length > 100) throw unsupported();
    for (const band of policy[name]) {
      object(band, ['fromMinutes', 'toMinutes', 'fixedVnd', 'numerator', 'denominator']);
      if (!Number.isSafeInteger(band.fromMinutes) || band.fromMinutes < 0 || band.fromMinutes > 1440
        || (band.toMinutes !== null && (!Number.isSafeInteger(band.toMinutes) || band.toMinutes <= band.fromMinutes || band.toMinutes > 1440))) throw unsupported();
      if (Object.hasOwn(band, 'fixedVnd')) {
        if (Object.hasOwn(band, 'numerator') || Object.hasOwn(band, 'denominator')) throw unsupported();
        vnd(band.fixedVnd);
      } else { vnd(band.numerator); if (!vnd(band.denominator)) throw unsupported(); }
    }
    const ordered = [...policy[name]].sort((a, b) => a.fromMinutes - b.fromMinutes);
    if (ordered.some((band, index) => index && (ordered[index - 1].toMinutes === null || band.fromMinutes < ordered[index - 1].toMinutes))) {
      throw pricingError('POLICY_CONFLICT', 'Các khoảng phụ thu trong chính sách bị chồng lấn.', 409);
    }
  }
  if (policy.hourlyRateBasis !== undefined && policy.hourlyRateBasis !== 'ARRIVAL_DATE') throw unsupported();
  if (policy.earlyDeparture !== undefined) {
    object(policy.earlyDeparture, ['nightly', 'hourly']);
    if (policy.earlyDeparture.nightly !== undefined) {
      const rule = policy.earlyDeparture.nightly;
      object(rule, ['unusedNights', 'minimumChargeNights', 'earlyArrivalCharge', 'lateDepartureCharge']);
      if (!['KEEP', 'REMOVE'].includes(rule.unusedNights) || !Number.isSafeInteger(rule.minimumChargeNights) || rule.minimumChargeNights < 1 || rule.minimumChargeNights > 366
        || rule.earlyArrivalCharge !== 'KEEP' || !['KEEP', 'RECALCULATE'].includes(rule.lateDepartureCharge)) throw unsupported();
    }
    if (policy.earlyDeparture.hourly !== undefined) {
      object(policy.earlyDeparture.hourly, ['unusedTime']);
      if (!['KEEP', 'RECALCULATE'].includes(policy.earlyDeparture.hourly.unusedTime)) throw unsupported();
    }
  }
  return policy;
}
