(function (root) {
  'use strict';
  const names = new Set(['room-types', 'rooms', 'services', 'customers', 'rate-plans', 'rate-rules', 'policy-versions', 'hotel-settings', 'business-days']);
  root.SongLamCatalogApi = Object.freeze({ createCatalogApi({ client = root.SongLamHttp.getClient() } = {}) {
    const path = (resource, filters) => { if (!names.has(resource)) throw new TypeError('Danh mục không hợp lệ.'); const params = new URLSearchParams(); for (const [key, value] of Object.entries(filters || {})) if (value !== '' && value != null) params.set(key, String(value)); return '/' + resource + (params.size ? '?' + params : ''); };
    return Object.freeze({ capabilities:()=>client.request('/catalog/capabilities'), list: (resource, filters, options) => client.request(path(resource, filters), options), detail: (resource, id, options) => {
      if (!names.has(resource) || !(resource==='business-days'?/^\d{4}-\d{2}-\d{2}$/.test(id):/^[1-9]\d{0,18}$/.test(id))) throw new TypeError('Mã danh mục không hợp lệ.'); return client.request('/' + resource + '/' + id, options);
    } });
  } });
}(window));
