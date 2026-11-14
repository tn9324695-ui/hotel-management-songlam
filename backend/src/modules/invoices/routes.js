import { financeRoutes } from '../finance/routes.js';
import { createInvoicesService } from './service.js';
export const invoicesRoutes = ({ auth, gateway, config }) => financeRoutes({ auth, config, resource: 'invoices', service: createInvoicesService({ gateway }) });
