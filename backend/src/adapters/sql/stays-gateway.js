import { AppError } from '../../shared/errors.js';
import { assertActor } from '../../modules/auth/security.js';
import { canonicalIntent } from '../../modules/bookings/intent.js';
import { sourceBatchLimits } from '../../modules/bookings/batch.js';
import { bookingError } from '../../modules/bookings/validation.js';

export function requireStayPermission(actor, operation, input = {}) {
  assertActor(actor);
  const has = permission => actor.permissions.includes(permission);
  const allowed = ['list', 'detail'].includes(operation) ? has('manageCheckIn') || has('manageCheckOut')
    : operation === 'arrivals' ? has('manageCheckIn') && (has('createBooking') || has('manageCheckOut'))
      : operation === 'readiness' ? has('viewRoomRack') && (input.stayId ? has('manageRoomTransfer') : has('manageCheckIn'))
        : operation === 'transfer-room' ? has('manageRoomTransfer') : ['check-in', 'extend', 'shorten'].includes(operation) && has('manageCheckIn');
  if (!allowed || ['list', 'detail'].includes(operation) && input.roomId && !has('viewRoomRack')) throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác lưu trú này.');
}
function limit(value, maximum) {
  if (value === undefined) return maximum;
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw new TypeError('Invalid stay batch limit.');
  return value;
}
export function createStaysSqlGateway({ pool, types, contract, environment, testOnly = false, timeoutMs = 5000 } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new TypeError('Invalid stay timeout.');
  const manifest = Object.freeze({ ...contract }), procedures = Object.freeze({ ...contract?.procedures }), guarantees = Object.freeze({ ...contract?.guarantees });
  const operations = Object.freeze([...(Array.isArray(contract?.operations) ? contract.operations : [])]);
  const policies = Object.freeze((Array.isArray(contract?.policyApprovals) ? contract.policyApprovals : []).map(row => Object.freeze({ ...row })));
  const folioPolicy = contract?.checkInFolioCreation;
  const checkInFolioPolicy = folioPolicy?.approved === true && folioPolicy.profile === 'ATOMIC_ROOM_FOLIO_V1'
    && typeof folioPolicy.reference === 'string' && folioPolicy.reference.trim()
    && guarantees.checkInFolioCreationAtomic === true ? 'ATOMIC_ROOM_FOLIO_V1' : null;
  const limits = Object.freeze({ maxChanges: limit(contract?.limits?.maxChanges, sourceBatchLimits.maxChanges), maxChangeBytes: limit(contract?.limits?.maxChangeBytes, sourceBatchLimits.maxChangeBytes), maxUnits: limit(contract?.limits?.maxUnits, 125) });
  const configured = Boolean(pool && types && manifest.approved === true && typeof manifest.approvalReference === 'string' && manifest.approvalReference.trim()
    && manifest.database === 'SongLamPms_Design' && manifest.environment === environment && Boolean(manifest.testOnly) === testOnly
    && manifest.protocol === 'songlam.stays.v1' && manifest.actorMode === 'app-user-parameter');
  function assertContract(actor, operation, phase, input) {
    requireStayPermission(actor, operation, input);
    if (!configured || typeof procedures[phase] !== 'string' || !/^pms\.[A-Za-z][A-Za-z0-9_]{0,119}$/.test(procedures[phase])
      || ['pms.usp_query', 'pms.usp_readresource', 'pms.usp_executecommand', 'pms.usp_applycommand'].includes(procedures[phase].toLowerCase())) throw bookingError('STAY_CONTRACT_NOT_APPROVED', 'Chưa có hợp đồng SQL lưu trú theo actor được phê duyệt.', 503);
    if (!operations.includes(operation)) throw bookingError('STAY_OPERATION_NOT_SUPPORTED', 'Hợp đồng SQL chưa hỗ trợ thao tác lưu trú này.', 501);
    if ((operation === 'readiness' || phase !== 'read' && ['check-in', 'transfer-room', 'extend'].includes(operation))
      && guarantees.roomEligibility !== 'ROOM_ELIGIBILITY_V1') throw bookingError('ROOM_ELIGIBILITY_CONTRACT_MISSING', 'SQL chưa bảo đảm điều kiện khai thác, block và giữ kiểm tra sau bảo trì theo G7.', 503);
    if (phase !== 'read') {
      for (const name of ['readOnlyPrepare', 'atomicBatch', 'versionAndSegmentSetRechecked', 'currentOccupancyUnique', 'singleEffectiveDemand', 'noCashWrites', 'folioNotClosed', 'noHiddenMutationItems', 'auditActorAtomic']) {
        if (guarantees[name] !== true) throw bookingError('STAY_ATOMIC_CONTRACT_MISSING', 'Chưa có hợp đồng bảo đảm ghi lưu trú nguyên tử, phiên bản và audit.', 503);
      }
      if (guarantees.inventoryLock !== 'SongLam:Inventory' || guarantees.idempotency !== 'ACTOR_OPERATION_INTENT_SHA256') throw bookingError('STAY_ATOMIC_CONTRACT_MISSING', 'Chưa có khóa quỹ phòng/chống gửi lặp được duyệt.', 503);
      const required = operation === 'check-in' ? ['readinessAndAllocationRechecked', 'selectedRoomsAtomic', 'lockedPriceSnapshotCopied', 'guestsAndRoomChargesAtomic', 'verifiedDepositOnly', 'authorizedUpgradeRechecked']
        : operation === 'transfer-room' ? ['targetIntervalRechecked', 'roomDepartureHousekeepingAtomic', 'authorizedUpgradeRechecked', 'priceUnchangedOnTransfer']
          : ['fullIntervalRechecked', 'g4PriceChangeRechecked', 'actualOccupancyPreserved', 'priceHistoryAndReasonAtomic', 'ledgerCorrectionsAtomic'];
      if (required.some(name => guarantees[name] !== true)) throw bookingError('STAY_ATOMIC_CONTRACT_MISSING', 'SQL chưa bảo đảm đầy đủ các bước của thao tác trong một transaction.', 503);
    }
  }
  async function execute(actor, operation, phase, input, requestId, extra = {}) {
    assertContract(actor, operation, phase, input);
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(requestId || '')) throw bookingError('INVALID_REQUEST_ID', 'Mã theo dõi không hợp lệ.', 400);
    if (pool.connected !== true) throw bookingError('STAY_SQL_UNAVAILABLE', 'Pool SQL lưu trú chưa kết nối.', 503);
    let request, timer;
    try {
      request = pool.request(); request.timeout = timeoutMs;
      request.input('AppUserId', types.BigInt, actor.appUserId);
      request.input('Operation', types.VarChar(32), operation);
      request.input('InputJson', types.NVarChar(types.MAX), canonicalIntent(input));
      request.input('RequestId', types.NVarChar(80), requestId);
      if (phase !== 'read') { request.input('IntentHash', types.VarChar(64), extra.digest); request.input('IdempotencyKey', types.VarChar(120), extra.key); }
      if (phase === 'commit') {
        if (!extra.batch || extra.batch.rowCount > limits.maxChanges || extra.batch.utf16Bytes > limits.maxChangeBytes || Buffer.byteLength(extra.batch.json, 'utf16le') !== extra.batch.utf16Bytes) throw bookingError('STAY_BATCH_LIMIT_EXCEEDED', 'Lô lưu trú vượt giới hạn SQL; không chia lô.');
        request.input('PreparedJson', types.NVarChar(types.MAX), JSON.stringify(extra.prepared));
        request.input('Changes', types.NVarChar(types.MAX), extra.batch.json);
        request.input('PriceProofJson', types.NVarChar(types.MAX), JSON.stringify(extra.priceProof || null));
      }
      const result = await Promise.race([request.execute(procedures[phase]), new Promise((_, reject) => { timer = setTimeout(() => {
        try { request.cancel(); } catch {}
        reject(bookingError(phase === 'commit' ? 'STAY_OUTCOME_UNKNOWN' : 'STAY_SQL_TIMEOUT', phase === 'commit' ? 'Chưa xác định kết quả ghi. Giữ nguyên Idempotency-Key; không tạo thao tác mới.' : 'Quá thời gian đọc lưu trú.', 504));
      }, timeoutMs); })]);
      const rows = result?.recordsets?.[0];
      if (!Array.isArray(rows) || rows.length !== 1 || typeof rows[0]?.PayloadJson !== 'string' || Buffer.byteLength(rows[0].PayloadJson) > 4194304) throw bookingError('STAY_SQL_RESPONSE_INVALID', 'SQL không trả đầy đủ một kết quả lưu trú.', 502);
      const payload = JSON.parse(rows[0].PayloadJson);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw bookingError('STAY_SQL_RESPONSE_INVALID', 'Kết quả lưu trú không hợp lệ.', 502);
      return payload;
    } catch (error) {
      if (error instanceof AppError) throw error;
      const number = error?.number ?? error?.originalError?.info?.number;
      if ([229, 52403].includes(number)) throw bookingError('STAY_SQL_FORBIDDEN', 'SQL từ chối quyền lưu trú.', 403);
      if (number === 52406) throw bookingError('BUSINESS_DATE_REVIEW_REQUIRED', 'Ngày nghiệp vụ đang mở chưa khớp ngày thực tế khách sạn. Cần xử lý ngày nghiệp vụ trước khi ghi phí nhận phòng.', 409);
      if (number === 54100) throw bookingError('STAY_INPUT_INVALID', 'SQL từ chối phạm vi hoặc cấu trúc lô nhận phòng.', 422);
      if (number === 54401) throw bookingError('STAY_OPERATION_NOT_SUPPORTED', 'Gói SQL hiện chỉ hỗ trợ nhận phòng; chưa hỗ trợ thao tác lưu trú này.', 501);
      if ([51005, 51006, 52108, 52109, 52110, 52111, 52112, 52404, 52412, 52416].includes(number)) throw bookingError(number === 52404 ? 'IDEMPOTENCY_CONFLICT' : 'STAY_CONFLICT', 'Xung đột phiên bản, khách, lịch hoặc trạng thái phòng; thao tác bị từ chối.', 409);
      if (number === 52220) throw bookingError('STAY_PRICE_LEDGER_CONFLICT', 'Giá đã chốt và bút toán phòng không khớp.', 409);
      if ([52103, 52104, 52105, 52431, 52432].includes(number)) throw bookingError('STAY_PRICE_SNAPSHOT_CONFLICT', 'SQL từ chối giá/snapshot điều chỉnh; không tự thay giá hoặc dùng quyền override.', 409);
      throw bookingError(phase === 'commit' ? 'STAY_OUTCOME_UNKNOWN' : 'STAY_SQL_UNAVAILABLE', phase === 'commit' ? 'Không xác định kết quả ghi SQL. Giữ nguyên khóa gửi lặp.' : 'Không thể đọc dữ liệu lưu trú.', 503);
    } finally { clearTimeout(timer); }
  }
  return Object.freeze({ configured, testOnly, limits, checkInFolioPolicy,
    assertWrite(actor, operation, input) { assertContract(actor, operation, 'prepare', input); assertContract(actor, operation, 'commit', input); },
    read: (actor, operation, input, requestId) => execute(actor, operation, 'read', input, requestId),
    async prepare(actor, operation, input, digest, key, requestId) {
      const payload = await execute(actor, operation, 'prepare', input, requestId, { digest, key });
      if (payload.actorId !== actor.appUserId || payload.operation !== operation || payload.intentHash !== digest || typeof payload.replayed !== 'boolean') throw bookingError('STAY_SQL_RESPONSE_INVALID', 'Ngữ cảnh lưu trú không khớp actor/yêu cầu.', 502);
      if (!payload.replayed && !policies.some(item => item.id === payload.policy?.id && item.hash === payload.policy?.hash && /^[a-f0-9]{64}$/.test(item.hash || '') && typeof item.reference === 'string' && item.reference.trim())) throw bookingError('STAY_POLICY_NOT_APPROVED', 'Chưa có phê duyệt chính sách nhận/đổi/điều chỉnh lưu trú.', 503);
      return payload;
    },
    commit: (actor, operation, input, digest, key, prepared, batch, priceProof, requestId) => execute(actor, operation, 'commit', input, requestId, { digest, key, prepared, batch, priceProof })
  });
}
