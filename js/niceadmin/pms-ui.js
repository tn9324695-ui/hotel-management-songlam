(function (w) {
  'use strict';
  const PMS = w.PMS = w.PMS || {};
  PMS.formatVND = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(value) || 0);
  PMS.formatDate = value => {
    if (!value) return '—';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T00:00:00') : new Date(value);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('vi-VN');
  };
  PMS.badge = (label, variant = 'secondary') => {
    const el = document.createElement('span'); el.className = 'badge rounded-pill pms-badge text-bg-' + (['success', 'warning', 'danger', 'primary', 'secondary', 'info'].includes(variant) ? variant : 'secondary'); el.textContent = label; return el;
  };
  PMS.init = function (root = document) {
    root.querySelectorAll('[data-pms-sidebar-toggle]').forEach(b => {
      if (b.dataset.pmsBound) return; b.dataset.pmsBound = 'true';
      b.addEventListener('click', () => { const opened = document.body.classList.toggle('pms-sidebar-open'); b.setAttribute('aria-expanded', String(opened)); });
    });
  };
  // PMS APIs do not replace hotel.js/main.js or their existing global helpers.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => PMS.init()); else PMS.init();
})(window);
