(function (root) {
  'use strict';
  const titles = { tasks: 'Công việc buồng phòng', rooms: 'Trạng thái phòng', tickets: 'Sự cố bảo trì', blocks: 'Block phòng theo thời gian', items: 'Đồ thất lạc' };
  const actionNames = { create: 'Tạo mới', claim: 'Nhận việc', assign: 'Phân công', start: 'Bắt đầu', submit: 'Dọn xong / chờ kiểm tra', unable: 'Không thể dọn', resume: 'Tiếp tục việc',
    'inspect-approve': 'Nghiệm thu sạch', 'inspect-reject': 'Yêu cầu dọn lại', progress: 'Cập nhật xử lý', resolve: 'Đã sửa xong', cancel: 'Hủy block chưa hiệu lực', end: 'Kết thúc block', 'mark-dirty': 'Ghi nhận phòng bẩn', handoff: 'Bàn giao', return: 'Trả khách' };
  const labels = {
    PENDING: 'Chờ xử lý', QUEUED: 'Chờ nhận', CLAIMED: 'Đã nhận', CLEANING: 'Đang dọn', AWAITING_INSPECTION: 'Chờ kiểm tra', UNABLE: 'Không thể dọn', INSPECTING: 'Chờ kiểm tra', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy',
    OPEN: 'Mới báo', IN_PROGRESS: 'Đang xử lý', RESOLVED: 'Đã sửa xong', LOW: 'Thấp', NORMAL: 'Bình thường', HIGH: 'Cao', URGENT: 'Khẩn cấp',
    STORED: 'Đang lưu giữ', RETURNED: 'Đã trả', DISPOSED: 'Đã xử lý', SCHEDULED: 'Sắp hiệu lực', ACTIVE: 'Đang hiệu lực', ENDED: 'Đã kết thúc',
    VACANT: 'Trống', OCCUPIED: 'Có khách', DIRTY: 'Bẩn / chờ dọn', CLEAN: 'Sạch', INACTIVE: 'Ngừng khai thác', MAINTENANCE: 'Bảo trì / bị chặn',
    BLOCKING: 'Chặn khai thác', NONBLOCKING: 'Không chặn khai thác', UNDECIDED: 'Chưa xác định điều kiện xử lý',
    DEPARTURE: 'Dọn phòng trả', STAYOVER: 'Dọn phòng đang ở', INSPECTION: 'Kiểm tra', OTHER: 'Khác',
    NOT_CLEAN: 'Chưa sạch', BLOCK: 'Block có hiệu lực', BLOCKING_REPAIR: 'Sự cố chặn khai thác', POST_REPAIR_INSPECTION: 'Chờ kiểm tra sau sửa chữa', ALLOCATION_CONFLICT: 'Xung đột lịch phân phòng'
  };
  const fieldNames = { id: 'Mã', roomId: 'Mã phòng', stayId: 'Mã lưu trú', number: 'Số phòng', taskType: 'Loại việc', status: 'Trạng thái', phase: 'Tiến độ',
    assignedToId: 'Nhân viên nhận', inspectedById: 'Người nghiệm thu', createdAtUtc: 'Thời điểm tạo', claimedAtUtc: 'Thời điểm nhận', startedAtUtc: 'Bắt đầu', submittedAtUtc: 'Gửi kiểm tra', completedAtUtc: 'Hoàn tất',
    notes: 'Ghi chú', unable: 'Không thể dọn', description: 'Mô tả', priority: 'Mức độ', reportedById: 'Người báo', resolvedAtUtc: 'Thời điểm xử lý', workMode: 'Điều kiện bảo trì',
    ticketId: 'Mã phiếu bảo trì', startsAtUtc: 'Bắt đầu block', endsAtUtc: 'Kết thúc block', reason: 'Lý do', state: 'Trạng thái block', createdById: 'Người tạo',
    foundLocation: 'Vị trí phát hiện', storageLocation: 'Nơi lưu giữ', foundById: 'Người phát hiện', foundAtUtc: 'Thời điểm phát hiện', custodianId: 'Người đang giữ', returnedToCustomerId: 'Khách nhận đồ',
    occupancyStatus: 'Hiện diện', cleanlinessStatus: 'Vệ sinh', exploitationStatus: 'Khai thác', eligibleForCheckIn: 'Đủ điều kiện nhận khách', eligibilityReasons: 'Lý do chưa sẵn sàng' };
  const statuses = { tasks: ['PENDING', 'IN_PROGRESS', 'INSPECTING', 'COMPLETED', 'CANCELLED'], rooms: ['DIRTY', 'CLEANING', 'INSPECTING', 'CLEAN'],
    tickets: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'], blocks: ['SCHEDULED', 'ACTIVE', 'ENDED', 'CANCELLED'], items: ['STORED', 'RETURNED', 'DISPOSED'] };
  const createFields = {
    tasks: [['roomId', 'Mã phòng'], ['stayId', 'Mã lưu trú (nếu có)', false], ['taskType', 'Loại việc', ['DEPARTURE', 'STAYOVER', 'INSPECTION', 'OTHER']]],
    tickets: [['roomId', 'Mã phòng'], ['description', 'Mô tả sự cố'], ['priority', 'Mức độ', ['LOW', 'NORMAL', 'HIGH', 'URGENT']]],
    blocks: [['roomId', 'Mã phòng'], ['ticketId', 'Mã phiếu bảo trì (nếu có)', false], ['startsAt', 'Bắt đầu — ISO 8601, ví dụ 2026-11-09T14:00:00+07:00'], ['endsAt', 'Kết thúc — ISO 8601 có múi giờ'], ['reason', 'Lý do chặn phòng']],
    items: [['roomId', 'Mã phòng (nếu có)', false], ['stayId', 'Mã lưu trú (nếu có)', false], ['description', 'Mô tả món đồ'], ['foundLocation', 'Vị trí phát hiện'], ['storageLocation', 'Vị trí lưu giữ'], ['foundAt', 'Phát hiện lúc — ISO 8601 có múi giờ']]
  };
  function el(tag, props = {}, text) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === 'className') node.className = value;
      else node.setAttribute(key, value);
    }
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const display = value => value === null || value === undefined ? '—' : typeof value === 'boolean' ? value ? 'Có' : 'Không'
    : Array.isArray(value) ? value.map(display).join(', ') || '—' : typeof value === 'object' ? Object.entries(value).map(([key, item]) => (fieldNames[key] || key) + ': ' + display(item)).join('; ')
      : labels[value] || String(value);
  const stamp = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—';
  function mount() {
    const $ = id => document.getElementById(id), client = root.SongLamSession.client;
    let actorId, resource = 'tasks', offset = 0, pageSize = 50, rows = [], capabilities, generation = 0, modalGeneration = 0, pendingWrite = null;
    const catalog = root.SongLamCatalogApi.createCatalogApi({ client });
    const api = root.SongLamOperationsApi.createOperationsApi({ client, getCsrfToken: async () => {
      const response = await root.SongLamSession.restore();
      if (response.data.user.appUserId !== actorId) throw new root.SongLamHttp.ApiError('Phiên đã đổi nhân viên. Tải lại trang trước khi thao tác.', { status: 401, code: 'SESSION_CHANGED' });
      return response.data.csrfToken;
    } });
    function message(text, tone = 'secondary') { root.SongLamComponents.notification.set($('ops-message'), text, tone); }
    const errorText = error => error.message + (error.code ? ' [' + error.code + ']' : '') + (error.requestId ? ' · Mã theo dõi: ' + error.requestId : '');
    function navigation() {
      const nav = $('ops-navigation'); nav.replaceChildren();
      for (const [key, title] of Object.entries(titles)) {
        if (!capabilities.resources[key]?.visible) continue;
        const button = el('button', { type: 'button', onClick: () => select(key) }, title);
        if (resource === key) button.setAttribute('aria-current', 'page');
        nav.append(button);
      }
    }
    function select(key) {
      resource = key; offset = 0; $('ops-title').textContent = titles[key];
      const select = $('ops-status'); select.replaceChildren(el('option', { value: '' }, 'Tất cả trạng thái'));
      for (const status of statuses[key]) select.append(el('option', { value: status }, labels[status] || status));
      $('ops-filters').reset(); $('ops-mine-label').hidden = !['tasks', 'tickets'].includes(key);
      $('ops-sidebar').classList.remove('open'); $('ops-menu').setAttribute('aria-expanded', 'false');
      navigation(); load();
    }
    function cell(text) { return el('td', {}, display(text)); }
    function roomCells(row) {
      const node = el('td', { className: 'ops-state' });
      for (const [key, name] of [['occupancyStatus', 'Hiện diện'], ['cleanlinessStatus', 'Vệ sinh'], ['exploitationStatus', 'Khai thác']]) {
        const value = key === 'exploitationStatus' && row[key] === 'ACTIVE' ? 'Đang khai thác' : display(row[key]);
        const line = el('div'); line.append(el('small', {}, name + ': '), el('span', { className: 'badge bg-blue-lt' }, value)); node.append(line);
      }
      node.append(el('small', {}, row.catalogOnly ? 'Trạng thái hiện tại từ SQL; điều kiện nhận phòng phải kiểm tra lại theo lịch.' : row.eligibleForCheckIn ? 'Đủ điều kiện nhận khách tại thời điểm đọc' : 'Chưa sẵn sàng: ' + display(row.eligibilityReasons)));
      return node;
    }
    function table() {
      // 1. Render visual Kanban Board for Tasks (4 Cột Tiến Độ)
      const kanban = $('ops-kanban');
      if (kanban) {
        if (resource === 'tasks' && rows.length) {
          kanban.hidden = false;
          kanban.replaceChildren();

          const cols = [
            { id: 'QUEUED', title: '⏳ Chờ thực hiện', phases: ['QUEUED', 'PENDING'] },
            { id: 'CLEANING', title: '🔄 Đang thực hiện', phases: ['CLAIMED', 'CLEANING', 'IN_PROGRESS'] },
            { id: 'INSPECTING', title: '🔍 Chờ nghiệm thu', phases: ['AWAITING_INSPECTION', 'INSPECTING'] },
            { id: 'COMPLETED', title: '✅ Hoàn tất', phases: ['COMPLETED'] }
          ];

          for (const col of cols) {
            const colEl = el('div', { className: 'hk-kanban-col' });
            const colHead = el('div', { className: 'hk-col-head' });
            const colTasks = rows.filter(r => col.phases.includes(r.phase || r.status));
            colHead.append(
              el('span', { className: 'hk-col-title' }, col.title),
              el('span', { className: 'hk-col-badge' }, String(colTasks.length))
            );
            colEl.append(colHead);

            for (const task of colTasks) {
              const card = el('div', { className: 'hk-task-card' });
              const cardHead = el('div', { className: 'tw-flex tw-items-center tw-justify-between' });
              cardHead.append(
                el('span', { className: 'hk-task-room' }, task.roomId ? 'Phòng ' + task.roomId : '#' + task.id),
                el('span', { className: 'hk-task-priority hk-priority-' + (task.priority || 'NORMAL') }, display(task.priority || 'NORMAL'))
              );
              card.append(cardHead);
              card.append(el('div', { className: 'tw-text-xs tw-font-semibold tw-text-secondary' }, 'Loại việc: ' + display(task.taskType)));
              card.append(el('div', { className: 'tw-text-xs tw-text-muted' }, 'Phụ trách: ' + (task.assignedToId ? display(task.assignedToId) : 'Chưa phân công')));

              if (task.allowedActions?.length) {
                const actBox = el('div', { className: 'hk-task-actions' });
                for (const action of task.allowedActions) {
                  if (!actionNames[action]) continue;
                  actBox.append(el('button', { className: 'btn btn-sm btn-outline-primary', type: 'button', onClick: () => actionForm(action, task) }, actionNames[action]));
                }
                card.append(actBox);
              }
              colEl.append(card);
            }

            if (!colTasks.length) {
              colEl.append(el('p', { className: 'tw-text-xs tw-text-muted tw-text-center tw-my-auto' }, 'Không có việc'));
            }
            kanban.append(colEl);
          }
        } else {
          kanban.hidden = true;
          kanban.replaceChildren();
        }
      }

      // 2. Standard Table for all resources
      const { table, body } = root.SongLamComponents.table.create(resource === 'rooms' ? ['Phòng', 'Hiện diện / vệ sinh / khai thác', 'Thao tác'] : ['Mã / phòng', 'Nội dung', 'Trạng thái', 'Nhân viên / thời điểm', 'Thao tác']);
      for (const row of rows) {
        const tr = el('tr');
        tr.append(cell(resource === 'rooms' ? row.number + ' · #' + row.id : '#' + row.id + (row.roomId ? ' · Phòng #' + row.roomId : ' · Vị trí khác')));
        if (resource === 'rooms') tr.append(roomCells(row));
        else {
          tr.append(cell(resource === 'tasks' ? row.taskType : resource === 'blocks' ? row.reason : row.description));
          const status = cell(row.phase || row.state || row.status);
          if (resource === 'tickets') status.append(el('div', { className: 'small text-secondary' }, display(row.priority) + ' · ' + display(row.workMode)));
          if (row.unable) status.append(el('div', { className: 'text-danger small' }, row.unable.reason));
          tr.append(status);
          const info = resource === 'blocks' ? 'Từ ' + stamp(row.startsAtUtc) + ' đến ' + stamp(row.endsAtUtc)
            : resource === 'items' ? 'Người giữ: ' + display(row.custodianId) + ' · ' + row.storageLocation : 'Người nhận: ' + display(row.assignedToId) + ' · ' + stamp(row.createdAtUtc);
          tr.append(cell(info));
        }
        const buttons = el('td'), group = el('div', { className: 'ops-actions' });
        if (!row.catalogOnly) group.append(el('button', { className: 'btn btn-sm', type: 'button', onClick: () => detail(row.id) }, 'Chi tiết / lịch sử'));
        for (const action of row.allowedActions || []) {
          if (!actionNames[action]) continue;
          group.append(el('button', { className: 'btn btn-sm btn-outline-primary', type: 'button', onClick: () => actionForm(action, row) }, actionNames[action]));
        }
        buttons.append(group); tr.append(buttons); body.append(tr);
      }
      if (!rows.length) { const td = cell('Không có bản ghi phù hợp trong kết quả API.'); td.colSpan = resource === 'rooms' ? 3 : 5; const tr = el('tr'); tr.append(td); body.append(tr); }
      table.append(body); $('ops-table').replaceChildren(table);
    }
    async function load() {
      const ticket = ++generation; $('ops-refresh').disabled = true; $('ops-create').hidden = true; $('ops-prev').disabled = true; $('ops-next').disabled = true;
      $('ops-table').replaceChildren(el('p', { className: 'p-3 text-secondary' }, 'Đang tải dữ liệu…')); $('ops-page').textContent = 'Chưa có kết quả';
      try {
        const fresh = await api.capabilities(); if (ticket !== generation) return; capabilities = fresh.data; navigation();
        $('ops-inspection').textContent = capabilities.inspection.enabled ? 'Nghiệm thu chỉ dành cho người có quyền riêng, khác người dọn. Sửa xong không tự làm phòng sạch.' : capabilities.inspection.message;
        const cap = capabilities.resources[resource];
        if (!cap?.visible) throw new Error('Bạn không có quyền đọc phân hệ này.');
        const catalogRooms = resource === 'rooms' && !cap.readable;
        if (!cap.readable && !catalogRooms) throw new Error('Chưa có hợp đồng SQL G7 được duyệt cho hàng đợi này.');
        pageSize = catalogRooms ? 50 : Math.min(50, cap.maxLimit);
        const filters = { offset, limit: pageSize }, fields = new FormData($('ops-filters'));
        if (fields.get('roomId')) filters.roomId = fields.get('roomId');
        if (fields.get('status')) filters[resource === 'rooms' ? 'cleanlinessStatus' : resource === 'blocks' ? 'state' : 'status'] = fields.get('status');
        if (['tasks', 'tickets'].includes(resource) && fields.get('mine')) filters.mine = true;
        const response = catalogRooms ? await catalog.list('rooms', filters) : await api.list(resource, filters); if (ticket !== generation) return;
        if (!Array.isArray(response.data) || !response.meta) throw new Error('Phản hồi danh sách không hợp lệ.');
        rows = catalogRooms ? response.data.map(row => ({ ...row, catalogOnly: true, allowedActions: [] })) : response.data; table(); $('ops-create').hidden = catalogRooms || !cap.creatable;
        $('ops-page').textContent = (rows.length ? (offset + 1) + '–' + (offset + rows.length) : '0 bản ghi') + (response.meta.total !== null ? ' / ' + response.meta.total : ' · Tổng chưa xác định');
        $('ops-prev').disabled = offset === 0; $('ops-next').disabled = response.meta.hasMore !== true;
        message(catalogRooms ? 'Trạng thái phòng từ danh mục SQL chỉ đọc. Tác vụ và thao tác ghi G7 chưa có hợp đồng được duyệt.' : 'Đã đọc dữ liệu từ API. Điều kiện phòng được SQL kiểm tra lại khi ghi.', 'info');
        return true;
      } catch (error) {
        if (ticket !== generation) return;
        rows = []; $('ops-table').replaceChildren(el('p', { className: 'p-3 text-secondary' }, 'Chưa có dữ liệu để hiển thị. Không chuyển sang dữ liệu demo.'));
        message(errorText(error), 'warning');
        return false;
      } finally { if (ticket === generation) $('ops-refresh').disabled = false; }
    }
    function open(title) {
      if (pendingWrite) return null;
      modalGeneration++;
      $('ops-dialog-title').textContent = title; $('ops-dialog-body').replaceChildren();
      root.SongLamComponents.modal.open($('ops-dialog')); return $('ops-dialog-body');
    }
    async function detail(recordId) {
      const selected = resource, body = open('Chi tiết / lịch sử #' + recordId); if (!body) return;
      const modalTicket = modalGeneration;
      body.textContent = 'Đang đọc dữ liệu…';
      try {
        const result = await api.detail(selected, recordId); if (modalTicket !== modalGeneration || !$('ops-dialog').open || resource !== selected) return;
        body.replaceChildren(); const dl = el('dl', { className: 'ops-detail' });
        for (const [key, value] of Object.entries(result.data)) {
          if (['allowedActions', 'version', 'roomVersion', 'stateToken'].includes(key)) continue;
          dl.append(el('dt', {}, fieldNames[key] || key), el('dd', {}, key.endsWith('AtUtc') && value ? stamp(value) : display(value)));
        }
        body.append(dl, el('h3', {}, 'Lịch sử thay đổi / bàn giao'));
        const events = el('div'), paging = el('div', { className: 'ops-actions' }); body.append(events, paging);
        let historyOffset = 0;
        async function history() {
          events.textContent = 'Đang đọc lịch sử…'; paging.replaceChildren();
          try {
            const size = Math.min(50, capabilities.resources[selected].maxLimit);
            const response = await api.history(selected, recordId, { offset: historyOffset, limit: size }); events.replaceChildren();
            for (const event of response.data) events.append(el('p', {}, stamp(event.atUtc) + ' · Nhân viên #' + event.actorId + ' · ' + (actionNames[event.action] || event.action)
              + ' · ' + display(event.fromState) + ' → ' + display(event.toState) + (event.recipientEmployeeId ? ' · Giao NV #' + event.recipientEmployeeId : '')
              + (event.recipientCustomerId ? ' · Trả khách #' + event.recipientCustomerId : '') + (event.storageLocation ? ' · ' + event.storageLocation : '') + (event.note ? ' · ' + event.note : '')));
            if (!response.data.length) events.textContent = 'SQL chưa trả bản ghi lịch sử trong khoảng này.';
            if (historyOffset) paging.append(el('button', { className: 'btn btn-sm', onClick: () => { historyOffset = Math.max(0, historyOffset - size); history(); } }, 'Trước'));
            if (response.meta?.hasMore === true) paging.append(el('button', { className: 'btn btn-sm', onClick: () => { historyOffset += size; history(); } }, 'Sau'));
          } catch (error) { events.textContent = errorText(error); }
        }
        history();
      } catch (error) { if (modalTicket === modalGeneration) body.textContent = errorText(error); }
    }
    function actionForm(action, row) {
      const selected = resource, body = open(actionNames[action] + (row ? ' #' + row.id : '')); if (!body) return;
      const form = el('form', { className: 'ops-form' }), feedback = el('p', { role: 'status', className: 'text-secondary' });
      let fields = action === 'create' ? createFields[selected] : action === 'assign' ? [['assigneeId', 'Mã nhân viên được phân công']]
        : action === 'handoff' ? [['recipientEmployeeId', 'Mã nhân viên nhận đồ'], ['storageLocation', 'Nơi lưu giữ sau bàn giao']]
          : action === 'return' ? [['recipientCustomerId', 'Mã khách hàng nhận đồ']] : [];
      fields = [...fields];
      if (!(selected === 'blocks' && action === 'create')) fields.push(['note', 'Ghi chú / lý do', !['unable', 'inspect-reject', 'progress', 'resolve', 'end', 'cancel', 'mark-dirty', 'handoff', 'return'].includes(action) ? false : true]);
      for (const [name, title, rule] of fields) {
        const label = el('label', {}, title); let input;
        if (Array.isArray(rule)) { input = el('select', { name, className: 'form-select' }); rule.forEach(value => input.append(el('option', { value }, labels[value] || value))); }
        else input = el(['description', 'reason', 'note'].includes(name) ? 'textarea' : 'input', { name, className: 'form-control', autocomplete: 'off' });
        input.required = rule !== false;
        if (name.endsWith('Id')) { input.setAttribute('inputmode', 'numeric'); input.setAttribute('pattern', '[1-9][0-9]*'); }
        input.setAttribute('maxlength', name === 'description' && selected === 'tickets' ? '2000' : ['storageLocation', 'foundLocation'].includes(name) ? '250' : '1000');
        label.append(input); form.append(label);
      }
      body.append(el('p', { className: 'text-secondary' }, 'Actor lấy từ phiên đăng nhập. Phiên bản và khóa chống gửi lặp được gửi cùng yêu cầu. Không thu/hoàn tiền hoặc đổi trạng thái hiện diện khách.'));
      if (action === 'submit' || action === 'resolve') body.append(el('p', { className: 'alert alert-info' }, 'Thao tác này không xác nhận phòng sạch/sẵn sàng. Cần bước vệ sinh, kiểm tra theo quy định.'));
      form.dataset.pmsOperation = selected + '.' + action;
      const send = el('button', { type: 'submit', className: 'btn btn-primary' }, 'Gửi yêu cầu'); form.append(feedback, send); body.append(form);
      let stableBody, stableKey, uncertain = false, sending = false;
      form.addEventListener('submit', async event => {
        event.preventDefault(); if (sending) return;
        if (!stableBody) {
          stableBody = Object.fromEntries(fields.map(([name]) => [name, String(new FormData(form).get(name) || '').trim() || null]));
          if (action !== 'create') {
            stableBody[selected === 'items' ? 'expectedStateToken' : 'expectedVersion'] = selected === 'items' ? row.stateToken : row.version;
            if (action.startsWith('inspect-')) stableBody.expectedRoomVersion = row.roomVersion;
          }
          if (!root.crypto?.randomUUID) { feedback.textContent = 'Cần môi trường an toàn hỗ trợ tạo khóa chống gửi lặp.'; stableBody = null; return; }
          stableKey = root.crypto.randomUUID();
        }
        sending = true; send.disabled = true; pendingWrite = { key: stableKey }; $('ops-close').disabled = true;
        for (const input of form.querySelectorAll('input,select,textarea')) input.disabled = true;
        feedback.textContent = uncertain ? 'Đang đối chiếu/gửi lại đúng yêu cầu, giữ nguyên khóa…' : 'Đang chờ backend xác nhận…';
        try {
          const response = action === 'create' ? await api.create(selected, stableBody, { idempotencyKey: stableKey }) : await api.perform(selected, row.id, action, stableBody, { idempotencyKey: stableKey });
          if (response.data?.committed !== true || !response.data?.row || !response.data?.event) throw new Error('Phản hồi chưa chứng minh đã ghi. Giữ nguyên yêu cầu để đối chiếu.');
          uncertain = false; pendingWrite = null; $('ops-close').disabled = false; $('ops-dialog').close();
          const refreshed = await load();
          if (refreshed) message('Backend xác nhận đã ghi #' + response.data.row.id + (response.data.replayed ? ' (kết quả gốc, không ghi thêm).' : '.') + ' · ' + actionNames[action], 'success');
          else message('Backend đã xác nhận ghi #' + response.data.row.id + ', nhưng chưa tải lại được danh sách. Tải lại để đối chiếu; không gửi thao tác mới.', 'warning');
        } catch (error) {
          // Only explicit business rejection proves the command did not commit.
          // A later auth/validation rejection cannot resolve an earlier unknown commit.
          uncertain = uncertain || error.outcomeUnknown === true || (![400, 401, 403, 404, 409, 413, 415, 422].includes(error.status)
            && !['CUTOVER_WRITE_LOCKED', 'DEPLOYMENT_CHANGED', 'AUTH_NOT_CONFIGURED', 'AUTH_DEPENDENCY_UNAVAILABLE', 'OPERATIONS_CONTRACT_NOT_APPROVED', 'INSPECTION_AUTHORIZATION_PENDING', 'OPERATIONS_SQL_FORBIDDEN'].includes(error.code));
          feedback.textContent = errorText(error) + (uncertain ? ' Chưa rõ kết quả. Lưu mã và tra cứu tại trang trạng thái; không gửi lại. Khóa: ' + stableKey : ' Chưa ghi thành công.');
          if (!uncertain) {
            pendingWrite = null; stableBody = null; stableKey = null; $('ops-close').disabled = false;
            for (const input of form.querySelectorAll('input,select,textarea')) input.disabled = false;
          }
          send.textContent = uncertain ? 'Chưa rõ kết quả — mở trang trạng thái để đối chiếu' : 'Gửi lại';
        } finally { sending = false; send.disabled = uncertain; }
      });
    }
    $('ops-menu').addEventListener('click', () => { const open = $('ops-sidebar').classList.toggle('open'); $('ops-menu').setAttribute('aria-expanded', String(open)); });
    $('ops-close').addEventListener('click', () => { if (!pendingWrite) $('ops-dialog').close(); });
    $('ops-dialog').addEventListener('cancel', event => { if (pendingWrite) event.preventDefault(); });
    root.addEventListener('beforeunload', event => { if (pendingWrite) { event.preventDefault(); event.returnValue = ''; } });
    $('ops-filters').addEventListener('submit', event => { event.preventDefault(); offset = 0; load(); });
    $('ops-refresh').addEventListener('click', load);
    $('ops-create').addEventListener('click', () => actionForm('create'));
    $('ops-prev').addEventListener('click', () => { offset = Math.max(0, offset - pageSize); load(); });
    $('ops-next').addEventListener('click', () => { offset += pageSize; load(); });
    async function boot() {
      try {
        const identity = await root.SongLamSession.restore(); actorId = identity.data.user.appUserId;
        $('ops-identity').textContent = identity.data.user.fullName || identity.data.user.username;
        capabilities = (await api.capabilities()).data;
        const first = capabilities.resources.rooms?.visible ? 'rooms' : Object.keys(titles).find(key => capabilities.resources[key]?.visible);
        if (!first) throw new Error('Phiên hiện tại không có quyền đọc các hàng đợi G7.');
        $('ops-filters').hidden = false; select(first);
      } catch (error) {
        $('ops-identity').textContent = 'Chưa có phiên vận hành';
        message(errorText(error) + ' Đăng nhập và hợp đồng SQL phải được cấu hình; không sử dụng phiên hoặc dữ liệu demo.', 'warning');
      }
    }
    boot();
  }
  root.SongLamHousekeepingPage = Object.freeze({ mount });
}(window));
