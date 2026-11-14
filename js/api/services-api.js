(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./http-client.js'));
  else root.SongLamServicesApi = factory(root.SongLamHttp);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Http) {
  'use strict';
  function id(value) {
    if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) throw new TypeError('ID không hợp lệ.');
    return encodeURIComponent(value);
  }
  function query(values) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new TypeError('Bộ lọc không hợp lệ.');
    const params = new URLSearchParams();
    for (const [field, value] of Object.entries(values)) {
      if (!['stayId', 'roomSegmentId', 'status', 'q', 'offset', 'limit'].includes(field)) throw new TypeError('Bộ lọc chưa hỗ trợ.');
      if (value === undefined || value === null || value === '') continue;
      if (!['string', 'number'].includes(typeof value)) throw new TypeError('Bộ lọc không hợp lệ.');
      params.set(field, String(value));
    }
    return params.size ? '?' + params.toString() : '';
  }
  function createConsumptionApi({ resource = 'orders', client = Http?.getClient(), getCsrfToken } = {}) {
    if (!['orders', 'audits'].includes(resource) || !client?.request) throw new TypeError('Cần module G8 và HTTP client hợp lệ.');
    const prefix = resource === 'orders' ? '/service-orders' : '/minibar-audits';
    async function write(path, body, { idempotencyKey, signal } = {}) {
      if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{1,120}$/.test(idempotencyKey)) throw new TypeError('Cần giữ nguyên khóa gửi lặp theo yêu cầu.');
      const token = typeof getCsrfToken === 'function' ? await getCsrfToken() : null;
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new TypeError('Chưa có phiên/CSRF hợp lệ.');
      return client.request(path, { method: 'POST', body, signal, headers: { 'Idempotency-Key': idempotencyKey, 'X-CSRF-Token': token } });
    }
    return Object.freeze({
      capabilities: options => client.request(prefix + '/capabilities', options),
      list: (filters = {}, options) => client.request(prefix + query(filters), options),
      detail: (recordId, options) => client.request(prefix + '/' + id(recordId), options),
      catalog: (filters = {}, options) => client.request(prefix + '/catalog' + query(filters), options),
      context: (filters, options) => client.request(prefix + '/context' + query(filters), options),
      create: (body, options) => write(prefix, body, options),
      perform: (recordId, operation, body, options) => {
        if (!(resource === 'orders' ? ['deliver', 'cancel'] : ['confirm', 'dispute']).includes(operation)) throw new TypeError('Thao tác chưa hỗ trợ.');
        return write(prefix + '/' + id(recordId) + '/' + operation, body, options);
      }
    });
  }
  function createServicesApi(options = {}) {
    const api = createConsumptionApi({ ...options, resource: 'orders' });
    return Object.freeze({ ...api, listOrders: api.list, getOrder: api.detail, createOrder: api.create,
      deliverOrder: (id, body, options) => api.perform(id, 'deliver', body, options), cancelOrder: (id, body, options) => api.perform(id, 'cancel', body, options) });
  }
  // No localStorage, retries, simulated success or browser price calculation.
  return Object.freeze({ createConsumptionApi, createServicesApi });
}));
