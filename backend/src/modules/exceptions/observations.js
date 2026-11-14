import { assertActor } from '../auth/security.js';
// Rejection telemetry only; no SQL write, no claim of a durable AuditLog row.
export function observeRejectedRequests(logger) {
  return (req, res, next) => {
    const requestPath = req.path, method = req.method;
    res.on('finish', () => {
      if (res.statusCode < 400 || !requestPath.startsWith('/api/')) return;
      let actorId = null; try { assertActor(req.auth?.actor); actorId = req.auth.actor.appUserId; } catch {}
      const rules = [ [/^\/api\/v1\/payments(?:\/([1-9]\d{0,18}))?(?:\/(cancel))?$/, 'PAYMENT'],
        [/^\/api\/v1\/refunds(?:\/([1-9]\d{0,18}))?(?:\/(decide|complete))?$/, 'REFUND'],
        [/^\/api\/v1\/checkouts\/([1-9]\d{0,18})\/(preview|complete)$/, 'CHECKOUT'],
        [/^\/api\/v1\/(?:service-orders|minibar-audits)\/([1-9]\d{0,18})\/(confirm|cancel|deliver|dispute)$/, 'CONSUMPTION'],
        [/^\/api\/v1\/users(?:\/([1-9]\d{0,18}))?(?:\/(roles|permissions))?$/, 'USER_ADMIN'],
        [/^\/api\/v1\/roles(?:\/([1-9]\d{0,18}))?(?:\/(permissions))?$/, 'ROLE_ADMIN'],
        [/^\/api\/v1\/audit(?:\/([1-9]\d{0,18}))?$/, 'AUDIT_QUERY'],
        [/^\/api\/v1\/exceptions(?:\/([1-9]\d{0,18}))?(?:\/(observations))?$/, 'EXCEPTION_QUERY'] ];
      let operation = 'API_REQUEST', entityId = null;
      for (const [pattern, name] of rules) { const match = pattern.exec(requestPath); if (match) { operation = name + (match[2] ? ':' + match[2].toUpperCase() : ''); entityId = match[1] || null; break; } }
      const outcomeCode = typeof res.locals.outcomeCode === 'string' && /^[A-Z0-9_]{1,80}$/.test(res.locals.outcomeCode) ? res.locals.outcomeCode : 'HTTP_REJECTED';
      const unknownCommit = /OUTCOME_UNKNOWN$/.test(outcomeCode) || !['GET', 'HEAD', 'OPTIONS'].includes(method) && res.statusCode >= 500;
      logger.info?.({ event: 'management.observation', persistence: 'APPLICATION_LOG_ONLY', scope: 'HTTP_REQUEST', atUtc: new Date().toISOString(), clockSource: 'APPLICATION_UTC', requestId: req.requestId,
        actorId, actorKind: actorId ? 'USER' : 'UNIDENTIFIED', operation, entityId, status: res.statusCode,
        result: unknownCommit ? 'UNKNOWN' : res.statusCode >= 500 ? 'FAILED' : 'REJECTED', code: outcomeCode });
      // No body, query, headers, username/password, session, hashes, monetary values or SQL error text.
    }); next();
  };
}
