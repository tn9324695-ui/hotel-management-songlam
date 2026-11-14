import { AppError } from '../../shared/errors.js';
import { canonicalIntent } from '../../modules/bookings/intent.js';
import { consumptionError } from '../../modules/services/amounts.js';
import { requireConsumptionPermission } from '../../modules/services/permissions.js';
import { maximumConsumptionLines } from '../../modules/services/validation.js';

// Interface proposal only. No implicit pool, procedure name, driver install or SQL writes at startup.
export function createConsumptionSqlGateway({ pool, types, contract, environment, testOnly = false, timeoutMs = 5000 } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new TypeError('Invalid consumption timeout.');
  const manifest = Object.freeze({ ...contract }), guarantees = Object.freeze({ ...contract?.guarantees }), procedures = Object.freeze({ ...contract?.procedures });
  const operations = Object.freeze([...(Array.isArray(contract?.operations) ? contract.operations : [])]);
  const approvedLimit = (value, max) => Number.isInteger(value) && value >= 1 && value <= max;
  const limits = Object.freeze({ maxLines: approvedLimit(contract?.limits?.maxLines, maximumConsumptionLines) ? contract.limits.maxLines : maximumConsumptionLines,
    maxLimit: approvedLimit(contract?.limits?.maxLimit, 200) ? contract.limits.maxLimit : 200 });
  const configured = Boolean(pool && types && manifest.approved === true && typeof manifest.approvalReference === 'string' && manifest.approvalReference.trim()
    && manifest.database === 'SongLamPms_Design' && manifest.environment === environment && Boolean(manifest.testOnly) === testOnly
    && manifest.protocol === 'songlam.consumption.v1' && manifest.actorMode === 'app-user-parameter'
    && approvedLimit(contract?.limits?.maxLines, maximumConsumptionLines) && approvedLimit(contract?.limits?.maxLimit, 200));
  const procedureAllowed = phase => typeof procedures[phase] === 'string' && /^pms\.[A-Za-z][A-Za-z0-9_]{0,119}$/.test(procedures[phase])
    && !/^pms\.(usp_Query|usp_ReadResource|usp_ExecuteCommand|usp_ApplyCommand)$/i.test(procedures[phase]);
  const writing = operation => ['create', 'deliver', 'cancel', 'confirm', 'dispute'].includes(operation);
  function supports(resource, operation) {
    if (!configured || !['orders', 'audits'].includes(resource) || !operations.includes(resource + ':' + operation)
      || !procedureAllowed(writing(operation) ? 'command' : 'read') || guarantees.actorAndRightsRechecked !== true
      || guarantees.minimalFolioProjection !== true || guarantees.sourceProjection !== 'CONSUMPTION_V1') return false;
    if (!writing(operation)) return true;
    if (['atomicSourceAndLedger', 'optimisticVersions', 'stayAndFolioRechecked', 'catalogVersionsAtCreate', 'immutablePriceSnapshot',
      'sourceLineUniqueCharge', 'auditActorAndReceiptAtomic', 'noCashOrCheckout', 'boundedAtomicLines', 'serverClock', 'openBusinessDay'].some(name => guarantees[name] !== true)
      || guarantees.inventoryLock !== 'SongLam:Inventory' || guarantees.idempotency !== 'ACTOR_RESOURCE_OPERATION_INTENT_SHA256'
      || guarantees.rounding !== 'SQL_ROUND_POSITIVE_HALF_UP_0' || guarantees.zeroAmountHandling !== 'SOURCE_LINE_NO_LEDGER_V1') return false;
    if (resource === 'audits' && ['segmentProvenanceRechecked', 'minibarCategoryOnly', 'persistedAuditPrices', 'oneChargePerConsumption', 'inspectionCoverageAndLock'].some(name => guarantees[name] !== true)) return false;
    if (operation === 'cancel' && (guarantees.linkedFullCredit !== true || guarantees.noIndependentMinibarCancellation !== true || guarantees.openCancellationNoCharge !== true)) return false;
    return true;
  }
  async function call(actor, resource, operation, input, requestId, command) {
    requireConsumptionPermission(actor, resource, operation);
    if (Boolean(command) !== writing(operation) || !writing(operation) && !['catalog', 'context', 'list', 'detail'].includes(operation)) throw consumptionError('CONSUMPTION_OPERATION_NOT_SUPPORTED', 'Hợp đồng không cho gọi thao tác này theo kiểu đọc/ghi đã yêu cầu.', 501);
    if (!supports(resource, operation)) throw consumptionError('CONSUMPTION_CONTRACT_NOT_APPROVED', 'Chưa có hợp đồng SQL/folio được phê duyệt cho thao tác G8 này.', 503);
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(requestId || '')) throw consumptionError('INVALID_REQUEST_ID', 'Mã theo dõi không hợp lệ.', 400);
    if (input.limit > limits.maxLimit || input.lines?.length > limits.maxLines) throw consumptionError('CONSUMPTION_BATCH_LIMIT_EXCEEDED', 'Yêu cầu vượt giới hạn hợp đồng SQL; không tự chia lô.');
    const json = canonicalIntent(input);
    if (Buffer.byteLength(json, 'utf16le') > 32768) throw consumptionError('CONSUMPTION_INPUT_TOO_LARGE', 'Yêu cầu vượt giới hạn 32768 byte UTF-16 của hợp đồng G8.', 413);
    if (pool.connected !== true) throw consumptionError('CONSUMPTION_SQL_UNAVAILABLE', 'Pool SQL dịch vụ/minibar chưa sẵn sàng.', 503);
    let request, timer;
    try {
      request = pool.request(); request.timeout = timeoutMs;
      request.input('AppUserId', types.BigInt, actor.appUserId);
      request.input('Resource', types.VarChar(16), resource);
      request.input('Operation', types.VarChar(16), operation);
      request.input('InputJson', types.NVarChar(types.MAX), json);
      request.input('RequestId', types.NVarChar(80), requestId);
      if (command) { request.input('IdempotencyKey', types.VarChar(120), command.key); request.input('IntentHash', types.VarChar(64), command.digest); }
      const result = await Promise.race([request.execute(procedures[command ? 'command' : 'read']), new Promise((_, reject) => {
        timer = setTimeout(() => { try { request.cancel(); } catch {} reject(consumptionError(command ? 'CONSUMPTION_OUTCOME_UNKNOWN' : 'CONSUMPTION_SQL_TIMEOUT',
          command ? 'Chưa rõ kết quả ghi phí. Giữ nguyên nội dung và Idempotency-Key để đối chiếu.' : 'Quá thời gian đọc dịch vụ/minibar.', 504)); }, timeoutMs);
      })]);
      const rows = result?.recordsets?.[0];
      if (!Array.isArray(rows) || rows.length !== 1 || typeof rows[0]?.PayloadJson !== 'string' || Buffer.byteLength(rows[0].PayloadJson) > 2097152) throw new Error('Invalid consumption envelope');
      const payload = JSON.parse(rows[0].PayloadJson);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid consumption payload');
      return payload;
    } catch (error) {
      if (error instanceof AppError) throw error;
      const number = error?.number ?? error?.originalError?.info?.number;
      if ([229, 52403].includes(number)) throw consumptionError('CONSUMPTION_SQL_FORBIDDEN', 'SQL từ chối quyền dịch vụ/minibar.', 403);
      if (number === 52404) throw consumptionError('IDEMPOTENCY_CONFLICT', 'Khóa gửi lặp đã gắn với nội dung khác.', 409);
      if ([2601, 2627, 52412, 52417, 52418, 52420, 52114, 52115, 52116, 52117, 52118, 52119].includes(number)) throw consumptionError('CONSUMPTION_CONFLICT', 'Xung đột phiên bản, lượt ở/segment, giá, phí đã ghi hoặc credit. Không gửi yêu cầu mới trước khi đối chiếu.', 409);
      throw consumptionError(command ? 'CONSUMPTION_OUTCOME_UNKNOWN' : 'CONSUMPTION_SQL_UNAVAILABLE', command
        ? 'Chưa xác định kết quả SQL. Không tạo lại phí bằng khóa mới; giữ nguyên khóa để đối chiếu.' : 'Không đọc được dữ liệu dịch vụ/minibar.', 503);
    } finally { clearTimeout(timer); }
  }
  return Object.freeze({ configured, testOnly, limits, supports,
    read: (actor, resource, operation, input, requestId) => call(actor, resource, operation, input, requestId),
    execute: (actor, resource, operation, input, digest, key, requestId) => call(actor, resource, operation, input, requestId, { digest, key }) });
}
