import { managementRoutes } from '../management/routes.js';
import { createAuditService } from './service.js';
export const auditRoutes = ({ auth, gateway }) => managementRoutes({ auth, resource: 'audit', service: createAuditService({ gateway }) });
