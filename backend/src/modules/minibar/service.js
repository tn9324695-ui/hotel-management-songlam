import { createConsumptionService } from '../services/service.js';
export const createMinibarService = ({ gateway }) => createConsumptionService({ gateway, resource: 'audits' });
