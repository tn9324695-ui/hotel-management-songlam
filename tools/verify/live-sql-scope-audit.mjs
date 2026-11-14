// End-to-end scope audit. Existing test staff only; no business write.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const origin = 'http://127.0.0.1:8093';
const bundle = JSON.parse((await readFile(new URL('../sql/private/test-staff-B20261112_UI01/credentials.local.json', import.meta.url), 'utf8')).replace(/^\uFEFF/, ''));
const sessions = [];
const observations = [];
async function call(path, { session, method = 'GET', body } = {}) {
  const response = await fetch(origin + '/api/v1' + path, {
    method, headers: { ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrf } : {}),
      ...(method !== 'GET' ? { Origin: origin, 'Content-Type': 'application/json' } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const payload = await response.json();
  observations.push({ path, method, status: response.status, code: payload.error?.code || null,
    requestIdPresent: typeof payload.requestId === 'string' });
  return { status: response.status, payload, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function login(role) {
  const account = bundle.accounts.find(row => row.roleCode === role);
  assert.ok(account);
  const response = await call('/auth/login', { method: 'POST', body: { username: account.username, password: account.password } });
  assert.equal(response.status, 200);
  assert.ok(response.cookie && response.payload.data?.csrfToken);
  const session = { role, cookie: response.cookie, csrf: response.payload.data.csrfToken };
  sessions.push(session);
  return session;
}
try {
  const connection = await call('/connection/status');
  assert.equal(connection.payload.data.sqlConnected, true);
  assert.equal(connection.payload.data.identityVerified, true);
  const deployment = await call('/deployment');
  assert.equal(deployment.payload.data.testOnly, true);
  assert.equal(deployment.payload.data.operationalCutover, false);
  assert.deepEqual(deployment.payload.data.operations.map(row => row.operation).sort(),
    ['customers.create', 'bookings.create', 'bookings.group', 'bookings.assign', 'bookings.cancel', 'bookings.cancelRooms'].sort());
  assert.equal(deployment.payload.data.checkInWriteBlocker, 'BUSINESS_DATE_REVIEW_REQUIRED');
  assert.equal((await call('/room-types')).status, 401);

  const roles = {};
  for (const role of ['admin', 'manager', 'receptionist', 'cashier', 'housekeeping']) {
    const session = await login(role);
    const me = await call('/auth/me', { session });
    const permissions = await call('/auth/permissions', { session });
    assert.equal(me.status, 200);
    assert.equal(permissions.status, 200);
    roles[role] = { me: me.status, permissions: permissions.status };
  }
  const front = sessions.find(row => row.role === 'receptionist');
  const house = sessions.find(row => row.role === 'housekeeping');
  const cash = sessions.find(row => row.role === 'cashier');
  const admin = sessions.find(row => row.role === 'admin');
  const types = await call('/room-types?limit=50', { session: front });
  assert.equal(types.status, 200);
  assert.equal(types.payload.data.length, 11);
  const rooms = await call('/rooms?limit=50', { session: front });
  assert.equal(rooms.status, 200);
  assert.equal(rooms.payload.data.length, 50);
  const plans = await call('/rate-plans?limit=50', { session: front });
  assert.equal(plans.status, 200);
  assert.equal(plans.payload.data.length, 2);
  const hotel = await call('/hotel-settings', { session: front });
  assert.equal(hotel.status, 200);
  assert.equal(hotel.payload.data.workingDate, '2026-10-11');
  const bookings = await call('/bookings?limit=50', { session: front });
  assert.equal(bookings.status, 200);
  const type = types.payload.data.find(row => row.active);
  const plan = plans.payload.data.find(row => row.active && row.stayType === 'NIGHTLY');
  assert.ok(type && plan);
  const quote = await call('/pricing/quotes/nightly', { session: front, method: 'POST', body: {
    roomTypeId: type.id, ratePlanId: plan.id, checkInAt: '2026-12-13T14:00:00+07:00',
    checkOutAt: '2026-12-15T12:00:00+07:00', rooms: 1, adultsPerRoom: 1, childrenPerRoom: 0
  } });
  assert.equal(quote.status, 200);
  assert.equal(quote.payload.data.kind, 'ESTIMATE');
  const availability = await call('/bookings/availability?roomTypeId=' + type.id + '&from=2026-12-13&to=2026-12-15', { session: front });
  assert.equal(availability.status, 200);
  const timeline = await call('/bookings/timeline?from=2026-12-13&to=2026-12-16&limit=50', { session: front });
  assert.equal(timeline.status, 200);
  const stayList = await call('/stays?status=IN_HOUSE&limit=20', { session: front });
  assert.equal(stayList.status, 200);
  assert.equal(stayList.payload.data.length, 0);
  const denied = await call('/stays', { session: house });
  assert.equal(denied.status, 403);
  const forged = await call('/room-types?AppUserId=4', { session: front });
  assert.equal(forged.status, 400);
  const locked = {
    housekeeping: await call('/housekeeping/tasks?limit=10', { session: house }),
    finance: await call('/payments?limit=10', { session: cash }),
    management: await call('/users?limit=10', { session: admin })
  };
  for (const value of Object.values(locked)) assert.equal(value.status, 503);
  console.log(JSON.stringify({ status: 'PASS', source: 'REAL_HTTP_BACKEND_SQL_READS_NO_BUSINESS_WRITES',
    roles, live: { roomTypes: types.payload.data.length, roomPage: rooms.payload.data.length,
      ratePlans: plans.payload.data.length, bookingPage: bookings.payload.data.length,
      quoteKind: quote.payload.data.kind, availability: availability.status, timeline: timeline.status,
      inHouseStays: stayList.payload.data.length },
    locked: Object.fromEntries(Object.entries(locked).map(([key, value]) => [key, value.payload.error?.code])),
    checks: observations.length, failures: observations.filter(row => row.status >= 500).map(row => ({ path: row.path, code: row.code })) }));
} finally {
  for (const session of sessions) await call('/auth/logout', { session, method: 'POST', body: {} }).catch(() => {});
}
