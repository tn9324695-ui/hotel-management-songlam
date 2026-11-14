/* Read-only models: demo uses SongLamStore; API mode only presents validated backend values. */
(function () {
  'use strict';
  if (typeof document !== 'undefined' && document.documentElement?.dataset?.pmsMode === 'api') {
    const metricView = metric => {
      if (!metric || metric.status !== 'AVAILABLE') return { ...metric, display: 'Chưa có dữ liệu đối soát', available: false };
      if (typeof metric.value !== 'string' || !/^(0|-?[1-9]\d*)$/.test(metric.value)) throw new TypeError('Giá trị chỉ số API không hợp lệ.');
      return { ...metric, display: BigInt(metric.value).toLocaleString('vi-VN') + (metric.unit.startsWith('VND') ? ' ₫' : ''), available: true };
    };
    window.SongLamApiData = Object.freeze({ metricView, reportView: value => {
      if (!value?.period || !Array.isArray(value.metrics)) throw new TypeError('API thiếu kỳ hoặc định nghĩa chỉ số.');
      return { ...value, metrics: value.metrics.map(metricView) };
    } });
    // Do not instantiate/read SongLamStore or fall back to legacy snapshot() in API mode.
    return;
  }
  const dateOnly = value => String(value || '').slice(0, 10);
  const money = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const activeBooking = b => ['confirmed', 'partially_checked_in'].includes(b.bookingStatus);
  function outstanding(stay, folio) {
    if (!folio) return 0;
    if (folio.billedToMaster) {
      // Checkout closes the room folio, but does not collect the transferred master balance.
      return Math.max(0, money(folio.masterFolio?.balanceDue)) +
        (stay.status === 'in_house' ? Math.max(0, money(folio.incidentalFolio?.balanceDue)) : 0);
    }
    return Math.max(0, money(folio.remainingDue));
  }
  function snapshot(store, from, to) {
    const data = store.getData();
    const day = store.getWorkingDate();
    from = from || day;
    to = to || store.addDays(day, 1);
    const inRange = value => dateOnly(value) >= from && dateOnly(value) < to;
    const rooms = data.rooms || [];
    const stays = data.stays || [];
    const bookings = data.bookings || [];
    const transactions = (data.transactions || []).filter(t => t.status === 'success' &&
      !t.isInternalAllocation && !['internal_allocation', 'guarantee_deposit_deduction'].includes(t.type) &&
      !String(t.referenceCode || '').startsWith('ALLOC-') && !String(t.id || '').startsWith('GD-ALLOC-') && inRange(t.timestamp));
    const isRefund = t => ['refund', 'guarantee_deposit_refund'].includes(t.type);
    const income = transactions.filter(t => !isRefund(t)).reduce((sum, t) => sum + money(t.amount), 0);
    const expense = transactions.filter(isRefund).reduce((sum, t) => sum + money(t.amount), 0);
    const folios = stays.map(stay => {
      const folio = store.calculateStayFolio(stay.id);
      return { stay, folio, due: outstanding(stay, folio) };
    }).filter(x => x.folio);
    const closed = folios.filter(x => x.stay.status === 'checked_out' && inRange(x.stay.actualCheckOutDate));
    const debt = folios.filter(x => x.due > 0);
    const arrivals = bookings.filter(b => activeBooking(b) && dateOnly(b.checkInDate) === day);
    const departures = stays.filter(s => s.status === 'in_house' && dateOnly(s.expectedCheckOutDate) === day);
    return {
      day, from, to, data, rooms, arrivals, departures, transactions, closed, debt,
      occupied: rooms.filter(r => r.stayStatus === 'occupied').length,
      ready: rooms.filter(r => r.stayStatus === 'vacant' && r.cleanStatus === 'clean' && r.exploitationStatus === 'active').length,
      dirty: rooms.filter(r => r.cleanStatus === 'dirty').length,
      cleaning: rooms.filter(r => r.cleanStatus === 'cleaning').length,
      inspecting: rooms.filter(r => r.cleanStatus === 'inspecting').length,
      unavailable: rooms.filter(r => r.exploitationStatus !== 'active').length,
      arrivalRooms: arrivals.reduce((sum, b) => sum + Math.max(0, (b.roomQuantity || 1) - (b.checkedInRooms || []).length), 0),
      revenue: closed.reduce((sum, x) => sum + money(x.stay.folioSnapshot?.totalAmount ?? x.folio.totalAmount), 0),
      receivable: debt.reduce((sum, x) => sum + x.due, 0),
      income, expense, cashflow: income - expense,
      pendingPayments: (data.transactions || []).filter(t => t.status === 'pending'),
      pendingRefunds: (data.refundRequests || []).filter(r => ['pending', 'approved'].includes(r.status)),
      unassigned: arrivals.filter(b => (b.assignedRooms || []).length < (b.roomQuantity || 1)),
      notReady: arrivals.filter(b => (b.assignedRooms || []).some(number => !(b.checkedInRooms || []).includes(number) &&
        rooms.some(r => r.number === number && (r.stayStatus !== 'vacant' || r.cleanStatus !== 'clean' || r.exploitationStatus !== 'active'))))
    };
  }
  function timeline(store, start, days, filters = {}) {
    const data = store.getData();
    const end = store.addDays(start, days);
    const query = String(filters.search || '').toLocaleLowerCase('vi').trim();
    const dates = Array.from({ length: days }, (_, i) => store.addDays(start, i));
    const rows = (data.rooms || []).filter(r => (!filters.floor || filters.floor === 'all' || String(r.floor) === String(filters.floor)) &&
      (!filters.classCode || filters.classCode === 'all' || r.classCode === filters.classCode)).map(room => {
      const events = [];
      (data.stays || []).filter(s => s.roomNumber === room.number).forEach(s => {
        const first = dateOnly(s.checkInDate);
        const last = dateOnly(s.status === 'checked_out' ? s.actualCheckOutDate || s.expectedCheckOutDate : s.expectedCheckOutDate);
        const effectiveEnd = s.status === 'in_house' && last <= store.getWorkingDate() ? store.addDays(store.getWorkingDate(), 1) : last;
        if (first < end && effectiveEnd > start) events.push({ id: s.id, type: 'stay', start: first, end: effectiveEnd,
          title: s.guest?.name || 'Khách lưu trú', status: s.status, overdue: s.status === 'in_house' && last < store.getWorkingDate(), roomId: room.id, roomNumber: room.number });
      });
      (data.bookings || []).filter(b => activeBooking(b) && (b.assignedRooms || []).includes(room.number) && !(b.checkedInRooms || []).includes(room.number)).forEach(b => {
        if (dateOnly(b.checkInDate) < end && dateOnly(b.checkOutDate) > start) events.push({ id: b.id, type: 'booking', start: dateOnly(b.checkInDate), end: dateOnly(b.checkOutDate), title: b.guestName || b.guest?.name || b.id, roomId: room.id, roomNumber: room.number });
      });
      if (room.exploitationStatus !== 'active') events.push({ id: room.id, type: 'maintenance', start, end, title: 'Ngừng khai thác', roomId: room.id });
      events.sort((a, b) => a.start.localeCompare(b.start));
      const lanes = [];
      events.forEach(ev => {
        let lane = lanes.findIndex(last => last <= ev.start);
        if (lane < 0) lane = lanes.length;
        lanes[lane] = ev.end;
        ev.lane = lane;
        ev.conflict = ev.type !== 'maintenance' && events.some(other => other !== ev && other.type !== 'maintenance' && ev.start < other.end && ev.end > other.start);
      });
      return { ...room, events, lanes: Math.max(1, lanes.length) };
    }).filter(r => !query || [r.number, r.classCode, ...r.events.map(e => e.title)].join(' ').toLocaleLowerCase('vi').includes(query));
    const unassigned = (data.bookings || []).filter(b => activeBooking(b) && dateOnly(b.checkInDate) < end && dateOnly(b.checkOutDate) > start && (b.assignedRooms || []).length < (b.roomQuantity || 1));
    return { dates, rows, unassigned, end };
  }
  window.SongLamViewData = { snapshot, timeline, dateOnly, outstanding };
})();
