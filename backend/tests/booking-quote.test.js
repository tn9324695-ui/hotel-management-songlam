// Application/fixture verification only. No SQL connection or approval implied.
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote } from '../src/modules/pricing/engine.js';
import { createBookingsService } from '../src/modules/bookings/service.js';
import { createBookingInput } from '../src/modules/bookings/validation.js';
import { mintActor } from '../src/modules/auth/security.js';

const now = '2026-11-12T00:00:00Z', version = '0x0000000000000001';
const actor = mintActor({ appUserId: '2', permissions: ['createBooking', 'viewRoomRack'] });
const input = { roomTypeId: '1', ratePlanId: '1', checkInAt: '2026-12-12T14:00:00+07:00', checkOutAt: '2026-12-14T12:00:00+07:00', rooms: 1, adultsPerRoom: 2, childrenPerRoom: 0 };
function context(mode = 'NIGHTLY') {
  const policy = { schema: 'songlam.policy.v1', moneyRounding: 'HALF_UP', occupancy: 'INCLUDED_UP_TO_MAX', effectiveBasis: 'ARRIVAL_TIME',
    selection: { order: 'DAY_KIND_THEN_PRIORITY', priority: 'HIGHER_WINS', dayKindOrder: ['SPECIFIC', 'HOLIDAY', 'WEEKEND', 'BASE'], fallback: 'ALLOW_ELIGIBLE_RULES' },
    boundaryClock: 'HOTEL_WALL_CLOCK', earlyArrival: [], lateDeparture: [
      { fromMinutes: 0, toMinutes: 180, numerator: '30', denominator: '100' },
      { fromMinutes: 180, toMinutes: 360, numerator: '50', denominator: '100' },
      { fromMinutes: 360, toMinutes: null, numerator: '100', denominator: '100' }],
    lateDepartureInterval: 'LEFT_CLOSED_RIGHT_OPEN', hourlyRateBasis: 'ARRIVAL_DATE', hourlyMaximumMinutes: 360 };
  return { schema: 'songlam.pricing.context.v1', ratesComplete: true, calendarComplete: true, calendarSource: { id: 'FIXTURE', version: '1' },
    hotel: { HotelId: '1', Currency: 'VND', TimeZoneId: 'SE Asia Standard Time', TimeZoneIana: 'Asia/Ho_Chi_Minh', CheckInTime: '14:00:00', CheckOutTime: '12:00:00' },
    roomType: { RoomTypeId: '1', MaxOccupancy: 2, IsActive: true },
    ratePlan: { RatePlanId: '1', Code: 'FIXTURE', StayType: mode, PolicyVersionId: '1', IsActive: true },
    policy: { PolicyVersionId: '1', Code: 'FIXTURE', Version: 1, EffectiveFromUtc: '2026-11-01T00:00:00Z', RulesJson: JSON.stringify(policy) },
    rules: [{ RateRuleId: '1', RatePlanId: '1', RoomTypeId: '1', ValidFrom: '2026-11-01', ValidTo: '2028-01-01', DayKind: 'BASE', Priority: 0, PriceVnd: '1000000',
      IncludedMinutes: mode === 'HOURLY' ? 360 : null, ExtraBlockMinutes: mode === 'HOURLY' ? 60 : null, ExtraBlockPriceVnd: mode === 'HOURLY' ? '0' : null }],
    calendar: ['2026-12-12', '2026-12-13'].map(date => ({ date, kinds: ['BASE'] })) };
}
function body(quote, count = 1) {
  return { kind: count === 1 ? 'INDIVIDUAL' : 'GROUP', customerId: '1', contact: { name: 'Synthetic guest' }, sourceCode: 'TEST', groupName: count > 1 ? 'Synthetic group' : null,
    rooms: Array.from({ length: count }, (_, i) => ({ lineKey: 'room-' + i, roomTypeId: '1', ratePlanId: '1', stayType: 'NIGHTLY', checkInAt: input.checkInAt, checkOutAt: input.checkOutAt,
      adults: 2, children: 0, acceptedQuoteHash: quote.acceptanceHash })) };
}
function harness({ currentQuote = calculateQuote(context(), input, 'NIGHTLY', now), replay, limits = {} } = {}) {
  const calls = { commits: [], prices: 0 };
  const gateway = { limits: { maxRooms: 100, maxGuestLinks: 100, maxChanges: 500, maxChangeBytes: 4000000, ...limits }, assertWrite() {},
    async prepare(_actor, operation, data, digest) {
      if (replay) return { replayed: true, result: replay };
      return { creation: { status: 'CONFIRMED', rooms: data.rooms.map(room => ({ lineKey: room.lineKey, status: 'CONFIRMED', holdExpiresAtUtc: null, requiresVerifiedDeposit: false })) }, accountingChanges: [] };
    },
    async commit(_actor, operation, data, digest, key, prepared, batch, proofs) {
      calls.commits.push({ batch, proofs, digest, key });
      calls.lastReceipt = { actorId: actor.appUserId, operation, intentHash: digest, status: 'SUCCEEDED', committed: true, atomic: true, inventoryCheckedUnderLock: true, replayed: false, operationId: 'fixture-operation',
        booking: { id: '1', code: 'FIXTURE', kind: data.kind, status: 'CONFIRMED', version, customerId: '1', groupName: data.groupName, contactName: data.contact.name, contactPhone: null, roomCount: data.rooms.length, createdAtUtc: now },
        rooms: data.rooms.map((room, i) => ({ id: String(i + 1), lineKey: room.lineKey, status: 'CONFIRMED', version })),
        depositSummary: { ...Object.fromEntries(['collectedVnd', 'refundedVnd', 'appliedVnd', 'retainedVnd', 'pendingRefundVnd', 'remainingVnd', 'receivedAllocationBeforeVnd', 'receivedAllocationAfterVnd'].map(key => [key, '0'])), refundExecution: 'NOT_EXECUTED' } };
      return calls.lastReceipt;
    } };
  const service = createBookingsService({ gateway, pricingService: { async quote() { calls.prices++; return currentQuote; } }, now: () => new Date(now) });
  return { service, gateway, calls };
}
test('acceptance digest ignores quote ID/time but changes with price, policy and guest/time input', () => {
  const first = calculateQuote(context(), input, 'NIGHTLY', now), again = calculateQuote(context(), input, 'NIGHTLY', '2026-11-12T00:01:00Z');
  assert.notEqual(first.quoteId, again.quoteId); assert.notEqual(first.snapshotSha256, again.snapshotSha256); assert.equal(first.acceptanceHash, again.acceptanceHash);
  const changed = context(); changed.rules[0].PriceVnd = '1000001';
  assert.notEqual(first.acceptanceHash, calculateQuote(changed, input, 'NIGHTLY', now).acceptanceHash);
  const policyChanged = context(); policyChanged.policy.Version = 2;
  assert.notEqual(first.acceptanceHash, calculateQuote(policyChanged, input, 'NIGHTLY', now).acceptanceHash);
  assert.notEqual(first.acceptanceHash, calculateQuote(context(), { ...input, adultsPerRoom: 1 }, 'NIGHTLY', now).acceptanceHash);
});
test('missing/faked quote acceptance or browser-supplied amount is rejected', () => {
  const request = body(calculateQuote(context(), input, 'NIGHTLY', now));
  delete request.rooms[0].acceptedQuoteHash;
  assert.throws(() => createBookingInput(request), { code: 'VALIDATION_ERROR' });
  request.rooms[0].acceptedQuoteHash = '123'; assert.throws(() => createBookingInput(request), { code: 'VALIDATION_ERROR' });
  request.rooms[0].acceptedQuoteHash = 'a'.repeat(64); request.rooms[0].priceVnd = '1'; assert.throws(() => createBookingInput(request), { code: 'VALIDATION_ERROR' });
});
test('changed quote refuses entire group before commit; never substitutes current price silently', async () => {
  const request = body(calculateQuote(context(), input, 'NIGHTLY', now), 2), raw = context(); raw.rules[0].PriceVnd = '2000000';
  const { service, calls } = harness({ currentQuote: calculateQuote(raw, input, 'NIGHTLY', now) });
  await assert.rejects(service.create(actor, request, 'same-key', 'request'), { code: 'BOOKING_QUOTE_CHANGED' }); assert.equal(calls.commits.length, 0);
});
test('group compiles all rooms and exact nightly snapshots into one commit (fixture, not SQL atomicity evidence)', async () => {
  const quote = calculateQuote(context(), input, 'NIGHTLY', now), { service, calls } = harness({ currentQuote: quote });
  const result = await service.create(actor, body(quote, 2), 'group-key', 'request');
  assert.equal(result.committed, true); assert.equal(calls.commits.length, 1);
  const { batch, proofs } = calls.commits[0]; assert.equal(batch.rowCount, 7); assert.equal(proofs.length, 2);
  const rooms = batch.changes.filter(change => change.entity === 'BookingRoom');
  assert.equal(rooms.length, 2); assert.equal(rooms[0].data.RateSnapshotJson.accommodationTotalVnd, '2000000');
  assert.deepEqual(batch.changes.filter(change => change.entity === 'BookingNightRate').map(change => change.data.NightDate), ['2026-12-12', '2026-12-13', '2026-12-12', '2026-12-13']);
});
test('batch exceeding approved SQL mutation count is refused without partial commits', async () => {
  const quote = calculateQuote(context(), input, 'NIGHTLY', now), { service, calls } = harness({ currentQuote: quote, limits: { maxChanges: 6 } });
  await assert.rejects(service.create(actor, body(quote, 2), 'group-key', 'request'), { code: 'BOOKING_BATCH_LIMIT_EXCEEDED' }); assert.equal(calls.commits.length, 0);
});
test('a pricing failure for the second group room cannot commit the first one', async () => {
  const quote = calculateQuote(context(), input, 'NIGHTLY', now), { gateway, calls } = harness(); let count = 0;
  const service = createBookingsService({ gateway, pricingService: { async quote() { if (++count === 2) throw Object.assign(new Error('No rate'), { code: 'RATE_MISSING' }); return quote; } } });
  await assert.rejects(service.create(actor, body(quote, 2), 'group-key', 'request'), { code: 'RATE_MISSING' }); assert.equal(calls.commits.length, 0);
});
test('replayed receipt returns original booking without reading current price or committing again', async () => {
  const quote = calculateQuote(context(), input, 'NIGHTLY', now), first = harness();
  const initial = await first.service.create(actor, body(quote), 'same-key', 'request');
  const replay = harness({ replay: { ...first.calls.lastReceipt, replayed: true } });
  const result = await replay.service.create(actor, body(quote), 'same-key', 'request-2');
  assert.equal(result.booking.id, initial.booking.id); assert.equal(result.replayed, true); assert.equal(replay.calls.prices, 0); assert.equal(replay.calls.commits.length, 0);
});
test('replay receipt for a changed accepted quote cannot masquerade as this request', async () => {
  const quote = calculateQuote(context(), input, 'NIGHTLY', now), first = harness();
  await first.service.create(actor, body(quote), 'same-key', 'request');
  const request = body(quote); request.rooms[0].acceptedQuoteHash = 'a'.repeat(64);
  const replay = harness({ replay: { ...first.calls.lastReceipt, replayed: true } });
  await assert.rejects(replay.service.create(actor, request, 'same-key', 'request'), { code: 'BOOKING_SQL_RESPONSE_INVALID' }); assert.equal(replay.calls.commits.length, 0);
});
test('pending/unverified deposit cannot confirm a booking', async () => {
  const quote = calculateQuote(context(), input, 'NIGHTLY', now), { gateway, calls } = harness();
  const original = gateway.prepare; gateway.prepare = async (...args) => { const result = await original(...args); result.creation.rooms[0].requiresVerifiedDeposit = true; return result; };
  const service = createBookingsService({ gateway, pricingService: { async quote() { return quote; } } });
  await assert.rejects(service.create(actor, body(quote), 'key', 'request'), { code: 'VERIFIED_DEPOSIT_REQUIRED' }); assert.equal(calls.commits.length, 0);
});
test('late fee new explicit intervals select 30/50/100 percent at 15:00 and 18:00 correctly', () => {
  for (const [time, expected] of [['12:00:00', '0'], ['14:59:59', '300000'], ['15:00:00', '500000'], ['17:59:59', '500000'], ['18:00:00', '1000000']]) {
    const quote = calculateQuote(context(), { ...input, checkOutAt: '2026-12-14T' + time + '+07:00' }, 'NIGHTLY', now);
    assert.equal(quote.perRoom.boundarySurchargesVnd, expected, time);
  }
});
test('old snapshot band semantics remain unchanged; six-hour profile refuses additional blocks', () => {
  const raw = context(), policy = JSON.parse(raw.policy.RulesJson); delete policy.lateDepartureInterval; raw.policy.RulesJson = JSON.stringify(policy);
  assert.equal(calculateQuote(raw, { ...input, checkOutAt: '2026-12-14T15:00:00+07:00' }, 'NIGHTLY', now).perRoom.boundarySurchargesVnd, '300000');
  const hourly = calculateQuote(context('HOURLY'), { ...input, checkOutAt: '2026-12-12T20:00:00+07:00' }, 'HOURLY', now);
  assert.equal(hourly.totals.accommodationTotalVnd, '1000000'); assert.equal(hourly.perRoom.boundarySurchargesVnd, '0');
  assert.throws(() => calculateQuote(context('HOURLY'), { ...input, checkOutAt: '2026-12-12T20:00:01+07:00' }, 'HOURLY', now), { code: 'HOURLY_LIMIT_REQUIRES_NIGHTLY' });
});
test('unauthenticated/forged actor is rejected before the fixture gateway can commit', async () => {
  const quote = calculateQuote(context(), input, 'NIGHTLY', now), { service, calls } = harness();
  await assert.rejects(service.create({ appUserId: '2', permissions: ['createBooking'] }, body(quote), 'key', 'request'), { status: 401 }); assert.equal(calls.commits.length, 0);
});
