// In-process HTTP + synthetic RPC provider only. No SQL driver or SQL writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { prepareApprovedTestAuth } from '../src/adapters/sql/auth-bootstrap.js';
import { testConfig, startTestServer } from './helpers.js';
import { fixtureHashes, fixturePassword, fixtureTypes } from './fixtures/auth-fixture.js';

function fixture() {
  const profile = JSON.parse(readFileSync(new URL('../../deploy/sql-test-profile.example.json', import.meta.url)));
  profile.approved = true; profile.approvalReference = 'FIXTURE_ONLY';
  Object.assign(profile.target, { confirmed: true, server: 'fixture-server', database: 'SongLamPms_Test',
    expectedServerIdentity: 'fixture-server', expectedDatabaseIdentity: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' });
  for (const c of Object.values(profile.contracts)) Object.assign(c, { approved: true, approvalReference: 'FIXTURE_ONLY', database: profile.target.database });
  const sessionManifest = JSON.parse(readFileSync(new URL('../../deploy/sql-session-manifest.example.json', import.meta.url)));
  Object.assign(sessionManifest, { approved: true, approvalReference: 'FIXTURE_ONLY', database: profile.target.database,
    sessionWritesApproved: true, sessionWriteApprovalReference: 'FIXTURE_ONLY' });
  const state = { opened: 0, closed: 0, calls: [], sessions: new Map(), failProbe: false, active: true };
  const one = row => ({ recordsets: [[row]] });
  const pool = { connected: true, async connect() {}, async close() { state.closed++; }, request() {
    const p = {};
    return { input(key, _type, value) { p[key] = value; return this; }, cancel() {}, async execute(proc) {
      state.calls.push(proc);
      if (proc.endsWith('AppEnvironment')) return one({ DatabaseName: profile.target.database, ServerIdentity: profile.target.expectedServerIdentity,
        DatabaseIdentity: profile.target.expectedDatabaseIdentity, Environment: 'test', ContractVersion: 'songlam.auth.v1' });
      if (proc.endsWith('WebSessionProbe')) return one({ Ready: !state.failProbe });
      if (proc.endsWith('AppAuthLookup')) return one({ UserId: '2', PasswordHash: fixtureHashes.pbkdf2, IsActive: state.active, RowVer: Buffer.alloc(8, 1) });
      if (proc.endsWith('AppIdentity')) return { recordsets: [[{ UserId: '2', Username: 'fixture', FullName: 'Fixture', IsActive: state.active, RowVer: '0x0101010101010101' }], [{ PermissionCode: 'viewRooms' }]] };
      const key = p.EpochHash + ':' + p.SessionKeyHash;
      const ack = Status => one({ EpochHash: p.EpochHash, SessionKeyHash: p.SessionKeyHash, Status });
      if (proc.endsWith('WebSessionCreate')) {
        if (state.sessions.has(key)) throw new Error('duplicate');
        state.sessions.set(key, { ...p, ExpiresAtMs: String(p.ExpiresAtUtc.getTime()) }); return ack('CREATED');
      }
      if (proc.endsWith('WebSessionGet')) return { recordsets: [state.sessions.has(key) ? [state.sessions.get(key)] : []] };
      if (proc.endsWith('WebSessionDestroy')) { state.sessions.delete(key); return ack('DESTROYED'); }
      throw new Error('unexpected RPC');
    } };
  } };
  const options = { config: testConfig(), profile, sessionManifest, epoch: randomBytes(32).toString('base64url'),
    passwordFormats: ['pbkdf2-sha256-v1'], types: { ...fixtureTypes, Int: 'Int', DateTime2: n => `DateTime2(${n})` },
    createPool() { state.opened++; return pool; } };
  return { state, options };
}

test('D2/D3 bootstrap rejects missing independent approvals/epoch/hash policy before any provider call', async () => {
  for (const mutate of [o => { o.profile.approved = false; }, o => { o.sessionManifest.sessionWritesApproved = false; },
    o => { o.epoch = undefined; }, o => { o.passwordFormats = []; }, o => { o.types.NVarChar = undefined; },
    o => { o.config = { ...o.config, environment: 'production' }; }]) {
    const f = fixture(); mutate(f.options);
    await assert.rejects(prepareApprovedTestAuth(f.options)); assert.equal(f.state.opened, 0);
  }
});
test('preparation only probes environment/session store, installs no domain commands and closes failed pool', async () => {
  const f = fixture(), prepared = await prepareApprovedTestAuth(f.options);
  assert.deepEqual(f.state.calls, ['pms.usp_AppEnvironment', 'pms.usp_WebSessionProbe']);
  assert.equal(f.state.sessions.size, 0); assert.equal(prepared.businessWritesEnabled, false);
  assert.equal(prepared.actorProbeConfigured, false); assert.equal(prepared.identity.actorDelegationConfigured, false);
  await prepared.close(); assert.equal(f.state.closed, 1);
  const bad = fixture(); bad.state.failProbe = true;
  await assert.rejects(prepareApprovedTestAuth(bad.options), { code: 'SQL_AUTH_BOOTSTRAP_UNAVAILABLE' });
  assert.equal(bad.state.closed, 1);
});
test('D2 and S0 compose through HTTP with consistent binary/text RowVer, CSRF and logout (fixture only)', async t => {
  const f = fixture(), prepared = await prepareApprovedTestAuth(f.options); t.after(prepared.close);
  const { url } = await startTestServer(t, { authRuntime: prepared.authRuntime });
  const headers = { 'Content-Type': 'application/json', Origin: f.options.config.publicOrigin };
  const login = await fetch(url + '/api/v1/auth/login', { method: 'POST', headers, body: JSON.stringify({ username: 'fixture', password: fixturePassword }) });
  assert.equal(login.status, 200); const body = await login.json();
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal(f.state.sessions.size, 1);
  const me = await fetch(url + '/api/v1/auth/me', { headers: { Cookie: cookie } }); assert.equal(me.status, 200);
  assert.doesNotMatch(JSON.stringify(await me.json()), /PasswordHash|securityVersion|pbkdf2/);
  const denied = await fetch(url + '/api/v1/auth/logout', { method: 'POST', headers: { ...headers, Cookie: cookie }, body: '{}' });
  assert.equal(denied.status, 403); assert.equal(f.state.sessions.size, 1);
  const logout = await fetch(url + '/api/v1/auth/logout', { method: 'POST', headers: { ...headers, Cookie: cookie, 'x-csrf-token': body.data.csrfToken }, body: '{}' });
  assert.equal(logout.status, 200); assert.equal(f.state.sessions.size, 0);
  assert.equal((await fetch(url + '/api/v1/auth/me', { headers: { Cookie: cookie } })).status, 401);
});
test('a locked account after composed login cannot keep using its previous session (fixture only)', async t => {
  const f = fixture(), prepared = await prepareApprovedTestAuth(f.options); t.after(prepared.close);
  const { url } = await startTestServer(t, { authRuntime: prepared.authRuntime });
  const res = await fetch(url + '/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: f.options.config.publicOrigin },
    body: JSON.stringify({ username: 'fixture', password: fixturePassword }) });
  assert.equal(res.status, 200); const cookie = res.headers.get('set-cookie').split(';')[0];
  f.state.active = false;
  assert.equal((await fetch(url + '/api/v1/auth/me', { headers: { Cookie: cookie } })).status, 401);
  assert.equal(f.state.sessions.size, 0);
});
