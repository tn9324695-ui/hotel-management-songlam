import test from 'node:test';
import assert from 'node:assert/strict';
import { createSqlContractAdapter } from '../src/adapters/sql/approved-contracts.js';
import { fixtureContracts, fixtureTypes } from './fixtures/auth-fixture.js';
import { mintActor } from '../src/modules/auth/security.js';

const identityRow = { UserId: '9223372036854775807', Username: 'fixture', FullName: 'Fixture', IsActive: 1, RowVer: Buffer.alloc(8, 1) };
function adapterFor(result, extras = {}) {
  const calls = [];
  const pool = { connected: true, request() { return { input(name, type, value) { calls.push({ name, type, value }); return this; }, async execute(procedure) { calls.push({ procedure }); return result; }, cancel() {} }; } };
  return { calls, adapter: createSqlContractAdapter({ pool, types: fixtureTypes, contracts: fixtureContracts, environment: 'test', testOnly: true, ...extras }) };
}

test('unapproved, wrong-target, wrong-environment and public principal gateways cannot be called', async () => {
  for (const change of [{ approved: false }, { approvalReference: '' }, { database: 'QLKhachSan' }, { environment: 'production' }, { testOnly: false }, { procedure: 'pms.usp_Query' }, { procedure: 'pms.usp_ReadResource' }, { procedure: 'pms.usp_ExecuteCommand' }, { procedure: 'pms.bad; EXEC evil' }]) {
    const contracts = { credentials: { ...fixtureContracts.credentials, ...change } };
    const { adapter, calls } = adapterFor({}, { contracts });
    assert.equal(adapter.credentialLookupConfigured, false);
    await assert.rejects(adapter.findCredentials('fixture'), error => error.status === 503 && error.code === 'SQL_CONTRACT_NOT_APPROVED');
    assert.equal(calls.length, 0);
  }
});

test('SQL bigint stays exact, RowVer normalizes, and profile never includes hash', async () => {
  const { adapter, calls } = adapterFor({ recordsets: [[{ ...identityRow, PasswordHash: 'NEVER_RETURN' }], [{ PermissionCode: 'viewRooms' }]] });
  const profile = await adapter.getCurrentIdentity(identityRow.UserId);
  assert.equal(profile.appUserId, '9223372036854775807');
  assert.equal(profile.securityVersion, '0x0101010101010101');
  assert.equal(profile.passwordHash, undefined);
  assert.equal(profile.PasswordHash, undefined);
  assert.equal(calls[0].value, '9223372036854775807');
  assert.equal(calls[0].type, 'BigInt');
});

test('ambiguous credential results and malformed/wrong-actor profiles fail closed', async () => {
  const badCredentials = adapterFor({ recordsets: [[{ PasswordHash: 'x' }, { PasswordHash: 'y' }]] }).adapter;
  await assert.rejects(badCredentials.findCredentials('fixture'), error => error.status === 503);
  for (const row of [{ ...identityRow, UserId: '2' }, { ...identityRow, UserId: 9007199254740992 }, { ...identityRow, IsActive: 'true' }, { ...identityRow, RowVer: undefined }]) {
    const { adapter } = adapterFor({ recordsets: [[row], []] });
    await assert.rejects(adapter.getCurrentIdentity(identityRow.UserId), error => error.status === 503);
  }
  const invalidPermission = adapterFor({ recordsets: [[identityRow], [{ PermissionCode: '<script>bad</script>' }]] }).adapter;
  await assert.rejects(invalidPermission.getCurrentIdentity(identityRow.UserId), error => error.status === 503);
});

test('only parameterized procedure execution receives username, never interpolated SQL', async () => {
  const { adapter, calls } = adapterFor({ recordsets: [[]] });
  assert.equal(await adapter.findCredentials("fixture'; DROP TABLE x;--"), null);
  assert.equal(calls[0].name, 'Username');
  assert.equal(calls[0].value, "fixture'; DROP TABLE x;--");
  assert.deepEqual(calls[1], { procedure: fixtureContracts.credentials.procedure });
});

test('command rejects unverified actor, actor fields, missing rights and unconfigured operations before executing', async () => {
  const options = { operations: { 'fixture.write': { permission: 'fixture.write', validate: () => true } } };
  const { adapter, calls } = adapterFor({}, options);
  const command = { operation: 'fixture.write', idempotencyKey: 'test-1', changes: { value: 'test' } };
  await assert.rejects(adapter.executeForActor({ appUserId: '2', permissions: ['fixture.write'] }, command, 'request-1'), error => error.status === 401);
  await assert.rejects(adapter.executeForActor(mintActor({ appUserId: '2', permissions: [] }), command, 'request-1'), error => error.status === 403);
  const actor = mintActor({ appUserId: '2', permissions: ['fixture.write'] });
  await assert.rejects(adapter.executeForActor(actor, { ...command, changes: { ActorId: '9' } }, 'request-1'), error => error.status === 400);
  await assert.rejects(adapter.executeForActor(actor, { ...command, operation: 'unknown' }, 'request-1'), error => error.status === 400);
  assert.equal(calls.length, 0);
});

test('SQL command acknowledgements must match actor, request and completed status', async () => {
  const command = { operation: 'fixture.write', idempotencyKey: 'test-1', changes: { value: 'test' } };
  const actor = mintActor({ appUserId: '2', permissions: ['fixture.write'] });
  for (const result of [[], [{ ActorId: '9', RequestId: 'request-1', Status: 'COMPLETED' }], [{ ActorId: '2', RequestId: 'other', Status: 'COMPLETED' }], [{ ActorId: '2', RequestId: 'request-1', Status: 'PENDING' }]]) {
    const { adapter } = adapterFor({ recordsets: [result] }, { operations: { 'fixture.write': { permission: 'fixture.write', validate: () => true } } });
    await assert.rejects(adapter.executeForActor(actor, command, 'request-1'), error => error.status === 503);
  }
});

test('SQL manifest is snapshotted; later mutation cannot retarget a procedure', async () => {
  const contracts = { credentials: { ...fixtureContracts.credentials } };
  const { adapter, calls } = adapterFor({ recordsets: [[]] }, { contracts });
  contracts.credentials.procedure = 'pms.not_approved';
  await adapter.findCredentials('fixture');
  assert.equal(calls.at(-1).procedure, fixtureContracts.credentials.procedure);
});
