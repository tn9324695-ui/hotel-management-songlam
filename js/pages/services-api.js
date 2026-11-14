(function (root) {
  'use strict';
  const $ = id => document.getElementById(id);
  const names = { orders: 'Yêu cầu dịch vụ', audits: 'Kiểm kê minibar', create: 'Tạo mới', deliver: 'Xác nhận đã giao', cancel: 'Hủy dịch vụ', confirm: 'Xác nhận minibar', dispute: 'Ghi nhận tranh chấp' };
  const statuses = { OPEN: 'Chờ giao', DELIVERED: 'Đã giao', CANCELLED: 'Đã hủy', PENDING: 'Chờ xác nhận', CONFIRMED: 'Đã xác nhận', DISPUTED: 'Đang tranh chấp' };
  function el(tag, text, props = {}) {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = text;
    for (const [key, value] of Object.entries(props)) {
      if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === 'className') node.className = value;
      else node.setAttribute(key, value);
    }
    return node;
  }
  const button = (text, callback, primary = false) => el('button', text, { type: 'button', className: 'btn btn-sm' + (primary ? ' btn-primary' : ''), onClick: callback });
  const formatMoney = value => { try { return BigInt(value).toLocaleString('vi-VN') + ' ₫'; } catch { return 'Chưa có giá hợp lệ'; } };
  const formatQuantity = value => {
    const [whole, fraction = ''] = String(value).split('.'), trimmed = fraction.replace(/0+$/, '');
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (trimmed ? ',' + trimmed : '');
  };
  const time = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : '—';
  const errorText = error => (error?.message || 'Phản hồi API không hợp lệ.') + (error?.code ? ' [' + error.code + ']' : '') + (error?.requestId ? ' · Mã theo dõi: ' + error.requestId : '');
  let actorId, resource = root.location.hash === '#minibar' ? 'audits' : 'orders', caps = {}, rows = [], offset = 0, size = 50, generation = 0, dialogGeneration = 0, pending = null;
  const client = root.SongLamSession.client;
  const options = { client, getCsrfToken: async () => {
    const response = await root.SongLamSession.restore();
    if (response.data.user.appUserId !== actorId) throw new root.SongLamHttp.ApiError('Phiên đã đổi nhân viên. Tải lại trang trước khi thao tác.', { status: 401, code: 'SESSION_CHANGED' });
    return response.data.csrfToken;
  } };
  const apis = { orders: root.SongLamServicesApi.createServicesApi(options), audits: root.SongLamMinibarApi.createMinibarApi(options) };
  function message(text, tone = 'secondary') { root.SongLamComponents.notification.set($('g8-message'), text, tone); }
  function open(title) {
    if (pending) return null;
    dialogGeneration++; $('g8-dialog-title').textContent = title; $('g8-dialog-body').replaceChildren();
    root.SongLamComponents.modal.open($('g8-dialog'));
    return $('g8-dialog-body');
  }
  function field(form, name, title, { required = true, textarea = false } = {}) {
    const label = el('label', title), control = el(textarea ? 'textarea' : 'input', null, { name, className: 'form-control', autocomplete: 'off' });
    control.required = required; if (name.endsWith('Id')) { control.inputMode = 'numeric'; control.pattern = '[1-9][0-9]*'; }
    if (textarea) control.maxLength = name === 'reason' ? 500 : 1000;
    label.append(control); form.append(label); return control;
  }
  async function capabilities() {
    const results = await Promise.allSettled([apis.orders.capabilities(), apis.audits.capabilities()]);
    for (const [index, result] of results.entries()) {
      const key = index ? 'audits' : 'orders';
      caps[key] = result.status === 'fulfilled' ? result.value.data : null;
    }
    if (!caps.orders && !caps.audits) throw results[0].reason || new Error('Chưa nhận được capabilities hợp lệ từ backend.');
    const nav = $('g8-nav'); nav.replaceChildren();
    for (const key of ['orders', 'audits']) if (caps[key]?.visible) {
      const item = button(names[key], () => select(key)); if (resource === key) item.setAttribute('aria-current', 'page'); nav.append(item);
    }
  }
  function select(key) {
    resource = key; offset = 0; $('g8-title').textContent = names[key]; $('g8-filters').reset();
    $('g8-status').replaceChildren(el('option', 'Tất cả trạng thái', { value: '' }));
    for (const status of key === 'orders' ? ['OPEN', 'DELIVERED', 'CANCELLED'] : ['PENDING', 'CONFIRMED', 'DISPUTED']) $('g8-status').append(el('option', statuses[status], { value: status }));
    $('ops-sidebar').classList.remove('open'); $('ops-menu').setAttribute('aria-expanded', 'false'); load();
  }
  function render() {
    const { table, body } = root.SongLamComponents.table.create(['Mã / lượt ở', 'Trạng thái', 'Giá chốt của nguồn', 'Người ghi / thời điểm', 'Thao tác']);
    for (const row of rows) {
      const tr = el('tr'); tr.append(el('td', '#' + row.id + ' · Stay #' + row.stayId + (row.roomId ? ' · Phòng #' + row.roomId : '')),
        el('td', statuses[row.status] || row.status), el('td', formatMoney(row.totalVnd), { className: 'g8-amount' }),
        el('td', '#' + (row.orderedById || row.checkedById) + ' · ' + time(row.orderedAtUtc || row.checkedAtUtc)));
      const td = el('td'), actions = el('div', null, { className: 'ops-actions' }); actions.append(button('Chi tiết', () => detail(row.id)));
      for (const operation of row.allowedActions || []) if (names[operation]) actions.append(button(names[operation], () => mutation(operation, row), true));
      td.append(actions); tr.append(td); body.append(tr);
    }
    if (!rows.length) { const tr = el('tr'); tr.append(el('td', 'Không có bản ghi phù hợp từ máy chủ.', { colspan: '5' })); body.append(tr); }
    table.append(body); $('g8-table').replaceChildren(table);
  }
  async function load() {
    const ticket = ++generation, selected = resource; $('g8-reload').disabled = true; $('g8-create').hidden = true; $('g8-prev').disabled = true; $('g8-next').disabled = true;
    $('g8-table').replaceChildren(el('p', 'Đang đọc dữ liệu…', { className: 'p-3' })); $('g8-page').textContent = 'Chưa có kết quả';
    try {
      await capabilities(); if (ticket !== generation) return false;
      const cap = caps[selected]; if (!cap?.visible) throw new Error('Không có quyền đọc phân hệ này.');
      if (!cap.readable) throw new Error('Hợp đồng SQL/folio G8 chưa được phê duyệt/cấu hình. Không có dữ liệu giả thay thế.');
      size = Math.min(50, cap.maxLimit); const query = { offset, limit: size }, filters = new FormData($('g8-filters'));
      if (filters.get('stayId')) query.stayId = filters.get('stayId'); if (filters.get('status')) query.status = filters.get('status');
      const result = await apis[selected].list(query); if (ticket !== generation) return false;
      if (!Array.isArray(result.data) || !result.meta) throw new Error('Phản hồi danh sách không hợp lệ.');
      rows = result.data; render(); $('g8-create').hidden = !(cap.creatable && cap.contextReadable && cap.catalogReadable);
      $('g8-page').textContent = (rows.length ? (offset + 1) + '–' + (offset + rows.length) : '0 bản ghi') + (result.meta.total === null ? ' · Tổng chưa xác định' : ' / ' + result.meta.total);
      root.SongLamComponents.pagination.update($('g8-prev'), $('g8-next'), { offset, hasMore: result.meta.hasMore });
      message('Đã đọc API. Tổng hiển thị là giá của đơn/biên bản, không phải tổng dư nợ khách.', 'info'); return true;
    } catch (error) {
      if (ticket !== generation) return false;
      rows = []; $('g8-table').replaceChildren(el('p', 'Chưa tải được dữ liệu thật.', { className: 'p-3' })); message(errorText(error), 'warning'); return false;
    } finally { if (ticket === generation) $('g8-reload').disabled = false; }
  }
  function lineTable(record) {
    const { table, body } = root.SongLamComponents.table.create(['Mặt hàng', 'Số lượng', 'Đơn giá chốt', 'Thành tiền', 'Tham chiếu phí / credit']);
    for (const line of record.lines) {
      const tr = el('tr'), ledger = line.charge ? 'FolioEntry #' + line.charge.id + ' · Dòng dịch vụ #' + line.charge.serviceOrderLineId : BigInt(line.amountVnd) === 0n ? '0đ — không tạo phí' : 'Chưa ghi phí';
      tr.append(el('td', line.description + ' · #' + line.serviceId), el('td', formatQuantity(line.quantity ?? line.consumedQuantity)), el('td', formatMoney(line.unitPriceVnd)), el('td', formatMoney(line.amountVnd)),
        el('td', ledger + (line.credits.length ? ' · Credit ' + line.credits.map(row => '#' + row.id + ' đảo #' + row.reversesEntryId).join(', ') : ''))); body.append(tr);
    }
    if (!record.lines.length) { const tr = el('tr'); tr.append(el('td', 'Biên bản xác nhận không tiêu thụ.', { colspan: '5' })); body.append(tr); }
    table.append(body); const wrapper = el('div', null, { className: 'table-responsive' }); wrapper.append(table); return wrapper;
  }
  async function detail(id) {
    const selected = resource, body = open('Chi tiết #' + id); if (!body) return; const ticket = dialogGeneration; body.textContent = 'Đang đọc…';
    try {
      const row = (await apis[selected].detail(id)).data; if (ticket !== dialogGeneration || !$('g8-dialog').open) return;
      body.replaceChildren(el('p', statuses[row.status] + ' · Stay #' + row.stayId + ' · Giá chốt: ' + formatMoney(row.totalVnd)),
        el('p', 'Chốt giá lúc ' + time(row.pricedAtUtc) + (row.roomSegmentId ? ' · Segment #' + row.roomSegmentId : '')), lineTable(row));
      if (row.cancellationReason || row.notes) body.append(el('p', row.cancellationReason || row.notes, { className: 'g8-note' }));
      body.append(el('p', 'Chỉ hiển thị phí thuộc nguồn này; không truy vấn toàn bộ folio, số dư hoặc giao dịch của khách.', { className: 'small text-secondary' }));
    } catch (error) { if (ticket === dialogGeneration) body.textContent = errorText(error); }
  }
  function bindWrite(form, feedback, build, execute, operation) {
    form.dataset.pmsOperation = resource + '.' + operation;
    const send = el('button', names[operation], { className: 'btn btn-primary', type: 'submit' }); form.append(feedback, send);
    let frozenBody, key, uncertain = false, sending = false;
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (sending) return;
      if (!frozenBody) {
        try {
          frozenBody = build(); if (!root.crypto?.randomUUID) throw new Error('Cần môi trường an toàn để tạo khóa chống gửi lặp.'); key = root.crypto.randomUUID();
        } catch (error) { frozenBody = null; feedback.textContent = errorText(error); return; }
      }
      sending = true; pending = { key }; $('g8-close').disabled = true;
      for (const control of form.querySelectorAll('input,select,textarea,button')) control.disabled = true;
      feedback.textContent = 'Đang chờ backend xác nhận. Không gửi thao tác mới.';
      try {
        const result = await execute(frozenBody, { idempotencyKey: key });
        if (result.data?.committed !== true || !result.data.row || !result.data.event) throw new Error('Chưa có bằng chứng ghi thành công; giữ nguyên yêu cầu để đối chiếu.');
        pending = null; uncertain = false; $('g8-close').disabled = false; $('g8-dialog').close();
        const refreshed = await load(); message(names[operation] + ': backend xác nhận #' + result.data.row.id + (result.data.replayed ? ' (receipt gốc, không ghi thêm).' : '.')
          + ' · Nhân viên #' + result.data.event.actorId + ' · ' + time(result.data.event.atUtc)
          + (refreshed ? '' : ' Chưa tải lại danh sách; cần đối chiếu trước thao tác tiếp.'), refreshed ? 'success' : 'warning');
      } catch (error) {
        uncertain = uncertain || error.outcomeUnknown === true || (![400, 401, 403, 404, 409, 413, 415, 422].includes(error.status)
          && !['CUTOVER_WRITE_LOCKED', 'DEPLOYMENT_CHANGED', 'AUTH_NOT_CONFIGURED', 'AUTH_DEPENDENCY_UNAVAILABLE', 'CONSUMPTION_CONTRACT_NOT_APPROVED', 'CONSUMPTION_SQL_FORBIDDEN'].includes(error.code));
        feedback.textContent = errorText(error) + (uncertain ? ' Chưa rõ kết quả. Lưu mã và tra cứu tại trang trạng thái; không gửi lại. Khóa: ' + key : ' Chưa ghi thành công.');
        if (!uncertain) { pending = null; frozenBody = null; key = null; $('g8-close').disabled = false; for (const control of form.querySelectorAll('input,select,textarea,button')) control.disabled = false; }
        send.textContent = uncertain ? 'Chưa rõ kết quả — mở trang trạng thái để đối chiếu' : names[operation];
      } finally { sending = false; send.disabled = uncertain; }
    });
  }
  function contextFields(context) { return { expectedStayVersion: context.stayVersion, folioId: context.folioId, expectedFolioVersion: context.folioVersion }; }
  function contextLoader(form, selected, record) {
    const stay = field(form, 'stayId', 'Mã lượt lưu trú thực tế (StayId)'); if (record) { stay.value = record.stayId; stay.readOnly = true; }
    const segment = selected === 'audits' ? field(form, 'roomSegmentId', 'Mã segment phòng thực tế (không phải RoomId)') : null;
    if (record && segment) { segment.value = record.roomSegmentId; segment.readOnly = true; }
    const info = el('div', 'Chưa xác minh lượt đang ở, folio mở và segment.', { className: 'g8-context' }); let context;
    const fetchContext = button('Xác minh ngữ cảnh', async () => {
      context = null; fetchContext.disabled = true; info.textContent = 'Đang xác minh từ SQL…';
      try {
        const query = { stayId: stay.value.trim(), ...(segment ? { roomSegmentId: segment.value.trim() } : {}) };
        const result = await apis[selected].context(query);
        if (stay.value.trim() !== result.data.stayId || segment && segment.value.trim() !== result.data.roomSegmentId) throw new Error('Ngữ cảnh không khớp lựa chọn.');
        if (record && selected === 'audits' && result.data.inspectionScopeToken !== record.inspectionScopeToken) throw new Error('Chu kỳ kiểm đã thay đổi. Cần đối chiếu biên bản theo đúng phạm vi trước khi xác nhận.');
        context = result.data; info.textContent = context.stayCode + ' · Đang lưu trú · Folio mở' + (context.roomId ? ' · Phòng #' + context.roomId + ' · Segment #' + context.roomSegmentId : '');
      } catch (error) { info.textContent = errorText(error); } finally { fetchContext.disabled = false; }
    });
    stay.addEventListener('input', () => { context = null; }); segment?.addEventListener('input', () => { context = null; }); form.append(fetchContext, info);
    return () => {
      if (!context || context.stayId !== stay.value.trim() || segment && context.roomSegmentId !== segment.value.trim()) throw new Error('Cần xác minh lại ngữ cảnh trước khi gửi.');
      return context;
    };
  }
  function create() {
    const selected = resource, api = apis[selected], cap = caps[selected], body = open(names[selected] + ' — tạo mới'); if (!body) return;
    const form = el('form', null, { className: 'ops-form' }); body.append(form); const getContext = contextLoader(form, selected);
    form.append(el('p', 'Chọn mặt hàng từ SQL. Giá hiển thị là giá danh mục; backend kiểm phiên bản và chốt giá khi xác nhận tạo. Các bước sau không tính lại giá cũ.', { className: 'small text-secondary' }));
    const catalogSearch = el('input', null, { className: 'form-control', placeholder: 'Tìm mặt hàng trong danh mục', 'aria-label': 'Tìm mặt hàng' }), catalogInfo = el('p', 'Chưa tải danh mục.');
    const lineBox = el('div', null, { className: 'g8-lines' }), catalog = new Map(), selections = []; let catalogOffset = 0;
    const appendOptions = entry => {
      const previous = entry.select.value; entry.select.replaceChildren(el('option', 'Chọn mặt hàng', { value: '' }));
      for (const item of catalog.values()) entry.select.append(el('option', item.name + ' · ' + formatMoney(item.unitPriceVnd) + '/' + item.unit, { value: item.serviceId })); entry.select.value = previous;
    };
    const moreCatalog = button('Nạp thêm danh mục', () => loadCatalog(true)); moreCatalog.hidden = true;
    async function loadCatalog(more) {
      catalogInfo.textContent = 'Đang tải danh mục…'; moreCatalog.disabled = true;
      try {
        if (!more) catalogOffset = 0;
        const result = await api.catalog({ offset: catalogOffset, limit: Math.min(50, cap.maxLimit), ...(catalogSearch.value.trim() ? { q: catalogSearch.value.trim() } : {}) });
        for (const item of result.data) if (item.active && !catalog.has(item.serviceId)) catalog.set(item.serviceId, Object.freeze({ ...item }));
        catalogOffset += result.data.length; moreCatalog.hidden = result.meta?.hasMore !== true; selections.forEach(appendOptions);
        catalogInfo.textContent = 'Đã tải ' + catalog.size + ' mặt hàng. Không tự ghép giá mới vào dòng đã chọn; giá hết hiệu lực sẽ bị backend từ chối.';
      } catch (error) { catalogInfo.textContent = errorText(error); } finally { moreCatalog.disabled = false; }
    }
    form.append(catalogSearch, button('Tìm / tải danh mục', () => loadCatalog(false)), catalogInfo, moreCatalog, lineBox);
    function addLine() {
      if (selections.length >= cap.maxLines) { catalogInfo.textContent = 'Đã đạt giới hạn ' + cap.maxLines + ' dòng; không tự chia lô.'; return; }
      const row = el('div', null, { className: 'g8-line' }), select = el('select', null, { className: 'form-select', 'aria-label': 'Mặt hàng', required: 'required' }), count = el('input', null, { className: 'form-control', 'aria-label': selected === 'orders' ? 'Số lượng (dấu chấm thập phân)' : 'Số lượng tiêu thụ', title: selected === 'orders' ? 'Dùng dấu chấm thập phân, không nhập dấu phân cách hàng nghìn.' : 'Nhập số nguyên không âm.', required: 'required', inputmode: selected === 'orders' ? 'decimal' : 'numeric', placeholder: selected === 'orders' ? '1 hoặc 1.5' : '0, 1, 2…' });
      const entry = { row, select, count, item: null }; appendOptions(entry); select.addEventListener('change', () => { entry.item = catalog.get(select.value) || null; });
      row.append(select, count, button('Bỏ dòng', () => { selections.splice(selections.indexOf(entry), 1); row.remove(); })); selections.push(entry); lineBox.append(row);
    }
    form.append(button('Thêm dòng', addLine));
    const zeroLabel = el('label'), zero = el('input', null, { type: 'checkbox', className: 'form-check-input' });
    if (selected === 'audits') { zeroLabel.append(zero, document.createTextNode(' Tôi đã kiểm thực tế và xác nhận không có tiêu thụ (chỉ chọn khi tất cả số lượng bằng 0).')); form.append(zeroLabel); }
    else addLine();
    const note = field(form, 'note', 'Ghi chú', { required: false, textarea: true }), feedback = el('p', null, { role: 'status', className: 'g8-note' });
    bindWrite(form, feedback, () => {
      const context = getContext();
      const lines = selections.map(entry => {
        if (!entry.item || entry.item.serviceId !== entry.select.value) throw new Error('Chọn mặt hàng hợp lệ từ danh mục.');
        const value = entry.count.value.trim();
        if (selected === 'audits' && !/^(0|[1-9]\d{0,8})$/.test(value)) throw new Error('Lượng minibar phải là số nguyên không âm, tối đa 999999999.');
        return { serviceId: entry.item.serviceId, expectedServiceVersion: entry.item.version, ...(selected === 'orders' ? { quantity: value } : { consumedQuantity: Number(value) }) };
      });
      return { stayId: context.stayId, ...contextFields(context), lines, note: note.value.trim() || null,
        ...(selected === 'audits' ? { roomId: context.roomId, roomSegmentId: context.roomSegmentId, occupancyToken: context.occupancyToken, inspectionScopeToken: context.inspectionScopeToken, zeroConsumptionConfirmed: zero.checked } : {}) };
    }, (input, writeOptions) => api.create(input, writeOptions), 'create');
  }
  async function mutation(operation, summary) {
    const selected = resource, api = apis[selected], body = open(names[operation] + ' #' + summary.id); if (!body) return; const ticket = dialogGeneration; body.textContent = 'Đang đọc phiên bản mới nhất…';
    try {
      const row = (await api.detail(summary.id)).data; if (ticket !== dialogGeneration || !$('g8-dialog').open) return;
      if (!row.allowedActions.includes(operation)) throw new Error('Trạng thái/quyền đã thay đổi; thao tác không còn được phép.');
      body.replaceChildren(el('p', 'Giá nguồn: ' + formatMoney(row.totalVnd) + ' · ' + statuses[row.status]), lineTable(row));
      const form = el('form', null, { className: 'ops-form' }); body.append(form); const getContext = contextLoader(form, selected, row), reasonRequired = ['cancel', 'dispute'].includes(operation);
      const note = field(form, reasonRequired ? 'reason' : 'note', reasonRequired ? 'Lý do bắt buộc' : 'Ghi chú', { required: reasonRequired, textarea: true });
      if (operation === 'cancel') form.append(el('p', 'Phí đã ghi chỉ được đảo bằng credit liên kết. Không xóa dòng và không hoàn tiền tại đây.', { className: 'alert alert-info' }));
      bindWrite(form, el('p', null, { role: 'status', className: 'g8-note' }), () => {
        const context = getContext();
        return { expectedVersion: row.version, ...contextFields(context), [reasonRequired ? 'reason' : 'note']: note.value.trim() || null,
          ...(selected === 'audits' ? { occupancyToken: context.occupancyToken, inspectionScopeToken: context.inspectionScopeToken } : {}) };
      }, (input, writeOptions) => api.perform(row.id, operation, input, writeOptions), operation);
    } catch (error) { if (ticket === dialogGeneration) body.textContent = errorText(error); }
  }
  $('ops-menu').addEventListener('click', () => { const opened = $('ops-sidebar').classList.toggle('open'); $('ops-menu').setAttribute('aria-expanded', String(opened)); });
  $('g8-close').addEventListener('click', () => { if (!pending) $('g8-dialog').close(); }); $('g8-dialog').addEventListener('cancel', event => { if (pending) event.preventDefault(); });
  root.addEventListener('beforeunload', event => { if (pending) { event.preventDefault(); event.returnValue = ''; } });
  $('g8-reload').addEventListener('click', load); $('g8-create').addEventListener('click', create);
  $('g8-filters').addEventListener('submit', event => { event.preventDefault(); offset = 0; load(); });
  $('g8-prev').addEventListener('click', () => { offset = Math.max(0, offset - size); load(); }); $('g8-next').addEventListener('click', () => { offset += size; load(); });
  (async () => {
    try {
      const identity = await root.SongLamSession.restore(); actorId = identity.data.user.appUserId; $('g8-identity').textContent = identity.data.user.fullName || identity.data.user.username;
      await capabilities(); if (!caps[resource]?.visible) resource = ['orders', 'audits'].find(key => caps[key]?.visible);
      if (!resource) throw new Error('Phiên không có quyền đọc dịch vụ/minibar.');
      $('g8-filters').hidden = false; select(resource);
    } catch (error) { $('g8-identity').textContent = 'Chưa có phiên vận hành'; message(errorText(error) + ' Không dùng phiên hoặc dữ liệu demo thay thế.', 'warning'); }
  })();
}(window));
