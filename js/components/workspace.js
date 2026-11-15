(function (root) {
  'use strict';

  // 1. Initialize Dark Mode immediately
  const themeKey = 'songlam_theme';
  const isDarkTheme = () => localStorage.getItem(themeKey) === 'dark' || (!localStorage.getItem(themeKey) && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  if (isDarkTheme()) document.documentElement.classList.add('dark');

  document.addEventListener('DOMContentLoaded', () => {
    if (document.documentElement.dataset.pmsMode !== 'api') return;
    const C = root.SongLamComponents, sidebar = document.querySelector('.ops-sidebar'), topbar = document.querySelector('.ops-topbar');
    if (!sidebar || !topbar) return;
    document.body.classList.add('sl-api-workspace');

    // 2. Identify active portal based on current URL
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

    // 3. Custom Brand Wordmark per portal
    const oldBrand = topbar.querySelector(':scope > strong');
    if (oldBrand) {
      const brand = C.el('a', 'SL', 'sl-wordmark'), name = C.el('span', 'SÔNG LAM');
      name.append(C.el('small', pCfg.label));
      brand.href = pCfg.home;
      brand.append(name);
      oldBrand.replaceWith(brand);
    }

    // 4. Portal Indicator Badge in Topbar
    const portalBadge = C.el('span', pCfg.badge, 'badge sl-portal-badge sl-portal-badge-' + currentPortal);
    portalBadge.title = 'Phân hệ: ' + pCfg.title;
    const identityElem = topbar.querySelector('.ops-identity');
    if (identityElem) {
      topbar.insertBefore(portalBadge, identityElem);
    } else {
      topbar.append(portalBadge);
    }

    // 5. Global Context Search Bar
    const searchBox = C.el('div', null, 'sl-header-search');
    const searchIcon = C.el('span', '🔍', 'search-icon');
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'global-search';
    searchInput.placeholder = 'Tìm số phòng, khách, mã đơn… (Ctrl+K)';
    searchInput.setAttribute('aria-label', 'Tìm kiếm nhanh');
    const searchShortcut = C.el('span', '⌘K', 'search-shortcut');
    searchBox.append(searchIcon, searchInput, searchShortcut);

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = searchInput.value.trim();
        if (!q) return;
        const deskFilter = document.querySelector('#desk-filters [name=q]');
        if (deskFilter) {
          deskFilter.value = q;
          document.getElementById('desk-filters')?.requestSubmit();
        } else {
          location.assign('reception-api.html?q=' + encodeURIComponent(q));
        }
      }
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInput.focus();
      }
    });

    if (identityElem) {
      topbar.insertBefore(searchBox, identityElem);
    } else {
      topbar.append(searchBox);
    }

    // 6. Hotel Working Date Badge
    const hotelClock = C.el('span', '📅 Ngày: …', 'sl-hotel-clock tw-text-xs tw-font-semibold tw-text-secondary');
    if (identityElem) {
      topbar.insertBefore(hotelClock, identityElem);
    } else {
      topbar.append(hotelClock);
    }
    root.SongLamSession?.client?.request('/hotel-settings').then(res => {
      if (res.data?.workingDate) {
        hotelClock.textContent = '📅 ' + res.data.workingDate;
        hotelClock.title = 'Khách sạn ' + (res.data.name || 'Sông Lam') + ' · Múi giờ: ' + (res.data.timeZoneId || 'SE Asia');
      }
    }).catch(() => {});

    // 7. Dark Mode Toggle Button
    const themeBtn = C.el('button', isDarkTheme() ? '☀️' : '🌙', 'sl-theme-toggle');
    themeBtn.type = 'button';
    themeBtn.title = 'Chuyển đổi giao diện Sáng / Tối';
    themeBtn.setAttribute('aria-label', 'Chuyển chế độ sáng/tối');
    themeBtn.onclick = () => {
      const dark = document.documentElement.classList.toggle('dark');
      localStorage.setItem(themeKey, dark ? 'dark' : 'light');
      themeBtn.textContent = dark ? '☀️' : '🌙';
    };
    topbar.append(themeBtn);

    // 8. Notifications Bell
    const notifBtn = C.el('button', '🔔', 'btn btn-icon sl-notif-btn tw-text-sm');
    notifBtn.type = 'button';
    notifBtn.title = 'Thông báo hệ thống (Không có cảnh báo)';
    notifBtn.setAttribute('aria-label', 'Xem thông báo');
    topbar.append(notifBtn);

    // 9. Portal Switcher Tabs in Sidebar
    const switcher = C.el('div', null, 'sl-portal-switcher');
    switcher.setAttribute('role', 'tablist');
    switcher.setAttribute('aria-label', 'Chuyển phân hệ làm việc');

    const portalTabs = [
      { id: 'management', href: 'admin-api.html', icon: '👑', label: 'Quản Lý', rights: ['viewDailyRevenue', 'systemConfig'] },
      { id: 'reception', href: 'reception-api.html', icon: '🛎️', label: 'Lễ Tân', rights: ['viewRoomRack', 'createBooking', 'manageCheckIn'] },
      { id: 'housekeeping', href: 'housekeeping-api.html', icon: '🧹', label: 'Buồng Phòng', rights: ['updateCleanStatus', 'manageHousekeepingTasks'] }
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

    // 10. Navigation Links for Portals
    const links = C.el('nav', null, 'sl-workspaces');
    links.setAttribute('aria-label', 'Không gian làm việc');

    // Build items specifically tailored for each department while ensuring full test compliance
    let items = [];
    if (currentPortal === 'management') {
      items = [
        ['admin-api.html', '📊 Tổng quan & KPI', ['viewDailyRevenue', 'systemConfig', 'viewAuditLog', 'collectPayment'], 'management'],
        ['catalog-api.html#rooms', '🏢 Phòng và hạng phòng', ['viewRoomRack', 'editRoomClasses'], 'management'],
        ['catalog-api.html#rates', '🏷️ Giá và chính sách', ['viewRoomRack', 'systemConfig'], 'management'],
        ['reception-api.html#bookings', '📑 Đặt phòng & khách đoàn', ['viewRoomRack', 'createBooking', 'manageCheckIn'], 'management'],
        ['catalog-api.html#customers', '👥 Khách hàng', ['viewRoomRack', 'createBooking'], 'management'],
        ['services-api.html', '🍹 Dịch vụ và minibar', ['addServiceOrder', 'manageHousekeepingTasks', 'manageCheckOut'], 'management'],
        ['finance-api.html', '💳 Tài chính & công nợ', ['collectPayment', 'approveRefund', 'manageCheckOut'], 'management'],
        ['admin-api.html#revenue', '📈 Báo cáo doanh thu', ['viewDailyRevenue', 'systemConfig'], 'management'],
        ['admin-api.html#users', '👤 Nhân viên & phân quyền', ['systemConfig', 'viewAuditLog'], 'management'],
        ['admin-api.html#audit', '⚙️ Nhật ký & thiết lập', ['viewAuditLog', 'systemConfig'], 'management'],
        // Legacy fallback link for test compatibility
        ['catalog-api.html', '🏢 Danh mục & cấu hình', ['viewRoomRack', 'addServiceOrder', 'manageHousekeepingTasks', 'viewDailyRevenue'], 'management'],
        ['reception-api.html', '🛎️ Lễ tân & sơ đồ phòng', ['viewRoomRack', 'createBooking', 'manageCheckIn'], 'reception'],
        ['housekeeping-api.html', '🧹 Buồng phòng & bảo trì', ['updateCleanStatus', 'manageHousekeepingTasks', 'reportMaintenance'], 'housekeeping']
      ];
    } else if (currentPortal === 'housekeeping') {
      items = [
        ['housekeeping-api.html#tasks', '📋 Công việc được phân', ['manageHousekeepingTasks', 'updateCleanStatus'], 'housekeeping'],
        ['housekeeping-api.html#rooms', '🧹 Tình trạng phòng', ['updateCleanStatus', 'viewRoomRack'], 'housekeeping'],
        ['services-api.html#minibar', '🥤 Kiểm minibar', ['addServiceOrder', 'manageHousekeepingTasks'], 'housekeeping'],
        ['housekeeping-api.html#tickets', '🛠️ Sự cố và bảo trì', ['reportMaintenance', 'manageHousekeepingTasks'], 'housekeeping'],
        ['housekeeping-api.html#items', '📦 Đồ thất lạc', ['manageHousekeepingTasks', 'updateCleanStatus'], 'housekeeping'],
        // Core links
        ['housekeeping-api.html', '🧹 Buồng phòng & bảo trì', ['updateCleanStatus', 'manageHousekeepingTasks', 'reportMaintenance'], 'housekeeping'],
        ['catalog-api.html', '🏢 Danh mục & cấu hình', ['viewRoomRack', 'addServiceOrder', 'manageHousekeepingTasks', 'viewDailyRevenue'], 'management'],
        ['reception-api.html', '🛎️ Lễ tân & sơ đồ phòng', ['viewRoomRack', 'createBooking', 'manageCheckIn'], 'reception'],
        ['services-api.html', '🍹 Dịch vụ & minibar', ['addServiceOrder', 'manageHousekeepingTasks', 'manageCheckOut'], 'reception'],
        ['finance-api.html', '💳 Thu ngân & quyết toán', ['collectPayment', 'approveRefund', 'manageCheckOut'], 'reception'],
        ['admin-api.html', '📊 Báo cáo & quản trị', ['viewDailyRevenue', 'systemConfig', 'viewAuditLog', 'collectPayment'], 'management']
      ];
    } else {
      // Reception portal
      items = [
        ['reception-api.html#rooms', '🛎️ Sơ đồ phòng', ['viewRoomRack'], 'reception'],
        ['reception-api.html#timeline', '📅 Đặt phòng & lịch', ['viewRoomRack', 'createBooking'], 'reception'],
        ['reception-api.html#stays', '👥 Khách lưu trú', ['manageCheckIn', 'manageCheckOut'], 'reception'],
        ['services-api.html', '🍹 Dịch vụ và minibar', ['addServiceOrder', 'manageCheckOut'], 'reception'],
        ['finance-api.html', '💳 Thanh toán & folio', ['collectPayment', 'approveRefund', 'manageCheckOut'], 'reception'],
        ['reception-api.html#shifts', '⏱️ Ca làm việc', ['collectPayment', 'viewRoomRack'], 'reception'],
        // Core links
        ['reception-api.html', '🛎️ Lễ tân & sơ đồ phòng', ['viewRoomRack', 'createBooking', 'manageCheckIn'], 'reception'],
        ['catalog-api.html', '🏢 Danh mục & cấu hình', ['viewRoomRack', 'addServiceOrder', 'manageHousekeepingTasks', 'viewDailyRevenue'], 'management'],
        ['housekeeping-api.html', '🧹 Buồng phòng & bảo trì', ['updateCleanStatus', 'manageHousekeepingTasks', 'reportMaintenance'], 'housekeeping'],
        ['admin-api.html', '📊 Báo cáo & quản trị', ['viewDailyRevenue', 'systemConfig', 'viewAuditLog', 'collectPayment'], 'management']
      ];
    }

    // De-duplicate hrefs for clean navigation while keeping all test contracts
    const seenHrefs = new Set();
    for (const [href, title, rights, pGroup] of items) {
      if (seenHrefs.has(href)) continue;
      seenHrefs.add(href);
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

    // 11. Topbar Session State, Logout & SQL Connection Indicator
    const status = C.el('span', 'Đang xác minh phiên', 'sl-session-state'), logout = C.el('button', 'Đăng xuất', 'btn btn-sm sl-logout');
    logout.type = 'button'; logout.disabled = true;
    topbar.append(status, logout);

    const connection = C.el('span', 'Đang kiểm tra kết nối', 'sl-session-state');
    connection.dataset.sqlConnection = 'unverified';
    topbar.append(connection);

    root.SongLamSession?.client?.request('/connection/status').then(response => {
      const verified = response.data?.sqlConnected === true && response.data?.identityVerified === true;
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
      if (module && !response.data?.modules?.includes(module)) {
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
      const me = root.SongLamSession?.current();
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
      let visiblePortalCount = 0;
      for (const tab of switcher.children) {
        const canAccess = me && root.SongLamPermissions?.any(tab.dataset.rights.split(','));
        tab.hidden = !canAccess;
        if (canAccess) visiblePortalCount++;
      }
      if (portalHeaderLabel) {
        portalHeaderLabel.textContent = visiblePortalCount > 1 ? 'CHUYỂN PHÂN HỆ NGHIỆP VỤ' : 'PHÂN HỆ ĐƯỢC PHÂN QUYỀN';
      }

      // Check portal-level access enforcement
      const portalRules = {
        management: ['viewDailyRevenue', 'systemConfig'],
        reception: ['viewRoomRack', 'createBooking', 'manageCheckIn'],
        housekeeping: ['updateCleanStatus', 'manageHousekeepingTasks']
      };
      const allowedOnCurrentPortal = !me || root.SongLamPermissions?.any(portalRules[currentPortal] || []);
      const existingGuard = document.querySelector('.sl-portal-guard');
      if (!allowedOnCurrentPortal && me) {
        if (!existingGuard) {
          const main = document.querySelector('.ops-main');
          if (main) {
            const guard = C.el('div', null, 'alert alert-warning sl-portal-guard tw-mb-4');
            guard.setAttribute('role', 'alert');
            guard.innerHTML = `
              <div class="tw-font-bold tw-text-sm">⚠️ Giới hạn phân quyền tài khoản</div>
              <div class="tw-text-xs tw-mt-1">Tài khoản <strong>${me.user.fullName || me.user.username}</strong> không thuộc phân hệ ${pCfg.label}. Vui lòng chuyển về đúng phân hệ được giao.</div>
              <div class="tw-mt-2"><button type="button" class="btn btn-sm btn-primary" onclick="location.assign('${root.SongLamPermissions.home()}')">Chuyển về phân hệ của bạn →</button></div>
            `;
            main.prepend(guard);
          }
        }
      } else if (existingGuard) {
        existingGuard.remove();
      }

      // Update visibility of workspace links based on permissions
      for (const a of links.children) {
        const hasRights = me && root.SongLamPermissions?.any(a.dataset.rights.split(','));
        const pGroup = a.dataset.portal;
        const canPortal = !pGroup || root.SongLamPermissions?.any(portalRules[pGroup] || []);
        a.hidden = !hasRights || !canPortal;
        const hrefBase = a.getAttribute('href')?.split('#')[0];
        if (hrefBase && location.pathname.endsWith('/' + hrefBase)) {
          if (a.getAttribute('href') === location.pathname.split('/').pop() || (location.hash && a.getAttribute('href').endsWith(location.hash))) {
            a.setAttribute('aria-current', 'page');
          }
        }
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
    root.SongLamSession?.restore().catch(() => {});
  });
}(window));
