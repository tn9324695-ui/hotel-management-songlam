import { managementRoutes } from '../management/routes.js';
import { createRolesService } from './service.js';
export const rolesRoutes = ({ auth, gateway }) => managementRoutes({ auth, resource: 'roles', service: createRolesService({ gateway }) });
