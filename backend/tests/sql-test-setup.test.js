// Synthetic providers/profiles only. No real SQL connection, DDL or permissions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSqlTestProfile, sqlTestConnectionOptions } from '../src/adapters/sql/test-profile.js';
import { openApprovedTestPool } from '../src/adapters/sql/test-pool.js';
import { createSqlContractAdapter } from '../src/adapters/sql/approved-contracts.js';
import { mintActor } from '../src/modules/auth/security.js';
import { fixtureTypes } from './fixtures/auth-fixture.js';

function profile() {
  const p = JSON.parse(readFileSync(new URL('../../deploy/sql-test-profile.example.json', import.meta.url), 'utf8'));
  p.approved = true; p.approvalReference = 'FIXTURE_NOT_SQL_APPROVAL';
  Object.assign(p.target, { confirmed: true, server: 'fixture-server', database: 'SongLamPms_Test', expectedServerIdentity: 'fixture-server', expectedDatabaseIdentity: '65dc0017-051b-4eba-afee-df839a612a38' });
  for (const c of Object.values(p.contracts)) Object.assign(c, { approved: true, approvalReference: 'FIXTURE_NOT_SQL_APPROVAL', database: p.target.database });
  return p;
}
test('blank/unapproved profile cannot reach provider; known existing database needs its own explicit test approval and backup', async () => {
  const p = profile(); p.approved = false; let calls = 0;
  await assert.rejects(openApprovedTestPool({ profile: p, createPool() { calls++; } }), { code: 'SQL_TEST_APPROVAL_REQUIRED' }); assert.equal(calls, 0);
  p.approved = true; p.target.database = 'SongLamPms_Design';
  assert.throws(() => validateSqlTestProfile(p), { code: 'SQL_EXISTING_DATABASE_TEST_APPROVAL_REQUIRED' });
  p.target.database = 'master'; assert.throws(() => validateSqlTestProfile(p), { code: 'SQL_OPERATIONAL_TARGET_FORBIDDEN' });
});
test('SQL secret values never enter profiles or setup errors; windows configuration needs no password', () => {
  const p = profile(); assert.equal(sqlTestConnectionOptions(p, {}).auth.mode, 'windows');
  p.auth = { mode: 'sql-login', usernameEnv: 'SONGLAM_SQL_USER', passwordEnv: 'SONGLAM_SQL_PASSWORD' };
  assert.throws(() => sqlTestConnectionOptions(p, {}), { code: 'SQL_SECRETS_MISSING' });
  const opts = sqlTestConnectionOptions(p, { SONGLAM_SQL_USER: 'fixture-user', SONGLAM_SQL_PASSWORD: 'fixture-private' });
  assert.equal(opts.auth.password, 'fixture-private');
  p.auth.password = 'NEVER_PROFILE'; assert.throws(() => validateSqlTestProfile(p), { code: 'SQL_PROFILE_MUST_NOT_CONTAIN_SECRETS' });
  delete p.auth.password; p.password = 'NEVER_ROOT'; assert.throws(() => validateSqlTestProfile(p), { code: 'SQL_PROFILE_MUST_NOT_CONTAIN_SECRETS' });
});
test('TLS, target/procedure/environment binding and read-only preflight cannot be disabled by flags', () => {
  for (const mutate of [p => { p.transport.encrypt = false; }, p => { p.contracts.identity.database = 'other'; },
    p => { p.contracts.credentials.procedure = 'pms.usp_Query'; }, p => { p.environment = 'production'; },
    p => { p.testWritesAllowed = true; }, p => { p.transport.trustServerCertificate = true; }]) {
    const p = profile(); mutate(p); assert.throws(() => validateSqlTestProfile(p));
  }
});
test('login preflight does not require separately approved A3 actor probe', () => {
  const p = profile(); delete p.contracts.actorProbe;
  const checked = validateSqlTestProfile(p); assert.equal(checked.contracts.identity.approved, true); assert.equal(checked.contracts.actorProbe, undefined);
  p.contracts.actorProbe = { procedure: 'pms.usp_AppActorProbe', database: p.target.database, environment: 'test', approved: false, approvalReference: '' };
  assert.equal(validateSqlTestProfile(p).contracts.actorProbe, undefined);
});
test('secret-provider failures cannot expose raw details before pool creation', () => {
  const p = profile(); p.auth = { mode: 'sql-login', usernameEnv: 'SONGLAM_SQL_USER', passwordEnv: 'SONGLAM_SQL_PASSWORD' };
  const secrets = { SONGLAM_SQL_USER: 'fixture' };
  Object.defineProperty(secrets, 'SONGLAM_SQL_PASSWORD', { get() { throw new Error('private-provider-detail'); } });
  assert.throws(() => sqlTestConnectionOptions(p, secrets), error => error.code === 'SQL_SECRETS_UNAVAILABLE' && !error.message.includes('private-provider-detail'));
});
function provider(p, result, extra = {}) {
  const state = { connect: 0, execute: [], close: 0, cancel: 0 };
  const pool = { connected: true, async connect() { state.connect++; if (extra.connectFailure) throw new Error('password=PRIVATE'); },
    request() { return { async execute(proc) { state.execute.push(proc); if (extra.hang) return new Promise(() => {}); return result; }, cancel() { state.cancel++; } }; },
    async close() { state.close++; } };
  const createPool = opts => { assert.equal(opts.database, p.target.database); return pool; };
  return { state, createPool, types: fixtureTypes, profile: p };
}
function identity(p) { return { recordsets: [[{ DatabaseName: p.target.database, ServerIdentity: p.target.expectedServerIdentity,
  DatabaseIdentity: p.target.expectedDatabaseIdentity, Environment: 'test', ContractVersion: 'songlam.auth.v1' }]] }; }
test('pool preflight calls only approved identity RPC and never enables business writes (provider fixture)', async () => {
  const p = profile(), f = provider(p, identity(p));
  const opened = await openApprovedTestPool(f); assert.equal(opened.identityVerified, true); assert.equal(opened.businessWritesEnabled, false);
  assert.deepEqual(f.state.execute, ['pms.usp_AppEnvironment']); await opened.close(); assert.equal(f.state.close, 1);
});
test('wrong DB, wrong identity, provider failure and timeout close the pool; raw errors stay private', async () => {
  for (const type of ['database', 'identity', 'failure', 'timeout']) {
    const p = profile(), result = identity(p);
    if (type === 'database') result.recordsets[0][0].DatabaseName = 'SongLamPms_Design';
    if (type === 'identity') result.recordsets[0][0].DatabaseIdentity = 'wrong';
    const f = provider(p, result, { connectFailure: type === 'failure', hang: type === 'timeout' });
    await assert.rejects(openApprovedTestPool({ ...f, timeoutMs: 10 }), error => error.code === 'SQL_TEST_CONNECTION_OR_IDENTITY_UNVERIFIED' && !/PRIVATE|password=/.test(error.message));
    assert.ok(f.state.close >= 1); if (type === 'timeout') assert.equal(f.state.cancel, 1);
  }
});
test('auth adapter binds to explicitly selected test DB; actor probe cannot pretend to commit or accept forged actors', async () => {
  const p = profile(), calls = [], id = '82e956e6-a2ac-432d-98c4-81da1735adbf';
  p.contracts.actorProbe = { approved: true, approvalReference: 'FIXTURE_NOT_SQL_APPROVAL', procedure: 'pms.usp_AppActorProbe', database: p.target.database, environment: 'test' };
  const adapter = createSqlContractAdapter({ database: p.target.database, environment: 'test', types: fixtureTypes, contracts: p.contracts,
    pool: { connected: true, request() { const parameters = {}; return { input(k, _type, v) { parameters[k] = v; return this; }, cancel() {},
      async execute(procedure) { calls.push({ procedure, parameters }); return { recordsets: [[{ ActorId: '2', RequestId: id, Status: 'AUTHORIZED' }]] }; } }; } } });
  const actor = mintActor({ appUserId: '2', permissions: ['viewRoomRack'] });
  const result = await adapter.verifyActor(actor, 'viewRoomRack', id);
  assert.equal(result.status, 'AUTHORIZED'); assert.equal(result.businessWritePerformed, false); assert.equal(adapter.actorDelegationConfigured, false);
  assert.equal(calls[0].parameters.AppUserId, '2'); assert.equal(calls[0].procedure, 'pms.usp_AppActorProbe');
  await assert.rejects(adapter.verifyActor({ appUserId: '2', permissions: ['viewRoomRack'] }, 'viewRoomRack', id), { code: 'UNAUTHENTICATED' });
});
