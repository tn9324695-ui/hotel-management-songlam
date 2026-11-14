import { Router } from 'express';
import { rejectClientActor } from '../auth/security.js';
import { createCatalogService } from './service.js';

export function catalogRoutes({ auth, gateway }) {
  const router = Router();
  const service = createCatalogService({ gateway });
  // Apply authentication only to registered catalog routes, not to every /api/v1
  // path. The G2 refresh of account state/permissions runs on every request.
  const protectedRead = [auth.authenticate, rejectClientActor];
  const send = operation => async (req, res) => {
    const result = await operation(req.auth.actor, req);
    res.json({ ...result, requestId: req.requestId });
  };
  router.get('/catalog/capabilities', ...protectedRead, send(actor=>({data:service.capabilities(actor)})));
  for (const [path, resource] of [['room-types', 'roomTypes'], ['rooms', 'rooms'], ['services', 'services'], ['customers', 'customers'],
    ['rate-plans', 'ratePlans'], ['rate-rules', 'rateRules'], ['policy-versions', 'policyVersions']]) {
    router.get('/' + path, ...protectedRead, send((actor, req) => service.list(actor, resource, req.query, req.requestId)));
    router.get('/' + path + '/:id', ...protectedRead, send((actor, req) => service.detail(actor, resource, req.params.id, req.query, req.requestId)));
  }
  router.get('/hotel-settings', ...protectedRead, send((actor, req) => service.hotelSettings(actor, req.query, req.requestId)));
  router.get('/business-days', ...protectedRead, send((actor, req) => service.list(actor, 'businessDays', req.query, req.requestId)));
  router.get('/business-days/current', ...protectedRead, send((actor, req) => service.currentBusinessDay(actor, req.query, req.requestId)));
  router.get('/business-days/:date', ...protectedRead, send((actor, req) => service.detail(actor, 'businessDays', req.params.date, req.query, req.requestId)));
  return router;
}
