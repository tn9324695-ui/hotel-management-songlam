import { createFinanceService } from '../finance/service.js';
export const createPaymentsService = ({ gateway }) => createFinanceService({ gateway, resource: 'payments' });
