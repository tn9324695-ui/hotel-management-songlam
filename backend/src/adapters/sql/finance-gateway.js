import { AppError } from '../../shared/errors.js';
import { canonicalIntent } from '../../modules/bookings/intent.js';
import { financeResources, requireFinancePermission } from '../../modules/finance/model.js';
import { financeError } from '../../modules/finance/money.js';

const approved = value => value?.approved === true && typeof value.reference === 'string' && value.reference.trim();
export function createFinanceSqlGateway({ pool, types, contract, environment, testOnly = false, timeoutMs = 5000 } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new TypeError('Invalid finance timeout.');
  const manifest = Object.freeze({ ...contract }), guarantees = Object.freeze({ ...contract?.guarantees }), procedures = Object.freeze({ ...contract?.procedures });
  const policies = Object.freeze(Object.fromEntries(Object.entries(contract?.policies || {}).map(([key, value]) => [key, Object.freeze({ ...value })])));
  const operations = Object.freeze([...(Array.isArray(contract?.operations) ? contract.operations : [])]);
  const goodLimit = (n, max) => Number.isInteger(n) && n > 0 && n <= max;
  const limits = Object.freeze({ maxLines: goodLimit(contract?.limits?.maxLines, 125) ? contract.limits.maxLines : 125,
    maxLimit: goodLimit(contract?.limits?.maxLimit, 200) ? contract.limits.maxLimit : 200 });
  const configured = Boolean(pool && types && manifest.approved === true && manifest.approvalReference?.trim()
    && manifest.database === 'SongLamPms_Design' && manifest.environment === environment && Boolean(manifest.testOnly) === testOnly
    && manifest.protocol === 'songlam.finance.v1' && manifest.actorMode === 'app-user-parameter'
    && goodLimit(contract?.limits?.maxLines, 125) && goodLimit(contract?.limits?.maxLimit, 200));
  const safeProcedure = phase => typeof procedures[phase] === 'string' && /^pms\.[A-Za-z][A-Za-z0-9_]{0,119}$/.test(procedures[phase])
    && !/^pms\.(usp_Query|usp_ReadResource|usp_ExecuteCommand|usp_ApplyCommand)$/i.test(procedures[phase]);
  function policyCheck(resource, operation, input = {}) {
    if (!approved(policies.businessClock)) throw financeError('BUSINESS_CLOCK_POLICY_PENDING', 'Chưa duyệt múi giờ/ngày kinh doanh và thời điểm chốt.', 503);
    if (resource === 'refunds' && ['decide', 'complete'].includes(operation) || resource === 'checkouts' && input.refundRequestIds?.length) {
      if (!approved(policies.refundApproval) || policies.refundApproval.separation !== 'DISTINCT_REQUESTER_APPROVER') throw financeError('REFUND_APPROVAL_POLICY_PENDING', 'Chưa duyệt quy tắc người tạo/người duyệt hoàn; thao tác đang khóa.', 503);
      if ((operation === 'complete' || resource === 'checkouts') && policies.refundApproval.cashPayoutAllowed !== true) throw financeError('REFUND_PAYOUT_POLICY_PENDING', 'Chưa duyệt quy trình chi hoàn tiền mặt.', 503);
    }
    if (input.quickMinibarSegments?.length && (!approved(policies.quickMinibar) || guarantees.quickZeroAuditAtomic !== true)) throw financeError('QUICK_MINIBAR_POLICY_PENDING', 'Chưa duyệt xác nhận nhanh minibar 0đ; cần biên bản G8 hợp lệ.', 503);
  }
  function supports(resource, operation, phase = 'read') {
    if (!configured || !Object.hasOwn(financeResources, resource) || !safeProcedure(phase) || !operations.includes(resource + ':' + operation)
      || guarantees.actorAndRightsRechecked !== true || guarantees.scopedFinancialProjection !== true || guarantees.sourceGraph !== 'FINANCE_GRAPH_V1') return false;
    if (phase === 'read') return true;
    if (!approved(policies.businessClock)) return false;
    if (['atomicSourceLedgerAndReceipt', 'optimisticVersionsAndSetTokens', 'noDoubleAllocation', 'refundReservationsLocked', 'openShiftAndDayRechecked',
      'immutableOriginalCharges', 'auditActorAtomic', 'noUnverifiedBankSuccess', 'noPostSettlementAdjustment', 'boundedAtomicMutations', 'serverClock', 'cashDrawerNonNegative'].some(key => guarantees[key] !== true)
      || guarantees.inventoryLock !== 'SongLam:Inventory' || guarantees.idempotency !== 'ACTOR_RESOURCE_OPERATION_INTENT_SHA256') return false;
    if (resource === 'deposits' && operation === 'allocate' && guarantees.depositAllocationJournal !== 'PAIRED_APPEND_ONLY_V1') return false;
    if (resource === 'folios' && operation === 'transfer' && guarantees.transferPairAndSourceAllocation !== true) return false;
    if (resource === 'checkouts' && ['checkoutAtomicAllEffects', 'preserveG4G6Snapshot', 'g8SegmentCoverage', 'g7DirtyTaskAtomic', 'masterDebtPreserved', 'noHiddenMoneyEffects', 'compoundPaymentRequestsAtomic'].some(key => guarantees[key] !== true)) return false;
    if (resource === 'cashier' && guarantees.shiftCashReconciled !== true || resource === 'days' && guarantees.daySnapshotAndNextDayAtomic !== true
      || resource === 'invoices' && guarantees.internalReceiptSourceLinked !== true) return false;
    try { policyCheck(resource, operation); } catch { return false; }
    return true;
  }
  async function call(actor, resource, operation, phase, input, requestId, command) {
    if (!Object.hasOwn(financeResources, resource) || (phase === 'command'
      ? !Object.hasOwn(financeResources[resource].commands, operation)
      : !['list', 'detail', 'entries', 'movements', 'context', 'preview'].includes(operation))) throw financeError('FINANCE_OPERATION_NOT_SUPPORTED', 'Kiểu đọc/ghi hoặc thao tác tài chính chưa được hỗ trợ.', 501);
    requireFinancePermission(actor, resource, operation === 'context' ? input.operation : operation);
    const capabilityOperation = operation === 'context' ? 'context' : operation;
    if (!configured) throw financeError('FINANCE_CONTRACT_NOT_APPROVED', 'Chưa có hợp đồng SQL tài chính theo actor được phê duyệt.', 503);
    if (phase === 'command' || operation === 'preview' || operation === 'context') policyCheck(resource, operation === 'context' ? input.operation : operation, input);
    if (!supports(resource, capabilityOperation, phase) || operation === 'preview' && guarantees.readOnlyPreview !== true) throw financeError('FINANCE_ATOMIC_CONTRACT_MISSING', 'SQL chưa đủ hợp đồng đọc/ghi/đối soát nguyên tử cho thao tác này.', 503);
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(requestId || '')) throw financeError('INVALID_REQUEST_ID', 'Mã theo dõi không hợp lệ.', 400);
    if (input.limit > limits.maxLimit) throw financeError('FINANCE_PAGE_LIMIT_EXCEEDED', 'Phân trang vượt giới hạn hợp đồng được duyệt.');
    const json = canonicalIntent(input);
    if (Buffer.byteLength(json, 'utf16le') > 65536) throw financeError('FINANCE_BATCH_LIMIT_EXCEEDED', 'Toàn yêu cầu vượt giới hạn 65536 byte UTF-16; không tự chia giao dịch.', 413);
    if (pool.connected !== true) throw financeError('FINANCE_SQL_UNAVAILABLE', 'Pool SQL tài chính chưa sẵn sàng.', 503);
    let request, timer;
    try {
      request = pool.request(); request.timeout = timeoutMs;
      request.input('AppUserId', types.BigInt, actor.appUserId); request.input('Resource', types.VarChar(20), resource);
      request.input('Operation', types.VarChar(24), operation); request.input('InputJson', types.NVarChar(types.MAX), json); request.input('RequestId', types.NVarChar(80), requestId);
      request.input('PolicyContextJson', types.NVarChar(types.MAX), JSON.stringify(policies));
      if (command) { request.input('IdempotencyKey', types.VarChar(120), command.key); request.input('IntentHash', types.VarChar(64), command.digest); }
      const result = await Promise.race([request.execute(procedures[phase]), new Promise((_, reject) => {
        timer = setTimeout(() => { try { request.cancel(); } catch {} reject(financeError(command ? 'FINANCE_OUTCOME_UNKNOWN' : 'FINANCE_SQL_TIMEOUT',
          command ? 'Chưa rõ kết quả ghi tiền/checkout. Giữ nguyên body và Idempotency-Key; không tạo giao dịch mới.' : 'Quá thời gian đọc tài chính.', 504)); }, timeoutMs);
      })]);
      const rows = result?.recordsets?.[0];
      if (!Array.isArray(rows) || rows.length !== 1 || typeof rows[0]?.PayloadJson !== 'string' || Buffer.byteLength(rows[0].PayloadJson) > 4194304) throw new Error('Invalid finance envelope');
      const payload = JSON.parse(rows[0].PayloadJson); if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid finance payload');
      return payload;
    } catch (error) {
      if (error instanceof AppError) throw error;
      const number = error?.number ?? error?.originalError?.info?.number;
      if ([229, 52403].includes(number)) throw financeError('FINANCE_SQL_FORBIDDEN', 'SQL từ chối quyền tài chính.', 403);
      // 525xx are proposed contract errors, not claimed to exist on the live server.
      const special = { 52404: ['IDEMPOTENCY_CONFLICT', 'Khóa gửi lặp đã gắn với nội dung khác.'],
        52501: ['DEPOSIT_DISPUTE', 'Khoản cọc đang tranh chấp/giữ cho hoàn hoặc đã phân bổ.'],
        52502: ['TRANSFER_TARGET_REQUIRED', 'Thiếu hoặc không hợp lệ folio/tài khoản bên nhận.'],
        52503: ['UNRESOLVED_BALANCE', 'Công nợ hoặc tiền cần hoàn chưa được xử lý.'],
        52504: ['CHECKOUT_IN_PROGRESS', 'Lượt ở đang được quyết toán; đối chiếu yêu cầu gốc trước khi thao tác tiếp.'],
        52505: ['FINANCE_SOURCE_ALREADY_USED', 'Nguồn tiền hoặc khoản phân bổ đã được sử dụng.'] };
      if (special[number]) throw financeError(...special[number], 409);
      if ([2601, 2627, 52412, 52417, 52419, 52420, 52421, 52422, 52423, 52425, 52426].includes(number) || number >= 52201 && number <= 52305) throw financeError('FINANCE_CONFLICT', 'Xung đột phiên bản, tiền đã ghi, nguồn phân bổ, ca/ngày hoặc đối soát; giao dịch bị từ chối.', 409);
      throw financeError(command ? 'FINANCE_OUTCOME_UNKNOWN' : 'FINANCE_SQL_UNAVAILABLE', command
        ? 'Chưa xác định commit. Giữ nguyên khóa/nội dung để lấy receipt gốc; không thu/chi lại.' : 'Không đọc được dữ liệu tài chính.', 503);
    } finally { clearTimeout(timer); }
  }
  return Object.freeze({ configured, testOnly, limits, policies, supports,
    assertPolicy: policyCheck,
    read: (actor, resource, operation, input, requestId) => call(actor, resource, operation, 'read', input, requestId),
    execute: (actor, resource, operation, input, digest, key, requestId) => call(actor, resource, operation, 'command', input, requestId, { digest, key }) });
}
