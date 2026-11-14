(function (root) {
  'use strict';
  root.SongLamComponents.notification = Object.freeze({
    set(node, text, tone = 'secondary') {
      node.className = 'alert alert-' + (['secondary', 'info', 'warning', 'danger', 'success'].includes(tone) ? tone : 'secondary');
      node.setAttribute('role', tone === 'danger' ? 'alert' : 'status'); node.setAttribute('aria-live', 'polite'); node.textContent = text;
    },
    error(node, error) {
      const prefix = error.outcomeUnknown ? 'Chưa xác định kết quả. Không gửi lại giao dịch mới. ' : error.status === 403 ? 'Không có quyền. ' : error.status === 401 ? 'Phiên không hợp lệ hoặc đã hết hạn. ' : 'Chưa khả dụng. ';
      root.SongLamComponents.notification.set(node, prefix + error.message + (error.requestId ? ' · Mã yêu cầu: ' + error.requestId : ''), 'warning');
    }
  });
}(window));
