export class AppError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function errorResponse(error, requestId) {
  const known = error instanceof AppError;
  return {
    error: {
      code: known ? error.code : 'INTERNAL_ERROR',
      message: known ? error.message : 'Máy chủ gặp lỗi. Vui lòng thử lại sau.',
      ...(known && error.fields ? { fields: error.fields } : {})
    },
    requestId
  };
}
