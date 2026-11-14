import { createFinanceService } from '../finance/service.js';
export const createCheckoutService = ({ gateway }) => createFinanceService({ gateway, resource: 'checkouts' });
