import { createFinanceService } from '../finance/service.js';
export const createBusinessDaysService = ({ gateway }) => createFinanceService({ gateway, resource: 'days' });
