import { managementRoutes } from '../management/routes.js';
import { createExceptionsService } from './service.js';
export const exceptionsRoutes = ({ auth, gateway }) => managementRoutes({ auth, resource: 'exceptions', service: createExceptionsService({ gateway }) });
