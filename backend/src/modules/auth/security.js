import { createHash, timingSafeEqual } from 'node:crypto';
import { AppError } from '../../shared/errors.js';

export const unavailable = () => new AppError(503, 'AUTH_NOT_CONFIGURED', 'Chưa cấu hình đăng nhập. Hợp đồng SQL, thuật toán mật khẩu và kho phiên cần được phê duyệt.');
export const dependencyFailure = () => new AppError(503, 'AUTH_DEPENDENCY_UNAVAILABLE', 'Dịch vụ xác thực tạm thời không khả dụng.');
export const unauthorized = () => new AppError(401, 'UNAUTHENTICATED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
export const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS', 'Tên đăng nhập hoặc mật khẩu không hợp lệ.');
export const digest = value => createHash('sha256').update(value).digest('hex');
export const equalSecret = (left, right) => typeof left === 'string' && typeof right === 'string' && timingSafeEqual(Buffer.from(digest(left), 'hex'), Buffer.from(digest(right), 'hex'));

export async function bounded(operation, timeoutMs = 3000) {
  let timer;
  try {
    return await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
      timer = setTimeout(() => reject(dependencyFailure()), timeoutMs);
    })]);
  } catch { throw dependencyFailure(); }
  finally { clearTimeout(timer); }
}

export function userId(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw dependencyFailure();
  const id = String(value);
  if (!/^[1-9][0-9]{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) throw dependencyFailure();
  return id;
}

export function currentIdentity(value) {
  if (!value) return null;
  const id = userId(value.appUserId);
  if (typeof value.active !== 'boolean' || typeof value.securityVersion !== 'string' || !/^[A-Za-z0-9+/=_-]{1,256}$/.test(value.securityVersion)
    || typeof value.username !== 'string' || !value.username.length || value.username.length > 100
    || typeof value.fullName !== 'string' || value.fullName.length > 160
    || !Array.isArray(value.permissions) || value.permissions.length > 1000
    || value.permissions.some(p => typeof p !== 'string' || !/^[A-Za-z][A-Za-z0-9_.:-]{0,99}$/.test(p))) throw dependencyFailure();
  return Object.freeze({ appUserId: id, active: value.active, securityVersion: value.securityVersion,
    username: value.username, fullName: value.fullName, permissions: Object.freeze([...new Set(value.permissions)]) });
}

const reserved = new Set(['actor', 'actorid', 'appuserid', 'userid', 'role', 'roles', 'permissions', 'createdby', 'recordedby', 'approvedby', 'checkedoutby', 'closedby', 'inspectedby', 'resolvedby']);
export function hasActorFields(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => reserved.has(key.replace(/[_-]/g, '').toLowerCase()) || hasActorFields(child));
}
export function rejectClientActor(req, _res, next) {
  if (hasActorFields(req.body) || hasActorFields(req.query) || Object.keys(req.headers).some(key => /^x-(?:actor(?:-id)?|app-user-id|user-id|roles?|permissions)$/.test(key))) {
    return next(new AppError(400, 'CLIENT_ACTOR_FORBIDDEN', 'Không chấp nhận thông tin actor hoặc quyền từ trình duyệt.'));
  }
  next();
}

// Contexts can only be minted following a fresh identity lookup by the auth runtime.
const verifiedActors = new WeakSet();
export function mintActor(identity) {
  const actor = Object.freeze({ appUserId: identity.appUserId, permissions: identity.permissions });
  verifiedActors.add(actor);
  return actor;
}
export function assertActor(actor) {
  if (!verifiedActors.has(actor)) throw unauthorized();
}

export function requireOrigin(publicOrigin) {
  const allowed = new Set([publicOrigin]);
  try {
    const u = new URL(publicOrigin);
    if (u.hostname === '127.0.0.1') {
      const portPart = u.port ? `:${u.port}` : '';
      allowed.add(`${u.protocol}//localhost${portPart}`);
    } else if (u.hostname === 'localhost') {
      const portPart = u.port ? `:${u.port}` : '';
      allowed.add(`${u.protocol}//127.0.0.1${portPart}`);
    }
  } catch {}
  return (req, _res, next) => {
    const origin = req.get('origin');
    if (!allowed.has(origin) || (req.get('sec-fetch-site') && !['same-origin', 'same-site'].includes(req.get('sec-fetch-site')))) {
      return next(new AppError(403, 'CSRF_REJECTED', 'Yêu cầu không có nguồn hợp lệ.'));
    }
    next();
  };
}

export function createLoginLimiter({ now = Date.now, maximum = 10, windowMs = 60000, capacity = 2048 } = {}) {
  const attempts = new Map();
  return (req, _res, next) => {
    const time = now();
    for (const [key, item] of attempts) if (item.until <= time) attempts.delete(key);
    const key = req.ip;
    let item = attempts.get(key);
    if (!item) {
      if (attempts.size >= capacity) return next(new AppError(429, 'LOGIN_RATE_LIMITED', 'Vui lòng thử đăng nhập lại sau.'));
      item = { count: 0, until: time + windowMs }; attempts.set(key, item);
    }
    if (++item.count > maximum) return next(new AppError(429, 'LOGIN_RATE_LIMITED', 'Vui lòng thử đăng nhập lại sau.'));
    next();
  };
}
