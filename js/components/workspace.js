(function (root) {
  'use strict';
  document.addEventListener('DOMContentLoaded', () => {
    if (document.documentElement.dataset.pmsMode !== 'api') return;
    const C = root.SongLamComponents, sidebar = document.querySelector('.ops-sidebar'), topbar = document.querySelector('.ops-topbar');
    if (!sidebar || !topbar) return;
    document.body.classList.add('sl-api-workspace');
    const oldBrand=topbar.querySelector(':scope > strong');
    if(oldBrand){const brand=C.el('a','SL','sl-wordmark'),name=C.el('span','SÔNG LAM');name.append(C.el('small','QUẢN LÝ KHÁCH SẠN'));brand.href='reception-api.html';brand.append(name);oldBrand.replaceWith(brand);}
    const links = C.el('nav', null, 'sl-workspaces'); links.setAttribute('aria-label', 'Không gian làm việc');
    const items = [ ['catalog-api.html', 'Danh mục & cấu hình', ['viewRoomRack','addServiceOrder','manageHousekeepingTasks','viewDailyRevenue']], ['reception-api.html', 'Lễ tân & đặt phòng', ['viewRoomRack', 'createBooking', 'manageCheckIn']], ['housekeeping-api.html', 'Buồng phòng & bảo trì', ['updateCleanStatus', 'manageHousekeepingTasks', 'reportMaintenance']],
      ['services-api.html', 'Dịch vụ & minibar', ['addServiceOrder', 'manageHousekeepingTasks', 'manageCheckOut']], ['finance-api.html', 'Thu ngân & quyết toán', ['collectPayment', 'approveRefund', 'manageCheckOut']], ['admin-api.html', 'Báo cáo & quản trị', ['viewDailyRevenue', 'systemConfig', 'viewAuditLog', 'collectPayment']] ];
    for (const [href, title, rights] of items) { const a = C.el('a', title); a.href = href; a.dataset.rights = rights.join(','); a.hidden = true; links.append(a); }
    sidebar.prepend(C.el('p', 'KHÔNG GIAN LÀM VIỆC', 'sl-section-label'), links, C.el('hr'));
    const status = C.el('span', 'Đang xác minh phiên', 'sl-session-state'), logout = C.el('button', 'Đăng xuất', 'btn btn-sm sl-logout'); logout.type = 'button'; logout.disabled = true; topbar.append(status, logout);
    const connection=C.el('span','Đang kiểm tra kết nối','sl-session-state');connection.dataset.sqlConnection='unverified';topbar.append(connection);
    root.SongLamSession.client.request('/connection/status').then(response=>{
      const verified=response.data.sqlConnected===true&&response.data.identityVerified===true;
      connection.textContent=verified?'SQL đã xác minh':'Chưa kết nối SQL';connection.dataset.sqlConnection=verified?'verified':'unavailable';
      const expected={'reception-api.html':'catalogGateway','catalog-api.html':'catalogGateway','housekeeping-api.html':'operationsGateway','services-api.html':'consumptionGateway','finance-api.html':'financeGateway','admin-api.html':'managementGateway'};
      const page=location.pathname.split('/').pop(),module=expected[page];
      if(module&&!response.data.modules?.includes(module)){
        const main=document.querySelector('.ops-main'),notice=C.el('p','Chưa khả dụng: backend chưa có hợp đồng SQL đã duyệt cho màn hình này. Có thể xem các danh mục đã kết nối tại Danh mục & cấu hình. Không có dữ liệu demo thay thế.','alert alert-warning');
        notice.dataset.moduleUnavailable=module;notice.setAttribute('role','status');main?.prepend(notice);
      }
    }).catch(()=>{connection.textContent='Chưa xác minh kết nối';connection.dataset.sqlConnection='unavailable';});
    let previousIdentity;
    const showSession = () => {
      const me = root.SongLamSession.current(); status.textContent = me ? 'Phiên đã xác minh' : 'Chưa có phiên'; logout.disabled = !me;
      const identityLabel = topbar.querySelector('.ops-identity');
      if (identityLabel) identityLabel.textContent = me ? (me.user.fullName || me.user.username) : 'Chưa xác thực phiên';
      for (const link of topbar.querySelectorAll('a[href="login.html"]')) link.hidden = Boolean(me);
      const identity = me ? me.user.appUserId + ':' + [...me.permissions].sort().join('|') : null;
      if (previousIdentity && identity && previousIdentity !== identity) { root.location.reload(); return; }
      if (!me && previousIdentity) {
        for (const dialog of document.querySelectorAll('dialog')) { if(dialog.open)dialog.close(); dialog.querySelector('[id$="-body"]')?.replaceChildren(); }
        for (const content of document.querySelectorAll('.ops-main tbody,.mgmt-metrics')) content.replaceChildren();
        document.getElementById('desk-results')?.replaceChildren(C.el('p','Phiên không còn hợp lệ. Đăng nhập lại để tải dữ liệu.','sl-empty'));
      }
      if (identity) previousIdentity = identity;
      for (const a of links.children) { a.hidden = !me || !root.SongLamPermissions.any(a.dataset.rights.split(',')); if (location.pathname.endsWith('/' + a.getAttribute('href'))) a.setAttribute('aria-current', 'page'); }
    };
    root.addEventListener('songlam:session', showSession);
    logout.onclick = async () => { logout.disabled = true; try { await root.SongLamSession.logout(); } catch (error) { status.textContent = 'Chưa xác nhận đăng xuất: ' + error.message; logout.disabled = false; } };
    const menu = document.getElementById('desk-menu') || document.getElementById('ops-menu');
    if (menu?.id === 'desk-menu') menu.onclick = () => { sidebar.classList.toggle('open'); menu.setAttribute('aria-expanded', String(sidebar.classList.contains('open'))); };
    const closeNav=()=>{sidebar.classList.remove('open');menu?.setAttribute('aria-expanded','false');menu?.focus();};
    const closeButton=C.el('button','Đóng menu ×','btn btn-sm sl-nav-close');closeButton.type='button';closeButton.onclick=closeNav;sidebar.prepend(closeButton);
    const backdrop=C.el('button',null,'sl-api-backdrop');backdrop.type='button';backdrop.setAttribute('aria-label','Đóng menu');backdrop.onclick=closeNav;document.body.append(backdrop);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeNav(); });
    root.SongLamSession.restore().catch(() => {});
  });
}(window));
