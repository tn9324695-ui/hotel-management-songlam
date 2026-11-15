(function (root) {
  'use strict';
  const C = root.SongLamComponents, U = root.SongLamUi, S = root.SongLamSession, P = root.SongLamPermissions;
  const $ = id => document.getElementById(id), el = C.el, client = S.client;
  const bookings = root.SongLamBookingsApi.createBookingsApi({ client, getCsrfToken: () => S.csrf(actorId) });
  const stays = root.SongLamStaysApi.createStaysApi({ client, getCsrfToken: () => S.csrf(actorId) });
  const customers = root.SongLamCustomersApi.createCustomersApi({client,getCsrfToken:()=>S.csrf(actorId)});
  const catalog = root.SongLamCatalogApi.createCatalogApi({ client }), pricing = root.SongLamPricingApi.createPricingApi({ client, getCsrfToken: () => S.csrf(actorId) });
  const tabs = { rooms: 'Sơ đồ phòng', timeline: 'Lịch đặt phòng', availability: 'Quỹ phòng', bookings: 'Đơn đặt phòng', arrivals: 'Khách đến', stays: 'Đang lưu trú', departures: 'Sắp trả phòng', customers: 'Khách hàng', roomTypes: 'Hạng phòng', rates: 'Bảng giá & chính sách' };
  const rights = { rooms: ['viewRoomRack'], timeline: ['viewRoomRack'], availability: ['viewRoomRack'], bookings: ['createBooking', 'manageCheckOut'], arrivals: ['manageCheckIn'], stays: ['manageCheckIn', 'manageCheckOut'], departures: ['manageCheckOut'], customers: ['createBooking', 'manageCheckIn'], roomTypes: ['viewRoomRack'], rates: ['viewRoomRack'] };
  let screen = 'rooms', offset = 0, generation = 0, actorId, hotel = null, roomTypes = [], ratePlans = [], customerRows = [], roomRows = [];
  let catalogCapabilities={},availableModules=[];
  function readable(key){
    if(['rooms','roomTypes','customers'].includes(key))return catalogCapabilities[key]?.supported===true;
    if(key==='rates')return catalogCapabilities.ratePlans?.supported===true;
    return availableModules.includes(['timeline','availability','bookings'].includes(key)?'bookingsGateway':'staysGateway');
  }
  const limit = 50, filters = $('desk-filters');
  const note = (text, tone = 'secondary') => C.notification.set($('desk-message'), text, tone);
  const button = (text, action, primary = false) => { const node = el('button', text, 'btn ' + (primary ? 'btn-primary' : 'btn-sm')); node.type = 'button'; node.onclick = action; return node; };
  function field(form, name, label, { type = 'text', value = '', options, required = false, min, max } = {}) {
    const wrapper = el('label', label), input = document.createElement(options ? 'select' : type === 'textarea' ? 'textarea' : 'input');
    if (!options && type !== 'textarea') input.type = type;
    input.name = name; input.className = options ? 'form-select' : 'form-control'; input.required = required;
    if (options) for (const [id, text] of options) { const option = el('option', text); option.value = id; input.append(option); }
    if (min != null) input.min = min; if (max != null) input.max = max; input.value = value; wrapper.append(input); form.append(wrapper); return input;
  }
  function dialog(title) { $('desk-dialog-title').textContent = title; const content=el('div'); $('desk-dialog-body').replaceChildren(content); C.modal.open($('desk-dialog')); return content; }
  function details(parent, values) { const dl = el('dl', null, 'ops-detail'); for (const [key, value] of Object.entries(values)) dl.append(el('dt', key), el('dd', value ?? '—')); parent.append(dl); }
  function blocked(parent, reason) { parent.append(el('p', 'Chưa khả dụng · ' + reason, 'sl-blocked')); }
  async function command(parent, title, path, method, needed, action) {
    const currentPath = () => typeof path === 'function' ? path() : path;
    const idempotencyKey = crypto.randomUUID(), message = el('div'), submit = button(title, async () => {
      if (submit.disabled) return;
      submit.disabled = true;
      try {
        if (!await P.canWrite(method, currentPath(), needed)) throw new Error('Nguồn ghi hoặc thao tác chưa được backend cho phép.');
        const result = await action({ idempotencyKey });
        if (result.data?.committed !== true) throw Object.assign(new Error('Chưa nhận receipt commit hợp lệ.'), { outcomeUnknown: true });
        C.notification.set(message, 'Máy chủ đã commit thành công. ' + (result.data?.booking?.code ? 'Mã đơn: '+result.data.booking.code+' · ' : '') + (result.requestId || ''), 'success');
        if(result.data?.booking?.id){const link=button('Mở đơn '+result.data.booking.code,()=>bookingDetail(result.data.booking.id));message.append(link);}
        if(result.data?.booking?.id)message.append(button('Xem lịch đơn vừa tạo',async()=>{try{const detail=(await bookings.getBooking(result.data.booking.id)).data;
          const dates=detail.rooms.map(room=>[room.arrivalDate,room.departureDate]);filters.elements.from.value=dates.map(x=>x[0]).sort()[0];
          const last=dates.map(x=>x[1]).sort().at(-1);filters.elements.to.value=new Date(Date.parse(last+'T00:00:00Z')+86400000).toISOString().slice(0,10);
          filters.elements.roomTypeId.value='';screen='timeline';offset=0;history.replaceState(null,'','#timeline');C.modal.close($('desk-dialog'));navigation();await load();
        }catch(error){C.notification.error(message,error);}}));
        await load();
      } catch (error) {
        C.notification.error(message, error);
        if (error.outcomeUnknown) {
          const link = el('a', 'Tra cứu yêu cầu gốc trước khi thao tác tiếp'); link.href = 'operations-status.html'; message.append(el('br'), link);
          // Keep the original key and disable this submission after any unknown outcome.
        } else submit.disabled = !await P.canWrite(method, currentPath(), needed).catch(() => false);
      }
    }, true);
    submit.disabled = true; parent.append(message, submit);
    const enabled = await P.canWrite(method, currentPath(), needed).catch(() => false);
    submit.disabled = !enabled;
    if (!enabled) {
      const state=root.SongLamDeployment?.snapshot();
      blocked(parent, currentPath()==='/stays/check-in'&&state?.checkInWriteBlocker==='BUSINESS_DATE_REVIEW_REQUIRED'
        ?'SQL nhận phòng đã triển khai nhưng đang khóa ghi phí: ngày nghiệp vụ chưa khớp ngày thực tế khách sạn. Cần xử lý ngày nghiệp vụ được duyệt trước; không tự ghi lùi ngày.'
        :'Cần phiên, quyền và command SQL đã nghiệm thu. Không lưu vào dữ liệu demo.');
    }
    return submit;
  }
  async function referenceData() {
    const [caps,connection]=await Promise.all([catalog.capabilities(),client.request('/connection/status')]);
    catalogCapabilities=caps.data.resources;availableModules=connection.data.modules||[];
    const reference=(name,path,query)=>catalogCapabilities[name]?.supported?catalog.list(path,query):Promise.reject(new Error('Chưa có hợp đồng đọc.'));
    const results = await Promise.allSettled([reference('hotelSettings','hotel-settings'), reference('roomTypes','room-types', { limit: 200 }), reference('ratePlans','rate-plans', { limit: 200 }), reference('customers','customers', { limit: 50 })]);
    if (results[0].status === 'fulfilled') hotel = results[0].value.data;
    if (results[1].status === 'fulfilled') roomTypes = results[1].value.data;
    if (results[2].status === 'fulfilled') ratePlans = results[2].value.data;
    if (results[3].status === 'fulfilled') customerRows = results[3].value.data;
    const select = filters.elements.roomTypeId, prior = select.value; select.replaceChildren(new Option('Tất cả hạng', ''));
    roomTypes.forEach(row => select.add(new Option(row.name, row.id))); select.value = prior;
    // Opening the form is safe even before pricing is deployed: explain the
    // missing dependency there instead of leaving an unexplained dead button.
    $('desk-quote').disabled=!P.has('viewRoomRack');
    if (hotel?.workingDate && hotel?.timeZoneId) {
      const today = U.hotelDate(new Date().toISOString(), hotel.timeZoneId);
      if (!filters.elements.from.value) filters.elements.from.value = today;
      if (!filters.elements.to.value) filters.elements.to.value = new Date(Date.parse(today + 'T00:00:00Z') + 14 * 86400000).toISOString().slice(0, 10);
      $('desk-period').textContent = 'Ngày nghiệp vụ ' + U.date(hotel.workingDate) + ' · ' + hotel.timeZoneId
        + (hotel.workingDate === today ? '' : ' · Lệch ngày hiện tại ' + U.date(today) + '; nhận phòng đang khóa');
    }
  }
  function navigation() {
    const nav = $('desk-nav'); nav.replaceChildren();
    for (const [key, title] of Object.entries(tabs)) {
      const item = button(title, () => { screen = key; offset = 0; history.replaceState(null, '', '#' + key); navigation(); load(); });
      if (S.current() && !P.any(rights[key])) continue;
      item.disabled = !S.current()||!readable(key);
      if(!readable(key))item.title='Chưa khả dụng: chưa có hợp đồng SQL đọc phù hợp được duyệt.';
      item.setAttribute('aria-current', key === screen ? 'page' : 'false'); nav.append(item);
    }
    $('desk-title').textContent = tabs[screen];
    const dateScreens = ['timeline', 'availability', 'bookings', 'stays', 'arrivals', 'departures'];
    for (const control of filters.elements) {
      if (!control.name) continue;
      const visible = control.name === 'q' ? ['rooms', 'customers', 'bookings'].includes(screen) : control.name === 'roomTypeId' ? ['rooms', 'timeline', 'availability'].includes(screen)
        : ['from', 'to'].includes(control.name) ? dateScreens.includes(screen) && !(screen==='arrivals'&&control.name==='to') : screen === 'rooms';
      control.closest('label').hidden = !visible;
      if(control.name==='from')control.closest('label').firstChild.textContent=screen==='arrivals'?'Ngày đến':'Từ ngày';
    }
  }
  function table(columns, rows, onSelect) { C.table.mount($('desk-results'), columns, rows, { onSelect }); }
  function roomCard(row) {
    const card = el('article', null, 'sl-room kiot-room-card');
    card.dataset.occupancy = row.occupancyStatus;
    card.dataset.cleanliness = row.cleanlinessStatus;
    card.dataset.exploitation = row.exploitationStatus;

    // Header: Room number & class badge (KiotViet Hotel PMS)
    const head = el('div', null, 'kiot-room-head');
    head.append(el('h3', 'P. ' + row.number, 'kiot-room-num tw-m-0'));
    const typeName = roomTypes.find(type => type.id === row.roomTypeId)?.name || 'Hạng ' + row.roomTypeId;
    head.append(el('span', typeName, 'kiot-room-class'));
    card.append(head);

    // Floor and info
    card.append(el('p', 'Tầng ' + row.floor + ' · ' + typeName, 'text-secondary tw-text-xs tw-m-0'));

    // 3 Independent statuses required by contract & tests
    const status = el('div', null, 'sl-room-state');
    for (const [label, key] of [['Hiện diện', 'occupancyStatus'], ['Vệ sinh', 'cleanlinessStatus'], ['Khai thác', 'exploitationStatus']]) {
      status.append(el('span', label), el('strong', U.label(row[key])));
    }
    card.append(status);

    // Bottom badges & quick actions
    const badges = el('div', null, 'kiot-room-badges');
    badges.append(el('span', '🧼 ' + U.label(row.cleanlinessStatus), 'kiot-clean-badge kiot-clean-' + row.cleanlinessStatus));
    if (row.exploitationStatus === 'MAINTENANCE') {
      badges.append(el('span', '⛔ Bảo trì', 'kiot-alert-badge'));
    }
    card.append(badges);

    // Quick action buttons directly on the card
    const cardActions = el('div', null, 'kiot-room-quick-bar tw-flex tw-gap-1 tw-mt-2');
    if (row.occupancyStatus === 'VACANT') {
      const bBook = el('button', '+ Đặt', 'btn btn-xs btn-outline-primary tw-py-0.5 tw-px-1.5 tw-text-xs');
      bBook.type = 'button';
      bBook.onclick = (e) => { e.stopPropagation(); bookingForm(false, row); };
      cardActions.append(bBook);
    } else if (row.occupancyStatus === 'OCCUPIED') {
      const bSvc = el('button', '🍹 Dịch vụ', 'btn btn-xs btn-outline-secondary tw-py-0.5 tw-px-1.5 tw-text-xs');
      bSvc.type = 'button';
      bSvc.onclick = (e) => { e.stopPropagation(); location.assign('services-api.html'); };
      const bOut = el('button', '💳 Trả', 'btn btn-xs btn-outline-danger tw-py-0.5 tw-px-1.5 tw-text-xs');
      bOut.type = 'button';
      bOut.onclick = (e) => { e.stopPropagation(); location.assign('finance-api.html#checkout'); };
      cardActions.append(bSvc, bOut);
    }
    if (row.cleanlinessStatus === 'DIRTY') {
      const bClean = el('button', '🧹 Báo dọn', 'btn btn-xs btn-outline-warning tw-py-0.5 tw-px-1.5 tw-text-xs');
      bClean.type = 'button';
      bClean.onclick = (e) => { e.stopPropagation(); location.assign('housekeeping-api.html#tasks'); };
      cardActions.append(bClean);
    }
    if (cardActions.children.length) card.append(cardActions);

    card.onclick = () => {
      // Open comprehensive action dialog on click
      const content = dialog('Phòng ' + row.number + ' · ' + typeName);
      details(content, {
        'Số phòng': row.number,
        'Tầng': row.floor,
        'Hạng phòng': typeName,
        'Hiện diện': U.label(row.occupancyStatus),
        'Vệ sinh': U.label(row.cleanlinessStatus),
        'Khai thác': U.label(row.exploitationStatus)
      });
      const actions = el('div', null, 'tw-flex tw-flex-wrap tw-gap-2 tw-mt-4');
      if (row.occupancyStatus === 'VACANT') {
        actions.append(button('📝 Đặt phòng này', () => { $('desk-close').click(); bookingForm(false, row); }, true));
        actions.append(button('⚡ Nhận khách vãng lai (Walk-in)', () => { $('desk-close').click(); bookingForm(false, row); }));
        actions.append(button('🧹 Yêu cầu buồng phòng dọn', () => { location.assign('housekeeping-api.html#tasks'); }));
        actions.append(button('🛠️ Báo bảo trì phòng', () => { location.assign('housekeeping-api.html#tickets'); }));
      } else if (row.occupancyStatus === 'OCCUPIED') {
        actions.append(button('👥 Tra cứu lượt lưu trú', async () => {
          try {
            const inHouse = await stays.listStays({ status: 'IN_HOUSE', limit: 50 });
            const matching = inHouse.data?.find(s => s.segments?.some(seg => seg.roomId === row.id && seg.departedAtUtc === null));
            if (matching) stayDetail(matching.id);
            else { screen = 'stays'; offset = 0; navigation(); load(); $('desk-close').click(); }
          } catch { screen = 'stays'; offset = 0; navigation(); load(); $('desk-close').click(); }
        }, true));
        actions.append(button('🍹 Gọi dịch vụ & Minibar', () => { location.assign('services-api.html'); }));
        actions.append(button('🔄 Chuyển phòng', async () => {
          try {
            const inHouse = await stays.listStays({ status: 'IN_HOUSE', limit: 50 });
            const matching = inHouse.data?.find(s => s.segments?.some(seg => seg.roomId === row.id && seg.departedAtUtc === null));
            if (matching) stayDetail(matching.id);
            else { screen = 'stays'; offset = 0; navigation(); load(); $('desk-close').click(); }
          } catch { screen = 'stays'; offset = 0; navigation(); load(); $('desk-close').click(); }
        }));
        actions.append(button('💳 Quyết toán & Trả phòng', () => { location.assign('finance-api.html#checkout'); }));
        actions.append(button('🛠️ Báo hỏng thiết bị', () => { location.assign('housekeeping-api.html#tickets'); }));
      }
      if (row.cleanlinessStatus === 'DIRTY' || row.cleanlinessStatus === 'CLEANING') {
        actions.append(button('⚡ Ưu tiên dọn đón khách', () => { location.assign('housekeeping-api.html#tasks'); }));
      }
      if (row.exploitationStatus === 'MAINTENANCE') {
        actions.append(button('🛠️ Xem phiếu bảo trì', () => { location.assign('housekeeping-api.html#tickets'); }));
      }
      actions.append(button('Đóng', () => $('desk-close').click()));
      content.append(actions);
    };

    return card;
  }
  function timeline(data) {
    const box = el('div', null, 'sl-timeline'), head = el('div', null, 'sl-timeline-head');
    const days = []; for (let date = Date.parse(data.from + 'T00:00:00Z'); date < Date.parse(data.to + 'T00:00:00Z'); date += 86400000) days.push(new Date(date).toISOString().slice(0, 10));
    if (days.length > 366 || !days.length) throw new Error('Khoảng lịch không hợp lệ.');
    head.append(el('strong', 'Phòng / hạng', 'sl-timeline-label')); days.forEach(day => head.append(el('div', U.date(day), 'sl-timeline-day'))); box.append(head);
    const groups = new Map(); for (const row of data.segments) { const key = row.roomId || 'unassigned-' + row.roomTypeId; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); }
    const windowStart = Date.parse(U.hotelInstant(data.from + 'T00:00', data.timeZone)), windowEnd = Date.parse(U.hotelInstant(data.to + 'T00:00', data.timeZone)), width = days.length * 105;
    for (const [id, rows] of groups) {
      const line = el('div', null, 'sl-timeline-row'), name = roomRows.find(room => room.id === id)?.number || (id.startsWith('unassigned') ? 'Chưa gán · hạng ' + rows[0].roomTypeId : 'Mã phòng ' + id);
      line.append(el('strong', name, 'sl-timeline-label')); const track = el('div', null, 'sl-timeline-track'); track.style.width = width + 'px'; const ends = [];
      rows.sort((a, b) => Date.parse(a.startsAtUtc) - Date.parse(b.startsAtUtc)).forEach(row => {
        const start = Date.parse(row.startsAtUtc), end = Date.parse(row.endsAtUtc); let lane = ends.findIndex(at => at <= start); if (lane < 0) lane = ends.length; ends[lane] = end;
        const item = button(U.label(row.kind) + (row.bookingId ? ' · Đơn ' + row.bookingId : ''), () => row.bookingId && bookingDetail(row.bookingId));
        item.className = 'sl-timeline-segment'; item.dataset.kind = row.kind; item.title = U.date(row.startsAtUtc) + ' → ' + U.date(row.endsAtUtc);
        item.style.left = Math.max(0, (start - windowStart) / (windowEnd - windowStart) * width) + 'px';
        item.style.width = Math.max(18, (Math.min(end, windowEnd) - Math.max(start, windowStart)) / (windowEnd - windowStart) * width - 3) + 'px'; item.style.top = (lane * 34 + 7) + 'px';
        if (!row.bookingId) item.disabled = true; track.append(item);
      }); track.style.height = Math.max(48, ends.length * 34 + 14) + 'px'; line.append(track); box.append(line);
    }
    $('desk-results').replaceChildren(data.segments.length ? box : el('div', 'Không có khoảng đặt/ở/block trong kỳ đã chọn.', 'sl-empty'));
  }
  async function load() {
    const ticket = ++generation; $('desk-results').setAttribute('aria-busy', 'true'); note('Đang tải dữ liệu từ máy chủ…', 'info'); $('desk-pagination').replaceChildren();
    try {
      const me = await S.restore(); actorId = me.data.user.appUserId; $('desk-user').textContent = me.data.user.fullName || me.data.user.username; navigation();
      if (!P.any(rights[screen])) throw new root.SongLamHttp.ApiError('Máy chủ chưa cấp quyền xem màn hình này.', { status: 403 });
      if (!readable(screen)) throw new root.SongLamHttp.ApiError('Chưa khả dụng: hợp đồng SQL cho màn hình này chưa được duyệt.', {status:503,code:'READ_CONTRACT_NOT_APPROVED'});
      const f = Object.fromEntries(new FormData(filters)), page = { offset, limit }; let result;
      if (screen === 'rooms') result = await catalog.list('rooms', { ...page, ...Object.fromEntries(['roomTypeId', 'floor', 'q', 'occupancyStatus', 'cleanlinessStatus', 'exploitationStatus'].map(key => [key, f[key]])) });
      else if (screen === 'timeline') result = await bookings.getTimeline({ ...page, from: f.from, to: f.to, ...(f.roomTypeId ? { roomTypeId: f.roomTypeId } : {}) });
      else if (screen === 'availability') { if (!f.roomTypeId) throw new Error('Chọn hạng phòng để kiểm quỹ từng đêm.'); result = await bookings.checkAvailability({ roomTypeId: f.roomTypeId, from: f.from, to: f.to }); }
      else if (screen === 'bookings') result = await bookings.listBookings({ ...page, ...(f.from && f.to ? { from: f.from, to: f.to } : {}), ...(f.q ? { code: f.q } : {}) });
      else if (screen === 'arrivals') result = await stays.getArrivals({ ...page, date: f.from });
      else if (screen === 'departures') result = await departureList(f);
      else if (screen === 'stays') result = await stays.listStays({ ...page, status: 'IN_HOUSE', ...(f.from && f.to ? { from: f.from, to: f.to } : {}) });
      else result = await catalog.list(screen === 'customers' ? 'customers' : screen === 'rates' ? 'rate-plans' : 'room-types', { ...page, ...(screen === 'customers' && f.q ? { q: f.q } : {}) });
      if (ticket !== generation) return;
      $('desk-results').replaceChildren();
      const rows = Array.isArray(result.data) ? result.data : [];
      if (screen === 'rooms') {
        roomRows = rows;
        // Update KiotViet-style status counter pills
        const statusBar = $('desk-status-bar');
        if (statusBar) {
          const total = rows.length;
          const vacant = rows.filter(r => r.occupancyStatus === 'VACANT').length;
          const occupied = rows.filter(r => r.occupancyStatus === 'OCCUPIED').length;
          const clean = rows.filter(r => r.cleanlinessStatus === 'CLEAN').length;
          const dirty = rows.filter(r => r.cleanlinessStatus === 'DIRTY').length;
          const maint = rows.filter(r => r.exploitationStatus === 'MAINTENANCE').length;
          statusBar.replaceChildren();
          const pills = [
            ['Tất cả', total, ''],
            ['Trống', vacant, 'VACANT'],
            ['Có khách', occupied, 'OCCUPIED'],
            ['Sạch', clean, 'CLEAN'],
            ['Chờ dọn', dirty, 'DIRTY'],
            ['Bảo trì', maint, 'MAINTENANCE']
          ];
          for (const [title, count, val] of pills) {
            const p = el('button', null, 'btn btn-sm btn-ghost tw-text-xs');
            p.type = 'button';
            p.innerHTML = `<strong>${title}:</strong> ${count}`;
            p.onclick = () => {
              if (val === 'VACANT' || val === 'OCCUPIED') {
                filters.elements.occupancyStatus.value = val;
                filters.elements.cleanlinessStatus.value = '';
                filters.elements.exploitationStatus.value = '';
              } else if (val === 'CLEAN' || val === 'DIRTY') {
                filters.elements.cleanlinessStatus.value = val;
              } else if (val === 'MAINTENANCE') {
                filters.elements.exploitationStatus.value = val;
              } else {
                filters.elements.occupancyStatus.value = '';
                filters.elements.cleanlinessStatus.value = '';
                filters.elements.exploitationStatus.value = '';
              }
              filters.requestSubmit();
            };
            statusBar.append(p);
          }
        }
        const container = el('div', null, 'kiot-room-rack-container');
        const floors = new Map();
        rows.forEach(row => {
          const fl = row.floor || '1';
          if (!floors.has(fl)) floors.set(fl, []);
          floors.get(fl).push(row);
        });
        const sortedFloors = [...floors.keys()].sort((a, b) => Number(a) - Number(b));
        for (const fl of sortedFloors) {
          const floorGroup = el('div', null, 'kiot-floor-group');
          const floorTitle = el('div', null, 'kiot-floor-title');
          const flRooms = floors.get(fl);
          const flVacant = flRooms.filter(r => r.occupancyStatus === 'VACANT').length;
          const flOcc = flRooms.filter(r => r.occupancyStatus === 'OCCUPIED').length;
          floorTitle.innerHTML = `
            <span>🏢 TẦNG ${fl}</span>
            <span class="badge bg-blue-lt">${flRooms.length} phòng</span>
            <span class="tw-text-xs tw-text-secondary tw-font-normal">(${flVacant} trống · ${flOcc} có khách)</span>
          `;
          floorGroup.append(floorTitle);

          const grid = el('div', null, 'sl-room-grid kiot-room-grid');
          flRooms.forEach(row => grid.append(roomCard(row)));
          floorGroup.append(grid);
          container.append(floorGroup);
        }
        $('desk-results').append(rows.length ? container : el('div', 'Không có phòng phù hợp bộ lọc.', 'sl-empty'));
      }
      else if (screen === 'timeline') {
        const missing=[...new Set(result.data.segments.map(row=>row.roomId).filter(Boolean))].filter(id=>!roomRows.some(room=>room.id===id));
        const names=await Promise.allSettled(missing.map(id=>catalog.detail('rooms',id)));
        if(ticket!==generation)return;
        names.forEach(item=>{if(item.status==='fulfilled')roomRows.push(item.value.data);});
        timeline(result.data);
      }
      else if (screen === 'availability') table([{ key: 'date', label: 'Đêm', render: row => U.date(row.date) }, ...[['capacity', 'Tổng quỹ'], ['reservedUnreceived', 'Giữ chưa nhận'], ['occupied', 'Đang ở'], ['blocked', 'Bị chặn'], ['available', 'Còn khả dụng']].map(([key, label]) => ({ key, label }))], result.data.nights);
      else if (screen === 'bookings') table([{ key: 'code', label: 'Mã đơn' }, { key: 'contactName', label: 'Khách / người liên hệ' }, { key: 'groupName', label: 'Đoàn' }, { key: 'roomCount', label: 'Số phòng' }, { key: 'status', label: 'Trạng thái', render: row => U.label(row.status) }], rows, row => bookingDetail(row.id));
      else if (['stays', 'departures'].includes(screen)) table([{ key: 'code', label: 'Mã lưu trú' }, { key: 'bookingId', label: 'Đơn' }, { key: 'checkedInAtUtc', label: 'Đã nhận', render: row => U.date(row.checkedInAtUtc) }, { key: 'expectedOutAtUtc', label: 'Dự kiến trả', render: row => U.date(row.expectedOutAtUtc) }, { key: 'status', label: 'Trạng thái', render: row => U.label(row.status) }], rows, row => stayDetail(row.id));
      else if (screen === 'arrivals') table([{ key: 'bookingCode', label: 'Đơn' }, { key: 'bookingRoomId', label: 'Phần phòng' }, { key: 'plannedRoomId', label: 'Phòng dự kiến' }, { key: 'startsAtUtc', label: 'Giờ nhận', render: row => U.date(row.startsAtUtc) }], rows, row => bookingDetail(row.bookingId));
      else table(screen === 'customers' ? [{ key: 'code', label: 'Mã khách' }, { key: 'fullName', label: 'Họ tên' }, { key: 'phone', label: 'Điện thoại' }] : [{ key: 'code', label: 'Mã' }, { key: 'name', label: 'Tên' }, { key: 'active', label: 'Hoạt động', render: row => row.active ? 'Có' : 'Không' }], rows);
      if (screen !== 'availability') C.pagination.mount($('desk-pagination'), { offset, limit, count: screen === 'timeline' ? result.data.segments.length : rows.length, hasMore: result.meta?.hasMore, onPage: value => { offset = value; load(); } });
      note('Đã nhận phản hồi API. ' + (screen === 'timeline' || screen === 'availability' ? `Khoảng [${f.from}, ${f.to}) — ngày trả không chiếm thêm đêm.` : 'Không sử dụng dữ liệu demo.'));
      if (screen === 'rooms' && result.meta?.readScope === 'CURRENT_STATUS_ONLY') note('Chỉ hiển thị trạng thái hiện tại của phòng. Chưa xác minh điều kiện nhận phòng, block theo khoảng ngày và kiểm tra sau bảo trì; không dùng danh sách này để xác nhận khả dụng.', 'warning');
      $('desk-trace').textContent = result.requestId ? 'Mã yêu cầu: ' + result.requestId : '';
    } catch (error) { if (ticket === generation) { C.notification.error($('desk-message'), error); $('desk-results').replaceChildren(el('div', 'Chưa tải được dữ liệu. Kiểm tra phiên, kết nối và hợp đồng SQL; không có dữ liệu demo thay thế.', 'sl-empty')); } }
    finally { if (ticket === generation) $('desk-results').setAttribute('aria-busy', 'false'); }
  }
  async function departureList(input) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(input.from)||!/^\d{4}-\d{2}-\d{2}$/.test(input.to)||input.to<=input.from)throw new Error('Chọn khoảng ngày trả [từ ngày, đến trước ngày) hợp lệ.');
    const all=new Map();let requestId;
    // G6 has no declared expected-departure filter. Read the complete bounded
    // in-house set; never relabel an arbitrary list filter as a due-out filter.
    for(let page=0;page<20;page++){
      const response=await stays.listStays({status:'IN_HOUSE',offset:page*limit,limit});requestId=response.requestId;
      if(!Array.isArray(response.data))throw new Error('Phản hồi lưu trú không hợp lệ.');
      response.data.forEach(row=>all.set(row.id,row));
      if(response.meta?.hasMore===false){
        const rows=[...all.values()].filter(row=>{const day=U.hotelDate(row.expectedOutAtUtc,hotel?.timeZoneId);return day>=input.from&&day<input.to;}).sort((a,b)=>Date.parse(a.expectedOutAtUtc)-Date.parse(b.expectedOutAtUtc));
        return {data:rows.slice(offset,offset+limit),meta:{hasMore:offset+limit<rows.length},requestId};
      }
      if(response.meta?.hasMore!==true||!response.data.length)break;
    }
    throw new Error('Chưa thể xác định danh sách trả phòng đầy đủ. Cần hợp đồng đọc theo ngày trả hoặc phân trang xác định; không dùng một phần dữ liệu làm toàn bộ.');
  }
  async function quoteForm() {
    const host = dialog('Báo giá dự kiến theo đêm / giờ'), form = el('form', null, 'sl-form-grid'), result = el('section', null, 'sl-quote'); form.dataset.pmsReadOnly = 'true'; host.append(form, result);
    const ready = availableModules.includes('pricingGateway') && catalogCapabilities.ratePlans?.supported === true && ratePlans.some(item => item.active) && Boolean(hotel?.timeZoneId);
    if (!ready) blocked(host, 'Chưa có đủ hợp đồng SQL đọc giá/chính sách, gói giá hoạt động và cấu hình múi giờ. Danh mục phòng đã tải không đồng nghĩa đã có bảng giá. Không lấy giá demo để tính thay.');
    field(form, 'roomTypeId', 'Hạng phòng', { options: [['', 'Chọn hạng'], ...roomTypes.filter(item => item.active).map(item => [item.id, item.name])], required: true });
    const plan = field(form, 'ratePlanId', 'Gói giá', { options: [['', 'Chọn gói']], required: true });
    const mode = field(form, 'mode', 'Loại giá', { options: [['nightly', 'Theo đêm'], ['hourly', 'Theo giờ']], value:'nightly' });
    function matchingPlans() { const previous = plan.value; plan.replaceChildren(new Option('Chọn gói', '')); ratePlans.filter(item => item.active && item.stayType === mode.value.toUpperCase()).forEach(item => plan.add(new Option(item.name || item.code, item.id))); plan.value = [...plan.options].some(option => option.value === previous) ? previous : ''; }
    mode.addEventListener('change', matchingPlans); matchingPlans();
    field(form, 'checkInAt', 'Dự kiến nhận', { type:'datetime-local',required:true }); field(form, 'checkOutAt', 'Dự kiến trả', { type:'datetime-local',required:true });
    field(form, 'rooms', 'Số phòng', {type:'number',value:'1',min:1,max:50}); field(form,'adultsPerRoom','Người lớn/phòng',{type:'number',value:'1',min:1,max:32767}); field(form,'childrenPerRoom','Trẻ em/phòng',{type:'number',value:'0',min:0,max:32767});
    const submit = button('Lấy báo giá từ máy chủ',async()=>{
      if(!form.reportValidity())return; submit.disabled=true;
      try { const values=Object.fromEntries(new FormData(form)), intent=JSON.stringify(values), response=await pricing.quote(values.mode,{roomTypeId:values.roomTypeId,ratePlanId:values.ratePlanId,checkInAt:U.hotelInstant(values.checkInAt,hotel?.timeZoneId),checkOutAt:U.hotelInstant(values.checkOutAt,hotel?.timeZoneId),rooms:Number(values.rooms),adultsPerRoom:Number(values.adultsPerRoom),childrenPerRoom:Number(values.childrenPerRoom)}), q=response.data;
        if(!host.isConnected||!$('desk-dialog').open)return;
        if(intent!==JSON.stringify(Object.fromEntries(new FormData(form))))throw new Error('Đầu vào đã thay đổi. Lấy lại báo giá cho khoảng mới.');
        U.quote(q);result.className='sl-quote';result.replaceChildren(); details(result,{'Loại':'Dự kiến, chưa chốt đơn','Tổng dự kiến':U.money(q.totals?.accommodationTotalVnd),'Chính sách':q.policy.code+' / phiên bản '+q.policy.version,'Báo lúc':U.date(q.quotedAt)});
        C.table.mount(result.appendChild(el('div',null,'table-responsive')),[{key:'date',label:'Ngày'},{key:'kind',label:'Khoản',render:line=>U.label(line.kind)},{key:'totalVnd',label:'Thành tiền',render:line=>U.money(line.totalVnd)}],q.breakdown||[]);
      }catch(error){C.notification.error(result,error);}finally{submit.disabled=!ready||!S.current();}
    },true); submit.disabled=!ready||!S.current(); host.append(submit); form.onsubmit=event=>event.preventDefault();
    form.oninput=form.onchange=()=>{result.replaceChildren();result.className='sl-quote';};
    host.append(el('p','Giá do backend tính theo chính sách được duyệt. Báo giá không giữ phòng và không thu tiền.','small text-secondary'));
  }
  async function bookingForm(preview = false, prefillRoom = null) {
    const host = dialog('Đặt phòng lẻ / khách đoàn'), form = el('form', null, 'sl-form-grid'), quote = el('section', null, 'sl-quote'); form.dataset.pmsReadOnly='true'; host.append(form);
    if (preview) blocked(host, 'Đây là bản xem biểu mẫu. Không xác nhận đơn, không thu cọc, không ghi dữ liệu.');
    const canEstimate = availableModules.includes('pricingGateway') && availableModules.includes('bookingsGateway') && catalogCapabilities.ratePlans?.supported === true && catalogCapabilities.customers?.supported === true && ratePlans.some(item => item.active) && Boolean(hotel?.timeZoneId);
    if (!canEstimate) blocked(host, 'Đặt phòng còn cần gói giá, hồ sơ khách, hợp đồng quỹ phòng/lịch và command đặt đoàn nguyên tử. Không thể xác nhận chỉ từ danh mục phòng hiện tại.');
    const kind = field(form, 'kind', 'Loại đơn', { options: [['INDIVIDUAL', 'Khách lẻ'], ['GROUP', 'Khách đoàn']], value: 'INDIVIDUAL' });
    const customer = field(form, 'customerId', 'Khách đặt', { options: [['', 'Chọn khách từ máy chủ'], ...customerRows.map(row => [row.id, row.fullName + (row.phone ? ' · ' + row.phone : '')])], required: true });
    const newCustomer=el('details',null,'card card-body mb-3'),newFields=el('div',null,'sl-form-grid'),customerStatus=el('div');
    newCustomer.append(el('summary','+ Tạo hồ sơ khách mới trong SQL'),newFields,customerStatus);host.append(newCustomer);
    const newName=field(newFields,'newCustomerName','Họ và tên khách',{required:true});
    const newPhone=field(newFields,'newCustomerPhone','Điện thoại (không bắt buộc)',{type:'tel'});
    const newEmail=field(newFields,'newCustomerEmail','Email (không bắt buộc)',{type:'email'});
    const testCustomer=field(newFields,'newCustomerTest','Đây là hồ sơ kiểm thử có nhãn SONGLAM_TEST',{type:'checkbox'});
    const customerKey=crypto.randomUUID();
    const saveCustomer=button('Lưu khách vào SQL và chọn',async()=>{
      if(!newName.reportValidity()||!newEmail.reportValidity()||saveCustomer.disabled)return;saveCustomer.disabled=true;
      try{
        if(!await P.canWrite('POST','/customers',['createBooking']))throw new Error('Chưa có quyền/hợp đồng tạo khách trong SQL.');
        const response=await customers.create({fullName:newName.value.trim(),phone:newPhone.value.trim()||null,email:newEmail.value.trim()||null,isTest:testCustomer.checked},{idempotencyKey:customerKey}),row=response.data.customer;
        if(response.data.committed!==true||!row?.id)throw Object.assign(new Error('Chưa nhận receipt tạo khách.'),{outcomeUnknown:true});
        customerRows=[...customerRows.filter(item=>item.id!==row.id),row];
        const selects=[customer,...roomSection.querySelectorAll('select[name=leadCustomerId],select[name=guestCustomerIds]')];
        for(const select of selects)if(![...select.options].some(option=>option.value===row.id))select.add(new Option(row.fullName+(row.phone?' · '+row.phone:''),row.id));
        customer.value=row.id;customer.dispatchEvent(new Event('change',{bubbles:true}));
        const lead=roomForms[0]?.querySelector('select[name=leadCustomerId]');if(lead&&!lead.value)lead.value=row.id;
        C.notification.set(customerStatus,'Đã commit hồ sơ '+row.code+' vào SQL. Khách đã được chọn; xem lại báo giá trước khi xác nhận đơn.','success');
        saveCustomer.textContent='Đã lưu khách';newFields.querySelectorAll('input').forEach(input=>input.disabled=true);
      }catch(error){C.notification.error(customerStatus,error);if(error.outcomeUnknown){const link=el('a','Tra cứu yêu cầu tạo khách');link.href='operations-status.html';customerStatus.append(link);}else saveCustomer.disabled=false;}
    },true);newCustomer.append(saveCustomer);saveCustomer.disabled=true;if(!preview)P.canWrite('POST','/customers',['createBooking']).then(ok=>{saveCustomer.disabled=!ok;}).catch(()=>{});
    field(form, 'contact', 'Người liên hệ', { required: true }); field(form, 'phone', 'Điện thoại', { type: 'tel' }); field(form, 'groupName', 'Tên đoàn');
    field(form, 'sourceCode', 'Nguồn đặt', { value: 'FRONT_DESK', required: true }); field(form, 'notes', 'Ghi chú', { type: 'textarea' });
    const roomSection = el('section', null, 'sl-wide'), roomForms = []; form.append(roomSection);
    const lookup = field(form,'customerLookup','Tìm khách theo tên / số điện thoại'), lookupStatus=el('p',null,'small text-secondary sl-wide');
    const more=button('Nạp thêm kết quả khách',()=>lookupCustomers(true));more.hidden=true;
    let customerOffset=0,customerQuery='',searchGeneration=0;
    async function lookupCustomers(next=false){
      const ticket=++searchGeneration;lookupStatus.textContent='Đang tìm khách từ máy chủ…';
      const query=lookup.value.trim();if(!next||query!==customerQuery){customerOffset=0;customerQuery=query;}
      try{
        const response=await catalog.list('customers',{q:query,offset:customerOffset,limit:50});
        if(ticket!==searchGeneration||!host.isConnected)return;
        const existing=new Map(customerRows.map(row=>[row.id,row]));response.data.forEach(row=>existing.set(row.id,row));customerRows=[...existing.values()];
        const selects=[customer,...roomSection.querySelectorAll('select[name=leadCustomerId],select[name=guestCustomerIds]')];
        for(const select of selects){
          const selected=[...select.selectedOptions].map(option=>option.value), known=new Set([...select.options].map(option=>option.value));
          response.data.forEach(row=>{if(!known.has(row.id))select.add(new Option(row.fullName+(row.phone?' · '+row.phone:''),row.id));});
          [...select.options].forEach(option=>option.selected=selected.includes(option.value));
        }
        customerOffset+=response.data.length;more.hidden=response.meta?.hasMore!==true;
        lookupStatus.textContent=response.data.length?'Đã nạp '+customerOffset+' kết quả cho từ khóa hiện tại. Chọn khách ở các ô khách đặt / khách chính / đồng hành.':'Không có khách phù hợp. Không tạo hồ sơ giả.';
      }catch(error){C.notification.error(lookupStatus,error);}
    }
    const search=button('Tìm khách',()=>lookupCustomers());search.disabled=!S.current();form.append(search,more,lookupStatus);
    customer.onchange=()=>{const row=customerRows.find(item=>item.id===customer.value);if(row){form.elements.contact.value=row.fullName;form.elements.phone.value=row.phone||'';}};
    let quoted = false;
    const acceptedQuotes = new Map();
    function invalidateQuote() { quoted = false; acceptedQuotes.clear(); quote.replaceChildren(); }
    function addRoom() {
      invalidateQuote();
      const row = el('fieldset', null, 'card card-body sl-form-grid mb-3'); row.append(el('legend', 'Phòng ' + (roomForms.length + 1), 'fs-4'));
      const roomType = field(row, 'roomTypeId', 'Hạng phòng', { options: [['', 'Chọn hạng'], ...roomTypes.filter(type => type.active).map(type => [type.id, type.name])], required: true });
      const plan = field(row, 'ratePlanId', 'Gói giá', { options: [['', 'Chọn gói']], required: true });
      const mode = field(row, 'stayType', 'Hình thức', { options: [['NIGHTLY', 'Theo đêm'], ['HOURLY', 'Theo giờ']], value: 'NIGHTLY' });
      function plansForMode() { const previous = plan.value; plan.replaceChildren(new Option('Chọn gói', '')); ratePlans.filter(item => item.active && item.stayType === mode.value).forEach(item => plan.add(new Option(item.name || item.code, item.id))); plan.value = [...plan.options].some(option => option.value === previous) ? previous : ''; }
      mode.onchange = plansForMode; plansForMode();
      const plannedRoom=field(row,'plannedRoomId','Phòng dự kiến (có thể để chưa phân)',{options:[['','Chưa phân phòng']]});let roomLoad=0;
      roomType.addEventListener('change',async()=>{const ticket=++roomLoad,type=roomType.value;plannedRoom.replaceChildren(new Option('Chưa phân phòng',''));if(!type)return;plannedRoom.disabled=true;
        try{let next=true,page=0;while(next&&page<20){const response=await catalog.list('rooms',{roomTypeId:type,offset:page*200,limit:200});if(ticket!==roomLoad||!row.isConnected)return;
          response.data.filter(item=>item.exploitationStatus!=='INACTIVE').forEach(item=>plannedRoom.add(new Option('P. '+item.number+' · '+U.label(item.cleanlinessStatus),item.id)));
          next=response.meta?.hasMore===true;page++;}if(next)throw new Error('Chưa tải hết danh sách phòng; không kết luận phòng trống từ trang đầu.');
        }catch(error){C.notification.error(quote,error);}finally{if(ticket===roomLoad)plannedRoom.disabled=false;}});
      field(row, 'checkInAt', 'Dự kiến nhận (giờ khách sạn)', { type: 'datetime-local', required: true }); field(row, 'checkOutAt', 'Dự kiến trả (giờ khách sạn)', { type: 'datetime-local', required: true });
      field(row, 'adults', 'Người lớn', { type: 'number', value: '1', min: 1, max: 32767 }); field(row, 'children', 'Trẻ em', { type: 'number', value: '0', min: 0, max: 32767 });
      field(row, 'leadCustomerId', 'Khách chính ở phòng', { options: [['', 'Chọn khách chính'], ...customerRows.map(item => [item.id, item.fullName])] });
      const companions = field(row, 'guestCustomerIds', 'Khách đồng hành (có thể chọn nhiều)', { options: customerRows.map(item => [item.id, item.fullName]) }); companions.multiple = true; companions.selectedIndex = -1;
      if (prefillRoom) {
        roomType.value = prefillRoom.roomTypeId;
        plansForMode();
        plannedRoom.add(new Option('P. ' + prefillRoom.number + ' · ' + U.label(prefillRoom.cleanlinessStatus), prefillRoom.id));
        plannedRoom.value = prefillRoom.id;
        const today = hotel?.workingDate || new Date().toISOString().slice(0, 10);
        const checkIn = row.querySelector('[name=checkInAt]');
        const checkOut = row.querySelector('[name=checkOutAt]');
        if (checkIn && !checkIn.value) checkIn.value = today + 'T14:00';
        if (checkOut && !checkOut.value) {
          const nextDay = new Date(Date.parse(today + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
          checkOut.value = nextDay + 'T12:00';
        }
      }
      row.append(button('Bỏ dòng phòng', () => { if (roomForms.length === 1) return; roomForms.splice(roomForms.indexOf(row), 1); row.remove(); invalidateQuote(); })); roomForms.push(row); roomSection.append(row);
    }
    addRoom(); const add = button('+ Thêm phòng vào đoàn', () => { if (roomForms.length >= 50) return; addRoom(); kind.value = 'GROUP'; kind.dispatchEvent(new Event('change')); quote.replaceChildren(); }); form.append(add);
    const body = () => ({ kind: kind.value, customerId: customer.value, contact: { name: form.elements.contact.value, phone: form.elements.phone.value || null }, groupName: form.elements.groupName.value || null, sourceCode: form.elements.sourceCode.value, notes: form.elements.notes.value || null,
      rooms: roomForms.map((row, index) => { const get = name => row.querySelector('[name="' + name + '"]').value;
        const lead = get('leadCustomerId') || null, guests = [...row.querySelector('[name="guestCustomerIds"]').selectedOptions].map(option => option.value);
        if (lead && !guests.includes(lead)) guests.unshift(lead);
        return { lineKey: 'room-' + (index + 1), roomTypeId: get('roomTypeId'), ratePlanId: get('ratePlanId'), stayType: get('stayType'), checkInAt: U.hotelInstant(get('checkInAt'), hotel?.timeZoneId), checkOutAt: U.hotelInstant(get('checkOutAt'), hotel?.timeZoneId), adults: Number(get('adults')), children: Number(get('children')), guestCustomerIds: guests, leadCustomerId: lead, plannedRoomId:get('plannedRoomId')||null,acceptedQuoteHash: acceptedQuotes.get('room-' + (index + 1)) || null }; }) });
    form.addEventListener('input', invalidateQuote);
    form.addEventListener('change', invalidateQuote);
    const groupName = form.elements.groupName;
    function groupRequirements() { groupName.required = kind.value === 'GROUP'; }
    kind.addEventListener('change', groupRequirements); groupRequirements();
    const getQuote = button('Kiểm quỹ & xem báo giá', async () => {
      if (!roomForms.every(row=>[...row.querySelectorAll('input,select')].every(control=>control.reportValidity()))) return; getQuote.disabled = true; invalidateQuote();
      try {
        const input = body(), intent=JSON.stringify(input); const results = [], demand = new Map();
        const range=room=>{const from=room.checkInAt.slice(0,10);let to=room.checkOutAt.slice(0,10);if(to<=from&&room.stayType==='HOURLY')to=new Date(Date.parse(from+'T00:00:00Z')+86400000).toISOString().slice(0,10);return{from,to};};
        for (const room of input.rooms) {
          const dates=range(room);
          if(!dates.to||dates.to<=dates.from)throw new Error('Giá đêm cần ít nhất một đêm; giá giờ cần thời điểm trả sau nhận.');
          for (let date = Date.parse(dates.from+'T00:00:00Z'); date < Date.parse(dates.to+'T00:00:00Z'); date += 86400000) {
            const key = room.roomTypeId + ':' + new Date(date).toISOString().slice(0,10); demand.set(key, (demand.get(key) || 0) + 1);
          }
        }
        for (const room of input.rooms) {
          const dates=range(room),available = await bookings.checkAvailability({roomTypeId:room.roomTypeId,...dates,checkInAt:room.checkInAt,checkOutAt:room.checkOutAt});
          if (available.data.nights.some(night => (demand.get(room.roomTypeId + ':' + night.date) || 0) > night.available)) throw new Error('Tổng nhu cầu đoàn vượt quỹ của ít nhất một đêm. Chưa thể xác nhận.');
          if(room.plannedRoomId){let more=true,page=0;while(more&&page<20){const timeline=await bookings.getTimeline({...dates,roomId:room.plannedRoomId,offset:page*200,limit:200});
            if(timeline.data.segments.some(segment=>Date.parse(segment.startsAtUtc)<Date.parse(room.checkOutAt)&&Date.parse(segment.endsAtUtc)>Date.parse(room.checkInAt)))throw new Error('Phòng đã chọn vướng đặt phòng/lưu trú/block trong khoảng yêu cầu.');
            more=timeline.meta?.hasMore===true;page++;}if(more)throw new Error('Chưa đọc hết lịch phòng. Chưa thể xác nhận.');}
          const q = await pricing.quote(room.stayType === 'HOURLY' ? 'hourly' : 'nightly', { roomTypeId: room.roomTypeId, ratePlanId: room.ratePlanId, checkInAt: room.checkInAt, checkOutAt: room.checkOutAt, rooms: 1, adultsPerRoom: room.adults, childrenPerRoom: room.children }); results.push({ available: available.data, quote: q.data });
        }
        if(!host.isConnected||!$('desk-dialog').open)return;
        if(intent!==JSON.stringify(body()))throw new Error('Đầu vào đã thay đổi trong khi lấy giá. Kiểm quỹ và báo giá lại trước khi xác nhận.');
        quote.replaceChildren(el('strong', 'Báo giá dự kiến — chưa giữ quỹ, chưa thu cọc'));
        results.forEach((result, index) => { const q = U.quote(result.quote); if (!/^[a-f0-9]{64}$/.test(q.acceptanceHash || '')) throw new Error('Máy chủ chưa cung cấp mã xác nhận điều kiện giá. Không thể xác nhận đơn.'); acceptedQuotes.set('room-' + (index + 1), q.acceptanceHash); details(quote, { 'Phòng': index + 1, 'Còn tối thiểu theo đêm': result.available.minimumAvailable, 'Tạm tính': U.money(q.totals?.accommodationTotalVnd), 'Phiên bản chính sách': q.policy.version });
          C.table.mount(quote.appendChild(el('div', null, 'table-responsive')), [{ key: 'date', label: 'Ngày' }, { key: 'kind', label: 'Khoản', render: line => U.label(line.kind) }, { key: 'totalVnd', label: 'Số tiền', render: line => U.money(line.totalVnd) }], q.breakdown || []); });
        details(quote, { 'Tổng dự kiến toàn đơn': U.money(results.reduce((sum, item) => sum + BigInt(item.quote.totals.accommodationTotalVnd), 0n).toString()), 'Số phòng': results.length, 'Tiền cọc đã thu': 'Chưa ghi nhận trong thao tác đặt phòng' }); quoted = true;
      } catch (error) { quoted = false; acceptedQuotes.clear(); C.notification.error(quote, error); } finally { getQuote.disabled = !canEstimate || !S.current(); }
    }); form.append(getQuote); host.append(quote);
    const bookingPath=()=>kind.value==='GROUP'?'/bookings/groups':'/bookings';
    const submit = await command(host, 'Xác nhận đặt phòng', bookingPath, 'POST', ['createBooking'], async options => {
      if (!form.reportValidity() || !quoted) throw new Error('Cần nhập đầy đủ và kiểm quỹ/báo giá trước khi xác nhận.');
      const input = body(); return input.kind === 'GROUP' ? bookings.createGroupBooking(input, options) : bookings.createBooking(input, options);
    });
    kind.addEventListener('change',async()=>{submit.disabled=preview||!await P.canWrite('POST',bookingPath(),['createBooking']).catch(()=>false);});
    // No payment fields in this command: deposit is recorded only by G9.
    host.append(el('p', 'Tiền cọc được ghi riêng tại Thu ngân sau khi đơn đã được máy chủ xác nhận. Giao dịch chờ không được coi là đã thu.', 'small text-secondary'));
    getQuote.disabled = !canEstimate || !S.current();
    if (preview) submit.disabled = true;
    form.onsubmit = event => event.preventDefault();
  }
  async function bookingDetail(id) {
    const host = dialog('Chi tiết đặt phòng'), ticket = host; host.textContent = 'Đang tải…';
    try {
      const row = (await bookings.getBooking(id)).data; if (!$('desk-dialog').open) return; host.replaceChildren();
      details(host, { 'Mã đơn': row.code, 'Khách liên hệ': row.contactName, 'Đoàn': row.groupName, 'Trạng thái': U.label(row.status), 'Tổng dự kiến': U.money(row.totals?.estimatedAccommodationTotalVnd) });
      C.table.mount(host.appendChild(el('div', null, 'table-responsive')), [{ key: 'id', label: 'Phần phòng' }, { key: 'status', label: 'Trạng thái', render: item => U.label(item.status) }, { key: 'startsAtUtc', label: 'Nhận', render: item => U.date(item.startsAtUtc) }, { key: 'endsAtUtc', label: 'Trả', render: item => U.date(item.endsAtUtc) }, { key: 'estimatedAccommodationTotalVnd', label: 'Giá chốt/dự kiến', render: item => U.money(item.estimatedAccommodationTotalVnd) }], row.rooms, part => bookingRoomActions(row, part));
      if (row.depositSummary) { const section = el('section'); host.append(section); const names = { collectedVnd:'Cọc đã thu', refundedVnd:'Đã hoàn cọc', appliedVnd:'Đã đối trừ', retainedVnd:'Giữ lại theo chính sách', pendingRefundVnd:'Chờ hoàn', remainingVnd:'Cọc còn lại', receivedAllocationBeforeVnd:'Cọc phần đã nhận trước hủy', receivedAllocationAfterVnd:'Cọc phần đã nhận sau hủy' }; details(section, Object.fromEntries(Object.entries(names).map(([key, label]) => [label, U.money(row.depositSummary[key])]))); }
      const form = el('div', null, 'sl-form-grid'); host.append(form); const reason = field(form, 'reason', 'Lý do hủy toàn đơn / phần chưa nhận', { type: 'textarea', required: true });
      await command(host, 'Hủy đơn / phần chưa nhận', '/bookings/' + id + '/cancel', 'POST', ['cancelBooking'], options => { if (!reason.value.trim()) throw new Error('Bắt buộc ghi lý do hủy.'); return bookings.cancelBooking(id, { expectedVersion: row.version, reason: reason.value.trim() }, options); });
      host.append(el('p', 'Hủy không tự hoàn tiền. Số cọc giữ lại/chờ hoàn phải lấy từ kết quả máy chủ.', 'small text-secondary'));
    } catch (error) { C.notification.error(ticket, error); }
  }
  async function bookingRoomActions(booking, part) {
    const host = dialog('Phần phòng ' + part.id), form = el('div', null, 'sl-form-grid'); host.append(form);
    details(form, { 'Trạng thái': U.label(part.status), 'Giá': U.money(part.estimatedAccommodationTotalVnd) });
    const room = field(form, 'room', 'Phòng dự kiến', { options: [['', 'Tải và chọn phòng cùng hạng']] });
    try { const result = await catalog.list('rooms', { roomTypeId: part.roomTypeId, limit: 200 }); result.data.forEach(item => { if (item.exploitationStatus === 'ACTIVE') room.add(new Option('P. ' + item.number + ' · ' + U.label(item.cleanlinessStatus), item.id)); }); } catch (error) { blocked(host, error.message); }
    const schedule=el('section');host.append(schedule);let checkedRoom=null;
    room.onchange=()=>{checkedRoom=null;schedule.replaceChildren();};
    host.append(button('Kiểm tra lịch phòng dự kiến',async()=>{
      checkedRoom=null;
      try{
        if(!room.value)throw new Error('Chọn phòng dự kiến.');
        const chosen=room.value,from=part.arrivalDate||U.hotelDate(part.startsAtUtc,hotel?.timeZoneId),to=part.departureDate||U.hotelDate(part.endsAtUtc,hotel?.timeZoneId);
        let complete=false;
        for(let page=0;page<20;page++){
          const response=await bookings.getTimeline({roomId:chosen,from,to,offset:page*limit,limit});
          if(chosen!==room.value)throw new Error('Phòng đã đổi. Kiểm tra lại lịch phòng mới.');
          if(response.data.segments.some(item=>item.roomId===chosen&&item.bookingRoomId!==part.id&&Date.parse(item.startsAtUtc)<Date.parse(part.endsAtUtc)&&Date.parse(item.endsAtUtc)>Date.parse(part.startsAtUtc)))throw new Error('Phòng bị trùng đặt trước, đang lưu trú hoặc có block trong khoảng yêu cầu.');
          if(response.meta?.hasMore===false){complete=true;break;}
          if(response.meta?.hasMore!==true||!response.data.segments.length)break;
        }
        if(!complete)throw new Error('Chưa đọc được toàn bộ lịch phòng. Không kết luận phòng trống từ một phần kết quả.');
        checkedRoom=chosen;C.notification.set(schedule,'Chưa thấy xung đột trong khoảng đã đọc. Máy chủ vẫn phải kiểm tra và khóa lại khi xác nhận.','info');
      }catch(error){C.notification.error(schedule,error);}
    }));
    await command(host, 'Gán / đổi phòng dự kiến', '/bookings/' + booking.id + '/rooms/' + part.id + '/assignment', 'PUT', ['createBooking'], options => {
      if (!room.value||checkedRoom!==room.value) throw new Error('Cần kiểm tra lịch đầy đủ cho phòng dự kiến trước khi xác nhận.'); return bookings.assignRoom(booking.id, part.id, { roomId: room.value, expectedVersion: booking.version, expectedAllocationVersions: part.allocations.map(item => ({ id: item.id, version: item.version })) }, options);
    });
    const reason = field(form, 'reason', 'Lý do hủy phần phòng', { type: 'textarea' });
    await command(host, 'Hủy phần phòng này', '/bookings/' + booking.id + '/rooms/cancel', 'POST', ['cancelBooking'], options => { if (!reason.value.trim()) throw new Error('Bắt buộc ghi lý do.'); return bookings.cancelRooms(booking.id, { reason: reason.value, expectedVersion: booking.version, bookingRoomIds: [part.id] }, options); });
    const readinessHost = el('section'); host.append(readinessHost);
    const check = button('Kiểm tra điều kiện nhận phòng', async () => {
      check.disabled = true;
      try {
        const ready = (await stays.getRoomReadiness({ bookingRoomId: part.id, ...(room.value ? { roomId: room.value } : {}) })).data;
        details(readinessHost, { 'Sẵn sàng': ready.roomReady ? 'Đạt trạng thái phòng' : 'Chưa đạt', 'Điều kiện còn thiếu': (ready.blockers || []).join(', ') || 'Theo xác nhận máy chủ' });
        await command(readinessHost, 'Nhận phần phòng này', '/stays/check-in', 'POST', ['manageCheckIn'], options => {
          if (ready.blockers?.length || !ready.roomReady || !ready.room || !ready.allocation) throw new Error('Phòng chưa đủ điều kiện nhận khách.');
          const lead = part.guests.find(guest => guest.isLead)?.customerId; if (!lead) throw new Error('Cần bổ sung khách chính qua nghiệp vụ được hỗ trợ trước khi nhận.');
          return stays.checkIn({ bookingId: booking.id, expectedVersion: booking.version, rooms: [{ bookingRoomId: part.id, expectedVersion: ready.bookingRoomVersion, roomId: ready.room.id, roomVersion: ready.room.version, allocationId: ready.allocation.id, allocationVersion: ready.allocation.version, guestCustomerIds: part.guests.map(guest => guest.customerId), leadCustomerId: lead }] }, options);
        });
      } catch (error) { C.notification.error(readinessHost, error); } finally { check.disabled = false; }
    }); host.append(check);
  }
  async function stayDetail(id) {
    const host = dialog('Chi tiết lưu trú'); host.textContent = 'Đang tải…';
    try {
      const row = (await stays.getStay(id)).data; host.replaceChildren();
      details(host, { 'Mã lưu trú': row.code, 'Đơn': row.bookingId, 'Nhận thực tế': U.date(row.checkedInAtUtc), 'Dự kiến trả': U.date(row.expectedOutAtUtc), 'Trạng thái': U.label(row.status), 'Giá / chính sách': row.pricing ? U.money(row.pricing.accommodationEstimateVnd) + ' · ' + row.pricing.policyVersionId : 'Chưa được cấp dữ liệu giá' });
      if (row.segments) C.table.mount(host.appendChild(el('div', null, 'table-responsive')), [{ key: 'roomId', label: 'Phòng' }, { key: 'arrivedAtUtc', label: 'Từ', render: item => U.date(item.arrivedAtUtc) }, { key: 'departedAtUtc', label: 'Đến', render: item => U.date(item.departedAtUtc) }], row.segments);
      const segment = row.segments?.find(item => item.departedAtUtc === null); if (!segment || row.status !== 'IN_HOUSE') { blocked(host, 'Không có segment đang ở hoặc phiên chưa được cấp lịch sử phòng.'); return; }
      const form = el('div', null, 'sl-form-grid'); host.append(form);
      const reason = field(form, 'reason', 'Lý do thay đổi', { type: 'textarea', required: true }), out = field(form, 'newExpectedOutAt', 'Ngày trả mới (giờ khách sạn)', { type: 'datetime-local' });
      const common = () => { if (!reason.value.trim()) throw new Error('Bắt buộc ghi lý do.'); return { expectedVersion: row.version, bookingRoomVersion: row.bookingRoomVersion, currentSegmentId: segment.id, currentAllocationId: segment.allocationId, currentAllocationVersion: segment.allocationVersion, reason: reason.value.trim() }; };
      const priceChange=el('section',null,'sl-quote'); host.append(priceChange); let acceptedChange=null;
      const changeBody=direction=>({...common(),direction,newExpectedOutAt:U.hotelInstant(out.value,hotel?.timeZoneId)});
      const invalidateChange=()=>{acceptedChange=null;priceChange.replaceChildren();};
      out.addEventListener('input',invalidateChange);reason.addEventListener('input',invalidateChange);
      for(const [direction,title] of [['extend','Gia hạn'],['shorten','Trả sớm (chưa quyết toán)']]){
        const preview=button('Xem giá '+(direction==='extend'?'gia hạn':'trả sớm'),async()=>{
          if(preview.disabled)return;preview.disabled=true;acceptedChange=null;
          try{
            const body=changeBody(direction),fingerprint=JSON.stringify(body),result=(await stays.previewPriceChange(id,body)).data;
            if(!host.isConnected||!$('desk-dialog').open)return;
            if(fingerprint!==JSON.stringify(changeBody(direction)))throw new Error('Nội dung đã đổi trong lúc xem giá. Hãy xem lại.');
            if(result.committed!==false||result.direction!==direction||result.stayId!==id||! /^[a-f0-9]{64}$/.test(result.acceptanceHash||''))throw new Error('Chưa nhận được đề xuất giá hợp lệ.');
            acceptedChange={direction,fingerprint,hash:result.acceptanceHash};priceChange.replaceChildren();
            details(priceChange,{'Giá trước':U.money(result.before.accommodationEstimateVnd),'Giá sau dự kiến':U.money(result.after.accommodationEstimateVnd),'Chênh lệch':U.money(result.differenceVnd),'Phiên bản chính sách':result.policyVersionId,'Hoàn tiền':'Chờ quản lý quyết định; chưa thu/hoàn, chưa quyết toán'});
            C.table.mount(priceChange.appendChild(el('div',null,'table-responsive')),[{key:'date',label:'Đêm'},{key:'priceVnd',label:'Giá đã chốt / bổ sung',render:item=>U.money(item.priceVnd)}],result.nightlyRates||[]);
          }catch(error){acceptedChange=null;C.notification.error(priceChange,error);}finally{preview.disabled=false;}
        });host.append(preview);
        await command(host,title,'/stays/'+id+'/'+direction,'POST',['manageCheckIn'],options=>{
          const body=changeBody(direction);
          if(!acceptedChange||acceptedChange.direction!==direction||acceptedChange.fingerprint!==JSON.stringify(body))throw new Error('Xem và xác nhận đúng đề xuất giá của lần điều chỉnh này trước khi ghi.');
          const {direction:_direction,...input}=body;
          return stays[direction](id,{...input,acceptedProposalHash:acceptedChange.hash},options);
        });
      }
      const target = field(form, 'targetRoomId', 'Phòng chuyển đến', { options: [['', 'Chọn phòng sạch, đang khai thác']] });
      let targets = []; try { targets = (await catalog.list('rooms', { cleanlinessStatus: 'CLEAN', exploitationStatus: 'ACTIVE', occupancyStatus: 'VACANT', limit: 200 })).data; targets.forEach(item => target.add(new Option('P. ' + item.number, item.id))); } catch (error) { blocked(host, error.message); }
      const readiness=el('section');host.append(readiness);let readyTarget=null;
      target.onchange=()=>{readyTarget=null;readiness.replaceChildren();};
      host.append(button('Kiểm tra phòng chuyển đến',async()=>{try{if(!target.value)throw new Error('Chọn phòng đích.');readyTarget=(await stays.getRoomReadiness({stayId:id,roomId:target.value})).data;details(readiness,{'Phòng đích':target.value,'Sẵn sàng':readyTarget.roomReady?'Đạt trạng thái phòng':'Chưa đạt','Điều kiện còn thiếu':readyTarget.blockers?.join(', ')||'Theo máy chủ'});}catch(error){readyTarget=null;C.notification.error(readiness,error);}}));
      await command(host, 'Chuyển phòng', '/stays/' + id + '/transfer-room', 'POST', ['manageRoomTransfer'], options => { const room=readyTarget?.room;if(!room?.version||room.id!==target.value||!readyTarget.roomReady||readyTarget.blockers?.length)throw new Error('Phải kiểm tra phòng đích sạch/khả dụng và lấy phiên bản mới từ backend.');return stays.transferRoom(id,{...common(),targetRoomId:room.id,targetRoomVersion:room.version},options);});
      const checkout = el('a', 'Mở folio và quyết toán tại Thu ngân', 'btn btn-outline-primary mt-3'); checkout.href = 'finance-api.html?bookingId='+encodeURIComponent(row.bookingId)+'#checkout'; host.append(checkout);
      host.append(el('p', 'Gia hạn/trả sớm cần giá bổ sung hoặc điều chỉnh từ chính sách đã chốt. Không tự hoàn tiền, không đóng folio.', 'small text-secondary'));
    } catch (error) { C.notification.error(host, error); }
  }
  $('desk-close').onclick = () => C.modal.close($('desk-dialog'));
  $('view-mode-rack')?.addEventListener('click', () => {
    $('view-mode-rack')?.classList.add('active');
    $('view-mode-timeline')?.classList.remove('active');
    $('view-mode-list')?.classList.remove('active');
    screen = 'rooms'; offset = 0; navigation(); load();
  });
  $('view-mode-timeline')?.addEventListener('click', () => {
    $('view-mode-timeline')?.classList.add('active');
    $('view-mode-rack')?.classList.remove('active');
    $('view-mode-list')?.classList.remove('active');
    screen = 'timeline'; offset = 0; navigation(); load();
  });
  $('view-mode-list')?.addEventListener('click', () => {
    $('view-mode-list')?.classList.add('active');
    $('view-mode-rack')?.classList.remove('active');
    $('view-mode-timeline')?.classList.remove('active');
    table([
      { key: 'number', label: 'Số phòng' },
      { key: 'floor', label: 'Tầng' },
      { key: 'roomTypeId', label: 'Hạng phòng', render: r => roomTypes.find(t => t.id === r.roomTypeId)?.name || r.roomTypeId },
      { key: 'occupancyStatus', label: 'Hiện diện', render: r => U.label(r.occupancyStatus) },
      { key: 'cleanlinessStatus', label: 'Vệ sinh', render: r => U.label(r.cleanlinessStatus) },
      { key: 'exploitationStatus', label: 'Khai thác', render: r => U.label(r.exploitationStatus) }
    ], roomRows, r => roomCard(r).click());
  });
  $('desk-filter-toggle').onclick = () => { filters.classList.toggle('is-expanded'); $('desk-filter-toggle').setAttribute('aria-expanded', String(filters.classList.contains('is-expanded'))); };
  $('desk-refresh').onclick = async () => { await referenceData().catch(() => {}); await load(); $('desk-create').disabled=!await P.canWrite('POST','/bookings',['createBooking']).catch(()=>false); };
  $('desk-preview').onclick = () => bookingForm(true);
  $('desk-create').onclick = () => bookingForm();
  $('desk-quote').onclick = () => quoteForm();
  $('desk-quick-checkin')?.addEventListener('click', () => { screen = 'arrivals'; offset = 0; navigation(); load(); });
  $('desk-quick-service')?.addEventListener('click', () => { location.assign('services-api.html'); });
  $('desk-quick-cashier')?.addEventListener('click', () => { location.assign('finance-api.html'); });
  filters.onsubmit = event => { event.preventDefault(); offset = 0; load(); };
  root.addEventListener('hashchange', () => {
    const target = location.hash.slice(1);
    if (!Object.hasOwn(tabs, target) || target === screen) return;
    screen = target; offset = 0; navigation(); load();
  });
  (async () => {
    const hash = location.hash.slice(1); if (Object.hasOwn(tabs, hash)) screen = hash; navigation();
    try { const me = await S.restore(); actorId = me.data.user.appUserId; await referenceData(); navigation(); $('desk-create').disabled = !await P.canWrite('POST', '/bookings', ['createBooking']); }
    catch (error) { C.notification.error($('desk-message'), error); }
    load();
  })();
}(window));
