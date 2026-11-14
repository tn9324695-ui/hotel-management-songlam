import { createHash } from 'node:crypto';
import { canonicalIntent } from '../bookings/intent.js';
import { sqlId, sqlUtc, sqlVersion, money } from '../bookings/dto.js';
import { localTime, nightDates, pricingError } from './validation.js';

export const priceSnapshotHash = snapshot => createHash('sha256').update(canonicalIntent(snapshot), 'utf8').digest('hex');
// Consent binds all financial effects and frozen policy provenance, but not the
// clock of a fresh read. It is not an authorization or an executable SQL token.
export function stayChangeAcceptanceHash(proposal) {
  const { quotedAt: _quotedAt, afterSnapshotHash: _snapshotHash, snapshotCandidate, ...terms } = proposal;
  const { quotedAt: _snapshotAt, ...snapshotTerms } = snapshotCandidate;
  return priceSnapshotHash({ ...terms, snapshotCandidate: snapshotTerms });
}
const invalid = () => pricingError('STAY_PRICE_PROPOSAL_INVALID', 'Đề xuất điều chỉnh giá G4/SQL không nhất quán.', 502);
function rates(rows, stayType, arrival, departure) {
  if (!Array.isArray(rows)) throw invalid();
  const dates = stayType === 'NIGHTLY' ? nightDates(arrival, departure) : [];
  if (rows.length !== dates.length) throw invalid();
  return rows.map((row, index) => {
    if (!row || row.date !== dates[index]) throw invalid();
    return { date: row.date, priceVnd: money(row.priceVnd), rateRuleId: sqlId(row.rateRuleId) };
  });
}
export function stayPriceTotals(value) {
  if (!value) throw invalid();
  const result = {};
  for (const key of ['roomBaseVnd', 'earlyArrivalVnd', 'lateDepartureEstimateVnd', 'earlyDeparturePenaltyVnd', 'accommodationEstimateVnd']) result[key] = money(value[key]);
  if (BigInt(result.accommodationEstimateVnd) !== ['roomBaseVnd', 'earlyArrivalVnd', 'lateDepartureEstimateVnd', 'earlyDeparturePenaltyVnd'].reduce((sum, key) => sum + BigInt(result[key]), 0n)) throw invalid();
  return result;
}

// Integrity/projection of a future APPROVED G4 SQL pricing contract. This does
// not choose rates, percentages, holidays or rounding in modules/stays.
export function validateStayPriceChange(raw, input, quotedAt) {
  if (!raw || raw.schema !== 'songlam.stay-price-change.v1' || raw.stayId !== input.stayId || raw.direction !== input.direction
    || sqlVersion(raw.stayVersion) !== input.expectedVersion || sqlVersion(raw.bookingRoomVersion) !== input.bookingRoomVersion
    || raw.beforeSnapshotHash !== input.sourceSnapshotHash || !['NIGHTLY', 'HOURLY'].includes(raw.stayType)
    || raw.noCashWrites !== true || raw.lateChargesDeferredToCheckout !== true) throw invalid();
  const start = sqlUtc(raw.startsAtUtc), oldEnd = sqlUtc(raw.oldExpectedOutAtUtc), newEnd = sqlUtc(raw.newExpectedOutAtUtc);
  if (Date.parse(newEnd) !== Date.parse(input.newExpectedOutAt) || Date.parse(start) >= Date.parse(newEnd)
    || input.direction === 'extend' && Date.parse(newEnd) <= Date.parse(oldEnd) || input.direction === 'shorten' && Date.parse(newEnd) >= Date.parse(oldEnd)) throw invalid();
  const zone = raw.timeZoneIana;
  const arrival = localTime(start, zone).date, oldDeparture = localTime(oldEnd, zone).date, departure = localTime(newEnd, zone).date;
  const beforeRates = rates(raw.beforeNightlyRates, raw.stayType, arrival, oldDeparture), afterRates = rates(raw.afterNightlyRates, raw.stayType, arrival, departure);
  const before = stayPriceTotals(raw.before), after = stayPriceTotals(raw.after);
  if (raw.stayType === 'NIGHTLY') {
    if (beforeRates.reduce((sum, line) => sum + BigInt(line.priceVnd), 0n) !== BigInt(before.roomBaseVnd) || afterRates.reduce((sum, line) => sum + BigInt(line.priceVnd), 0n) !== BigInt(after.roomBaseVnd)) throw invalid();
    const old = new Map(beforeRates.map(line => [line.date, line]));
    if (afterRates.some(line => old.has(line.date) && (old.get(line.date).priceVnd !== line.priceVnd || old.get(line.date).rateRuleId !== line.rateRuleId))) throw pricingError('LOCKED_NIGHT_PRICE_CHANGED', 'Không được thay giá/nguồn quy tắc các đêm đã chốt còn giữ lại.', 409);
  } else if (before.earlyArrivalVnd !== '0' || before.lateDepartureEstimateVnd !== '0' || after.earlyArrivalVnd !== '0' || after.lateDepartureEstimateVnd !== '0') throw invalid();
  if (before.earlyArrivalVnd !== after.earlyArrivalVnd) throw pricingError('LOCKED_EARLY_CHARGE_CHANGED', 'Không tự tính lại phụ thu nhận phòng đã chốt.', 409);
  if (!Array.isArray(raw.ledgerChanges) || raw.ledgerChanges.length > 500) throw invalid();
  const changes = raw.ledgerChanges.map(row => {
    const categories = { ROOM_PRICE_CHANGE: 'ROOM', AGREED_EARLY_CHARGE: 'SURCHARGE', EARLY_DEPARTURE_PENALTY: 'CANCELLATION' };
    if (!row || !Object.hasOwn(categories, row.purpose) || row.category !== categories[row.purpose] || !['CHARGE', 'CHARGE_CREDIT'].includes(row.kind)
      || BigInt(money(row.amountVnd)) <= 0n || typeof row.description !== 'string' || !row.description.trim() || row.description.length > 500
      || raw.stayType === 'HOURLY' && row.purpose === 'AGREED_EARLY_CHARGE') throw invalid();
    if (row.kind === 'CHARGE_CREDIT') sqlId(row.reversesEntryId); else if (row.reversesEntryId !== null) throw invalid();
    return { kind: row.kind, category: row.category, purpose: row.purpose, amountVnd: row.amountVnd, description: row.description, reversesEntryId: row.reversesEntryId };
  });
  const roomDelta = changes.filter(row => row.category === 'ROOM').reduce((sum, row) => sum + BigInt(row.amountVnd) * (row.kind === 'CHARGE' ? 1n : -1n), 0n);
  if (roomDelta !== BigInt(after.roomBaseVnd) - BigInt(before.roomBaseVnd)) throw invalid();
  for (const [category, expected] of [['SURCHARGE', 0n], ['CANCELLATION', BigInt(after.earlyDeparturePenaltyVnd) - BigInt(before.earlyDeparturePenaltyVnd)]]) {
    const delta = changes.filter(row => row.category === category).reduce((sum, row) => sum + BigInt(row.amountVnd) * (row.kind === 'CHARGE' ? 1n : -1n), 0n);
    if (delta !== expected) throw invalid();
  }
  let hourlyTerms = null;
  if (raw.stayType === 'HOURLY') {
    const terms = raw.hourlyTerms;
    if (!terms || !Number.isInteger(terms.includedMinutes) || terms.includedMinutes <= 0 || terms.includedMinutes > 2147483647
      || !Number.isInteger(terms.extraMinutes) || terms.extraMinutes <= 0 || terms.extraMinutes > 2147483647) throw invalid();
    hourlyTerms = { includedMinutes: terms.includedMinutes, extraMinutes: terms.extraMinutes, baseVnd: money(terms.baseVnd), extraVnd: money(terms.extraVnd) };
    const beforeTerms = raw.beforeHourlyTerms;
    if (!beforeTerms || Object.keys(hourlyTerms).some(key => beforeTerms[key] !== hourlyTerms[key]) || sqlId(terms.rateRuleId) !== sqlId(beforeTerms.rateRuleId)) throw pricingError('LOCKED_HOURLY_TERMS_CHANGED', 'Thay gói/giá block đã chốt cần hợp đồng chuyển giá riêng.', 409);
    hourlyTerms.rateRuleId = terms.rateRuleId;
    const duration = BigInt(Date.parse(newEnd) - Date.parse(start)), extra = duration - BigInt(terms.includedMinutes) * 60000n, block = BigInt(terms.extraMinutes) * 60000n;
    if (BigInt(after.roomBaseVnd) !== BigInt(terms.baseVnd) + (extra > 0n ? (extra + block - 1n) / block : 0n) * BigInt(terms.extraVnd)) throw invalid();
  }
  const policyVersionId = sqlId(raw.policyVersionId), ratePlanId = sqlId(raw.ratePlanId), roomTypeId = sqlId(raw.roomTypeId);
  if (!Array.isArray(raw.policyProofs) || !raw.policyProofs.length || !Array.isArray(raw.calendarProofs) || !raw.calendarProofs.length) throw invalid();
  const appliedPolicies = raw.policyProofs.map(row => {
    if (!row || !Number.isInteger(row.version) || row.version < 1 || typeof row.hash !== 'string' || !/^[a-f0-9]{64}$/.test(row.hash)) throw invalid();
    return { id: sqlId(row.id), version: row.version, hash: row.hash };
  });
  if (!appliedPolicies.some(row => row.id === policyVersionId)) throw invalid();
  const calendars = raw.calendarProofs.map(row => {
    if (!row || typeof row.id !== 'string' || !row.id.length || row.id.length > 120 || typeof row.version !== 'string' || !row.version.length || row.version.length > 80) throw invalid();
    return { id: row.id, version: row.version };
  });
  // New encoding, not a second source of rates: it freezes the approved SQL/G4
  // calculation and links the prior snapshot preserved by SQL audit history.
  const snapshot = { schema: 'songlam.stay.pricing.v1', sourceSnapshotHash: input.sourceSnapshotHash, direction: input.direction, reason: input.reason, quotedAt,
    stayType: raw.stayType, roomTypeId, ratePlanId, policyVersionId, startsAtUtc: start, endsAtUtc: newEnd, timeZoneIana: zone,
    arrivalDate: arrival, departureDate: departure, nightlyRates: afterRates, appliedPolicies, calendars, ...after, ...(hourlyTerms || {}) };
  return { kind: 'STAY_PRICE_CHANGE_ESTIMATE', committed: false, stayId: input.stayId, direction: input.direction, quotedAt,
    oldExpectedOutAtUtc: oldEnd, newExpectedOutAtUtc: newEnd, startsAtUtc: start, stayType: raw.stayType, roomTypeId, ratePlanId, policyVersionId,
    arrivalDate: arrival, departureDate: departure, before, after, beforeNightlyRates: beforeRates, nightlyRates: afterRates,
    ledgerChanges: changes, snapshotCandidate: snapshot, beforeSnapshotHash: input.sourceSnapshotHash, afterSnapshotHash: priceSnapshotHash(snapshot),
    differenceVnd: (BigInt(after.accommodationEstimateVnd) - BigInt(before.accommodationEstimateVnd)).toString(), refundExecution: 'NOT_PERFORMED' };
}
