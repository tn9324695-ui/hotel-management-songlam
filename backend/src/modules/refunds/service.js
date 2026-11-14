import { createFinanceService } from '../finance/service.js';
export const createRefundsService = ({ gateway }) => createFinanceService({ gateway, resource: 'refunds' });
