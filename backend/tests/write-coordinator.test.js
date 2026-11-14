// Isolated browser globals and synthetic HTTP responses. Not SQL integration.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

function fixture(fetchImpl, mode = 'sql', brokenStorage = false) {
  const values = new Map();
  const context = { URL, Headers, Response, TextEncoder, AbortController, Event, setTimeout, clearTimeout,
    crypto: webcrypto, location: { origin: 'http://fixture.test' }, dispatchEvent() {}, fetch: fetchImpl,
    sessionStorage: { getItem: k => values.get(k) || null, setItem(k, v) { if (brokenStorage) throw new Error(); values.set(k, v); } },
    SongLamDeployment: { refresh: async () => ({ mode, writable: mode === 'sql', deploymentId: 'fixture-deployment',
      operations: [{ operation: 'payments.create', method: 'POST', template: '/payments' }] }) } };
  Object.defineProperty(context, 'localStorage', { get() { throw new Error('No business localStorage access allowed'); } });
  vm.createContext(context);
  for (const file of ['js/api/write-coordinator.js', 'js/api/http-client.js']) vm.runInContext(fs.readFileSync(new URL('../../' + file, import.meta.url), 'utf8'), context);
  return { context, writes: context.SongLamWrites, client: context.SongLamHttp.createClient(), values };
}
const options = key => ({ method: 'POST', body: { amountVnd: '1000000' }, headers: { 'Idempotency-Key': key } });
const success = init => new Response(JSON.stringify({ data: { committed: true }, requestId: init.headers.get('X-Request-ID') }), {
  headers: { 'Content-Type': 'application/json', 'X-Request-ID': init.headers.get('X-Request-ID') }
});
test('API writes in demo/frozen/read-only cannot call fetch or fallback to localStorage', async () => {
  for (const mode of ['demo', 'frozen', 'api-readonly']) {
    let sent = 0; const f = fixture(async () => { sent++; }, mode);
    await assert.rejects(f.client.request('/payments', options('fixed')), { code: 'CUTOVER_WRITE_LOCKED' }); assert.equal(sent, 0);
  }
});
test('a confirmed response with matching request UUID clears only its metadata journal', async () => {
  let sent = 0;
  const f = fixture(async (_url, init) => { sent++; assert.equal(init.headers.get('X-PMS-Deployment'), 'fixture-deployment'); return success(init); });
  await f.client.request('/payments', options('fixed')); assert.equal(sent, 1); assert.equal(f.writes.pending().length, 0);
  assert.doesNotMatch([...f.values.values()].join(''), /amountVnd|1000000|password|cookie/);
});
test('timeout after a synthetic commit keeps original identity and blocks old/new sends until lookup', async () => {
  let commits = 0; const f = fixture(async () => { commits++; throw new Error('lost response after fixture commit'); });
  await assert.rejects(f.client.request('/payments', options('fixed')), e => e.outcomeUnknown === true && !!e.requestId);
  const pending = f.writes.pending()[0]; assert.equal(pending.idempotencyKey, 'fixed');
  for (const key of ['fixed', 'replacement']) await assert.rejects(f.client.request('/payments', options(key)), { code: 'WRITE_OUTCOME_PENDING' });
  assert.equal(commits, 1);
  f.writes.resolved(pending, { operation: pending.operation, originalRequestId: pending.originalRequestId, status: 'COMMITTED' });
  assert.equal(f.writes.pending().length, 0); assert.equal(commits, 1);
});
test('malformed 400 response and mismatched success UUID remain unknown, never discarded as rejection', async () => {
  for (const mode of ['html400', 'wrong-uuid']) {
    const f = fixture(async () => mode === 'html400' ? new Response('not JSON', { status: 400 })
      : new Response(JSON.stringify({ data: { committed: true }, requestId: 'wrong' }), { headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'wrong' } }));
    await assert.rejects(f.client.request('/payments', options('fixed')), e => e.outcomeUnknown === true);
    assert.equal(f.writes.pending().length, 1);
  }
});
test('two concurrent clients in one synthetic tab send at most one command', async () => {
  let sent = 0;
  const f = fixture(async (_url, init) => { sent++; await new Promise(r => setTimeout(r, 30)); return success(init); });
  const results = await Promise.allSettled([f.client.request('/payments', options('first')), f.client.request('/payments', options('second'))]);
  assert.equal(sent, 1); assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'WRITE_OUTCOME_PENDING');
});
test('unavailable pending-journal storage refuses financial send before any HTTP side effect', async () => {
  let sent = 0; const f = fixture(async () => { sent++; }, 'sql', true);
  await assert.rejects(f.client.request('/payments', options('fixed')), { code: 'PENDING_JOURNAL_UNAVAILABLE' }); assert.equal(sent, 0);
});
