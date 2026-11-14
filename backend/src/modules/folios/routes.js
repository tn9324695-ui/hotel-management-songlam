import { financeRoutes } from '../finance/routes.js';
import { createFoliosService } from './service.js';
export const foliosRoutes = ({ auth, gateway, config }) => financeRoutes({ auth, config, resource: 'folios', service: createFoliosService({ gateway }) });
