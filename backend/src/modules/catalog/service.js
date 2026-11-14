import { AppError } from '../../shared/errors.js';
import { assertActor } from '../auth/security.js';
import { getCatalogResource, catalogResources } from './resources.js';
import { parseCatalogQuery, parseKey } from './validation.js';
import { invalidSqlResponse, toCatalogDto } from './dto.js';

export function createCatalogService({ gateway }) {
  async function read(actor, resource, operation, rawQuery, rawKey, requestId) {
    assertActor(actor);
    const definition = getCatalogResource(resource);
    if (!definition) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy danh mục.');
    // OR semantics match the SQL read-resource rules; no new rights are granted.
    if (!definition.permissions.some(permission => actor.permissions.includes(permission))) throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền đọc dữ liệu này.');
    const query = parseCatalogQuery(resource, rawQuery, operation);
    const key = operation === 'detail' ? parseKey(resource, rawKey) : null;
    const result = await gateway.read(actor, { resource, operation, query, key, requestId });
    const items = result.rows.map(row => toCatalogDto(resource, row));
    if (operation === 'list') return { data: items, meta: result.page };
    if (!items.length) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy dữ liệu được yêu cầu.');
    if (items.length !== 1) throw invalidSqlResponse();
    const item = items[0];
    if (operation === 'detail' && (resource === 'businessDays' ? item.date : item.id) !== key) throw invalidSqlResponse();
    if (operation === 'singleton' && item.id !== '1') throw invalidSqlResponse();
    return { data: item, ...(resource === 'rooms' && result.page?.readScope === 'CURRENT_STATUS_ONLY'
      ? { meta: { readScope: 'CURRENT_STATUS_ONLY', eligibilityVerified: false } } : {}) };
  }
  return Object.freeze({
    capabilities(actor) {
      assertActor(actor);
      return {readOnly:true,resources:Object.fromEntries(Object.keys(catalogResources)
        .filter(name=>catalogResources[name].permissions.some(p=>actor.permissions.includes(p)))
        .map(name=>[name,typeof gateway.capability==='function'?gateway.capability(name):{supported:false,operations:[],filters:[],maxLimit:0}]))};
    },
    list: (actor, resource, query, requestId) => read(actor, resource, 'list', query, null, requestId),
    detail: (actor, resource, key, query, requestId) => read(actor, resource, 'detail', query, key, requestId),
    hotelSettings: (actor, query, requestId) => read(actor, 'hotelSettings', 'singleton', query, null, requestId),
    currentBusinessDay: (actor, query, requestId) => read(actor, 'businessDays', 'current', query, null, requestId)
  });
}
