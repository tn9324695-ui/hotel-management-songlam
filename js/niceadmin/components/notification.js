(function (w) {
  'use strict';
  const PMS = w.PMS = w.PMS || {};
  PMS.notify = function (message, type = 'success', options = {}) {
    const colors = { success: 'success', error: 'danger', danger: 'danger', warning: 'warning', info: 'primary' };
    const color = colors[type] || 'primary';
    let region = document.getElementById('pms-notifications');
    if (!region) { region = document.createElement('div'); region.id = 'pms-notifications'; region.className = 'toast-container position-fixed top-0 end-0 p-3'; region.setAttribute('aria-live', 'polite'); document.body.append(region); }
    const toast = document.createElement('div'); toast.className = `toast border-0 text-bg-${color}`; toast.setAttribute('role', ['error', 'danger'].includes(type) ? 'alert' : 'status'); toast.setAttribute('aria-atomic', 'true');
    const flex = document.createElement('div'); flex.className = 'd-flex';
    const text = document.createElement('div'); text.className = 'toast-body'; text.textContent = String(message);
    const close = document.createElement('button'); close.type = 'button'; close.className = 'btn-close me-2 m-auto' + (color === 'warning' ? '' : ' btn-close-white'); close.setAttribute('aria-label', 'Đóng thông báo'); close.setAttribute('data-bs-dismiss', 'toast');
    flex.append(text, close); toast.append(flex); region.append(toast);
    const instance = new bootstrap.Toast(toast, { delay: options.delay ?? 4000, autohide: options.autohide ?? true });
    toast.addEventListener('hidden.bs.toast', () => { instance.dispose(); toast.remove(); }, { once: true }); instance.show(); return instance;
  };
})(window);
