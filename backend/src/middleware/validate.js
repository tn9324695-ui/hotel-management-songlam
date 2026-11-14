import { AppError } from '../shared/errors.js';

export function validateLogin(req, _res, next) {
  if (!req.is('application/json')) return next(new AppError(415, 'JSON_REQUIRED', 'Yêu cầu phải dùng Content-Type application/json.'));
  const data = req.body;
  const fields = {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    fields.body = 'Dữ liệu phải là một đối tượng JSON.';
  } else {
    if (Object.keys(data).some(key => !['username', 'password'].includes(key))) fields.body = 'Chỉ chấp nhận username và password.';
    if (typeof data.username !== 'string' || !data.username.trim() || data.username.length > 100) fields.username = 'Tên đăng nhập phải có từ 1 đến 100 ký tự.';
    if (typeof data.password !== 'string' || !data.password.length || data.password.length > 1024) fields.password = 'Mật khẩu không được trống hoặc vượt quá giới hạn nhập.';
  }
  if (Object.keys(fields).length) return next(new AppError(400, 'VALIDATION_ERROR', 'Kiểm tra lại dữ liệu đã nhập.', fields));
  next();
}
