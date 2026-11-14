// Fixture proof protocol only, not evidence that migration 015 has run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookingMutationExtension } from '../src/adapters/sql/booking-mutation-extension.js';
import { mintActor } from '../src/modules/auth/security.js';
const names = ['usp_AppBookingMutationPrepare', 'usp_AppBookingMutationCommit', 'usp_WebBookingMutationRuntime', 'usp_WebBookingMutationReceipt'];
function fixture() {
  const manifest = { approved: true, protocol: 'songlam.booking-mutations.v1', database: 'SongLamPms_Design', environment: 'test',
    baseDeploymentId: 'fixture-base', approvalReference: 'FIXTURE_NOT_SQL_APPROVAL', packageSha256: 'a'.repeat(64), backupSetUuid: '11111111-1111-1111-1111-111111111111',
    definitions: names.map(Name => ({ Name, DefinitionSha256: 'B'.repeat(64) })) };
  const release = { ...manifest, operationalCutover: false }, definitions = manifest.definitions.map(d => ({ ...d, AnsiNullsOn: true, QuotedIdentifierOn: true }));
  const calls = [], pool = { connected: true, request() {
    const parameters = {};
    return { input(key, _type, value) { parameters[key] = value; return this; }, async execute(procedure) {
      calls.push({ procedure, parameters });
      return procedure.endsWith('Runtime') ? { recordsets: [[{ ReleaseJson: JSON.stringify(release) }], definitions] }
        : { recordsets: [[{ PayloadJson: JSON.stringify({ status: 'UNKNOWN' }) }]] };
    } };
  } };
  const types = { BigInt: 'bigint', VarChar: n => 'varchar' + n, NVarChar: n => 'nvarchar' + n };
  return { manifest, release, definitions, calls, pool, types, gateway: createBookingMutationExtension({ manifest, pool, types, baseDeploymentId: manifest.baseDeploymentId }) };
}
test('015 missing or unapproved manifest cannot execute even a fixture RPC', async () => {
  const f = fixture();
  for (const manifest of [undefined, { ...f.manifest, approved: false }, { ...f.manifest, definitions: f.manifest.definitions.slice(1) }]) {
    const gateway = createBookingMutationExtension({ ...f, manifest, baseDeploymentId: f.manifest.baseDeploymentId });
    assert.equal(gateway.configured, false); assert.deepEqual(gateway.operations, []);
    await assert.rejects(gateway.inspect(), e => e.code === 'BOOKING_MUTATION_CONTRACT_PENDING');
  }
  assert.equal(f.calls.length, 0);
});
test('015 fixture proof requires the actual receipt, fresh backup binding and every module hash', async () => {
  const f = fixture(); assert.equal((await f.gateway.inspect()).verified, true);
  f.release.backupSetUuid = '22222222-2222-2222-2222-222222222222';
  await assert.rejects(f.gateway.inspect(), e => e.code === 'BOOKING_MUTATION_CONTRACT_PENDING');
});
test('015 module drift or unsafe SET options prevents activation', async () => {
  const f = fixture(); f.definitions[0].DefinitionSha256 = 'C'.repeat(64);
  await assert.rejects(f.gateway.inspect(), e => e.code === 'BOOKING_MUTATION_CONTRACT_PENDING');
  f.definitions[0].DefinitionSha256 = 'B'.repeat(64); f.definitions[0].QuotedIdentifierOn = false;
  await assert.rejects(f.gateway.inspect(), e => e.code === 'BOOKING_MUTATION_CONTRACT_PENDING');
});
test('015 receipt lookup checks current actor rights before SQL and never trusts a browser actor', async () => {
  const f = fixture(), input = { operation: 'bookings.cancel', idempotencyKey: 'fixture-key', originalRequestId: '11111111-1111-1111-1111-111111111111' };
  await assert.rejects(f.gateway.lookup(mintActor({ appUserId: '6', permissions: [] }), input, input.originalRequestId), e => e.status === 403);
  await assert.rejects(f.gateway.lookup({ appUserId: '3', permissions: ['cancelBooking'] }, input, input.originalRequestId));
  assert.equal(f.calls.length, 0);
  await f.gateway.lookup(mintActor({ appUserId: '4', permissions: ['cancelBooking'] }), input, input.originalRequestId);
  assert.equal(f.calls[0].parameters.AppUserId, '4'); assert.equal(f.calls[0].parameters.OriginalRequestId, input.originalRequestId);
});
