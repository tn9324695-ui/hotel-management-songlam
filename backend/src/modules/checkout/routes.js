import { financeRoutes } from '../finance/routes.js';
import { createCheckoutService } from './service.js';
export const checkoutRoutes = ({ auth, gateway, config }) => financeRoutes({ auth, config, resource: 'checkouts', service: createCheckoutService({ gateway }) });
