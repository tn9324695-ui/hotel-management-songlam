import { randomUUID } from 'node:crypto';
import { amount, roundedRatio, vnd } from './money.js';
import { dayKinds, hashText, readPolicy } from './policy.js';
import { clockMilliseconds, instant, localTime, nightDates, pricingError, pricingId, quoteInput, requireStableOffset } from './validation.js';
import { isCalendarDate } from '../catalog/validation.js';

const invalid = () => pricingError('PRICING_CONTEXT_INVALID', 'Dữ liệu giá/chính sách SQL không đầy đủ hoặc không nhất quán.', 502);
function text(value, max) { if (typeof value !== 'string' || !value.length || value.length > max) throw invalid(); return value; }
function integer(value, min, max) { if (!Number.isSafeInteger(value) || value < min || value > max) throw invalid(); return value; }
function rateId(value, big = false) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw invalid();
  if (!['string', 'number', 'bigint'].includes(typeof value)) throw invalid();
  try { return pricingId(String(value), 'sqlId', big); } catch { throw invalid(); }
}
function sqlDate(value) { if (!isCalendarDate(value)) throw invalid(); return value; }

export function normalizePricingContext(raw) {
  if (!raw || raw.schema !== 'songlam.pricing.context.v1' || raw.ratesComplete !== true || raw.calendarComplete !== true) throw invalid();
  const h = raw.hotel, t = raw.roomType, p = raw.ratePlan, v = raw.policy;
  if (!h || !t || !p || !v || h.Currency !== 'VND' || t.IsActive !== true || p.IsActive !== true) throw invalid();
  const policyId = rateId(v.PolicyVersionId);
  if (rateId(p.PolicyVersionId) !== policyId || !['NIGHTLY', 'HOURLY'].includes(p.StayType)) throw invalid();
  instant(v.EffectiveFromUtc, 'policyEffectiveFromUtc');
  clockMilliseconds(h.CheckInTime); clockMilliseconds(h.CheckOutTime);
  readPolicy(v.RulesJson);
  const context = { schema: raw.schema, ratesComplete: true, calendarComplete: true,
    calendarSource: { id: text(raw.calendarSource?.id, 120), version: text(raw.calendarSource?.version, 80) },
    hotel: { HotelId: rateId(h.HotelId), Currency: 'VND', TimeZoneId: text(h.TimeZoneId, 60), TimeZoneIana: text(h.TimeZoneIana, 100), CheckInTime: h.CheckInTime, CheckOutTime: h.CheckOutTime },
    roomType: { RoomTypeId: rateId(t.RoomTypeId), MaxOccupancy: integer(t.MaxOccupancy, 1, 32767), IsActive: true },
    ratePlan: { RatePlanId: rateId(p.RatePlanId), Code: text(p.Code, 40), StayType: p.StayType, PolicyVersionId: policyId, IsActive: true },
    policy: { PolicyVersionId: policyId, Code: text(v.Code, 40), Version: integer(v.Version, 1, 2147483647), EffectiveFromUtc: v.EffectiveFromUtc, RulesJson: v.RulesJson }, rules: [], calendar: [] };
  if (context.hotel.HotelId !== '1' || !Array.isArray(raw.rules) || raw.rules.length > 5000 || !Array.isArray(raw.calendar) || raw.calendar.length > 367) throw invalid();
  const ids = new Set(), dates = new Set();
  for (const rule of raw.rules) {
    if (!rule || !dayKinds.includes(rule.DayKind)) throw invalid();
    const id = rateId(rule.RateRuleId, true), from = sqlDate(rule.ValidFrom), to = sqlDate(rule.ValidTo);
    if (ids.has(id) || to <= from || rateId(rule.RoomTypeId) !== context.roomType.RoomTypeId || rateId(rule.RatePlanId) !== context.ratePlan.RatePlanId) throw invalid();
    ids.add(id); vnd(rule.PriceVnd);
    const hourly = [rule.IncludedMinutes, rule.ExtraBlockMinutes, rule.ExtraBlockPriceVnd];
    if (hourly.some(value => value !== null)) { integer(hourly[0], 1, 2147483647); integer(hourly[1], 1, 2147483647); vnd(hourly[2]); }
    context.rules.push({ RateRuleId: id, RatePlanId: context.ratePlan.RatePlanId, RoomTypeId: context.roomType.RoomTypeId, ValidFrom: from, ValidTo: to,
      DayKind: rule.DayKind, Priority: integer(rule.Priority, -32768, 32767), PriceVnd: rule.PriceVnd,
      IncludedMinutes: rule.IncludedMinutes, ExtraBlockMinutes: rule.ExtraBlockMinutes, ExtraBlockPriceVnd: rule.ExtraBlockPriceVnd });
  }
  for (const entry of raw.calendar) {
    if (!entry || !isCalendarDate(entry.date) || dates.has(entry.date) || !Array.isArray(entry.kinds) || !entry.kinds.length
      || entry.kinds.some(kind => !dayKinds.includes(kind)) || new Set(entry.kinds).size !== entry.kinds.length) throw invalid();
    dates.add(entry.date); context.calendar.push({ date: entry.date, kinds: [...entry.kinds] });
  }
  const groups = new Map();
  for (const rule of context.rules) {
    const key = `${rule.DayKind}:${rule.Priority}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rule);
  }
  for (const rules of groups.values()) {
    rules.sort((a, b) => a.ValidFrom.localeCompare(b.ValidFrom));
    if (rules.some((rule, index) => index && rules[index - 1].ValidTo > rule.ValidFrom)) throw pricingError('RATE_CONFLICT', 'Quy tắc cùng loại ngày và ưu tiên có khoảng hiệu lực chồng lấn.', 409);
  }
  return context;
}

function selectRate(context, policy, date) {
  const day = context.calendar.find(entry => entry.date === date);
  if (!day) throw pricingError('PRICE_CALENDAR_MISSING', 'Thiếu phân loại ngày được duyệt cho một ngày báo giá.');
  const highestKind = policy.selection.dayKindOrder.find(kind => day.kinds.includes(kind));
  const matches = context.rules.filter(rule => rule.ValidFrom <= date && date < rule.ValidTo && day.kinds.includes(rule.DayKind)
    && (policy.selection.fallback !== 'REQUIRE_HIGHEST_DAY_KIND' || rule.DayKind === highestKind));
  if (!matches.length) throw pricingError('RATE_MISSING', 'Không có giá phù hợp cho một ngày trong khoảng ở.');
  function compare(a, b) {
    const priority = (a.Priority - b.Priority) * (policy.selection.priority === 'HIGHER_WINS' ? -1 : 1);
    const kind = policy.selection.dayKindOrder.indexOf(a.DayKind) - policy.selection.dayKindOrder.indexOf(b.DayKind);
    return policy.selection.order === 'DAY_KIND_THEN_PRIORITY' ? kind || priority : priority || kind;
  }
  matches.sort(compare);
  if (matches.length > 1 && compare(matches[0], matches[1]) === 0) throw pricingError('RATE_CONFLICT', 'Nhiều quy tắc giá có cùng mức ưu tiên, không thể chọn giá.', 409);
  return matches[0];
}
function fee(policy, name, delayMs, basis) {
  if (delayMs <= 0) return 0n;
  if (policy.boundaryClock !== 'HOTEL_WALL_CLOCK' || !Array.isArray(policy[name])) throw pricingError('BOUNDARY_POLICY_MISSING', 'Thiếu chính sách nhận sớm/trả muộn được duyệt.');
  const leftClosed = name === 'lateDeparture' && policy.lateDepartureInterval === 'LEFT_CLOSED_RIGHT_OPEN';
  const bands = policy[name].filter(band => (leftClosed ? delayMs >= band.fromMinutes * 60000 : delayMs > band.fromMinutes * 60000)
    && (band.toMinutes === null || (leftClosed ? delayMs < band.toMinutes * 60000 : delayMs <= band.toMinutes * 60000)));
  if (bands.length !== 1) throw pricingError(bands.length ? 'POLICY_CONFLICT' : 'BOUNDARY_POLICY_MISSING', 'Không xác định duy nhất mức phụ thu cho mốc thời gian này.', bands.length ? 409 : 422);
  const band = bands[0];
  return Object.hasOwn(band, 'fixedVnd') ? vnd(band.fixedVnd) : roundedRatio(basis, band.numerator, band.denominator, policy.moneyRounding);
}
function hourly(rule, durationMs) {
  if (rule.IncludedMinutes === null || rule.ExtraBlockMinutes === null || rule.ExtraBlockPriceVnd === null) throw pricingError('HOURLY_RATE_MISSING', 'Giá giờ thiếu thời lượng gói hoặc giá block phát sinh.');
  const excess = BigInt(durationMs) - BigInt(rule.IncludedMinutes) * 60000n, block = BigInt(rule.ExtraBlockMinutes) * 60000n;
  const blocks = excess > 0n ? (excess + block - 1n) / block : 0n;
  return { blocks: blocks.toString(), base: vnd(rule.PriceVnd), extra: blocks * vnd(rule.ExtraBlockPriceVnd) };
}
function baseCalculation(context, input, mode, quotedAt) {
  const policy = readPolicy(context.policy.RulesJson);
  if (input.roomTypeId !== context.roomType.RoomTypeId || input.ratePlanId !== context.ratePlan.RatePlanId || context.ratePlan.StayType !== mode) throw invalid();
  if (input.adultsPerRoom + input.childrenPerRoom > context.roomType.MaxOccupancy) throw pricingError('ROOM_CAPACITY_EXCEEDED', 'Số khách trên mỗi phòng vượt sức chứa hạng phòng.');
  const start = localTime(input.checkInAt, context.hotel.TimeZoneIana), end = localTime(input.checkOutAt, context.hotel.TimeZoneIana);
  requireStableOffset(start, end, context.hotel.TimeZoneIana);
  const effectiveAt = policy.effectiveBasis === 'QUOTE_TIME' ? instant(quotedAt, 'quotedAt').ms : start.ms;
  if (instant(context.policy.EffectiveFromUtc, 'policyEffectiveFromUtc').ms > effectiveAt) throw pricingError('POLICY_NOT_EFFECTIVE', 'Phiên bản chính sách chưa có hiệu lực theo căn cứ áp dụng.');
  let lines = [], early = 0n, late = 0n, hourlyRule = null;
  if (mode === 'NIGHTLY') {
    for (const date of nightDates(start.date, end.date)) {
      const rule = selectRate(context, policy, date);
      if (rule.IncludedMinutes !== null) throw pricingError('RATE_TYPE_CONFLICT', 'Quy tắc giá đêm chứa cấu hình block giờ.', 409);
      lines.push({ kind: 'NIGHT', date, dayKind: rule.DayKind, rateRuleId: rule.RateRuleId, amountPerRoomVnd: rule.PriceVnd });
    }
    early = fee(policy, 'earlyArrival', clockMilliseconds(context.hotel.CheckInTime) - start.wallMs, vnd(lines[0].amountPerRoomVnd));
    late = fee(policy, 'lateDeparture', end.wallMs - clockMilliseconds(context.hotel.CheckOutTime), vnd(lines.at(-1).amountPerRoomVnd));
  } else {
    if (policy.hourlyRateBasis !== 'ARRIVAL_DATE') throw pricingError('HOURLY_POLICY_MISSING', 'Chưa chốt ngày chọn giá cho gói thuê giờ.');
    if (policy.hourlyMaximumMinutes !== undefined && end.ms - start.ms > policy.hourlyMaximumMinutes * 60000) throw pricingError('HOURLY_LIMIT_REQUIRES_NIGHTLY', 'Khoảng ở vượt giới hạn gói giờ của chính sách. Cần chọn và xem báo giá theo đêm; không tự cộng thêm gói giờ hoặc phụ thu trả muộn.');
    hourlyRule = selectRate(context, policy, start.date);
    const calculation = hourly(hourlyRule, end.ms - start.ms);
    lines = [{ kind: 'HOURLY_PACKAGE', rateRuleId: hourlyRule.RateRuleId, dayKind: hourlyRule.DayKind, includedMinutes: hourlyRule.IncludedMinutes, amountPerRoomVnd: amount(calculation.base) },
      { kind: 'HOURLY_EXTRA_BLOCKS', rateRuleId: hourlyRule.RateRuleId, blockMinutes: hourlyRule.ExtraBlockMinutes, blocks: calculation.blocks,
        blockPriceVnd: hourlyRule.ExtraBlockPriceVnd, amountPerRoomVnd: amount(calculation.extra) }];
    // Hourly billing never invokes nightly early-arrival/late-departure fees.
  }
  const base = lines.reduce((sum, line) => sum + vnd(line.amountPerRoomVnd), 0n);
  return { policy, start, end, lines, base, early, late, hourlyRule };
}

export function calculateQuote(raw, rawInput, mode, quotedAt) {
  const input = quoteInput(rawInput, mode === 'NIGHTLY' ? 'nightly' : 'hourly');
  const context = normalizePricingContext(raw), calculation = baseCalculation(context, input, mode, quotedAt);
  const { lines, base, early, late, policy, hourlyRule } = calculation;
  const unitTotal = base + early + late, quantity = BigInt(input.rooms);
  const breakdown = [...lines];
  if (mode === 'NIGHTLY') breakdown.push({ kind: 'EARLY_ARRIVAL', amountPerRoomVnd: amount(early) }, { kind: 'LATE_DEPARTURE', amountPerRoomVnd: amount(late) });
  const quoteId = randomUUID();
  const snapshot = { schema: 'songlam.quote.snapshot.v1', engineVersion: 'songlam.pricing.v1', sourceQuoteId: quoteId, quotedAt,
    input: { ...input, rooms: 1 }, pricingContext: context, roomBaseVnd: amount(base), boundarySurchargesVnd: amount(early + late), accommodationTotalVnd: amount(unitTotal),
    policyVersionId: context.policy.PolicyVersionId, policyVersion: context.policy.Version, policyHash: hashText(context.policy.RulesJson),
    moneyRounding: policy.moneyRounding, breakdown: breakdown.map(line => ({ ...line })),
    ...(hourlyRule ? { includedMinutes: hourlyRule.IncludedMinutes, extraMinutes: hourlyRule.ExtraBlockMinutes, baseVnd: hourlyRule.PriceVnd, extraVnd: hourlyRule.ExtraBlockPriceVnd } : {}) };
  return { quoteId, kind: 'ESTIMATE', committed: false, stayType: mode, quotedAt, currency: 'VND', timeZone: context.hotel.TimeZoneIana,
    roomTypeId: input.roomTypeId, ratePlanId: input.ratePlanId, rooms: input.rooms, policy: { id: context.policy.PolicyVersionId, code: context.policy.Code, version: context.policy.Version, hash: snapshot.policyHash },
    breakdown: breakdown.map(line => ({ ...line, quantity: input.rooms, totalVnd: amount(vnd(line.amountPerRoomVnd) * quantity) })),
    perRoom: { roomBaseVnd: amount(base), boundarySurchargesVnd: amount(early + late), accommodationTotalVnd: amount(unitTotal) },
    totals: { roomBaseVnd: amount(base * quantity), boundarySurchargesVnd: amount((early + late) * quantity), accommodationTotalVnd: amount(unitTotal * quantity) },
    snapshotCandidate: snapshot, snapshotSha256: hashText(JSON.stringify(snapshot)), acceptanceHash: quoteAcceptanceHash(snapshot) };
}

// A quote ID/time identifies an estimate, not its commercial terms. Requoting
// identical terms must be comparable without trusting client-supplied amounts.
// Keep the complete input, rate/policy context and breakdown in the digest.
export function quoteAcceptanceHash(snapshot) {
  const { sourceQuoteId, quotedAt, ...terms } = snapshot;
  return hashText(JSON.stringify(terms));
}

export function calculateEarlyDeparture(payload, input, quotedAt) {
  const snapshot = payload?.committedSnapshot;
  if (payload?.schema !== 'songlam.pricing.early.v1' || payload.snapshotStatus !== 'COMMITTED' || payload.stayId !== input.stayId
    || snapshot?.schema !== 'songlam.quote.snapshot.v1' || snapshot.engineVersion !== 'songlam.pricing.v1' || snapshot.input?.rooms !== 1) throw invalid();
  if (payload.stayStatus !== 'IN_HOUSE') throw pricingError('STAY_NOT_IN_HOUSE', 'Chỉ ước tính trả sớm cho lượt ở đang lưu trú.', 409);
  const context = normalizePricingContext(snapshot.pricingContext), mode = context.ratePlan.StayType;
  const original = calculateQuote(context, snapshot.input, mode, snapshot.quotedAt);
  if (snapshot.roomBaseVnd !== original.perRoom.roomBaseVnd || snapshot.boundarySurchargesVnd !== original.perRoom.boundarySurchargesVnd
    || snapshot.accommodationTotalVnd !== original.perRoom.accommodationTotalVnd || snapshot.policyHash !== original.policy.hash) throw invalid();
  const newEnd = localTime(input.newCheckOutAt, context.hotel.TimeZoneIana), oldStart = localTime(snapshot.input.checkInAt, context.hotel.TimeZoneIana), oldEnd = localTime(snapshot.input.checkOutAt, context.hotel.TimeZoneIana);
  const checkedIn = instant(payload.checkedInAtUtc, 'checkedInAtUtc'), expectedOut = instant(payload.expectedOutAtUtc, 'expectedOutAtUtc');
  if (checkedIn.ms < oldStart.ms || expectedOut.ms !== oldEnd.ms || checkedIn.ms >= expectedOut.ms) throw invalid();
  if (newEnd.ms <= checkedIn.ms || newEnd.ms >= expectedOut.ms) throw pricingError('INVALID_EARLY_DEPARTURE', 'Giờ trả sớm phải sau giờ nhận thực tế và trước giờ trả đã chốt.', 400);
  if (newEnd.offset !== oldStart.offset) throw pricingError('TIMEZONE_TRANSITION_NOT_SUPPORTED', 'Chưa hỗ trợ trả sớm qua thay đổi offset múi giờ.', 501);
  const policy = readPolicy(context.policy.RulesJson);
  let lines, early = 0n, late = 0n;
  if (mode === 'NIGHTLY') {
    const rule = policy.earlyDeparture?.nightly;
    if (!rule) throw pricingError('EARLY_DEPARTURE_POLICY_MISSING', 'Thiếu chính sách trả sớm cho giá đêm.');
    const all = original.breakdown.filter(line => line.kind === 'NIGHT');
    const elapsedNights = newEnd.date === oldStart.date ? 0 : nightDates(oldStart.date, newEnd.date).length;
    if (rule.unusedNights === 'REMOVE' && rule.minimumChargeNights > all.length) throw pricingError('EARLY_DEPARTURE_POLICY_CONFLICT', 'Số đêm tối thiểu khi trả sớm vượt số đêm có giá đã chốt.', 409);
    const retained = rule.unusedNights === 'KEEP' ? all.length : Math.max(elapsedNights, rule.minimumChargeNights);
    lines = all.slice(0, retained).map((line, index) => ({ kind: 'NIGHT', date: line.date, rateRuleId: line.rateRuleId, dayKind: line.dayKind,
      minimumStayCharge: rule.unusedNights === 'REMOVE' && index >= elapsedNights, retainedByPolicy: index >= elapsedNights, amountPerRoomVnd: line.amountPerRoomVnd }));
    early = vnd(original.breakdown.find(line => line.kind === 'EARLY_ARRIVAL').amountPerRoomVnd);
    late = rule.lateDepartureCharge === 'KEEP' ? vnd(original.breakdown.find(line => line.kind === 'LATE_DEPARTURE').amountPerRoomVnd)
      : fee(policy, 'lateDeparture', newEnd.wallMs - clockMilliseconds(context.hotel.CheckOutTime), vnd(lines.at(-1).amountPerRoomVnd));
    lines.push({ kind: 'EARLY_ARRIVAL', amountPerRoomVnd: amount(early) }, { kind: 'LATE_DEPARTURE', amountPerRoomVnd: amount(late) });
  } else {
    const rule = policy.earlyDeparture?.hourly;
    if (!rule) throw pricingError('EARLY_DEPARTURE_POLICY_MISSING', 'Thiếu chính sách trả sớm cho giá giờ.');
    const rate = selectRate(context, policy, oldStart.date);
    const cost = hourly(rate, (rule.unusedTime === 'KEEP' ? oldEnd.ms : newEnd.ms) - oldStart.ms);
    lines = [{ kind: 'HOURLY_PACKAGE', rateRuleId: rate.RateRuleId, amountPerRoomVnd: amount(cost.base) },
      { kind: 'HOURLY_EXTRA_BLOCKS', rateRuleId: rate.RateRuleId, blocks: cost.blocks, blockMinutes: rate.ExtraBlockMinutes, amountPerRoomVnd: amount(cost.extra) }];
  }
  const revised = lines.reduce((sum, line) => sum + vnd(line.amountPerRoomVnd), 0n), before = vnd(snapshot.accommodationTotalVnd), change = revised - before;
  return { quoteId: randomUUID(), kind: 'EARLY_DEPARTURE_ESTIMATE', committed: false, quotedAt, stayId: input.stayId, stayType: mode,
    currency: 'VND', originalCheckOutAt: snapshot.input.checkOutAt, newCheckOutAt: input.newCheckOutAt, policy: original.policy,
    originalAccommodationTotalVnd: amount(before), revisedAccommodationTotalVnd: amount(revised), changeVnd: change.toString(),
    creditEstimateVnd: amount(change < 0n ? -change : 0n), additionalEstimateVnd: amount(change > 0n ? change : 0n), breakdown: lines,
    excludes: ['payments', 'deposits', 'services', 'minibar', 'refundExecution'], source: 'COMMITTED_PRICE_SNAPSHOT' };
}
