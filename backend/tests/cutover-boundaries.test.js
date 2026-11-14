// Actual localhost HTTP against Express + test-only identities; NO SQL connection.
import test from 'node:test';
import assert from 'node:assert/strict';
import { authFixture } from './fixtures/auth-fixture.js';
import { startTestServer, testConfig } from './helpers.js';
import { createApp } from '../src/app.js';
import { fileURLToPath } from 'node:url';

test('all business command families remain locked in demo/frozen/API-readonly despite browser role claims', async t => {
  const paths = ['/bookings', '/bookings/groups', '/stays/check-in', '/stays/1/extend', '/stays/1/shorten', '/housekeeping/tasks',
    '/maintenance/tickets', '/maintenance/room-blocks', '/lost-found', '/service-orders', '/minibar-audits', '/payments',
    '/refunds', '/checkouts/1/complete', '/folios/1/transfer', '/deposit-accounts/1/apply', '/cashier/shifts', '/finance/business-days/2026-11-09/close'];
  for (const mode of ['demo', 'frozen', 'api-readonly']) {
    const { url } = await startTestServer(t, { config: testConfig({ PMS_WRITE_MODE: mode,
      ...(mode === 'api-readonly' ? { PMS_BUILD_ID: 'fixture', PMS_RELEASE_FILE: fileURLToPath(new URL('../../deploy/cutover/release.example.json', import.meta.url)) } : {}) }) });
    for (const path of paths) {
      const response = await fetch(url + '/api/v1' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Role': 'admin' }, body: '{}' });
      const body = await response.json(); assert.equal(response.status, 503, mode + path); assert.equal(body.error.code, 'CUTOVER_WRITE_LOCKED'); assert.equal(body.data, undefined);
    }
  }
});
test('frozen mode redirects all legacy write pages and never advertises SQL readiness', async t => {
  const { url } = await startTestServer(t, { config: testConfig({ PMS_WRITE_MODE: 'frozen' }) });
  for (const file of ['index.html', 'reception.html', 'housekeeping.html']) assert.equal((await fetch(url + '/' + file, { redirect: 'manual' })).status, 302);
  assert.equal((await fetch(url+'/reception.html',{redirect:'manual'})).headers.get('location'),'/reception-api.html');
  assert.equal((await fetch(url+'/catalog-api.html')).status,200);
  const state = await (await fetch(url + '/api/v1/deployment')).json();
  assert.equal(state.data.legacyWritable, false); assert.equal(state.data.writable, false);
  assert.equal((await fetch(url + '/ready')).status, 503);
});
test('custom fixture route hooks cannot bypass operational deployment outside test environment', () => {
  assert.throws(() => createApp({ config: testConfig({ NODE_ENV: 'development' }), registerRoutes() {} }), /restricted to test/);
});
const roles = {
  reception: ['viewRoomRack', 'createBooking', 'manageCheckIn', 'manageCheckOut'],
  housekeeping: ['viewRoomRack', 'manageHousekeepingTasks', 'updateCleanStatus', 'reportMaintenance'],
  cashier: ['collectPayment', 'viewDailyRevenue'], manager: ['systemConfig', 'viewAuditLog', 'viewDailyRevenue', 'collectPayment']
};
for (const [role, rights] of Object.entries(roles)) test('fixture ' + role + ': real HTTP permissions prevent folio/admin/audit exposure; permitted reads stay SQL-blocked', async t => {
  const f = await authFixture(t); const id = '9007199254740993'; f.people.get(id).permissions = rights;
  const login = await f.login(); assert.equal(login.response.status, 200);
  const expected = [
    ['/api/v1/folios', rights.includes('collectPayment') ? 503 : 403],
    ['/api/v1/users', rights.includes('systemConfig') ? 503 : 403],
    ['/api/v1/audit?fromUtc=2026-11-09T00:00:00Z&toUtc=2026-11-10T00:00:00Z&timeZone=Asia/Ho_Chi_Minh', rights.includes('viewAuditLog') ? 503 : 403]
  ];
  for (const [path, status] of expected) {
    const response = await f.request(path, login), data = await response.json();
    assert.equal(response.status, status, path); assert.equal(data.data, undefined);
    assert.doesNotMatch(JSON.stringify(data), /PasswordHash|csrfToken|balanceVnd|fixture-only-password/);
  }
  const fake = await f.request('/api/v1/rooms?role=manager', login);
  assert.equal(fake.status, 400);
});
test('receipt lookup is unavailable without approved contract and rejects forged actor before lookup', async t => {
  const f = await authFixture(t); const login = await f.login();
  const request = { operation: 'payments.create', idempotencyKey: 'fixture', originalRequestId: '580c6a47-bca5-4ea8-862b-69ba704858a7' };
  assert.equal((await f.request('/api/v1/requests/lookup', login, { method: 'POST', body: request })).status, 503);
  assert.equal((await f.request('/api/v1/requests/lookup', login, { method: 'POST', body: { ...request, actorId: '1' } })).status, 400);
});
