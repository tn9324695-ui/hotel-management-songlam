import { createFinanceService } from '../finance/service.js';
export const createFoliosService = ({ gateway }) => createFinanceService({ gateway, resource: 'folios' });
