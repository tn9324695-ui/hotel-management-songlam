import { AppError } from '../../shared/errors.js';
import { canonicalIntent } from '../../modules/bookings/intent.js';
import { requireManagementPermission, managementError } from '../../modules/management/model.js';
import { metrics } from '../../modules/reports/definitions.js';

// Read-only proposed interface. Never calls DDL, generic principal gateways or raw SELECT.
export function createManagementSqlGateway({ pool, types, contract, environment, timeoutMs = 5000, testOnly = false } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new TypeError('Invalid management timeout.');
  const manifest = Object.freeze({ ...contract }), guarantees = Object.freeze({ ...contract?.guarantees });
  const operations = Object.freeze([...(Array.isArray(contract?.operations) ? contract.operations : [])]);
  const approvedMetrics = Object.freeze(Object.fromEntries(Object.entries(contract?.metrics || {}).map(([key, value]) => [key, Object.freeze({ ...value })])));
  const validLimit = (value, max) => Number.isInteger(value) && value > 0 && value <= max;
  const limits = Object.freeze({ maxLimit: validLimit(contract?.limits?.maxLimit, 200) ? contract.limits.maxLimit : 200, maxRangeDays: validLimit(contract?.limits?.maxRangeDays, 366) ? contract.limits.maxRangeDays : 366 });
  const configured = Boolean(pool && types && manifest.approved === true && typeof manifest.approvalReference === 'string' && manifest.approvalReference.trim()
    && manifest.database === 'SongLamPms_Design' && manifest.environment === environment && Boolean(manifest.testOnly) === testOnly
    && manifest.protocol === 'songlam.management.read.v1' && manifest.actorMode === 'app-user-parameter'
    && typeof manifest.procedure === 'string' && /^pms\.[A-Za-z][A-Za-z0-9_]{0,119}$/.test(manifest.procedure)
    && !/^pms\.(usp_Query|usp_ReadResource|usp_ExecuteCommand|usp_ApplyCommand)$/i.test(manifest.procedure)
    && validLimit(contract?.limits?.maxLimit, 200) && validLimit(contract?.limits?.maxRangeDays, 366));
  function supports(resource, operation) {
    if (!configured || !operations.includes(resource + ':' + operation) || guarantees.readOnly !== true || guarantees.actorAndRightsRechecked !== true || guarantees.boundedProjection !== true) return false;
    if (['reports', 'context'].includes(resource) && (guarantees.consistentSnapshot !== true || guarantees.businessClock !== 'G9_CLOCK_V1')) return false;
    if (resource === 'users' && guarantees.noCredentialOrSessionProjection !== true) return false;
    if (resource === 'users' && operation === 'permissions' && guarantees.g2EffectivePermissions !== true) return false;
    if (['roles', 'permissions'].includes(resource) && guarantees.existingRoleModelOnly !== true) return false;
    if (resource === 'audit' && guarantees.sanitizedOutcomeProjection !== true || resource === 'exceptions' && guarantees.scopedExceptionProjection !== true) return false;
    return true;
  }
  function supportsMetric(key) {
    const spec = approvedMetrics[key];
    return configured && spec?.approved === true && typeof spec.reference === 'string' && spec.reference.trim() && spec.dependency === metrics[key]?.dependency;
  }
  async function read(actor, resource, operation, input, requestId) {
    requireManagementPermission(actor, resource, operation);
    if (!supports(resource, operation)) throw managementError('MANAGEMENT_READ_CONTRACT_PENDING', 'Chưa có hợp đồng đọc quản trị/báo cáo được phê duyệt cho chức năng này.', 503);
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(requestId || '')) throw managementError('INVALID_REQUEST_ID', 'Mã theo dõi không hợp lệ.', 400);
    if (input.limit > limits.maxLimit) throw managementError('MANAGEMENT_PAGE_LIMIT', 'Giới hạn trang vượt hợp đồng được duyệt.');
    if (input.from && (Date.parse(input.to + 'T00:00:00Z') - Date.parse(input.from + 'T00:00:00Z')) / 86400000 > limits.maxRangeDays
      || input.fromUtc && (Date.parse(input.toUtc) - Date.parse(input.fromUtc)) / 86400000 > limits.maxRangeDays) throw managementError('MANAGEMENT_PERIOD_LIMIT', 'Kỳ tra cứu vượt giới hạn hợp đồng được duyệt.');
    const json = canonicalIntent(input); if (Buffer.byteLength(json, 'utf16le') > 16384) throw managementError('MANAGEMENT_QUERY_TOO_LARGE', 'Bộ lọc vượt giới hạn cho phép.', 413);
    if (pool.connected !== true) throw managementError('MANAGEMENT_SQL_UNAVAILABLE', 'Pool đọc quản trị chưa sẵn sàng.', 503);
    let request, timer;
    try {
      request = pool.request(); request.timeout = timeoutMs;
      request.input('AppUserId', types.BigInt, actor.appUserId); // Caller identity is never a filter from HTTP.
      request.input('Resource', types.VarChar(20), resource); request.input('Operation', types.VarChar(24), operation);
      request.input('InputJson', types.NVarChar(types.MAX), json); request.input('RequestId', types.NVarChar(80), requestId);
      const result = await Promise.race([request.execute(manifest.procedure), new Promise((_, reject) => {
        timer = setTimeout(() => { try { request.cancel(); } catch {} reject(managementError('MANAGEMENT_SQL_TIMEOUT', 'Quá thời gian đọc dữ liệu; chưa có kết quả báo cáo.', 504)); }, timeoutMs);
      })]);
      const rows = result?.recordsets?.[0];
      if (!Array.isArray(rows) || rows.length !== 1 || typeof rows[0]?.PayloadJson !== 'string' || Buffer.byteLength(rows[0].PayloadJson) > 4194304) throw new Error('Invalid management envelope');
      const payload = JSON.parse(rows[0].PayloadJson); if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid management payload'); return payload;
    } catch (error) {
      if (error instanceof AppError) throw error;
      const number = error?.number ?? error?.originalError?.info?.number;
      if ([229, 52403].includes(number)) throw managementError('MANAGEMENT_SQL_FORBIDDEN', 'SQL từ chối quyền đọc dữ liệu này.', 403);
      throw managementError('MANAGEMENT_SQL_UNAVAILABLE', 'Không tải được dữ liệu quản trị; không thay bằng số liệu mẫu.', 503);
    } finally { clearTimeout(timer); }
  }
  return Object.freeze({ configured, testOnly, limits, supports, supportsMetric, read });
}
