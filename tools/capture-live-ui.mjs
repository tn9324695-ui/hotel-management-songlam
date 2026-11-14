import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { CDP, until, sleep } from '../backend/tests/browser/cdp.mjs';

const credPath = new URL('sql/private/test-staff-B20261112_UI01/credentials.local.json', import.meta.url);
const credData = JSON.parse(await fs.readFile(credPath, 'utf8'));
const recUser = credData.accounts.find(a => a.roleCode === 'receptionist');

const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'songlam-live-'));
const browser = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--remote-debugging-port=0',
  '--remote-debugging-address=127.0.0.1',
  '--user-data-dir=' + profile,
  'about:blank'
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });

browser.stderr.resume();
const debugPort = await until(async () => {
  if (browser.exitCode !== null) throw new Error('Edge exited');
  try {
    return Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
  } catch {
    return false;
  }
});

const target = await (await fetch('http://127.0.0.1:' + debugPort + '/json/new?about:blank', { method: 'PUT' })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await once(socket, 'open');
const cdp = new CDP(socket);

await cdp.send('Runtime.enable');
await cdp.send('Page.enable');
await cdp.send('Network.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

console.log('1. Navigating to login.html...');
await cdp.send('Page.navigate', { url: 'http://127.0.0.1:8093/login.html' });
await until(() => cdp.evaluate("document.readyState === 'complete' && !document.getElementById('login-fields').disabled"));

console.log('2. Logging in as', recUser.username, '...');
await cdp.evaluate(`
  document.getElementById('username').value = ${JSON.stringify(recUser.username)};
  document.getElementById('password').value = ${JSON.stringify(recUser.password)};
  document.getElementById('login-form').dispatchEvent(new Event('submit', { cancelable: true }));
`);
await sleep(1500);

console.log('3. Navigating to reception.html...');
await cdp.send('Page.navigate', { url: 'http://127.0.0.1:8093/reception.html' });
await until(() => cdp.evaluate("document.readyState === 'complete'"));
await sleep(1000);

const recInfo = await cdp.evaluate(`({
  title: document.title,
  topbarUser: document.getElementById('topbarUserName')?.textContent || 'none',
  topbarRole: document.getElementById('topbarRoleText')?.textContent || 'none',
  roomsCount: document.querySelectorAll('.room-card').length,
  url: window.location.href
})`);
console.log('reception.html rendered info:', recInfo);

const shot1 = await cdp.send('Page.captureScreenshot', { format: 'png' });
await fs.writeFile('screenshots/live_reception_sql_1920.png', Buffer.from(shot1.data, 'base64'));
console.log('Saved screenshots/live_reception_sql_1920.png');

console.log('4. Navigating to index.html...');
await cdp.send('Page.navigate', { url: 'http://127.0.0.1:8093/index.html' });
await until(() => cdp.evaluate("document.readyState === 'complete'"));
await sleep(1000);

const indexInfo = await cdp.evaluate(`({
  title: document.title,
  topbarUser: document.getElementById('topbarUserName')?.textContent || 'none',
  topbarRole: document.getElementById('topbarRoleText')?.textContent || 'none',
  url: window.location.href
})`);
console.log('index.html rendered info:', indexInfo);

const shot2 = await cdp.send('Page.captureScreenshot', { format: 'png' });
await fs.writeFile('screenshots/live_index_sql_1920.png', Buffer.from(shot2.data, 'base64'));
console.log('Saved screenshots/live_index_sql_1920.png');

console.log('4b. Switching index.html to room_rack...');
await cdp.evaluate("window.app.switchScreen('room_rack')");
await sleep(1000);
const rackCount = await cdp.evaluate("document.querySelectorAll('.room-card').length");
console.log('index.html room_rack count:', rackCount);
const shot2b = await cdp.send('Page.captureScreenshot', { format: 'png' });
await fs.writeFile('screenshots/live_index_room_rack_sql_1920.png', Buffer.from(shot2b.data, 'base64'));
console.log('Saved screenshots/live_index_room_rack_sql_1920.png');

console.log('5. Navigating to housekeeping.html...');
await cdp.send('Page.navigate', { url: 'http://127.0.0.1:8093/housekeeping.html' });
await until(() => cdp.evaluate("document.readyState === 'complete'"));
await sleep(1000);

const hkInfo = await cdp.evaluate(`({
  title: document.title,
  topbarUser: document.getElementById('topbarUserName')?.textContent || 'none',
  topbarRole: document.getElementById('topbarRoleText')?.textContent || 'none',
  roomsCount: document.querySelectorAll('.room-card').length,
  url: window.location.href
})`);
console.log('housekeeping.html rendered info:', hkInfo);

const shot3 = await cdp.send('Page.captureScreenshot', { format: 'png' });
await fs.writeFile('screenshots/live_housekeeping_sql_1920.png', Buffer.from(shot3.data, 'base64'));
console.log('Saved screenshots/live_housekeeping_sql_1920.png');

browser.kill();
socket.close();
console.log('ALL DONE!');
