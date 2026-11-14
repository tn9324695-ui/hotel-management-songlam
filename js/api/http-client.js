(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SongLamHttp = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  class ApiError extends Error {
    constructor(message, { status = 0, code = 'NETWORK_ERROR', fields, requestId, outcomeUnknown = false } = {}) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
      this.fields = fields;
      this.requestId = requestId || null;
      this.outcomeUnknown = outcomeUnknown;
    }
  }

  function createClient({ basePath = '/api/v1', origin = globalThis.location?.origin || 'http://localhost', timeoutMs = 8000, fetchImpl = globalThis.fetch } = {}) {
    if (!/^\/[A-Za-z0-9/_-]*$/.test(basePath) || basePath.startsWith('//')) throw new TypeError('Invalid API base path.');
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new TypeError('Invalid request timeout.');
    if (typeof fetchImpl !== 'function') throw new TypeError('fetch is required.');
    const prefix = basePath.replace(/\/$/, '');

    async function request(resource, { method = 'GET', body, headers = {}, signal } = {}) {
      method = method.toUpperCase();
      if (typeof resource !== 'string' || !resource.startsWith('/') || resource.startsWith('//') || resource.includes('\\')) throw new TypeError('Only same-origin API paths are allowed.');
      const url = new URL(prefix + resource, origin);
      if (url.origin !== new URL(origin).origin || !url.pathname.startsWith(prefix + '/')) throw new TypeError('API path escapes its base.');
      const controller = new AbortController();
      let timedOut = false;
      const abort = () => controller.abort();
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
      let ticket = null, sentRequestId = null;
      const coordinator = globalThis.SongLamWrites;
      try {
        const requestHeaders = new Headers(headers);
        requestHeaders.set('Accept', 'application/json');
        if (body !== undefined) requestHeaders.set('Content-Type', 'application/json');
        if (!requestHeaders.has('X-Request-ID') && globalThis.crypto?.randomUUID) requestHeaders.set('X-Request-ID', globalThis.crypto.randomUUID());
        sentRequestId = requestHeaders.get('X-Request-ID');
        const serializedBody = body === undefined ? undefined : JSON.stringify(body);
        ticket = await coordinator?.before({ resource, method, serializedBody, headers: requestHeaders, requestId: sentRequestId });
        const response = await fetchImpl(url.href, {
          method, headers: requestHeaders, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
          signal: controller.signal, ...(body === undefined ? {} : { body: serializedBody })
        });
        const responseId = response.headers.get('X-Request-ID');
        if (!response.headers.get('Content-Type')?.toLowerCase().includes('application/json')) {
          throw new ApiError('Máy chủ trả dữ liệu không đúng định dạng API.', { status: response.status, code: 'INVALID_RESPONSE', requestId: responseId });
        }
        let payload;
        try { payload = await response.json(); }
        catch { throw new ApiError('Không thể đọc phản hồi API.', { status: response.status, code: 'INVALID_RESPONSE', requestId: responseId }); }
        const requestId = typeof payload?.requestId === 'string' ? payload.requestId : responseId;
        if (!response.ok) {
          throw new ApiError(typeof payload?.error?.message === 'string' ? payload.error.message.slice(0, 500) : 'Yêu cầu không thực hiện được.', {
            status: response.status, code: typeof payload?.error?.code === 'string' ? payload.error.code : 'HTTP_ERROR', fields: payload?.error?.fields, requestId
          });
        }
        if (!payload || typeof payload !== 'object' || !Object.hasOwn(payload, 'data') || payload.error) {
          throw new ApiError('Phản hồi API thiếu dữ liệu hợp lệ.', { status: response.status, code: 'INVALID_RESPONSE', requestId });
        }
        if (ticket && (payload.data?.committed !== true || requestId !== sentRequestId || responseId !== sentRequestId)) throw new ApiError('Chưa có receipt commit hợp lệ cho đúng mã yêu cầu. Không gửi thao tác thay thế.', { code: 'WRITE_OUTCOME_UNKNOWN', requestId: sentRequestId, outcomeUnknown: true });
        coordinator?.settle(ticket, { data: payload.data, status: response.status }); ticket = null;
        return { data: payload.data, meta: payload.meta || null, requestId };
      } catch (error) {
        if (ticket) coordinator?.settle(ticket, { status: error.status, code: error.code });
        if (error instanceof ApiError) { error.requestId ||= sentRequestId;
          if (error.status === 401 && typeof globalThis.dispatchEvent === 'function') globalThis.dispatchEvent(new Event('songlam:unauthenticated'));
          if (ticket && (['INVALID_RESPONSE', 'WRITE_OUTCOME_UNKNOWN'].includes(error.code)
          || ![400, 401, 403, 404, 409, 413, 415, 422].includes(error.status) && !['CUTOVER_WRITE_LOCKED', 'DEPLOYMENT_CHANGED', 'IDEMPOTENCY_REQUIRED'].includes(error.code))) error.outcomeUnknown = true; throw error; }
        if (error?.pmsWriteGate) throw new ApiError(error.message, { code: error.code, requestId: sentRequestId, outcomeUnknown: error.outcomeUnknown });
        if (controller.signal.aborted) throw new ApiError(timedOut ? 'Yêu cầu đã hết thời gian chờ; nếu là thao tác ghi, cần đối chiếu mã yêu cầu.' : 'Yêu cầu đã hủy; cần đối chiếu nếu đã gửi.', { code: timedOut ? 'REQUEST_TIMEOUT' : 'REQUEST_ABORTED', requestId: sentRequestId, outcomeUnknown: !!ticket });
        throw new ApiError('Không thể xác định phản hồi máy chủ. Không tự tạo giao dịch mới; mở trang trạng thái để đối chiếu.', { code: 'NETWORK_ERROR', requestId: sentRequestId, outcomeUnknown: !!ticket });
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      }
    }
    // No retry, localStorage fallback, token storage or authentication side effects.
    return Object.freeze({ request });
  }
  let sharedClient;
  return Object.freeze({ ApiError, createClient, getClient: () => sharedClient ||= createClient() });
}));
