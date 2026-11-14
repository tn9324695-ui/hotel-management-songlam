// Real requests to an already running server. No interception/provider fixtures,
// credential submission, localStorage migration or SQL writes in this probe.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { CDP, until, sleep } from '../../backend/tests/browser/cdp.mjs';

const origin = process.argv[2];
const url = new URL(origin || 'http://invalid');
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.protocol !== 'http:' || url.origin !== origin || process.argv.length !== 3)
  throw new Error('Explicit localhost origin required.');
const output = new URL('../../screenshots/sql-preview/', import.meta.url);
const report = { source: 'REAL_BROWSER_REAL_HTTP_NO_API_INTERCEPTION', generatedAt: new Date().toISOString(), origin,
  checks: [], requests: [], errors: [], roleAccountsTested: [], sqlBusinessTests: 0, sqlConnectionVerified: false };
let browser, cdp, profile;
const check = (name, predicate) => { assert.ok(predicate, name); report.checks.push(name); };
try {
  await fs.mkdir(output, { recursive: true });
  profile = await fs.mkdtemp(path.join(os.tmpdir(), 'songlam-live-preview-'));
  browser = spawn(process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let launchFailed = false; browser.on('error', () => { launchFailed = true; }); browser.stderr.resume();
  const debugPort = await until(async () => {
    if (launchFailed || browser.exitCode !== null) throw new Error('Browser unavailable.');
    try { return Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); } catch { return false; }
  });
  const tab = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json();
  const socket = new WebSocket(tab.webSocketDebuggerUrl); await once(socket, 'open'); cdp = new CDP(socket);
  cdp.on('Runtime.exceptionThrown', () => report.errors.push('BROWSER_JAVASCRIPT_EXCEPTION'));
  cdp.on('Runtime.consoleAPICalled', event => { if (event.type === 'error') report.errors.push('BROWSER_CONSOLE_ERROR'); });
  cdp.on('Network.responseReceived', event => {
    const address = new URL(event.response.url);
    if (address.origin !== origin) return;
    if (address.pathname.startsWith('/api/') || ['/health', '/ready'].includes(address.pathname)) {
      const header = Object.entries(event.response.headers).find(([name]) => name.toLowerCase() === 'x-request-id');
      report.requests.push({ path: address.pathname, status: event.response.status,
        requestId: typeof header?.[1] === 'string' && /^[A-Za-z0-9._-]{1,80}$/.test(header[1]) ? header[1] : null });
    } else if (event.response.status >= 400) report.errors.push('ASSET_' + event.response.status + ':' + address.pathname);
  });
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable'); await cdp.send('Network.enable');
  for (const page of ['login.html', 'reception-api.html', 'housekeeping-api.html', 'services-api.html', 'finance-api.html', 'admin-api.html']) {
    await cdp.send('Page.navigate', { url: origin + '/' + page });
    await until(() => cdp.evaluate("document.readyState==='complete'")); await sleep(400);
    check(page + ': no legacy Store', await cdp.evaluate("typeof window.SongLamStore==='undefined'"));
    for (const [width, height] of [[1366, 768], [1920, 1080]]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await sleep(80);
      check(page + ': viewport ' + width + 'x' + height, await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth+2'));
      const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      await fs.writeFile(new URL(page.replace('.html', '') + '-' + width + '.png', output), Buffer.from(screenshot.data, 'base64'));
    }
  }
  const actual = await cdp.evaluate(`(async()=>{
    const results=[];
    for(const route of ['/health','/ready','/api/v1/connection/status','/api/v1/auth/status','/api/v1/auth/me','/api/v1/auth/permissions','/api/v1/room-types','/api/v1/rooms','/api/v1/bookings/timeline?from=2026-12-01&to=2026-12-04']){
      const response=await fetch(route,{credentials:'same-origin'}), payload=await response.json();
      results.push({route,status:response.status,code:payload.error?.code||null,requestId:payload.requestId,
        ...(route==='/api/v1/connection/status'?{connection:payload.data}:{}),
        ...(route==='/api/v1/auth/status'?{loginEnabled:payload.data?.loginEnabled}:{}),
        hasData:response.ok&&Object.hasOwn(payload,'data')});
    }return results;
  })()`);
  report.api = actual;
  const connection = actual.find(item => item.connection)?.connection;
  report.sqlConnectionVerified = connection?.sqlConnected === true && connection?.identityVerified === true;
  const loginEnabled = actual.find(item => item.route === '/api/v1/auth/status')?.loginEnabled;
  check('health reached real backend', actual[0].status === 200);
  check('every API response has correlation ID', actual.every(item => /^[A-Za-z0-9._-]{1,80}$/.test(item.requestId || '')));
  if (!loginEnabled) {
    check('protected reads return no success data while authentication unavailable', actual.filter(item => ['/api/v1/auth/me', '/api/v1/auth/permissions', '/api/v1/room-types', '/api/v1/rooms'].includes(item.route)).every(item => item.status >= 400 && !item.hasData));
    check('readiness does not claim operational acceptance', actual.find(item => item.route === '/ready').status === 503);
    await cdp.send('Page.navigate', { url: origin + '/login.html' });
    await until(() => cdp.evaluate("document.getElementById('login-form')?.dataset.authState==='not-configured'"));
    check('unavailable login remains locked in actual browser', await cdp.evaluate("document.getElementById('login-fields').disabled"));
    await cdp.send('Page.navigate', { url: origin + '/reception-api.html' });
    await until(() => cdp.evaluate("document.querySelector('.ops-identity')?.textContent==='Chưa xác thực phiên'"));
    check('failed session restoration does not leave a perpetual loading identity', await cdp.evaluate("!document.querySelector('.ops-identity').textContent.includes('Đang xác minh')"));
    const rejectedLogin = await cdp.evaluate(`(async()=>{
      const response=await fetch('/api/v1/auth/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({username:'SONGLAM_TEST_PREFLIGHT_NO_ACCOUNT',password:crypto.randomUUID()})});
      const payload=await response.json();
      return {status:response.status,code:payload.error?.code,requestId:payload.requestId,returnedUser:Boolean(payload.data?.user)};
    })()`);
    report.unconfiguredLoginAttempt = rejectedLogin;
    check('direct login request cannot fabricate a session when contracts are missing', rejectedLogin.status === 503 && !rejectedLogin.returnedUser);
    check('no cookies created for unconfigured login', (await cdp.send('Network.getCookies', { urls: [origin] })).cookies.length === 0);
  }
  check('no console exceptions or missing assets', report.errors.length === 0);
  report.result = 'HTTP_PREVIEW_CHECKED_SQL_BUSINESS_NOT_VERIFIED';
} catch {
  report.result = 'FAILED'; process.exitCode = 1;
} finally {
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(new URL('live-preview.json', output), JSON.stringify(report, null, 2) + '\n');
  if (cdp) { try { await cdp.send('Browser.close'); } catch {} cdp.socket.close(); }
  if (browser?.exitCode === null) { await Promise.race([once(browser, 'exit'), sleep(2000)]); if (browser.exitCode === null) browser.kill(); }
  if (profile) {
    const resolved = path.resolve(profile);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('songlam-live-preview-')) throw new Error('Unsafe cleanup path.');
    await fs.rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
  }
  console.log(JSON.stringify({ result: report.result, checks: report.checks.length, errors: report.errors.length, sqlConnectionVerified: report.sqlConnectionVerified, sqlBusinessTests: 0, report: 'screenshots/sql-preview/live-preview.json' }));
}
