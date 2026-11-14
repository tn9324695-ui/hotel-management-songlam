import { randomBytes } from 'node:crypto';
import { bounded, digest, equalSecret, unauthorized } from './security.js';

const cookiePattern = /^[A-Za-z0-9_-]{43}$/;
export function createSessionManager({ store, secure = true, ttlMs = 8 * 60 * 60 * 1000, now = Date.now } = {}) {
  if (!Number.isInteger(ttlMs) || ttlMs < 1000 || ttlMs > 24 * 60 * 60 * 1000) throw new TypeError('Invalid session lifetime.');
  const name = secure ? '__Host-songlam.sid' : 'songlam.sid';
  const attributes = `Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
  function readId(req) {
    const entries = (req.headers.cookie || '').split(';').map(part => part.trim()).filter(part => part.startsWith(name + '='));
    if (entries.length !== 1) return null;
    const value = entries[0].slice(name.length + 1);
    return cookiePattern.test(value) ? value : null;
  }
  return Object.freeze({
    secure,
    configured: Boolean(store),
    operational: Boolean(store?.durable && store?.approvalReference && !store?.testOnly),
    testOnly: Boolean(store?.testOnly),
    async ready() { return Boolean(store && await bounded(() => store.probe()) === true); },
    clearCookie(res) { res.setHeader('Set-Cookie', `${name}=; ${attributes}; Max-Age=0`); },
    async create(req, res, identity) {
      // Invalidate any prior identifier before issuing a fresh random one.
      const previous = readId(req);
      if (previous) await bounded(() => store.destroy(digest(previous)));
      const id = randomBytes(32).toString('base64url');
      const record = Object.freeze({ appUserId: identity.appUserId, securityVersion: identity.securityVersion,
        csrfToken: randomBytes(32).toString('base64url'), expiresAt: now() + ttlMs });
      // Store contract requires atomic create-if-absent and server-side expiry.
      await bounded(() => store.create(digest(id), record, ttlMs));
      res.setHeader('Set-Cookie', `${name}=${id}; ${attributes}; Max-Age=${Math.floor(ttlMs / 1000)}`);
      return record;
    },
    async read(req) {
      const id = readId(req);
      if (!id) throw unauthorized();
      const key = digest(id), record = await bounded(() => store.get(key));
      if (!record || !Number.isFinite(record.expiresAt) || record.expiresAt <= now()) {
        if (record) await bounded(() => store.destroy(key));
        throw unauthorized();
      }
      if (!cookiePattern.test(record.csrfToken)) throw unauthorized();
      return Object.freeze({ ...record, key });
    },
    async destroy(record) { await bounded(() => store.destroy(record.key)); },
    checkCsrf(req, record) { return equalSecret(req.get('x-csrf-token'), record.csrfToken); }
  });
}

// Adapter for a separately approved persistent session service. No default
// in-memory store and no filesystem/database writes are performed here.
export function createExternalSessionStore({ driver, approvalReference, durable } = {}) {
  if (durable !== true || typeof approvalReference !== 'string' || !approvalReference.trim()
    || ['probe', 'create', 'get', 'destroy'].some(method => typeof driver?.[method] !== 'function')) {
    throw new TypeError('An approved durable session store is required.');
  }
  return Object.freeze({ durable: true, approvalReference, testOnly: false,
    probe: () => driver.probe(), create: (key, record, ttl) => driver.create(key, record, ttl),
    get: key => driver.get(key), destroy: key => driver.destroy(key) });
}
