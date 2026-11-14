import { createManagementService } from '../management/service.js';
export const createRolesService = ({ gateway }) => createManagementService({ gateway, resource: 'roles' });
