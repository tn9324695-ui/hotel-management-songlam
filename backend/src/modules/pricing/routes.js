import { Router } from 'express';
import { AppError } from '../../shared/errors.js';
import { rejectClientActor, requireOrigin } from '../auth/security.js';
import { createPricingService } from './service.js';

export function pricingRoutes({ auth, gateway, config }) {
  const router = Router(), service = createPricingService({ gateway });
  for (const operation of ['nightly', 'hourly', 'early-departure']) {
    router.post('/quotes/' + operation, auth.authenticate, rejectClientActor, requireOrigin(config.publicOrigin), auth.csrf, async (req, res) => {
      if (!req.is('application/json')) throw new AppError(415, 'JSON_REQUIRED', 'Báo giá yêu cầu Content-Type application/json.');
      if (Object.keys(req.query).length) throw new AppError(400, 'VALIDATION_ERROR', 'Báo giá không nhận tham số query.');
      const data = await service.quote(req.auth.actor, operation, req.body, req.requestId);
      res.json({ data, requestId: req.requestId });
    });
  }
  return router;
}
