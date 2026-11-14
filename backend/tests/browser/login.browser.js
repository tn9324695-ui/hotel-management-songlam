// Real Edge/CDP checks; no browser package, SQL driver or personal browser profile.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { testConfig } from '../helpers.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const edge = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await read(); if (value) return value; await sleep(40); }
  throw new Error('Browser did not reach the expected state.');
}

class CDP {
  constructor(socket) {
    this.socket = socket; this.id = 0; this.pending = new Map(); this.handlers = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const task = this.pending.get(message.id);
        if (!task) return;
        clearTimeout(task.timer); this.pending.delete(message.id);
        if (message.error) task.reject(new Error(JSON.stringify(message.error))); else task.resolve(message.result);
      } else for (const handler of this.handlers.get(message.method) || []) handler(message.params);
    });
  }
  on(name, handler) { if (!this.handlers.has(name)) this.handlers.set(name, []); this.handlers.get(name).push(handler); }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 10000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
}

const report = { passed: 0, checks: [], errors: [], screenshots: [] };
function check(name, fn) { fn(); report.passed++; report.checks.push(name); console.log('[PASS]', name); }
let server, browser, profile, cdp;
try {
  await fs.access(edge);
  profile = await fs.mkdtemp(path.join(os.tmpdir(), 'songlam-g1-edge-'));
  server = createApp({ config: testConfig() }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = spawn(edge, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', '--user-data-dir=' + profile, 'about:blank'],
  { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let launchError;
  browser.on('error', error => { launchError = error; });
  browser.stderr.resume();
  const port = await until(async () => {
    if (launchError) throw launchError;
    if (browser.exitCode !== null) throw new Error('Edge exited before CDP became available.');
    try { return Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); } catch { return false; }
  });
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  cdp = new CDP(socket);
  let loginPosts = 0;
  cdp.on('Runtime.exceptionThrown', event => report.errors.push(event.exceptionDetails.text));
  cdp.on('Runtime.consoleAPICalled', event => { if (event.type === 'error') report.errors.push(event.args.map(a => a.value || a.description).join(' ')); });
  cdp.on('Network.requestWillBeSent', event => { if (event.request.method === 'POST' && event.request.url.endsWith('/auth/login')) loginPosts++; });
  cdp.on('Network.responseReceived', event => {
    if (['Document', 'Stylesheet', 'Script', 'Image', 'Font'].includes(event.type) && event.response.status >= 400) report.errors.push(`Resource ${event.response.status}: ${event.response.url}`);
  });
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');
  await cdp.send('Page.navigate', { url: base + '/login.html' });
  await until(() => cdp.evaluate("document.getElementById('auth-detail')?.textContent.includes('phê duyệt')"));
  // Deliberately malformed source data in this ISOLATED profile must not be normalized.
  await cdp.evaluate("localStorage.setItem('songlam_hotel_pms_data_v2','G1-sentinel-not-json'); sessionStorage.clear();");
  const output = path.join(root, 'screenshots', 'verification'); await fs.mkdir(output, { recursive: true });
  for (const [width, height] of [[1366, 768], [1920, 1080], [390, 844]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: base + '/login.html' });
    await until(() => cdp.evaluate("document.getElementById('auth-detail')?.textContent.includes('phê duyệt')"));
    const state = await cdp.evaluate(`(() => ({
      title: document.title, status: document.getElementById('auth-status').textContent,
      disabled: document.getElementById('login-fields').disabled,
      overflow: document.documentElement.scrollWidth > innerWidth,
      storage: localStorage.getItem('songlam_hotel_pms_data_v2'),
      scripts: [...document.scripts].map(s => s.src),
      styles: [...document.styleSheets].map(s => s.href)
    }))()`);
    check(`${width}x${height}: unconfigured, disabled and no horizontal overflow`, () => {
      assert.equal(state.status, 'Chưa cấu hình đăng nhập'); assert.equal(state.disabled, true); assert.equal(state.overflow, false);
    });
    check(`${width}x${height}: original storage sentinel preserved and no legacy script loaded`, () => {
      assert.equal(state.storage, 'G1-sentinel-not-json');
      assert.ok(state.scripts.some(s => s.endsWith('/js/deployment.js')));
      assert.ok(state.scripts.every(s => !/\/(store|data|app|pms-ui)\.js$/.test(s)));
      assert.ok(state.styles.some(s => s.endsWith('/css/tabler.min.css')));
    });
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const name = `login-${width}.png`; await fs.writeFile(path.join(output, name), Buffer.from(screenshot.data, 'base64'));
    report.screenshots.push('screenshots/verification/' + name);
  }
  await cdp.evaluate(`document.getElementById('login-fields').disabled=false;
    document.getElementById('username').value='G1-browser-test';
    document.getElementById('password').value='not-a-real-password';
    document.getElementById('login-form').requestSubmit();`);
  const forced = await cdp.evaluate(`({disabled:document.getElementById('login-fields').disabled,password:document.getElementById('password').value,
    state:document.getElementById('login-form').dataset.authState,cookie:document.cookie,sessionCount:sessionStorage.length,url:location.href,
    storage:localStorage.getItem('songlam_hotel_pms_data_v2')})`);
  check('forced submit cannot send a password, create a session, redirect or alter source storage', () => {
    assert.equal(loginPosts, 0); assert.equal(forced.disabled, true); assert.equal(forced.password, '');
    assert.equal(forced.state, 'not-configured'); assert.equal(forced.cookie, ''); assert.equal(forced.sessionCount, 0);
    assert.equal(forced.url, base + '/login.html'); assert.equal(forced.storage, 'G1-sentinel-not-json');
  });
  await cdp.send('Network.setBlockedURLs', { urls: [base + '/api/v1/auth/status'] });
  await cdp.send('Page.navigate', { url: base + '/login.html' });
  await until(() => cdp.evaluate("document.getElementById('auth-detail')?.textContent.includes('Chưa kết nối')"));
  check('offline API leaves login disabled and reports unconfigured', () => {});
  assert.equal(await cdp.evaluate("document.getElementById('login-fields').disabled"), true);
  await cdp.send('Network.setBlockedURLs', { urls: [] });
  const health = await fetch(base + '/health'); const ready = await fetch(base + '/ready');
  check('real HTTP server has health 200 and readiness 503', () => { assert.equal(health.status, 200); assert.equal(ready.status, 503); });
  for (const route of ['/index.html', '/reception.html', '/housekeeping.html']) {
    const response = await fetch(base + route); await response.arrayBuffer();
    check('demo link resolves without executing demo scripts: ' + route, () => assert.equal(response.status, 200));
  }
  // API pages must actually execute, not merely return HTML 200. Default server
  // has no SQL/auth contract; empty/error UI must preserve the isolated sentinel.
  for (const [page, marker] of [['admin-api.html', 'mgmt-user'], ['housekeeping-api.html', 'ops-message'],
    ['services-api.html', 'g8-message'], ['finance-api.html', 'fin-message'], ['operations-status.html', 'deployment-status']]) {
    for (const [width, height] of [[1366, 768], [1920, 1080], [390, 844]]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await cdp.send('Page.navigate', { url: base + '/' + page });
      await until(() => cdp.evaluate(`document.readyState === 'complete' && !!document.getElementById(${JSON.stringify(marker)})?.textContent`));
      await sleep(200);
      const state = await cdp.evaluate(`({overflow:document.documentElement.scrollWidth>innerWidth, store:typeof SongLamStore,
        source:localStorage.getItem('songlam_hotel_pms_data_v2'), text:document.getElementById(${JSON.stringify(marker)}).textContent})`);
      check(`${page} ${width}x${height}: API unavailable is visible, no legacy fallback/overflow`, () => {
        assert.equal(state.overflow, false); assert.equal(state.store, 'undefined'); assert.equal(state.source, 'G1-sentinel-not-json');
        assert.ok(state.text.trim().length > 0); assert.doesNotMatch(state.text, /NaN|undefined/);
      });
      if (width === 1366 || width === 390) {
        const capture = await cdp.send('Page.captureScreenshot', { format: 'png' });
        const name = `${page.replace('.html', '')}-${width}.png`;
        await fs.writeFile(path.join(output, name), Buffer.from(capture.data, 'base64'));
        report.screenshots.push('screenshots/verification/' + name);
      }
    }
  }
  const refused = await cdp.evaluate(`SongLamHttp.createClient().request('/payments',{method:'POST',body:{amountVnd:'1'},headers:{'Idempotency-Key':'browser-fixture'}}).then(()=> 'FALSE_SUCCESS',e=>e.code)`);
  check('actual browser refuses financial send in demo mode', () => assert.equal(refused, 'CUTOVER_WRITE_LOCKED'));
  check('no JavaScript console exceptions or failed page assets', () => assert.deepEqual(report.errors, []));
  await fs.writeFile(path.join(output, 'browser-checks.json'), JSON.stringify(report, null, 2));
  console.log(`RESULT: ${report.passed}/${report.passed} PASSED`);
} catch (error) {
  console.error('[FAIL]', error.message);
  process.exitCode = 1;
} finally {
  if (cdp) { try { await cdp.send('Browser.close'); } catch {} cdp.socket.close(); }
  if (browser && browser.exitCode === null) {
    await Promise.race([once(browser, 'exit'), sleep(3000)]);
    if (browser.exitCode === null) browser.kill();
  }
  if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  if (profile) {
    const actual = path.resolve(profile), tempRoot = path.resolve(os.tmpdir());
    if (path.dirname(actual) !== tempRoot || !path.basename(actual).startsWith('songlam-g1-edge-')) throw new Error('Unsafe profile cleanup target.');
    await fs.rm(actual, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }).catch(() => console.error('Temporary Edge profile could not be fully removed.'));
  }
}
