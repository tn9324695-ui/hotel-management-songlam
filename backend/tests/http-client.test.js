import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createClient, ApiError } = require('../../js/api/http-client.js');
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'response-42' } });

test('HTTP client sends same-origin JSON, returns correlation and does not retry', async () => {
  let count = 0;
  const client = createClient({ origin: 'http://localhost', fetchImpl: async (url, options) => {
    count++;
    assert.equal(url, 'http://localhost/api/v1/auth/status');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.redirect, 'error');
    return json({ data: { loginEnabled: false }, requestId: 'body-42' });
  } });
  const result = await client.request('/auth/status');
  assert.equal(result.data.loginEnabled, false);
  assert.equal(result.requestId, 'body-42');
  assert.equal(count, 1);
});
test('HTTP client exposes structured API errors without reporting success', async () => {
  let count = 0;
  const client = createClient({ fetchImpl: async () => { count++; return json({ error: { code: 'AUTH_NOT_CONFIGURED', message: 'Chưa cấu hình đăng nhập' } }, 503); } });
  await assert.rejects(client.request('/auth/login', { method: 'POST', body: { username: 'test', password: 'test-only' } }), e => e instanceof ApiError && e.status === 503 && e.code === 'AUTH_NOT_CONFIGURED' && e.requestId === 'response-42');
  assert.equal(count, 1);
});
test('HTML, malformed JSON and bogus success envelopes are rejected', async () => {
  for (const response of [new Response('<html>not API</html>'), new Response('{bad', { headers: { 'Content-Type': 'application/json' } }), json({ success: true })]) {
    const client = createClient({ fetchImpl: async () => response });
    await assert.rejects(client.request('/auth/status'), error => error.code === 'INVALID_RESPONSE');
  }
});
test('network failure hides raw implementation error', async () => {
  const client = createClient({ fetchImpl: async () => { throw new Error('secret connection string'); } });
  await assert.rejects(client.request('/auth/status'), e => e.code === 'NETWORK_ERROR' && !e.message.includes('secret'));
});
test('timeouts and caller cancellation are distinguishable', async () => {
  const fetchImpl = (_url, options) => new Promise((_resolve, reject) => {
    if (options.signal.aborted) reject(new Error('abort'));
    else options.signal.addEventListener('abort', () => reject(new Error('abort')), { once: true });
  });
  await assert.rejects(createClient({ timeoutMs: 10, fetchImpl }).request('/auth/status'), e => e.code === 'REQUEST_TIMEOUT');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(createClient({ fetchImpl }).request('/auth/status', { signal: controller.signal }), e => e.code === 'REQUEST_ABORTED');
});
test('cross-origin and traversing API paths cannot reach fetch', async () => {
  let count = 0;
  const client = createClient({ fetchImpl: async () => { count++; return json({ data: {} }); } });
  for (const path of ['https://example.test', '//example.test', '/../../../backend/.env', '/%2e%2e/%2e%2e/.env', '/bad\\path']) await assert.rejects(client.request(path), TypeError);
  assert.equal(count, 0);
});
