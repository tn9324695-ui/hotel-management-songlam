// Real HTTP/G2 SQL sessions; business operations are read-only or rejected.
// No test customer/booking/stay/payment is created. Secrets stay in memory.
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
if (process.argv.slice(2).join(' ') !== '--read-only') throw new Error('READ_ONLY_REQUIRED');
const origin = 'http://127.0.0.1:8093', credentials = JSON.parse((await fs.readFile(new URL('../sql/private/test-staff-B20261112_UI01/credentials.local.json', import.meta.url), 'utf8')).replace(/^\uFEFF/, ''));
const report = { source: 'REAL_HTTP_WITH_EXISTING_SQL_SESSIONS', businessSqlWrites: false, checks: [], startedAtUtc: new Date().toISOString() }, sessions = [];
const check = (name, condition) => { assert.ok(condition, name); report.checks.push(name); };
async function login(role) {
  const account = credentials.accounts.find(item => item.roleCode === role);
  const response = await fetch(origin + '/api/v1/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: account.username, password: account.password }) });
  const data = await response.json(); assert.equal(response.status, 200);
  const session = { cookie: response.headers.get('set-cookie').split(';')[0], csrf: data.data.csrfToken }; sessions.push(session); return session;
}
async function post(session, path, body, csrf = true) {
  const response = await fetch(origin + '/api/v1' + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: session.cookie,
    'X-Request-ID': randomUUID(), ...(csrf ? { 'X-CSRF-Token': session.csrf } : {}) }, body: JSON.stringify(body) });
  return { status: response.status, payload: await response.json() };
}
try {
  const front = await login('receptionist'), house = await login('housekeeping');
  const preview = { direction: 'extend', expectedVersion: '0x0000000000000001', bookingRoomVersion: '0x0000000000000001', currentSegmentId: '1',
    currentAllocationId: '1', currentAllocationVersion: '0x0000000000000001', reason: 'SONGLAM_TEST:VALIDATE_BLOCKER_ONLY', newExpectedOutAt: '2027-01-01T12:00:00+07:00' };
  const blocked = await post(front, '/stays/1/price-change-preview', preview);
  check('NEW_PREVIEW_ROUTE_RETURNS_HONEST_PENDING_SQL', blocked.status === 503 && blocked.payload.error.code === 'STAY_CONTRACT_NOT_APPROVED');
  const missing = await post(front, '/stays/1/price-change-preview', preview, false);
  check('PRICE_PREVIEW_REQUIRES_CSRF', missing.status === 403);
  const forbidden = await post(house, '/stays/1/price-change-preview', preview);
  check('HOUSEKEEPING_CANNOT_READ_STAY_PRICE_CHANGE', forbidden.status === 403);
  const forged = await post(front, '/stays/1/price-change-preview', { ...preview, actorId: '3' });
  check('PREVIEW_REJECTS_BROWSER_ACTOR', forged.status === 400);
  const invalid = await post(front, '/stays/1/price-change-preview', { ...preview, direction: 'invented' });
  check('PREVIEW_REFUSES_UNSUPPORTED_DIRECTION', invalid.status === 400);
  const finance = await post(front, '/payments', {});
  check('PENDING_FINANCIAL_WRITES_STILL_LOCKED', finance.status === 503 && finance.payload.error.code === 'CUTOVER_WRITE_LOCKED');
  const deployment = (await (await fetch(origin + '/api/v1/deployment')).json()).data;
  check('READ_PREVIEW_FAILURE_DOES_NOT_LATCH_BUSINESS_WRITES', deployment.writable === true && deployment.operations.length === 3 && deployment.operations.every(op => ['customers.create', 'bookings.create', 'bookings.group'].includes(op.operation)));
  const response = await fetch(origin + '/api/v1/bookings?limit=10', { headers: { Cookie: front.cookie } }), bookings = await response.json();
  check('EXISTING_BOOKINGS_READ_VIA_SQL_REMAINS_AVAILABLE', response.status === 200 && Array.isArray(bookings.data) && bookings.data.length >= 5);
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.failedCheck = error instanceof assert.AssertionError ? String(error.message).split('\n')[0] : 'HTTP_CHECK_FAILED'; process.exitCode = 1;
} finally {
  for (const session of sessions) await post(session, '/auth/logout', {}).catch(() => {});
  const dir = new URL('../sql/private/lifecycle/', import.meta.url); await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(new URL('http-blockers.json', dir), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, source: report.source, businessSqlWrites: false, ...(report.failedCheck ? { failedCheck: report.failedCheck } : {}) }));
}
