import { AppError } from '../../shared/errors.js';
import { assertActor } from '../../modules/auth/security.js';
import { hashText } from '../../modules/pricing/policy.js';
import { quoteInput } from '../../modules/pricing/validation.js';

const forbidden = new Set(['pms.usp_query', 'pms.usp_readresource', 'pms.usp_executecommand', 'pms.usp_applycommand']);
export function createPricingSqlGateway({ pool, types, contract, environment, testOnly = false, timeoutMs = 3000 } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new TypeError('Invalid pricing timeout.');
  const manifest = Object.freeze({ ...contract });
  const operations = Object.freeze([...(Array.isArray(contract?.operations) ? contract.operations : [])]);
  const approvals = Object.freeze((Array.isArray(contract?.policyApprovals) ? contract.policyApprovals : []).map(value => Object.freeze({ ...value })));
  const calendars = Object.freeze((Array.isArray(contract?.calendarApprovals) ? contract.calendarApprovals : []).map(value => Object.freeze({ ...value })));
  const timeZones = Object.freeze({ ...contract?.timeZoneMappings });
  const configured = Boolean(pool && types && manifest.approved === true && typeof manifest.approvalReference === 'string' && manifest.approvalReference.trim()
    && manifest.database === 'SongLamPms_Design' && manifest.environment === environment && Boolean(manifest.testOnly) === testOnly
    && manifest.protocol === 'songlam.pricing.v1' && manifest.actorMode === 'app-user-parameter'
    && /^pms\.[A-Za-z][A-Za-z0-9_]{0,119}$/.test(manifest.procedure) && !forbidden.has(manifest.procedure.toLowerCase()));
  return Object.freeze({
    configured, testOnly,
    async loadContext(actor, operation, input, quotedAt, requestId) {
      assertActor(actor);
      if (!actor.permissions.includes('viewRoomRack') || operation === 'early-departure' && !actor.permissions.includes('manageCheckOut')) throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền xem giá hoặc ước tính trả sớm.');
      if (!configured) throw new AppError(503, 'PRICING_CONTRACT_NOT_APPROVED', 'Chưa có hợp đồng SQL đọc đủ giá, lịch và chính sách được phê duyệt.');
      if (!['nightly', 'hourly', 'early-departure'].includes(operation) || !operations.includes(operation)) throw new AppError(501, 'PRICING_OPERATION_NOT_SUPPORTED', 'Hợp đồng SQL chưa hỗ trợ loại báo giá này.');
      const normalizedInput = quoteInput(input, operation);
      if (!/^[A-Za-z0-9._-]{1,80}$/.test(requestId || '')) throw new AppError(400, 'VALIDATION_ERROR', 'Mã theo dõi yêu cầu không hợp lệ.');
      if (pool.connected !== true) throw new AppError(503, 'PRICING_SQL_UNAVAILABLE', 'Pool đọc giá chưa kết nối.');
      let request, timer;
      try {
        request = pool.request(); request.timeout = timeoutMs;
        request.input('AppUserId', types.BigInt, actor.appUserId);
        request.input('Mode', types.VarChar(32), operation);
        request.input('InputJson', types.NVarChar(types.MAX), JSON.stringify(normalizedInput));
        request.input('QuotedAtUtc', types.DateTime2(3), new Date(quotedAt));
        request.input('RequestId', types.NVarChar(80), requestId);
        const response = await Promise.race([request.execute(manifest.procedure), new Promise((_, reject) => {
          timer = setTimeout(() => {
            try { request.cancel(); } catch { /* never log driver errors or credentials */ }
            reject(new AppError(504, 'PRICING_SQL_TIMEOUT', 'Quá thời gian chờ đọc dữ liệu giá.'));
          }, timeoutMs);
        })]);
        const rows = response?.recordsets?.[0];
        if (!Array.isArray(rows) || rows.length !== 1 || typeof rows[0].ContextJson !== 'string' || Buffer.byteLength(rows[0].ContextJson) > 1048576) throw new AppError(502, 'PRICING_CONTEXT_INVALID', 'SQL không trả đầy đủ một ngữ cảnh báo giá hợp lệ.');
        let payload;
        try { payload = JSON.parse(rows[0].ContextJson); } catch { throw new AppError(502, 'PRICING_CONTEXT_INVALID', 'Ngữ cảnh báo giá SQL không đúng định dạng.'); }
        const context = operation === 'early-departure' ? payload?.committedSnapshot?.pricingContext : payload;
        const policy = context?.policy, hotel = context?.hotel;
        const approval = approvals.find(item => item.policyVersionId === policy?.PolicyVersionId && item.version === policy?.Version
          && typeof item.reference === 'string' && item.reference.trim() && /^[a-f0-9]{64}$/.test(item.rulesSha256 || '')
          && typeof policy?.RulesJson === 'string' && item.rulesSha256 === hashText(policy.RulesJson));
        if (!approval) throw new AppError(503, 'POLICY_NOT_APPROVED', 'Phiên bản hoặc nội dung chính sách chưa có phê duyệt tương ứng.');
        const calendar = calendars.find(item => item.sourceId === context?.calendarSource?.id && item.version === context?.calendarSource?.version
          && typeof item.reference === 'string' && item.reference.trim());
        if (!calendar) throw new AppError(503, 'CALENDAR_NOT_APPROVED', 'Chưa có nguồn phân loại ngày/phiên bản lịch được phê duyệt.');
        if (!hotel || !Object.hasOwn(timeZones, hotel.TimeZoneId) || timeZones[hotel.TimeZoneId] !== hotel.TimeZoneIana) throw new AppError(503, 'TIMEZONE_MAPPING_NOT_APPROVED', 'Chưa phê duyệt ánh xạ múi giờ cho dữ liệu khách sạn.');
        return { payload, policyApprovalReference: approval.reference, calendarApprovalReference: calendar.reference, contractApprovalReference: manifest.approvalReference };
      } catch (error) {
        if (error instanceof AppError) throw error;
        const number = error?.number ?? error?.originalError?.info?.number;
        if ([229, 52403].includes(number)) throw new AppError(403, 'PRICING_SQL_FORBIDDEN', 'SQL Server từ chối quyền đọc dữ liệu giá.');
        if(number===54100)throw new AppError(400,'PRICING_INPUT_INVALID','Ngày giờ hoặc loại giá chưa hợp lệ.');
        if(number===54101)throw new AppError(422,'ROOM_CAPACITY_EXCEEDED','Hạng phòng không hoạt động hoặc số khách vượt sức chứa.');
        if(number===54102)throw new AppError(422,'RATE_PLAN_NOT_EFFECTIVE','Gói giá/chính sách chưa có hiệu lực hoặc cấu hình giờ khách sạn đã đổi.');
        throw new AppError(503, 'PRICING_SQL_UNAVAILABLE', 'Không thể đọc dữ liệu giá/chính sách từ SQL.');
      } finally { clearTimeout(timer); }
    }
  });
}
