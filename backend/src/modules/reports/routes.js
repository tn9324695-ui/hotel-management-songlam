import { Router } from 'express';
import { rejectClientActor } from '../auth/security.js';
import { shape } from '../bookings/validation.js';
import { reportQuery } from '../management/validation.js';
import { reportMetrics } from './definitions.js';
import { managementError } from '../management/model.js';
export function reportsRoutes({ auth, service }) {
  const router = Router(), guards = [auth.authenticate, rejectClientActor];
  router.get('/capabilities', ...guards, (req, res) => res.json({ data: service.capabilities(req.auth.actor), requestId: req.requestId }));
  router.get('/context', ...guards, async (req, res) => { shape(req.query, [], []); res.json({ data: await service.context(req.auth.actor, req.requestId), requestId: req.requestId }); });
  router.get('/definitions', ...guards, (req, res) => {
    shape(req.query, ['report'], ['report']); if (!Object.hasOwn(reportMetrics, req.query.report)) throw managementError('REPORT_NOT_SUPPORTED', 'Báo cáo chưa hỗ trợ.', 400);
    res.json({ data: service.definitions(req.auth.actor, req.query.report), requestId: req.requestId });
  });
  for (const report of Object.keys(reportMetrics)) router.get('/' + report, ...guards, async (req, res) => {
    res.json({ ...await service.read(req.auth.actor, report, reportQuery(report, req.query), req.requestId), requestId: req.requestId });
  });
  return router;
}
