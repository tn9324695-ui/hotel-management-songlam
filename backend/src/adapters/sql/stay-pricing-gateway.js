import { AppError } from '../../shared/errors.js';
import { assertActor } from '../../modules/auth/security.js';
import { canonicalIntent } from '../../modules/bookings/intent.js';

export function createStayPricingSqlGateway({ pool, types, contract, environment, testOnly = false, timeoutMs = 5000 } = {}) {
  const manifest = Object.freeze({ ...contract }), approvals = Object.freeze((contract?.policyApprovals || []).map(row => Object.freeze({ ...row })));
  const calendars = Object.freeze((contract?.calendarApprovals || []).map(row => Object.freeze({ ...row }))), zones = Object.freeze({ ...contract?.timeZoneMappings });
  const directions = Object.freeze([...(Array.isArray(contract?.directions) ? contract.directions : [])]);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new TypeError('Invalid stay pricing timeout.');
  const configured = Boolean(pool && types && manifest.approved === true && typeof manifest.approvalReference === 'string' && manifest.approvalReference.trim()
    && manifest.database === 'SongLamPms_Design' && manifest.environment === environment && Boolean(manifest.testOnly) === testOnly
    && manifest.protocol === 'songlam.pricing.stay-change.v1' && manifest.actorMode === 'app-user-parameter'
    && /^pms\.[A-Za-z][A-Za-z0-9_]{0,119}$/.test(manifest.procedure) && !['pms.usp_query', 'pms.usp_readresource', 'pms.usp_executecommand', 'pms.usp_applycommand'].includes(manifest.procedure.toLowerCase())
    && manifest.lockedPricesPreserved === true && manifest.noCashWrites === true && manifest.readOnly === true);
  return Object.freeze({ configured, testOnly,
    async loadStayChange(actor, input, quotedAt, requestId) {
      assertActor(actor);
      if (!actor.permissions.includes('manageCheckIn')) throw new AppError(403, 'FORBIDDEN', 'Không có quyền điều chỉnh lưu trú.');
      if (!configured) throw new AppError(503, 'STAY_PRICE_CONTRACT_NOT_APPROVED', 'Chưa có hợp đồng G4 điều chỉnh giá từ snapshot đã chốt được phê duyệt.');
      if (!['extend', 'shorten'].includes(input.direction) || !directions.includes(input.direction)) throw new AppError(501, 'STAY_PRICE_DIRECTION_NOT_SUPPORTED', 'Hợp đồng G4 chưa hỗ trợ loại điều chỉnh này.');
      if (!/^[A-Za-z0-9._-]{1,80}$/.test(requestId || '')) throw new AppError(400, 'INVALID_REQUEST_ID', 'Mã theo dõi không hợp lệ.');
      if (pool.connected !== true) throw new AppError(503, 'STAY_PRICING_UNAVAILABLE', 'Pool đọc giá lưu trú chưa sẵn sàng.');
      let request, timer;
      try {
        request = pool.request(); request.timeout = timeoutMs;
        request.input('AppUserId', types.BigInt, actor.appUserId);
        request.input('InputJson', types.NVarChar(types.MAX), canonicalIntent(input));
        request.input('QuotedAtUtc', types.DateTime2(3), new Date(quotedAt));
        request.input('RequestId', types.NVarChar(80), requestId);
        const result = await Promise.race([request.execute(manifest.procedure), new Promise((_, reject) => { timer = setTimeout(() => { try { request.cancel(); } catch {} reject(new AppError(504, 'STAY_PRICING_TIMEOUT', 'Quá thời gian đọc đề xuất giá lưu trú.')); }, timeoutMs); })]);
        const rows = result?.recordsets?.[0];
        if (!Array.isArray(rows) || rows.length !== 1 || typeof rows[0]?.PayloadJson !== 'string' || Buffer.byteLength(rows[0].PayloadJson) > 4194304) throw new Error('Invalid pricing output');
        const payload = JSON.parse(rows[0].PayloadJson);
        if (!Array.isArray(payload.policyProofs) || !payload.policyProofs.length || payload.policyProofs.some(proof => !approvals.some(item => item.id === proof.id && item.version === proof.version && item.hash === proof.hash && /^[a-f0-9]{64}$/.test(item.hash || '') && typeof item.reference === 'string' && item.reference.trim()))) throw new AppError(503, 'STAY_POLICY_NOT_APPROVED', 'Thiếu phê duyệt phiên bản/chính sách điều chỉnh.');
        if (!Array.isArray(payload.calendarProofs) || !payload.calendarProofs.length || payload.calendarProofs.some(proof => !calendars.some(item => item.id === proof.id && item.version === proof.version && typeof item.reference === 'string' && item.reference.trim()))) throw new AppError(503, 'CALENDAR_NOT_APPROVED', 'Thiếu nguồn lịch được duyệt cho phần điều chỉnh.');
        if (!Object.hasOwn(zones, payload.timeZoneId) || zones[payload.timeZoneId] !== payload.timeZoneIana) throw new AppError(503, 'TIMEZONE_MAPPING_NOT_APPROVED', 'Thiếu ánh xạ múi giờ được duyệt.');
        return payload;
      } catch (error) {
        if (error instanceof AppError) throw error;
        const number = error?.number ?? error?.originalError?.info?.number;
        if ([229, 52403].includes(number)) throw new AppError(403, 'STAY_PRICING_FORBIDDEN', 'SQL từ chối đọc giá điều chỉnh.');
        if (number === 52431) throw new AppError(422, 'RATE_MISSING', 'Thiếu giá được công bố cho phần thời gian điều chỉnh.');
        if ([52412, 52432].includes(number)) throw new AppError(409, 'STAY_PRICING_CONFLICT', 'Phiên bản/giá đã thay đổi; không tự ghi đè.');
        throw new AppError(503, 'STAY_PRICING_UNAVAILABLE', 'Không thể lấy đề xuất giá lưu trú hợp lệ từ SQL.');
      } finally { clearTimeout(timer); }
    }
  });
}
