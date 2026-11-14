import { createFinanceService } from '../finance/service.js';
export const createCashierService = ({ gateway }) => createFinanceService({ gateway, resource: 'cashier' });
