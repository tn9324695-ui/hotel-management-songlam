import { managementRoutes } from '../management/routes.js';
import { createUsersService } from './service.js';
export const usersRoutes = ({ auth, gateway }) => managementRoutes({ auth, resource: 'users', service: createUsersService({ gateway }) });
