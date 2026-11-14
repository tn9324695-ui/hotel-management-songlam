import { consumptionRoutes } from '../services/routes.js';
import { createMinibarService } from './service.js';
export const minibarRoutes = ({ auth, gateway, config }) => consumptionRoutes({ auth, config, resource: 'audits', service: createMinibarService({ gateway }) });
