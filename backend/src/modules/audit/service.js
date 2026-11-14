import { createManagementService } from '../management/service.js';
export const createAuditService = ({ gateway }) => createManagementService({ gateway, resource: 'audit' });
