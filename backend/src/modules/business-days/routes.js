import { financeRoutes } from '../finance/routes.js';
import { createBusinessDaysService } from './service.js';
export const businessDaysRoutes = ({ auth, gateway, config }) => financeRoutes({ auth, config, resource: 'days', service: createBusinessDaysService({ gateway }) });
