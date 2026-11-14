/* No business payload, token or cookie is stored here. Metadata survives reload in
 * this tab only. SQL receipt lookup, not this journal, determines commit outcome. */
(function (root) {
  'use strict';
  const storageKey = 'songlam_pending_requests_v1';
  const error = (code, message, outcomeUnknown = false) => Object.assign(new Error(message), { code, pmsWriteGate: true, outcomeUnknown });
  const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
    : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}` : JSON.stringify(value);
  function read() {
    try {
      const rows = JSON.parse(root.sessionStorage.getItem(storageKey) || '[]');
      if (!Array.isArray(rows) || rows.length > 100 || rows.some(r => !r || typeof r.originalRequestId !== 'string' || typeof r.idempotencyKey !== 'string' || typeof r.operation !== 'string')) throw new Error();
      return rows;
    } catch { throw error('PENDING_JOURNAL_UNAVAILABLE', 'Không đọc được nhật ký mã yêu cầu của tab. Khóa ghi để đối chiếu.'); }
  }
  function save(rows) {
    try { root.sessionStorage.setItem(storageKey, JSON.stringify(rows)); }
    catch { throw error('PENDING_JOURNAL_UNAVAILABLE', 'Không lưu được mã yêu cầu. Không được tạo giao dịch mới.', true); }
    root.dispatchEvent(new Event('pms-pending-change'));
  }
  const readOnly = (method, path) => ['GET', 'HEAD', 'OPTIONS'].includes(method)
    || method === 'POST' && (/^\/auth\/(login|logout)$/.test(path) || path === '/requests/lookup'
      || /^\/pricing\/quotes\/(nightly|hourly|early-departure)$/.test(path)
      || /^\/stays\/[1-9]\d{0,18}\/price-change-preview$/.test(path)
      || /^\/(checkouts|cashier\/shifts|finance\/business-days)\/(?:[1-9]\d{0,18}|\d{4}-\d{2}-\d{2})\/preview$/.test(path));
  async function before({ resource, method, serializedBody, headers, requestId }) {
    const path = new URL(resource, root.location.origin).pathname.replace(/\/$/, '');
    if (readOnly(method, path)) return null;
    const pending = read();
    if (pending.length) throw error('WRITE_OUTCOME_PENDING', 'Còn yêu cầu chưa xác định kết quả. Mở trang trạng thái, tra cứu bằng khóa cũ; không gửi giao dịch mới.', true);
    const state = await root.SongLamDeployment?.refresh();
    if (state?.mode !== 'sql' || !state.writable) throw error('CUTOVER_WRITE_LOCKED', 'Nguồn API đang khóa ghi hoặc chức năng chưa nghiệm thu. Không ghi localStorage thay thế.');
    const operation = state.operations.find(o => o.method === method && new RegExp('^' + o.template.replaceAll(':id', '(?:[1-9]\\d{0,18}|\\d{4}-\\d{2}-\\d{2})') + '$').test(path));
    if (!operation) throw error('CUTOVER_WRITE_LOCKED', 'Thao tác chưa nằm trong phạm vi nghiệm thu. Chỉ được xem dữ liệu.');
    const key = headers.get('Idempotency-Key');
    if (!/^[A-Za-z0-9._:-]{1,120}$/.test(key || '') || !requestId) throw error('IDEMPOTENCY_REQUIRED', 'Cần mã yêu cầu và khóa chống gửi lặp cố định.');
    const payloadSha256 = Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(serializedBody || '')))).map(v => v.toString(16).padStart(2, '0')).join('');
    // Re-read after async hashing so two clients in the same tab cannot both start.
    if (read().length) throw error('WRITE_OUTCOME_PENDING', 'Một thao tác khác đang chờ kết quả. Không gửi thêm.', true);
    const ticket = { operation: operation.operation, originalRequestId: requestId, idempotencyKey: key,
      payloadSha256, deploymentId: state.deploymentId, startedAtUtc: new Date().toISOString(), status: 'SENT_OR_UNKNOWN' };
    save([ticket]); headers.set('X-PMS-Deployment', state.deploymentId);
    return ticket;
  }
  function settle(ticket, { data, status = 0, code } = {}) {
    if (!ticket) return;
    const definitiveRejection = !['INVALID_RESPONSE', 'WRITE_OUTCOME_UNKNOWN'].includes(code) && [400, 401, 403, 404, 409, 413, 415, 422].includes(status)
      || ['CUTOVER_WRITE_LOCKED', 'DEPLOYMENT_CHANGED', 'IDEMPOTENCY_REQUIRED'].includes(code);
    if (data?.committed === true || definitiveRejection) {
      save(read().filter(r => r.originalRequestId !== ticket.originalRequestId)); return;
    }
    // Never erase UNKNOWN just because a later request was unauthorized/rejected.
    save(read().map(r => r.originalRequestId === ticket.originalRequestId ? { ...r, status: 'UNKNOWN' } : r));
  }
  function resolved(ticket, result) {
    if (!['COMMITTED', 'REJECTED'].includes(result?.status) || result.originalRequestId !== ticket.originalRequestId || result.operation !== ticket.operation) throw error('REQUEST_STILL_UNKNOWN', 'Yêu cầu chưa có kết quả cuối cùng.', true);
    // Caller is the receipt lookup page; no resubmission is triggered.
    save(read().filter(r => r.originalRequestId !== ticket.originalRequestId));
  }
  root.SongLamWrites = Object.freeze({ before, settle, pending: read, resolved, canonical });
}(globalThis));
