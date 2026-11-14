(function (root) {
  'use strict';
  // UI visibility only. Rights originate in G2 and backend checks every command.
  root.SongLamPermissions = Object.freeze({
    home() {
      const has = code => root.SongLamSession.current()?.permissions.includes(code);
      // Shared room-rack access must not send every staff member to reception.
      // These are landing-page preferences only, never grants or role claims.
      if (has('systemConfig')) return 'admin-api.html';
      if (['createBooking', 'manageCheckIn'].some(has)) return 'reception-api.html';
      if (['collectPayment', 'approveRefund', 'manageCheckOut'].some(has)) return 'finance-api.html';
      if (['updateCleanStatus', 'manageHousekeepingTasks', 'reportMaintenance'].some(has)) return 'housekeeping-api.html';
      if (has('addServiceOrder')) return 'services-api.html';
      if (has('viewRoomRack')) return 'reception-api.html';
      return 'admin-api.html';
    },
    has: code => root.SongLamSession.current()?.permissions.includes(code) === true,
    any: codes => codes.some(code => root.SongLamSession.current()?.permissions.includes(code) === true),
    async canWrite(method, path, rights) {
      if (!root.SongLamPermissions.any(rights)) return false;
      if (typeof root.SongLamWrites?.pending !== 'function') return false;
      try { if (root.SongLamWrites?.pending().length) return false; } catch { return false; }
      const state = await root.SongLamDeployment.refresh();
      return state.mode === 'sql' && state.writable === true && state.operations.some(operation => operation.method === method &&
        new RegExp('^' + operation.template.replaceAll(':id', '(?:[1-9]\\d{0,18}|\\d{4}-\\d{2}-\\d{2})') + '$').test(path));
    }
  });
}(window));
