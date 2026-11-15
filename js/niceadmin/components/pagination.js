/* PMS Pagination — Bootstrap 5, no framework required. */
(function (w) {
  'use strict';
  const PMS = w.PMS = w.PMS || {};
  PMS.Pagination = class {
    constructor(container, options = {}) {
      this.el = typeof container === 'string' ? document.querySelector(container) : container;
      if (!this.el) throw new Error('Không tìm thấy vùng phân trang');
      this.options = { total: 0, page: 1, pageSize: 10, onChange: () => {}, ...options };
      this.render();
    }
    update(options = {}) { Object.assign(this.options, options); this.render(); }
    render() {
      const o = this.options;
      o.total = Math.max(0, Number(o.total) || 0);
      o.pageSize = Math.max(1, Math.floor(Number(o.pageSize) || 10));
      const pages = Math.max(1, Math.ceil(o.total / o.pageSize));
      o.page = Math.min(pages, Math.max(1, Math.floor(Number(o.page) || 1)));
      this.el.replaceChildren(); this.el.classList.add('pms-pagination');
      const info = document.createElement('span'); info.className = 'text-muted small';
      info.textContent = `Hiển thị ${o.total ? (o.page - 1) * o.pageSize + 1 : 0}–${Math.min(o.page * o.pageSize, o.total)} / ${o.total} mục`;
      const nav = document.createElement('nav'); nav.setAttribute('aria-label', 'Phân trang dữ liệu');
      const list = document.createElement('ul'); list.className = 'pagination pagination-sm mb-0';
      const add = (label, target, disabled, active) => {
        const li = document.createElement('li'); li.className = 'page-item' + (active ? ' active' : '');
        const b = document.createElement('button'); b.type = 'button'; b.className = 'page-link'; b.textContent = label; b.disabled = disabled;
        b.setAttribute('aria-label', label === '‹' ? 'Trang trước' : label === '›' ? 'Trang sau' : `Trang ${label}`);
        if (active) b.setAttribute('aria-current', 'page');
        b.onclick = () => { o.page = target; this.render(); o.onChange(target); };
        li.append(b); list.append(li);
      };
      add('‹', o.page - 1, o.page === 1);
      const start = Math.max(1, Math.min(o.page - 2, pages - 4));
      for (let i = start; i <= Math.min(pages, start + 4); i++) add(String(i), i, false, i === o.page);
      add('›', o.page + 1, o.page === pages); nav.append(list); this.el.append(info, nav);
    }
    destroy() { this.el.replaceChildren(); }
  };
})(window);
