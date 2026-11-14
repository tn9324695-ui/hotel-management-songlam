// Synthetic contexts only. These tests never open a SQL pool or imply approval.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createStaysService } from '../src/modules/stays/service.js';
import { stayMutationInput } from '../src/modules/stays/validation.js';
import { priceSnapshotHash, stayChangeAcceptanceHash } from '../src/modules/pricing/stay-change.js';
import { mintActor } from '../src/modules/auth/security.js';
import { requireStayPermission } from '../src/adapters/sql/stays-gateway.js';
import { nonBusinessWrite } from '../src/modules/cutover/operations.js';
import { validateCheckoutMinibarCoverage } from '../src/modules/finance/receipt.js';
const version = '0x0000000000000001', now = '2026-11-13T00:00:00.000Z';
const actor = mintActor({ appUserId: '4', permissions: ['manageCheckIn'] });
const base = { expectedVersion: version, bookingRoomVersion: version, currentSegmentId: '201', currentAllocationId: '301',
  currentAllocationVersion: version, reason: 'SYNTHETIC extension', newExpectedOutAt: '2026-11-15T12:00:00+07:00' };
function fixture() {
  const snapshot = { schema: 'SYNTHETIC_FOR_CONSENT_TEST_ONLY' };
  const before = { roomBaseVnd: '2000', earlyArrivalVnd: '0', lateDepartureEstimateVnd: '0', earlyDeparturePenaltyVnd: '0', accommodationEstimateVnd: '2000' };
  const after = { ...before, roomBaseVnd: '3000', accommodationEstimateVnd: '3000' };
  const starts = '2026-11-12T07:00:00.000Z', ends = '2026-11-14T05:00:00.000Z';
  const rates = [{ date: '2026-11-12', priceVnd: '1000', rateRuleId: '1' }, { date: '2026-11-13', priceVnd: '1000', rateRuleId: '1' }];
  const prepared = { replayed: false, effectiveAtUtc: now,
    stay: { id: '5', bookingId: '100', bookingRoomId: '101', status: 'IN_HOUSE', checkedOutAtUtc: null, version,
      checkedInAtUtc: starts, expectedOutAtUtc: ends, pricingSnapshot: snapshot },
    bookingRoom: { id: '101', status: 'IN_HOUSE', version, roomTypeId: '1', ratePlanId: '1', policyVersionId: '1', stayType: 'NIGHTLY',
      adults: 1, children: 0, quotedRoomBaseVnd: '2000', startsAtUtc: starts, endsAtUtc: ends, pricingSnapshot: snapshot },
    currentSegment: { id: '201', stayId: '5', allocationId: '301', roomId: '1', arrivedAtUtc: starts, departedAtUtc: null },
    currentAllocation: { id: '301', roomId: '1', bookingRoomId: '101', isCancelled: false, version, startsAtUtc: starts, endsAtUtc: ends },
    bookingNightRates: rates, folio: { id: '401', status: 'OPEN', bookingId: '100', bookingRoomId: '101', version } };
  const proposal = { kind: 'STAY_PRICE_CHANGE_ESTIMATE', committed: false, stayId: '5', direction: 'extend', quotedAt: now,
    stayType: 'NIGHTLY', roomTypeId: '1', ratePlanId: '1', policyVersionId: '1', startsAtUtc: starts, oldExpectedOutAtUtc: ends,
    newExpectedOutAtUtc: '2026-11-15T05:00:00.000Z', arrivalDate: '2026-11-12', departureDate: '2026-11-15', before, after,
    beforeNightlyRates: rates, nightlyRates: [...rates, { date: '2026-11-14', priceVnd: '1000', rateRuleId: '1' }],
    beforeSnapshotHash: priceSnapshotHash(snapshot), afterSnapshotHash: 'a'.repeat(64),
    snapshotCandidate: { schema: 'SYNTHETIC_PROPOSAL_ONLY', quotedAt: now, appliedPolicies: [{ id: '1', hash: 'b'.repeat(64) }], ...after },
    differenceVnd: '1000', ledgerChanges: [{ kind: 'CHARGE', category: 'ROOM', amountVnd: '1000', description: 'SYNTHETIC extra room night', reversesEntryId: null }], refundExecution: 'NOT_PERFORMED' };
  const calls = { prepares: 0, commits: 0 };
  const gateway = { limits: { maxChanges: 500, maxChangeBytes: 4000000, maxUnits: 125 },
    assertWrite: (identity, operation, input) => requireStayPermission(identity, operation, input),
    async prepare() { calls.prepares++; return structuredClone(prepared); },
    async commit() { calls.commits++; throw new Error('STOP_AT_SYNTHETIC_COMMIT_BOUNDARY'); } };
  const service = createStaysService({ gateway, pricingService: { async quoteStayChange() { return structuredClone(proposal); } }, now: () => new Date(now) });
  return { proposal, prepared, calls, service };
}
test('G6 consent hash ignores quote clocks but binds amounts, rules and reason', () => {
  const { proposal } = fixture(), hash = stayChangeAcceptanceHash(proposal), later = structuredClone(proposal);
  later.quotedAt = '2026-11-13T00:01:00Z'; later.snapshotCandidate.quotedAt = later.quotedAt; later.afterSnapshotHash = 'c'.repeat(64);
  assert.equal(stayChangeAcceptanceHash(later), hash);
  for (const mutate of [p => p.after.roomBaseVnd = '3001', p => p.snapshotCandidate.appliedPolicies[0].hash = 'd'.repeat(64), p => p.snapshotCandidate.reason = 'changed']) {
    const changed = structuredClone(later); mutate(changed); assert.notEqual(stayChangeAcceptanceHash(changed), hash);
  }
});
test('G6 missing consent and unsupported operation are rejected before preparation', async () => {
  const { service, calls } = fixture();
  await assert.rejects(service.mutate(actor, 'extend', '5', base, 'synthetic-key', 'request'), e => e.code === 'VALIDATION_ERROR');
  assert.throws(() => stayMutationInput('5', 'invent-operation', base), e => e.code === 'VALIDATION_ERROR');
  assert.equal(calls.prepares, 0); assert.equal(calls.commits, 0);
});
test('G6 price preview has no commit and requires the existing stay permission', async () => {
  const { service, proposal, calls } = fixture();
  const result = await service.previewPriceChange(actor, 'extend', '5', base, 'request');
  assert.equal(result.committed, false); assert.equal(result.acceptanceHash, stayChangeAcceptanceHash(proposal));
  assert.equal(calls.prepares, 1); assert.equal(calls.commits, 0);
  await assert.rejects(service.previewPriceChange(mintActor({ appUserId: '6', permissions: [] }), 'extend', '5', base, 'request'), e => e.code === 'FORBIDDEN');
});
test('G6 changed price after preview prevents the entire write', async () => {
  const { service, proposal, calls } = fixture(), hash = stayChangeAcceptanceHash(proposal);
  proposal.after.accommodationEstimateVnd = '3001'; proposal.after.roomBaseVnd = '3001';
  await assert.rejects(service.mutate(actor, 'extend', '5', { ...base, acceptedProposalHash: hash }, 'synthetic-key', 'request'), e => e.code === 'STAY_QUOTE_CHANGED');
  assert.equal(calls.commits, 0);
});
test('G6 matching consent reaches the existing compiler once; no fake commit acknowledgement', async () => {
  const { service, proposal, calls } = fixture();
  await assert.rejects(service.mutate(actor, 'extend', '5', { ...base, acceptedProposalHash: stayChangeAcceptanceHash(proposal) }, 'synthetic-key', 'request'), /STOP_AT_SYNTHETIC_COMMIT_BOUNDARY/);
  assert.equal(calls.commits, 1);
});
test('G6 preview is read-only, but the actual mutation remains a business write', () => {
  assert.equal(nonBusinessWrite('POST', '/stays/5/price-change-preview'), true);
  assert.equal(nonBusinessWrite('POST', '/stays/5/extend'), false);
  assert.equal(nonBusinessWrite('POST', '/stays/5/shorten'), false);
});
test('G6 API client uses the single HTTP client and session CSRF for preview', async () => {
  const require = createRequire(import.meta.url), { createStaysApi } = require('../../js/api/stays-api.js'), calls = [];
  const api = createStaysApi({ client: { async request(...args) { calls.push(args); return { data: { committed: false } }; } }, getCsrfToken: () => 'x'.repeat(43) });
  await api.previewPriceChange('5', { ...base, direction: 'extend' });
  assert.equal(calls[0][0], '/stays/5/price-change-preview'); assert.equal(calls[0][1].headers['X-CSRF-Token'], 'x'.repeat(43));
  assert.equal(calls[0][1].headers['Idempotency-Key'], undefined);
});
test('checkout keeps a confirmed zero-consumption audit without making another charge', () => {
  const coverage = [{ segmentId: '201', auditId: '501', status: 'CONFIRMED', amountVnd: '0' }];
  assert.doesNotThrow(() => validateCheckoutMinibarCoverage(coverage, structuredClone(coverage), 125));
});
test('checkout refuses missing coverage, swapped audit and changed consumption after preview', () => {
  const coverage = [{ segmentId: '201', auditId: '501', status: 'CONFIRMED', amountVnd: '0' }];
  for (const after of [[], [{ ...coverage[0], auditId: '502' }], [{ ...coverage[0], amountVnd: '1000' }], [{ ...coverage[0], status: 'PENDING' }]]) {
    assert.throws(() => validateCheckoutMinibarCoverage(coverage, after, 125), e => e.code === 'FINANCE_SQL_RESPONSE_INVALID');
  }
});
