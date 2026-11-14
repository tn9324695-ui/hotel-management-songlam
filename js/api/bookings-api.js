(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./http-client.js'));
  else root.SongLamBookingsApi = factory(root.SongLamHttp);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Http) {
  'use strict';
  function id(value) {
    if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) throw new TypeError('ID đặt phòng không hợp lệ.');
    return encodeURIComponent(value);
  }
  function queryString(values, allowed) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new TypeError('Bộ lọc không hợp lệ.');
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (!allowed.includes(key)) throw new TypeError('Bộ lọc chưa được hỗ trợ.');
      if (value === undefined || value === null) continue;
      if (!['string', 'number'].includes(typeof value) || typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) throw new TypeError('Giá trị bộ lọc không hợp lệ.');
      query.set(key, String(value));
    }
    return query.size ? '?' + query.toString() : '';
  }
  function createBookingsApi({ client = Http?.getClient(), getCsrfToken } = {}) {
    if (!client || typeof client.request !== 'function') throw new TypeError('Cần SongLamHttp client.');
    const get = (path, options = {}) => client.request(path, { signal: options.signal });
    async function write(path, method, body, { idempotencyKey, signal } = {}) {
      // Caller must retain the SAME key after timeout/network error. This client
      // neither retries nor creates a fresh key for each attempted submission.
      if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{1,120}$/.test(idempotencyKey)) throw new TypeError('Cần Idempotency-Key ổn định cho thao tác ghi.');
      const csrf = typeof getCsrfToken === 'function' ? await getCsrfToken() : null;
      if (typeof csrf !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(csrf)) throw new TypeError('Chưa có phiên/mã CSRF hợp lệ.');
      return client.request(path, { method, body, signal, headers: { 'Idempotency-Key': idempotencyKey, 'X-CSRF-Token': csrf } });
    }
    return Object.freeze({
      listBookings: (query = {}, options) => get('/bookings' + queryString(query, ['from', 'to', 'status', 'customerId', 'code', 'offset', 'limit']), options),
      getBooking: (bookingId, options) => get('/bookings/' + id(bookingId), options),
      checkAvailability: (query, options) => get('/bookings/availability' + queryString(query, ['roomTypeId', 'from', 'to', 'checkInAt', 'checkOutAt']), options),
      getTimeline: (query, options) => get('/bookings/timeline' + queryString(query, ['roomTypeId', 'roomId', 'from', 'to', 'offset', 'limit']), options),
      createBooking: (body, options) => write('/bookings', 'POST', body, options),
      createGroupBooking: (body, options) => write('/bookings/groups', 'POST', body, options),
      assignRoom: (bookingId, bookingRoomId, body, options) => write('/bookings/' + id(bookingId) + '/rooms/' + id(bookingRoomId) + '/assignment', 'PUT', body, options),
      cancelBooking: (bookingId, body, options) => write('/bookings/' + id(bookingId) + '/cancel', 'POST', body, options),
      cancelRooms: (bookingId, body, options) => write('/bookings/' + id(bookingId) + '/rooms/cancel', 'POST', body, options)
    });
  }
  // No DOM handlers, localStorage, SongLamStore, tokens, optimistic success or
  // multi-command splitting. Loading this module does not call any API.
  return Object.freeze({ createBookingsApi });
}));
