import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { mountLogin } = require('../../js/pages/login.js');

function fakeDocument() {
  const elements = Object.fromEntries(['login-form', 'login-fields', 'username', 'password', 'auth-status', 'auth-detail', 'login-help'].map(id => [id, { dataset: {}, value: '', textContent: '', handlers: {}, addEventListener(name, fn) { this.handlers[name] = fn; }, removeEventListener(name) { delete this.handlers[name]; } }]));
  return { elements, getElementById: id => elements[id] };
}
for (const mode of ['not-configured', 'unexpected-success', 'offline']) {
  test(`login stays disabled for ${mode}, even after a forged submit`, async () => {
    const document = fakeDocument();
    let requests = 0;
    const client = { async request(path) { requests++; assert.equal(path, '/auth/status'); if (mode === 'offline') throw new Error('offline'); return { data: { loginEnabled: mode === 'unexpected-success' } }; } };
    const controller = mountLogin({ document, client });
    await controller.ready;
    const e = document.elements;
    assert.equal(e['login-fields'].disabled, true);
    assert.equal(e['auth-status'].textContent, 'Chưa cấu hình đăng nhập');
    e['login-fields'].disabled = false; e.password.value = 'not-a-real-password';
    let prevented = false;
    e['login-form'].handlers.submit({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(e['login-fields'].disabled, true);
    assert.equal(e.password.value, '');
    assert.equal(e['login-form'].dataset.authState, 'not-configured');
    assert.equal(requests, 1, 'must not send a login request');
    assert.doesNotMatch(e['auth-status'].textContent + e['auth-detail'].textContent, /thành công/);
    controller.dispose();
  });
}
test('browser initialization never accesses storage, legacy store, cookies or navigation', async () => {
  const document = fakeDocument(); document.readyState = 'complete';
  const fail = () => { throw new Error('Storage/navigation/legacy store must not be used'); };
  Object.defineProperty(document, 'cookie', { get: fail, set: fail });
  const context = { document, SongLamHttp: { getClient: () => ({ request: async () => ({ data: {} }) }) } };
  for (const name of ['localStorage', 'sessionStorage', 'SongLamStore', 'location']) Object.defineProperty(context, name, { get: fail, set: fail });
  vm.runInNewContext(fs.readFileSync(new URL('../../js/pages/login.js', import.meta.url), 'utf8'), context);
  await Promise.resolve();
  assert.equal(document.elements['login-fields'].disabled, true);
});

test('configured G2 login posts once, clears password and navigates only after session confirmation (HTTP fixture)', async () => {
  const document = fakeDocument(), calls = []; let navigated = false;
  const client = { async request(path, options) {
    calls.push({ path, options });
    if (path === '/auth/status') return { data: { status: 'configured', loginEnabled: true, stage: 'G2' } };
    return { data: { user: { appUserId: '2' }, csrfToken: 'a'.repeat(43) } };
  } };
  const c = mountLogin({ document, client, navigate: () => { navigated = true; } }); await c.ready;
  assert.doesNotMatch(document.elements['login-help'].textContent, /đang chờ cấu hình|chưa cấp phiên/i);
  document.elements.username.value = ' fixture '; document.elements.password.value = 'fixture-secret';
  await document.elements['login-form'].handlers.submit({ preventDefault() {} });
  assert.equal(navigated, true); assert.equal(document.elements.password.value, '');
  assert.deepEqual(calls.map(c => c.path), ['/auth/status', '/auth/login', '/auth/me']);
  assert.equal(calls[1].options.body.username, 'fixture');
});
test('configured login timeout or missing receipt never navigates or claims success (HTTP fixture)', async () => {
  for (const mode of ['timeout', 'bad-envelope']) {
    const document = fakeDocument(); let navigated = false;
    const c = mountLogin({ document, navigate: () => { navigated = true; }, client: { async request(path) {
      if (path === '/auth/status') return { data: { status: 'configured', loginEnabled: true, stage: 'G2' } };
      if (mode === 'timeout') throw Object.assign(new Error('private-secret'), { code: 'REQUEST_TIMEOUT' });
      return { data: {} };
    } } }); await c.ready;
    document.elements.password.value = 'fixture-secret';
    await document.elements['login-form'].handlers.submit({ preventDefault() {} });
    assert.equal(navigated, false); assert.equal(document.elements.password.value, '');
    assert.doesNotMatch(document.elements['auth-detail'].textContent, /private-secret|thành công/);
  }
});
test('login HTML locks fields before JS loads and imports no demo initializer', () => {
  const html = fs.readFileSync(new URL('../../login.html', import.meta.url), 'utf8');
  assert.match(html, /<fieldset[^>]*id="login-fields"[^>]*disabled/);
  assert.match(html, /Chưa cấu hình đăng nhập/);
  assert.doesNotMatch(html, /js\/(?:store|data|app|reception|housekeeping|pms-ui)\.js/);
  assert.doesNotMatch(html, /<form[^>]*action=/);
});

test('late automatic session restoration cannot navigate again after an explicit login', async()=>{
  const document=fakeDocument();let finishRestore,restoring=false,navigations=0;
  const context={module:{exports:{}},SongLamSession:{restore:()=>{restoring=true;return new Promise(resolve=>{finishRestore=resolve;});}}};
  vm.runInNewContext(fs.readFileSync(new URL('../../js/pages/login.js',import.meta.url),'utf8'),context);
  const controller=context.module.exports.mountLogin({document,navigate:()=>{navigations++;},client:{async request(path){
    return path==='/auth/status'?{data:{status:'configured',loginEnabled:true,stage:'G2'}}:{data:{user:{appUserId:'2'},csrfToken:'a'.repeat(43)}};
  }}});
  while(!restoring)await Promise.resolve();
  document.elements.username.value='fixture';document.elements.password.value='fixture-secret';
  await document.elements['login-form'].handlers.submit({preventDefault(){}});
  assert.equal(navigations,1);finishRestore();await controller.ready;
  assert.equal(navigations,1);assert.equal(document.elements.password.value,'');
});

test('dependency loss after initial availability relocks login without another credential send (HTTP fixture)', async () => {
  const document = fakeDocument(), calls = []; let available = true, navigations = 0;
  const client = { async request(path) {
    calls.push(path);
    if (path === '/auth/status') return { data: { status: available ? 'configured' : 'not_configured', loginEnabled: available, stage: 'G2' } };
    available = false;
    throw Object.assign(new Error('private-driver-detail'), { status: 503, code: 'AUTH_NOT_CONFIGURED' });
  } };
  const controller = mountLogin({ document, client, navigate: () => { navigations++; } }); await controller.ready;
  document.elements.password.value = 'fixture-only';
  await document.elements['login-form'].handlers.submit({ preventDefault() {} });
  assert.equal(document.elements['login-fields'].disabled, true);
  assert.equal(document.elements['login-form'].dataset.authState, 'not-configured');
  assert.equal(document.elements.password.value, '');
  await document.elements['login-form'].handlers.submit({ preventDefault() {} });
  assert.deepEqual(calls, ['/auth/status', '/auth/login', '/auth/status']);
  assert.equal(navigations, 0);
  assert.doesNotMatch(document.elements['auth-detail'].textContent, /private-driver-detail/);
});
