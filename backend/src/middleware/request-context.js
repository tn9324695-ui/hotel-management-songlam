import { randomUUID } from 'node:crypto';

export function requestContext(logger) {
  return (req, res, next) => {
    const incoming = req.get('x-request-id');
    // Correlation identifiers must not become an arbitrary user-controlled PII log field.
    req.requestId = typeof incoming === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-ID', req.requestId);
    res.on('finish', () => {
      // Intentionally omit URL/query, headers, request body, exception text and config.
      logger.info?.({ event: 'request.completed', requestId: req.requestId, method: req.method, status: res.statusCode });
    });
    next();
  };
}
