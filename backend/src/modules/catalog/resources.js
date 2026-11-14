// Permission names and SQL source entities were read from 006_command_gateway.sql.
// These definitions DO NOT authorize a SQL contract or add permissions to any role.
function resource(definition) {
  const filters = Object.freeze(Object.fromEntries(Object.entries(definition.filters).map(([key, rule]) => [key,
    Object.freeze({ ...rule, ...(rule.values ? { values: Object.freeze([...rule.values]) } : {}) })])));
  return Object.freeze({ ...definition, permissions: Object.freeze(definition.permissions), filters });
}
export const catalogResources = Object.freeze({
  ratePlans: resource({ sqlResource: 'RatePlan', permissions: ['viewRoomRack'], key: 'int', maxLimit: 200,
    filters: { q: { type: 'text', max: 120 }, active: { type: 'boolean' }, stayType: { type: 'enum', values: ['NIGHTLY', 'HOURLY'] } } }),
  rateRules: resource({ sqlResource: 'RateRule', permissions: ['viewRoomRack'], key: 'bigint', maxLimit: 200,
    filters: { ratePlanId: { type: 'int' }, roomTypeId: { type: 'int' }, from: { type: 'date' }, to: { type: 'date' }, dayKind: { type: 'enum', values: ['BASE', 'WEEKEND', 'HOLIDAY', 'SPECIFIC'] } } }),
  policyVersions: resource({ sqlResource: 'PolicyVersion', permissions: ['viewRoomRack'], key: 'int', maxLimit: 200,
    filters: { code: { type: 'text', max: 40 } } }),
  roomTypes: resource({ sqlResource: 'RoomType', permissions: ['viewRoomRack'], key: 'int', maxLimit: 200,
    filters: { q: { type: 'text', max: 120 }, active: { type: 'boolean' } } }),
  rooms: resource({ sqlResource: 'vRoomStatus', permissions: ['viewRoomRack'], key: 'int', maxLimit: 200,
    filters: { q: { type: 'text', max: 20 }, roomTypeId: { type: 'int' }, floor: { type: 'text', max: 30 },
      occupancyStatus: { type: 'enum', values: ['VACANT', 'OCCUPIED'] },
      cleanlinessStatus: { type: 'enum', values: ['CLEAN', 'DIRTY', 'CLEANING', 'INSPECTING'] },
      exploitationStatus: { type: 'enum', values: ['ACTIVE', 'INACTIVE', 'MAINTENANCE'] } } }),
  services: resource({ sqlResource: 'Service', permissions: ['addServiceOrder', 'manageHousekeepingTasks'], key: 'int', maxLimit: 200,
    filters: { q: { type: 'text', max: 160 }, category: { type: 'text', max: 30 }, active: { type: 'boolean' } } }),
  hotelSettings: resource({ sqlResource: 'HotelSettings', permissions: ['viewRoomRack'], key: 'int', maxLimit: 1, filters: {} }),
  businessDays: resource({ sqlResource: 'BusinessDay', permissions: ['viewDailyRevenue'], key: 'date', maxLimit: 200,
    filters: { from: { type: 'date' }, to: { type: 'date' }, status: { type: 'enum', values: ['OPEN', 'CLOSED'] } } }),
  customers: resource({ sqlResource: 'Customer', permissions: ['createBooking', 'manageCheckOut'], key: 'bigint', maxLimit: 50,
    filters: { q: { type: 'text', min: 2, max: 160 }, phone: { type: 'text', min: 3, max: 30 },
      code: { type: 'text', max: 40 }, active: { type: 'boolean' } } })
});

export function getCatalogResource(name) {
  return Object.hasOwn(catalogResources, name) ? catalogResources[name] : null;
}
