import { createFinanceService } from '../finance/service.js';
export const createInvoicesService = ({ gateway }) => createFinanceService({ gateway, resource: 'invoices' });
