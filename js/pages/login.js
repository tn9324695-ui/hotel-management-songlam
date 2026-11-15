(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else {
    root.SongLamLogin = factory();
    const boot = () => root.SongLamLogin.mountLogin({ document: root.document, client: root.SongLamHttp.getClient() });
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const unavailable = 'Chưa cấu hình đăng nhập';
  function mountLogin({ document, client, navigate = async () => {
    if (globalThis.SongLamSession) { await globalThis.SongLamSession.restore(); globalThis.location.assign(globalThis.SongLamPermissions.home()); }
    else globalThis.location.assign('/operations-status.html');
  } }) {
    const form = document.getElementById('login-form');
    const fieldset = document.getElementById('login-fields');
    const password = document.getElementById('password');
    const status = document.getElementById('auth-status');
    const detail = document.getElementById('auth-detail');
    const help = document.getElementById('login-help');
    const lock = () => {
      fieldset.disabled = true;
      form.dataset.authState = 'not-configured';
      status.textContent = unavailable;
      if (help) help.textContent = 'Chưa cấp phiên đăng nhập. Không có tài khoản mặc định hoặc phiên demo thay thế.';
    };
    lock();
    let enabled = false, sending = false, submitted = false;
    async function submit(event) {
      event.preventDefault();
      if (sending) return;
      if (!enabled) {
        password.value = ''; lock();
        detail.textContent = 'Đăng nhập chưa được kích hoạt. Chỉ dùng demo khi chế độ triển khai cho phép.';
        return;
      }
      submitted = true;
      const username = document.getElementById('username').value.trim();
      const secret = password.value;
      password.value = '';
      sending = true; fieldset.disabled = true;
      try {
        const result = await client.request('/auth/login', { method: 'POST', body: { username, password: secret } });
        if (!/^[1-9]\d{0,18}$/.test(result.data?.user?.appUserId || '') || !/^[A-Za-z0-9_-]{43}$/.test(result.data?.csrfToken || '')) throw new Error();
        // Cookie is server-owned. Do not persist credentials, CSRF or user/role in storage.
        const me = await client.request('/auth/me');
        if (me.data?.user?.appUserId !== result.data.user.appUserId || me.data?.csrfToken !== result.data.csrfToken) throw new Error();
        status.textContent = 'Đã xác thực phiên'; await navigate();
      } catch (error) {
        status.textContent = 'Chưa đăng nhập';
        detail.textContent = error?.code ? 'Đăng nhập không hoàn tất. [' + error.code + ']' : 'Không xác minh được phiên đăng nhập. Vui lòng thử lại.';
        // A dependency can disappear after the initial status request. Recheck
        // availability after a 503; never leave a formerly enabled form open
        // when SQL/session configuration is no longer ready.
        if (error?.status === 503) {
          try {
            const availability = await client.request('/auth/status');
            enabled = availability.data?.status === 'configured' && availability.data?.loginEnabled === true && availability.data?.stage === 'G2';
          } catch { enabled = false; }
          if (!enabled) lock();
        }
        fieldset.disabled = !enabled;
      } finally { sending = false; }
    }
    form.addEventListener('submit', submit);
    if (typeof document.querySelectorAll === 'function') {
      document.querySelectorAll('.quick-login-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const u = document.getElementById('username');
          const p = document.getElementById('password');
          if (u) u.value = btn.dataset.user || '';
          if (p) p.value = btn.dataset.pass || '';
          if (typeof form.requestSubmit === 'function') form.requestSubmit();
          else submit(new Event('submit'));
        });
      });
    }
    const ready = (async () => {
      try {
        const response = await client.request('/auth/status');
        enabled = response.data?.status === 'configured' && response.data?.loginEnabled === true && response.data?.stage === 'G2';
        if (enabled) {
          fieldset.disabled = false; form.dataset.authState = 'configured';
          status.textContent = 'Đăng nhập nhân viên'; detail.textContent = 'Phiên và quyền được xác minh trên máy chủ.';
          if (help) help.textContent = 'Dùng tài khoản nhân viên đã được cấp. Không lưu mật khẩu trong trình duyệt.';
          if (globalThis.SongLamSession) { try { await globalThis.SongLamSession.restore(); if (!submitted) await navigate(); } catch { /* A fresh visitor has no session. Keep the form available. */ } }
          return;
        }
        detail.textContent = 'Đăng nhập sẽ được kích hoạt sau khi cấu hình xác thực được phê duyệt. Không có phiên vận hành giả.';
      } catch {
        detail.textContent = 'Chưa kết nối được API đăng nhập. Chưa xác thực phiên; không dùng phiên hoặc dữ liệu demo thay thế.';
      }
      // A success HTTP status alone cannot activate authentication.
      lock();
    })();
    return { ready, dispose: () => form.removeEventListener('submit', submit) };
  }
  return Object.freeze({ mountLogin });
}));
