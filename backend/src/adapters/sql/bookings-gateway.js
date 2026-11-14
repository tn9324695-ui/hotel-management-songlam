import { AppError } from '../../shared/errors.js';
import { assertActor } from '../../modules/auth/security.js';
import { sourceBatchLimits } from '../../modules/bookings/batch.js';
import { bookingError } from '../../modules/bookings/validation.js';
import { canonicalIntent } from '../../modules/bookings/intent.js';

const forbidden = new Set(['pms.usp_query', 'pms.usp_readresource', 'pms.usp_executecommand', 'pms.usp_applycommand']);
const rights = Object.freeze({ availability: ['viewRoomRack'], timeline: ['viewRoomRack'], list: ['createBooking', 'manageCheckOut'], detail: ['createBooking', 'manageCheckOut'],
  create: ['createBooking'], assign: ['createBooking'], cancel: ['cancelBooking'], 'cancel-rooms': ['cancelBooking'] });
export function requireBookingPermission(actor, operation) {
  assertActor(actor);
  if (!Object.hasOwn(rights, operation) || !rights[operation].some(right => actor.permissions.includes(right))) throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác đặt phòng này.');
}
function ceiling(value, maximum) {
  if (value === undefined) return maximum;
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new TypeError('Invalid approved booking limit.');
  return value;
}
export function createBookingsSqlGateway({ pool, types, contract, environment, testOnly = false, timeoutMs = 5000 } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new TypeError('Invalid booking timeout.');
  const manifest = Object.freeze({ ...contract }), procedures = Object.freeze({ ...contract?.procedures }), guarantees = Object.freeze({ ...contract?.guarantees });
  const operations = Object.freeze([...(Array.isArray(contract?.operations) ? contract.operations : [])]);
  const operationProcedures = Object.freeze(Object.fromEntries(Object.entries(contract?.operationProcedures || {}).map(([operation, phases]) => [operation, Object.freeze({ ...phases })])));
  const procedureFor = (operation, phase) => Object.hasOwn(operationProcedures, operation) && Object.hasOwn(operationProcedures[operation], phase)
    ? operationProcedures[operation][phase] : procedures[phase];
  const policies = Object.freeze((Array.isArray(contract?.policyApprovals) ? contract.policyApprovals : []).map(item => Object.freeze({ ...item })));
  const maxChanges = ceiling(contract?.limits?.maxChanges, sourceBatchLimits.maxChanges);
  const limits = Object.freeze({ maxChanges, maxChangeBytes: ceiling(contract?.limits?.maxChangeBytes, sourceBatchLimits.maxChangeBytes),
    maxRooms: ceiling(contract?.limits?.maxRooms, Math.max(1, maxChanges - 1)), maxGuestLinks: ceiling(contract?.limits?.maxGuestLinks, Math.max(1, maxChanges - 1)) });
  const configured = Boolean(pool && types && manifest.approved === true && typeof manifest.approvalReference === 'string' && manifest.approvalReference.trim()
    && manifest.database === 'SongLamPms_Design' && manifest.environment === environment && Boolean(manifest.testOnly) === testOnly
    && manifest.protocol === 'songlam.bookings.v1' && manifest.actorMode === 'app-user-parameter');
  function capability(actor, operation, phase) {
    requireBookingPermission(actor, operation);
    const procedure = procedureFor(operation, phase);
    if (!configured || typeof procedure !== 'string' || !/^pms\.[A-Za-z][A-Za-z0-9_]{0,119}$/.test(procedure) || forbidden.has(procedure.toLowerCase())) throw bookingError('BOOKING_CONTRACT_NOT_APPROVED', 'Chưa có hợp đồng đặt phòng theo actor được phê duyệt cho thao tác này.', 503);
    if (!operations.includes(operation)) throw bookingError('BOOKING_OPERATION_NOT_SUPPORTED', 'Hợp đồng SQL chưa hỗ trợ thao tác đặt phòng này.', 501);
    if ((['availability', 'timeline'].includes(operation) || phase !== 'read' && ['create', 'assign'].includes(operation))
      && guarantees.roomEligibility !== 'ROOM_ELIGIBILITY_V1') throw bookingError('ROOM_ELIGIBILITY_CONTRACT_MISSING', 'SQL chưa bảo đảm block theo khoảng, sự cố chặn khai thác và giữ kiểm tra sau bảo trì theo G7.', 503);
    if (phase === 'read' && ['availability', 'timeline'].includes(operation) && guarantees.effectiveDemand !== 'HALF_OPEN_SINGLE_COUNT_V1') throw bookingError('INVENTORY_READ_CONTRACT_MISSING', 'Chưa có truy vấn quỹ/lịch theo khoảng với quy tắc đếm được duyệt.', 503);
    if (phase !== 'read') {
      if (guarantees.readOnlyPrepare !== true || guarantees.atomicBatch !== true || guarantees.inventoryLock !== 'SongLam:Inventory'
        || guarantees.inventoryRecheckedAtCommit !== true || guarantees.roomConflictsRecheckedAtCommit !== true
        || guarantees.groupAllOrNothing !== true || guarantees.optimisticVersions !== true || guarantees.allocationSetComparedAtCommit !== true || guarantees.noCashWrites !== true
        || guarantees.noHiddenMutationItems !== true || guarantees.idempotency !== 'ACTOR_OPERATION_INTENT_SHA256') {
        throw bookingError('BOOKING_ATOMIC_CONTRACT_MISSING', 'SQL chưa có hợp đồng được duyệt bảo đảm khóa, nguyên tử, phiên bản và chống gửi lặp.', 503);
      }
      if (operation === 'create' && guarantees.g4SnapshotsValidatedAtCommit !== true) throw bookingError('G4_COMMIT_VALIDATION_MISSING', 'Chưa có kiểm tra snapshot G4 tại thời điểm ghi SQL.', 503);
      if (operation.startsWith('cancel') && (guarantees.partialCancelPreservesReceivedDeposits !== true || guarantees.cancellationAccounting !== 'ATOMIC_PENDING_OBLIGATIONS_NO_CASH')) throw bookingError('CANCELLATION_ACCOUNTING_CONTRACT_MISSING', 'Chưa có hợp đồng hủy và xử lý nghĩa vụ cọc nguyên tử, không chi tiền.', 503);
    }
  }
  async function call(actor, operation, phase, { input, intentHash, key, prepared, batch, proofs } = {}, requestId) {
    capability(actor, operation, phase);
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(requestId || '')) throw bookingError('INVALID_REQUEST_ID', 'Mã theo dõi không hợp lệ.', 400);
    if (pool.connected !== true) throw bookingError('BOOKING_SQL_UNAVAILABLE', 'Pool SQL đặt phòng chưa sẵn sàng.', 503);
    let request, timer;
    try {
      request = pool.request(); request.timeout = timeoutMs;
      request.input('AppUserId', types.BigInt, actor.appUserId);
      request.input('Operation', types.VarChar(32), operation);
      request.input('InputJson', types.NVarChar(types.MAX), canonicalIntent(input));
      request.input('RequestId', types.NVarChar(80), requestId);
      if (phase !== 'read') {
        request.input('IdempotencyKey', types.VarChar(120), key);
        request.input('IntentHash', types.VarChar(64), intentHash);
      }
      if (phase === 'commit') {
        if (!batch || batch.rowCount > limits.maxChanges || batch.utf16Bytes > limits.maxChangeBytes || Buffer.byteLength(batch.json, 'utf16le') !== batch.utf16Bytes) throw bookingError('BOOKING_BATCH_LIMIT_EXCEEDED', 'Lô vượt giới hạn SQL hoặc không khớp kích thước đã kiểm tra.');
        request.input('Changes', types.NVarChar(types.MAX), batch.json);
        const sqlPrepared = structuredClone(prepared);
        if (procedureFor(operation, phase) === 'pms.usp_AppBookingMutationCommit') {
          for (const room of sqlPrepared.rooms || []) if (Array.isArray(room.allocations) && room.allocations.length === 0) delete room.allocations;
        }
        request.input('PreparedJson', types.NVarChar(types.MAX), JSON.stringify(sqlPrepared));
        request.input('PriceProofsJson', types.NVarChar(types.MAX), JSON.stringify(proofs || []));
      }
      const result = await Promise.race([request.execute(procedureFor(operation, phase)), new Promise((_, reject) => {
        timer = setTimeout(() => {
          try { request.cancel(); } catch { /* no driver details, bodies or secrets in logs */ }
          reject(bookingError(phase === 'commit' ? 'BOOKING_OUTCOME_UNKNOWN' : 'BOOKING_SQL_TIMEOUT', phase === 'commit'
            ? 'Chưa xác định kết quả ghi. Giữ nguyên Idempotency-Key để tra cứu/gửi lại; không tạo khóa mới.' : 'Quá thời gian chờ SQL đặt phòng.', 504));
        }, timeoutMs);
      })]);
      const rows = result?.recordsets?.[0];
      if (!Array.isArray(rows) || rows.length !== 1 || typeof rows[0]?.PayloadJson !== 'string' || Buffer.byteLength(rows[0].PayloadJson) > 4194304) throw bookingError('BOOKING_SQL_RESPONSE_INVALID', 'SQL không trả đúng một kết quả đặt phòng hợp lệ.', 502);
      let payload; try { payload = JSON.parse(rows[0].PayloadJson); } catch { throw bookingError('BOOKING_SQL_RESPONSE_INVALID', 'JSON phản hồi SQL đặt phòng không hợp lệ.', 502); }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw bookingError('BOOKING_SQL_RESPONSE_INVALID', 'Thiếu dữ liệu SQL đặt phòng.', 502);
      // Verified 012/015 SQL JSON projection emits NULL (or omits the property)
      // for an empty nested SELECT. No inventory or financial data is invented.
      if (procedureFor(operation, phase) === 'pms.usp_AppBookingRead' && operation === 'detail') {
        for (const room of payload.booking?.rooms || []) if (room.allocations === null) room.allocations = [];
      }
      if (procedureFor(operation, phase) === 'pms.usp_AppBookingMutationPrepare' && !payload.replayed) {
        for (const room of payload.rooms || []) if (room.allocations == null) room.allocations = [];
      }
      return payload;
    } catch (error) {
      if (error instanceof AppError) throw error;
      const number = error?.number ?? error?.originalError?.info?.number;
      if ([229, 52403].includes(number)) throw bookingError('BOOKING_SQL_FORBIDDEN', 'SQL từ chối quyền thao tác đặt phòng.', 403);
      if (number === 54206) throw bookingError('CANCELLATION_REVIEW_REQUIRED', 'Đơn có tiền cọc/thanh toán hoặc folio. Cần quản lý phân loại nghĩa vụ trước; chưa hủy và chưa hoàn tiền.', 409);
      if ([54201, 54202, 54203, 54204].includes(number)) throw bookingError('BOOKING_MUTATION_CONFLICT', 'Đơn, phần phòng hoặc phân phòng đã thay đổi / không còn đủ điều kiện. Tải lại đơn trước khi thao tác.', 409);
      if(number===51002)throw bookingError('BOOKING_LOCK_BUSY','Đang có giao dịch giữ khóa quỹ phòng. Chưa ghi đơn này; thử lại cùng khóa yêu cầu.',409);
      if(number===54100)throw bookingError('BOOKING_INPUT_INVALID','Khoảng ngày, dữ liệu hoặc kích thước lô đặt phòng chưa hợp lệ.',422);
      if(number===54103)throw bookingError('CUSTOMER_NOT_FOUND','Khách không tồn tại hoặc đã ngừng hoạt động. Tìm và chọn lại khách từ SQL.',422);
      if(number===54108)throw bookingError('DEPOSIT_READ_CONTRACT_PENDING','Đơn đã có giao dịch tài chính; chưa có hợp đồng đối soát cọc phù hợp. Không thay số tiền bằng 0.',503);
      if ([51005, 51006, 52404, 52412].includes(number)) throw bookingError(number === 52404 ? 'IDEMPOTENCY_CONFLICT' : 'BOOKING_CONFLICT', 'Xung đột phiên bản, lịch/quỹ phòng hoặc khóa gửi lặp; không ghi thêm đơn.', 409);
      if ([52103, 52104, 52105, 52431, 52432].includes(number)) throw bookingError('PRICE_SNAPSHOT_CONFLICT', 'Giá/chính sách không khớp kiểm tra SQL tại thời điểm ghi; không tự ghi đè giá hoặc dùng quyền override.', 409);
      if (number === 52411) throw bookingError('BOOKING_SQL_RESPONSE_INVALID', 'Lô cập nhật thiếu rowversion SQL hợp lệ.', 502);
      if (phase === 'commit') throw bookingError('BOOKING_OUTCOME_UNKNOWN', 'Không xác định kết quả ghi SQL. Không đổi Idempotency-Key và không tự thử bằng lệnh khác.', 503);
      throw bookingError('BOOKING_SQL_UNAVAILABLE', 'Không thể đọc ngữ cảnh đặt phòng từ SQL.', 503);
    } finally { clearTimeout(timer); }
  }
  return Object.freeze({ configured, testOnly, limits,
    assertWrite(actor, operation) { capability(actor, operation, 'prepare'); capability(actor, operation, 'commit'); },
    read: (actor, operation, input, requestId) => call(actor, operation, 'read', { input }, requestId),
    async prepare(actor, operation, input, intentHash, key, requestId) {
      const payload = await call(actor, operation, 'prepare', { input, intentHash, key }, requestId);
      if (payload.actorId !== actor.appUserId || payload.operation !== operation || payload.intentHash !== intentHash || typeof payload.replayed !== 'boolean') throw bookingError('BOOKING_SQL_RESPONSE_INVALID', 'Ngữ cảnh chuẩn bị không khớp actor/yêu cầu.', 502);
      if (payload.replayed) return payload;
      const approval = policies.find(item => item.id === payload.policy?.id && item.hash === payload.policy?.hash
        && /^[a-f0-9]{64}$/.test(item.hash || '') && typeof item.reference === 'string' && item.reference.trim());
      if (!approval) throw bookingError('BOOKING_POLICY_NOT_APPROVED', 'Chính sách giữ/xác nhận/hủy phòng chưa được phê duyệt.', 503);
      return payload;
    },
    commit: (actor, operation, input, intentHash, key, prepared, batch, proofs, requestId) => call(actor, operation, 'commit', { input, intentHash, key, prepared, batch, proofs }, requestId)
  });
}
