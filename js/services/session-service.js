(function (root) {
  'use strict';
  const client = root.SongLamHttp.getClient();
  let state = null, pending = null, generation = 0;
  const publish = () => root.dispatchEvent(new CustomEvent('songlam:session', { detail: state }));
  function clear() { generation++; state = null; pending = null; publish(); }
  root.addEventListener?.('songlam:unauthenticated', clear);
  async function restore() {
    if (pending) return pending;
    const ticket = generation;
    const stale = () => Object.assign(new Error('Phiên đã đổi hoặc bị xóa trong khi tải. Vui lòng đăng nhập lại.'), { code: 'SESSION_CHANGED', status: 401 });
    const task = Promise.resolve().then(async () => {
      try {
        const me = await client.request('/auth/me');
        if (ticket !== generation) throw stale();
        const rights = await client.request('/auth/permissions');
        if (ticket !== generation) throw stale();
        if (!me.data?.user?.appUserId || !/^[A-Za-z0-9_-]{43}$/.test(me.data.csrfToken || '') || !Array.isArray(rights.data?.permissions)
          || rights.data.permissions.some(value => typeof value !== 'string')) throw new Error('Phản hồi phiên không hợp lệ.');
        // A different tab can replace the shared cookie between /me and rights.
        // Confirm the same session before publishing a combined identity/rights.
        const confirmed = await client.request('/auth/me');
        if (ticket !== generation || confirmed.data?.user?.appUserId !== me.data.user.appUserId || confirmed.data?.csrfToken !== me.data.csrfToken) throw stale();
        state = Object.freeze({ user: Object.freeze({ ...confirmed.data.user }), csrfToken: confirmed.data.csrfToken, permissions: Object.freeze([...rights.data.permissions]) });
        publish(); return { ...me, data: { ...me.data, user: state.user } };
      } catch (error) { if (ticket === generation) clear(); throw error; }
      finally { if (pending === task) pending = null; }
    });
    pending = task;
    return task;
  }
  async function csrf(expectedActorId) {
    const me = await restore();
    if (expectedActorId && expectedActorId !== me.data.user.appUserId) { clear(); throw new root.SongLamHttp.ApiError('Phiên đã đổi nhân viên. Tải lại màn hình.', { code: 'SESSION_CHANGED', status: 401 }); }
    return me.data.csrfToken;
  }
  async function logout() {
    const token = await csrf();
    await client.request('/auth/logout', { method: 'POST', body: {}, headers: { 'X-CSRF-Token': token } });
    clear(); root.location.assign('login.html');
  }
  root.SongLamSession = Object.freeze({ client, restore, csrf, logout, current: () => state, clear });
}(window));
