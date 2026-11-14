import { financeRoutes } from '../finance/routes.js';
import { createPaymentsService } from './service.js';
export const paymentsRoutes = ({ auth, gateway, config }) => financeRoutes({ auth, config, resource: 'payments', service: createPaymentsService({ gateway }) });
