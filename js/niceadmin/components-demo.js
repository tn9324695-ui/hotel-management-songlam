(function () {
  'use strict';
  const types = ['Standard', 'Superior', 'Deluxe', 'Suite'];
  const statuses = ['Trống', 'Có khách', 'Đã đặt', 'Trống', 'Bảo trì'];
  let data = Array.from({ length: 18 }, (_, i) => ({ id: i + 1, room: String(101 + i), floor: 1, type: types[i % 4], price: [800000, 1100000, 1500000, 2400000][i % 4], status: statuses[i % 5] }));
  const colors = { 'Trống': 'success', 'Có khách': 'primary', 'Đã đặt': 'warning', 'Bảo trì': 'secondary' };
  const table = new PMS.Table('#room-table', { data, caption: 'Danh sách phòng minh họa', columns: [
    { key: 'room', label: 'Số phòng', render: value => { const b = document.createElement('strong'); b.textContent = value; return b; } },
    { key: 'type', label: 'Hạng phòng' }, { key: 'floor', label: 'Tầng' },
    { key: 'price', label: 'Giá / đêm', render: PMS.formatVND },
    { key: 'status', label: 'Tình trạng', render: value => PMS.badge(value, colors[value]) },
    { key: 'id', label: 'Thao tác', sortable: false, render: (_, row) => {
      const group = document.createElement('div'); group.className = 'demo-actions';
      [['Xem', 'eye', () => detail(row)], ['Sửa', 'pencil', () => roomForm(row)]].forEach(([label, icon, handler]) => {
        const b = document.createElement('button'); b.className = 'btn btn-light btn-sm border'; b.type = 'button'; b.setAttribute('aria-label', `${label} phòng ${row.room}`); b.title = label;
        const i = document.createElement('i'); i.className = `bi bi-${icon}`; b.append(i); b.onclick = handler; group.append(b);
      }); return group;
    } }
  ] });
  function refresh() { table.setData(data); document.getElementById('record-count').textContent = `${data.length} phòng mẫu`; }
  function detail(row) {
    const dl = document.createElement('dl'); dl.className = 'row mb-0';
    [['Số phòng', row.room], ['Hạng phòng', row.type], ['Tầng', row.floor], ['Giá mỗi đêm', PMS.formatVND(row.price)], ['Tình trạng', row.status]].forEach(([k,v]) => {
      const dt = document.createElement('dt'); dt.className = 'col-5 mb-3'; dt.textContent = k; const dd = document.createElement('dd'); dd.className = 'col-7'; dd.textContent = v; dl.append(dt, dd);
    }); PMS.Modal.open({ title: `Chi tiết phòng ${row.room}`, content: dl });
  }
  function roomForm(row) {
    const form = document.createElement('form'); form.className = 'row g-3';
    const fields = [['room','Số phòng','text'],['floor','Tầng','number'],['type','Hạng phòng','select'],['price','Giá mỗi đêm (VND)','number'],['status','Tình trạng','select']];
    fields.forEach(([name,label,type]) => {
      const wrap = document.createElement('div'); wrap.className = name === 'status' ? 'col-12' : 'col-md-6';
      const l = document.createElement('label'); l.className = 'form-label'; l.htmlFor = `room-${name}`; l.textContent = label;
      const input = document.createElement(type === 'select' ? 'select' : 'input'); input.className = type === 'select' ? 'form-select' : 'form-control'; input.id = l.htmlFor; input.name = name; input.required = true;
      if (type === 'select') (name === 'type' ? types : Object.keys(colors)).forEach(v => input.add(new Option(v, v)));
      else { input.type = type; if (type === 'number') { input.min = name === 'floor' ? '1' : '0'; input.step = '1'; } else input.maxLength = 20; }
      input.value = row?.[name] ?? ({ floor: 1, price: 800000, type: 'Standard', status: 'Trống', room: '' }[name]); wrap.append(l, input); form.append(wrap);
    });
    form.addEventListener('submit', e => { e.preventDefault(); modal.element.querySelector('.pms-confirm').click(); });
    const modal = PMS.Modal.open({ title: row ? `Sửa phòng ${row.room}` : 'Thêm phòng mẫu', content: form, onConfirm: () => {
      const values = Object.fromEntries(new FormData(form)); values.room = values.room.trim();
      if (!values.room) throw new Error('Vui lòng nhập số phòng.');
      if (data.some(r => r.room.toLocaleLowerCase() === values.room.toLocaleLowerCase() && r.id !== row?.id)) throw new Error('Số phòng đã tồn tại. Vui lòng nhập số khác.');
      const result = { ...values, floor: Number(values.floor), price: Number(values.price), id: row?.id ?? Math.max(0, ...data.map(r => r.id)) + 1 };
      data = row ? data.map(r => r.id === row.id ? result : r) : [...data, result]; refresh(); PMS.notify(row ? 'Đã cập nhật phòng mẫu.' : 'Đã thêm phòng mẫu.');
    } });
  }
  document.getElementById('search').addEventListener('input', e => table.search(e.target.value));
  document.getElementById('status').addEventListener('change', e => { const value = e.target.value; table.setFilter(row => !value || row.status === value); });
  document.getElementById('page-size').addEventListener('change', e => table.setPageSize(e.target.value));
  document.getElementById('add-room').onclick = () => roomForm(); document.getElementById('open-form').onclick = () => roomForm();
  document.getElementById('open-confirm').onclick = async () => { const ok = await PMS.Modal.confirm({ message: 'Xác nhận thử thao tác trên bản mẫu? Không có dữ liệu thực tế bị thay đổi.' }); if (ok) PMS.notify('Anh đã xác nhận thao tác mẫu.'); };
  document.querySelectorAll('[data-notify]').forEach(b => { b.onclick = () => PMS.notify({ success: 'Đã lưu thông tin phòng mẫu.', error: 'Không thể lưu. Vui lòng kiểm tra thông tin.', warning: 'Phòng chưa đủ điều kiện bàn giao.', info: 'Đây là thông báo minh họa.' }[b.dataset.notify], b.dataset.notify); });
  refresh();
})();
