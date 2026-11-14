import { Router } from 'express';
import { AppError } from '../../shared/errors.js';
import { rejectClientActor, requireOrigin, assertActor } from '../auth/security.js';
import { shape, idempotencyKey } from '../bookings/validation.js';
import { cutoverOperations } from './operations.js';
import { createHash } from 'node:crypto';

export function cutoverRoutes({ runtime, auth, config }) {
  const router = Router();
  // Safe deployment switch only: no target hostname/database, staff or financial data.
  router.get('/deployment', async (req, res) => res.json({ data: await runtime.publicState(), requestId: req.requestId }));
  router.post('/requests/lookup', auth.authenticate, rejectClientActor, requireOrigin(config.publicOrigin), auth.csrf, async (req, res) => {
    if (!req.is('application/json')) throw new AppError(415, 'JSON_REQUIRED', 'Yêu cầu JSON.');
    shape(req.query, [], []);
    shape(req.body, ['operation', 'idempotencyKey', 'originalRequestId'], ['operation', 'idempotencyKey', 'originalRequestId']);
    const { operation, originalRequestId } = req.body;
    if (!cutoverOperations.some(o => o.operation === operation) || !/^[A-Za-z0-9._-]{1,80}$/.test(originalRequestId || '')) throw new AppError(400, 'VALIDATION_ERROR', 'Mã thao tác/yêu cầu không hợp lệ.');
    const key = idempotencyKey(req.body.idempotencyKey);
    assertActor(req.auth.actor);
    const gateway = runtime.receiptGateway;
    if (!runtime.canLookup()) throw new AppError(503, 'RECEIPT_CONTRACT_PENDING', 'Chưa có hợp đồng tra cứu kết quả được duyệt. Giữ nguyên mã yêu cầu và dừng ghi.');
    let raw, timer;
    try {
      // Gateway must recheck current rights and original actor/deployment ownership.
      if(runtime.testOnly)await gateway.inspect();
      raw = await Promise.race([gateway.lookup(req.auth.actor, { operation, idempotencyKey: key, originalRequestId }, req.requestId),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error()), 3000); })]);
    } catch (error) {
      if (error instanceof AppError && error.status === 403) throw new AppError(403, 'FORBIDDEN', 'Không có quyền tra cứu yêu cầu này.');
      throw new AppError(503, 'RECEIPT_LOOKUP_UNAVAILABLE', 'Chưa xác định được kết quả. Không tạo giao dịch thay thế.');
    }
    finally { clearTimeout(timer); }
    if (!raw || !['COMMITTED', 'REJECTED', 'PENDING', 'UNKNOWN'].includes(raw.status) || raw.operation !== operation
      || raw.originalRequestId !== originalRequestId || raw.ownerAppUserId !== req.auth.actor.appUserId
      || raw.idempotencyKeySha256 !== createHash('sha256').update(key).digest('hex')
      || raw.rightsRechecked !== true || raw.deploymentId !== runtime.release?.deploymentId
      || raw.status === 'COMMITTED' && (!/^[A-Za-z0-9._:-]{1,120}$/.test(raw.receiptReference || '') || !Number.isFinite(Date.parse(raw.committedAtUtc)))) {
      throw new AppError(503, 'RECEIPT_RESULT_INVALID', 'Kết quả đối chiếu chưa hợp lệ. Không thực hiện lại giao dịch.');
    }
    runtime.resolveReceipt?.(originalRequestId,raw.status);
    res.json({ data: { status: raw.status, operation, originalRequestId,
      receiptReference: raw.status === 'COMMITTED' ? raw.receiptReference : null,
      committedAtUtc: raw.status === 'COMMITTED' ? raw.committedAtUtc : null }, requestId: req.requestId });
  });
  return router;
}
export function internalStatusRoutes({ runtime, auth }) {
  const router = Router();
  router.get('/status', auth.authenticate, rejectClientActor, async (req, res) => {
    if (!req.auth.actor.permissions.includes('systemConfig')) throw new AppError(403, 'FORBIDDEN', 'Không có quyền xem trạng thái vận hành nội bộ.');
    const state = await runtime.status();
    res.status(state.mode === 'sql' && !state.writable ? 503 : 200).json({ data: state, requestId: req.requestId });
  });
  return router;
}
