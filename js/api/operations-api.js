(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./http-client.js'));
  else root.SongLamOperationsApi = factory(root.SongLamHttp);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Http) {
  'use strict';
  const paths = Object.freeze({ tasks: '/housekeeping/tasks', rooms: '/housekeeping/rooms', tickets: '/maintenance/tickets', blocks: '/maintenance/room-blocks', items: '/lost-found' });
  const actions = Object.freeze({ tasks: ['claim', 'assign', 'start', 'submit', 'unable', 'resume', 'inspect-approve', 'inspect-reject'],
    rooms: ['mark-dirty'], tickets: ['claim', 'assign', 'start', 'progress', 'resolve'], blocks: ['cancel', 'end'], items: ['handoff', 'return'] });
  function path(resource) { if (!Object.hasOwn(paths, resource)) throw new TypeError('Module vận hành không hợp lệ.'); return paths[resource]; }
  function id(value) {
    if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) throw new TypeError('ID không hợp lệ.');
    return encodeURIComponent(value);
  }
  function query(filters) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters || {})) {
      if (!['roomId', 'status', 'mine', 'priority', 'state', 'cleanlinessStatus', 'occupancyStatus', 'exploitationStatus', 'offset', 'limit'].includes(key)) throw new TypeError('Bộ lọc chưa hỗ trợ.');
      if (value === undefined || value === null || value === '') continue;
      if (!['string', 'number', 'boolean'].includes(typeof value)) throw new TypeError('Bộ lọc không hợp lệ.');
      params.set(key, String(value));
    }
    return params.size ? '?' + params.toString() : '';
  }
  function createOperationsApi({ client = Http?.getClient(), getCsrfToken } = {}) {
    if (!client || typeof client.request !== 'function') throw new TypeError('Cần HTTP client dùng chung.');
    async function post(url, body, { idempotencyKey, signal } = {}) {
      if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{1,120}$/.test(idempotencyKey)) throw new TypeError('Cần khóa chống gửi lặp ổn định.');
      const csrf = typeof getCsrfToken === 'function' ? await getCsrfToken() : null;
      if (typeof csrf !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(csrf)) throw new TypeError('Chưa có phiên/CSRF hợp lệ.');
      return client.request(url, { method: 'POST', body, signal, headers: { 'Idempotency-Key': idempotencyKey, 'X-CSRF-Token': csrf } });
    }
    return Object.freeze({
      capabilities: options => client.request('/operations/capabilities', options),
      list: (resource, filters, options) => client.request(path(resource) + query(filters), options),
      detail: (resource, recordId, options) => client.request(path(resource) + '/' + id(recordId), options),
      history: (resource, recordId, filters, options) => client.request(path(resource) + '/' + id(recordId) + '/history' + query(filters), options),
      create: (resource, body, options) => {
        if (resource === 'rooms') throw new TypeError('G7 không tạo phòng.');
        return post(path(resource), body, options);
      },
      perform: (resource, recordId, action, body, options) => {
        if (!Object.hasOwn(actions, resource) || !actions[resource].includes(action)) throw new TypeError('Thao tác chưa hỗ trợ.');
        return post(path(resource) + '/' + id(recordId) + '/' + action, body, options);
      }
    });
  }
  // No localStorage, fallback demo, optimistic success or automatic retries.
  return Object.freeze({ createOperationsApi });
}));
