import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, testConfig } from './helpers.js';

test('health is alive while readiness is explicitly unavailable', async t => {
  const { url } = await startTestServer(t);
  const health = await fetch(url + '/health');
  const alive = await health.json();
  assert.equal(health.status, 200);
  assert.equal(alive.data.status, 'ok');
  assert.equal(alive.requestId, health.headers.get('x-request-id'));
  assert.equal(health.headers.get('cache-control'), 'no-store');
  const ready = await fetch(url + '/ready');
  const body = await ready.json();
  assert.equal(ready.status, 503);
  assert.equal(body.data.ready, false);
  assert.deepEqual(body.data.checks.sqlConfiguration.missing, ['SQL_SERVER']);
  assert.equal(body.data.checks.sqlConnection.status, 'not_verified');
  assert.equal(body.data.checks.authentication.status, 'pending_approval');
});

test('named-instance configuration does not require a port or claim SQL connectivity', async t => {
  const { url } = await startTestServer(t, { config: testConfig({ SQL_SERVER: '.\\SQLEXPRESS', SQL_PORT: '' }) });
  const res = await fetch(url + '/ready'), body = await res.json();
  assert.equal(res.status, 503); assert.equal(body.data.ready, false);
  assert.deepEqual(body.data.checks.sqlConfiguration.missing, []);
  assert.equal(body.data.checks.sqlConnection.status, 'not_verified');
  assert.doesNotMatch(JSON.stringify(body), /SQLEXPRESS/);
});
test('filling SQL environment or setting an auth flag cannot produce readiness', async t => {
  const config = testConfig({ SQL_SERVER: 'unverified-private-host', SQL_PORT: '1433', AUTH_ENABLED: 'true', SQL_CONNECTED: 'true' });
  const { url } = await startTestServer(t, { config });
  const response = await fetch(url + '/ready');
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.data.checks.sqlConfiguration.status, 'configured');
  assert.equal(body.data.ready, false);
  assert.doesNotMatch(JSON.stringify(body), /unverified-private-host/);
  assert.equal((await (await fetch(url + '/api/v1/auth/status')).json()).data.loginEnabled, false);
});
test('request ID is propagated when valid and regenerated when unsafe', async t => {
  const { url } = await startTestServer(t);
  const id = '82e956e6-a2ac-432d-98c4-81da1735adbf';
  const valid = await fetch(url + '/health', { headers: { 'X-Request-ID': id } });
  assert.equal((await valid.json()).requestId, id);
  const unsafe = await fetch(url + '/health', { headers: { 'X-Request-ID': '<script>bad</script>' } });
  assert.match(unsafe.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
});
test('valid credentials always get unavailable without cookies, passwords or success claims', async t => {
  const events = [];
  const { url } = await startTestServer(t, { logger: { info: e => events.push(e), error: e => events.push(e) } });
  const response = await fetch(url + '/api/v1/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'G1-test-only', password: 'not-a-real-password' })
  });
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.error.code, 'AUTH_NOT_CONFIGURED');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(body.data, undefined);
  assert.doesNotMatch(JSON.stringify(body) + JSON.stringify(events), /not-a-real-password|G1-test-only/);
});
test('missing fields and forged actor/role are rejected', async t => {
  const { url } = await startTestServer(t);
  for (const body of [{}, { username: 'u', password: 'p', actorId: 1 }, { username: 'u', password: 'p', role: 'admin' }, []]) {
    const response = await fetch(url + '/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
    assert.equal(response.headers.get('set-cookie'), null);
  }
});
test('JSON parsing, media type and payload limits return safe structured errors', async t => {
  const { url } = await startTestServer(t);
  for (const [contentType, body, status, code] of [
    ['application/json', '{"password":"private-secret",', 400, 'INVALID_JSON'],
    ['text/plain', 'private-secret', 415, 'JSON_REQUIRED'],
    ['application/json', JSON.stringify({ username: 'u', password: 'x'.repeat(20000) }), 413, 'PAYLOAD_TOO_LARGE']
  ]) {
    const response = await fetch(url + '/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': contentType }, body });
    const result = await response.json();
    assert.equal(response.status, status);
    assert.equal(result.error.code, code);
    assert.ok(result.requestId);
    assert.doesNotMatch(JSON.stringify(result), /private-secret|SyntaxError|node_modules/);
  }
});
test('implemented business writes remain locked without a release; unknown reads return 404', async t => {
  const { url } = await startTestServer(t);
  const response = await fetch(url + '/api/v1/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'CUTOVER_WRITE_LOCKED');
  assert.equal((await fetch(url + '/api/v1/not-implemented')).status, 404);
});
test('unexpected async failures do not leak exception messages or stack to response/log', async t => {
  const events = [];
  const { url } = await startTestServer(t, {
    logger: { info: e => events.push(e), error: e => events.push(e) },
    registerRoutes: app => app.get('/api/v1/test-failure', async () => { throw new Error('password=private-secret; stack=raw'); })
  });
  const response = await fetch(url + '/api/v1/test-failure');
  const result = await response.json();
  assert.equal(response.status, 500);
  assert.equal(result.error.code, 'INTERNAL_ERROR');
  assert.doesNotMatch(JSON.stringify(result) + JSON.stringify(events), /private-secret|stack=raw/);
});
test('static allowlist serves login and existing demo but never project/config/SQL files', async t => {
  const { url } = await startTestServer(t);
  for (const name of ['/login.html', '/index.html', '/reception.html', '/housekeeping.html', '/css/tabler.min.css', '/css/login.css', '/js/api/http-client.js']) {
    const response = await fetch(url + name);
    assert.equal(response.status, 200, name);
    await response.arrayBuffer();
  }
  const login = await fetch(url + '/login.html');
  assert.match(login.headers.get('content-security-policy'), /form-action 'none'/);
  for (const name of ['/backend/.env', '/backend/package.json', '/database/sqlserver/001_schema.sql', '/docs/source-inventory.md', '/tests/ui.html', '/.git/config', '/css/../database/README.md']) {
    const response = await fetch(url + name);
    assert.equal(response.status, 404, name);
    await response.arrayBuffer();
  }
});
