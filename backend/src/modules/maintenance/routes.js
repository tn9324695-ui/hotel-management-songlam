import { Router } from 'express';
import { resourceRoutes } from '../operations/routes.js';
import { createMaintenanceService } from './service.js';
export function maintenanceRoutes({ auth, gateway, config }) {
  const router = Router(), service = createMaintenanceService({ gateway });
  router.use('/tickets', resourceRoutes({ auth, service, config, resource: 'tickets' }));
  router.use('/room-blocks', resourceRoutes({ auth, service, config, resource: 'blocks' }));
  return router;
}
