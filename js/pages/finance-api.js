(function (root) {
  'use strict';
  const $ = id => document.getElementById(id), client = root.SongLamSession.client;
  const titles = { folios: 'Folio cá nhân & master', deposits: 'Sổ tiền cọc', payments: 'Thu tiền', refunds: 'Yêu cầu hoàn tiền', checkouts: 'Trả phòng & quyết toán', invoices: 'Phiếu nội bộ', cashier: 'Ca thu ngân', days: 'Ngày kinh doanh' };
  const commands = { create: 'Tạo mới', open: 'Mở ca', transfer: 'Chuyển công nợ', credit: 'Ghi credit có nguồn', close: 'Chốt / đóng', apply: 'Đối trừ cọc', unapply: 'Đảo đối trừ cọc', allocate: 'Phân bổ cọc',
    cancel: 'Hủy khoản đang chờ', decide: 'Duyệt / từ chối hoàn', complete: 'Hoàn tất', issue: 'Phát hành phiếu nội bộ' };
  const labels = {
    id: 'Mã', code: 'Mã nghiệp vụ', bookingId: 'Mã đặt phòng', bookingRoomId: 'Phần phòng của đơn', stayId: 'Mã lưu trú', roomId: 'Mã phòng', folioId: 'Mã folio', depositAccountId: 'Mã tài khoản cọc',
    status: 'Trạng thái', kind: 'Loại', direction: 'Chiều tiền', purpose: 'Mục đích', method: 'Phương thức', businessDate: 'Ngày kinh doanh', timeZone: 'Múi giờ khách sạn', cutoffLocalTime: 'Mốc chốt theo giờ khách sạn',
    amountVnd: 'Số tiền', balanceVnd: 'Số dư sổ', dueVnd: 'Còn phải thu', creditVnd: 'Tiền có của khách', reservedRefundVnd: 'Đang giữ cho yêu cầu hoàn', availableVnd: 'Cọc có thể sử dụng',
    chargesVnd: 'Phí sau điều chỉnh', creditsVnd: 'Credit/giảm phí', paymentsVnd: 'Thanh toán đã nhận', refundsVnd: 'Đã hoàn', depositAppliedVnd: 'Cọc đã đối trừ', depositUnappliedVnd: 'Đã đảo đối trừ', transferInVnd: 'Công nợ nhận vào', transferOutVnd: 'Công nợ chuyển đi',
    roomVnd: 'Tiền phòng đã chốt', serviceVnd: 'Dịch vụ khác (không gồm minibar)', minibarVnd: 'Minibar', surchargeVnd: 'Phụ thu', discountVnd: 'Giảm trừ', receivedVnd: 'Cọc đã thu', refundedVnd: 'Đã hoàn cọc', appliedVnd: 'Đã đối trừ cọc', unappliedVnd: 'Đã đảo đối trừ cọc', allocatedInVnd: 'Cọc nhận phân bổ', allocatedOutVnd: 'Cọc chuyển phân bổ',
    openingCashVnd: 'Tiền đầu ca', countedCashVnd: 'Tiền mặt kiểm đếm', cashInVnd: 'Tiền mặt thực thu', cashOutVnd: 'Tiền mặt thực chi hoàn', expectedCashVnd: 'Tiền mặt theo sổ', varianceVnd: 'Chênh lệch kiểm đếm', collectedVnd: 'Tổng thu thành công', netReceiptsVnd: 'Thực thu ròng', settledRevenueVnd: 'Doanh thu quyết toán', outstandingVnd: 'Vị thế folio còn mở', pendingPaymentCount: 'Giao dịch chờ',
    sourceType: 'Loại giao dịch nguồn', sourceId: 'Mã giao dịch nguồn', internalNumber: 'Số phiếu nội bộ', documentKind: 'Loại chứng từ', buyerName: 'Người nhận phiếu', netVnd: 'Tiền nguồn', taxVnd: 'Thuế theo chứng từ nguồn', totalVnd: 'Tổng phiếu',
    cashierId: 'Thu ngân', recordedById: 'Người ghi', createdById: 'Người tạo', requestedById: 'Người yêu cầu', approvedById: 'Người duyệt', originalPaymentId: 'Khoản thu gốc', refundPaymentId: 'Khoản chi hoàn', refundRequestId: 'Yêu cầu hoàn', shiftId: 'Ca thu ngân',
    originalMovementId: 'Bút toán đối trừ gốc', originalEntryId: 'Dòng phí gốc', targetFolioId: 'Folio bên nhận', targetDepositAccountId: 'Tài khoản cọc bên nhận', paymentId: 'Giao dịch tiền', depositMovementId: 'Bút toán cọc', serviceOrderLineId: 'Dòng dịch vụ nguồn', reversesEntryId: 'Đảo phí gốc', reversesMovementId: 'Đảo bút toán cọc',
    description: 'Nội dung', reason: 'Lý do / ghi chú bắt buộc', notes: 'Ghi chú', decision: 'Quyết định', eInvoiceStatus: 'Hóa đơn điện tử', nextBusinessDate: 'Ngày kinh doanh kế tiếp',
    createdAtUtc: 'Lúc tạo', requestedAtUtc: 'Lúc yêu cầu', approvedAtUtc: 'Lúc duyệt', succeededAtUtc: 'Lúc ghi nhận thành công', openedAtUtc: 'Mở ca lúc', closedAtUtc: 'Đóng lúc', issuedAtUtc: 'Phát hành phiếu lúc', checkedOutAtUtc: 'Trả phòng lúc',
    summary: 'Đối soát của lượt ở', totals: 'Tổng hợp sổ', before: 'Trước phương án', after: 'Sau phương án', master: 'Công nợ master của đoàn', balanceBeforeVnd: 'Master trước chuyển', balanceAfterVnd: 'Master sau chuyển', transferredVnd: 'Chuyển từ phòng này sang master',
    minibarCoverage: 'Biên bản minibar theo segment', segmentId: 'Segment phòng', auditId: 'Biên bản kiểm', blockers: 'Điểm chưa đủ điều kiện', message: 'Chi tiết', canComplete: 'Đủ điều kiện xác nhận', minibarCoverageComplete: 'Đã đối chiếu đủ các segment', shift: 'Sổ ca', day: 'Sổ ngày'
  };
  const values = { OPEN: 'Đang mở', CLOSED: 'Đã chốt', PENDING: 'Chờ xác nhận', SUCCEEDED: 'Đã nhận / chi thành công', FAILED: 'Không thành công', CANCELLED: 'Đã hủy', APPROVED: 'Đã duyệt', REJECTED: 'Đã từ chối', COMPLETED: 'Đã hoàn tất',
    IN_HOUSE: 'Đang lưu trú', CHECKED_OUT: 'Đã trả phòng', MASTER: 'Master đoàn', ROOM: 'Phòng', INCIDENTAL: 'Phát sinh', BOOKING: 'Cọc đặt phòng', GUARANTEE: 'Cọc bảo đảm',
    IN: 'Thu', OUT: 'Chi hoàn', CASH: 'Tiền mặt', BANK_TRANSFER: 'Chuyển khoản (chờ đối soát)', VIETQR: 'VietQR (chờ đối soát)', VNPAY_QR: 'VNPAY (chờ đối soát)', ONEPAY: 'OnePay (chờ đối soát)', POS_CARD: 'POS (chờ đối soát)',
    BOOKING_DEPOSIT: 'Cọc đặt phòng', GUARANTEE_DEPOSIT: 'Cọc bảo đảm', SETTLEMENT: 'Quyết toán', SERVICE: 'Thanh toán dịch vụ', REFUND: 'Hoàn tiền', PAYMENT: 'Thu tiền', RECEIPT: 'Phiếu nội bộ', DRAFT: 'Nháp', ISSUED: 'Phiếu nội bộ đã phát hành', NOT_INTEGRATED: 'Chưa tích hợp / chưa phát hành hóa đơn điện tử',
    CONFIRMED: 'Đã kiểm xác nhận', MISSING: 'Chưa có biên bản', DISPUTED: 'Đang tranh chấp', QUICK_PROPOSED: 'Đề xuất kiểm nhanh (chưa ghi)'
  };
  const choices = { method: ['CASH', 'BANK_TRANSFER', 'VIETQR', 'VNPAY_QR', 'ONEPAY', 'POS_CARD'], purpose: ['BOOKING_DEPOSIT', 'GUARANTEE_DEPOSIT', 'SETTLEMENT', 'SERVICE'], sourceType: ['PAYMENT', 'REFUND', 'SETTLEMENT'], decision: ['APPROVED', 'REJECTED'] };
  let actorId, resource = root.location.hash === '#checkout' ? 'checkouts' : 'folios', capabilities = {}, offset = 0, pageSize = 50, generation = 0, modalGeneration = 0, pending = null;
  const api = root.SongLamFinanceApi.createFinanceApi({ client, getCsrfToken: async () => {
    const me = await root.SongLamSession.restore(); if (me.data.user.appUserId !== actorId) throw new root.SongLamHttp.ApiError('Phiên đã đổi nhân viên. Tải lại trang trước khi thao tác.', { status: 401, code: 'SESSION_CHANGED' }); return me.data.csrfToken;
  } });
  function el(tag, text, props = {}) { const node = document.createElement(tag); if (text != null) node.textContent = text; for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value); else if (key === 'className') node.className = value; else node.setAttribute(key, value);
  } return node; }
  const button = (text, action, primary = false) => el('button', text, { type: 'button', className: 'btn btn-sm' + (primary ? ' btn-primary' : ''), onClick: action });
  const errorText = error => (error?.message || 'Phản hồi không hợp lệ.') + (error?.code ? ' [' + error.code + ']' : '') + (error?.requestId ? ' · Mã theo dõi: ' + error.requestId : '');
  const money = value => { try { return BigInt(value).toLocaleString('vi-VN') + ' ₫'; } catch { return 'Chưa xác định'; } };
  const display = (key, value) => value == null ? '—' : key.endsWith('Vnd') ? money(value) : typeof value === 'boolean' ? value ? 'Có' : 'Không' : key.endsWith('AtUtc') ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) : values[value] || String(value);
  function message(text, tone = 'secondary') { root.SongLamComponents.notification.set($('fin-message'), text, tone); }
  function renderData(data, parent) {
    if (Array.isArray(data)) { data.forEach((row, i) => { const block = el('section', null, { className: 'fin-group' }); block.append(el('h3', 'Dòng ' + (i + 1))); renderData(row, block); parent.append(block); }); return; }
    const dl = el('dl', null, { className: 'fin-values' });
    for (const [key, value] of Object.entries(data || {})) {
      if (!labels[key]) continue;
      if (value && typeof value === 'object') { const section = el('section', null, { className: 'fin-group' }); section.append(el('h3', labels[key])); renderData(value, section); parent.append(section); }
      else dl.append(el('dt', labels[key]), el('dd', display(key, value)));
    }
    if (dl.children.length) parent.prepend(dl);
  }
  function open(title) { if (pending) return null; modalGeneration++; $('fin-dialog-title').textContent = title; $('fin-dialog-body').replaceChildren(); root.SongLamComponents.modal.open($('fin-dialog')); return $('fin-dialog-body'); }
  function input(parent, name, title, required = true, options) {
    const label = el('label', title), control = options ? el('select', null, { name, className: 'form-select' }) : el(name === 'reason' ? 'textarea' : 'input', null, { name, className: 'form-control', autocomplete: 'off' });
    if (options) for (const value of options) control.append(el('option', values[value] || value, { value }));
    control.required = required; if (name.endsWith('Vnd')) { control.inputMode = 'numeric'; control.pattern = '(0|[1-9][0-9]*)'; control.placeholder = 'VND nguyên, không dấu phân cách'; }
    if (name.endsWith('Id')) { control.inputMode = 'numeric'; control.pattern = '[1-9][0-9]*'; } if (name === 'reason') control.maxLength = 1000;
    label.append(control); parent.append(label); return control;
  }
  async function refreshCapabilities() {
    const keys = Object.keys(titles), results = await Promise.allSettled(keys.map(key => api[key].capabilities()));
    for (let i = 0; i < keys.length; i++) capabilities[keys[i]] = results[i].status === 'fulfilled' ? results[i].value.data : null;
    if (!keys.some(key => capabilities[key])) throw results[0].reason || new Error('Chưa nhận được quyền tài chính hợp lệ.');
    const nav = $('fin-nav'); nav.replaceChildren();
    for (const key of keys) if (capabilities[key]?.visible) { const b = button(titles[key], () => select(key)); if (key === resource) b.setAttribute('aria-current', 'page'); nav.append(b); }
  }
  function select(key, initialFilters = {}) {
    resource = key; offset = 0; $('fin-filters').reset(); $('fin-title').textContent = titles[key];
    for (const [name, value] of Object.entries(initialFilters)) if ($('fin-filters').elements.namedItem(name)) $('fin-filters').elements.namedItem(name).value = value;
    $('fin-booking-filter').hidden = !['folios', 'deposits', 'payments', 'checkouts'].includes(key); $('fin-date-filter').hidden = !['payments', 'cashier', 'days'].includes(key); $('fin-shift-filter').hidden = key !== 'payments';
    $('ops-sidebar').classList.remove('open'); $('ops-menu').setAttribute('aria-expanded', 'false'); load();
  }
  async function load() {
    const ticket = ++generation, selected = resource; $('fin-refresh').disabled = true; $('fin-create-actions').replaceChildren(); $('fin-prev').disabled = true; $('fin-next').disabled = true;
    $('fin-table').replaceChildren(el('p', 'Đang đọc dữ liệu…', { className: 'p-3' })); $('fin-page').textContent = 'Chưa có kết quả';
    try {
      await refreshCapabilities(); if (ticket !== generation) return false; const cap = capabilities[selected];
      if (!cap?.visible) throw new Error('Bạn không có quyền đọc sổ này.'); if (!cap.readable) throw new Error('Hợp đồng SQL tài chính chưa được phê duyệt/cấu hình. Không dùng số dư demo thay thế.');
      pageSize = Math.min(50, cap.maxLimit); const filters = Object.fromEntries(new FormData($('fin-filters'))); const result = await api[selected].list({ ...filters, offset, limit: pageSize }); if (ticket !== generation) return false;
      const { table, body } = root.SongLamComponents.table.create(['Mã / nguồn', 'Trạng thái', 'Ngày / người ghi', 'Số tiền hoặc số dư sổ', 'Thao tác']);
      for (const row of result.data) {
        const tr = el('tr'), actions = el('td'), group = el('div', null, { className: 'ops-actions' });
        tr.append(el('td', (row.code || row.internalNumber || row.id) + (row.bookingId ? ' · Booking #' + row.bookingId : '')), el('td', values[row.status] || row.status), el('td', (row.businessDate || '—') + ' · #' + (row.recordedById || row.cashierId || row.requestedById || row.createdById || '—')),
          el('td', money(row.balanceVnd ?? row.amountVnd ?? row.totalVnd ?? row.expectedCashVnd ?? row.netReceiptsVnd ?? row.summary?.balanceVnd), { className: 'fin-money' }));
        group.append(button('Chi tiết / đối soát', () => detail(row.id)));
        for (const operation of row.allowedActions || []) group.append(button(selected === 'checkouts' ? 'Xem trước / trả phòng' : commands[operation], () => commandForm(operation, row), true));
        actions.append(group); tr.append(actions); body.append(tr);
      }
      if (!result.data.length) { const tr = el('tr'); tr.append(el('td', 'Không có bản ghi phù hợp từ máy chủ.', { colspan: '5' })); body.append(tr); } table.append(body); $('fin-table').replaceChildren(table);
      for (const operation of ['create', 'open']) if (cap.commands[operation]) { const b = button(commands[operation], () => commandForm(operation), true); b.disabled = !cap.commands[operation].enabled; $('fin-create-actions').append(b); }
      $('fin-page').textContent = result.data.length + ' bản ghi · Vị trí ' + offset + (result.meta?.total != null ? ' / ' + result.meta.total : ' · Tổng chưa xác định'); root.SongLamComponents.pagination.update($('fin-prev'), $('fin-next'), { offset, hasMore: result.meta?.hasMore });
      message('Dữ liệu từ API. Số dư sổ không đồng nghĩa tiền thực thu; khoản chờ xác nhận không được tính là đã nhận.', 'info'); return true;
    } catch (error) { if (ticket !== generation) return false; $('fin-table').replaceChildren(el('p', 'Chưa có dữ liệu tài chính để hiển thị.', { className: 'p-3' })); message(errorText(error), 'warning'); return false; }
    finally { if (ticket === generation) $('fin-refresh').disabled = false; }
  }
  async function detail(id) {
    const selected = resource, body = open(titles[selected] + ' #' + id); if (!body) return; const ticket = modalGeneration; body.textContent = 'Đang đọc…';
    try {
      const result = await api[selected].detail(id); if (ticket !== modalGeneration || !$('fin-dialog').open) return; body.replaceChildren(); renderData(result.data, body);
      if (selected === 'cashier') body.append(button('Xem khoản thu/hoàn của ca này', () => {
        $('fin-dialog').close(); select('payments', { shiftId: id });
      }));
      if (['folios', 'deposits'].includes(selected)) {
        const journal = el('section'), pager = el('div', null, { className: 'ops-actions' }); body.append(el('h3', selected === 'folios' ? 'Sổ phát sinh (có phân trang)' : 'Lịch sử cọc (có phân trang)'), journal, pager); let entryOffset = 0;
        async function entries() {
          journal.textContent = 'Đang đọc sổ…'; pager.replaceChildren();
          try {
            const size = Math.min(50, capabilities[selected].maxLimit), result = await api[selected].entries(id, { offset: entryOffset, limit: size }); journal.replaceChildren(); renderData(result.data, journal);
            if (!result.data.length) journal.textContent = 'Chưa có bút toán trong trang này.';
            if (entryOffset) pager.append(button('Trước', () => { entryOffset = Math.max(0, entryOffset - size); entries(); }));
            if (result.meta?.hasMore === true) pager.append(button('Sau', () => { entryOffset += size; entries(); }));
          } catch (error) { journal.textContent = errorText(error); }
        } entries();
      }
    } catch (error) { if (ticket === modalGeneration) body.textContent = errorText(error); }
  }
  function allocationEditor(form, title, maxLines, depositsOnly = false) {
    const group = el('section', null, { className: 'fin-group' }); group.append(el('h3', title)); const rows = [], box = el('div'); group.append(box);
    function add() {
      if (rows.length >= maxLines) { message('Đã đạt giới hạn dòng nguyên tử; không chia lô.', 'warning'); return; }
      const row = el('div', null, { className: 'fin-allocation' }), type = el('select', null, { className: 'form-select', 'aria-label': 'Loại đích phân bổ' });
      for (const [key, label] of depositsOnly ? [['depositAccountId', 'Tài khoản cọc']] : [['folioId', 'Folio'], ['depositAccountId', 'Tài khoản cọc']]) type.append(el('option', label, { value: key }));
      const id = el('input', null, { className: 'form-control', placeholder: 'Mã đích', 'aria-label': 'Mã đích', required: 'required', inputmode: 'numeric' }), value = el('input', null, { className: 'form-control', placeholder: 'VND nguyên', 'aria-label': 'Số tiền', required: 'required', inputmode: 'numeric' });
      const item = { type, id, value }; rows.push(item); row.append(type, id, value, button('Bỏ', () => { rows.splice(rows.indexOf(item), 1); row.remove(); form.dispatchEvent(new Event('input', { bubbles: true })); })); box.append(row); form.dispatchEvent(new Event('input', { bubbles: true }));
    }
    group.append(button('Thêm dòng', add)); form.append(group);
    return () => rows.map(item => ({ [item.type.value]: item.id.value.trim(), amountVnd: item.value.value.trim() }));
  }
  function bindWrite(form, feedback, build, execute, operation) {
    form.dataset.pmsOperation = resource + '.' + operation;
    const send = el('button', 'Xác nhận ' + (commands[operation] || operation).toLowerCase(), { type: 'submit', className: 'btn btn-primary' }); form.append(feedback, send);
    let frozenBody, key, uncertain = false, sending = false;
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (sending) return;
      if (!frozenBody) try { frozenBody = build(); if (!root.crypto?.randomUUID) throw new Error('Cần trình duyệt hỗ trợ khóa gửi lặp an toàn.'); key = root.crypto.randomUUID(); } catch (error) { frozenBody = null; feedback.textContent = errorText(error); return; }
      sending = true; pending = { key }; $('fin-close').disabled = true; for (const node of form.querySelectorAll('input,select,textarea,button')) node.disabled = true;
      feedback.textContent = 'Đang chờ kết quả ghi. Không thu/chi hoặc tạo yêu cầu mới.';
      try {
        const result = await execute(frozenBody, { idempotencyKey: key }); if (result.data?.committed !== true || !result.data?.row || !result.data?.event) throw new Error('Chưa nhận được receipt commit hợp lệ.');
        pending = null; uncertain = false; $('fin-close').disabled = false; $('fin-dialog').close(); const refreshed = await load();
        const pendingBank = result.data.row.method && result.data.row.method !== 'CASH' && result.data.row.status === 'PENDING';
        message((pendingBank ? 'Đã ghi yêu cầu chờ xác nhận ngân hàng, chưa ghi nhận thực thu. Mã #' : 'Backend xác nhận #') + result.data.row.id
          + (result.data.replayed ? ' — receipt gốc, không ghi lần nữa.' : '.') + ' Nhân viên #' + result.data.event.actorId + (refreshed ? '' : ' Chưa tải lại được danh sách; đối chiếu trước thao tác tiếp.'), refreshed ? 'success' : 'warning');
      } catch (error) {
        uncertain = uncertain || error.outcomeUnknown === true || (![400, 401, 403, 404, 409, 413, 415, 422].includes(error.status) && !['CUTOVER_WRITE_LOCKED', 'DEPLOYMENT_CHANGED', 'AUTH_NOT_CONFIGURED', 'AUTH_DEPENDENCY_UNAVAILABLE', 'FINANCE_CONTRACT_NOT_APPROVED', 'FINANCE_ATOMIC_CONTRACT_MISSING', 'REFUND_APPROVAL_POLICY_PENDING', 'REFUND_PAYOUT_POLICY_PENDING', 'BUSINESS_CLOCK_POLICY_PENDING', 'FINANCE_SQL_FORBIDDEN'].includes(error.code));
        feedback.textContent = errorText(error) + (uncertain ? ' Chưa rõ đã commit hay chưa. Giữ nguyên nội dung; khóa đối chiếu: ' + key : ' Chưa ghi thành công.');
        if (!uncertain) { pending = null; frozenBody = null; key = null; $('fin-close').disabled = false; for (const node of form.querySelectorAll('input,select,textarea,button')) node.disabled = false; }
        send.textContent = uncertain ? 'Chưa rõ kết quả — mở trang trạng thái để đối chiếu' : 'Xác nhận lại';
      } finally { sending = false; send.disabled = uncertain; }
    });
  }
  function commandForm(operation, row) {
    const selected = resource, cap = capabilities[selected], spec = cap.commands[operation], body = open(titles[selected] + ' — ' + commands[operation]); if (!body || !spec?.enabled) return;
    const form = el('form', null, { className: 'ops-form' }); body.append(form); const controls = {}, feedback = el('p', null, { role: 'status', className: 'fin-note' });
    let context = null, preview = null, targetVersion = null, readAllocations, previewPanel = null, formRevision = 0;
    for (const name of spec.fields) {
      if (['previewToken', 'targetVersion', 'allocations', 'plan'].includes(name)) continue;
      controls[name] = input(form, name, labels[name] || name, !spec.optional.includes(name), choices[name]);
    }
    if (spec.fields.includes('allocations')) readAllocations = allocationEditor(form, 'Phân bổ đúng khoản thu (tổng phải bằng khoản thu)', cap.maxLines);
    let checkoutFields;
    if (selected === 'checkouts') {
      const applications = allocationEditor(form, 'Các khoản cọc đối trừ cho phòng này', cap.maxLines, true);
      const cash = input(form, 'cashAmount', 'Tiền mặt nhận thêm (VND, bỏ trống nếu không thu)', false), cashShift = input(form, 'cashShiftId', 'Ca tiền mặt đang mở (nếu thu)', false);
      const target = input(form, 'masterFolioId', 'Folio master nhận công nợ (nếu chuyển)', false), transfer = input(form, 'masterAmount', 'Số tiền chuyển công nợ sang master (VND)', false);
      const refunds = input(form, 'refundIds', 'Mã yêu cầu hoàn đã được duyệt (phân cách bằng dấu phẩy, nếu có)', false);
      form.append(el('p', 'Không tự xác nhận minibar. Nếu thiếu biên bản, ghi/xác nhận tại màn hình minibar G8; xác nhận nhanh chỉ bật sau khi có quy tắc được duyệt.', { className: 'alert alert-info' }));
      form.append(el('a', 'Mở kiểm minibar qua API', { href: 'services-api.html#minibar', target: '_blank', rel: 'noopener' }));
      checkoutFields = () => ({ depositApplications: applications(), cashReceipt: cash.value.trim() ? { shiftId: cashShift.value.trim(), amountVnd: cash.value.trim() } : null,
        transferToMaster: transfer.value.trim() ? { targetFolioId: target.value.trim(), amountVnd: transfer.value.trim() } : null,
        refundRequestIds: refunds.value.trim() ? refunds.value.split(',').map(value => value.trim()) : [], quickMinibarSegments: [] });
    }
    const info = el('p', 'Chưa xác minh ngữ cảnh tài chính.', { className: 'alert alert-secondary' });
    const resolve = button('Xác minh ca/ngày và nguồn dữ liệu', async () => {
      context = null; preview = null; formRevision++; targetVersion = null; resolve.disabled = true; info.textContent = 'Đang xác minh từ SQL…'; if (previewPanel) previewPanel.textContent = 'Ngữ cảnh đang thay đổi; cần xem trước lại.';
      try {
        const revision = formRevision;
        const query = { operation, ...(row ? { id: row.id } : {}), ...(controls.bookingId?.value ? { bookingId: controls.bookingId.value.trim() } : {}), ...(controls.originalPaymentId?.value ? { paymentId: controls.originalPaymentId.value.trim() } : {}),
          ...(controls.sourceType?.value ? { sourceType: controls.sourceType.value } : {}), ...(controls.sourceId?.value ? { sourceId: controls.sourceId.value.trim() } : {}) };
        const result = await api[selected].context(query); if (revision !== formRevision) throw new Error('Biểu mẫu đã đổi trong lúc xác minh; cần xác minh lại.'); context = result.data;
        if (context.blockers.length) { info.textContent = context.blockers.map(item => item.message).join('\n'); context = null; return; }
        if (spec.fields.includes('targetVersion')) {
          const target = await api.folios.detail(controls.targetFolioId.value.trim()); if (revision !== formRevision) throw new Error('Bên nhận đã thay đổi; cần xác minh lại.'); targetVersion = { id: target.data.id, version: target.data.version };
        }
        info.textContent = 'Ngày kinh doanh ' + context.businessDate + ' · ' + context.timeZone + ' · Mốc chốt ' + context.cutoffLocalTime;
      } catch (error) { context = null; info.textContent = errorText(error); } finally { resolve.disabled = false; }
    }); form.append(resolve, info);
    const invalidatePreview = () => { formRevision++; preview = null; if (previewPanel) previewPanel.textContent = 'Phương án đã đổi. Cần xem trước/đối soát lại.'; };
    form.addEventListener('input', event => { invalidatePreview(); if (['bookingId', 'originalPaymentId', 'targetFolioId', 'sourceId'].includes(event.target.name)) { context = null; targetVersion = null; } });
    form.addEventListener('change', event => { invalidatePreview(); if (event.target.name === 'sourceType') context = null; });
    const getContext = () => { if (!context) throw new Error('Phải xác minh lại ngữ cảnh trước khi xác nhận.'); return { contextToken: context.contextToken, ...(row && spec.versioned ? { expectedVersion: context.subjectVersion } : {}) }; };
    const fields = () => {
      const result = getContext(); for (const name of spec.fields) {
        if (name === 'previewToken') { if (!preview?.canComplete) throw new Error('Phải xem phương án đủ điều kiện trước khi chốt.'); result.previewToken = preview.previewToken; }
        else if (name === 'plan') { if (!preview?.canComplete || !preview.planBody) throw new Error('Thiếu phương án checkout đã được đối soát.'); result.plan = preview.planBody; }
        else if (name === 'allocations') result.allocations = readAllocations();
        else if (name === 'targetVersion') { if (!targetVersion || targetVersion.id !== controls.targetFolioId.value.trim()) throw new Error('Chưa xác minh bên nhận.'); result.targetVersion = targetVersion.version; }
        else result[name] = controls[name].value.trim() || null;
      } return result;
    };
    if (spec.fields.includes('previewToken')) {
      const previewBox = el('section', 'Chưa có bảng quyết toán/đối soát để xác nhận.', { className: 'fin-preview' }); previewPanel = previewBox;
      form.append(button('Xem trước và đối soát', async () => {
        preview = null; previewBox.textContent = 'Đang đọc phương án, chưa ghi dữ liệu…';
        try {
          const base = getContext(), request = selected === 'checkouts' ? { ...base, ...checkoutFields() } : selected === 'cashier' ? { ...base, countedCashVnd: controls.countedCashVnd.value.trim() } : base;
          const revision = formRevision;
          const result = await api[selected].preview(row.id, request); if (revision !== formRevision) throw new Error('Phương án đã đổi trong lúc đối soát; cần xem trước lại.'); preview = result.data; previewBox.replaceChildren(); renderData(preview, previewBox);
          if (!preview.canComplete) previewBox.append(el('p', 'Chưa đủ điều kiện chốt. Bước xem trước chưa ghi thay đổi nào.', { className: 'text-danger' }));
        } catch (error) { previewBox.textContent = errorText(error); }
      }, true), previewBox);
    }
    bindWrite(form, feedback, fields, (request, options) => api[selected].command(operation, row?.id, request, options), operation);
  }
  $('ops-menu').addEventListener('click', () => { const shown = $('ops-sidebar').classList.toggle('open'); $('ops-menu').setAttribute('aria-expanded', String(shown)); });
  $('fin-close').addEventListener('click', () => { if (!pending) $('fin-dialog').close(); }); $('fin-dialog').addEventListener('cancel', event => { if (pending) event.preventDefault(); });
  root.addEventListener('beforeunload', event => { if (pending) { event.preventDefault(); event.returnValue = ''; } });
  $('fin-refresh').addEventListener('click', load); $('fin-filters').addEventListener('submit', event => { event.preventDefault(); offset = 0; load(); });
  $('fin-prev').addEventListener('click', () => { offset = Math.max(0, offset - pageSize); load(); }); $('fin-next').addEventListener('click', () => { offset += pageSize; load(); });
  (async () => {
    try { const me = await root.SongLamSession.restore(); actorId = me.data.user.appUserId; $('fin-user').textContent = me.data.user.fullName || me.data.user.username; await refreshCapabilities();
      if (!capabilities[resource]?.visible) resource = Object.keys(titles).find(key => capabilities[key]?.visible); if (!resource) throw new Error('Phiên không có quyền xem sổ tài chính.'); $('fin-filters').hidden = false;
      const bookingId=new URLSearchParams(root.location.search).get('bookingId'); select(resource, /^[1-9]\d{0,18}$/.test(bookingId||'')?{bookingId}:{});
    } catch (error) { $('fin-user').textContent = 'Chưa có phiên vận hành'; message(errorText(error) + ' Không dùng số liệu hoặc phiên demo.', 'warning'); }
  })();
}(window));
