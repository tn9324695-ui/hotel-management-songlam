(function (root) {
  'use strict';
  root.SongLamPricingApi = Object.freeze({ createPricingApi({ client = root.SongLamHttp.getClient(), getCsrfToken = () => root.SongLamSession.csrf() } = {}) {
    return Object.freeze({ async quote(mode, body) {
      if (!['nightly', 'hourly', 'early-departure'].includes(mode)) throw new TypeError('Loại báo giá không hợp lệ.');
      return client.request('/pricing/quotes/' + mode, { method: 'POST', body, headers: { 'X-CSRF-Token': await getCsrfToken() } });
    } });
  } });
}(window));
