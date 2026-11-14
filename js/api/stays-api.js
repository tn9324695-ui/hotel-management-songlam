(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./http-client.js'));
  else root.SongLamStaysApi = factory(root.SongLamHttp);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Http) {
  'use strict';
  function id(value) {
    if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) throw new TypeError('ID lưu trú không hợp lệ.');
    return encodeURIComponent(value);
  }
  function query(values, fields) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new TypeError('Bộ lọc lưu trú không hợp lệ.');
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (!fields.includes(key)) throw new TypeError('Bộ lọc chưa hỗ trợ.');
      if (value === undefined || value === null) continue;
      if (!['string', 'number'].includes(typeof value) || typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) throw new TypeError('Giá trị bộ lọc không hợp lệ.');
      params.set(key, String(value));
    }
    return params.size ? '?' + params.toString() : '';
  }
  function createStaysApi({ client = Http?.getClient(), getCsrfToken } = {}) {
    if (!client || typeof client.request !== 'function') throw new TypeError('Cần HTTP client hiện có.');
    const get = (path, options = {}) => client.request(path, { signal: options.signal });
    async function post(path, body, { idempotencyKey, signal } = {}) {
      if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{1,120}$/.test(idempotencyKey)) throw new TypeError('Cần Idempotency-Key ổn định.');
      const csrf = typeof getCsrfToken === 'function' ? await getCsrfToken() : null;
      if (typeof csrf !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(csrf)) throw new TypeError('Chưa có phiên/CSRF hợp lệ.');
      return client.request(path, { method: 'POST', body, signal, headers: { 'Idempotency-Key': idempotencyKey, 'X-CSRF-Token': csrf } });
    }
    return Object.freeze({
      listStays: (filters = {}, options) => get('/stays' + query(filters, ['status', 'bookingId', 'roomId', 'from', 'to', 'offset', 'limit']), options),
      getStay: (stayId, options) => get('/stays/' + id(stayId), options),
      getArrivals: (filters, options) => get('/stays/arrivals' + query(filters, ['date', 'bookingId', 'offset', 'limit']), options),
      getRoomReadiness: (filters, options) => get('/stays/room-readiness' + query(filters, ['bookingRoomId', 'stayId', 'roomId']), options),
      async previewPriceChange(stayId, body, { signal } = {}) {
        const csrf = typeof getCsrfToken === 'function' ? await getCsrfToken() : null;
        if (typeof csrf !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(csrf)) throw new TypeError('Chưa có phiên/CSRF hợp lệ.');
        return client.request('/stays/' + id(stayId) + '/price-change-preview', { method: 'POST', body, signal, headers: { 'X-CSRF-Token': csrf } });
      },
      checkIn: (body, options) => post('/stays/check-in', body, options),
      transferRoom: (stayId, body, options) => post('/stays/' + id(stayId) + '/transfer-room', body, options),
      extend: (stayId, body, options) => post('/stays/' + id(stayId) + '/extend', body, options),
      shorten: (stayId, body, options) => post('/stays/' + id(stayId) + '/shorten', body, options)
    });
  }
  // No UI, localStorage, SongLamStore, optimistic success, retries or batch splits.
  return Object.freeze({ createStaysApi });
}));
