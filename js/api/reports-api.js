(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./http-client.js'));
  else root.SongLamReportsApi = factory(root.SongLamHttp);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Http) {
  'use strict';
  function query(filters = {}, fields) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (!fields.includes(key)) throw new TypeError('Bộ lọc báo cáo chưa hỗ trợ.');
      if (value === '' || value == null) continue;
      if (!['string', 'number'].includes(typeof value)) throw new TypeError('Bộ lọc báo cáo không hợp lệ.'); params.set(key, String(value));
    } return params.size ? '?' + params.toString() : '';
  }
  function createReportsApi({ client = Http?.getClient() } = {}) {
    if (!client?.request) throw new TypeError('Cần HTTP client dùng chung.');
    return Object.freeze({
      context: options => client.request('/reports/context', options), capabilities: options => client.request('/reports/capabilities', options),
      definitions: (report, options) => client.request('/reports/definitions' + query({ report }, ['report']), options),
      read: (report, filters, options) => {
        if (!['dashboard', 'cash-flow', 'revenue', 'receivables'].includes(report)) throw new TypeError('Báo cáo chưa hỗ trợ.');
        return client.request('/reports/' + report + query(filters, ['from', 'to', 'timeZone', 'bookingId', 'folioKind', 'offset', 'limit']), options);
      }
    });
  }
  return Object.freeze({ createReportsApi });
}));
