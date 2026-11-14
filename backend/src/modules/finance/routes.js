import { Router } from 'express';
import { rejectClientActor, requireOrigin } from '../auth/security.js';
import { idempotencyKey, shape } from '../bookings/validation.js';
import { financeResources } from './model.js';
import { financeQuery, financeId } from './validation.js';
import { financeError } from './money.js';
export function financeRoutes({ auth, service, resource, config }) {
  const router = Router(), guards = [auth.authenticate, rejectClientActor];
  router.get('/capabilities', ...guards, (req, res) => res.json({ data: service.capabilities(req.auth.actor), requestId: req.requestId }));
  router.get('/context', ...guards, async (req, res) => res.json({ ...await service.read(req.auth.actor, 'context', financeQuery(resource, 'context', req.query), req.requestId), requestId: req.requestId }));
  router.get('/', ...guards, async (req, res) => res.json({ ...await service.read(req.auth.actor, 'list', financeQuery(resource, 'list', req.query), req.requestId), requestId: req.requestId }));
  router.get('/:id', ...guards, async (req, res) => {
    shape(req.query, [], []); res.json({ ...await service.read(req.auth.actor, 'detail', { id: financeId(resource, req.params.id) }, req.requestId), requestId: req.requestId });
  });
  if (['folios', 'deposits'].includes(resource)) {
    const operation = resource === 'folios' ? 'entries' : 'movements';
    router.get('/:id/' + operation, ...guards, async (req, res) => {
      shape(req.query, ['offset', 'limit'], []);
      res.json({ ...await service.read(req.auth.actor, operation, { ...financeQuery(resource, operation, req.query), id: financeId(resource, req.params.id) }, req.requestId), requestId: req.requestId });
    });
  }
  const csrf = [...guards, requireOrigin(config.publicOrigin), auth.csrf, (req, _res, next) => {
    try { if (!req.is('application/json')) throw financeError('JSON_REQUIRED', 'Thao tác tài chính yêu cầu application/json.', 415); shape(req.query, [], []); next(); } catch (error) { next(error); }
  }];
  if (['checkouts', 'cashier', 'days'].includes(resource)) router.post('/:id/preview', ...csrf, async (req, res) => {
    res.json({ ...await service.preview(req.auth.actor, financeId(resource, req.params.id), req.body, req.requestId), requestId: req.requestId });
  });
  for (const operation of Object.keys(financeResources[resource].commands)) router.post(['create', 'open'].includes(operation) ? '/' : '/:id/' + operation, ...csrf, async (req, res) => {
    const data = await service.write(req.auth.actor, operation, req.params.id, req.body, idempotencyKey(req.get('Idempotency-Key')), req.requestId);
    res.status(['create', 'open'].includes(operation) && !data.replayed ? 201 : 200).json({ data, requestId: req.requestId });
  });
  return router;
}
