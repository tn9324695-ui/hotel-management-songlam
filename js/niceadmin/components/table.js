/* PMS Table — text values are escaped through textContent; custom renderers return DOM Nodes. */
(function (w) {
  'use strict';
  const PMS = w.PMS = w.PMS || {};
  const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLocaleLowerCase('vi');
  PMS.Table = class {
    constructor(container, options = {}) {
      this.el = typeof container === 'string' ? document.querySelector(container) : container;
      if (!this.el) throw new Error('Không tìm thấy vùng bảng');
      this.options = { columns: [], data: [], pageSize: 5, emptyText: 'Không có dữ liệu phù hợp', ...options };
      this.page = 1; this.query = ''; this.sortKey = null; this.direction = 1; this.filter = () => true;
      this.render();
    }
    setData(data) { this.options.data = [...data]; this.render(); }
    search(query) { this.query = normalize(query); this.page = 1; this.render(); }
    setFilter(fn) { this.filter = fn || (() => true); this.page = 1; this.render(); }
    setPageSize(size) { this.options.pageSize = Math.max(1, Math.floor(Number(size) || 5)); this.page = 1; this.render(); }
    render() {
      const o = this.options;
      let rows = o.data.filter(row => this.filter(row) && o.columns.some(c => normalize(row[c.key]).includes(this.query)));
      if (this.sortKey) rows.sort((a, b) => {
        const x = a[this.sortKey], y = b[this.sortKey];
        return this.direction * (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'vi', { numeric: true }));
      });
      o.pageSize = Math.max(1, Math.floor(Number(o.pageSize) || 5));
      this.page = Math.min(this.page, Math.max(1, Math.ceil(rows.length / o.pageSize)));
      this.el.replaceChildren();
      const wrap = document.createElement('div'); wrap.className = 'table-responsive';
      const table = document.createElement('table'); table.className = 'table pms-table align-middle mb-0';
      const caption = document.createElement('caption'); caption.className = 'visually-hidden'; caption.textContent = o.caption || 'Danh sách dữ liệu'; table.append(caption);
      const head = table.createTHead().insertRow();
      o.columns.forEach(c => {
        const th = document.createElement('th'); th.scope = 'col';
        if (c.sortable !== false) {
          th.setAttribute('aria-sort', this.sortKey === c.key ? (this.direction === 1 ? 'ascending' : 'descending') : 'none');
          const b = document.createElement('button'); b.type = 'button'; b.className = 'pms-sort'; b.textContent = c.label + (this.sortKey === c.key ? (this.direction === 1 ? ' ↑' : ' ↓') : ' ↕');
          b.onclick = () => { this.direction = this.sortKey === c.key ? -this.direction : 1; this.sortKey = c.key; this.render(); }; th.append(b);
        } else th.textContent = c.label;
        head.append(th);
      });
      const body = table.createTBody();
      rows.slice((this.page - 1) * o.pageSize, this.page * o.pageSize).forEach(row => {
        const tr = body.insertRow();
        o.columns.forEach(c => {
          const td = tr.insertCell();
          const value = c.render ? c.render(row[c.key], row) : row[c.key];
          if (value instanceof Node) td.append(value); else td.textContent = value ?? '—';
        });
      });
      if (!rows.length) { const td = body.insertRow().insertCell(); td.colSpan = Math.max(1, o.columns.length); td.className = 'pms-empty'; td.textContent = o.emptyText; }
      wrap.append(table); const footer = document.createElement('div'); footer.className = 'pms-table-footer'; this.el.append(wrap, footer);
      this.pagination = new PMS.Pagination(footer, { total: rows.length, page: this.page, pageSize: o.pageSize, onChange: page => { this.page = page; this.render(); } });
    }
    destroy() { this.el.replaceChildren(); }
  };
})(window);
