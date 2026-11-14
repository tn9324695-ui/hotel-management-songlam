import test from 'node:test';
import assert from 'node:assert/strict';
import { authFixture, fixturePassword, fixtureHashes } from './fixtures/auth-fixture.js';
import { testConfig, startTestServer } from './helpers.js';
import { createAuthRuntime } from '../src/modules/auth/runtime.js';
import { createSessionManager, createExternalSessionStore } from '../src/modules/auth/sessions.js';
import { createPasswordVerifier } from '../src/modules/auth/password-verifier.js';

test('both configured hash formats authenticate using backend SQL adapter; me/permissions are minimal', async t => {
  const f = await authFixture(t);
  for (const username of ['nhanvien_a', 'nhanvien_b']) {
    const login = await f.login(username);
    assert.equal(login.response.status, 200);
    assert.equal(login.body.data.user.username, username);
    assert.match(login.cookie, /^songlam\.sid=[A-Za-z0-9_-]{43}$/);
    assert.match(login.response.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
    const me = await (await f.request('/api/v1/auth/me', login)).json();
    assert.deepEqual(me.data.user, login.body.data.user);
    assert.equal(me.data.csrfToken, login.csrf);
    const rights = await (await f.request('/api/v1/auth/permissions', login)).json();
    assert.ok(rights.data.permissions.length);
    assert.doesNotMatch(JSON.stringify(me) + JSON.stringify(rights), /PasswordHash|passwordHash|securityVersion|version1|\$pbkdf2|\$scrypt/);
  }
  assert.ok([...f.records.keys()].every(key => /^[a-f0-9]{64}$/.test(key)));
  assert.equal(f.state.calls.filter(call => call.parameters.Username).length, 2);
  assert.ok(f.state.calls.every(call => !Object.values(call.parameters).includes(fixturePassword)));
});

test('missing account, wrong password, disabled account and unsupported hashes have identical credential errors', async t => {
  const f = await authFixture(t);
  f.people.set('4', { ...f.people.get('3'), UserId: '4', Username: 'unknown_hash', IsActive: true, PasswordHash: '$argon2id$not-an-approved-format' });
  const errors = [];
  for (const [username, password] of [['absent', fixturePassword], ['nhanvien_a', 'incorrect'], ['locked', fixturePassword], ['unknown_hash', fixturePassword]]) {
    const login = await f.login(username, password);
    assert.equal(login.response.status, 401);
    assert.equal(login.cookie, undefined);
    errors.push(login.body.error);
  }
  for (const error of errors) assert.deepEqual(error, errors[0]);
  assert.equal(f.records.size, 0);
});

test('missing, malformed, duplicate, logged-out and expired sessions cannot access APIs', async t => {
  const f = await authFixture(t, { ttlMs: 1000 });
  for (const cookie of [undefined, 'songlam.sid=forged', 'songlam.sid=' + 'a'.repeat(43), 'songlam.sid=' + 'a'.repeat(43) + '; songlam.sid=' + 'b'.repeat(43)]) {
    const result = await f.request('/api/v1/auth/me', cookie ? { cookie } : null);
    assert.equal(result.status, 401);
  }
  const login = await f.login();
  assert.equal((await f.request('/api/v1/auth/logout', login, { method: 'POST' })).status, 200);
  assert.equal((await f.request('/api/v1/auth/me', login)).status, 401);
  const nextLogin = await f.login();
  f.state.now += 1001;
  assert.equal((await f.request('/api/v1/auth/permissions', nextLogin)).status, 401);
  assert.equal(f.records.size, 0);
});

test('successful reauthentication rotates identifier/CSRF and invalidates the previous session', async t => {
  const f = await authFixture(t);
  const first = await f.login();
  const second = await f.login('nhanvien_a', fixturePassword, { headers: { Cookie: first.cookie } });
  assert.equal(second.response.status, 200);
  assert.notEqual(second.cookie, first.cookie);
  assert.notEqual(second.csrf, first.csrf);
  assert.equal((await f.request('/api/v1/auth/me', first)).status, 401);
  assert.equal((await f.request('/api/v1/auth/me', second)).status, 200);
  assert.equal(f.records.size, 1);
});

test('locked/deleted accounts and changed security version revoke an existing session', async t => {
  const f = await authFixture(t);
  for (const action of ['lock', 'version', 'delete']) {
    const original = { ...f.people.get('2') };
    const login = await f.login('nhanvien_b');
    if (action === 'lock') f.people.get('2').IsActive = false;
    if (action === 'version') f.people.get('2').RowVer = 'version2';
    if (action === 'delete') f.people.delete('2');
    const response = await f.request('/api/v1/auth/me', login);
    assert.equal(response.status, 401);
    assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
    f.people.set('2', original);
  }
});

test('permissions are refreshed each request and revoked rights block the existing session', async t => {
  const f = await authFixture(t);
  const login = await f.login();
  const body = { idempotencyKey: 'fixture-1', changes: { value: 'check' } };
  assert.equal((await f.request('/api/v1/fixture-command', login, { method: 'POST', body })).status, 200);
  f.people.get('9007199254740993').permissions = [];
  const response = await f.request('/api/v1/fixture-command', login, { method: 'POST', body });
  assert.equal(response.status, 403);
  assert.deepEqual((await (await f.request('/api/v1/auth/permissions', login)).json()).data.permissions, []);
  assert.equal(f.state.audit.length, 1);
});

test('fixture SQL rechecks a right revoked after A2 lookup but before command commit', async t => {
  const f = await authFixture(t);
  const login = await f.login();
  f.state.beforeCommand = () => { f.people.get('9007199254740993').permissions = []; };
  const response = await f.request('/api/v1/fixture-command', login, { method: 'POST', body: { idempotencyKey: 'revoke-in-flight', changes: { value: 'blocked' } } });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).data, undefined);
  assert.equal(f.state.audit.length, 0);
});

test('ambiguous store health results cannot enable login', async t => {
  const f = await authFixture(t);
  f.store.probe = async () => ({ ready: false });
  assert.equal((await f.login()).response.status, 503);
  assert.equal((await (await f.request('/api/v1/auth/status')).json()).data.loginEnabled, false);
  assert.equal(f.records.size, 0);
});

test('CSRF token plus exact Origin protect logout and write requests, including login CSRF', async t => {
  const f = await authFixture(t);
  const login = await f.login();
  for (const headers of [{ 'X-CSRF-Token': '' }, { 'X-CSRF-Token': 'wrong' }, { Origin: 'https://evil.example' }, { Origin: '' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await f.request('/api/v1/auth/logout', login, { method: 'POST', headers })).status, 403);
    assert.equal((await f.request('/api/v1/fixture-command', login, { method: 'POST', headers, body: { idempotencyKey: 'csrf', changes: { value: 'blocked' } } })).status, 403);
  }
  assert.equal((await f.request('/api/v1/auth/me', login)).status, 200);
  assert.equal((await f.login('nhanvien_a', fixturePassword, { headers: { Origin: 'https://evil.example' } })).response.status, 403);
  assert.equal((await f.login('nhanvien_a', fixturePassword, { headers: { Origin: '' } })).response.status, 403);
  assert.equal(f.state.audit.length, 0);
});

test('forged actors in login/body/query/headers are rejected, including nested actor fields', async t => {
  const f = await authFixture(t);
  assert.equal((await f.login('nhanvien_a', fixturePassword, { body: { UserId: '2' } })).response.status, 400);
  const login = await f.login();
  const body = { idempotencyKey: 'forged', changes: { value: 'x' } };
  for (const extra of [
    { path: '?UserId=2' }, { headers: { 'X-Actor-Id': '2' } },
    { body: { ...body, role: 'admin' } }, { body: { ...body, changes: { value: 'x', nested: { RecordedBy: '2' } } } }
  ]) {
    const response = await f.request('/api/v1/fixture-command' + (extra.path || ''), login, { method: 'POST', body, ...extra });
    assert.equal(response.status, 400);
  }
  assert.equal((await f.request('/api/v1/auth/me?actorId=2', login)).status, 400);
  assert.equal(f.state.audit.length, 0);
});

test('two employees share one physical fixture connection with distinct actor audit and no connection state', async t => {
  const f = await authFixture(t);
  const [a, b] = await Promise.all([f.login(), f.login('nhanvien_b')]);
  const responses = await Promise.all([a, b].map((login, i) => f.request('/api/v1/fixture-command', login, {
    method: 'POST', body: { idempotencyKey: 'concurrent-' + i, changes: { value: String(i) } }
  })));
  assert.deepEqual(responses.map(response => response.status), [200, 200]);
  assert.deepEqual(f.state.audit.map(row => row.ActorId).sort(), ['2', '9007199254740993']);
  assert.equal(f.state.physicalConnections.size, 1);
  assert.equal(f.state.requests.size, f.state.calls.length);
  const commandCalls = f.state.calls.filter(call => call.procedure.endsWith('_command'));
  assert.deepEqual(commandCalls.map(call => call.parameters.AppUserId).sort(), ['2', '9007199254740993']);
  assert.ok(commandCalls.every(call => call.parameterTypes.AppUserId === 'BigInt'));
  assert.doesNotMatch(JSON.stringify(f.state.calls), /SESSION_CONTEXT|PrincipalBinding|EXECUTE AS|REVERT/);
});

test('SQL failure/timeout never creates login or reports command success; later actor stays isolated', async t => {
  const events = [];
  const f = await authFixture(t, { logger: { info: e => events.push(e), error: e => events.push(e) } });
  f.state.credentialError = true;
  const failed = await f.login();
  assert.equal(failed.response.status, 503); assert.equal(failed.cookie, undefined);
  f.state.credentialError = false;
  f.state.delay = 140;
  const timeout = await f.login();
  assert.equal(timeout.response.status, 503); assert.equal(timeout.cookie, undefined);
  assert.equal(f.records.size, 0); assert.equal(f.state.cancelled, 1);
  f.state.delay = 0;
  const a = await f.login(), b = await f.login('nhanvien_b');
  f.state.commandError = true;
  const bad = await f.request('/api/v1/fixture-command', a, { method: 'POST', body: { idempotencyKey: 'error', changes: { value: 'x' } } });
  assert.equal(bad.status, 503);
  f.state.commandError = false;
  assert.equal((await f.request('/api/v1/fixture-command', b, { method: 'POST', body: { idempotencyKey: 'after-error', changes: { value: 'y' } } })).status, 200);
  assert.deepEqual(f.state.audit.map(row => row.ActorId), ['2']);
  assert.doesNotMatch(JSON.stringify(events) + JSON.stringify(failed.body) + JSON.stringify(timeout.body), /do-not-log|fixture-only-password|\$pbkdf2|\$scrypt|songlam\.sid|version1/);
});

test('A2 and session-store outages fail closed on login and existing sessions', async t => {
  const f = await authFixture(t);
  const login = await f.login();
  f.state.identityError = true;
  assert.equal((await f.request('/api/v1/auth/me', login)).status, 503);
  assert.equal((await f.login()).response.status, 503);
  f.state.identityError = false; f.state.sessionError = true;
  const logout = await f.request('/api/v1/auth/logout', login, { method: 'POST' });
  assert.equal(logout.status, 503);
  assert.equal((await logout.json()).data, undefined);
  assert.equal((await f.login()).cookie, undefined);
  assert.equal((await (await f.request('/api/v1/auth/status')).json()).data.loginEnabled, false);
});

test('session persistence failures never issue a cookie or falsely confirm logout', async t => {
  const f = await authFixture(t);
  f.state.createError = true;
  const failure = await f.login();
  assert.equal(failure.response.status, 503);
  assert.equal(failure.cookie, undefined);
  assert.equal(f.records.size, 0);
  f.state.createError = false;
  const login = await f.login();
  f.state.getError = true;
  assert.equal((await f.request('/api/v1/auth/me', login)).status, 503);
  f.state.getError = false; f.state.destroyError = true;
  const logout = await f.request('/api/v1/auth/logout', login, { method: 'POST' });
  assert.equal(logout.status, 503);
  assert.equal((await logout.json()).data, undefined);
  assert.equal(logout.headers.get('set-cookie'), null);
  f.state.destroyError = false;
  assert.equal((await f.request('/api/v1/auth/logout', login, { method: 'POST' })).status, 200);
});

test('timed-out command is not retried and cannot contaminate the next pooled actor', async t => {
  const f = await authFixture(t);
  const a = await f.login(), b = await f.login('nhanvien_b');
  f.state.commandDelay = 140;
  const response = await f.request('/api/v1/fixture-command', a, { method: 'POST', body: { idempotencyKey: 'timeout', changes: { value: 'x' } } });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).data, undefined);
  f.state.commandDelay = 0;
  const next = await f.request('/api/v1/fixture-command', b, { method: 'POST', body: { idempotencyKey: 'after-timeout', changes: { value: 'y' } } });
  assert.equal(next.status, 200);
  assert.ok(f.state.audit.every(row => row.ActorId === '2'));
  assert.equal(f.state.calls.filter(call => call.procedure.endsWith('_command') && call.parameters.AppUserId === a.body.data.user.appUserId).length, 1);
  assert.ok(f.state.cancelled > 0);
});

test('HTTPS cookie is host-only, Secure, HttpOnly and contains only random identifier', async t => {
  const f = await authFixture(t, { https: true });
  const login = await f.login();
  const cookie = login.response.headers.get('set-cookie');
  assert.match(cookie, /^__Host-songlam\.sid=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Secure;/);
  assert.doesNotMatch(cookie, /Domain=|nhanvien|9007199254740993/);
  const logout = await f.request('/api/v1/auth/logout', login, { method: 'POST' });
  assert.match(logout.headers.get('set-cookie'), /Secure; Max-Age=0/);
});

test('fixture dependencies cannot be used in development/production and no memory session store is operational', async t => {
  const f = await authFixture(t);
  assert.throws(() => createAuthRuntime({ config: testConfig({ NODE_ENV: 'development' }), mode: 'fixture' }), /restricted/);
  assert.throws(() => createAuthRuntime({ config: testConfig(), identity: f.adapter, sessions: createSessionManager({ store: f.store }) }), /Test dependencies/);
  assert.throws(() => createExternalSessionStore({ driver: f.store, durable: false, approvalReference: 'not-approved' }), /approved durable/);
  assert.equal(createSessionManager().operational, false);
  const { url } = await startTestServer(t);
  for (const [path, method] of [['/auth/me', 'GET'], ['/auth/permissions', 'GET'], ['/auth/logout', 'POST']]) {
    const response = await fetch(url + '/api/v1' + path, { method });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('set-cookie'), null);
  }
  assert.equal((await fetch(url + '/ready')).status, 503);
});

test('verifier requires explicit formats and rejects malformed/cost-amplifying/legacy hashes', async () => {
  const disabled = createPasswordVerifier();
  assert.equal(disabled.configured, false);
  assert.equal(await disabled.verify(fixturePassword, fixtureHashes.pbkdf2), false);
  const verifier = createPasswordVerifier({ formats: ['pbkdf2-sha256-v1', 'scrypt-v1'] });
  for (const hash of [fixtureHashes.pbkdf2.replace('$210000$', '$999999999$'), fixtureHashes.scrypt.replace('$16384$', '$1073741824$'), '$2b$unverified-bcrypt', 'plaintext']) {
    assert.equal(await verifier.verify(fixturePassword, hash), false);
  }
  assert.throws(() => createPasswordVerifier({ formats: ['assumed-argon2id'] }), /Unsupported/);
});

test('login rate limit rejects repeated attempts without invoking SQL after the limit', async t => {
  const f = await authFixture(t);
  for (let i = 0; i < 10; i++) assert.equal((await f.login('absent')).response.status, 401);
  const calls = f.state.calls.length;
  assert.equal((await f.login('absent')).response.status, 429);
  assert.equal(f.state.calls.length, calls);
});
