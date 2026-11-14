(function (root) {
  'use strict';
  const config = root.SongLamDeploymentConfig;
  let state = config && ['demo', 'frozen', 'api-readonly', 'sql'].includes(config.mode)
    ? { mode: config.mode, writable: false, legacyWritable: config.mode === 'demo', operations: [], deploymentId: null }
    : { mode: 'frozen', writable: false, legacyWritable: false, operations: [], deploymentId: null };
  let verifiedAt = config?.managed === true ? Date.now() : 0;
  const managed = config?.managed === true;
  const legacyAllowed = () => state.mode === 'demo' && state.legacyWritable === true
    && (!managed || Date.now() - verifiedAt < 15000);
  function render() {
    const node = document.getElementById('pms-deployment-banner');
    if (!node) return;
    node.replaceChildren();
    const text = state.mode === 'demo' ? (document.documentElement.dataset.pmsMode === 'api' ? 'Màn hình API · Chưa bật nguồn ghi. Không dùng dữ liệu demo thay thế.' : 'Chế độ demo · Dữ liệu lưu trên trình duyệt, chưa đồng bộ máy chủ.')
      : state.writable ? (state.testOnly ? 'SQL chạy thử · Chỉ mở thao tác trong hồ sơ đã xác minh; chưa cắt chuyển vận hành.' : 'Nguồn ghi API — chỉ mở các chức năng backend đã cho phép.')
      : 'Đang khóa ghi / chỉ đọc. Chức năng chưa nghiệm thu không được ghi dữ liệu; không dùng localStorage thay thế.';
    node.append(document.createTextNode(text + ' '));
    const link = document.createElement('a'); link.href = 'operations-status.html'; link.textContent = 'Trạng thái kết nối'; node.append(link);
    try { if (root.SongLamWrites?.pending().length) node.prepend(document.createTextNode('CÓ YÊU CẦU CHƯA ĐỐI CHIẾU — KHÔNG TẠO GIAO DỊCH MỚI. ')); } catch { node.prepend(document.createTextNode('Không xác minh được nhật ký yêu cầu của tab. ')); }
    // UI hints only; backend gate + G2 permissions remain authoritative.
    if (document.documentElement.dataset.pmsMode === 'api') {
      for (const form of document.querySelectorAll('dialog form')) {
        // Input/read-only forms do not submit business commands themselves.
        // Their command buttons are gated separately; HTTP and backend always
        // independently guard actual writes, regardless of this UI hint.
        if (form.dataset.pmsReadOnly === 'true') continue;
        if (state.writable && state.operations.some(o => o.operation === form.dataset.pmsOperation)) continue;
        form.setAttribute('aria-label', 'Chỉ đọc — thao tác chưa được nghiệm thu hoặc nguồn ghi đang khóa');
        for (const control of form.querySelectorAll('input,select,textarea,button[type=submit]')) control.disabled = true;
      }
    }
  }
  async function refresh() {
    if (!managed) return state;
    let timer;
    const controller = new AbortController();
    try {
      timer = setTimeout(() => controller.abort(), 5000);
      const response = await root.fetch('/api/v1/deployment', { cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: controller.signal });
      const payload = await response.json();
      if (!response.ok || !payload.data || !['demo', 'frozen', 'api-readonly', 'sql'].includes(payload.data.mode) || !Array.isArray(payload.data.operations)) throw new Error();
      state = Object.freeze(payload.data); verifiedAt = Date.now();
    } catch { state = Object.freeze({ ...state, writable: false, legacyWritable: false }); verifiedAt = 0; }
    finally { clearTimeout(timer); render(); }
    return state;
  }
  root.SongLamDeployment = Object.freeze({ refresh, snapshot: () => state, isLegacyWritable: legacyAllowed,
    assertLegacy() { if (!legacyAllowed() && state.mode !== 'sql') throw new Error('Nguồn ghi localStorage đã khóa hoặc chưa xác minh. Không thực hiện thao tác; liên hệ người phụ trách cắt chuyển.'); } });
  const mount = () => {
    const banner = document.createElement('div'); banner.id = 'pms-deployment-banner'; banner.setAttribute('role', 'status');
    banner.className = 'pms-deployment-banner';
    document.body.prepend(banner); render();
    root.addEventListener('pms-pending-change', render);
    for (const dialog of document.querySelectorAll('dialog')) new MutationObserver(render).observe(dialog, { childList: true, subtree: true });
    if (managed) { refresh(); root.setInterval(refresh, 5000); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
}(globalThis));
