// Domain contracts with explicit synthetic policy/data. NO SQL connection or SQL approval.
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote, calculateEarlyDeparture } from '../src/modules/pricing/engine.js';
import { createBookingInput, cancellationInput } from '../src/modules/bookings/validation.js';
import { folioBalance, depositBalance, due, amount } from '../src/modules/finance/money.js';
import { lineAmount, totalAmount } from '../src/modules/services/amounts.js';
import { nightDates } from '../src/modules/pricing/validation.js';
import { intentHash } from '../src/modules/bookings/intent.js';
import { compileCheckIn } from '../src/modules/stays/commands.js';
import { consumptionLines } from '../src/modules/services/validation.js';
import { mintActor } from '../src/modules/auth/security.js';
import { requireOperationPermission } from '../src/modules/operations/service.js';

function pricing(type = 'NIGHTLY') {
  const policy = { schema: 'songlam.policy.v1', moneyRounding: 'HALF_UP', occupancy: 'INCLUDED_UP_TO_MAX', effectiveBasis: 'ARRIVAL_TIME',
    selection: { order: 'DAY_KIND_THEN_PRIORITY', priority: 'HIGHER_WINS', dayKindOrder: ['SPECIFIC', 'HOLIDAY', 'WEEKEND', 'BASE'], fallback: 'REQUIRE_HIGHEST_DAY_KIND' },
    boundaryClock: 'HOTEL_WALL_CLOCK', earlyArrival: [{ fromMinutes: 0, toMinutes: null, fixedVnd: '100000' }],
    lateDeparture: [{ fromMinutes: 0, toMinutes: null, fixedVnd: '200000' }], hourlyRateBasis: 'ARRIVAL_DATE',
    earlyDeparture: { nightly: { unusedNights: 'REMOVE', minimumChargeNights: 1, earlyArrivalCharge: 'KEEP', lateDepartureCharge: 'RECALCULATE' } } };
  return { schema: 'songlam.pricing.context.v1', ratesComplete: true, calendarComplete: true,
    calendarSource: { id: 'fixture-calendar', version: '1' },
    hotel: { HotelId: '1', Currency: 'VND', TimeZoneId: 'SE Asia Standard Time', TimeZoneIana: 'Asia/Ho_Chi_Minh', CheckInTime: '14:00:00', CheckOutTime: '12:00:00' },
    roomType: { RoomTypeId: '1', MaxOccupancy: 3, IsActive: true },
    ratePlan: { RatePlanId: '1', Code: 'FIXTURE', StayType: type, PolicyVersionId: '1', IsActive: true },
    policy: { PolicyVersionId: '1', Code: 'FIXTURE', Version: 1, EffectiveFromUtc: '2026-01-01T00:00:00Z', RulesJson: JSON.stringify(policy) },
    rules: ['BASE', 'WEEKEND', 'HOLIDAY'].map((kind, i) => ({ RateRuleId: String(i + 1), RatePlanId: '1', RoomTypeId: '1',
      ValidFrom: '2026-12-01', ValidTo: '2027-01-01', DayKind: kind, Priority: 1, PriceVnd: ['1000000', '1200000', '1500000'][i],
      IncludedMinutes: type === 'HOURLY' ? 120 : null, ExtraBlockMinutes: type === 'HOURLY' ? 60 : null, ExtraBlockPriceVnd: type === 'HOURLY' ? '100000' : null })),
    calendar: ['2026-12-09', '2026-12-10', '2026-12-11'].map((date, i) => ({ date, kinds: [i === 0 ? 'BASE' : i === 1 ? 'WEEKEND' : 'HOLIDAY'] })) };
}
const input = { roomTypeId: '1', ratePlanId: '1', checkInAt: '2026-12-09T14:00:00+07:00', checkOutAt: '2026-12-12T12:00:00+07:00', rooms: 2, adultsPerRoom: 2, childrenPerRoom: 0 };
const now = '2026-11-09T12:00:00Z';
test('fixture nightly quote covers every night, excludes departure and freezes exact VND policy snapshot', () => {
  const raw = pricing(), quote = calculateQuote(raw, input, 'NIGHTLY', now);
  assert.deepEqual(quote.breakdown.filter(l => l.kind === 'NIGHT').map(l => l.date), ['2026-12-09', '2026-12-10', '2026-12-11']);
  assert.equal(quote.totals.accommodationTotalVnd, '7400000'); assert.equal(quote.committed, false);
  raw.rules[0].PriceVnd = '9000000'; assert.equal(quote.snapshotCandidate.pricingContext.rules[0].PriceVnd, '1000000');
});
test('fixture missing intermediate calendar/rate, conflicting rules and missing boundary policy fail closed', () => {
  const noDay = pricing(); noDay.calendar.splice(1, 1);
  assert.throws(() => calculateQuote(noDay, input, 'NIGHTLY', now), { code: 'PRICE_CALENDAR_MISSING' });
  const noRate = pricing(); noRate.rules = noRate.rules.filter(r => r.DayKind !== 'WEEKEND');
  assert.throws(() => calculateQuote(noRate, input, 'NIGHTLY', now), { code: 'RATE_MISSING' });
  const duplicate = pricing(); duplicate.rules.push({ ...duplicate.rules[0], RateRuleId: '4' });
  assert.throws(() => calculateQuote(duplicate, input, 'NIGHTLY', now), { code: 'RATE_CONFLICT' });
  const missing = pricing(); const p = JSON.parse(missing.policy.RulesJson); delete p.lateDeparture; missing.policy.RulesJson = JSON.stringify(p);
  assert.throws(() => calculateQuote(missing, { ...input, checkOutAt: '2026-12-12T13:00:00+07:00' }, 'NIGHTLY', now), { code: 'BOUNDARY_POLICY_MISSING' });
});
test('fixture hourly charge uses blocks and never nightly late-checkout surcharge', () => {
  const quote = calculateQuote(pricing('HOURLY'), { ...input, rooms: 1, checkOutAt: '2026-12-09T17:01:00+07:00' }, 'HOURLY', now);
  assert.equal(quote.totals.accommodationTotalVnd, '1200000'); assert.equal(quote.perRoom.boundarySurchargesVnd, '0');
  assert.equal(quote.breakdown.some(l => l.kind === 'LATE_DEPARTURE'), false);
});
test('fixture early departure reuses committed snapshot, removes unused nights without creating refund/payment', () => {
  const quote = calculateQuote(pricing(), { ...input, rooms: 1 }, 'NIGHTLY', now);
  const result = calculateEarlyDeparture({ schema: 'songlam.pricing.early.v1', snapshotStatus: 'COMMITTED', stayId: '1', stayStatus: 'IN_HOUSE',
    committedSnapshot: quote.snapshotCandidate, checkedInAtUtc: input.checkInAt, expectedOutAtUtc: input.checkOutAt },
  { stayId: '1', newCheckOutAt: '2026-12-10T12:00:00+07:00' }, '2026-12-10T04:00:00Z');
  assert.equal(result.originalAccommodationTotalVnd, '3700000');
  assert.equal(result.revisedAccommodationTotalVnd, '1000000');
  assert.equal(result.creditEstimateVnd, '2700000');
  assert.equal(result.changeVnd, '-2700000');
  assert.equal(result.committed, false);
});
function booking(rooms) { return { kind: 'GROUP', customerId: '1', contact: { name: 'Fixture' }, sourceCode: 'TEST', groupName: 'Fixture', rooms }; }
const room = (lineKey, from = input.checkInAt, to = input.checkOutAt) => ({ lineKey, roomTypeId: '1', ratePlanId: '1', stayType: 'NIGHTLY', checkInAt: from, checkOutAt: to, adults: 2, children: 0, plannedRoomId: '1', acceptedQuoteHash: 'a'.repeat(64) });
test('group validation rejects overlapping physical assignments and accepts adjacent intervals only', () => {
  assert.throws(() => createBookingInput(booking([room('a'), room('b')])), { code: 'BOOKING_BATCH_CONFLICT' });
  const result = createBookingInput(booking([room('a', input.checkInAt, '2026-12-10T12:00:00+07:00'), room('b', '2026-12-10T12:00:00+07:00', input.checkOutAt)]));
  assert.equal(result.rooms.length, 2);
  assert.deepEqual(nightDates('2026-12-09', '2026-12-10'), ['2026-12-09']);
});
test('group batches cannot be silently split; cancellation requires reason; supplied price/actor is rejected', () => {
  assert.throws(() => createBookingInput(booking(Array.from({ length: 500 }, (_, i) => room(String(i))))), { code: 'BOOKING_BATCH_LIMIT_EXCEEDED' });
  assert.throws(() => createBookingInput({ ...booking([room('a')]), actorId: '1' }), { code: 'VALIDATION_ERROR' });
  assert.throws(() => createBookingInput(booking([{ ...room('a'), priceVnd: '1' }])), { code: 'VALIDATION_ERROR' });
  assert.throws(() => cancellationInput({ reason: '', expectedVersion: '0x0000000000000001' }, false), { code: 'VALIDATION_ERROR' });
});
test('financial arithmetic conserves deposit movements and room-to-master transfer (synthetic ledger, no SQL)', () => {
  const totals = { chargesVnd: '1400000', creditsVnd: '0', paymentsVnd: '0', refundsVnd: '0', depositAppliedVnd: '1400000', depositUnappliedVnd: '0', transferInVnd: '0', transferOutVnd: '0' };
  assert.equal(folioBalance(totals), '0');
  assert.equal(depositBalance({ receivedVnd: '2000000', unappliedVnd: '0', allocatedInVnd: '0', appliedVnd: '1400000', refundedVnd: '600000', allocatedOutVnd: '0' }), '0');
  const source = folioBalance({ ...totals, depositAppliedVnd: '0', transferOutVnd: '1400000' });
  const master = folioBalance({ ...totals, chargesVnd: '0', depositAppliedVnd: '0', transferInVnd: '1400000' });
  assert.equal(source, '0'); assert.equal(master, '1400000'); assert.equal(due('-600000').creditVnd, '600000');
});
test('service prices use exact decimal rounding, zero audit amount remains zero, unsafe money is rejected', () => {
  assert.equal(lineAmount('0.125', '10004'), '1251'); assert.equal(totalAmount([]), '0');
  assert.throws(() => lineAmount('1e3', '1')); assert.throws(() => amount(100)); assert.throws(() => amount('1.5'));
  assert.equal(intentHash({ amountVnd: '100', folioId: '1' }), intentHash({ folioId: '1', amountVnd: '100' }));
  assert.notEqual(intentHash({ amountVnd: '100' }), intentHash({ amountVnd: '101' }));
});
test('check-in compiler refuses dirty, cleaning, inspecting, occupied, inactive and maintenance rooms before compiling writes', () => {
  const version = '0x0000000000000001';
  for (const states of [
    ['VACANT', 'DIRTY', 'ACTIVE'], ['VACANT', 'CLEANING', 'ACTIVE'], ['VACANT', 'INSPECTING', 'ACTIVE'],
    ['OCCUPIED', 'CLEAN', 'ACTIVE'], ['VACANT', 'CLEAN', 'INACTIVE'], ['VACANT', 'CLEAN', 'MAINTENANCE']
  ]) {
    const prepared = { booking: { id: '1', version }, checkedInAtUtc: '2026-12-09T07:00:00Z', chargingMode: 'FROZEN_ROOM_AND_AGREED_EARLY_V1',
      units: [{ bookingRoom: { id: '2' }, room: { id: '1', roomTypeId: '1', version, occupancyStatus: states[0], cleanlinessStatus: states[1], exploitationStatus: states[2] } }] };
    assert.throws(() => compileCheckIn(prepared, { bookingId: '1', expectedVersion: version, rooms: [{ bookingRoomId: '2' }] }, {}, {}, 'key', Date.parse('2026-12-09T08:00:00Z')), { code: 'ROOM_NOT_READY' });
  }
});
test('zero-consumption audit is allowed, service order cannot be empty or inject its own price', () => {
  assert.deepEqual(consumptionLines([], 'audits', 125), []);
  assert.throws(() => consumptionLines([], 'orders', 125), { code: 'SERVICE_LINES_REQUIRED' });
  assert.throws(() => consumptionLines([{ serviceId: '1', expectedServiceVersion: '0x0000000000000001', quantity: '1', priceVnd: '1' }], 'orders', 125), { code: 'VALIDATION_ERROR' });
});
test('housekeeping inspection stays locked without approved inspection authority even when cleaning rights exist', () => {
  const actor = mintActor({ appUserId: '2', permissions: ['manageHousekeepingTasks', 'updateCleanStatus'] });
  assert.doesNotThrow(() => requireOperationPermission(actor, 'tasks', 'submit'));
  assert.throws(() => requireOperationPermission(actor, 'tasks', 'inspect-approve'), { code: 'INSPECTION_AUTHORIZATION_PENDING' });
});
