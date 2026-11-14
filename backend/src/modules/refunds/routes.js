import { financeRoutes } from '../finance/routes.js';
import { createRefundsService } from './service.js';
export const refundsRoutes = ({ auth, gateway, config }) => financeRoutes({ auth, config, resource: 'refunds', service: createRefundsService({ gateway }) });
