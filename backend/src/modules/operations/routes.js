import { Router } from 'express';
import { rejectClientActor, requireOrigin } from '../auth/security.js';
import { idempotencyKey, identifier, shape } from '../bookings/validation.js';
import { resources } from './model.js';
import { listQuery, operationError } from './validation.js';

export function resourceRoutes({ auth, service, resource, config }) {
  const router = Router(), guards = [auth.authenticate, rejectClientActor];
  router.get('/', ...guards, async (req, res) => res.json({
    ...await service.read(req.auth.actor, resource, 'list', listQuery(resource, req.query), req.requestId), requestId: req.requestId
  }));
  router.get('/:id/history', ...guards, async (req, res) => {
    shape(req.query, ['offset', 'limit'], []);
    res.json({ ...await service.read(req.auth.actor, resource, 'history', {
      ...listQuery(resource, req.query), id: identifier(req.params.id, 'id', resource !== 'rooms')
    }, req.requestId), requestId: req.requestId });
  });
  router.get('/:id', ...guards, async (req, res) => {
    shape(req.query, [], []);
    res.json({ ...await service.read(req.auth.actor, resource, 'detail', { id: identifier(req.params.id, 'id', resource !== 'rooms') }, req.requestId), requestId: req.requestId });
  });
  const writes = [...guards, requireOrigin(config.publicOrigin), auth.csrf, (req, _res, next) => {
    try {
      if (!req.is('application/json')) throw operationError('JSON_REQUIRED', 'Thao tác ghi yêu cầu application/json.', 415);
      shape(req.query, [], []);
      req.operationKey = idempotencyKey(req.get('Idempotency-Key')); next();
    } catch (error) { next(error); }
  }];
  for (const action of Object.keys(resources[resource].actions)) router.post(action === 'create' ? '/' : '/:id/' + action, ...writes, async (req, res) => {
    const data = await service.write(req.auth.actor, resource, action, req.params.id, req.body, req.operationKey, req.requestId);
    res.status(action === 'create' && !data.replayed ? 201 : 200).json({ data, requestId: req.requestId });
  });
  return router;
}
