(function (root) {
  'use strict';
  document.addEventListener('DOMContentLoaded', () => {
    if (document.documentElement.dataset.pmsMode !== 'api') return;
    const C = root.SongLamComponents, sidebar = document.querySelector('.ops-sidebar'), topbar = document.querySelector('.ops-topbar');
    if (!sidebar || !topbar) return;
    document.body.classList.add('sl-api-workspace');

    // 1. Identify active portal based on current URL
    const page = location.pathname.split('/').pop() || 'reception-api.html';
    let currentPortal = 'reception';
    if (['admin-api.html', 'catalog-api.html'].includes(page)) {
      currentPortal = 'management';
    } else if (['housekeeping-api.html'].includes(page)) {
      currentPortal = 'housekeeping';
    } else {
      currentPortal = 'reception';
    }
    document.body.dataset.portal = currentPortal;

    const portals = {
      management: { label: 'BAN QUẢN LÝ', badge: '👑 QUẢN LÝ', home: 'admin-api.html', title: 'PHÂN HỆ QUẢN LÝ KHÁCH SẠN' },
      reception: { label: 'BỘ PHẬN LỄ TÂN', badge: '🛎️ LỄ TÂN', home: 'reception-api.html', title: 'PHÂN HỆ BỘ PHẬN LỄ TÂN' },
      housekeeping: { label: 'BỘ PHẬN BUỒNG PHÒNG', badge: '🧹 BUỒNG PHÒNG', home: 'housekeeping-api.html', title: 'PHÂN HỆ BỘ PHẬN BUỒNG PHÒNG' }
    };
    const pCfg = portals[currentPortal];

    // 2. Custom Brand Wordmark per portal
    const oldBrand = topbar.querySelector(':scope > strong');
    if (oldBrand) {
      const brand = C.el('a', 'SL', 'sl-wordmark'), name = C.el('span', 'SÔNG LAM');
      name.append(C.el('small', pCfg.label));
      brand.href = pCfg.home;
      brand.append(name);
      oldBrand.replaceWith(brand);
    }

    // 3. Portal Indicator Badge in Topbar
    const portalBadge = C.el('span', pCfg.badge, 'badge sl-portal-badge sl-portal-badge-' + currentPortal);
    portalBadge.title = 'Phân hệ: ' + pCfg.title;
    const identityElem = topbar.querySelector('.ops-identity');
    if (identityElem) {
      topbar.insertBefore(portalBadge, identityElem);
    } else {
      topbar.append(portalBadge);
    }

    // 4. Portal Switcher Tabs in Sidebar
    const switcher = C.el('div', null, 'sl-portal-switcher');
    switcher.setAttribute('role', 'tablist');
    switcher.setAttribute('aria-label', 'Chuyển phân hệ làm việc');

    const portalTabs = [
      { id: 'management', href: 'admin-api.html', icon: '👑', label: 'Quản Lý', rights: ['viewDailyRevenue', 'systemConfig', 'viewAuditLog', 'editRoomClasses'] },
      { id: 'reception', href: 'reception-api.html', icon: '🛎️', label: 'Lễ Tân', rights: ['viewRoomRack', 'createBooking', 'manageCheckIn'] },
      { id: 'housekeeping', href: 'housekeeping-api.html', icon: '🧹', label: 'Buồng Phòng', rights: ['updateCleanStatus', 'manageHousekeepingTasks', 'reportMaintenance'] }
    ];
    for (const pt of portalTabs) {
      const tab = C.el('a', null, 'sl-portal-tab sl-portal-tab-' + pt.id + (pt.id === currentPortal ? ' active' : ''));
      tab.href = pt.href;
      tab.dataset.portal = pt.id;
      tab.dataset.rights = pt.rights.join(',');
      tab.title = 'Chuyển sang Phân hệ ' + pt.label;
      const ico = C.el('span', pt.icon, 'sl-portal-tab-icon');
      const lbl = C.el('span', pt.label, 'sl-portal-tab-label');
      tab.append(ico, lbl);
      tab.hidden = true;
      switcher.append(tab);
    }

    // 5. Navigation Links
    const links = C.el('nav', null, 'sl-workspaces');
    links.setAttribute('aria-label', 'Không gian làm việc');

    const items = [
      ['admin-api.html', '📊 Báo cáo & quản trị', ['viewDailyRevenue', 'systemConfig', 'viewAuditLog', 'collectPayment'], 'management'],
      ['catalog-api.html', '🏢 Danh mục & cấu hình', ['viewRoomRack', 'addServiceOrder', 'manageHousekeepingTasks', 'viewDailyRevenue'], 'management'],
      ['reception-api.html', '🛎️ Lễ tân & sơ đồ phòng', ['viewRoomRack', 'createBooking', 'manageCheckIn'], 'reception'],
      ['services-api.html', '🍹 Dịch vụ & minibar', ['addServiceOrder', 'manageHousekeepingTasks', 'manageCheckOut'], 'reception'],
      ['finance-api.html', '💳 Thu ngân & quyết toán', ['collectPayment', 'approveRefund', 'manageCheckOut'], 'reception'],
      ['housekeeping-api.html', '🧹 Buồng phòng & bảo trì', ['updateCleanStatus', 'manageHousekeepingTasks', 'reportMaintenance'], 'housekeeping']
    ];

    for (const [href, title, rights, pGroup] of items) {
      const a = C.el('a', title);
      a.href = href;
      a.dataset.rights = rights.join(',');
      a.dataset.portal = pGroup;
      if (pGroup === currentPortal) a.classList.add('sl-link-active-portal');
      a.hidden = true;
      links.append(a);
    }

    const portalHeaderLabel = C.el('p', 'PHÂN HỆ NGHIỆP VỤ', 'sl-portal-header-label');
    const currentSectionLabel = C.el('p', pCfg.title, 'sl-section-label');
    sidebar.prepend(portalHeaderLabel, switcher, currentSectionLabel, links, C.el('hr'));

    // 6. Topbar Status and Connection Indicators
    const status = C.el('span', 'Đang xác minh phiên', 'sl-session-state'), logout = C.el('button', 'Đăng xuất', 'btn btn-sm sl-logout');
    logout.type = 'button'; logout.disabled = true;
    topbar.append(status, logout);

    const connection = C.el('span', 'Đang kiểm tra kết nối', 'sl-session-state');
    connection.dataset.sqlConnection = 'unverified';
    topbar.append(connection);

    root.SongLamSession.client.request('/connection/status').then(response => {
      const verified = response.data.sqlConnected === true && response.data.identityVerified === true;
      connection.textContent = verified ? 'SQL đã xác minh' : 'Chưa kết nối SQL';
      connection.dataset.sqlConnection = verified ? 'verified' : 'unavailable';
      const expected = {
        'reception-api.html': 'catalogGateway',
        'catalog-api.html': 'catalogGateway',
        'housekeeping-api.html': 'operationsGateway',
        'services-api.html': 'consumptionGateway',
        'finance-api.html': 'financeGateway',
        'admin-api.html': 'managementGateway'
      };
      const module = expected[page];
      if (module && !response.data.modules?.includes(module)) {
        const main = document.querySelector('.ops-main'), notice = C.el('p', 'Chưa khả dụng: backend chưa có hợp đồng SQL đã duyệt cho màn hình này. Có thể xem các danh mục đã kết nối tại Danh mục & cấu hình. Không có dữ liệu demo thay thế.', 'alert alert-warning');
        notice.dataset.moduleUnavailable = module;
        notice.setAttribute('role', 'status');
        main?.prepend(notice);
      }
    }).catch(() => {
      connection.textContent = 'Chưa xác minh kết nối';
      connection.dataset.sqlConnection = 'unavailable';
    });

    let previousIdentity;
    const showSession = () => {
      const me = root.SongLamSession.current();
      status.textContent = me ? 'Phiên đã xác minh' : 'Chưa có phiên';
      logout.disabled = !me;

      const identityLabel = topbar.querySelector('.ops-identity');
      if (identityLabel) identityLabel.textContent = me ? (me.user.fullName || me.user.username) : 'Chưa xác thực phiên';
      for (const link of topbar.querySelectorAll('a[href="login.html"]')) link.hidden = Boolean(me);

      const identity = me ? me.user.appUserId + ':' + [...me.permissions].sort().join('|') : null;
      if (previousIdentity && identity && previousIdentity !== identity) { root.location.reload(); return; }
      if (!me && previousIdentity) {
        for (const dialog of document.querySelectorAll('dialog')) {
          if (dialog.open) dialog.close();
          dialog.querySelector('[id$="-body"]')?.replaceChildren();
        }
        for (const content of document.querySelectorAll('.ops-main tbody,.mgmt-metrics')) content.replaceChildren();
        document.getElementById('desk-results')?.replaceChildren(C.el('p', 'Phiên không còn hợp lệ. Đăng nhập lại để tải dữ liệu.', 'sl-empty'));
      }
      if (identity) previousIdentity = identity;

      // Update visibility of portal tabs based on permissions
      for (const tab of switcher.children) {
        tab.hidden = !me || !root.SongLamPermissions.any(tab.dataset.rights.split(','));
      }

      // Update visibility of workspace links based on permissions
      for (const a of links.children) {
        a.hidden = !me || !root.SongLamPermissions.any(a.dataset.rights.split(','));
        if (location.pathname.endsWith('/' + a.getAttribute('href'))) a.setAttribute('aria-current', 'page');
      }
    };

    root.addEventListener('songlam:session', showSession);
    logout.onclick = async () => {
      logout.disabled = true;
      try {
        await root.SongLamSession.logout();
      } catch (error) {
        status.textContent = 'Chưa xác nhận đăng xuất: ' + error.message;
        logout.disabled = false;
      }
    };

    const menu = document.getElementById('desk-menu') || document.getElementById('ops-menu');
    if (menu?.id === 'desk-menu') {
      menu.onclick = () => {
        sidebar.classList.toggle('open');
        menu.setAttribute('aria-expanded', String(sidebar.classList.contains('open')));
      };
    }
    const closeNav = () => {
      sidebar.classList.remove('open');
      menu?.setAttribute('aria-expanded', 'false');
      menu?.focus();
    };
    const closeButton = C.el('button', 'Đóng menu ×', 'btn btn-sm sl-nav-close');
    closeButton.type = 'button';
    closeButton.onclick = closeNav;
    sidebar.prepend(closeButton);

    const backdrop = C.el('button', null, 'sl-api-backdrop');
    backdrop.type = 'button';
    backdrop.setAttribute('aria-label', 'Đóng menu');
    backdrop.onclick = closeNav;
    document.body.append(backdrop);

    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeNav(); });
    root.SongLamSession.restore().catch(() => {});
  });
}(window));
