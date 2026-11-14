import { createManagementService } from '../management/service.js';
export const createUsersService = ({ gateway }) => createManagementService({ gateway, resource: 'users' });
