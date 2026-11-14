import { resourceRoutes } from '../operations/routes.js';
import { createLostFoundService } from './service.js';
export const lostFoundRoutes = ({ auth, gateway, config }) => resourceRoutes({ auth, config, service: createLostFoundService({ gateway }), resource: 'items' });
