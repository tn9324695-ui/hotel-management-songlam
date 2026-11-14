(function (root) {
  'use strict';
  const el = root.SongLamComponents.el;
  root.SongLamComponents.pagination = Object.freeze({
    update(previous, next, { offset, hasMore }) { previous.disabled = offset <= 0; next.disabled = hasMore !== true; },
    mount(host, { offset, limit, count, hasMore, onPage }) {
      host.replaceChildren();
      const label = el('span', count ? `Đang xem ${offset + 1}–${offset + count}` : 'Không có bản ghi');
      const previous = el('button', '← Trước', 'btn btn-sm'), next = el('button', 'Sau →', 'btn btn-sm');
      previous.type = next.type = 'button'; root.SongLamComponents.pagination.update(previous, next, { offset, hasMore });
      previous.onclick = () => onPage(Math.max(0, offset - limit)); next.onclick = () => onPage(offset + limit);
      host.append(label, previous, next);
    }
  });
}(window));
