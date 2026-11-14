import { createFinanceService } from '../finance/service.js';
import { financeRoutes } from '../finance/routes.js';
export const depositsRoutes = ({ auth, gateway, config }) => financeRoutes({ auth, config, resource: 'deposits', service: createFinanceService({ gateway, resource: 'deposits' }) });
