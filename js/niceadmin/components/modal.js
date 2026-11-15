(function (w) {
  'use strict';
  const PMS = w.PMS = w.PMS || {}; let sequence = 0;
  PMS.Modal = {
    open({ title = 'Thông tin', content = '', confirmText = 'Lưu', onConfirm, size = '' } = {}) {
      const previous = document.activeElement;
      const el = document.createElement('div'); el.className = 'modal fade'; el.tabIndex = -1;
      const id = `pms-modal-${++sequence}`; el.setAttribute('aria-labelledby', id);
      el.innerHTML = '<div class="modal-dialog modal-dialog-centered"><div class="modal-content"><div class="modal-header"><h2 class="modal-title fs-5"></h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button></div><div class="modal-body"></div><div class="modal-footer"><span class="pms-modal-error text-danger small me-auto" role="alert"></span><button type="button" class="btn btn-light" data-bs-dismiss="modal">Đóng</button><button type="button" class="btn btn-primary pms-confirm"></button></div></div></div>';
      if (['sm', 'lg', 'xl'].includes(size)) el.querySelector('.modal-dialog').classList.add(`modal-${size}`);
      const heading = el.querySelector('.modal-title'); heading.id = id; heading.textContent = title;
      const body = el.querySelector('.modal-body'); if (content instanceof Node) body.append(content); else body.textContent = String(content);
      const button = el.querySelector('.pms-confirm'); button.textContent = confirmText; button.hidden = !onConfirm;
      document.body.append(el); const instance = new bootstrap.Modal(el); let busy = false;
      el.addEventListener('hide.bs.modal', e => { if (busy) e.preventDefault(); });
      button.onclick = async () => {
        if (busy) return;
        const form = body.querySelector('form'); if (form && !form.reportValidity()) return;
        busy = true; button.disabled = true; el.querySelector('.pms-modal-error').textContent = '';
        try { const result = await onConfirm({ element: el, form }); busy = false; if (result !== false) instance.hide(); }
        catch (e) { el.querySelector('.pms-modal-error').textContent = e.message || 'Không thể lưu. Vui lòng thử lại.'; }
        finally { busy = false; button.disabled = false; }
      };
      el.addEventListener('hidden.bs.modal', () => { instance.dispose(); el.remove(); if (previous?.isConnected) previous.focus(); }, { once: true });
      instance.show(); return { element: el, instance };
    },
    confirm({ title = 'Xác nhận thao tác', message = 'Anh/chị có chắc muốn tiếp tục?', confirmText = 'Xác nhận' } = {}) {
      return new Promise(resolve => {
        let accepted = false;
        const modal = PMS.Modal.open({ title, content: message, confirmText, onConfirm: () => { accepted = true; } });
        modal.element.addEventListener('hidden.bs.modal', () => resolve(accepted), { once: true });
      });
    }
  };
})(window);
