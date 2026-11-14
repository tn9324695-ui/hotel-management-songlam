/* Shared Tabler-based UI for the three existing workspaces. */
(function () {
  'use strict';
  const store = window.SongLamStore;
  const view = window.SongLamViewData;
  const esc = value => store.escapeHtml(String(value ?? ''));
  const currency = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);
  const date = value => store.formatDate(value);
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  let api, context, portal, observer;
  let reportPeriod = 'today';
  const tableQueries = {};
  const searchableScreens = new Set(['room_classes','rooms_catalog','rates_policies','services_catalog','stays','billing','system_admin','housekeeping','exceptions','shifts_audit','hk_task_list','hk_minibar_check','hk_maintenance_reports','hk_lost_found','rec_arrivals','rec_departures','rec_stays','rec_services']);
  function tableKey() { return context().screen + ':' + (api.state?.adminSubTab || '') + ':' + (api.state?.billingTab || ''); }
  function filterTable(value) {
    tableQueries[tableKey()] = value;
    const query=value.trim().toLocaleLowerCase('vi');
    document.querySelectorAll('#mainContent table tbody').forEach(body => {
      const rows=[...body.children].filter(row=>!row.classList.contains('pms-search-empty'));
      rows.forEach(row=>row.hidden = Boolean(query) && !row.textContent.toLocaleLowerCase('vi').includes(query));
      let empty=body.querySelector('.pms-search-empty');
      if (!empty) {
        empty=document.createElement('tr');empty.className='pms-search-empty';
        const cell=document.createElement('td');cell.colSpan=body.closest('table').querySelectorAll('thead th').length || 1;
        cell.className='pms-empty';cell.textContent='Không có bản ghi phù hợp tìm kiếm.';empty.append(cell);body.append(empty);
      }
      empty.hidden=!query || rows.some(row=>!row.hidden);
    });
  }
  const screenPermissions = {
    overview: ['viewRoomRack', 'viewDailyRevenue'], room_rack: ['viewRoomRack'], timeline: ['viewRoomRack'],
    bookings: ['createBooking', 'manageCheckIn'], stays: ['manageCheckIn', 'manageCheckOut', 'collectPayment'],
    customers: ['createBooking', 'manageCheckIn'], room_classes: ['viewRoomRack', 'editRoomClasses'],
    rooms_catalog: ['viewRoomRack', 'editRoomClasses'], rates_policies: ['editRoomClasses'], services_catalog: ['addServiceOrder', 'editRoomClasses'],
    housekeeping: ['updateCleanStatus', 'manageHousekeepingTasks'], billing: ['collectPayment', 'approveRefund', 'printVatInvoice'],
    exceptions: ['manageCheckOut', 'approveRefund'], reports: ['viewDailyRevenue'],
    system_admin: ['systemConfig', 'viewAuditLog'], shifts_audit: ['collectPayment', 'systemConfig'],
    rec_room_rack: ['viewRoomRack'], rec_timeline: ['viewRoomRack'], rec_arrivals: ['manageCheckIn'], rec_departures: ['manageCheckOut'],
    rec_bookings: ['createBooking'], rec_stays: ['viewRoomRack'], rec_services: ['addServiceOrder'],
    hk_room_board: ['updateCleanStatus'], hk_task_list: ['updateCleanStatus', 'manageHousekeepingTasks'],
    hk_minibar_check: ['updateCleanStatus'], hk_maintenance_reports: ['reportMaintenance'], hk_lost_found: ['updateCleanStatus']
  };
  const actionPermissions = {};
  function actions(permission, names) { names.split(' ').forEach(name => actionPermissions[name] = permission); }
  actions('manageCheckIn', 'openQuickWalkInModal openDirectCheckInModal submitDirectCheckIn openCheckInForBooking submitCheckInFromBooking openBulkAssignRoomsModal submitBulkAssignRooms openBulkCheckInModal submitBulkCheckIn');
  actions('manageCheckOut', 'openCheckoutModal confirmCheckoutFolio openShortenStayModal submitShortenStay transferToMasterFolio openAddSurchargeModal submitAddSurcharge toggleLateCheckout');
  actions('createBooking', 'openCreateBookingModal submitCreateBooking openCreateGroupBookingModal submitCreateGroupBooking openAddCustomerModal submitAddCustomer');
  actions('cancelBooking', 'promptCancelBooking');
  actions('manageRoomTransfer', 'openTransferRoomModal submitTransferRoom openExtendStayModal submitExtendStay');
  actions('addServiceOrder', 'openAddServiceModal submitAddService');
  actions('editRoomClasses', 'openAddRoomClassModal openEditRoomClassModal submitRoomClassForm promptDeleteRoomClass openAddRoomModal openEditRoomModal submitRoomForm promptDeleteRoom openEditPricingPolicyModal submitPricingPolicyForm openAddServiceCatalogModal openEditServiceCatalogModal submitServiceCatalogForm promptDeleteServiceCatalog');
  actions('systemConfig', 'openAddRoleModal submitAddRole openAddUserModal submitAddUser toggleRolePermission saveWorkingDate promptResetSampleData openNightAuditModal submitNightAudit');
  actions('approveRefund', 'approveRefundRequest');
  actions('collectPayment', 'completeRefundRequest openRequestRefundModal submitRequestRefund triggerSandboxWebhook openStartShiftModal submitStartShift openCloseShiftModal submitCloseShift');
  actions('printVatInvoice', 'printInvoice');
  actions('manageHousekeepingTasks', 'approveRoomClean approveCleanRoom');
  actions('updateCleanStatus', 'updateRoomCleanState completeTask openNewMinibarAuditModal submitNewMinibarAudit openRecordMinibarModal submitEditMinibarAudit openRecordLostFoundModal submitRecordLostFound');
  actions('reportMaintenance', 'toggleRoomMaintenance openReportMaintenanceModal submitReportMaintenance');
  actions('manageCheckOut', 'openCreateExceptionModal submitCreateException openResolveExceptionModal submitResolveException confirmCheckout');
  function can(permission) {
    if (!context) return false;
    const user = context().user;
    // Follow the configured matrix, including the IT administrator's financial restrictions.
    const code = user.roleCode === 'housekeeping_maid' ? 'housekeeping' : user.roleCode;
    const role = (store.getData().roles || []).find(r => r.code === code);
    if (user.roleCode === 'housekeeping_maid' && permission === 'manageHousekeepingTasks') return false;
    return Boolean(role?.permissions?.[permission]);
  }
  function canScreen(screen) { return (screenPermissions[screen] || []).some(can); }
  function button(label, action, style = 'btn-secondary', permission) {
    return !permission || can(permission) ? `<button type="button" class="btn ${style} btn-sm" onclick="${action}">${label}</button>` : '';
  }
  function title(eyebrow, text, description, controls = '') {
    return `<div class="pms-page-heading"><div><div class="pms-eyebrow">${eyebrow}</div><h1>${text}</h1><p>${description}</p></div><div class="page-actions">${controls}</div></div>`;
  }
  function table(headers, rows, empty = 'Không có dữ liệu trong khoảng đã chọn.') {
    return `<div class="table-responsive" tabindex="0" aria-label="Bảng dữ liệu, cuộn ngang để xem thêm"><table class="table table-vcenter card-table"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${headers.length}" class="pms-empty">${empty}</td></tr>`}</tbody></table></div>`;
  }
  function metric(label, value, detail, symbol, tone = 'blue', action = '') {
    return `<${action ? 'button type="button"' : 'div'} class="pms-metric" ${action ? `onclick="${action}"` : ''}><div class="pms-metric-top"><span>${label}</span><span class="pms-metric-icon ${tone}">${icon(symbol)}</span></div><strong>${value}</strong><small>${detail}</small></${action ? 'button' : 'div'}>`;
  }
  function roomShortcut(filter) { if (canScreen('room_rack')) window.app.filterRooms(filter); }
  function overview() {
    const s = view.snapshot(store);
    const pct = s.rooms.length ? Math.round(s.occupied / s.rooms.length * 100) : 0;
    const arrivalRows = s.arrivals.map(b => `<tr><td><strong>${esc(b.guestName || b.guest?.name)}</strong><small class="pms-cell-note">${esc(b.id)}</small></td><td>${esc((b.assignedRooms || []).join(', ') || 'Chưa gán phòng')}<small class="pms-cell-note">${b.roomQuantity || 1} phòng · ${esc(b.roomClassCode)}</small></td><td>${(b.assignedRooms || []).length < (b.roomQuantity || 1) ? '<span class="badge badge-dirty">Chưa đủ phòng</span>' : '<span class="badge badge-clean">Đã gán phòng</span>'}</td><td class="text-end">${button('Nhận phòng', `app.openCheckInForBooking('${esc(b.id)}')`, 'btn-outline-primary', 'manageCheckIn')}</td></tr>`);
    const departureRows = s.departures.map(stay => {
      const folio = store.calculateStayFolio(stay.id);
      return `<tr><td><strong>${esc(stay.guest?.name)}</strong><small class="pms-cell-note">${esc(stay.id)}</small></td><td><span class="badge bg-blue-lt">P.${esc(stay.roomNumber)}</span></td><td class="font-amount">${currency(folio.effectiveRemainingDue ?? folio.remainingDue)}</td><td class="text-end">${button('Trả phòng', `app.openCheckoutModal('${esc(stay.roomNumber)}')`, 'btn-outline-primary', 'manageCheckOut')}</td></tr>`;
    });
    const tasks = [
      ['Chưa gán đủ phòng', s.unassigned.length, 'Đơn đến hôm nay', 'bookings', 'calendar'],
      ['Phòng đón khách chưa sẵn sàng', s.notReady.length, 'Kiểm tra lưu trú, vệ sinh, khai thác', 'housekeeping', 'door-closed'],
      ['Chờ kiểm tra vệ sinh', s.inspecting, 'Cần giám sát duyệt sạch', 'housekeeping', 'check-square'],
      ['Giao dịch chờ xác minh', s.pendingPayments.length, 'Chưa ghi nhận thu thành công', 'billing', 'credit-card'],
      ['Hoàn tiền cần xử lý', s.pendingRefunds.length, 'Chờ duyệt hoặc chờ thực chi', 'billing', 'rotate-ccw']
    ].filter(x => canScreen(x[3]));
    document.getElementById('mainContent').innerHTML = title('QUẢN TRỊ KHÁCH SẠN', 'Tổng quan vận hành', `Ngày nghiệp vụ ${date(s.day)} · Theo dữ liệu đang lưu trên trình duyệt`,
      button(`${icon('calendar-range')} Lịch phòng`, "app.switchScreen('timeline')", 'btn-secondary', 'viewRoomRack') + button(`${icon('plus')} Đặt phòng`, 'app.openCreateBookingModal()', 'btn-primary', 'createBooking')) +
      `<div class="pms-metrics">
        ${metric('Phòng có khách', s.occupied, `${pct}% công suất · ${s.rooms.length} phòng`, 'bed-double', 'blue', "SongLamUI.roomShortcut('occupied')")}
        ${metric('Phòng trống sạch', s.ready, 'Đang khai thác · Có thể đón khách', 'door-open', 'green', "SongLamUI.roomShortcut('ready')")}
        ${metric('Phòng chờ dọn', s.dirty, `${s.cleaning} đang dọn · ${s.inspecting} chờ kiểm tra`, 'spray-can', 'amber', "SongLamUI.roomShortcut('dirty')")}
        ${metric('Ngừng khai thác', s.unavailable, 'Bảo trì hoặc tạm ngưng', 'wrench', 'slate', "SongLamUI.roomShortcut('unavailable')")}
        ${metric('Khách đến hôm nay', s.arrivals.length, `${s.arrivalRooms} phòng còn chờ nhận`, 'log-in', 'blue', canScreen('bookings') ? "app.switchScreen('bookings')" : '')}
        ${metric('Khách trả hôm nay', s.departures.length, 'Lượt ở đến hạn, chưa trả phòng', 'log-out', 'amber', canScreen('stays') ? "app.switchScreen('stays')" : '')}
        ${can('viewDailyRevenue') ? metric('Doanh thu đã quyết toán', currency(s.revenue), `${s.closed.length} folio trả phòng trong ngày`, 'receipt', 'blue') + metric('Công nợ folio', currency(s.receivable), `${s.debt.length} folio còn phải thu · Tất cả ngày`, 'wallet', 'amber') : ''}
      </div>
      <div class="pms-dashboard-grid"><div class="pms-stack">
        <section class="card"><div class="card-header"><h2 class="card-title">Khách đến hôm nay <span class="pms-count">${s.arrivals.length}</span></h2>${button('Tất cả đặt phòng →', "app.switchScreen('bookings')", 'btn-link', 'createBooking')}</div>${table(['Khách / Mã đặt phòng', 'Phòng dự kiến', 'Sắp xếp', 'Thao tác'], arrivalRows, 'Không có đơn còn chờ nhận phòng hôm nay.')}</section>
        <section class="card"><div class="card-header"><h2 class="card-title">Khách trả hôm nay <span class="pms-count">${s.departures.length}</span></h2>${button('Danh sách lưu trú →', "app.switchScreen('stays')", 'btn-link', 'manageCheckOut')}</div>${table(['Khách lưu trú', 'Phòng', 'Còn thu tại phòng', 'Thao tác'], departureRows, 'Không có khách đến hạn trả phòng hôm nay.')}</section>
      </div><div class="pms-stack"><section class="card"><div class="card-header"><h2 class="card-title">Cần xử lý</h2><span class="pms-live">Theo dữ liệu hiện tại</span></div><div class="pms-tasks">${tasks.map(t => `<button class="pms-task" onclick="app.switchScreen('${t[3]}')"><span class="pms-task-icon">${icon(t[4])}</span><span><strong>${t[0]}</strong><small>${t[2]}</small></span><b class="${t[1] ? 'has-count' : ''}">${t[1]}</b></button>`).join('')}</div></section>
        ${can('viewDailyRevenue') ? `<section class="card"><div class="card-header"><h2 class="card-title">Thu · chi trong ngày</h2></div><div class="pms-cash"><div><span>Tiền thu thành công</span><strong>${currency(s.income)}</strong></div><div><span>Hoàn tiền đã thực chi</span><strong>${currency(s.expense)}</strong></div><div class="pms-cash-total"><span>Dòng tiền thuần</span><strong>${currency(s.cashflow)}</strong></div><p>Bao gồm tiền cọc. Loại trừ phân bổ và khấu trừ nội bộ.</p></div></section>` : ''}
        <div class="pms-note">${icon('info')}<span>Ngày nghiệp vụ có thể khác ngày hiện tại. Thanh toán online và hóa đơn điện tử chưa kết nối dịch vụ thật.</span></div>
      </div></div>`;
  }
  function timeline(state, appName) {
    const start = state.timelineStart || store.addDays(store.getWorkingDate(), -2);
    state.timelineStart = start;
    const t = view.timeline(store, start, state.timelineDays, state.timelineFilters);
    const data = store.getData();
    const floors = [...new Set((data.rooms || []).map(r => r.floor))].sort((a, b) => a - b);
    const option = (value, label, selected) => `<option value="${esc(value)}" ${String(selected) === String(value) ? 'selected' : ''}>${esc(label)}</option>`;
    const dayWidth = 100;
    const gridWidth = t.dates.length * dayWidth;
    const dayIndex = d => Math.round((Date.parse(d) - Date.parse(start)) / 86400000);
    document.getElementById('mainContent').innerHTML = title('VẬN HÀNH', 'Lịch đặt phòng', 'Theo đêm lưu trú: ngày trả phòng được giải phóng cho lượt đặt tiếp theo.',
      button(`${icon('users')} Đặt khách đoàn`, `${appName}.openCreateGroupBookingModal()`, 'btn-secondary', 'createBooking') + button(`${icon('plus')} Đặt phòng`, `${appName}.openCreateBookingModal()`, 'btn-primary', 'createBooking')) +
      `<div class="pms-timeline-toolbar"><div class="btn-group">${button('← 7 ngày', `${appName}.shiftTimeline(-7)`)}${button('Hôm nay', `${appName}.resetTimeline()`, 'btn-outline-primary')}${button('7 ngày →', `${appName}.shiftTimeline(7)`)}</div><strong>${date(start)} – ${date(store.addDays(t.end, -1))}</strong><label>Tầng <select class="form-select" onchange="${appName}.setTimelineFilter('floor',this.value)">${option('all', 'Tất cả', state.timelineFilters.floor)}${floors.map(f => option(f, `Tầng ${f}`, state.timelineFilters.floor)).join('')}</select></label><label>Hạng phòng <select class="form-select" onchange="${appName}.setTimelineFilter('classCode',this.value)">${option('all','Tất cả',state.timelineFilters.classCode)}${data.roomClasses.map(c => option(c.code,c.name,state.timelineFilters.classCode)).join('')}</select></label><input class="form-input" aria-label="Tìm phòng hoặc khách trong lịch" placeholder="Tìm phòng, tên khách…" value="${esc(state.timelineFilters.search)}" oninput="${appName}.setTimelineFilter('search',this.value)"></div>
      ${t.unassigned.length ? `<div class="pms-unassigned"><strong>${icon('alert-circle')} ${t.unassigned.length} đơn chưa gán đủ phòng trong khoảng này</strong><div>${t.unassigned.map(b => `<span>${esc(b.guestName || b.guest?.name)} · ${(b.roomQuantity || 1) - (b.assignedRooms || []).length} phòng ${esc(b.roomClassCode)} ${button('Gán phòng', `${appName}.openBulkAssignRoomsModal('${esc(b.id)}')`, 'btn-outline-primary', 'manageCheckIn')}</span>`).join('')}</div></div>` : ''}
      <div class="pms-timeline-legend"><span><i class="blue"></i> Đang lưu trú</span><span><i class="amber"></i> Đã đặt</span><span><i class="slate"></i> Đã trả / Ngừng khai thác</span><span><i class="red"></i> Quá hạn / Trùng lịch</span><span>Cuộn ngang để xem toàn bộ ${state.timelineDays} ngày</span></div>
      <div class="pms-timeline-scroll" tabindex="0" aria-label="Lịch phòng, cuộn ngang và dọc"><div class="pms-timeline" style="width:${gridWidth + 150}px"><div class="pms-timeline-head"><div class="pms-timeline-room">Phòng / Hạng</div>${t.dates.map(d => `<div class="${d === store.getWorkingDate() ? 'is-today' : ''}"><small>${new Date(d + 'T00:00:00').toLocaleDateString('vi-VN', { weekday: 'short' })}</small><strong>${d.slice(8)}/${d.slice(5, 7)}</strong></div>`).join('')}</div>
      ${t.rows.map(r => `<div class="pms-timeline-row" style="height:${Math.max(58, r.lanes * 34 + 16)}px"><div class="pms-timeline-room"><strong>P.${esc(r.number)}</strong><small>${esc(r.classCode)} · ${esc(cleanText(r.cleanStatus))}</small></div><div class="pms-timeline-track" style="width:${gridWidth}px">${t.dates.map((d, i) => `<div class="pms-timeline-cell ${d === store.getWorkingDate() ? 'is-today' : ''}" style="left:${i * dayWidth}px"></div>`).join('')}${r.events.map(e => {
        const left = Math.max(0, dayIndex(e.start));
        const right = Math.min(t.dates.length, dayIndex(e.end));
        const action = e.type === 'booking' ? `${appName}.openCheckInForBooking('${esc(e.id)}')` : `${appName}.openRoomDrawer('${esc(r.id)}')`;
        const readOnly = e.type === 'booking' && !can('manageCheckIn');
        return `<button class="pms-timeline-event ${e.type} ${e.status === 'checked_out' ? 'closed' : ''} ${e.overdue || e.conflict ? 'conflict' : ''}" style="left:${left * dayWidth + 3}px;width:${Math.max(24,(right-left)*dayWidth-6)}px;top:${e.lane * 34 + 10}px" title="${esc(e.title)} · ${date(e.start)} → ${date(e.end)}${e.conflict ? ' · CẢNH BÁO TRÙNG LỊCH' : ''}" ${readOnly ? 'disabled' : `onclick="${action}"`}>${e.conflict ? '⚠ ' : ''}${esc(e.title)}</button>`;
      }).join('')}</div></div>`).join('') || '<div class="pms-empty">Không có phòng phù hợp bộ lọc.</div>'}</div></div>`;
  }
  function cleanText(status) { return ({ clean: 'Sạch', dirty: 'Chờ dọn', cleaning: 'Đang dọn', inspecting: 'Chờ kiểm tra' })[status] || status; }
  function reports() {
    const day = store.getWorkingDate();
    const from = reportPeriod === 'month' ? day.slice(0, 7) + '-01' : day;
    const nextMonth = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 1)).toISOString().slice(0, 10);
    const s = view.snapshot(store, from, reportPeriod === 'month' ? nextMonth : store.addDays(day, 1));
    const methods = { cash: 'Tiền mặt', bank_transfer: 'Chuyển khoản', pos_card: 'Thẻ POS', vietqr: 'VietQR mô phỏng', vnpay_qr: 'VNPay mô phỏng', onepay: 'OnePay mô phỏng' };
    const totals = {};
    s.transactions.forEach(t => {
      const m = t.paymentMethod || 'unknown';
      totals[m] ||= { income: 0, expense: 0, count: 0 };
      totals[m][['refund','guarantee_deposit_refund'].includes(t.type) ? 'expense' : 'income'] += Number(t.amount || 0);
      totals[m].count++;
    });
    document.getElementById('mainContent').innerHTML = title('TÀI CHÍNH', 'Báo cáo & công nợ', `${date(s.from)} – ${date(store.addDays(s.to, -1))} · Đơn vị: VNĐ`,
      `<select class="form-select" aria-label="Kỳ báo cáo" onchange="SongLamUI.setReportPeriod(this.value)"><option value="today" ${reportPeriod === 'today' ? 'selected' : ''}>Ngày nghiệp vụ</option><option value="month" ${reportPeriod === 'month' ? 'selected' : ''}>Tháng nghiệp vụ</option></select>`) +
      `<div class="pms-metrics pms-four">${metric('Doanh thu đã quyết toán',currency(s.revenue),`${s.closed.length} folio trả phòng trong kỳ`,'receipt')}${metric('Tổng tiền thu',currency(s.income),'Giao dịch thành công, gồm tiền cọc','trending-up','green')}${metric('Hoàn tiền đã chi',currency(s.expense),'Theo giao dịch hoàn tiền thành công','rotate-ccw','amber')}${metric('Dòng tiền thuần',currency(s.cashflow),'Tiền thu trừ tiền hoàn','wallet')}</div>
      <section class="card mb-3"><div class="card-header"><h2 class="card-title">Đối soát theo phương thức thanh toán</h2></div>${table(['Phương thức','Giao dịch','Tiền thu','Tiền hoàn','Dòng tiền thuần'],Object.entries(totals).map(([method,m]) => `<tr><td>${esc(methods[method] || method)}</td><td>${m.count}</td><td class="font-amount">${currency(m.income)}</td><td class="font-amount">${currency(m.expense)}</td><td class="font-amount">${currency(m.income-m.expense)}</td></tr>`))}</section>
      <section class="card mb-3"><div class="card-header"><h2 class="card-title">Công nợ folio · Tất cả ngày</h2><strong>${currency(s.receivable)}</strong></div>${table(['Folio / Khách','Phòng','Trạng thái','Tổng chi phí','Còn phải thu'],s.debt.map(({stay,folio,due}) => `<tr><td><strong>${esc(stay.guest?.name)}</strong><small class="pms-cell-note">${esc(stay.id)}</small></td><td>P.${esc(stay.roomNumber)}</td><td>${folio.billedToMaster ? 'Tiền phòng chuyển về đoàn' : stay.status === 'in_house' ? 'Đang lưu trú' : 'Đã trả phòng'}</td><td class="font-amount">${currency(folio.totalAmount)}</td><td class="font-amount">${currency(due)}</td></tr>`),'Không có folio còn phải thu.')}<div class="pms-card-foot">Công nợ lấy từ số dư folio, bao gồm phần chuyển về đoàn; không cộng lại tiền cọc đặt phòng.</div></section>
      <div class="pms-note">${icon('info')}<span>Doanh thu là tổng chi phí trên các folio đã trả phòng trong kỳ; không phải tiền thu. Phân tích nguồn khách, xuất Excel và hóa đơn điện tử: chưa triển khai. Không có tỷ lệ kênh bán giả định.</span></div>`;
  }
  function denied() { document.getElementById('mainContent').innerHTML = title('PHÂN QUYỀN', 'Không có quyền truy cập', 'Vai trò hiện tại không được phép xem màn hình này. Chọn một mục được cấp quyền trong menu.'); }
  function shell() {
    const ctx = context();
    const roleControl = portal === 'general' ? `<label class="pms-role-label">Vai trò mô phỏng<select id="roleSwitcher" class="form-select" onchange="app.switchRole(this.value)"><option value="manager">Quản lý khách sạn</option><option value="cashier">Thu ngân / Kế toán</option><option value="admin">Quản trị hệ thống</option></select></label>` : '';
    const isSqlPort = typeof window !== 'undefined' && window.location.port === '8093';
    const sqlControls = isSqlPort ? `<a href="#" onclick="SongLamUI.logoutSql(event)" class="btn btn-sm btn-outline-danger ms-2" style="font-size:12px;padding:2px 8px;" title="Đăng xuất khỏi phiên SQL">Đăng xuất</a>` : '';
    document.querySelector('.topbar').innerHTML = `<div class="pms-topbar-start"><button class="btn btn-icon btn-secondary sidebar-toggle-btn" aria-label="Đóng mở menu" aria-expanded="true" onclick="SongLamUI.toggleSidebar()">${icon('menu')}</button><span class="pms-workspace">${portal === 'general' ? 'Không gian quản trị' : portal === 'reception' ? 'Quầy lễ tân' : 'Buồng phòng'}</span></div><div class="pms-topbar-end"><span class="working-date-pill">${icon('calendar')}<span>Ngày nghiệp vụ <b id="topbarWorkingDateText">${date(store.getWorkingDate())}</b></span></span>${roleControl}<div class="user-profile-menu"><div class="user-avatar-circle">${esc(ctx.user.fullName.slice(0,1))}</div><div class="user-info-text"><span class="user-fullname" id="topbarUserName">${esc(ctx.user.fullName)}</span><span class="user-role-tag" id="topbarRoleText">${esc(ctx.user.roleName)}</span></div></div>${sqlControls}</div>`;
    const sidebar = document.getElementById('sidebar');
    sidebar.insertAdjacentHTML('afterbegin', `<a class="pms-brand" href="${portal === 'general' ? 'index' : portal}.html"><span class="pms-brand-mark">SL</span><span><strong>SÔNG LAM</strong><small>QUẢN LÝ KHÁCH SẠN</small></span></a>`);
    const footer = sidebar.querySelector('.sidebar-footer');
    if (footer) footer.innerHTML = `<div class="pms-portal-label">KHÔNG GIAN LÀM VIỆC</div><a href="index.html">${icon('layout-dashboard')} Quản trị</a><a href="reception.html">${icon('bell')} Lễ tân</a><a href="housekeeping.html">${icon('sparkles')} Buồng phòng</a><small>Các phân hệ dùng vai trò mô phỏng riêng</small>`;
    const strip = document.querySelector('.demo-banner-strip');
    const deploymentBanner = document.getElementById('pms-deployment-banner');
    // Keep the live deployment warning (including unknown-payment notices),
    // inside its own reserved row instead of covering the fixed topbar/brand.
    if (deploymentBanner) strip.replaceChildren(deploymentBanner);
    else strip.innerHTML = `<span><span class="pms-status-dot"></span> Bản mô phỏng · Dữ liệu lưu trên trình duyệt này</span><span>Chưa kết nối máy chủ và thanh toán thật</span>`;
    document.body.insertAdjacentHTML('beforeend','<button class="pms-sidebar-backdrop" aria-label="Đóng menu" onclick="SongLamUI.closeSidebar()"></button>');
    document.querySelectorAll('.nav-group-title').forEach(el => el.textContent = el.textContent.replace(/^[A-Z]\.\s*/, ''));
    document.querySelectorAll('.nav-item').forEach(el => { el.tabIndex = 0; el.setAttribute('role','button'); el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }}); });
  }
  function sync() {
    if (!context) return;
    observer?.disconnect();
    const ctx = context();
    const current = ctx.screen;
    document.body.dataset.screen = current;
    if (window._sqlCurrentUser) {
      const uEl = document.getElementById('topbarUserName');
      if (uEl) uEl.textContent = window._sqlCurrentUser.fullName || window._sqlCurrentUser.username;
      const rEl = document.getElementById('topbarRoleText');
      if (rEl) rEl.textContent = 'Nhân viên SQL (' + (window._sqlCurrentUser.roleCode || 'Staff') + ')';
      const avatarEl = document.querySelector('.user-avatar-circle');
      if (avatarEl && (window._sqlCurrentUser.fullName || window._sqlCurrentUser.username)) {
        avatarEl.textContent = (window._sqlCurrentUser.fullName || window._sqlCurrentUser.username).slice(0, 1).toUpperCase();
      }
    }
    document.querySelectorAll('.nav-item[data-screen]').forEach(el => {
      const target = el.dataset.screen;
      el.hidden = !canScreen(target);
      el.classList.toggle('active', target === current);
      if (target === current) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current');
    });
    document.querySelectorAll('.nav-group-title').forEach(el => { el.hidden = !el.nextElementSibling?.querySelector('.nav-item:not([hidden])'); });
    document.querySelectorAll('[onclick],[onchange],[onsubmit]').forEach(el => {
      const code = ['onclick','onchange','onsubmit'].map(a => el.getAttribute(a) || '').join(' ');
      const match = code.match(/(?:app|receptionApp|housekeepingApp)\.([A-Za-z0-9_]+)\(/);
      const adminTab = code.match(/switchAdminTab\('([^']+)'\)/);
      if (adminTab) el.hidden = !can(adminTab[1] === 'audit' ? 'viewAuditLog' : 'systemConfig');
      if (match && actionPermissions[match[1]]) {
        const permitted = can(actionPermissions[match[1]]);
        if (el.tagName === 'FORM') { el.querySelectorAll('[type=submit]').forEach(btn => btn.disabled = !permitted); }
        else el.hidden = !permitted;
      }
    });
    document.querySelectorAll('.table-responsive,.table-container').forEach(el => { el.tabIndex = 0; el.setAttribute('aria-label','Bảng dữ liệu, có thể cuộn ngang'); });
    document.querySelectorAll('input:not([aria-label]),select:not([aria-label])').forEach(el => {
      if (!el.labels?.length) el.setAttribute('aria-label', el.placeholder || el.closest('.filter-item')?.querySelector('.filter-label')?.textContent || el.name || 'Bộ lọc');
    });
    document.querySelectorAll('.page-title').forEach(el => { for (const node of el.childNodes) if (node.nodeType === 3) node.textContent = node.textContent.replace(/^\s*[A-G]\.\s*/, ' '); });
    const count = document.querySelector('[data-screen="room_rack"] .nav-badge');
    if (count) count.textContent = store.getData().rooms.length;
    const switcher = document.getElementById('roleSwitcher');
    if (switcher) switcher.value = ctx.user.roleCode;
    const main = document.getElementById('mainContent');
    if (searchableScreens.has(current) && main.querySelector('table') && !main.querySelector('.pms-table-search')) {
      const toolbar=document.createElement('div');toolbar.className='pms-table-search';
      toolbar.innerHTML=`<label>${icon('search')}<input class="form-input" type="search" aria-label="Tìm trong các bảng của màn hình" placeholder="Tìm mã, tên, số phòng, trạng thái…" value="${esc(tableQueries[tableKey()] || '')}" oninput="SongLamUI.filterTable(this.value)"></label><span>Lọc các bảng đang hiển thị</span>`;
      const header=main.querySelector('.page-header');
      if (header) header.after(toolbar);else main.prepend(toolbar);
    }
    if (main.querySelector('.pms-table-search')) filterTable(tableQueries[tableKey()] || '');
    if (window.lucide) lucide.createIcons();
    observer?.observe(main, {childList:true, subtree:true});
    observer?.observe(document.getElementById('appModal'), {childList:true, subtree:true});
    const drawer = document.getElementById('roomDrawer');
    if (drawer) observer?.observe(drawer, {childList:true, subtree:true});
  }
  function toggleSidebar() {
    if (matchMedia('(max-width: 900px)').matches) document.body.classList.toggle('pms-menu-open');
    else document.body.classList.toggle('pms-menu-collapsed');
    document.querySelector('.sidebar-toggle-btn').setAttribute('aria-expanded', String(matchMedia('(max-width:900px)').matches ? document.body.classList.contains('pms-menu-open') : !document.body.classList.contains('pms-menu-collapsed')));
  }
  function closeSidebar() {
    document.body.classList.remove('pms-menu-open');
    if (matchMedia('(max-width:900px)').matches) document.querySelector('.sidebar-toggle-btn')?.setAttribute('aria-expanded','false');
  }
  function init() {
    api = window.app || window.receptionApp || window.housekeepingApp;
    if (!api?.getUIContext) return;
    context = api.getUIContext;
    portal = window.app ? 'general' : window.receptionApp ? 'reception' : 'housekeeping';
    shell();
    Object.entries(actionPermissions).forEach(([name, permission]) => {
      if (typeof api[name] !== 'function') return;
      const original = api[name];
      api[name] = function (...args) { if (!can(permission)) { args[0]?.preventDefault?.(); return; } return original.apply(api,args); };
    });
    const originalSwitch = api.switchScreen;
    api.switchScreen = function (screen) {
      if (!canScreen(screen)) return;
      originalSwitch(screen);
      history.replaceState(null,'','#' + screen);
      closeSidebar();
      window.scrollTo(0, 0);
      document.getElementById('mainContent').scrollTop = 0;
      sync();
    };
    const main = document.getElementById('mainContent');
    observer = new MutationObserver(() => sync());
    observer.observe(main,{childList:true,subtree:true});
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSidebar(); });
    // Preserve keyboard focus when a filter re-renders its own input.
    document.addEventListener('input', e => {
      const el = e.target;
      if (!el.matches('input[type=text],input:not([type])')) return;
      const handler = el.getAttribute('oninput');
      if (!handler) return;
      const position = el.selectionStart;
      queueMicrotask(() => {
        if (!document.contains(el)) {
          const replacement = [...main.querySelectorAll('input[oninput]')].find(x => x.getAttribute('oninput') === handler);
          if (replacement) { replacement.focus(); replacement.setSelectionRange(position,position); }
        }
      });
    },true);
    sync();
  }
  window.SongLamUI = { overview, timeline, reports, denied, canScreen, sync, toggleSidebar, closeSidebar, roomShortcut, filterTable,
    async logoutSql(e) {
      if (e) e.preventDefault();
      try {
        await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'Origin': window.location.origin } });
      } catch {}
      window.location.href = 'login.html';
    },
    setReportPeriod(value) { reportPeriod = value === 'month' ? 'month' : 'today'; reports(); sync(); } };
  document.addEventListener('DOMContentLoaded', init);
})();
