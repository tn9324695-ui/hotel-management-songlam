(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./services-api.js'));
  else root.SongLamMinibarApi = factory(root.SongLamServicesApi);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Services) {
  'use strict';
  function createMinibarApi(options = {}) {
    const api = Services.createConsumptionApi({ ...options, resource: 'audits' });
    return Object.freeze({ ...api, listAudits: api.list, getAudit: api.detail, createAudit: api.create,
      confirmAudit: (id, body, options) => api.perform(id, 'confirm', body, options), disputeAudit: (id, body, options) => api.perform(id, 'dispute', body, options) });
  }
  return Object.freeze({ createMinibarApi });
}));
