import { AppError, errorResponse } from '../shared/errors.js';

export function errorHandler(logger) {
  return (error, req, res, _next) => {
    if (res.headersSent) return res.end();
    let safe = error;
    if (error.type === 'entity.parse.failed') safe = new AppError(400, 'INVALID_JSON', 'Nội dung JSON không hợp lệ.');
    else if (error.type === 'entity.too.large') safe = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Dữ liệu gửi lên vượt quá giới hạn.');
    else if (!(error instanceof AppError) && [400, 403, 404, 405, 415].includes(error.status)) {
      safe = new AppError(error.status, 'REQUEST_REJECTED', 'Không thể xử lý yêu cầu này.');
    }
    const status = safe instanceof AppError ? safe.status : 500;
    res.locals.outcomeCode = safe instanceof AppError ? safe.code : 'INTERNAL_ERROR';
    if (status >= 500) logger.error?.({ event: 'request.failed', requestId: req.requestId, code: safe instanceof AppError ? safe.code : 'INTERNAL_ERROR' });
    res.status(status).json(errorResponse(safe, req.requestId));
  };
}
