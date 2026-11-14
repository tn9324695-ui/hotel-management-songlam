import { financeResources } from '../finance/model.js';
import { resources } from '../operations/model.js';
import { consumptionActions } from '../services/permissions.js';

const rows = [];
const add = (operation, method, template) => rows.push(Object.freeze({ operation, method, template }));
add('customers.create', 'POST', '/customers');
add('bookings.create', 'POST', '/bookings');
add('bookings.group', 'POST', '/bookings/groups');
add('bookings.assign', 'PUT', '/bookings/:id/rooms/:id/assignment');
add('bookings.cancel', 'POST', '/bookings/:id/cancel');
add('bookings.cancelRooms', 'POST', '/bookings/:id/rooms/cancel');
add('stays.checkIn', 'POST', '/stays/check-in');
for (const operation of ['transfer-room', 'extend', 'shorten']) add('stays.' + operation, 'POST', '/stays/:id/' + operation);
for (const [resource, prefix] of Object.entries({ tasks: '/housekeeping/tasks', rooms: '/housekeeping/rooms', tickets: '/maintenance/tickets', blocks: '/maintenance/room-blocks', items: '/lost-found' })) {
  for (const operation of Object.keys(resources[resource].actions)) add(resource + '.' + operation, 'POST', prefix + (operation === 'create' ? '' : '/:id/' + operation));
}
for (const [resource, prefix] of Object.entries({ orders: '/service-orders', audits: '/minibar-audits' })) {
  for (const operation of consumptionActions[resource]) add(resource + '.' + operation, 'POST', prefix + (operation === 'create' ? '' : '/:id/' + operation));
}
for (const [resource, prefix] of Object.entries({ folios: '/folios', deposits: '/deposit-accounts', payments: '/payments', refunds: '/refunds', checkouts: '/checkouts', invoices: '/invoices', cashier: '/cashier/shifts', days: '/finance/business-days' })) {
  for (const operation of Object.keys(financeResources[resource].commands)) add(resource + '.' + operation, 'POST', prefix + (['create', 'open'].includes(operation) ? '' : '/:id/' + operation));
}
export const cutoverOperations = Object.freeze(rows);
export function matchOperation(method, path) {
  return rows.find(row => row.method === method && new RegExp('^' + row.template.replaceAll(':id', '(?:[1-9]\\d{0,18}|\\d{4}-\\d{2}-\\d{2})') + '/?$').test(path)) || null;
}
export function nonBusinessWrite(method, path) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;
  if (method !== 'POST') return false;
  return /^\/auth\/(login|logout)\/?$/.test(path) || path === '/requests/lookup'
    || /^\/stays\/[1-9]\d{0,18}\/price-change-preview\/?$/.test(path)
    || /^\/pricing\/quotes\/(nightly|hourly|early-departure)\/?$/.test(path)
    || /^\/(checkouts|cashier\/shifts|finance\/business-days)\/(?:[1-9]\d{0,18}|\d{4}-\d{2}-\d{2})\/preview\/?$/.test(path);
}
