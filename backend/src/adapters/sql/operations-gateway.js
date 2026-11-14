import { AppError } from '../../shared/errors.js';
import { canonicalIntent } from '../../modules/bookings/intent.js';
import { resources } from '../../modules/operations/model.js';
import { requireOperationPermission } from '../../modules/operations/service.js';
import { operationError } from '../../modules/operations/validation.js';

// Proposed RPC contract, NOT the existing principal-bound generic SQL gateway.
// No default procedure names and no automatic SQL connection or DDL.
export function createOperationsSqlGateway({ pool, types, contract, environment, timeoutMs = 5000, testOnly = false } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new TypeError('Invalid operations timeout.');
  const manifest = Object.freeze({ ...contract }), procedures = Object.freeze({ ...contract?.procedures }), guarantees = Object.freeze({ ...contract?.guarantees });
  const operations = Object.freeze([...(Array.isArray(contract?.operations) ? contract.operations : [])]);
  const inspectionAuthorization = Object.freeze({ ...contract?.inspectionAuthorization });
  const maxLimit = contract?.limits?.maxLimit;
  const configured = Boolean(pool && types && manifest.approved === true && typeof manifest.approvalReference === 'string' && manifest.approvalReference.trim()
    && manifest.database === 'SongLamPms_Design' && manifest.environment === environment && Boolean(manifest.testOnly) === testOnly
    && manifest.protocol === 'songlam.operations.v1' && manifest.actorMode === 'app-user-parameter');
  const safeProcedure = phase => typeof procedures[phase] === 'string' && /^pms\.[A-Za-z][A-Za-z0-9_]{0,119}$/.test(procedures[phase])
    && !/^pms\.(?:usp_Query|usp_ReadResource|usp_ExecuteCommand|usp_ApplyCommand)$/i.test(procedures[phase]);
  function supports(resource, action) {
    const write = action !== 'read';
    if (!configured || !Object.hasOwn(resources, resource) || !operations.includes(resource + ':' + action)
      || !safeProcedure(write ? 'command' : 'read') || guarantees.actorAndRightsRechecked !== true
      || guarantees.historyProjection !== 'OPERATIONS_EVENTS_V1' || guarantees.roomEligibility !== 'ROOM_ELIGIBILITY_V1') return false;
    if (!write) return Number.isInteger(maxLimit) && maxLimit >= 1 && maxLimit <= 200;
    if (['atomicCommand', 'compareAndSwap', 'ownershipAndTransitionsRechecked', 'auditAndHistoryAtomic', 'noCashOrStayWrites', 'serverClock', 'noAutoCleanAfterRepair'].some(name => guarantees[name] !== true)
      || guarantees.idempotency !== 'ACTOR_OPERATION_INTENT_SHA256') return false;
    if (['blocks', 'tickets', 'rooms', 'tasks'].includes(resource)
      && (guarantees.inventoryLock !== 'SongLam:Inventory' || guarantees.inventoryConflictsRechecked !== true
        || guarantees.postRepairInspectionHold !== true || guarantees.housekeepingFollowupAtomic !== true)) return false;
    if (resource === 'tasks' && (guarantees.taskAndRoomAtomic !== true || guarantees.oneActiveCleaningTask !== true)) return false;
    if (resource === 'items' && (guarantees.custodyEventsAtomic !== true || guarantees.lostFoundCas !== 'ROW_AND_LATEST_CUSTODY_TOKEN_V1')) return false;
    if (action.startsWith('inspect-') && !(inspectionAuthorization.approved === true && inspectionAuthorization.reference?.trim()
      && inspectionAuthorization.permissionCode?.trim() && guarantees.independentInspection === true)) return false;
    return true;
  }
  async function call(actor, resource, action, input, requestId, command) {
    requireOperationPermission(actor, resource, command ? action : 'read', inspectionAuthorization);
    if (!supports(resource, command ? action : 'read')) throw operationError('OPERATIONS_CONTRACT_NOT_APPROVED', 'Chưa có hợp đồng SQL/quyền được phê duyệt cho chức năng G7 này.', 503);
    if (!command && (!['list', 'detail', 'history'].includes(action) || action !== 'detail' && (!Number.isInteger(input.limit) || input.limit > maxLimit))) throw operationError('OPERATIONS_READ_NOT_SUPPORTED', 'Kiểu đọc hoặc giới hạn trang vượt hợp đồng SQL được duyệt.', 422);
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(requestId || '')) throw operationError('INVALID_REQUEST_ID', 'Mã theo dõi không hợp lệ.', 400);
    if (Buffer.byteLength(canonicalIntent(input), 'utf16le') > 16000) throw operationError('OPERATIONS_INPUT_TOO_LARGE', 'Yêu cầu vượt giới hạn một thao tác; không tự chia lô.', 413);
    if (pool.connected !== true) throw operationError('OPERATIONS_SQL_UNAVAILABLE', 'Pool SQL vận hành chưa sẵn sàng.', 503);
    let request, timer;
    try {
      request = pool.request(); request.timeout = timeoutMs;
      // Explicit actor parameter on each RPC. Never set connection-scoped identity.
      request.input('AppUserId', types.BigInt, actor.appUserId);
      request.input('Resource', types.VarChar(16), resource);
      request.input('Operation', types.VarChar(32), action);
      request.input('InputJson', types.NVarChar(types.MAX), canonicalIntent(input));
      request.input('RequestId', types.NVarChar(80), requestId);
      if (command) {
        request.input('IntentHash', types.VarChar(64), command.digest);
        request.input('IdempotencyKey', types.VarChar(120), command.key);
      }
      const result = await Promise.race([request.execute(procedures[command ? 'command' : 'read']), new Promise((_, reject) => {
        timer = setTimeout(() => { try { request.cancel(); } catch {} reject(operationError(command ? 'OPERATIONS_OUTCOME_UNKNOWN' : 'OPERATIONS_SQL_TIMEOUT',
          command ? 'Chưa xác định kết quả ghi. Giữ nguyên yêu cầu và Idempotency-Key để đối chiếu/gửi lại.' : 'Quá thời gian đọc dữ liệu vận hành.', 504)); }, timeoutMs);
      })]);
      const rows = result?.recordsets?.[0];
      if (!Array.isArray(rows) || rows.length !== 1 || typeof rows[0]?.PayloadJson !== 'string' || Buffer.byteLength(rows[0].PayloadJson) > 2097152) throw new Error('Invalid RPC envelope');
      const payload = JSON.parse(rows[0].PayloadJson);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid RPC payload');
      return payload;
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('OPERATIONS RPC ERROR:', error?.number, error?.message, error?.originalError?.info);
      const number = error?.number ?? error?.originalError?.info?.number;
      if ([229, 52403].includes(number)) throw operationError('OPERATIONS_SQL_FORBIDDEN', 'SQL từ chối quyền thao tác.', 403);
      // New RPC must use these existing conflict/error numbers, as specified in proposal.
      if ([52404, 52412, 52416, 52427, 51005, 51006, 52108, 52109].includes(number)) throw operationError('OPERATIONS_CONFLICT', 'Xung đột phiên bản, người nhận việc, trạng thái hoặc lịch phòng. Tải lại dữ liệu để đối chiếu.', 409);
      throw operationError(command ? 'OPERATIONS_OUTCOME_UNKNOWN' : 'OPERATIONS_SQL_UNAVAILABLE', command
        ? 'Chưa xác định kết quả ghi SQL. Không tạo yêu cầu mới; giữ nguyên khóa chống gửi lặp.' : 'Không đọc được dữ liệu SQL vận hành.', 503);
    } finally { clearTimeout(timer); }
  }
  return Object.freeze({ configured, testOnly, inspectionAuthorization, maxLimit, supports,
    read: (actor, resource, operation, input, requestId) => call(actor, resource, operation, input, requestId),
    execute: (actor, resource, action, input, digest, key, requestId) => call(actor, resource, action, input, requestId, { digest, key }) });
}
