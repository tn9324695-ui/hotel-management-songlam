import { createManagementService } from '../management/service.js';
export const createExceptionsService = ({ gateway }) => createManagementService({ gateway, resource: 'exceptions' });
