import { financeRoutes } from '../finance/routes.js';
import { createCashierService } from './service.js';
export const cashierRoutes = ({ auth, gateway, config }) => financeRoutes({ auth, config, resource: 'cashier', service: createCashierService({ gateway }) });
