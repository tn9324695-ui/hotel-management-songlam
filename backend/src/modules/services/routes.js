import { Router } from 'express';
import { rejectClientActor, requireOrigin } from '../auth/security.js';
import { shape, identifier, idempotencyKey } from '../bookings/validation.js';
import { consumptionActions } from './permissions.js';
import { consumptionQuery } from './validation.js';
import { consumptionError } from './amounts.js';
import { createServicesService } from './service.js';

export function consumptionRoutes({ auth, service, resource, config }) {
  const router = Router(), guards = [auth.authenticate, rejectClientActor];
  router.get('/capabilities', ...guards, (req, res) => res.json({ data: service.capabilities(req.auth.actor), requestId: req.requestId }));
  for (const [path, operation] of [['/catalog', 'catalog'], ['/context', 'context'], ['/', 'list']]) router.get(path, ...guards, async (req, res) => {
    res.json({ ...await service.read(req.auth.actor, operation, consumptionQuery(resource, operation, req.query), req.requestId), requestId: req.requestId });
  });
  router.get('/:id', ...guards, async (req, res) => {
    shape(req.query, [], []);
    res.json({ ...await service.read(req.auth.actor, 'detail', { id: identifier(req.params.id) }, req.requestId), requestId: req.requestId });
  });
  const writes = [...guards, requireOrigin(config.publicOrigin), auth.csrf, (req, _res, next) => {
    try {
      if (!req.is('application/json')) throw consumptionError('JSON_REQUIRED', 'Thao tác G8 yêu cầu application/json.', 415);
      shape(req.query, [], []); req.consumptionKey = idempotencyKey(req.get('Idempotency-Key')); next();
    } catch (error) { next(error); }
  }];
  for (const operation of consumptionActions[resource]) router.post(operation === 'create' ? '/' : '/:id/' + operation, ...writes, async (req, res) => {
    const data = await service.write(req.auth.actor, operation, req.params.id, req.body, req.consumptionKey, req.requestId);
    res.status(operation === 'create' && !data.replayed ? 201 : 200).json({ data, requestId: req.requestId });
  });
  return router;
}
export const servicesRoutes = ({ auth, gateway, config }) => consumptionRoutes({ auth, config, resource: 'orders', service: createServicesService({ gateway }) });
