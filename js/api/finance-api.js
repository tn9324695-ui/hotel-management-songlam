(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./http-client.js'));
  else root.SongLamFinanceApi = factory(root.SongLamHttp);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Http) {
  'use strict';
  const paths = Object.freeze({ folios: '/folios', deposits: '/deposit-accounts', payments: '/payments', refunds: '/refunds', checkouts: '/checkouts', invoices: '/invoices', cashier: '/cashier/shifts', days: '/finance/business-days' });
  const commands = Object.freeze({ folios: ['transfer', 'credit', 'close'], deposits: ['apply', 'unapply', 'allocate'], payments: ['create', 'cancel'],
    refunds: ['create', 'decide', 'complete'], checkouts: ['complete'], invoices: ['create', 'issue'], cashier: ['open', 'close'], days: ['close'] });
  function id(resource, value) {
    if (typeof value !== 'string' || !(resource === 'days' ? /^\d{4}-\d{2}-\d{2}$/ : /^[1-9]\d{0,18}$/).test(value)) throw new TypeError('Mã đối tượng/ngày kinh doanh không hợp lệ.');
    return encodeURIComponent(value);
  }
  function query(values = {}) {
    const result = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (!['offset', 'limit', 'bookingId', 'stayId', 'shiftId', 'businessDate', 'status', 'operation', 'id', 'paymentId', 'sourceType', 'sourceId'].includes(key)) throw new TypeError('Bộ lọc tài chính chưa hỗ trợ.');
      if (value === '' || value == null) continue;
      if (!['string', 'number'].includes(typeof value)) throw new TypeError('Bộ lọc không hợp lệ.'); result.set(key, String(value));
    }
    return result.size ? '?' + result.toString() : '';
  }
  function createFinanceApi({ client = Http?.getClient(), getCsrfToken } = {}) {
    if (!client?.request) throw new TypeError('Cần HTTP client dùng chung.');
    async function post(url, body, options = {}, readOnly = false) {
      const headers = {};
      if (!readOnly) {
        if (typeof options.idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{1,120}$/.test(options.idempotencyKey)) throw new TypeError('Cần giữ nguyên khóa gửi lặp khi chưa rõ commit.');
        headers['Idempotency-Key'] = options.idempotencyKey;
      }
      const csrf = typeof getCsrfToken === 'function' ? await getCsrfToken() : null;
      if (typeof csrf !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(csrf)) throw new TypeError('Chưa có phiên/CSRF hợp lệ.'); headers['X-CSRF-Token'] = csrf;
      return client.request(url, { method: 'POST', body, headers, signal: options.signal });
    }
    const scoped = resource => {
      if (!Object.hasOwn(paths, resource)) throw new TypeError('Module tài chính không hợp lệ.'); const path = paths[resource];
      return Object.freeze({
        capabilities: options => client.request(path + '/capabilities', options),
        list: (filters = {}, options) => client.request(path + query(filters), options),
        detail: (value, options) => client.request(path + '/' + id(resource, value), options),
        context: (filters, options) => client.request(path + '/context' + query(filters), options),
        entries: (value, filters = {}, options) => {
          if (!['folios', 'deposits'].includes(resource)) throw new TypeError('Module không có sổ chi tiết này.');
          return client.request(path + '/' + id(resource, value) + (resource === 'folios' ? '/entries' : '/movements') + query(filters), options);
        },
        preview: (value, body, options) => {
          if (!['checkouts', 'cashier', 'days'].includes(resource)) throw new TypeError('Module không có preview quyết toán.');
          return post(path + '/' + id(resource, value) + '/preview', body, options, true);
        },
        command: (operation, value, body, options) => {
          if (!commands[resource].includes(operation)) throw new TypeError('Thao tác tài chính chưa hỗ trợ.');
          return post(path + (['create', 'open'].includes(operation) ? '' : '/' + id(resource, value) + '/' + operation), body, options);
        }
      });
    };
    return Object.freeze(Object.fromEntries(Object.keys(paths).map(resource => [resource, scoped(resource)])));
  }
  // No balance cache, localStorage, payment simulation, new keys or automatic retries.
  return Object.freeze({ createFinanceApi });
}));
