(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./http-client.js'));
  else root.SongLamAdministrationApi = factory(root.SongLamHttp);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Http) {
  'use strict';
  const resources = ['users', 'roles', 'permissions', 'audit', 'exceptions'];
  function id(value) { if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value)) throw new TypeError('Mã đối tượng không hợp lệ.'); return encodeURIComponent(value); }
  function query(values = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (!['q', 'active', 'roleCode', 'offset', 'limit', 'fromUtc', 'toUtc', 'timeZone', 'performedBy', 'action', 'entityType', 'entityKey', 'result', 'reference', 'status', 'kind'].includes(key)) throw new TypeError('Bộ lọc quản trị chưa hỗ trợ.');
      if (value === '' || value == null) continue; if (!['string', 'number', 'boolean'].includes(typeof value)) throw new TypeError('Bộ lọc không hợp lệ.'); params.set(key, String(value));
    } return params.size ? '?' + params.toString() : '';
  }
  function createAdministrationApi({ client = Http?.getClient() } = {}) {
    if (!client?.request) throw new TypeError('Cần HTTP client dùng chung.');
    const path = resource => { if (!resources.includes(resource)) throw new TypeError('Module quản trị không hợp lệ.'); return '/' + resource; };
    return Object.freeze({
      profile: options => client.request('/admin/profile', options),
      capabilities: (resource, options) => client.request(path(resource) + '/capabilities', options),
      list: (resource, filters = {}, options) => client.request(path(resource) + query(filters), options),
      detail: (resource, value, options) => client.request(path(resource) + '/' + id(value), options),
      userRoles: (value, filters, options) => client.request('/users/' + id(value) + '/roles' + query(filters), options),
      userPermissions: (value, filters, options) => client.request('/users/' + id(value) + '/permissions' + query(filters), options),
      rolePermissions: (value, filters, options) => client.request('/roles/' + id(value) + '/permissions' + query(filters), options),
      observations: (filters, options) => client.request('/exceptions/observations' + query(filters), options)
    });
  }
  // G10 never sends mutations, role/actor headers or cached session information.
  return Object.freeze({ createAdministrationApi });
}));
