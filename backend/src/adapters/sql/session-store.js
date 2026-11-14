import { createHash } from 'node:crypto';
import { AppError } from '../../shared/errors.js';

const names = Object.freeze({ probe: 'pms.usp_WebSessionProbe', create: 'pms.usp_WebSessionCreate', get: 'pms.usp_WebSessionGet', destroy: 'pms.usp_WebSessionDestroy' });
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const token = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const version = value => typeof value === 'string' && /^0x[0-9a-fA-F]{16}$/.test(value);
const unavailable = () => new AppError(503, 'SQL_SESSION_UNAVAILABLE', 'Kho phiên SQL chưa được duyệt hoặc không khả dụng.');

// Loaded only by the explicitly approved test SQL runtime. S0 has its own
// approval for session writes, independent of auth reads/business cutover flags.
export function createSqlSessionStore({ pool, types, manifest, database, environment, epoch, timeoutMs = 3000, now = Date.now } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new TypeError('Invalid session timeout.');
  manifest = manifest ? { ...manifest, procedures: { ...manifest.procedures } } : null;
  const epochHash = token(epoch) && Buffer.from(epoch, 'base64url').length === 32
    && Buffer.from(epoch, 'base64url').toString('base64url') === epoch
    ? createHash('sha256').update(epoch).digest('hex') : null;
  const configured = Boolean(pool && types?.BigInt && types?.Int && typeof types.VarChar === 'function' && typeof types.DateTime2 === 'function' && epochHash
    && manifest?.approved === true && typeof manifest.approvalReference === 'string' && manifest.approvalReference.trim() && manifest.protocol === 'songlam.session.v1'
    && manifest.sessionWritesApproved === true && typeof manifest.sessionWriteApprovalReference === 'string' && manifest.sessionWriteApprovalReference.trim()
    && typeof database === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(database)
    && environment === 'test' && manifest.environment === environment && manifest.database === database
    && Object.entries(names).every(([key, procedure]) => manifest.procedures[key] === procedure));
  async function call(operation, parameters) {
    if (!configured) throw unavailable();
    let request, timer;
    try {
      request = pool.request(); request.timeout = timeoutMs;
      for (const [key, type, value] of parameters) request.input(key, type, value);
      const result = await Promise.race([request.execute(names[operation]), new Promise((_, reject) => {
        timer = setTimeout(() => { try { request.cancel(); } catch {} reject(unavailable()); }, timeoutMs);
      })]);
      if (!Array.isArray(result.recordsets?.[0])) throw unavailable();
      return result.recordsets[0];
    } catch { throw unavailable(); }
    finally { clearTimeout(timer); }
  }
  function keyParameters(key) {
    if (!configured || !hex(key)) throw unavailable();
    return [['EpochHash', types.VarChar(64), epochHash], ['SessionKeyHash', types.VarChar(64), key]];
  }
  function ack(rows, key, status) {
    if (rows.length !== 1 || !rows[0] || rows[0].Status !== status || rows[0].EpochHash !== epochHash || rows[0].SessionKeyHash !== key) throw unavailable();
  }
  return Object.freeze({ configured, durable: configured, testOnly: false,
    approvalReference: configured ? manifest.approvalReference : null,
    async probe() {
      if (!configured) return false;
      try { const rows = await call('probe', []); return rows.length === 1 && [true, 1].includes(rows[0].Ready); } catch { return false; }
    },
    async create(key, record, ttlMs) {
      if (!configured || !record || typeof record.appUserId !== 'string' || !/^[1-9]\d{0,18}$/.test(record.appUserId) || BigInt(record.appUserId) > 9223372036854775807n
        || !version(record.securityVersion) || !token(record.csrfToken) || !Number.isInteger(ttlMs) || ttlMs < 1000 || ttlMs > 86400000
        || !Number.isSafeInteger(record.expiresAt) || record.expiresAt <= now() || record.expiresAt > now() + ttlMs + 1000) throw unavailable();
      const rows = await call('create', [...keyParameters(key), ['AppUserId', types.BigInt, record.appUserId],
        ['SecurityVersion', types.VarChar(18), record.securityVersion], ['CsrfToken', types.VarChar(43), record.csrfToken],
        ['ExpiresAtUtc', types.DateTime2(3), new Date(record.expiresAt)], ['TtlMs', types.Int, ttlMs]]);
      ack(rows, key, 'CREATED');
    },
    async get(key) {
      const rows = await call('get', keyParameters(key));
      if (rows.length === 0) return null;
      if (rows.length !== 1) throw unavailable();
      const r = rows[0]; if (!r) throw unavailable();
      const id = r.AppUserId, expiresAt = Number(r.ExpiresAtMs);
      if (r.EpochHash !== epochHash || r.SessionKeyHash !== key || typeof id !== 'string' || !/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n
        || !version(r.SecurityVersion) || !token(r.CsrfToken) || !/^[0-9]+$/.test(String(r.ExpiresAtMs)) || !Number.isSafeInteger(expiresAt)) throw unavailable();
      if (expiresAt <= now()) return null;
      return { appUserId: id, securityVersion: r.SecurityVersion, csrfToken: r.CsrfToken, expiresAt };
    },
    async destroy(key) { ack(await call('destroy', keyParameters(key)), key, 'DESTROYED'); }
  });
}
