(function (root) {
  'use strict';
  const components = root.SongLamComponents ||= {};
  const el = (tag, text, className) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; };
  components.el = el;
  components.table = Object.freeze({
    create(labels) {
      const table = el('table', null, 'table ops-table sl-table'), head = el('thead'), row = el('tr'), body = el('tbody');
      for (const label of labels) { const th = el('th', label); th.scope = 'col'; row.append(th); }
      head.append(row); table.append(head, body); return { table, body };
    },
    mount(host, columns, rows, { empty = 'Không có dữ liệu trong phạm vi đã chọn.', onSelect } = {}) {
      host.replaceChildren();
      if (!rows.length) { host.append(el('div', empty, 'sl-empty')); return; }
      const { table, body } = components.table.create(columns.map(column => column.label));
      rows.forEach(row => {
        const line = el('tr');
        columns.forEach((column, index) => {
          const td = el('td'), value = column.render ? column.render(row) : row[column.key];
          if (value instanceof Node) td.append(value); else td.textContent = value == null ? '—' : String(value);
          if (index === 0 && onSelect) { const button = el('button', td.textContent, 'btn btn-link p-0'); button.type = 'button'; button.addEventListener('click', () => onSelect(row)); td.replaceChildren(button); }
          line.append(td);
        }); body.append(line);
      });
      host.append(table);
    }
  });
}(window));
