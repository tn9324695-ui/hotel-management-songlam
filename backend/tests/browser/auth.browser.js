// Browser -> Express -> real G2 hashing/session code -> FAKE SQL pool. NOT SQL evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { authFixture, fixturePassword } from '../fixtures/auth-fixture.js';
import { CDP, until, sleep } from './cdp.mjs';

const cleanups = [], report = { source: 'BROWSER_HTTP_G2_FIXTURE_NO_SQL', checks: [], errors: [] };
let profile, browser, cdp;
const check = (name, fn) => { fn(); report.checks.push(name); console.log('[PASS fixture]', name); };
try {
  const reservation = net.createServer().listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; await new Promise(r => reservation.close(r));
  const origin = `http://127.0.0.1:${port}`;
  const f = await authFixture({ after: callback => cleanups.push(callback) }, { publicOrigin: origin, listenPort: port });
  f.people.get('9007199254740993').permissions = ['viewRoomRack', 'manageHousekeepingTasks', 'updateCleanStatus'];
  profile = await fs.mkdtemp(path.join(os.tmpdir(), 'songlam-auth-browser-'));
  const edge = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  browser = spawn(edge, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
    '--remote-debugging-address=127.0.0.1', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  browser.stderr.resume();
  const debugPort = await until(async () => {
    if (browser.exitCode !== null) throw new Error('Browser fixture exited');
    try { return Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); } catch { return false; }
  });
  const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl); await once(socket, 'open');
  cdp = new CDP(socket);
  cdp.on('Runtime.exceptionThrown', () => report.errors.push('JavaScript exception'));
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url: origin + '/login.html' });
  await until(() => cdp.evaluate("document.getElementById('login-fields')?.disabled===false"));
  check('login activates only for configured G2 contract fixture', () => {});
  await cdp.evaluate(`document.getElementById('username').value='nhanvien_a';document.getElementById('password').value=${JSON.stringify(fixturePassword)};document.getElementById('login-form').requestSubmit();`);
  await until(() => cdp.evaluate("location.pathname==='/reception-api.html' && document.readyState==='complete'"));
  const identity = await cdp.evaluate("fetch('/api/v1/auth/me').then(async r=>({status:r.status,data:(await r.json()).data}))");
  check('browser login verifies actual server session and preserves exact bigint employee ID', () => {
    assert.equal(identity.status, 200); assert.equal(identity.data.user.appUserId, '9007199254740993'); assert.equal(f.records.size, 1);
  });
  const privacy = await cdp.evaluate("({cookies:document.cookie,local:localStorage.length,session:sessionStorage.length})");
  check('session cookie is HttpOnly and credentials/token are not stored in browser storage', () => assert.deepEqual(privacy, { cookies: '', local: 0, session: 0 }));
  const denied = await cdp.evaluate("fetch('/api/v1/folios').then(r=>r.status)");
  check('housekeeping fixture cannot read whole folio balances', () => assert.equal(denied, 403));
  const noCsrf = await cdp.evaluate("fetch('/api/v1/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.status)");
  check('browser write without CSRF is rejected by real G2 middleware', () => assert.equal(noCsrf, 403));
  f.people.get('9007199254740993').permissions = [];
  const revoked = await cdp.evaluate("fetch('/api/v1/rooms').then(r=>r.status)");
  check('rights revoked server-side affect the same browser session immediately', () => assert.equal(revoked, 403));
  f.people.get('9007199254740993').IsActive = false;
  const locked = await cdp.evaluate("fetch('/api/v1/auth/me').then(r=>r.status)");
  check('locked employee loses the existing browser session', () => assert.equal(locked, 401));
  check('no browser JavaScript exceptions', () => assert.deepEqual(report.errors, []));
  const output = new URL('../../../screenshots/verification/auth-browser-checks.json', import.meta.url);
  await fs.mkdir(new URL('./', output), { recursive: true });
  await fs.writeFile(output, JSON.stringify({ ...report, passed: report.checks.length }, null, 2));
  console.log(`RESULT fixture: ${report.checks.length}/${report.checks.length} PASSED; SQL tests=0`);
} catch (error) {
  console.error('[FAIL fixture]', error.code || error.name); process.exitCode = 1;
} finally {
  if (cdp) { try { await cdp.send('Browser.close'); } catch {} cdp.socket.close(); }
  if (browser && browser.exitCode === null) { await Promise.race([once(browser, 'exit'), sleep(3000)]); if (browser.exitCode === null) browser.kill(); }
  for (const cleanup of cleanups.reverse()) await cleanup();
  if (profile) {
    const absolute = path.resolve(profile);
    if (path.dirname(absolute) !== path.resolve(os.tmpdir()) || !path.basename(absolute).startsWith('songlam-auth-browser-')) throw new Error('Unsafe fixture cleanup path');
    await fs.rm(absolute, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }).catch(() => {});
  }
}
