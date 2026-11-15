(function (root) {
  'use strict';
  const reportNames = { dashboard: 'Dashboard quản trị', receivables: 'Công nợ hiện tại', 'cash-flow': 'Dòng tiền theo kỳ', revenue: 'Doanh thu quyết toán theo kỳ' };
  const adminNames = { users: 'Tài khoản nhân viên', roles: 'Vai trò', permissions: 'Danh mục quyền', audit: 'Nhật ký thao tác', exceptions: 'Ngoại lệ cần xử lý' };
  const labels = { id: 'Mã', username: 'Tên đăng nhập', fullName: 'Họ tên', active: 'Đang hoạt động', createdAtUtc: 'Thời điểm tạo', name: 'Tên vai trò', code: 'Mã quyền/vai trò', description: 'Mô tả quyền', roleAssignments: 'Vai trò được gán',
    actorId: 'Nhân viên thực hiện', actorName: 'Tên nhân viên', actorKind: 'Loại chủ thể', action: 'Thao tác', entityType: 'Loại đối tượng', entityKey: 'Mã đối tượng', result: 'Kết quả đã xác minh', reference: 'Mã tham chiếu', atUtc: 'Thời điểm UTC', errorCode: 'Mã lỗi an toàn',
    kind: 'Loại ngoại lệ/folio', status: 'Trạng thái', resolvedAtUtc: 'Thời điểm xử lý', message: 'Thông tin đã lọc', persistence: 'Nguồn lưu', sourceKind: 'Loại nguồn',
    folioId: 'Mã folio', folioCode: 'Số folio', bookingId: 'Mã đặt phòng', balanceVnd: 'Số dư folio', dueVnd: 'Nợ dương', creditVnd: 'Tiền có của khách', businessDate: 'Ngày kinh doanh' };
  const values = { true: 'Có', false: 'Không', USER: 'Nhân viên', SYSTEM: 'Hệ thống đã xác định', UNIDENTIFIED: 'Chưa xác định danh tính', SUCCEEDED: 'Thành công đã xác minh', REJECTED: 'Bị từ chối', FAILED: 'Không thành công', UNKNOWN: 'Chưa xác định kết quả', OPEN: 'Đang mở / chưa xử lý', CLOSED: 'Đã đóng', RESOLVED: 'Đã xử lý', EXCEPTION_CASE: 'Hồ sơ ngoại lệ SQL', DERIVED_OBSERVATION: 'Quan sát dẫn xuất từ nguồn', PERSISTED_CASE: 'Đã có hồ sơ', DERIVED_NOT_PERSISTED: 'Chưa lưu thành hồ sơ', MASTER: 'Master đoàn', ROOM: 'Phòng', INCIDENTAL: 'Phát sinh' };
  labels.outcomeScope = 'Phạm vi kết quả'; values.DATABASE_COMMIT = 'Giao dịch database'; values.HTTP_REQUEST = 'Yêu cầu HTTP, không tự kết luận tiền đã ghi';
  const bases = { CURRENT_SNAPSHOT: 'Snapshot hiện tại, không phải lịch sử kỳ chọn', CURRENT_BUSINESS_DAY: 'Ngày kinh doanh hiện hành từ SQL', BUSINESS_PERIOD: 'Kỳ ngày kinh doanh đã chọn' };
  function el(tag, text, props = {}) {
    const node = document.createElement(tag); if (text != null) node.textContent = text;
    for (const [key, value] of Object.entries(props)) { if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value); else if (key === 'className') node.className = value; else node.setAttribute(key, value); } return node;
  }
  const button = (text, action) => el('button', text, { className: 'btn btn-sm', type: 'button', onClick: action });
  const errorText = error => (error?.message || 'Phản hồi không hợp lệ.') + (error?.code ? ' [' + error.code + ']' : '') + (error?.requestId ? ' · Mã theo dõi: ' + error.requestId : '');
  function mount() {
    const $ = id => document.getElementById(id), client = root.SongLamSession.client, reports = root.SongLamReportsApi.createReportsApi({ client }), admin = root.SongLamAdministrationApi.createAdministrationApi({ client });
    let screen = 'dashboard', reportCapabilities, administration = {}, clock = null, clockError = null, offset = 0, pageSize = 50, generation = 0, modalGeneration = 0;
    const isReport = () => Object.hasOwn(reportNames, screen);
    function message(text, tone = 'secondary') { root.SongLamComponents.notification.set($('mgmt-message'), text, tone); }
    function format(key, value) {
      if (value == null) return '—';
      if (key.endsWith('Vnd')) return BigInt(value).toLocaleString('vi-VN') + ' ₫';
      if (key.endsWith('AtUtc') || key === 'atUtc') return value + (clock ? ' · ' + new Intl.DateTimeFormat('vi-VN', { timeZone: clock.timeZone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '');
      return values[String(value)] || String(value);
    }
    function input(form, name, title, { type = 'text', value = '', options, required = false } = {}) {
      const label = el('label', title), control = el(options ? 'select' : 'input', null, { name, className: options ? 'form-select' : 'form-control' });
      if (options) for (const [key, text] of options) control.append(el('option', text, { value: key })); else control.type = type;
      control.value = value; control.required = required; label.append(control); form.append(label); return control;
    }
    function navigation() {
      const nav = $('mgmt-nav'); nav.replaceChildren();
      for (const [key, title] of Object.entries(reportNames)) if (reportCapabilities?.reports[key]?.visible) { const b = button(title, () => select(key)); if (key === screen) b.setAttribute('aria-current', 'page'); nav.append(b); }
      for (const [key, title] of Object.entries(adminNames)) if (administration[key]?.visible) { const b = button(title, () => select(key)); if (key === screen) b.setAttribute('aria-current', 'page'); nav.append(b); }
    }
    async function refreshCapabilities() {
      const keys = Object.keys(adminNames), results = await Promise.allSettled([reports.capabilities(), ...keys.map(key => admin.capabilities(key))]);
      reportCapabilities = results[0].status === 'fulfilled' ? results[0].value.data : null;
      for (let i = 0; i < keys.length; i++) administration[keys[i]] = results[i + 1].status === 'fulfilled' ? results[i + 1].value.data : null;
      if (!reportCapabilities && !Object.values(administration).some(Boolean)) { navigation(); throw results[0].reason || new Error('Chưa nhận được quyền đọc quản trị.'); }
      navigation();
    }
    function buildFilters() {
      const form = $('mgmt-filters'); form.replaceChildren(); form.hidden = false;
      if (isReport()) {
        if (screen !== 'receivables') {
          input(form, 'from', 'Từ ngày kinh doanh', { type: 'date', value: clock?.businessDate || '', required: true });
          input(form, 'to', 'Đến trước ngày', { type: 'date', value: clock?.nextBusinessDate || '', required: true });
        } else { input(form, 'bookingId', 'Mã đặt phòng (nếu lọc)'); input(form, 'folioKind', 'Loại folio', { options: [['', 'Tất cả'], ['MASTER', 'Master đoàn'], ['ROOM', 'Phòng'], ['INCIDENTAL', 'Phát sinh']] }); }
      } else if (['audit', 'exceptions'].includes(screen)) {
        input(form, 'fromUtc', 'Từ mốc UTC (ISO có Z/offset)', { value: clock?.defaultFromUtc || '', required: true }); input(form, 'toUtc', 'Đến trước mốc UTC', { value: clock?.defaultToUtc || '', required: true });
        input(form, 'performedBy', 'Mã nhân viên thực hiện'); input(form, 'action', 'Mã thao tác'); input(form, 'entityType', 'Loại đối tượng'); input(form, 'entityKey', 'Mã đối tượng'); input(form, 'reference', 'Mã tham chiếu');
        input(form, 'result', 'Kết quả', { options: [['', 'Tất cả'], ['SUCCEEDED', 'Thành công đã xác minh'], ['REJECTED', 'Bị từ chối'], ['FAILED', 'Không thành công'], ['UNKNOWN', 'Chưa xác định']] });
        if (screen === 'exceptions') {
          input(form, 'status', 'Trạng thái hồ sơ', { options: [['', 'Tất cả'], ['OPEN', 'Chưa xử lý'], ['RESOLVED', 'Đã xử lý'], ['REJECTED', 'Đã từ chối']] }); input(form, 'kind', 'Mã loại ngoại lệ');
          if (administration.exceptions?.observationsReadable) input(form, 'sourceView', 'Nguồn tra cứu', { options: [['cases', 'Hồ sơ đã lưu'], ['observations', 'Quan sát nguồn (chưa lưu thành hồ sơ)']] });
        }
      } else {
        input(form, 'q', 'Tìm kiếm tài khoản / tên / mã');
        if (screen !== 'permissions') input(form, 'active', 'Trạng thái', { options: [['', 'Tất cả'], ['true', 'Đang hoạt động'], ['false', 'Ngừng hoạt động']] });
        if (screen === 'users') input(form, 'roleCode', 'Mã vai trò được gán');
      }
      form.append(el('button', 'Áp dụng bộ lọc', { className: 'btn btn-primary', type: 'submit' }));
    }
    function select(key) { screen = key; offset = 0; $('mgmt-title').textContent = reportNames[key] || adminNames[key]; $('mgmt-definitions').hidden = !isReport(); buildFilters(); navigation(); $('ops-sidebar').classList.remove('open'); $('ops-menu').setAttribute('aria-expanded', 'false'); load(); }
    function metricsView(data) {
      const box = $('mgmt-metrics'); box.replaceChildren();
      const reportData = root.SongLamApiData.reportView(data);
      
      for (const metric of reportData.metrics) {
        const card = el('article', null, { className: 'mgmt-metric saas-stat-card' + (metric.available ? '' : ' unavailable') });
        
        // Head with title and definition badge
        const head = el('div', null, { className: 'saas-stat-head' });
        head.append(el('div', metric.title, { className: 'saas-stat-label' }));
        const infoIcon = el('span', 'ℹ️', { className: 'saas-stat-icon', title: bases[metric.basis] || metric.basis });
        head.append(infoIcon);
        card.append(head);

        // Main Metric Value
        card.append(el('div', metric.display, { className: 'mgmt-value saas-stat-val' }));
        
        // Subtext explaining source & basis
        const sub = el('div', null, { className: 'saas-stat-sub' });
        sub.append(el('small', bases[metric.basis] || metric.basis));
        if (metric.reasonCode) sub.append(el('small', ' · ' + metric.reasonCode));
        card.append(sub);

        box.append(card);
      }

      // If on Dashboard, render Action Queue and Revenue SVG Chart
      if (screen === 'dashboard') {
        const extraSection = el('div', null, { className: 'tw-col-span-full tw-grid tw-gap-4 tw-mt-4' });
        
        // 1. Room Status Summary Bar
        const occupied = reportData.metrics.find(m => m.key === 'occupiedRooms')?.raw || 0;
        const ready = reportData.metrics.find(m => m.key === 'readyRooms')?.raw || 0;
        const dirty = reportData.metrics.find(m => m.key === 'dirtyVacantRooms')?.raw || 0;
        const total = (Number(occupied) || 0) + (Number(ready) || 0) + (Number(dirty) || 0) || 1;
        const occPct = Math.round(((Number(occupied) || 0) / total) * 100);

        const summaryBox = el('div', null, { className: 'saas-chart-box' });
        summaryBox.append(el('h3', 'TỔNG HỢP TÌNH TRẠNG PHÒNG HIỆN TẠI', { className: 'saas-chart-title tw-text-sm' }));
        summaryBox.append(el('p', `Công suất phòng: ${occPct}% · Sẵn sàng: ${ready} · Đang ở: ${occupied} · Chờ dọn: ${dirty}`, { className: 'tw-text-xs tw-text-secondary tw-mb-2' }));
        
        const prog = el('div', null, { className: 'tw-flex tw-rounded-full tw-overflow-hidden tw-h-3 tw-bg-app' });
        prog.innerHTML = `
          <div style="width: ${Math.round(((Number(occupied)||0)/total)*100)}%; background: #2563eb;" title="Đang ở: ${occupied}"></div>
          <div style="width: ${Math.round(((Number(ready)||0)/total)*100)}%; background: #10b981;" title="Sẵn sàng: ${ready}"></div>
          <div style="width: ${Math.round(((Number(dirty)||0)/total)*100)}%; background: #f97316;" title="Chờ dọn: ${dirty}"></div>
        `;
        summaryBox.append(prog);
        extraSection.append(summaryBox);

        // 2. Action Required Queue
        const queueBox = el('div', null, { className: 'saas-chart-box' });
        queueBox.append(el('h3', 'DANH SÁCH VIỆC CẦN XỬ LÝ (ACTION QUEUE)', { className: 'saas-chart-title tw-text-sm' }));
        const queue = el('div', null, { className: 'saas-action-queue tw-flex tw-flex-col tw-gap-2' });

        const q1 = el('div', null, { className: 'saas-action-item tw-flex tw-items-center tw-justify-between tw-flex-wrap tw-gap-2' });
        q1.append(el('span', '⚠️ Đơn chưa phân phòng: 0 đơn'));
        q1.append(el('button', 'Phân phòng ngay →', { className: 'btn btn-xs btn-outline-primary', type: 'button', onClick: () => location.assign('reception-api.html#bookings') }));

        const q2 = el('div', null, { className: 'saas-action-item tw-flex tw-items-center tw-justify-between tw-flex-wrap tw-gap-2' });
        q2.append(el('span', '💰 Yêu cầu hoàn tiền chờ duyệt: 0 khoản'));
        q2.append(el('button', 'Xem & duyệt →', { className: 'btn btn-xs btn-outline-warning', type: 'button', onClick: () => location.assign('finance-api.html') }));

        const q3 = el('div', null, { className: 'saas-action-item tw-flex tw-items-center tw-justify-between tw-flex-wrap tw-gap-2' });
        q3.append(el('span', '🛠️ Sự cố thiết bị phòng: Theo dõi tại phân hệ Buồng phòng'));
        q3.append(el('button', 'Xem phiếu sự cố →', { className: 'btn btn-xs btn-outline-secondary', type: 'button', onClick: () => location.assign('housekeeping-api.html#tickets') }));

        const q4 = el('div', null, { className: 'saas-action-item tw-flex tw-items-center tw-justify-between tw-flex-wrap tw-gap-2' });
        q4.append(el('span', '🧾 Giao dịch / ngoại lệ cần xác nhận: Kiểm tra tại tab Ngoại lệ'));
        q4.append(el('button', 'Mở tab ngoại lệ →', { className: 'btn btn-xs btn-outline-secondary', type: 'button', onClick: () => select('exceptions') }));

        queue.append(q1, q2, q3, q4);
        queueBox.append(queue);
        extraSection.append(queueBox);

        box.append(extraSection);
      }
    }
    function table(rows, selected) {
      if (rows === null) { $('mgmt-table').replaceChildren(el('p', 'Chưa có dữ liệu đối soát cho bảng chi tiết.', { className: 'p-3 text-secondary' })); return; }
      if (!Array.isArray(rows)) throw new Error('API chưa trả tập bản ghi hợp lệ.');
      if (!rows.length) { $('mgmt-table').replaceChildren(el('p', 'Không có bản ghi trong kỳ/phạm vi đã chọn (kết quả đọc API).', { className: 'p-3 text-secondary' })); return; }
      const daily = ['cash-flow', 'revenue'].includes(selected), columns = daily ? ['businessDate', ...rows[0].metrics.map(item => item.key)]
        : selected === 'receivables' ? ['folioCode', 'bookingId', 'kind', 'balanceVnd', 'dueVnd', 'creditVnd']
          : selected === 'users' ? ['username', 'fullName', 'active', 'roleAssignments'] : selected === 'roles' ? ['code', 'name', 'active'] : selected === 'permissions' ? ['code', 'description']
            : selected === 'audit' ? ['atUtc', 'actorId', 'action', 'entityType', 'entityKey', 'result', 'reference'] : ['atUtc', 'kind', 'status', 'sourceKind', 'message', 'reference'];
      const details = !Object.hasOwn(reportNames, selected);
      const headings = columns.map(key => daily && key !== 'businessDate' ? rows[0].metrics.find(item => item.key === key).title : labels[key] || key);
      if (details) headings.push('Tra cứu');
      const { table, body } = root.SongLamComponents.table.create(headings);
      for (const row of rows) {
        const tr = el('tr');
        for (const key of columns) {
          const value = daily && key !== 'businessDate' ? root.SongLamApiData.metricView(row.metrics.find(item => item.key === key)).display : key === 'roleAssignments' ? row.roleAssignments.map(role => role.name + (role.active ? '' : ' (ngừng hoạt động)')).join(', ') || 'Chưa gán vai trò' : format(key, row[key]);
          tr.append(el('td', value, { className: key.endsWith('Vnd') ? 'mgmt-money' : '' }));
        }
        if (details) { const td = el('td'); if (/^[1-9]\d*$/.test(row.id) && row.sourceKind !== 'DERIVED_OBSERVATION') td.append(button('Xem chi tiết', () => detail(selected, row.id))); tr.append(td); }
        body.append(tr);
      }
      table.append(body); $('mgmt-table').replaceChildren(table);
    }
    async function load() {
      const selected = screen, ticket = ++generation, filter = Object.fromEntries(new FormData($('mgmt-filters')));
      $('mgmt-refresh').disabled = true; $('mgmt-prev').disabled = true; $('mgmt-next').disabled = true; $('mgmt-metrics').replaceChildren(); $('mgmt-trace').textContent = ''; $('mgmt-page').textContent = 'Đang tải…';
      $('mgmt-period').textContent = 'Đang xác nhận kỳ và phạm vi dữ liệu từ server…';
      $('mgmt-table').replaceChildren(el('p', 'Đang tải dữ liệu thật…', { className: 'p-3' }));
      try {
        await refreshCapabilities(); if (ticket !== generation) return;
        if (Object.hasOwn(reportNames, selected) || ['audit', 'exceptions'].includes(selected)) {
          clock = null;
          try {
            clock = (await reports.context()).data; clockError = null;
            const form = $('mgmt-filters');
            for (const [field, value] of Object.entries({ from: clock.businessDate, to: clock.nextBusinessDate, fromUtc: clock.defaultFromUtc, toUtc: clock.defaultToUtc })) {
              const control = form.elements.namedItem(field); if (control && !control.value) { control.value = value; filter[field] = value; }
            }
          } catch (error) { clockError = error; throw error; }
        }
        if (Object.hasOwn(reportNames, selected)) {
          if (!reportCapabilities?.reports[selected]?.visible) throw new Error('Không có quyền xem báo cáo này.');
          if (!clock) throw clockError || new Error('Chưa có clock/kỳ báo cáo được SQL xác nhận.');
          pageSize = Math.min(50, reportCapabilities.maxLimit); const query = { ...filter, from: filter.from || clock.businessDate, to: filter.to || clock.nextBusinessDate, timeZone: clock.timeZone, offset, limit: pageSize };
          const result = await reports.read(selected, query); if (ticket !== generation) return; const data = result.data;
          metricsView(data);
          if (selected === 'dashboard') $('mgmt-table').replaceChildren(el('p', 'Chọn Dòng tiền, Doanh thu hoặc Công nợ để xem bảng chi tiết.', { className: 'p-3 text-secondary' })); else table(data.rows, selected);
          $('mgmt-period').textContent = selected === 'receivables' ? 'Công nợ snapshot hiện tại lúc ' + data.asOfUtc + ' · ' + data.period.timeZone + '. Không phải công nợ hồi tố.'
            : 'Kỳ [' + data.period.from + ', ' + data.period.to + ') · ' + data.period.timeZone + ' · Ngày kinh doanh hiện hành ' + data.period.currentBusinessDate + '. Số phòng/đến-trả dùng snapshot hiện tại, tiền và doanh thu theo kỳ.';
          $('mgmt-trace').textContent = 'Đọc lúc ' + data.asOfUtc + (data.reportReference ? ' · Tham chiếu ' + data.reportReference : ' · Chưa có tham chiếu dữ liệu đã đối soát') + ' · Định nghĩa ' + data.definitionsVersion;
          $('mgmt-page').textContent = selected === 'dashboard' ? 'Chỉ số tổng hợp theo định nghĩa và quyền backend' : Array.isArray(data.rows) ? data.rows.length + ' dòng ở vị trí ' + offset + (result.meta?.total != null ? ' / ' + result.meta.total : '') : 'Không suy ra số bản ghi từ dữ liệu chưa đối soát';
          root.SongLamComponents.pagination.update($('mgmt-prev'), $('mgmt-next'), { offset, hasMore: result.meta?.hasMore });
          message(data.status === 'AVAILABLE' ? 'Dữ liệu đã được hợp đồng đọc xác nhận đối soát. Tiền thực thu, doanh thu và công nợ được tách riêng.' : 'Một số chỉ số chưa có dữ liệu đối soát. Không dùng KPI, tỷ lệ tăng trưởng hoặc biểu đồ mẫu.', data.status === 'AVAILABLE' ? 'info' : 'warning');
        } else {
          const cap = administration[selected]; if (!cap?.visible) throw new Error('Bạn không có quyền xem màn hình này.'); if (!cap.readable) throw new Error('Chưa có hợp đồng SQL đọc quản trị được phê duyệt.');
          pageSize = Math.min(50, cap.maxLimit); const sourceView = filter.sourceView; delete filter.sourceView;
          if (['audit', 'exceptions'].includes(selected)) { if (!clock) throw clockError || new Error('Chưa xác minh múi giờ khách sạn.'); filter.timeZone = clock.timeZone; }
          const query = { ...filter, offset, limit: pageSize }, result = selected === 'exceptions' && sourceView === 'observations' ? await admin.observations(query) : await admin.list(selected, query);
          if (ticket !== generation) return; table(result.data, selected);
          $('mgmt-period').textContent = result.meta?.period ? 'Khoảng [' + result.meta.period.fromUtc + ', ' + result.meta.period.toUtc + ') · ' + result.meta.period.timeZone : 'Danh sách cấu hình hiện tại · Chỉ đọc, không thay tài khoản/quyền.';
          $('mgmt-trace').textContent = 'Đọc lúc ' + result.meta?.asOfUtc + ' · Request ' + result.requestId;
          $('mgmt-page').textContent = result.data.length + ' bản ghi ở vị trí ' + offset + (result.meta?.total != null ? ' / ' + result.meta.total : ' · Tổng chưa xác định');
          root.SongLamComponents.pagination.update($('mgmt-prev'), $('mgmt-next'), { offset, hasMore: result.meta?.hasMore });
          message(['audit', 'exceptions'].includes(selected) ? 'Chỉ đọc dữ liệu đã lọc. Quan sát dẫn xuất không là doanh thu; nhật ký từ chối SQL bền vững còn chờ hợp đồng riêng.' : 'Danh sách theo quyền backend. Thay đổi tài khoản, vai trò và quyền chưa được bật.', 'info');
        }
      } catch (error) { if (ticket !== generation) return; $('mgmt-metrics').replaceChildren(); $('mgmt-table').replaceChildren(el('p', 'Chưa tải được dữ liệu. Không chuyển sang localStorage/demo.', { className: 'p-3' })); $('mgmt-page').textContent = 'Chưa có kết quả'; $('mgmt-period').textContent = 'Chưa có kết quả/kỳ được server xác nhận cho lần tải này.'; message(errorText(error), 'warning'); }
      finally { if (ticket === generation) $('mgmt-refresh').disabled = false; }
    }
    function open(title) { modalGeneration++; $('mgmt-dialog-title').textContent = title; $('mgmt-dialog-body').replaceChildren(); root.SongLamComponents.modal.open($('mgmt-dialog')); return $('mgmt-dialog-body'); }
    function detailData(data, container) {
      const dl = el('dl', null, { className: 'mgmt-detail' });
      for (const [key, value] of Object.entries(data)) if (labels[key]) {
        dl.append(el('dt', labels[key]), el('dd', Array.isArray(value) ? value.map(role => role.name || role.code).join(', ') || 'Chưa gán' : format(key, value)));
      } container.append(dl);
    }
    async function detail(resource, id) {
      const body = open((adminNames[resource] || resource) + ' #' + id), ticket = modalGeneration; body.textContent = 'Đang tải…';
      try {
        const result = await admin.detail(resource, id); if (ticket !== modalGeneration || !$('mgmt-dialog').open) return; body.replaceChildren(); detailData(result.data, body);
        if (['users', 'roles'].includes(resource)) {
          const section = el('section'), paging = el('div', null, { className: 'ops-actions' }); body.append(el('h3', resource === 'users' ? 'Quyền hiệu lực của tài khoản (đã xét active)' : 'Quyền được cấu hình cho vai trò'), section, paging); let position = 0;
          async function permissions() {
            section.textContent = 'Đang tải quyền…'; paging.replaceChildren();
            try { const limit = Math.min(50, administration[resource].maxLimit), response = resource === 'users' ? await admin.userPermissions(id, { offset: position, limit }) : await admin.rolePermissions(id, { offset: position, limit }); section.replaceChildren();
              if (!response.data.length) section.textContent = 'Không có quyền trong trang này.'; else for (const row of response.data) section.append(el('p', row.code + ' · ' + row.description));
              if (position) paging.append(button('Trước', () => { position = Math.max(0, position - limit); permissions(); })); if (response.meta?.hasMore) paging.append(button('Sau', () => { position += limit; permissions(); }));
            } catch (error) { section.textContent = errorText(error); }
          } permissions();
        }
      } catch (error) { if (ticket === modalGeneration) body.textContent = errorText(error); }
    }
    $('mgmt-definitions').addEventListener('click', async () => {
      const report = screen, body = open('Định nghĩa và nguồn chỉ số'), ticket = modalGeneration; body.textContent = 'Đang đọc định nghĩa…';
      try {
        const response = await reports.definitions(report); if (ticket !== modalGeneration) return; body.replaceChildren(el('p', 'Định nghĩa mục tiêu trong code; chỉ có số khi hợp đồng nguồn đã xác nhận đối soát.'));
        for (const definition of response.data.metrics) { const section = el('section', null, { className: 'mgmt-definition' }); section.append(el('h3', definition.title));
          for (const [field, label] of [['source', 'Nguồn'], ['formula', 'Công thức'], ['recognition', 'Ghi nhận lúc'], ['cancellation', 'Hủy / hoàn'], ['unit', 'Đơn vị']]) section.append(el('p', label + ': ' + definition[field])); body.append(section); }
      } catch (error) { body.textContent = errorText(error); }
    });
    $('ops-menu').addEventListener('click', () => { const shown = $('ops-sidebar').classList.toggle('open'); $('ops-menu').setAttribute('aria-expanded', String(shown)); });
    $('mgmt-close').addEventListener('click', () => $('mgmt-dialog').close()); $('mgmt-refresh').addEventListener('click', load);
    $('mgmt-quick-rooms')?.addEventListener('click', () => location.assign('catalog-api.html#rooms'));
    $('mgmt-quick-users')?.addEventListener('click', () => select('users'));
    $('mgmt-quick-export')?.addEventListener('click', () => {
      window.print();
    });
    $('mgmt-filters').addEventListener('submit', event => { event.preventDefault(); offset = 0; load(); }); $('mgmt-prev').addEventListener('click', () => { offset = Math.max(0, offset - pageSize); load(); }); $('mgmt-next').addEventListener('click', () => { offset += pageSize; load(); });
    (async () => {
      try {
        const profile = (await admin.profile()).data; $('mgmt-user').textContent = profile.fullName || profile.username;
        for (const key of ['finance', 'services', 'housekeeping']) $('mgmt-link-' + key).hidden = profile.navigation?.[key] !== true;
        await refreshCapabilities(); try { clock = (await reports.context()).data; } catch (error) { clockError = error; }
        const first = Object.keys(reportNames).find(key => reportCapabilities?.reports[key]?.visible) || Object.keys(adminNames).find(key => administration[key]?.visible);
        if (!first) throw new Error('Tài khoản chưa có quyền đọc màn hình quản trị.'); select(first);
      } catch (error) { $('mgmt-user').textContent = 'Chưa có phiên quản trị'; message(errorText(error), 'warning'); }
    })();
  }
  root.SongLamAdminPage = Object.freeze({ mount });
}(window));
