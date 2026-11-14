import { assertActor } from '../auth/security.js';
import { consumptionError } from './amounts.js';

// Existing SQL permission names. No role assignments or new grants.
export const consumptionActions = Object.freeze({ orders: ['create', 'deliver', 'cancel'], audits: ['create', 'confirm', 'dispute'] });
export function requireConsumptionPermission(actor, resource, operation) {
  assertActor(actor);
  const choices = resource === 'orders'
    ? operation === 'catalog' ? ['addServiceOrder', 'manageHousekeepingTasks']
      : ['list', 'detail', 'context'].includes(operation) ? ['addServiceOrder', 'manageCheckOut']
        : operation === 'cancel' ? ['cancelServiceOrder'] : ['create', 'deliver'].includes(operation) ? ['addServiceOrder'] : []
    : resource === 'audits' ? ['list', 'detail', 'context'].includes(operation) ? ['manageHousekeepingTasks', 'manageCheckOut']
      : ['catalog', 'create', 'confirm', 'dispute'].includes(operation) ? ['manageHousekeepingTasks'] : [] : [];
  if (!choices.some(permission => actor.permissions.includes(permission))) throw consumptionError('FORBIDDEN', 'Bạn không có quyền thực hiện thao tác dịch vụ/minibar này.', 403);
}
