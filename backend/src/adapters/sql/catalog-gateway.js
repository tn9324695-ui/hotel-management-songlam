import { AppError } from '../../shared/errors.js';
import { assertActor } from '../../modules/auth/security.js';
import { getCatalogResource } from '../../modules/catalog/resources.js';
import { parseCatalogQuery, parseKey } from '../../modules/catalog/validation.js';
import { invalidSqlResponse } from '../../modules/catalog/dto.js';

const forbidden = new Set(['pms.usp_query', 'pms.usp_readresource', 'pms.usp_executecommand', 'pms.usp_applycommand']);
const notApproved = () => new AppError(503, 'READ_CONTRACT_NOT_APPROVED', 'Chưa có hợp đồng đọc SQL và quyền gọi phù hợp được phê duyệt.');
const unsupported = () => new AppError(501, 'READ_OPERATION_NOT_SUPPORTED', 'Hợp đồng SQL chưa hỗ trợ thao tác đọc hoặc phân trang này.');

export function createCatalogSqlGateway({ pool, types, contract, environment, testOnly = false, timeoutMs = 3000 } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new TypeError('Invalid SQL read timeout.');
  // No approved production manifest is supplied by default. Capabilities are
  // copied, so a caller cannot retarget an approved procedure after construction.
  const manifest = Object.freeze({ ...contract });
  const resourceProcedures=Object.freeze({...contract?.resourceProcedures});
  const capabilities = Object.freeze(Object.fromEntries(Object.entries(contract?.resources || {}).map(([name, value]) => [name, Object.freeze({
    operations: Object.freeze(Array.isArray(value?.operations) ? [...value.operations] : []),
    filters: Object.freeze(Array.isArray(value?.filters) ? [...value.filters] : []),
    pagination: value?.pagination === true, maxLimit: value?.maxLimit
  })])));
  const configured = Boolean(pool && types && manifest.approved === true && typeof manifest.approvalReference === 'string' && manifest.approvalReference.trim()
    && manifest.database === 'SongLamPms_Design' && manifest.environment === environment && Boolean(manifest.testOnly) === testOnly
    && manifest.protocol === 'songlam.catalog.v1' && manifest.actorMode === 'app-user-parameter'
    && /^pms\.[A-Za-z][A-Za-z0-9_]{0,119}$/.test(manifest.procedure) && !forbidden.has(manifest.procedure.toLowerCase()));

  return Object.freeze({
    configured, testOnly,
    capability(resource) {
      const definition=getCatalogResource(resource),cap=capabilities[resource];
      const statusOnly=manifest.roomEligibility==='CURRENT_STATUS_ONLY_V1'&&manifest.roomReadScope==='current-status-only';
      const supported=Boolean(configured&&definition&&cap&&(resource!=='rooms'||statusOnly||manifest.roomEligibility==='ROOM_ELIGIBILITY_V1'));
      return {supported,operations:supported?[...cap.operations]:[],filters:supported?[...cap.filters]:[],
        maxLimit:supported?Math.min(cap.maxLimit||definition.maxLimit,definition.maxLimit):0,
        ...(resource==='rooms'&&statusOnly?{readScope:'CURRENT_STATUS_ONLY',eligibilityVerified:false}:{})};
    },
    async read(actor, { resource, operation, key = null, query, requestId } = {}) {
      assertActor(actor);
      const definition = getCatalogResource(resource);
      if (!definition || !['list', 'detail', 'singleton', 'current'].includes(operation)) throw unsupported();
      if (!definition.permissions.some(permission => actor.permissions.includes(permission))) throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền đọc dữ liệu này.');
      if (!configured) throw notApproved();
      const statusOnly = manifest.roomEligibility === 'CURRENT_STATUS_ONLY_V1' && manifest.roomReadScope === 'current-status-only';
      if (resource === 'rooms' && manifest.roomEligibility !== 'ROOM_ELIGIBILITY_V1' && !statusOnly) throw new AppError(503, 'ROOM_ELIGIBILITY_CONTRACT_MISSING', 'Danh mục phòng chưa phản ánh đủ block, sự cố chặn khai thác và kiểm tra sau bảo trì theo G7.');
      const capability = Object.hasOwn(capabilities, resource) ? capabilities[resource] : null;
      if (!capability?.operations.includes(operation) || (operation === 'list' && !capability.pagination)) throw unsupported();
      if ((operation === 'current' && resource !== 'businessDays') || (operation === 'singleton' && resource !== 'hotelSettings')) throw unsupported();
      if (!query || !Number.isInteger(query.offset) || !Number.isInteger(query.limit) || !query.filters || typeof query.filters !== 'object' || Array.isArray(query.filters)) throw unsupported();
      // Revalidate on the gateway boundary; raw HTTP objects never go to SQL.
      const rawFilters = {};
      for (const [field, value] of Object.entries(query.filters)) {
        if (!['string', 'boolean'].includes(typeof value)) throw unsupported();
        rawFilters[field] = String(value);
      }
      const normalized = parseCatalogQuery(resource, operation === 'list' ? { ...rawFilters, offset: String(query.offset), limit: String(query.limit) } : rawFilters, operation);
      const maximum = capability.maxLimit === undefined ? definition.maxLimit
        : Number.isInteger(capability.maxLimit) && capability.maxLimit > 0 ? Math.min(capability.maxLimit, definition.maxLimit) : 0;
      if (normalized.offset !== query.offset || normalized.limit !== query.limit || normalized.limit > maximum) throw unsupported();
      if (Object.keys(normalized.filters).some(field => !capability.filters.includes(field))) {
        throw new AppError(400, 'READ_FILTER_NOT_SUPPORTED', 'Bộ lọc này chưa được hợp đồng SQL hỗ trợ.');
      }
      const recordKey = operation === 'detail' ? parseKey(resource, key) : null;
      if (!/^[A-Za-z0-9._-]{1,80}$/.test(requestId || '')) throw new AppError(400, 'VALIDATION_ERROR', 'Mã theo dõi yêu cầu không hợp lệ.');
      if (pool.connected !== true) throw new AppError(503, 'SQL_READ_UNAVAILABLE', 'Kết nối đọc SQL chưa sẵn sàng.');

      let request, timer;
      try {
        request = pool.request(); // Never attach actor to a reusable connection.
        request.timeout = timeoutMs;
        request.input('AppUserId', types.BigInt, actor.appUserId);
        request.input('Resource', types.NVarChar(128), definition.sqlResource);
        request.input('Mode', types.VarChar(12), operation);
        request.input('RecordKey', types.NVarChar(40), recordKey);
        request.input('Offset', types.Int, normalized.offset);
        request.input('Limit', types.Int, normalized.limit);
        request.input('FiltersJson', types.NVarChar(types.MAX), JSON.stringify(normalized.filters));
        request.input('RequestId', types.NVarChar(80), requestId);
        const procedure=resourceProcedures[resource]||manifest.procedure;
        if(!/^pms\.[A-Za-z][A-Za-z0-9_]{0,119}$/.test(procedure)||forbidden.has(procedure.toLowerCase()))throw notApproved();
        const result = await Promise.race([request.execute(procedure), new Promise((_, reject) => {
          timer = setTimeout(() => {
            try { request.cancel(); } catch { /* no raw driver error or credentials in logs */ }
            reject(new AppError(504, 'SQL_READ_TIMEOUT', 'Quá thời gian chờ đọc dữ liệu SQL.'));
          }, timeoutMs);
        })]);
        const rows = result?.recordsets?.[0];
        if (!Array.isArray(rows) || rows.length > normalized.limit || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw invalidSqlResponse();
        const metadata = result?.recordsets?.[1];
        if (metadata !== undefined && (!Array.isArray(metadata) || metadata.length > 1)) throw invalidSqlResponse();
        let total = null, hasMore = null;
        if (metadata?.length) {
          const info = metadata[0];
          if (!info || typeof info !== 'object') throw invalidSqlResponse();
          if (info.TotalCount !== undefined && info.TotalCount !== null) {
            if (typeof info.TotalCount === 'number' && !Number.isSafeInteger(info.TotalCount)) throw invalidSqlResponse();
            total = String(info.TotalCount);
            if (!/^\d{1,19}$/.test(total) || BigInt(total) > 9223372036854775807n) throw invalidSqlResponse();
            if ((rows.length && BigInt(total) < BigInt(normalized.offset + rows.length)) || (!rows.length && BigInt(total) > BigInt(normalized.offset))) throw invalidSqlResponse();
            hasMore = BigInt(normalized.offset + rows.length) < BigInt(total);
          }
          if (info.HasMore !== undefined && info.HasMore !== null) {
            if (![true, false, 0, 1].includes(info.HasMore)) throw invalidSqlResponse();
            const supplied = info.HasMore === true || info.HasMore === 1;
            if ((hasMore !== null && hasMore !== supplied) || (supplied && rows.length === 0)) throw invalidSqlResponse();
            hasMore = supplied;
          }
        }
        return { rows, page: { offset: normalized.offset, limit: normalized.limit, returned: rows.length, total, hasMore,
          ...(resource === 'rooms' && statusOnly ? { readScope: 'CURRENT_STATUS_ONLY', eligibilityVerified: false } : {}) } };
      } catch (error) {
        if (error instanceof AppError) throw error;
        const number = error?.number ?? error?.originalError?.info?.number;
        if ([229, 52403].includes(number)) throw new AppError(403, 'SQL_READ_FORBIDDEN', 'SQL Server không cho phép tài khoản hiện tại đọc dữ liệu này.');
        throw new AppError(503, 'SQL_READ_UNAVAILABLE', 'Không thể đọc dữ liệu SQL. Vui lòng thử lại sau.');
      } finally { clearTimeout(timer); }
    }
  });
}
