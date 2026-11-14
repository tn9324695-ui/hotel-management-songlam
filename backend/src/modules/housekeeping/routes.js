import { Router } from 'express';
import { resourceRoutes } from '../operations/routes.js';
import { createHousekeepingService } from './service.js';
export function housekeepingRoutes({ auth, gateway, config }) {
  const router = Router(), service = createHousekeepingService({ gateway });
  router.use('/tasks', resourceRoutes({ auth, service, config, resource: 'tasks' }));
  router.use('/rooms', resourceRoutes({ auth, service, config, resource: 'rooms' }));
  return router;
}
