// Source permission names/schema enums; no new role or permission is granted.
const spec = (read, actions, token = 'version') => Object.freeze({ read: Object.freeze(read), actions: Object.freeze(actions), token });
export const resources = Object.freeze({
  tasks: spec(['manageHousekeepingTasks'], { create: ['manageHousekeepingTasks'], claim: ['manageHousekeepingTasks'], assign: ['manageHousekeepingTasks'],
    start: ['manageHousekeepingTasks', 'updateCleanStatus'], submit: ['manageHousekeepingTasks', 'updateCleanStatus'], unable: ['manageHousekeepingTasks', 'updateCleanStatus'],
    resume: ['manageHousekeepingTasks', 'updateCleanStatus'], 'inspect-approve': ['manageHousekeepingTasks', 'updateCleanStatus'], 'inspect-reject': ['manageHousekeepingTasks', 'updateCleanStatus'] }),
  rooms: spec(['viewRoomRack'], { 'mark-dirty': ['updateCleanStatus'] }),
  tickets: spec(['reportMaintenance'], { create: ['reportMaintenance'], assign: ['reportMaintenance'], claim: ['reportMaintenance'], start: ['reportMaintenance'], progress: ['reportMaintenance'], resolve: ['reportMaintenance'] }),
  blocks: spec(['viewRoomRack'], { create: ['systemConfig'], cancel: ['systemConfig'], end: ['systemConfig'] }),
  items: spec(['manageHousekeepingTasks'], { create: ['manageHousekeepingTasks'], handoff: ['manageHousekeepingTasks'], return: ['manageHousekeepingTasks'] }, 'stateToken')
});
export const taskStatuses = ['PENDING', 'IN_PROGRESS', 'INSPECTING', 'COMPLETED', 'CANCELLED'];
export const cleanStatuses = ['DIRTY', 'CLEANING', 'INSPECTING', 'CLEAN'];
export const ticketStatuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'];
export const priorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
export const taskTypes = ['DEPARTURE', 'STAYOVER', 'INSPECTION', 'OTHER'];
export function taskPhase(row) {
  if (row.unable !== null) return 'UNABLE';
  if (row.status === 'PENDING') return row.assignedToId === null ? 'QUEUED' : 'CLAIMED';
  return { IN_PROGRESS: 'CLEANING', INSPECTING: 'AWAITING_INSPECTION', COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED' }[row.status];
}
