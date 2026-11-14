import { AppError } from '../../shared/errors.js';
import { bounded, currentIdentity, equalSecret, invalidCredentials, mintActor, unauthorized, unavailable, userId } from './security.js';
import { createPasswordVerifier } from './password-verifier.js';
import { createSessionManager } from './sessions.js';

export function createAuthRuntime({ config, identity, verifier = createPasswordVerifier(), sessions = createSessionManager(), mode = 'operational' } = {}) {
  const fixture = mode === 'fixture';
  if (fixture && config.environment !== 'test') throw new TypeError('Fixture authentication is restricted to NODE_ENV=test.');
  if (!fixture && (identity?.testOnly || sessions.testOnly)) throw new TypeError('Test dependencies cannot enable operational authentication.');
  if (sessions.configured && new URL(config.publicOrigin).protocol === 'https:' && !sessions.secure) throw new TypeError('HTTPS authentication requires Secure session cookies.');
  const configured = Boolean(identity?.credentialLookupConfigured && identity?.currentIdentityConfigured && verifier.configured
    && sessions.configured && (fixture || sessions.operational));
  const enabled = async () => Boolean(configured && await bounded(() => identity.probe()) === true && await sessions.ready());
  async function requireAvailable() { if (!await enabled()) throw unavailable(); }
  const middleware = async (req, res, next) => {
    try {
      await requireAvailable();
      const record = await sessions.read(req);
      // Refresh directly through A2 on EVERY authenticated request; no role cache.
      const person = currentIdentity(await bounded(() => identity.getCurrentIdentity(record.appUserId)));
      if (!person || !person.active || person.appUserId !== record.appUserId || !equalSecret(person.securityVersion, record.securityVersion)) {
        await sessions.destroy(record); sessions.clearCookie(res); throw unauthorized();
      }
      req.auth = Object.freeze({ actor: mintActor(person), person, session: record });
      next();
    } catch (error) { next(error); }
  };
  return Object.freeze({
    fixture,
    configured,
    async status() {
      let loginEnabled = false;
      try { loginEnabled = await enabled(); } catch { /* fail closed on dependency errors */ }
      return { status: loginEnabled ? 'configured' : 'not_configured', loginEnabled,
        message: loginEnabled ? 'Xác thực đã được cấu hình' : 'Chưa cấu hình đăng nhập', stage: 'G2', fixture };
    },
    async requireAvailable(_req, _res, next) { try { await requireAvailable(); next(); } catch (error) { next(error); } },
    authenticate: middleware,
    requirePermission(permission) {
      return (req, _res, next) => {
        if (!req.auth) return next(unauthorized());
        if (!req.auth.actor.permissions.includes(permission)) return next(new AppError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.'));
        next();
      };
    },
    csrf(req, _res, next) {
      if (!req.auth) return next(unauthorized());
      if (!sessions.checkCsrf(req, req.auth.session)) return next(new AppError(403, 'CSRF_REJECTED', 'Mã bảo vệ yêu cầu không hợp lệ.'));
      next();
    },
    async login(req, res) {
      await requireAvailable();
      const password = req.body.password;
      delete req.body.password;
      const credentials = await bounded(() => identity.findCredentials(req.body.username));
      // Work also runs for missing/disabled accounts. Unknown hash formats fail
      // closed; verifier never assumes every SQL account uses one algorithm.
      const matches = await verifier.verify(password, credentials?.passwordHash ?? null);
      if (!credentials || !credentials.active || !matches) throw invalidCredentials();
      const person = currentIdentity(await bounded(() => identity.getCurrentIdentity(userId(credentials.appUserId))));
      if (!person || !person.active || person.appUserId !== userId(credentials.appUserId) || !equalSecret(person.securityVersion, credentials.securityVersion)) throw invalidCredentials();
      const record = await sessions.create(req, res, person);
      res.json({ data: { user: publicUser(person), csrfToken: record.csrfToken }, requestId: req.requestId });
    },
    async logout(req, res) {
      await sessions.destroy(req.auth.session);
      sessions.clearCookie(res);
      res.json({ data: { loggedOut: true }, requestId: req.requestId });
    }
  });
}

export function publicUser(person) {
  return { appUserId: person.appUserId, username: person.username, fullName: person.fullName };
}
