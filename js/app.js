/**
 * HỆ THỐNG QUẢN LÝ KHÁCH SẠN SÔNG LAM - MAIN APPLICATION LOGIC
 * Phân tích và thiết kế hệ thống quản lý khách sạn - Mường Thanh Luxury Sông Lam
 * Giao diện tổng: Quản lý & Thu ngân / Kế toán & Quản trị hệ thống
 * Demo dùng SongLamStore; chế độ API quản trị đọc backend và thoát trước controller demo.
 */

(function () {
  'use strict';

  if (document.documentElement.dataset.pmsMode === 'api') {
    const mount = () => window.SongLamAdminPage.mount();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
    return;
  }

  const store = window.SongLamStore;

  // Application State
  const state = {
    timelineStart: null,
    timelineDays: 14,
    timelineFilters: { floor: 'all', classCode: 'all', search: '' },
    currentPortal: 'general',
    currentScreen: 'overview',
    currentRole: 'manager',
    currentUser: {
      id: 'NV-01',
      username: 'hoang.manager',
      fullName: 'Nguyễn Văn Hoàng',
      roleCode: 'manager',
      roleName: 'Quản lý khách sạn'
    },
    selectedRoomId: null,
    sidebarCollapsed: false,
    filters: {
      roomRack: {
        floor: 'all',
        roomClass: 'all',
        stayStatus: 'all',
        cleanStatus: 'all',
        exploitationStatus: 'all',
        search: ''
      },
      bookings: {
        status: 'all',
        search: ''
      },
      housekeeping: {
        status: 'all',
        taskType: 'all'
      }
    },
    adminSubTab: 'roles',
    reportTimeFilter: 'daily'
  };

  // Matrix Phân quyền RBAC
  const PERMISSION_GROUPS = [
    {
      groupName: "1. Tiền sảnh & Sơ đồ phòng",
      icon: "layout-grid",
      permissions: [
        { key: "viewRoomRack", name: "Xem Sơ đồ phòng (Room Rack)", desc: "Xem trạng thái buồng phòng, tầng và chi tiết khách đang ở" },
        { key: "manageCheckIn", name: "Thực hiện Nhận phòng (Check-in)", desc: "Check-in khách lẻ Walk-in và khách đặt phòng trước" },
        { key: "manageCheckOut", name: "Thực hiện Trả phòng (Check-out)", desc: "Lập bảng quyết toán Folio phòng và hoàn tất check-out" },
        { key: "manageRoomTransfer", name: "Đổi phòng & Gia hạn lưu trú", desc: "Chuyển khách sang phòng khác hoặc gia hạn ngày đi" }
      ]
    },
    {
      groupName: "2. Quản lý Đặt phòng (Reservations)",
      icon: "calendar",
      permissions: [
        { key: "createBooking", name: "Tạo và sửa Đặt phòng", desc: "Tiếp nhận đơn đặt phòng mới, giữ phòng cho khách" },
        { key: "cancelBooking", name: "Hủy đơn đặt phòng", desc: "Hủy phòng và áp dụng chính sách giải phóng quỹ" }
      ]
    },
    {
      groupName: "3. Dịch vụ & Minibar",
      icon: "coffee",
      permissions: [
        { key: "addServiceOrder", name: "Thêm dịch vụ vào Folio phòng", desc: "Gọi món nhà hàng, đồ uống minibar, giặt là, spa vào phòng" },
        { key: "cancelServiceOrder", name: "Hủy / Điều chỉnh dịch vụ", desc: "Xóa hoặc điều chỉnh khoản chi tiêu dịch vụ sai sót" }
      ]
    },
    {
      groupName: "4. Buồng phòng & Bảo trì",
      icon: "spray-can",
      permissions: [
        { key: "updateCleanStatus", name: "Cập nhật trạng thái Vệ sinh", desc: "Chuyển trạng thái: Sạch, Chờ dọn, Đang dọn, Chờ kiểm tra" },
        { key: "manageHousekeepingTasks", name: "Phân công việc buồng phòng", desc: "Giao việc dọn phòng và duyệt kết quả kiểm phòng" },
        { key: "reportMaintenance", name: "Báo sự cố & Khóa bảo trì phòng", desc: "Lập ticket sự cố kỹ thuật và tạm khóa phòng" }
      ]
    },
    {
      groupName: "5. Tài chính, Thu ngân & Hóa đơn",
      icon: "receipt",
      permissions: [
        { key: "collectPayment", name: "Ghi nhận thanh toán & Thu tiền", desc: "Thu tiền mặt, xác nhận chuyển khoản và đối trừ cọc" },
        { key: "approveRefund", name: "Phê duyệt Hoàn tiền (Refund)", desc: "Duyệt đề nghị hoàn tiền cọc hoặc tiền thừa cho khách" },
        { key: "printVatInvoice", name: "Lập & In phiếu thanh toán minh họa", desc: "In bảng kê chi phí lưu trú tạm tính hoặc quyết toán" }
      ]
    },
    {
      groupName: "6. Báo cáo & Doanh thu",
      icon: "bar-chart-2",
      permissions: [
        { key: "viewDailyRevenue", name: "Xem Báo cáo Doanh thu tổng", desc: "Xem thẻ doanh thu ngày, doanh thu thực thu và biểu đồ doanh thu" },
        { key: "exportReports", name: "Xuất báo cáo Excel / CSV", desc: "Kết xuất file dữ liệu kế toán và thống kê công suất" }
      ]
    },
    {
      groupName: "7. Quản trị hệ thống & Cấu hình",
      icon: "settings",
      permissions: [
        { key: "editRoomClasses", name: "Quản lý Hạng phòng & Bảng giá", desc: "Thêm, sửa hạng phòng, cấu hình giá bán và chính sách" },
        { key: "systemConfig", name: "Quản trị Tài khoản & Phân quyền", desc: "Tạo tài khoản người dùng, phân quyền RBAC và cấu hình hệ thống" },
        { key: "viewAuditLog", name: "Tra cứu Nhật ký thao tác (Audit)", desc: "Xem lịch sử thay đổi dữ liệu, IP và hành động của nhân viên" }
      ]
    }
  ];

  // Helper Formatter Functions
  const fmt = {
    currency: function (num) {
      if (num === null || num === undefined) return '0 VNĐ';
      return new Intl.NumberFormat('vi-VN').format(num) + ' VNĐ';
    },
    date: function (dateStr) {
      if (!dateStr) return '';
      if (dateStr.includes(' ')) {
        const [d, t] = dateStr.split(' ');
        const [year, month, day] = d.split('-');
        return `${day}/${month}/${year} ${t}`;
      }
      const [year, month, day] = dateStr.split('-');
      return `${day}/${month}/${year}`;
    },
    cleanStatusText: function (status) {
      switch (status) {
        case 'clean': return { text: 'Sạch', badgeClass: 'badge-clean', icon: 'check-circle' };
        case 'dirty': return { text: 'Chờ dọn', badgeClass: 'badge-dirty', icon: 'alert-circle' };
        case 'cleaning': return { text: 'Đang dọn', badgeClass: 'badge-cleaning', icon: 'refresh-cw' };
        case 'inspecting': return { text: 'Chờ KT', badgeClass: 'badge-inspecting', icon: 'eye' };
        default: return { text: status, badgeClass: 'badge-vacant', icon: 'help-circle' };
      }
    },
    stayStatusText: function (status) {
      switch (status) {
        case 'vacant': return { text: 'Trống', badgeClass: 'badge-vacant' };
        case 'occupied': return { text: 'Có khách', badgeClass: 'badge-occupied' };
        default: return { text: status, badgeClass: 'badge-vacant' };
      }
    },
    exploitationStatusText: function (status) {
      switch (status) {
        case 'active': return { text: 'Hoạt động', badgeClass: 'badge-active' };
        case 'maintenance': return { text: 'Bảo trì', badgeClass: 'badge-maintenance' };
        case 'inactive': return { text: 'Tạm ngưng', badgeClass: 'badge-maintenance' };
        default: return { text: status, badgeClass: '' };
      }
    }
  };

  function escapeHtml(str) {
    if (store && typeof store.escapeHtml === 'function') {
      return store.escapeHtml(str);
    }
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function hasPermission(permKey) {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const role = (data.roles || []).find(r => r.code === state.currentRole);
    if (!role) return false;
    return !!(role.permissions && role.permissions[permKey]);
  }

  function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    let iconName = type === 'danger' ? 'alert-triangle' : (type === 'info' ? 'info' : (type === 'warning' ? 'alert-circle' : 'check-circle'));
    toast.innerHTML = `
      <i data-lucide="${iconName}" style="width: 18px; height: 18px; flex-shrink: 0;"></i>
      <div style="flex: 1; font-size: 13px;">${escapeHtml(message)}</div>
    `;
    container.appendChild(toast);
    if (window.lucide) lucide.createIcons({ root: toast });
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function updateTopbarInfo() {
    const wDateEl = document.getElementById('topbarWorkingDateText');
    if (wDateEl && store) {
      wDateEl.textContent = fmt.date(store.getWorkingDate());
    }
    const nameEl = document.getElementById('topbarUserName');
    const roleEl = document.getElementById('topbarRoleText');
    if (window._sqlCurrentUser) {
      if (nameEl) nameEl.textContent = window._sqlCurrentUser.fullName || window._sqlCurrentUser.username;
      if (roleEl) roleEl.textContent = 'Nhân viên SQL (' + (window._sqlCurrentUser.roleCode || 'Staff') + ')';
    } else {
      if (nameEl) nameEl.textContent = state.currentUser.fullName;
      if (roleEl) roleEl.textContent = state.currentUser.roleName;
    }

    const switcher = document.getElementById('roleSwitcher');
    if (switcher) switcher.value = state.currentRole;
  }

  function switchRole(newRoleCode) {
    const account = store.getData().users.find(u => u.roleCode === newRoleCode && u.status === 'active');
    if (!account) return;
    closeModal();
    closeRoomDrawer();
    state.currentRole = newRoleCode;
    if (newRoleCode === 'manager') {
      state.currentUser = {
        id: 'NV-01',
        username: 'hoang.manager',
        fullName: 'Nguyễn Văn Hoàng',
        roleCode: 'manager',
        roleName: 'Quản lý khách sạn'
      };
    } else if (newRoleCode === 'cashier') {
      state.currentUser = {
        id: 'NV-03',
        username: 'trang.thungan',
        fullName: 'Đặng Thu Trang',
        roleCode: 'cashier',
        roleName: 'Kế toán / Thu ngân'
      };
    } else if (newRoleCode === 'admin') {
      state.currentUser = {
        id: 'NV-ADMIN',
        username: 'admin',
        fullName: 'Hoàng Minh Đức',
        roleCode: 'admin',
        roleName: 'Quản trị viên hệ thống'
      };
    }
    state.currentUser = { ...account };
    if (!window.SongLamUI.canScreen(state.currentScreen)) state.currentScreen = 'overview';
    updateTopbarInfo();
    renderCurrentScreen();
    window.SongLamUI.sync();
    showToast(`Đã chuyển vai trò sang: ${state.currentUser.roleName}`);
  }

  function getRoomCountByClass(classCode) {
    const data = store ? store.getData() : window.HOTEL_DATA;
    return (data.rooms || []).filter(r => r.classCode === classCode).length;
  }

  // =========================================================================
  // 1. MÀN HÌNH TỔNG QUAN (OVERVIEW)
  // =========================================================================
  
  // =========================================================================
  // KIOTVIET REVENUE & CASHFLOW DASHBOARD WIDGETS
  // =========================================================================
  function renderKiotVietRevenueDashboard() { return ''; }

  function switchRevenuePeriod(period) {
    state.revenuePeriod = period;
    renderCurrentScreen();
  }

  function switchRevenueTab(tab) {
    state.revenueTab = tab;
    renderCurrentScreen();
  }

  function toggleRevenueViewMode() {
    state.revenueViewMode = state.revenueViewMode === 'bar' ? 'pie' : 'bar';
    renderCurrentScreen();
  }

  function renderOverview() { window.SongLamUI.overview(); }

  function renderRoomRack() {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const rooms = data.rooms || [];
    const stays = data.stays || [];
    const roomClasses = data.roomClasses || [];
    const f = state.filters.roomRack;

    let filtered = rooms.filter(r => {
      if (f.floor !== 'all' && r.floor !== parseInt(f.floor, 10)) return false;
      if (f.roomClass !== 'all' && r.classCode !== f.roomClass) return false;
      if (f.stayStatus !== 'all' && r.stayStatus !== f.stayStatus) return false;
      if (f.cleanStatus !== 'all' && r.cleanStatus !== f.cleanStatus) return false;
      if (f.exploitationStatus === 'unavailable' ? r.exploitationStatus === 'active' : f.exploitationStatus !== 'all' && r.exploitationStatus !== f.exploitationStatus) return false;
      if (f.search.trim()) {
        const q = f.search.trim().toLowerCase();
        const stay = stays.find(s => s.id === r.currentStayId);
        const gName = (stay && stay.guest && stay.guest.name) ? stay.guest.name.toLowerCase() : '';
        const gPhone = (stay && stay.guest && stay.guest.phone) ? stay.guest.phone.toLowerCase() : '';
        if (!r.number.toLowerCase().includes(q) && !gName.includes(q) && !gPhone.includes(q)) return false;
      }
      return true;
    });

    let html = `
      <div class="page-header">
        <div class="page-title-box">
          <h1 class="page-title"><i data-lucide="grid"></i> Sơ đồ phòng · ${rooms.length} phòng</h1>
          <div class="page-breadcrumb">Theo dõi trạng thái Lưu trú, Tình trạng Vệ sinh và Trạng thái Khai thác theo từng phòng</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="window.app.openCreateBookingModal()">
            <i data-lucide="calendar-plus"></i> Đặt phòng mới
          </button>
          <button class="btn btn-success" onclick="window.app.openQuickWalkInModal()">
            <i data-lucide="user-plus"></i> Nhận phòng nhanh
          </button>
        </div>
      </div>

      <!-- Chú giải phân biệt 3 nhóm trạng thái -->
      <div class="room-rack-legend">
        <div class="legend-group">
          <span class="legend-title">Lưu trú:</span>
          <span class="legend-item"><span class="legend-dot dot-vacant"></span> Trống</span>
          <span class="legend-item"><span class="legend-dot dot-occupied"></span> Có khách</span>
        </div>
        <div class="legend-group">
          <span class="legend-title">Vệ sinh (4 bước):</span>
          <span class="legend-item"><span class="badge badge-clean">Sạch</span></span>
          <span class="legend-item"><span class="badge badge-dirty">Chờ dọn</span></span>
          <span class="legend-item"><span class="badge badge-cleaning">Đang dọn</span></span>
          <span class="legend-item"><span class="badge badge-inspecting">Chờ KT</span></span>
        </div>
        <div class="legend-group">
          <span class="legend-title">Khai thác:</span>
          <span class="legend-item"><span class="badge badge-active">Hoạt động</span></span>
          <span class="legend-item"><span class="badge badge-maintenance">Tạm khóa bảo trì</span></span>
        </div>
      </div>

      <!-- Thanh công cụ bộ lọc -->
      <div class="filter-toolbar">
        <div class="filter-left-group">
          <div class="filter-item">
            <span class="filter-label">Tầng:</span>
            <select class="form-select" onchange="window.app.updateRoomFilter('floor', this.value)">
              <option value="all" ${f.floor === 'all' ? 'selected' : ''}>Tất cả tầng</option>
              <option value="4" ${f.floor === '4' ? 'selected' : ''}>Tầng 4</option>
              <option value="5" ${f.floor === '5' ? 'selected' : ''}>Tầng 5</option>
              <option value="6" ${f.floor === '6' ? 'selected' : ''}>Tầng 6</option>
              <option value="7" ${f.floor === '7' ? 'selected' : ''}>Tầng 7</option>
              <option value="8" ${f.floor === '8' ? 'selected' : ''}>Tầng 8</option>
              <option value="10" ${f.floor === '10' ? 'selected' : ''}>Tầng 10</option>
              <option value="12" ${f.floor === '12' ? 'selected' : ''}>Tầng 12</option>
              <option value="14" ${f.floor === '14' ? 'selected' : ''}>Tầng 14</option>
              <option value="15" ${f.floor === '15' ? 'selected' : ''}>Tầng 15</option>
            </select>
          </div>
          <div class="filter-item">
            <span class="filter-label">Hạng phòng:</span>
            <select class="form-select" onchange="window.app.updateRoomFilter('roomClass', this.value)">
              <option value="all">Tất cả hạng phòng</option>
              ${roomClasses.map(rc => `<option value="${rc.code}" ${f.roomClass === rc.code ? 'selected' : ''}>${rc.name}</option>`).join('')}
            </select>
          </div>
          <div class="filter-item">
            <span class="filter-label">Lưu trú:</span>
            <select class="form-select" onchange="window.app.updateRoomFilter('stayStatus', this.value)">
              <option value="all" ${f.stayStatus === 'all' ? 'selected' : ''}>Tất cả</option>
              <option value="vacant" ${f.stayStatus === 'vacant' ? 'selected' : ''}>Phòng trống</option>
              <option value="occupied" ${f.stayStatus === 'occupied' ? 'selected' : ''}>Đang có khách</option>
            </select>
          </div>
          <div class="filter-item"><span class="filter-label">Khai thác:</span><select class="form-select" onchange="window.app.updateRoomFilter('exploitationStatus',this.value)">${[['all','Tất cả'],['unavailable','Ngừng khai thác'],['active','Hoạt động'],['maintenance','Bảo trì'],['inactive','Tạm ngưng']].map(([v,t]) => `<option value="${v}" ${f.exploitationStatus === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <div class="filter-item">
            <span class="filter-label">Vệ sinh:</span>
            <select class="form-select" onchange="window.app.updateRoomFilter('cleanStatus', this.value)">
              <option value="all" ${f.cleanStatus === 'all' ? 'selected' : ''}>Tất cả</option>
              <option value="clean" ${f.cleanStatus === 'clean' ? 'selected' : ''}>Sạch</option>
              <option value="dirty" ${f.cleanStatus === 'dirty' ? 'selected' : ''}>Chờ dọn</option>
              <option value="cleaning" ${f.cleanStatus === 'cleaning' ? 'selected' : ''}>Đang dọn</option>
              <option value="inspecting" ${f.cleanStatus === 'inspecting' ? 'selected' : ''}>Chờ KT</option>
            </select>
          </div>
        </div>
        <div>
          <input type="text" class="form-input" style="width: 250px;" placeholder="Tìm số phòng, tên khách..." 
                 value="${escapeHtml(f.search)}" oninput="window.app.updateRoomFilter('search', this.value)" />
        </div>
      </div>

      <!-- Lưới thẻ phòng -->
      <div class="room-grid">
        ${filtered.map(room => {
          const stay = stays.find(s => s.id === room.currentStayId && s.status === 'in_house');
          const rClass = roomClasses.find(c => c.code === room.classCode) || {};
          const isOccupied = room.stayStatus === 'occupied';
          const isClean = room.cleanStatus === 'clean';
          const isMaintenance = room.exploitationStatus !== 'active';
          const canCheckIn = !isOccupied && isClean && !isMaintenance;

          const cleanBadge = fmt.cleanStatusText(room.cleanStatus);
          const stayBadge = fmt.stayStatusText(room.stayStatus);

          let borderColor = '#b7ebcf';
          if (isMaintenance) borderColor = '#f87171';
          else if (isOccupied) borderColor = '#93c5fd';
          else if (!isClean) borderColor = '#fde68a';

          return `
            <div class="room-card ${isOccupied ? 'occupied' : ''}" style="border: 2px solid ${borderColor}; cursor: pointer;" onclick="window.app.openRoomDrawer('${room.id}')">
              <div class="room-card-top">
                <div class="room-number-wrap">
                  <span class="room-number">P.${escapeHtml(room.number)}</span>
                  <span class="room-class-code">${escapeHtml(room.classCode)}</span>
                </div>
                <div>
                  ${isMaintenance ? '<span class="badge badge-maintenance">BẢO TRÌ</span> ' : ''}
                  <span class="badge ${cleanBadge.badgeClass}">${cleanBadge.text}</span>
                </div>
              </div>

              <div class="room-card-middle">
                ${isOccupied && stay ? `
                  <div style="font-weight: 700; color: #0284c7; font-size: 13px;">${escapeHtml(stay.guest.name)}</div>
                  <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
                    Trả: <b>${fmt.date(stay.expectedCheckOutDate)}</b> &bull; ${escapeHtml(stay.guest.phone)}
                  </div>
                ` : `
                  <div style="font-size: 12px; color: ${isMaintenance ? '#dc2626' : (isClean ? 'var(--success)' : '#b45309')}; font-weight: 600;">
                    ${isMaintenance ? 'Tạm ngừng khai thác' : (isClean ? 'Sẵn sàng đón khách' : 'Chưa được duyệt sạch')}
                  </div>
                  <div style="font-size: 11.5px; color: var(--text-muted);">${fmt.currency(rClass.basePrice)}/đêm</div>
                `}
              </div>

              <div class="pms-room-statuses"><span>Lưu trú: <b>${stayBadge.text}</b></span><span>· Khai thác: <b>${fmt.exploitationStatusText(room.exploitationStatus).text}</b></span></div>
              <div class="room-card-bottom" style="gap: 4px;" onclick="event.stopPropagation()">
                ${isOccupied ? `
                  <button class="btn btn-secondary btn-sm" style="flex: 1;" onclick="window.app.openRoomDrawer('${room.id}')">
                    <i data-lucide="eye"></i> Chi tiết
                  </button>
                  <button class="btn btn-danger btn-sm" style="flex: 1;" onclick="window.app.openCheckoutModal('${room.number}')">
                    <i data-lucide="log-out"></i> Trả phòng
                  </button>
                ` : `
                  ${canCheckIn ? `
                    <button class="btn btn-primary btn-sm" style="width: 100%; font-weight: 700;" onclick="window.app.openDirectCheckInModal('${room.number}')">
                      <i data-lucide="user-plus"></i> Nhận phòng ngay
                    </button>
                  ` : `
                    <button class="btn btn-secondary btn-sm disabled" style="width: 100%;" disabled title="${isMaintenance ? 'Phòng đang bảo trì' : 'Phòng chưa sạch, buồng phòng cần dọn và duyệt'}">
                      ${isMaintenance ? 'Đang bảo trì' : 'Chờ buồng phòng dọn'}
                    </button>
                  `}
                `}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    document.getElementById('mainContent').innerHTML = html;
  }

  // =========================================================================
  // 3. MÀN HÌNH ĐẶT PHÒNG (BOOKINGS)
  // =========================================================================
  function renderBookings() {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const bookingFilter = state.filters.bookings;
    const bookings = (data.bookings || []).filter(b => (bookingFilter.status === 'all' || b.bookingStatus === bookingFilter.status) && [b.id,b.guestName,b.guest?.name,b.phone,...(b.assignedRooms || [])].join(' ').toLocaleLowerCase('vi').includes(bookingFilter.search.toLocaleLowerCase('vi')));

    let html = `
      <div class="page-header">
        <div class="page-title-box">
          <h1 class="page-title"><i data-lucide="calendar-check"></i> Quản lý Đặt phòng (Reservations)</h1>
          <div class="page-breadcrumb">Quản lý quỹ phòng, theo dõi cọc, hỗ trợ đơn nhiều phòng và hủy đơn giải phóng quỹ</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="window.app.openCreateBookingModal()">
            <i data-lucide="calendar-plus"></i> Tạo đơn đặt phòng mới
          </button>
        </div>
      </div>

      <div class="filter-toolbar"><div class="filter-left-group"><input class="form-input" aria-label="Tìm đặt phòng" placeholder="Tìm mã đơn, khách, điện thoại, phòng…" value="${escapeHtml(bookingFilter.search)}" oninput="app.setBookingFilter('search',this.value)"><select class="form-select" aria-label="Trạng thái đặt phòng" onchange="app.setBookingFilter('status',this.value)">${[['all','Tất cả trạng thái'],['confirmed','Đã xác nhận'],['partially_checked_in','Nhận một phần'],['checked_in','Đã nhận phòng'],['pending','Chờ xác nhận'],['cancelled','Đã hủy'],['no_show','Không đến']].map(([v,t]) => `<option value="${v}" ${bookingFilter.status===v?'selected':''}>${t}</option>`).join('')}</select></div><span class="text-secondary">${bookings.length} đơn</span></div>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Mã đơn</th>
              <th>Khách đại diện</th>
              <th>Điện thoại</th>
              <th>Thời gian lưu trú</th>
              <th class="text-center">Số đêm</th>
              <th>Hạng phòng</th>
              <th class="text-center">Số lượng</th>
              <th class="text-right">Tổng tiền dự kiến</th>
              <th class="text-right">Tiền cọc ghi nhận</th>
              <th class="text-center">Trạng thái</th>
              <th class="text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${bookings.length ? '' : '<tr><td colspan="11" class="pms-empty">Không có đặt phòng phù hợp bộ lọc.</td></tr>'}
            ${bookings.map(b => {
              const nights = b.nights || (store ? store.calculateNights(b.checkInDate, b.checkOutDate) : 1);
              let statusBadge = '<span class="badge badge-clean">Đã xác nhận</span>';
              if (b.bookingStatus === 'checked_in') {
                statusBadge = '<span class="badge badge-occupied">Đã nhận phòng</span>';
              } else if (b.bookingStatus === 'cancelled') {
                statusBadge = '<span class="badge badge-maintenance">Đã hủy</span>';
              } else if (b.bookingStatus === 'deposited') {
                statusBadge = '<span class="badge badge-clean">Đã đặt cọc</span>';
              } else if (b.bookingStatus === 'pending') {
                statusBadge = '<span class="badge badge-dirty">Chờ xác nhận</span>';
              }

              if (b.bookingStatus === 'no_show') statusBadge = '<span class="badge badge-dirty">Không đến</span>';
              if (b.bookingStatus === 'partially_checked_in') statusBadge = '<span class="badge badge-occupied">Nhận một phần</span>';
              const depositPaid = b.depositPaid || b.depositAmount || 0;
              const checkedCount = (b.checkedInRooms || []).length;
              const totalRooms = b.roomQuantity || 1;

              return `
                <tr>
                  <td><span style="font-weight: 700; color: var(--primary);">${escapeHtml(b.id)}</span></td>
                  <td>
                    <div style="font-weight: 600;">${escapeHtml(b.guestName)}</div>
                    <div style="font-size: 11px; color: var(--text-secondary);">${escapeHtml(b.email || '')}</div>
                  </td>
                  <td>${escapeHtml(b.phone)}</td>
                  <td>${fmt.date(b.checkInDate)} &rarr; ${fmt.date(b.checkOutDate)}</td>
                  <td class="text-center font-amount"><b>${nights}</b> đêm</td>
                  <td><span class="badge badge-vacant">${escapeHtml(b.roomClassCode)}</span></td>
                  <td class="text-center">
                    <span class="font-amount">x${totalRooms}</span>
                    ${checkedCount > 0 && checkedCount < totalRooms ? `<div style="font-size: 10.5px; color: #b45309;">(Đã nhận ${checkedCount})</div>` : ''}
                  </td>
                  <td class="text-right font-amount">${fmt.currency(b.totalEstimated)}</td>
                  <td class="text-right font-amount" style="color: ${depositPaid > 0 ? 'var(--success)' : 'var(--text-muted)'};">
                    ${depositPaid > 0 ? fmt.currency(depositPaid) : '<span style="font-size: 11.5px; color: #b45309;">Chưa thu cọc</span>'}
                  </td>
                  <td class="text-center">${statusBadge}</td>
                  <td class="text-right">
                    <div style="display: inline-flex; gap: 4px;">
                      ${(['confirmed','partially_checked_in'].includes(b.bookingStatus)) ? `
                        <button class="btn btn-primary btn-sm" onclick="window.app.openCheckInForBooking('${b.id}')">
                          <i data-lucide="check"></i> Nhận phòng
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="window.app.promptCancelBooking('${b.id}')" title="Hủy đơn giải phóng quỹ">
                          <i data-lucide="x"></i> Hủy
                        </button>
                      ` : ''}
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('mainContent').innerHTML = html;
  }

  // =========================================================================
  // 4. MÀN HÌNH LƯU TRÚ (STAYS)
  // =========================================================================
  function renderStays() {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const stays = (data.stays || []).filter(s => s.status === 'in_house');

    let html = `
      <div class="page-header">
        <div class="page-title-box">
          <h1 class="page-title"><i data-lucide="users"></i> Quản lý Khách lưu trú (In-House Folios)</h1>
          <div class="page-breadcrumb">Theo dõi phòng đang ở, khách đi cùng, chi phí dịch vụ, đổi phòng và gia hạn</div>
        </div>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Số phòng</th>
              <th>Hạng phòng</th>
              <th>Khách đại diện</th>
              <th>CCCD / Hộ chiếu</th>
              <th>Ngày nhận</th>
              <th>Dự kiến trả</th>
              <th class="text-right">Tổng chi phí</th>
              <th class="text-right">Cọc / Đã thu</th>
              <th class="text-right">Còn phải thu</th>
              <th class="text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${stays.map(s => {
              const folio = store ? store.calculateStayFolio(s.id) : null;
              const totalAmount = folio ? folio.totalAmount : 0;
              const depositPaid = folio ? (folio.paymentsCollected + folio.depositPaid) : (s.depositAmount || 0);
              const remainingDue = folio ? folio.remainingDue : 0;

              return `
                <tr>
                  <td><span style="font-size: 16px; font-weight: 800; color: var(--primary);">P.${escapeHtml(s.roomNumber)}</span></td>
                  <td><span class="badge badge-vacant">${escapeHtml(s.roomClassCode)}</span></td>
                  <td>
                    <div style="font-weight: 600;">${escapeHtml(s.guest.name)}</div>
                    <div style="font-size: 11px; color: var(--text-secondary);">${escapeHtml(s.guest.phone)}</div>
                  </td>
                  <td style="font-family: monospace;">${escapeHtml(s.guest.identityCard)}</td>
                  <td>${fmt.date(s.checkInDate)}</td>
                  <td>${fmt.date(s.expectedCheckOutDate)}</td>
                  <td class="text-right font-amount">${fmt.currency(totalAmount)}</td>
                  <td class="text-right font-amount" style="color: var(--success);">${fmt.currency(depositPaid)}</td>
                  <td class="text-right font-amount" style="color: ${remainingDue > 0 ? 'var(--danger)' : 'var(--success)'}; font-weight: 700;">
                    ${fmt.currency(remainingDue)}
                  </td>
                  <td class="text-right">
                    <div style="display: inline-flex; gap: 4px;">
                      <button class="btn btn-secondary btn-sm" onclick="window.app.openAddServiceModal('${s.roomNumber}')" title="Thêm dịch vụ">
                        <i data-lucide="plus"></i> DV
                      </button>
                      <button class="btn btn-secondary btn-sm" onclick="window.app.openTransferRoomModal('${s.id}')" title="Đổi phòng">
                        <i data-lucide="arrow-right-left"></i> Chuyển
                      </button>
                      <button class="btn btn-secondary btn-sm" onclick="window.app.openExtendStayModal('${s.id}')" title="Gia hạn">
                        <i data-lucide="clock"></i> Gia hạn
                      </button>
                      <button class="btn btn-secondary btn-sm" onclick="window.app.printInvoice('${s.id}')" title="In phiếu tạm tính">
                        <i data-lucide="printer"></i>
                      </button>
                      <button class="btn btn-danger btn-sm" onclick="window.app.openCheckoutModal('${s.roomNumber}')">
                        <i data-lucide="log-out"></i> Trả phòng
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('mainContent').innerHTML = html;
  }

  // =========================================================================
  // 5. HỒ SƠ KHÁCH HÀNG (CUSTOMERS)
  // =========================================================================
  function switchCustomerTab(tab) {
    state.customerTab = tab;
    renderCustomers();
    if (window.lucide) lucide.createIcons();
  }

  function filterCustomers(query) {
    state.customerSearch = query;
    renderCustomers();
    if (window.lucide) lucide.createIcons();
  }

  function renderCustomers() {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const allCustomers = data.customers || [];
    const tab = state.customerTab || 'all';
    const query = (state.customerSearch || '').trim().toLowerCase();

    let filtered = allCustomers.filter(c => {
      if (tab === 'individual' && c.type === 'group') return false;
      if (tab === 'group' && c.type !== 'group') return false;
      if (query) {
        const matchName = (c.name || '').toLowerCase().includes(query);
        const matchPhone = (c.phone || '').toLowerCase().includes(query);
        const matchId = (c.identityCard || '').toLowerCase().includes(query);
        const matchCode = (c.id || '').toLowerCase().includes(query);
        return matchName || matchPhone || matchId || matchCode;
      }
      return true;
    });

    let html = `
      <div class="page-header d-print-none mb-3">
        <div class="row g-2 align-items-center">
          <div class="col">
            <h2 class="page-title d-flex align-items-center gap-2">
              <i data-lucide="contact" class="text-primary"></i> D. Hồ sơ khách hàng & Đoàn / Doanh nghiệp
            </h2>
            <div class="text-secondary mt-1" style="font-size: 13px;">
              Quản lý danh bạ khách hàng thân thiết, hợp đồng khách đoàn lữ hành và đối tác doanh nghiệp
            </div>
          </div>
          <div class="col-auto ms-auto">
            <button class="btn btn-primary" onclick="window.app.openAddCustomerModal()">
              <i data-lucide="user-plus"></i> Thêm khách hàng mới
            </button>
          </div>
        </div>
      </div>

      <!-- Card Bộ lọc & Tabs -->
      <div class="card mb-3">
        <div class="card-body py-2">
          <div class="row g-2 align-items-center justify-content-between">
            <div class="col-auto">
              <div class="btn-group" role="group">
                <button type="button" class="btn btn-sm ${tab === 'all' ? 'btn-primary' : 'btn-outline-secondary'}" onclick="window.app.switchCustomerTab('all')">
                  Tất cả (${allCustomers.length})
                </button>
                <button type="button" class="btn btn-sm ${tab === 'individual' ? 'btn-primary' : 'btn-outline-secondary'}" onclick="window.app.switchCustomerTab('individual')">
                  Khách cá nhân (${allCustomers.filter(c => c.type !== 'group').length})
                </button>
                <button type="button" class="btn btn-sm ${tab === 'group' ? 'btn-primary' : 'btn-outline-secondary'}" onclick="window.app.switchCustomerTab('group')">
                  Khách đoàn / Doanh nghiệp (${allCustomers.filter(c => c.type === 'group').length})
                </button>
              </div>
            </div>
            <div class="col-auto col-md-4">
              <div class="input-icon">
                <input type="text" class="form-control form-control-sm" placeholder="Tìm kiếm tên, SĐT, CCCD/MST..." value="${escapeHtml(state.customerSearch || '')}" oninput="window.app.filterCustomers(this.value)">
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bảng dữ liệu Tabler -->
      <div class="card">
        <div class="card-header d-flex justify-content-between align-items-center py-2">
          <h3 class="card-title mb-0 fs-5">Danh sách khách hàng (${filtered.length} bản ghi)</h3>
          <span class="text-muted small">Cập nhật theo dữ liệu hệ thống Sông Lam</span>
        </div>
        <div class="table-responsive">
          <table class="table table-vcenter table-hover card-table">
            <thead>
              <tr>
                <th>Mã KH</th>
                <th>Khách hàng / Doanh nghiệp</th>
                <th>Loại hồ sơ</th>
                <th>Số điện thoại</th>
                <th>CCCD / MST</th>
                <th>Địa chỉ</th>
                <th class="text-center">Hạng thẻ / Nhóm</th>
                <th class="text-center">Lượt ở</th>
                <th class="text-end">Tổng chi tiêu</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.length === 0 ? '<tr><td colspan="9" class="text-center text-muted py-4">Không tìm thấy hồ sơ khách hàng nào phù hợp với bộ lọc.</td></tr>' : ''}
              ${filtered.map(c => `
                <tr>
                  <td><span class="badge bg-blue-lt fw-bold">${escapeHtml(c.id)}</span></td>
                  <td>
                    <div class="fw-bold">${escapeHtml(c.name)}</div>
                    ${c.representative ? `<div class="small text-muted">Đại diện: <b>${escapeHtml(c.representative)}</b></div>` : ''}
                    ${c.email ? `<div class="small text-muted">${escapeHtml(c.email)}</div>` : ''}
                  </td>
                  <td>
                    ${c.type === 'group' ? '<span class="badge bg-purple text-white">Đoàn / Công ty</span>' : '<span class="badge bg-secondary-lt">Khách lẻ</span>'}
                  </td>
                  <td>${escapeHtml(c.phone)}</td>
                  <td style="font-family: monospace;">${escapeHtml(c.identityCard)}</td>
                  <td>${escapeHtml(c.address || '-')}</td>
                  <td class="text-center">
                    <span class="badge ${c.tier && c.tier.includes('Diamond') ? 'bg-indigo text-white' : (c.tier && c.tier.includes('Gold') ? 'bg-yellow text-dark' : 'bg-azure text-white')}">
                      ${escapeHtml(c.tier || 'Thành viên')}
                    </span>
                  </td>
                  <td class="text-center font-amount fw-bold">${c.totalStays || 0}</td>
                  <td class="text-end font-amount fw-bold text-success">${fmt.currency(c.totalSpent || 0)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('mainContent').innerHTML = html;
  }

  // =========================================================================
  // 6. DANH MỤC HẠNG PHÒNG (ROOM CLASSES - 10 HẠNG CHUẨN XÁC)
  // =========================================================================
  // =========================================================================
  // 6. DANH MỤC HẠNG PHÒNG (ROOM CLASSES - CRUD)
  // =========================================================================
  function renderRoomClasses() {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const roomClasses = data.roomClasses || [];

    let html = `
      <div class="page-header">
        <div class="page-title-box">
          <h1 class="page-title"><i data-lucide="bookmark"></i> Danh mục Hạng phòng (Room Categories - ${roomClasses.length} Hạng)</h1>
          <div class="page-breadcrumb">Tham khảo diện tích & cơ cấu hạng phòng tại Mường Thanh Luxury Sông Lam (TP. Vinh, Nghệ An)</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="window.app.openAddRoomClassModal()">
            <i data-lucide="plus-circle"></i> Thêm hạng phòng mới
          </button>
        </div>
      </div>

      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: var(--radius-sm); padding: 10px 14px; margin-bottom: 14px; font-size: 12.5px; color: #1e40af;">
        <i data-lucide="info" style="width: 14px; height: 14px; vertical-align: middle;"></i>
        <b>Danh mục đang áp dụng:</b> Có ${roomClasses.length} hạng phòng trong dữ liệu hiện tại. Có thể cập nhật giá, sức chứa và tiện nghi; chỉ xóa hạng phòng khi không có phòng phụ thuộc.
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Mã hạng</th>
              <th>Tên hạng phòng</th>
              <th class="text-right">Diện tích</th>
              <th class="text-center">Sức chứa TC</th>
              <th class="text-center">Tối đa</th>
              <th>Cấu hình giường</th>
              <th class="text-center">Số phòng TT</th>
              <th class="text-right">Giá cơ sở</th>
              <th class="text-right">Giá cuối tuần</th>
              <th class="text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${roomClasses.map(rc => {
              const actualCount = getRoomCountByClass(rc.code);
              return `
                <tr>
                  <td><span style="font-weight: 700; color: var(--primary);">${escapeHtml(rc.code)}</span></td>
                  <td>
                    <div style="font-weight: 600;">${escapeHtml(rc.name)}</div>
                    <div style="font-size: 11px; color: var(--text-secondary);">${escapeHtml(rc.description || '')}</div>
                  </td>
                  <td class="text-right font-amount" style="font-weight: 700; color: #0f4c81;">${rc.area} m²</td>
                  <td class="text-center">${rc.standardOccupancy ?? rc.standardCapacity ?? '—'} người</td>
                  <td class="text-center">${rc.maxOccupancy ?? rc.maxCapacity ?? '—'} người</td>
                  <td>${escapeHtml(rc.bedConfig)}</td>
                  <td class="text-center font-amount"><span class="badge badge-vacant">${actualCount} phòng</span></td>
                  <td class="text-right font-amount" style="font-weight: 700; color: var(--success);">${fmt.currency(rc.basePrice)}</td>
                  <td class="text-right font-amount" style="font-weight: 700; color: #0284c7;">${fmt.currency(rc.weekendPrice || Math.round(rc.basePrice * 1.15))}</td>
                  <td class="text-right">
                    <div style="display: flex; gap: 4px; justify-content: flex-end;">
                      <button class="btn btn-secondary btn-sm" onclick="window.app.openEditRoomClassModal('${rc.code}')" title="Chỉnh sửa thông số">
                        <i data-lucide="edit-3" style="width: 12px; height: 12px;"></i> Sửa
                      </button>
                      <button class="btn btn-danger btn-sm" onclick="window.app.promptDeleteRoomClass('${rc.code}')" title="Xóa hạng phòng">
                        <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i> Xóa
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('mainContent').innerHTML = html;
  }

  function openAddRoomClassModal() {
    const modal = document.getElementById('appModal');
    modal.innerHTML = `
      <div class="modal-overlay active" id="modalBackdrop">
        <div class="modal-container" style="max-width: 580px;">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="plus-circle"></i> Thêm Hạng phòng mới</div>
            <button class="modal-close-btn" onclick="window.app.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.app.submitRoomClassForm(event, 'add')">
            <div class="modal-body">
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Mã hạng phòng (Viết hoa, không dấu)</label>
                  <input type="text" class="form-control" name="code" required placeholder="VD: EXEC_KING" style="text-transform: uppercase;" />
                </div>
                <div class="form-group">
                  <label class="form-label required">Tên hạng phòng</label>
                  <input type="text" class="form-control" name="name" required placeholder="VD: Executive King Suite" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Diện tích (m²)</label>
                  <input type="number" class="form-control" name="area" value="35" min="10" required />
                </div>
                <div class="form-group">
                  <label class="form-label required">Cấu hình giường</label>
                  <input type="text" class="form-control" name="bedConfig" value="1 Giường đôi King 2m x 2m" required />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Sức chứa tiêu chuẩn (NL)</label>
                  <input type="number" class="form-control" name="standardCapacity" value="2" min="1" max="10" required />
                </div>
                <div class="form-group">
                  <label class="form-label required">Sức chứa tối đa (NL)</label>
                  <input type="number" class="form-control" name="maxCapacity" value="3" min="1" max="15" required />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Giá cơ sở ngày thường (VNĐ)</label>
                  <input type="number" class="form-control" name="basePrice" value="1200000" min="100000" step="50000" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Giá cuối tuần (T6-CN) (VNĐ)</label>
                  <input type="number" class="form-control" name="weekendPrice" value="1400000" min="100000" step="50000" />
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Mô tả tiện ích hạng phòng</label>
                <textarea class="form-control" name="description" rows="2" placeholder="View sông Lam, bồn tắm nằm cao cấp..."></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Hủy</button>
              <button type="submit" class="btn btn-primary"><i data-lucide="check"></i> Lưu Hạng phòng</button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: modal });
  }

  function openEditRoomClassModal(classCode) {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const rc = (data.roomClasses || []).find(c => c.code === classCode);
    if (!rc) return;

    const modal = document.getElementById('appModal');
    modal.innerHTML = `
      <div class="modal-overlay active" id="modalBackdrop">
        <div class="modal-container" style="max-width: 580px;">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="edit-3"></i> Chỉnh sửa Hạng phòng: ${escapeHtml(rc.code)}</div>
            <button class="modal-close-btn" onclick="window.app.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.app.submitRoomClassForm(event, 'edit', '${rc.code}')">
            <div class="modal-body">
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Mã hạng phòng (Không đổi)</label>
                  <input type="text" class="form-control" value="${escapeHtml(rc.code)}" disabled style="background: #f1f5f9; font-weight: 700;" />
                </div>
                <div class="form-group">
                  <label class="form-label required">Tên hạng phòng</label>
                  <input type="text" class="form-control" name="name" value="${escapeHtml(rc.name)}" required />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Diện tích (m²)</label>
                  <input type="number" class="form-control" name="area" value="${rc.area}" min="10" required />
                </div>
                <div class="form-group">
                  <label class="form-label required">Cấu hình giường</label>
                  <input type="text" class="form-control" name="bedConfig" value="${escapeHtml(rc.bedConfig)}" required />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Sức chứa tiêu chuẩn (NL)</label>
                  <input type="number" class="form-control" name="standardCapacity" value="${rc.standardOccupancy ?? rc.standardCapacity ?? 2}" min="1" max="10" required />
                </div>
                <div class="form-group">
                  <label class="form-label required">Sức chứa tối đa (NL)</label>
                  <input type="number" class="form-control" name="maxCapacity" value="${rc.maxOccupancy ?? rc.maxCapacity ?? 3}" min="1" max="15" required />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Giá cơ sở ngày thường (VNĐ)</label>
                  <input type="number" class="form-control" name="basePrice" value="${rc.basePrice}" min="100000" step="50000" required />
                </div>
                <div class="form-group">
                  <label class="form-label">Giá cuối tuần (T6-CN) (VNĐ)</label>
                  <input type="number" class="form-control" name="weekendPrice" value="${rc.weekendPrice || Math.round(rc.basePrice * 1.15)}" min="100000" step="50000" />
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Mô tả tiện ích hạng phòng</label>
                <textarea class="form-control" name="description" rows="2">${escapeHtml(rc.description || '')}</textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Hủy</button>
              <button type="submit" class="btn btn-primary"><i data-lucide="check"></i> Lưu thay đổi</button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: modal });
  }

  function submitRoomClassForm(event, mode, targetCode = null) {
    event.preventDefault();
    const form = event.target;
    try {
      const params = {
        name: form.name.value.trim(),
        area: parseFloat(form.area.value) || 30,
        bedConfig: form.bedConfig.value.trim(),
        standardOccupancy: parseInt(form.standardCapacity.value, 10) || 2,
        maxOccupancy: parseInt(form.maxCapacity.value, 10) || 3,
        basePrice: parseInt(form.basePrice.value, 10) || 1200000,
        weekendPrice: parseInt(form.weekendPrice.value, 10) || Math.round((parseInt(form.basePrice.value, 10) || 1200000) * 1.15),
        description: form.description ? form.description.value.trim() : ''
      };

      if (mode === 'add') {
        params.code = form.code.value.trim().toUpperCase();
        store.createRoomClass(params, state.currentUser);
        showToast(`Đã thêm mới hạng phòng ${params.code} thành công!`);
      } else {
        store.updateRoomClass(targetCode, params, state.currentUser);
        showToast(`Đã cập nhật hạng phòng ${targetCode} thành công!`);
      }
      closeModal();
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function promptDeleteRoomClass(classCode) {
    if (!window.confirm(`Xác nhận xóa hạng phòng ${classCode}?\nLưu ý: Không thể xóa nếu đang có phòng vật lý thuộc hạng này.`)) return;
    try {
      store.deleteRoomClass(classCode, state.currentUser);
      showToast(`Đã xóa hạng phòng ${classCode} thành công!`);
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  // =========================================================================
  // 7. DANH MỤC PHÒNG VẬT LÝ (ROOMS INVENTORY - CRUD)
  // =========================================================================
  function renderRoomsCatalog() {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const rooms = data.rooms || [];
    const roomClasses = data.roomClasses || [];

    let html = `
      <div class="page-header">
        <div class="page-title-box">
          <h1 class="page-title"><i data-lucide="door-closed"></i> Danh mục Phòng vật lý (${rooms.length} phòng)</h1>
          <div class="page-breadcrumb">Quản lý 42 phòng vật lý, phân bổ tầng, gán hạng phòng và điều khiển khóa bảo trì</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="window.app.openAddRoomModal()">
            <i data-lucide="plus-circle"></i> Thêm phòng vật lý mới
          </button>
        </div>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Số phòng</th>
              <th>Tầng</th>
              <th>Hạng phòng</th>
              <th>Trạng thái lưu trú</th>
              <th>Trạng thái vệ sinh</th>
              <th>Tình trạng khai thác</th>
              <th>Ghi chú vận hành</th>
              <th class="text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${rooms.map(r => {
              const rClass = roomClasses.find(c => c.code === r.classCode) || {};
              const cleanBadge = fmt.cleanStatusText(r.cleanStatus);
              const stayBadge = fmt.stayStatusText(r.stayStatus);
              const isMaintenance = r.exploitationStatus === 'maintenance';

              return `
                <tr>
                  <td><span style="font-size: 15px; font-weight: 800; color: var(--primary);">P.${escapeHtml(r.number)}</span></td>
                  <td>Tầng ${r.floor}</td>
                  <td>
                    <span class="badge badge-vacant">${escapeHtml(r.classCode)}</span>
                    <span style="font-size: 12px; margin-left: 4px;">${escapeHtml(rClass.name || '')}</span>
                  </td>
                  <td><span class="badge ${stayBadge.badgeClass}">${stayBadge.text}</span></td>
                  <td><span class="badge ${cleanBadge.badgeClass}">${cleanBadge.text}</span></td>
                  <td>
                    ${isMaintenance ? 
                      '<span class="badge badge-maintenance"><i data-lucide="wrench" style="width:11px;height:11px;"></i> Tạm ngừng khai thác</span>' : 
                      '<span class="badge badge-clean">Đang hoạt động</span>'
                    }
                  </td>
                  <td style="font-size: 12px; color: var(--text-secondary); max-width: 250px;">${escapeHtml(r.notes || '-')}</td>
                  <td class="text-right">
                    <div style="display: flex; gap: 4px; justify-content: flex-end;">
                      <button class="btn btn-secondary btn-sm" onclick="window.app.openEditRoomModal('${r.number}')" title="Sửa thông tin phòng">
                        <i data-lucide="edit-3" style="width: 12px; height: 12px;"></i> Sửa
                      </button>
                      <button class="btn ${isMaintenance ? 'btn-success' : 'btn-secondary'} btn-sm" onclick="window.app.toggleRoomMaintenance('${r.number}')">
                        <i data-lucide="${isMaintenance ? 'check' : 'wrench'}" style="width: 12px; height: 12px;"></i>
                        ${isMaintenance ? 'Mở' : 'Khóa'}
                      </button>
                      <button class="btn btn-danger btn-sm" onclick="window.app.promptDeleteRoom('${r.number}')" title="Xóa phòng">
                        <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i> Xóa
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('mainContent').innerHTML = html;
  }

  function openAddRoomModal() {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const roomClasses = data.roomClasses || [];

    const modal = document.getElementById('appModal');
    modal.innerHTML = `
      <div class="modal-overlay active" id="modalBackdrop">
        <div class="modal-container" style="max-width: 480px;">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="plus-circle"></i> Thêm Phòng vật lý mới</div>
            <button class="modal-close-btn" onclick="window.app.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.app.submitRoomForm(event, 'add')">
            <div class="modal-body">
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Số phòng (VD: 505)</label>
                  <input type="text" class="form-control" name="number" required placeholder="505" />
                </div>
                <div class="form-group">
                  <label class="form-label required">Tầng</label>
                  <input type="number" class="form-control" name="floor" value="5" min="1" max="40" required />
                </div>
              </div>
              <div class="form-group">
                <label class="form-label required">Hạng phòng</label>
                <select class="form-select" name="classCode" style="width: 100%;" required>
                  ${roomClasses.map(c => `<option value="${c.code}">${c.code} - ${c.name} (${fmt.currency(c.basePrice)})</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Ghi chú vận hành</label>
                <input type="text" class="form-control" name="notes" placeholder="Ban công nhìn ra sông Lam..." />
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Hủy</button>
              <button type="submit" class="btn btn-primary"><i data-lucide="check"></i> Lưu phòng</button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: modal });
  }

  function openEditRoomModal(roomNumber) {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const room = (data.rooms || []).find(r => r.number === roomNumber);
    if (!room) return;
    const roomClasses = data.roomClasses || [];

    const modal = document.getElementById('appModal');
    modal.innerHTML = `
      <div class="modal-overlay active" id="modalBackdrop">
        <div class="modal-container" style="max-width: 480px;">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="edit-3"></i> Chỉnh sửa Phòng: P.${escapeHtml(room.number)}</div>
            <button class="modal-close-btn" onclick="window.app.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.app.submitRoomForm(event, 'edit', '${room.number}')">
            <div class="modal-body">
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Số phòng</label>
                  <input type="text" class="form-control" value="${escapeHtml(room.number)}" disabled style="background: #f1f5f9; font-weight: 700;" />
                </div>
                <div class="form-group">
                  <label class="form-label required">Tầng</label>
                  <input type="number" class="form-control" name="floor" value="${room.floor}" min="1" max="40" required />
                </div>
              </div>
              <div class="form-group">
                <label class="form-label required">Hạng phòng gán</label>
                <select class="form-select" name="classCode" style="width: 100%;" required>
                  ${roomClasses.map(c => `<option value="${c.code}" ${c.code === room.classCode ? 'selected' : ''}>${c.code} - ${c.name} (${fmt.currency(c.basePrice)})</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Ghi chú vận hành</label>
                <input type="text" class="form-control" name="notes" value="${escapeHtml(room.notes || '')}" placeholder="Ghi chú thiết bị, view phòng..." />
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Hủy</button>
              <button type="submit" class="btn btn-primary"><i data-lucide="check"></i> Lưu thay đổi</button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: modal });
  }

  function submitRoomForm(event, mode, targetNumber = null) {
    event.preventDefault();
    const form = event.target;
    try {
      const params = {
        floor: parseInt(form.floor.value, 10) || 1,
        classCode: form.classCode.value,
        notes: form.notes ? form.notes.value.trim() : ''
      };

      if (mode === 'add') {
        params.number = form.number.value.trim();
        store.createRoom(params, state.currentUser);
        showToast(`Đã thêm phòng P.${params.number} thành công!`);
      } else {
        store.updateRoom(targetNumber, params, state.currentUser);
        showToast(`Đã cập nhật phòng P.${targetNumber} thành công!`);
      }
      closeModal();
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function promptDeleteRoom(roomNumber) {
    if (!window.confirm(`Xác nhận xóa phòng P.${roomNumber} khỏi hệ thống?\nLưu ý: Chỉ được xóa phòng đang trống và không có khách lưu trú.`)) return;
    try {
      store.deleteRoom(roomNumber, state.currentUser);
      showToast(`Đã xóa phòng P.${roomNumber} thành công!`);
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  // =========================================================================
  // 8. BẢNG GIÁ VÀ CHÍNH SÁCH (DYNAMIC PRICING ENGINE)
  // =========================================================================
  function renderRatesAndPolicies() {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const roomClasses = data.roomClasses || [];
    const seasons = data.rateSeasons || [];
    const policies = data.hotelPolicies || {};

    let html = `
      <div class="page-header">
        <div class="page-title-box">
          <h1 class="page-title"><i data-lucide="tag"></i> Bảng giá & Chính sách giá Linh hoạt (Dynamic Pricing)</h1>
          <div class="page-breadcrumb">Quản lý cơ chế giá ngày thường vs cuối tuần, giá block theo giờ và phụ thu nhận/trả phòng</div>
        </div>
      </div>

      <!-- Bảng giá động cho các hạng phòng -->
      <div class="card" style="margin-bottom: 16px;">
        <div class="card-header">
          <div class="card-title"><i data-lucide="sliders"></i> Bảng giá theo Hạng phòng (Theo Ngày & Theo Giờ)</div>
        </div>
        <div class="table-container" style="border: none;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Hạng phòng</th>
                <th class="text-right">Giá ngày thường (T2-T5)</th>
                <th class="text-right">Giá cuối tuần (T6-CN)</th>
                <th class="text-right">Thuê giờ (2h đầu)</th>
                <th class="text-right">Mỗi giờ tiếp theo</th>
                <th class="text-center">Hệ số cuối tuần</th>
                <th class="text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              ${roomClasses.map(rc => {
                const baseP = rc.basePrice || 1200000;
                const wkndP = rc.weekendPrice || Math.round(baseP * 1.15);
                const hBase = rc.hourlyBase || Math.round(baseP * 0.4);
                const hNext = rc.hourlyNext || Math.round(baseP * 0.1);
                const multiplier = rc.weekendMultiplier || 1.15;

                return `
                  <tr>
                    <td>
                      <div style="font-weight: 700; color: var(--primary);">${escapeHtml(rc.code)}</div>
                      <div style="font-size: 11px; color: var(--text-secondary);">${escapeHtml(rc.name)}</div>
                    </td>
                    <td class="text-right font-amount" style="font-weight: 700; color: var(--success);">${fmt.currency(baseP)}</td>
                    <td class="text-right font-amount" style="font-weight: 700; color: #0284c7;">${fmt.currency(wkndP)}</td>
                    <td class="text-right font-amount">${fmt.currency(hBase)}</td>
                    <td class="text-right font-amount">${fmt.currency(hNext)}</td>
                    <td class="text-center"><span class="badge badge-vacant">x${multiplier}</span></td>
                    <td class="text-right">
                      <button class="btn btn-primary btn-sm" onclick="window.app.openEditPricingPolicyModal('${rc.code}')">
                        <i data-lucide="edit-3" style="width: 12px; height: 12px;"></i> Sửa giá
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div class="card">
          <div class="card-header">
            <div class="card-title"><i data-lucide="calendar"></i> Bảng phụ thu & Mùa giá (Rate Seasons)</div>
          </div>
          <div class="table-container" style="border: none;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Tên bảng giá</th>
                  <th>Phạm vi áp dụng</th>
                  <th class="text-right">Hệ số điều chỉnh</th>
                </tr>
              </thead>
              <tbody>
                ${seasons.map(s => `
                  <tr>
                    <td><b>${escapeHtml(s.name)}</b></td>
                    <td>${escapeHtml(s.appliedDays || 'Tất cả các ngày')}</td>
                    <td class="text-right font-amount" style="color: var(--primary);">x${s.multiplier || 1.0}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title"><i data-lucide="file-text"></i> Chính sách lưu trú & Khung giờ</div>
          </div>
          <div style="padding: 14px; font-size: 13px; line-height: 1.8;">
            <div>&bull; Giờ nhận phòng tiêu chuẩn: <b>${policies.standardCheckInTime || '14:00'}</b></div>
            <div>&bull; Giờ trả phòng tiêu chuẩn: <b>${policies.standardCheckOutTime || '12:00'}</b></div>
            <div>&bull; Nhận phòng sớm trước 06:00: <b>Phụ thu 100% giá phòng 1 đêm</b></div>
            <div>&bull; Nhận phòng sớm từ 06:00 - 09:00: <b>Phụ thu 50% giá phòng 1 đêm</b></div>
            <div>&bull; Trả phòng muộn từ 12:00 - 15:00: <b>Phụ thu 30% giá phòng 1 đêm</b></div>
            <div>&bull; Trả phòng muộn từ 15:00 - 18:00: <b>Phụ thu 50% giá phòng 1 đêm</b></div>
            <div>&bull; Trả phòng muộn sau 18:00: <b>Phụ thu 100% giá phòng 1 đêm</b></div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('mainContent').innerHTML = html;
  }

  function openEditPricingPolicyModal(classCode) {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const rc = (data.roomClasses || []).find(c => c.code === classCode);
    if (!rc) return;

    const baseP = rc.basePrice || 1200000;
    const wkndP = rc.weekendPrice || Math.round(baseP * 1.15);
    const hBase = rc.hourlyBase || Math.round(baseP * 0.4);
    const hNext = rc.hourlyNext || Math.round(baseP * 0.1);
    const multiplier = rc.weekendMultiplier || 1.15;

    const modal = document.getElementById('appModal');
    modal.innerHTML = `
      <div class="modal-overlay active" id="modalBackdrop">
        <div class="modal-container" style="max-width: 500px;">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="tag"></i> Cập nhật bảng giá: ${escapeHtml(rc.name)}</div>
            <button class="modal-close-btn" onclick="window.app.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.app.submitPricingPolicyForm(event, '${rc.code}')">
            <div class="modal-body">
              <div style="background: #eff6ff; padding: 10px 12px; border-radius: var(--radius-sm); margin-bottom: 12px; font-size: 12.5px;">
                Mã hạng: <b>${escapeHtml(rc.code)}</b> &bull; Diện tích: <b>${rc.area}m²</b>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Giá cơ sở ngày thường (T2-T5)</label>
                  <input type="number" class="form-control" name="basePrice" id="policyBasePrice" value="${baseP}" min="100000" step="50000" required />
                </div>
                <div class="form-group">
                  <label class="form-label required">Giá cuối tuần (T6-CN)</label>
                  <input type="number" class="form-control" name="weekendPrice" id="policyWeekendPrice" value="${wkndP}" min="100000" step="50000" required />
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Thuê giờ (Block 2 giờ đầu)</label>
                  <input type="number" class="form-control" name="hourlyBase" value="${hBase}" min="50000" step="10000" required />
                </div>
                <div class="form-group">
                  <label class="form-label required">Mỗi giờ tiếp theo</label>
                  <input type="number" class="form-control" name="hourlyNext" value="${hNext}" min="20000" step="10000" required />
                </div>
              </div>

              <div class="form-group">
                <label class="form-label required">Hệ số nhân phụ thu cuối tuần</label>
                <input type="number" class="form-control" name="weekendMultiplier" value="${multiplier}" min="1.0" max="2.5" step="0.05" required />
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Hủy</button>
              <button type="submit" class="btn btn-primary"><i data-lucide="check"></i> Lưu bảng giá</button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: modal });
  }

  function submitPricingPolicyForm(event, classCode) {
    event.preventDefault();
    const form = event.target;
    try {
      const params = {
        basePrice: parseInt(form.basePrice.value, 10) || 1200000,
        weekendPrice: parseInt(form.weekendPrice.value, 10) || 1400000,
        hourlyBase: parseInt(form.hourlyBase.value, 10) || 450000,
        hourlyNext: parseInt(form.hourlyNext.value, 10) || 120000,
        weekendMultiplier: parseFloat(form.weekendMultiplier.value) || 1.15
      };

      store.updatePricingPolicy(classCode, params, state.currentUser);
      closeModal();
      showToast(`Đã cập nhật bảng giá linh hoạt cho hạng phòng ${classCode}!`);
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  // =========================================================================
  // 9. QUẢN LÝ DANH MỤC DỊCH VỤ (SERVICES CATALOG - CRUD)
  // =========================================================================
  function renderServicesCatalog() {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const services = data.services || [];

    let html = `
      <div class="page-header">
        <div class="page-title-box">
          <h1 class="page-title"><i data-lucide="coffee"></i> Quản lý Dịch vụ F&B, Spa, Minibar & Giặt là (${services.length} mục)</h1>
          <div class="page-breadcrumb">Danh mục dịch vụ tính phí, giá bán niêm yết, đồng bộ buồng phòng và phân loại doanh thu</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="window.app.openAddServiceCatalogModal()">
            <i data-lucide="plus-circle"></i> Thêm dịch vụ mới
          </button>
        </div>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Mã DV</th>
              <th>Tên dịch vụ</th>
              <th>Phân loại doanh thu</th>
              <th>Đơn vị tính</th>
              <th class="text-right">Đơn giá niêm yết</th>
              <th class="text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${services.map(sv => `
              <tr>
                <td><span style="font-weight: 700; color: var(--primary);">${escapeHtml(sv.code || sv.id)}</span></td>
                <td>
                  <div style="font-weight: 600;">${escapeHtml(sv.name)}</div>
                  <div style="font-size: 11px; color: var(--text-secondary);">${escapeHtml(sv.description || '')}</div>
                </td>
                <td><span class="badge badge-vacant">${escapeHtml(sv.category)}</span></td>
                <td>${escapeHtml(sv.unit)}</td>
                <td class="text-right font-amount" style="font-weight: 700; color: var(--success);">${fmt.currency(sv.price)}</td>
                <td class="text-right">
                  <div style="display: flex; gap: 4px; justify-content: flex-end;">
                    <button class="btn btn-secondary btn-sm" onclick="window.app.openEditServiceCatalogModal('${sv.id}')">
                      <i data-lucide="edit-3" style="width: 12px; height: 12px;"></i> Sửa
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="window.app.promptDeleteServiceCatalog('${sv.id}')">
                      <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i> Xóa
                    </button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('mainContent').innerHTML = html;
  }

  function openAddServiceCatalogModal() {
    const modal = document.getElementById('appModal');
    modal.innerHTML = `
      <div class="modal-overlay active" id="modalBackdrop">
        <div class="modal-container" style="max-width: 500px;">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="plus-circle"></i> Thêm Dịch vụ mới vào Danh mục</div>
            <button class="modal-close-btn" onclick="window.app.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.app.submitServiceCatalogForm(event, 'add')">
            <div class="modal-body">
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Mã dịch vụ</label>
                  <input type="text" class="form-control" name="code" required placeholder="VD: FB-08, MB-06" style="text-transform: uppercase;" />
                </div>
                <div class="form-group">
                  <label class="form-label required">Tên dịch vụ</label>
                  <input type="text" class="form-control" name="name" required placeholder="VD: Sinh tố bơ Sông Lam" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Phân loại danh mục</label>
                  <select class="form-select" name="category" style="width: 100%;">
                    <option value="Ẩm thực (F&B)">Ẩm thực (F&B)</option>
                    <option value="Minibar trong phòng">Minibar trong phòng</option>
                    <option value="Spa & Massage">Spa & Massage</option>
                    <option value="Giặt là (Laundry)">Giặt là (Laundry)</option>
                    <option value="Dịch vụ khác">Dịch vụ khác</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label required">Đơn vị tính</label>
                  <input type="text" class="form-control" name="unit" required placeholder="Lon, Chai, Suất, Gói, Lượt..." />
                </div>
              </div>
              <div class="form-group">
                <label class="form-label required">Đơn giá niêm yết (VNĐ)</label>
                <input type="number" class="form-control" name="price" required min="5000" step="5000" placeholder="50000" />
              </div>
              <div class="form-group">
                <label class="form-label">Mô tả chi tiết</label>
                <input type="text" class="form-control" name="description" placeholder="Mô tả thành phần, quy cách phục vụ..." />
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Hủy</button>
              <button type="submit" class="btn btn-primary"><i data-lucide="check"></i> Lưu dịch vụ</button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: modal });
  }

  function openEditServiceCatalogModal(serviceId) {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const sv = (data.services || []).find(s => s.id === serviceId);
    if (!sv) return;

    const modal = document.getElementById('appModal');
    modal.innerHTML = `
      <div class="modal-overlay active" id="modalBackdrop">
        <div class="modal-container" style="max-width: 500px;">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="edit-3"></i> Sửa Dịch vụ: ${escapeHtml(sv.name)}</div>
            <button class="modal-close-btn" onclick="window.app.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.app.submitServiceCatalogForm(event, 'edit', '${sv.id}')">
            <div class="modal-body">
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Mã dịch vụ</label>
                  <input type="text" class="form-control" value="${escapeHtml(sv.code || sv.id)}" disabled style="background: #f1f5f9; font-weight: 700;" />
                </div>
                <div class="form-group">
                  <label class="form-label required">Tên dịch vụ</label>
                  <input type="text" class="form-control" name="name" value="${escapeHtml(sv.name)}" required />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Phân loại danh mục</label>
                  <select class="form-select" name="category" style="width: 100%;">
                    <option value="Ẩm thực (F&B)" ${sv.category === 'Ẩm thực (F&B)' ? 'selected' : ''}>Ẩm thực (F&B)</option>
                    <option value="Minibar trong phòng" ${sv.category === 'Minibar trong phòng' ? 'selected' : ''}>Minibar trong phòng</option>
                    <option value="Spa & Massage" ${sv.category === 'Spa & Massage' ? 'selected' : ''}>Spa & Massage</option>
                    <option value="Giặt là (Laundry)" ${sv.category === 'Giặt là (Laundry)' ? 'selected' : ''}>Giặt là (Laundry)</option>
                    <option value="Dịch vụ khác" ${sv.category === 'Dịch vụ khác' ? 'selected' : ''}>Dịch vụ khác</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label required">Đơn vị tính</label>
                  <input type="text" class="form-control" name="unit" value="${escapeHtml(sv.unit)}" required />
                </div>
              </div>
              <div class="form-group">
                <label class="form-label required">Đơn giá niêm yết (VNĐ)</label>
                <input type="number" class="form-control" name="price" value="${sv.price}" required min="5000" step="5000" />
              </div>
              <div class="form-group">
                <label class="form-label">Mô tả chi tiết</label>
                <input type="text" class="form-control" name="description" value="${escapeHtml(sv.description || '')}" />
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Hủy</button>
              <button type="submit" class="btn btn-primary"><i data-lucide="check"></i> Lưu thay đổi</button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: modal });
  }

  function submitServiceCatalogForm(event, mode, targetId = null) {
    event.preventDefault();
    const form = event.target;
    try {
      const params = {
        name: form.name.value.trim(),
        category: form.category.value,
        unit: form.unit.value.trim(),
        price: parseInt(form.price.value, 10) || 0,
        description: form.description ? form.description.value.trim() : ''
      };

      if (mode === 'add') {
        params.code = form.code.value.trim().toUpperCase();
        store.createService(params, state.currentUser);
        showToast(`Đã thêm dịch vụ "${params.name}" vào danh mục thành công!`);
      } else {
        store.updateService(targetId, params, state.currentUser);
        showToast(`Đã cập nhật dịch vụ "${params.name}" thành công!`);
      }
      closeModal();
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function promptDeleteServiceCatalog(serviceId) {
    if (!window.confirm('Xác nhận xóa dịch vụ này khỏi danh mục hệ thống?')) return;
    try {
      store.deleteService(serviceId, state.currentUser);
      showToast('Đã xóa dịch vụ khỏi danh mục!');
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }


  function renderHousekeeping() {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const tasks = data.housekeepingTasks || [];
    const minibarAudits = data.minibarAudits || [];

    let html = `
      <div class="page-header">
        <div class="page-title-box">
          <h1 class="page-title"><i data-lucide="spray-can"></i> Giám sát Buồng phòng & Báo cáo Minibar</h1>
          <div class="page-breadcrumb">Theo dõi quy trình vệ sinh 4 bước (Chờ dọn -> Đang dọn -> Chờ KT -> Sạch) và biên bản kiểm đồ phòng</div>
        </div>
        <div class="page-actions">
          <a href="housekeeping.html" target="_blank" class="btn btn-secondary">
            <i data-lucide="external-link"></i> Mở phân hệ Buồng phòng độc lập
          </a>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div class="card">
          <div class="card-header">
            <div class="card-title"><i data-lucide="list-todo"></i> Phiếu công việc vệ sinh buồng phòng (${tasks.length})</div>
          </div>
          <div class="table-container" style="border: none; max-height: 400px; overflow-y: auto;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Số phòng</th>
                  <th>Loại công việc</th>
                  <th>Nhân viên</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                ${tasks.map(t => `
                  <tr>
                    <td><b>P.${escapeHtml(t.roomNumber)}</b></td>
                    <td>${escapeHtml(t.taskTypeName)}</td>
                    <td>${escapeHtml(t.assignedStaff)}</td>
                    <td>
                      <span class="badge ${t.status === 'completed' ? 'badge-clean' : (t.status === 'in_progress' ? 'badge-cleaning' : 'badge-dirty')}">
                        ${t.status === 'completed' ? 'Đã hoàn thành' : (t.status === 'in_progress' ? 'Đang dọn' : 'Chờ làm')}
                      </span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title"><i data-lucide="wine"></i> Biên bản kiểm kê Minibar gần nhất</div>
          </div>
          <div class="table-container" style="border: none; max-height: 400px; overflow-y: auto;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Số phòng</th>
                  <th>Thời gian kiểm</th>
                  <th>Đồ tiêu thụ</th>
                  <th class="text-right">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                ${minibarAudits.map(mb => {
                  const timeStr = mb.checkoutTime || mb.checkTime || '';
                  const items = mb.itemsUsed || mb.consumedItems || [];
                  return `
                  <tr>
                    <td><b>P.${escapeHtml(mb.roomNumber)}</b></td>
                    <td>${fmt.date(timeStr)}</td>
                    <td>
                      ${items.length > 0 ? 
                        items.map(i => `${escapeHtml(i.name)} x${i.quantity}`).join(', ') : 
                        '<span style="color: var(--text-muted); font-size: 11px;">Không tiêu thụ</span>'
                      }
                    </td>
                    <td class="text-right font-amount" style="color: var(--success);">${fmt.currency(mb.totalAmount)}</td>
                  </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    document.getElementById('mainContent').innerHTML = html;
  }

  // =========================================================================
  // 11. THANH TOÁN & HÓA ĐƠN (BILLING & REFUND WORKFLOW)
  // =========================================================================
  function switchBillingTab(tab) {
    state.billingTab = tab;
    renderBilling();
    if (window.lucide) lucide.createIcons();
  }

  function renderBilling() {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const transactions = data.transactions || [];
    const refunds = data.refundRequests || [];
    const stays = data.stays || [];
    const bookings = data.bookings || [];
    const activeTab = state.billingTab || 'all';

    const canApproveRefund = hasPermission('approveRefund') || state.currentRole === 'manager' || state.currentRole === 'admin';
    const canCompleteRefund = hasPermission('collectPayment') || state.currentRole === 'cashier' || state.currentRole === 'admin';

    // Tính toán Bảng kê Hóa đơn VAT từ các lượt ở đã check-out
    const checkedOutStays = stays.filter(s => s.status === 'checked_out');

    // Công nợ đã phát sinh lấy từ folio, không dùng giá ước tính của đơn đặt.
    const groupDebts = bookings.filter(b => (b.isGroup || b.groupBookingId || b.roomQuantity > 1) && b.bookingStatus !== 'cancelled').map(b => {
      const linked = stays.filter(s => s.bookingId === b.id);
      const folios = linked.map(stay => ({ stay, folio: store.calculateStayFolio(stay.id) })).filter(x => x.folio);
      const total = folios.reduce((sum,x) => sum + x.folio.totalAmount, 0);
      const remaining = folios.reduce((sum,x) => sum + window.SongLamViewData.outstanding(x.stay,x.folio), 0);
      const paid = Math.max(0, total - remaining);
      return {
        bookingId: b.id,
        groupName: b.groupName || b.guestName,
        phone: b.phone,
        companyName: b.companyName || 'Đoàn khách lữ hành',
        roomQuantity: b.roomQuantity || (b.rooms ? b.rooms.length : 1),
        roomClassCode: b.roomClassCode,
        checkInDate: b.checkInDate,
        checkOutDate: b.checkOutDate,
        totalAmount: total,
        paidAmount: paid,
        remainingDebt: remaining,
        status: !linked.length ? 'Chưa lưu trú' : remaining === 0 ? 'Đã đối trừ' : 'Còn phải thu'
      };
    });

    let html = `
      <div class="page-header d-print-none mb-3">
        <div class="row g-2 align-items-center">
          <div class="col">
            <h2 class="page-title d-flex align-items-center gap-2">
              <i data-lucide="receipt" class="text-primary"></i> E. Quản lý Tài chính, Hóa đơn & Công nợ (Billing)
            </h2>
            <div class="text-secondary mt-1" style="font-size: 13px;">
              Nhật ký giao dịch thực thu, phiếu thanh toán mô phỏng, công nợ khách đoàn và quy trình hoàn tiền 3 bước
            </div>
          </div>
          <div class="col-auto ms-auto d-flex gap-2">
            <button class="btn btn-outline-primary btn-sm" onclick="window.app.openRequestRefundModal()">
              <i data-lucide="rotate-ccw"></i> Tạo đề xuất hoàn tiền
            </button>
          </div>
        </div>
      </div>

      <!-- Tab Navigation chuẩn Tabler -->
      <div class="card mb-3">
        <div class="card-body py-2">
          <div class="btn-group" role="group">
            <button class="btn btn-sm ${activeTab === 'all' || activeTab === 'transactions' ? 'btn-primary' : 'btn-outline-secondary'}" onclick="window.app.switchBillingTab('transactions')">
              <i data-lucide="credit-card"></i> Giao dịch thanh toán (${transactions.length})
            </button>
            <button class="btn btn-sm ${activeTab === 'invoices' ? 'btn-primary' : 'btn-outline-secondary'}" onclick="window.app.switchBillingTab('invoices')">
              <i data-lucide="file-text"></i> Phiếu thanh toán (mô phỏng) (${checkedOutStays.length})
            </button>
            <button class="btn btn-sm ${activeTab === 'debts' ? 'btn-primary' : 'btn-outline-secondary'}" onclick="window.app.switchBillingTab('debts')">
              <i data-lucide="users"></i> Công nợ đoàn / công ty (${groupDebts.length})
            </button>
            <button class="btn btn-sm ${activeTab === 'refunds' ? 'btn-primary' : 'btn-outline-secondary'}" onclick="window.app.switchBillingTab('refunds')">
              <i data-lucide="rotate-ccw"></i> Hoàn tiền 3 bước (${refunds.length})
            </button>
            <button class="btn btn-sm ${activeTab === 'sandbox' ? 'btn-primary' : 'btn-outline-secondary'}" onclick="window.app.switchBillingTab('sandbox')">
              <i data-lucide="flask-conical"></i> Sandbox Cổng thanh toán
            </button>
          </div>
        </div>
      </div>
    `;

    // 1. TAB: GIAO DỊCH THANH TOÁN (TRANSACTIONS)
    if (activeTab === 'all' || activeTab === 'transactions') {
      html += `
        <div class="card mb-3">
          <div class="card-header d-flex justify-content-between align-items-center py-2">
            <h3 class="card-title mb-0 fs-5">
              <i data-lucide="credit-card" style="color: #0284c7; width: 18px; height: 18px;"></i>
              Sổ nhật ký giao dịch thanh toán (${transactions.length} bản ghi)
            </h3>
            <span class="text-muted small">Phân biệt rõ: Thành công, Chờ xác minh IPN, Thất bại và Hoàn tiền</span>
          </div>
          <div class="table-responsive">
            <table class="table table-vcenter table-hover card-table">
              <thead>
                <tr>
                  <th>Mã GD</th>
                  <th>Mã tham chiếu cổng/NH</th>
                  <th>Khách hàng</th>
                  <th>Phương thức</th>
                  <th>Loại giao dịch</th>
                  <th class="text-end">Số tiền (VNĐ)</th>
                  <th>Thời gian</th>
                  <th class="text-center">Trạng thái</th>
                  <th class="text-end">Thử nghiệm Sandbox</th>
                </tr>
              </thead>
              <tbody>
                ${transactions.map(t => {
                  let statusBadge = '<span class="badge bg-green text-white">Thành công</span>';
                  if (t.status === 'pending') statusBadge = '<span class="badge bg-warning text-dark">Chờ xác minh IPN</span>';
                  if (t.status === 'failed') statusBadge = '<span class="badge bg-danger text-white">Thất bại</span>';

                  const isRefundTx = t.type === 'refund';

                  return `
                    <tr>
                      <td><span class="badge bg-blue-lt fw-bold">${escapeHtml(t.id)}</span></td>
                      <td style="font-family: monospace; font-size: 11.5px;">${escapeHtml(t.referenceCode)}</td>
                      <td class="fw-bold">${escapeHtml(t.customerName)}</td>
                      <td><span class="badge bg-secondary-lt">${escapeHtml(t.methodName)}</span></td>
                      <td>${isRefundTx ? '<span class="badge bg-danger text-white">Hoàn tiền</span>' : '<span class="badge bg-blue-lt">Thu tiền</span>'}</td>
                      <td class="text-end font-amount fw-bold" style="color: ${isRefundTx ? 'var(--danger)' : (t.status === 'success' ? '#16a34a' : 'inherit')}; font-size: 13.5px;">
                        ${isRefundTx ? '-' : ''}${fmt.currency(t.amount)}
                      </td>
                      <td class="text-secondary small">${fmt.date(t.timestamp)}</td>
                      <td class="text-center">${statusBadge}</td>
                      <td class="text-end">
                        ${t.status === 'pending' ? `
                          <div class="btn-group btn-group-sm">
                            <button class="btn btn-success btn-sm" onclick="window.app.triggerSandboxWebhook('${t.id}', true)" title="Mô phỏng IPN thành công">
                              <i data-lucide="check"></i> IPN Thành công
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="window.app.triggerSandboxWebhook('${t.id}', false)" title="Mô phỏng IPN thất bại">
                              <i data-lucide="x"></i> IPN Thất bại
                            </button>
                          </div>
                        ` : `
                          <span class="small text-muted"><i data-lucide="shield-check" style="width:13px;height:13px;vertical-align:middle;"></i> Idempotent OK</span>
                        `}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    // 2. TAB: BẢNG KÊ / HÓA ĐƠN VAT (INVOICES)
    if (activeTab === 'invoices') {
      html += `
        <div class="card mb-3">
          <div class="card-header d-flex justify-content-between align-items-center py-2">
            <h3 class="card-title mb-0 fs-5">
              <i data-lucide="file-text" style="color: #059669; width: 18px; height: 18px;"></i>
              Bảng kê Quyết toán & Hóa đơn VAT (${checkedOutStays.length} hóa đơn)
            </h3>
            <span class="text-muted small">Căn cứ theo Master Folio & Incidental Folio sau khi trả phòng</span>
          </div>
          <div class="table-responsive">
            <table class="table table-vcenter table-hover card-table">
              <thead>
                <tr>
                  <th>Số HĐ / Lượt ở</th>
                  <th>Phòng</th>
                  <th>Khách hàng</th>
                  <th>Ngày đến & trả</th>
                  <th class="text-end">Tiền phòng</th>
                  <th class="text-end">Dịch vụ & Minibar</th>
                  <th class="text-end">Tổng quyết toán</th>
                  <th class="text-center">Trạng thái</th>
                  <th class="text-end">Hóa đơn</th>
                </tr>
              </thead>
              <tbody>
                ${checkedOutStays.length === 0 ? '<tr><td colspan="9" class="text-center text-muted py-4">Chưa có lượt trả phòng nào được xuất hóa đơn.</td></tr>' : ''}
                ${checkedOutStays.map(s => {
                  const folio = store ? store.calculateStayFolio(s.id) : null;
                  const roomTotal = folio ? folio.roomTotal : 0;
                  const serviceTotal = folio ? (folio.serviceTotal + folio.surchargeTotal) : 0;
                  const grandTotal = folio ? folio.totalAmount : 0;
                  return `
                    <tr>
                      <td><span class="badge bg-green-lt fw-bold">HD-${escapeHtml(s.id)}</span></td>
                      <td><span class="badge bg-primary text-white fw-bold">P.${escapeHtml(s.roomNumber)}</span></td>
                      <td>
                        <div class="fw-bold">${escapeHtml(s.guest.name)}</div>
                        <div class="small text-muted">${escapeHtml(s.guest.phone)}</div>
                      </td>
                      <td class="small text-secondary">${fmt.date(s.checkInDate)} &rarr; ${fmt.date(s.actualCheckOutDate || s.expectedCheckOutDate)}</td>
                      <td class="text-end font-amount">${fmt.currency(roomTotal)}</td>
                      <td class="text-end font-amount">${fmt.currency(serviceTotal)}</td>
                      <td class="text-end font-amount fw-bold text-success">${fmt.currency(grandTotal)}</td>
                      <td class="text-center"><span class="badge bg-green text-white">Đã thanh toán</span></td>
                      <td class="text-end">
                        <button class="btn btn-outline-primary btn-sm" onclick="window.app.printInvoice('${s.id}')">
                          <i data-lucide="printer"></i> In Hóa đơn
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    // 3. TAB: CÔNG NỢ ĐOÀN / CÔNG TY (DEBTS)
    if (activeTab === 'debts') {
      const totalRemainingDebt = groupDebts.reduce((sum, d) => sum + d.remainingDebt, 0);
      html += `
        <div class="card mb-3">
          <div class="card-header d-flex justify-content-between align-items-center py-2">
            <div>
              <h3 class="card-title mb-0 fs-5">
                <i data-lucide="users" style="color: #ea580c; width: 18px; height: 18px;"></i>
                Sổ theo dõi công nợ khách đoàn & doanh nghiệp (${groupDebts.length} hợp đồng đoàn)
              </h3>
              <div class="small text-muted mt-1">Công nợ folio đoàn đã phát sinh: <b class="text-danger font-amount fs-6">${fmt.currency(totalRemainingDebt)}</b></div>
            </div>
            <button class="btn btn-outline-primary btn-sm" onclick="window.app.switchScreen('bookings')">
              <i data-lucide="plus"></i> Đặt phòng đoàn mới
            </button>
          </div>
          <div class="table-responsive">
            <table class="table table-vcenter table-hover card-table">
              <thead>
                <tr>
                  <th>Mã đơn</th>
                  <th>Đoàn / Đơn vị tổ chức</th>
                  <th>Hạng & Số phòng</th>
                  <th>Thời gian lưu trú</th>
                  <th class="text-end">Chi phí folio</th>
                  <th class="text-end">Đã thu / Đối trừ</th>
                  <th class="text-end">Còn phải thu (Nợ)</th>
                  <th class="text-center">Trạng thái công nợ</th>
                  <th class="text-end">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                ${groupDebts.length === 0 ? '<tr><td colspan="9" class="text-center text-muted py-4">Hiện không có công nợ đoàn nào cần thu.</td></tr>' : ''}
                ${groupDebts.map(d => `
                  <tr>
                    <td><span class="badge bg-purple text-white fw-bold">${escapeHtml(d.bookingId)}</span></td>
                    <td>
                      <div class="fw-bold">${escapeHtml(d.groupName)}</div>
                      <div class="small text-muted">${escapeHtml(d.companyName)} &bull; ${escapeHtml(d.phone)}</div>
                    </td>
                    <td><span class="badge bg-secondary-lt">${escapeHtml(d.roomClassCode)}</span> x${d.roomQuantity} phòng</td>
                    <td class="small text-secondary">${fmt.date(d.checkInDate)} &rarr; ${fmt.date(d.checkOutDate)}</td>
                    <td class="text-end font-amount fw-bold">${fmt.currency(d.totalAmount)}</td>
                    <td class="text-end font-amount text-success fw-bold">${fmt.currency(d.paidAmount)}</td>
                    <td class="text-end font-amount fw-bold" style="color: ${d.remainingDebt > 0 ? '#ea580c' : '#16a34a'};">
                      ${fmt.currency(d.remainingDebt)}
                    </td>
                    <td class="text-center">
                      <span class="badge ${d.remainingDebt === 0 ? 'bg-green text-white' : 'bg-warning text-dark'}">
                        ${d.status}
                      </span>
                    </td>
                    <td class="text-end">
                      <button class="btn btn-outline-secondary btn-sm" onclick="window.app.switchScreen('bookings')">
                        Xem chi tiết
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    // 4. TAB: HOÀN TIỀN (REFUNDS)
    if (activeTab === 'all' || activeTab === 'refunds') {
      html += `
        <div class="card mb-3">
          <div class="card-header d-flex justify-content-between align-items-center py-2">
            <h3 class="card-title mb-0 fs-5">
              <i data-lucide="rotate-ccw" style="color: #9d174d; width: 18px; height: 18px;"></i>
              Quy trình hoàn tiền 3 bước (Refund Workflow: Đề xuất &rarr; Quản lý duyệt &rarr; Thu ngân chi)
            </h3>
            <span class="text-muted small">Quy trình chặt chẽ bảo vệ dòng tiền, có kiểm tra số dư khả dụng</span>
          </div>
          <div class="table-responsive">
            <table class="table table-vcenter table-hover card-table">
              <thead>
                <tr>
                  <th>Mã phiếu</th>
                  <th>Khách hàng</th>
                  <th>Lượt ở / Đơn đặt</th>
                  <th class="text-end">Số tiền đề xuất hoàn</th>
                  <th>Lý do hoàn tiền</th>
                  <th>Người tạo</th>
                  <th class="text-center">Trạng thái duyệt</th>
                  <th class="text-end">Thao tác duyệt / Thực chi</th>
                </tr>
              </thead>
              <tbody>
                ${refunds.length === 0 ? '<tr><td colspan="8" class="text-center text-muted py-4">Không có yêu cầu hoàn tiền nào trong danh sách.</td></tr>' : ''}
                ${refunds.map(rf => {
                  let rfStatusBadge = '<span class="badge bg-warning text-dark">Chờ Quản lý duyệt</span>';
                  if (rf.status === 'approved') rfStatusBadge = '<span class="badge bg-azure text-white">Đã duyệt - Chờ chi tiền</span>';
                  if (rf.status === 'completed') rfStatusBadge = '<span class="badge bg-green text-white">Đã thực chi xong</span>';
                  if (rf.status === 'rejected') rfStatusBadge = '<span class="badge bg-danger text-white">Từ chối</span>';

                  return `
                    <tr>
                      <td><span class="badge bg-purple-lt fw-bold">${escapeHtml(rf.id)}</span></td>
                      <td class="fw-bold">${escapeHtml(rf.customerName)}</td>
                      <td><span class="badge bg-secondary-lt">${escapeHtml(rf.stayId || rf.bookingId || '-')}</span></td>
                      <td class="text-end font-amount fw-bold text-danger">${fmt.currency(rf.refundAmount)}</td>
                      <td class="small" style="max-width: 200px;">${escapeHtml(rf.reason)}</td>
                      <td class="small text-secondary">${escapeHtml(rf.requestedBy)}</td>
                      <td class="text-center">${rfStatusBadge}</td>
                      <td class="text-end">
                        ${rf.status === 'pending' ? `
                          <button class="btn btn-primary btn-sm" onclick="window.app.approveRefundRequest('${rf.id}')" ${!canApproveRefund ? 'disabled title="Yêu cầu vai trò Quản lý"' : ''}>
                            <i data-lucide="check-circle"></i> Duyệt hoàn tiền
                          </button>
                        ` : ''}
                        ${rf.status === 'approved' ? `
                          <button class="btn btn-danger btn-sm" onclick="window.app.completeRefundRequest('${rf.id}')" ${!canCompleteRefund ? 'disabled title="Yêu cầu vai trò Thu ngân / Kế toán"' : ''}>
                            <i data-lucide="dollar-sign"></i> Thực chi hoàn tiền
                          </button>
                        ` : ''}
                        ${rf.status === 'completed' ? `
                          <span class="small text-success fw-bold"><i data-lucide="check" style="width:13px;height:13px;vertical-align:middle;"></i> Đã chi hoàn tất</span>
                        ` : ''}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    // 5. TAB: SANDBOX CỔNG THANH TOÁN (SANDBOX MOCK)
    if (activeTab === 'all' || activeTab === 'sandbox') {
      html += `
        <div class="card" style="border-left: 4px solid #1d4ed8;">
          <div class="card-header d-flex justify-content-between align-items-center py-2" style="background: #f8fafc;">
            <div class="d-flex align-items-center gap-2">
              <i data-lucide="flask-conical" class="text-primary"></i>
              <h3 class="card-title mb-0 fs-5 text-primary">Mô phỏng Cổng thanh toán Sandbox (Đồ án học phần)</h3>
            </div>
            <span class="badge bg-blue-lt">Cơ chế Webhook IPN Idempotent</span>
          </div>
          <div class="card-body">
            <div class="text-secondary small mb-3" style="line-height: 1.6;">
              Mô phỏng cơ chế xác thực Webhook / IPN không đồng bộ từ VNPay QR và OnePay. Khi khách quét mã QR thành công trên cổng, Webhook sẽ gửi tín hiệu IPN về hệ thống. Hệ thống thực hiện kiểm tra khóa <b>Idempotency</b> chống ghi nhận lặp dòng tiền.
            </div>
            <div class="row g-2">
              <div class="col-md-6">
                <div class="p-3 border rounded bg-light">
                  <div class="fw-bold mb-1"><i data-lucide="qr-code"></i> Cổng thanh toán VNPay QR</div>
                  <div class="small text-muted mb-2">Hỗ trợ ngân hàng Vietcombank, BIDV, VietinBank, Agribank</div>
                  <span class="badge bg-green text-white">Sandbox Sẵn sàng</span>
                </div>
              </div>
              <div class="col-md-6">
                <div class="p-3 border rounded bg-light">
                  <div class="fw-bold mb-1"><i data-lucide="credit-card"></i> Cổng thanh toán OnePay Quốc tế</div>
                  <div class="small text-muted mb-2">Hỗ trợ thẻ Visa, MasterCard, JCB và thẻ ATM nội địa</div>
                  <span class="badge bg-green text-white">Sandbox Sẵn sàng</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    document.getElementById('mainContent').innerHTML = html;
  }

  // =========================================================================
  // 12. BÁO CÁO & DOANH THU (REPORTS)
  // =========================================================================
  function switchReportFilter(filterKey) {
    state.reportTimeFilter = filterKey;
    renderReports();
  }

  function renderReports() { window.SongLamUI.reports(); }

  function renderSystemAdmin(subTab = null) {
    if (subTab) state.adminSubTab = subTab;
    if (state.adminSubTab === 'audit' ? !hasPermission('viewAuditLog') : !hasPermission('systemConfig')) {
      state.adminSubTab = hasPermission('systemConfig') ? 'roles' : 'audit';
    }
    const activeTab = state.adminSubTab;

    const data = store ? store.getData() : window.HOTEL_DATA;
    const roles = data.roles || [];
    const users = data.users || [];
    const logs = data.auditLogs || [];
    const wDate = store ? store.getWorkingDate() : '2026-10-25';
    const canSystemConfig = hasPermission('systemConfig');

    let html = `
      <div class="page-header d-print-none mb-3">
        <div class="row g-2 align-items-center">
          <div class="col">
            <h2 class="page-title d-flex align-items-center gap-2">
              <i data-lucide="shield" class="text-primary"></i> G. Quản trị hệ thống & Phân quyền (RBAC)
            </h2>
            <div class="text-secondary mt-1" style="font-size: 13px;">
              Chỉnh sửa ma trận phân quyền, quản lý tài khoản, cấu hình ngày nghiệp vụ và tra cứu nhật ký kiểm toán
            </div>
          </div>
          <div class="col-auto ms-auto d-flex gap-2">
            ${activeTab === 'roles' && canSystemConfig ? `
              <button class="btn btn-primary btn-sm" onclick="window.app.openAddRoleModal()">
                <i data-lucide="plus-circle"></i> Thêm vai trò mới
              </button>
            ` : ''}
            ${activeTab === 'users' && canSystemConfig ? `
              <button class="btn btn-primary btn-sm" onclick="window.app.openAddUserModal()">
                <i data-lucide="user-plus"></i> Thêm tài khoản nhân viên
              </button>
            ` : ''}
            ${activeTab === 'config' && canSystemConfig ? `
              <button class="btn btn-danger btn-sm" onclick="window.app.promptResetSampleData()">
                <i data-lucide="rotate-ccw"></i> Khôi phục dữ liệu mẫu hệ thống
              </button>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- Tab navigation -->
      <div class="card mb-3">
        <div class="card-body py-2">
          <div class="btn-group" role="group">
            <button class="btn btn-sm ${activeTab === 'roles' ? 'btn-primary' : 'btn-outline-secondary'}" onclick="window.app.switchAdminTab('roles')">
              <i data-lucide="shield-check"></i> Vai trò & Phân quyền (${roles.length})
            </button>
            <button class="btn btn-sm ${activeTab === 'users' ? 'btn-primary' : 'btn-outline-secondary'}" onclick="window.app.switchAdminTab('users')">
              <i data-lucide="users"></i> Tài khoản người dùng (${users.length})
            </button>
            <button class="btn btn-sm ${activeTab === 'config' ? 'btn-primary' : 'btn-outline-secondary'}" onclick="window.app.switchAdminTab('config')">
              <i data-lucide="settings"></i> Cấu hình ngày & Dữ liệu
            </button>
            <button class="btn btn-sm ${activeTab === 'audit' ? 'btn-primary' : 'btn-outline-secondary'}" onclick="window.app.switchAdminTab('audit')">
              <i data-lucide="history"></i> Nhật ký kiểm toán (${logs.length})
            </button>
          </div>
        </div>
      </div>
    `;

    if (!canSystemConfig && (activeTab === 'roles' || activeTab === 'config')) {
      html += `
        <div class="alert alert-warning d-flex align-items-center gap-2 mb-3" role="alert">
          <i data-lucide="shield-alert" style="width: 20px; height: 20px; flex-shrink: 0;"></i>
          <div>
            <b>Quyền truy cập bị giới hạn:</b> Vai trò hiện tại (<b>${escapeHtml(state.currentUser.roleName)}</b>) không có quyền <code>[systemConfig]</code> để thay đổi cấu hình hoặc ma trận phân quyền. Chuyển sang tài khoản <b>Quản trị viên hệ thống</b> để thực hiện thao tác.
          </div>
        </div>
      `;
    }

    if (activeTab === 'roles') {
      html += `
        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: var(--radius-sm); padding: 10px 14px; margin-bottom: 14px; font-size: 12.5px; color: #1e40af;">
          <i data-lucide="info" style="width: 14px; height: 14px; vertical-align: middle;"></i>
          <b>Chỉnh sửa phân quyền trực tiếp:</b> Bạn có thể bật/tắt từng quyền của từng vai trò ngay trên ma trận dưới đây. Mọi thay đổi được lưu ngay vào <code>SongLamStore</code> và đồng bộ thời gian thực đến tất cả các tab khác.
        </div>

        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th style="min-width: 280px;">Nhóm quyền & Chức năng</th>
                ${roles.map(r => `<th class="text-center" style="min-width: 140px;"><b>${escapeHtml(r.name)}</b></th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${PERMISSION_GROUPS.map(g => `
                <tr style="background: #f1f5f9; font-weight: 700;">
                  <td colspan="${roles.length + 1}" style="padding: 8px 12px; color: var(--primary);">
                    <i data-lucide="${g.icon}" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px;"></i>
                    ${escapeHtml(g.groupName)}
                  </td>
                </tr>
                ${g.permissions.map(p => `
                  <tr>
                    <td>
                      <div style="font-weight: 600; font-size: 12.5px;">${escapeHtml(p.name)}</div>
                      <div style="font-size: 11px; color: var(--text-secondary);">${escapeHtml(p.desc)}</div>
                    </td>
                    ${roles.map(r => {
                      const isChecked = !!(r.permissions && r.permissions[p.key]);
                      return `
                        <td class="text-center">
                          <input type="checkbox" ${isChecked ? 'checked' : ''} ${!canSystemConfig ? 'disabled title="Bạn không có quyền systemConfig để thay đổi"' : ''}
                                 onchange="window.app.toggleRolePermission('${r.code}', '${p.key}', this.checked)"
                                 style="width: 16px; height: 16px; cursor: ${canSystemConfig ? 'pointer' : 'not-allowed'};" />
                        </td>
                      `;
                    }).join('')}
                  </tr>
                `).join('')}
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (activeTab === 'users') {
      html += `
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Mã NV</th>
                <th>Tên đăng nhập</th>
                <th>Họ và tên</th>
                <th>Vai trò</th>
                <th>Bộ phận</th>
                <th>Số điện thoại</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              ${users.map(u => `
                <tr>
                  <td><span style="font-weight: 700; color: var(--primary);">${escapeHtml(u.id)}</span></td>
                  <td><b>${escapeHtml(u.username)}</b></td>
                  <td>${escapeHtml(u.fullName)}</td>
                  <td><span class="badge badge-vacant">${escapeHtml(u.roleName || u.roleCode)}</span></td>
                  <td>${escapeHtml(u.department || 'Vận hành')}</td>
                  <td>${escapeHtml(u.phone || '-')}</td>
                  <td><span class="badge ${u.status === 'active' ? 'badge-clean' : 'badge-maintenance'}">${u.status === 'active' ? 'Hoạt động' : 'Đã khóa'}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (activeTab === 'config') {
      html += `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div class="card">
            <div class="card-header">
              <div class="card-title"><i data-lucide="calendar"></i> Thay đổi Ngày làm việc hệ thống</div>
            </div>
            <div style="padding: 14px;">
              <div class="form-group">
                <label class="form-label required">Ngày làm việc hiện tại</label>
                <input type="date" class="form-control" id="sysWorkingDateInput" value="${wDate}" />
              </div>
              <button class="btn btn-primary" onclick="window.app.saveWorkingDate()">
                <i data-lucide="check"></i> Lưu ngày làm việc mới
              </button>
            </div>
          </div>

          <div class="card" style="border: 1.5px solid #fca5a5;">
            <div class="card-header" style="background: #fef2f2;">
              <div class="card-title" style="color: #991b1b;"><i data-lucide="alert-triangle"></i> Khôi phục dữ liệu mẫu hệ thống</div>
            </div>
            <div style="padding: 14px; font-size: 13px; line-height: 1.6;">
              <p>Thao tác này sẽ đặt lại toàn bộ phòng, đơn đặt, lượt lưu trú và giao dịch về dữ liệu minh họa ban đầu của đồ án. Có hộp thoại xác nhận bắt buộc trước khi khôi phục.</p>
              <button class="btn btn-danger" onclick="window.app.promptResetSampleData()">
                <i data-lucide="rotate-ccw"></i> Xác nhận khôi phục dữ liệu ban đầu
              </button>
            </div>
          </div>
        </div>
      `;
    } else if (activeTab === 'audit') {
      html += `
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Người dùng</th>
                <th>Hành động</th>
                <th>Chi tiết tác vụ</th>
                <th>Địa chỉ IP</th>
              </tr>
            </thead>
            <tbody>
              ${logs.slice(0, 50).map(l => `
                <tr>
                  <td style="font-size: 12px; font-family: monospace;">${fmt.date(l.timestamp)}</td>
                  <td><b>${escapeHtml(l.user)}</b></td>
                  <td><span class="badge badge-vacant">${escapeHtml(l.action)}</span></td>
                  <td>${escapeHtml(l.target)}</td>
                  <td style="font-size: 11px; font-family: monospace; color: var(--text-secondary);">${escapeHtml(l.ip || '192.168.1.1')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    document.getElementById('mainContent').innerHTML = html;
  }

  function switchAdminTab(tabKey) {
    if (!hasPermission(tabKey === 'audit' ? 'viewAuditLog' : 'systemConfig')) return;
    state.adminSubTab = tabKey;
    renderSystemAdmin(tabKey);
    if (window.lucide) lucide.createIcons();
  }

  function toggleRolePermission(roleCode, permKey, isChecked) {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const role = (data.roles || []).find(r => r.code === roleCode);
    if (!role) return;

    if (!role.permissions) role.permissions = {};
    role.permissions[permKey] = isChecked;

    try {
      store.saveRolePermissions(roleCode, role.permissions, state.currentUser);
      showToast(`Đã ${isChecked ? 'bật' : 'tắt'} quyền [${permKey}] cho vai trò ${role.name}!`);
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function saveWorkingDate() {
    const input = document.getElementById('sysWorkingDateInput');
    if (!input || !store) return;
    const newDate = input.value;
    if (!newDate) {
      showToast('Vui lòng chọn ngày hợp lệ!', 'danger');
      return;
    }

    try {
      store.setWorkingDate(newDate, state.currentUser);
      showToast(`Đã chuyển ngày làm việc hệ thống sang ${fmt.date(newDate)}!`);
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function promptResetSampleData() {
    const ok = window.confirm('CẢNH BÁO QUẢN TRỊ:\nBạn có chắc chắn muốn khôi phục toàn bộ hệ thống về dữ liệu mẫu ban đầu không?\nMọi dữ liệu sửa đổi tạm thời trong trình duyệt sẽ được đặt lại.');
    if (!ok) return;

    try {
      store.resetToInitialData(true);
      showToast('Đã khôi phục thành công toàn bộ dữ liệu mẫu hệ thống ban đầu!');
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  // =========================================================================
  // MODALS NGHIỆP VỤ (WALK-IN, CHECK-IN, CHECKOUT, TRANSFER, EXTEND, BOOKING)
  // =========================================================================
  function openQuickWalkInModal() {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const cleanRooms = (data.rooms || []).filter(r => r.stayStatus === 'vacant' && r.cleanStatus === 'clean' && r.exploitationStatus === 'active');
    if (cleanRooms.length === 0) {
      showToast('Hiện không có phòng nào vừa trống vừa sạch để đón khách vãng lai!', 'danger');
      return;
    }
    openDirectCheckInModal(cleanRooms[0].number);
  }

  function openDirectCheckInModal(roomNumber) {
    closeRoomDrawer();
    window._currentDirectRoomNumber = roomNumber;
    const data = store ? store.getData() : window.HOTEL_DATA;
    const room = (data.rooms || []).find(r => r.number === roomNumber);
    if (!room) return;
    const rClass = (data.roomClasses || []).find(c => c.code === room.classCode) || {};
    const wDate = store ? store.getWorkingDate() : '2026-10-25';

    const defaultCheckOutDate = store ? store.addDays(wDate, 1) : '2026-10-26';
    const initialPrice = rClass.basePrice || 1200000;
    const defaultGuarantee = 500000;
    const defaultTotal = initialPrice + defaultGuarantee;

    const modal = document.getElementById('appModal');
    modal.innerHTML = `
      <div class="modal-overlay active" id="modalBackdrop">
        <div class="modal-container" style="max-width: 620px;">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="user-plus"></i> Nhận phòng trực tiếp tại quầy (P.${escapeHtml(roomNumber)})</div>
            <button class="modal-close-btn" onclick="window.app.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.app.submitDirectCheckIn(event, '${roomNumber}')">
            <div class="modal-body">
              <div style="background: #f0f9ff; border: 1px solid #bae6fd; padding: 10px 14px; border-radius: var(--radius-sm); margin-bottom: 12px; font-size: 12.5px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span>Phòng: <b style="font-size: 14px; color: var(--primary);">P.${roomNumber}</b> &bull; Hạng: <b>${escapeHtml(rClass.name || room.classCode)}</b></span>
                  <span class="badge badge-vacant">Giá cơ sở: ${fmt.currency(rClass.basePrice)}/đêm</span>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Họ và tên khách đại diện</label>
                  <input type="text" class="form-control" name="guestName" required placeholder="Nguyễn Văn A" />
                </div>
                <div class="form-group">
                  <label class="form-label required">Số điện thoại</label>
                  <input type="tel" class="form-control" name="phone" required placeholder="0912 345 678" />
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Số CCCD / Hộ chiếu</label>
                  <input type="text" class="form-control" name="identityCard" required placeholder="040089xxxxxx" />
                </div>
                <div class="form-group">
                  <label class="form-label required">Hình thức lưu trú</label>
                  <select class="form-select" name="stayType" id="appDirectStayType" onchange="window.app.onStayTypeChange('${rClass.code}')">
                    <option value="overnight" selected>Theo đêm (Overnight)</option>
                    <option value="hourly">Thuê theo giờ (Hourly Block)</option>
                  </select>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group" id="appHourlyBlockGroup" style="display: none;">
                  <label class="form-label required">Số giờ thuê (Block đầu 2 giờ)</label>
                  <select class="form-select" name="hourlyHours" id="appDirectHourlyHours" onchange="window.app.onHourlyHoursChange('${rClass.code}')">
                    <option value="2" selected>2 giờ (35% giá phòng)</option>
                    <option value="3">3 giờ (+10%/giờ)</option>
                    <option value="4">4 giờ (+10%/giờ)</option>
                    <option value="5">5 giờ (+10%/giờ)</option>
                    <option value="6">6 giờ (+10%/giờ)</option>
                  </select>
                </div>
                <div class="form-group" id="appOvernightDateGroup" style="width: 100%;">
                  <label class="form-label required">Ngày trả phòng</label>
                  <input type="date" class="form-control" name="checkOutDate" id="directCheckOutDate" value="${defaultCheckOutDate}" min="${defaultCheckOutDate}" required 
                         onchange="window.app.onDirectDatesChange('${rClass.code}')" />
                </div>
              </div>

              <div id="directPriceQuote" style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: var(--radius-sm); padding: 8px 12px; font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">
                Số đêm tính: <b>1 đêm</b> &bull; Tiền phòng chốt theo giá: <b style="color: var(--primary);">${fmt.currency(initialPrice)}</b>
              </div>

              <!-- Thanh toán khi nhận phòng (Check-in) -->
              <div style="background: #ffffff; border: 1.5px solid #bfdbfe; border-radius: var(--radius-sm); padding: 12px 14px; margin-bottom: 12px;">
                <div style="font-weight: 700; color: #1e40af; font-size: 13px; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
                  <i data-lucide="shield-check" style="width: 16px; height: 16px;"></i>
                  ĐỐI SOÁT & THU TIỀN KHI CHECK-IN (TIỀN PHÒNG & CỌC ĐẢM BẢO)
                </div>

                <div class="form-row">
                  <div class="form-group" style="margin-bottom: 8px;">
                    <label class="form-label required">Tiền phòng thu trước (VNĐ)</label>
                    <input type="number" class="form-control" name="roomPrepayment" id="directRoomPrepay" value="${initialPrice}" min="0" step="50000" required oninput="window.app.updateDirectTotal()" />
                    <div style="display: flex; gap: 6px; margin-top: 4px;">
                      <button type="button" class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 2px 6px;" onclick="window.app.setPrepaymentPercent(100)">Thu đủ 100%</button>
                      <button type="button" class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 2px 6px;" onclick="window.app.setPrepaymentPercent(50)">Cọc 50%</button>
                      <button type="button" class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 2px 6px;" onclick="window.app.setPrepaymentPercent(0)">0đ (Trả sau)</button>
                    </div>
                  </div>

                  <div class="form-group" style="margin-bottom: 8px;">
                    <label class="form-label required">Tiền cọc đảm bảo (Guarantee Deposit)</label>
                    <input type="number" class="form-control" name="guaranteeDeposit" id="directGuaranteeDeposit" value="${defaultGuarantee}" min="0" step="50000" required oninput="window.app.updateDirectTotal()" />
                    <div style="display: flex; gap: 6px; margin-top: 4px;">
                      <button type="button" class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 2px 6px;" onclick="window.app.setGuaranteeDeposit(500000)">500.000đ</button>
                      <button type="button" class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 2px 6px;" onclick="window.app.setGuaranteeDeposit(1000000)">1.000.000đ</button>
                      <button type="button" class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 2px 6px;" onclick="window.app.setGuaranteeDeposit(0)">Không thu</button>
                    </div>
                  </div>
                </div>

                <div class="form-group" style="margin-top: 6px; margin-bottom: 8px;">
                  <label class="form-label required">Phương thức thanh toán bắt buộc</label>
                  <select class="form-select" name="paymentMethod" id="directPaymentMethod" style="width: 100%;">
                    <option value="cash">Tiền mặt tại quầy</option>
                    <option value="vietqr">Chuyển khoản VietQR</option>
                    <option value="pos_card">Thẻ POS ngân hàng</option>
                  </select>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #bfdbfe; padding-top: 8px; margin-top: 6px; font-weight: 700; color: #1e3a8a; font-size: 13.5px;">
                  <span>TỔNG THỰC THU TẠI QUẦY:</span>
                  <span id="directTotalCollectedDisplay" class="font-amount" style="font-size: 16px; color: var(--primary);">${fmt.currency(defaultTotal)}</span>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Ghi chú đón khách</label>
                <input type="text" class="form-control" name="notes" placeholder="Khách đoàn / Yêu cầu đặc biệt..." />
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Hủy</button>
              <button type="submit" class="btn btn-primary"><i data-lucide="check"></i> Thu tiền, Nhận phòng & Giao chìa khóa</button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: modal });
  }

  function updateDirectTotal() {
    const prepayInput = document.getElementById('directRoomPrepay');
    const guarInput = document.getElementById('directGuaranteeDeposit');
    const display = document.getElementById('directTotalCollectedDisplay');
    if (!prepayInput || !guarInput || !display) return;
    const prepay = parseInt(prepayInput.value, 10) || 0;
    const guar = parseInt(guarInput.value, 10) || 0;
    display.textContent = fmt.currency(prepay + guar);
  }

  function setGuaranteeDeposit(amount) {
    const guarInput = document.getElementById('directGuaranteeDeposit');
    if (guarInput) {
      guarInput.value = amount;
      updateDirectTotal();
    }
  }

  function setPrepaymentPercent(percent) {
    const outInput = document.getElementById('directCheckOutDate');
    const prepayInput = document.getElementById('directRoomPrepay');
    const stayTypeEl = document.getElementById('appDirectStayType');
    if (!prepayInput || !store) return;
    const roomNumber = window._currentDirectRoomNumber;
    const data = store.getData();
    const room = (data.rooms || []).find(r => r.number === roomNumber);
    if (!room) return;

    if (stayTypeEl && stayTypeEl.value === 'hourly') {
      const hours = parseInt(document.getElementById('appDirectHourlyHours')?.value, 10) || 2;
      const pricing = store.calculateHourlyPricing(room.classCode, hours);
      prepayInput.value = Math.round((pricing.total * percent) / 100);
    } else {
      const wDate = store.getWorkingDate();
      const checkOutDate = outInput ? outInput.value : store.addDays(wDate, 1);
      const pricing = store.calculateNightlyPricing(room.classCode, wDate, checkOutDate);
      const total = pricing.totalPerRoom || 0;
      prepayInput.value = Math.round((total * percent) / 100);
    }
    updateDirectTotal();
  }

  function onStayTypeChange(roomClassCode) {
    const stayTypeEl = document.getElementById('appDirectStayType');
    const hourlyGroup = document.getElementById('appHourlyBlockGroup');
    const overnightGroup = document.getElementById('appOvernightDateGroup');
    const quoteBox = document.getElementById('directPriceQuote');
    const prepayInput = document.getElementById('directRoomPrepay');
    const checkOutInput = document.getElementById('directCheckOutDate');
    if (!stayTypeEl || !store) return;

    const isHourly = (stayTypeEl.value === 'hourly');
    if (isHourly) {
      if (hourlyGroup) hourlyGroup.style.display = 'block';
      if (overnightGroup) overnightGroup.style.display = 'none';
      if (checkOutInput) checkOutInput.removeAttribute('required');

      const hours = parseInt(document.getElementById('appDirectHourlyHours')?.value, 10) || 2;
      const pricing = store.calculateHourlyPricing(roomClassCode, hours);
      if (quoteBox) {
        quoteBox.innerHTML = `Hình thức: <b>Thuê theo giờ (${hours} giờ)</b> &bull; Tiền phòng chốt: <b style="color: var(--primary);">${fmt.currency(pricing.total)}</b>`;
      }
      if (prepayInput) {
        prepayInput.value = pricing.total;
        updateDirectTotal();
      }
    } else {
      if (hourlyGroup) hourlyGroup.style.display = 'none';
      if (overnightGroup) overnightGroup.style.display = 'block';
      if (checkOutInput) checkOutInput.setAttribute('required', 'required');
      onDirectDatesChange(roomClassCode);
    }
  }

  function onHourlyHoursChange(roomClassCode) {
    const hours = parseInt(document.getElementById('appDirectHourlyHours')?.value, 10) || 2;
    const pricing = store.calculateHourlyPricing(roomClassCode, hours);
    const quoteBox = document.getElementById('directPriceQuote');
    const prepayInput = document.getElementById('directRoomPrepay');
    if (quoteBox) {
      quoteBox.innerHTML = `Hình thức: <b>Thuê theo giờ (${hours} giờ)</b> &bull; Tiền phòng chốt: <b style="color: var(--primary);">${fmt.currency(pricing.total)}</b>`;
    }
    if (prepayInput) {
      prepayInput.value = pricing.total;
      updateDirectTotal();
    }
  }

  function onDirectDatesChange(classCode) {
    const outInput = document.getElementById('directCheckOutDate');
    const quoteBox = document.getElementById('directPriceQuote');
    const prepayInput = document.getElementById('directRoomPrepay');
    const wDate = store ? store.getWorkingDate() : '2026-10-25';
    if (!outInput || !quoteBox || !store) return;

    try {
      const nights = store.calculateNights(wDate, outInput.value);
      if (nights < 1) {
        quoteBox.innerHTML = '<span style="color: var(--danger); font-weight: 600;">Ngày trả phòng phải sau ngày nhận ít nhất 1 đêm!</span>';
        return;
      }
      const pricing = store.calculateNightlyPricing(classCode, wDate, outInput.value);
      quoteBox.innerHTML = `Số đêm tính: <b>${nights} đêm</b> &bull; Tổng tiền phòng chốt: <b style="color: var(--primary);">${fmt.currency(pricing.totalPerRoom)}</b>`;
      if (prepayInput) {
        prepayInput.value = pricing.totalPerRoom;
        updateDirectTotal();
      }
    } catch (e) {
      quoteBox.innerHTML = `<span style="color: var(--danger);">${escapeHtml(e.message)}</span>`;
    }
  }

  function submitDirectCheckIn(event, roomNumber) {
    event.preventDefault();
    const form = event.target;
    const wDate = store ? store.getWorkingDate() : '2026-10-25';
    const stayType = form.stayType ? form.stayType.value : 'overnight';
    const isHourly = (stayType === 'hourly');
    const hours = isHourly ? (parseInt(form.hourlyHours?.value, 10) || 2) : 0;
    const checkOutDate = form.checkOutDate ? form.checkOutDate.value : wDate;

    let nights = 1;
    if (!isHourly) {
      nights = store ? store.calculateNights(wDate, checkOutDate) : 1;
      if (nights < 1) {
        showToast('Ngày trả phòng phải sau ngày nhận ít nhất 1 đêm!', 'danger');
        return;
      }
    }

    const roomPrepayment = parseInt(form.roomPrepayment.value, 10) || 0;
    const guaranteeDeposit = parseInt(form.guaranteeDeposit.value, 10) || 0;
    const paymentMethod = form.paymentMethod ? form.paymentMethod.value : 'cash';
    let paymentMethodName = 'Tiền mặt tại quầy';
    if (paymentMethod === 'vietqr') paymentMethodName = 'Chuyển khoản VietQR';
    else if (paymentMethod === 'pos_card') paymentMethodName = 'Thẻ POS ngân hàng';

    try {
      const params = {
        roomNumber: roomNumber,
        guestName: form.guestName.value.trim(),
        phone: form.phone.value.trim(),
        identityCard: form.identityCard.value.trim(),
        stayType: stayType,
        isHourly: isHourly,
        hours: hours,
        nights: isHourly ? 0 : nights,
        roomPrepayment: roomPrepayment,
        depositAmount: roomPrepayment,
        guaranteeDeposit: guaranteeDeposit,
        paymentMethod: paymentMethod,
        paymentMethodName: paymentMethodName,
        notes: form.notes ? form.notes.value.trim() : ''
      };

      store.checkInDirect(params, state.currentUser);
      closeModal();
      showToast(`Đã nhận phòng thành công cho khách ${params.guestName} tại P.${roomNumber}!`);
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function openCheckInForBooking(bookingId) {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const booking = (data.bookings || []).find(b => b.id === bookingId);
    if (!booking) return;

    const availableRooms = (data.rooms || []).filter(r => 
      r.classCode === booking.roomClassCode && 
      r.stayStatus === 'vacant' && 
      r.cleanStatus === 'clean' && 
      r.exploitationStatus === 'active'
    );

    const checkedCount = (booking.checkedInRooms || []).length;
    const totalRooms = booking.roomQuantity || 1;

    const nights = booking.nights || store.calculateNights(booking.checkInDate, booking.checkOutDate) || 1;
    let roomPrice = 0;
    if (Array.isArray(booking.nightlyRates) && booking.nightlyRates.length > 0) {
      roomPrice = booking.nightlyRates.reduce((acc, r) => acc + (r.rate || 0), 0);
    } else {
      const pricing = store.calculateNightlyPricing(booking.roomClassCode, booking.checkInDate, booking.checkOutDate);
      roomPrice = pricing.totalPerRoom || (1200000 * nights);
    }

    const allocatedDeposit = Math.round((booking.depositPaid || booking.depositAmount || 0) / totalRooms);
    const remainingPrepay = Math.max(0, roomPrice - allocatedDeposit);
    const defaultGuarantee = 500000;
    const totalCheckInCollect = remainingPrepay + defaultGuarantee;

    const modal = document.getElementById('appModal');
    modal.innerHTML = `
      <div class="modal-overlay active" id="modalBackdrop">
        <div class="modal-container" style="max-width: 580px;">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="check-circle"></i> Nhận phòng theo đơn (${escapeHtml(booking.id)})</div>
            <button class="modal-close-btn" onclick="window.app.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.app.submitCheckInFromBooking(event, '${booking.id}')">
            <div class="modal-body">
              <div style="background: #eff6ff; padding: 12px 14px; border-radius: var(--radius-sm); margin-bottom: 12px; font-size: 12.5px; border: 1px solid #bfdbfe;">
                <div>Khách hàng: <b>${escapeHtml(booking.guestName)}</b> &bull; ĐT: <b>${escapeHtml(booking.phone)}</b></div>
                <div style="margin-top: 4px;">
                  Hạng phòng: <b>${escapeHtml(booking.roomClassCode)}</b> &bull; Tiến độ nhận: <b>${checkedCount}/${totalRooms} phòng</b> &bull; Lưu trú: <b>${fmt.date(booking.checkInDate)} &rarr; ${fmt.date(booking.checkOutDate)}</b> (${nights} đêm)
                </div>
              </div>

              ${availableRooms.length === 0 ? `
                <div class="alert alert-danger" style="padding: 10px; font-size: 12.5px; margin-bottom: 12px;">
                  <i data-lucide="alert-triangle"></i> Cảnh báo: Hiện không còn phòng nào thuộc hạng <b>${escapeHtml(booking.roomClassCode)}</b> vừa trống vừa sạch! Vui lòng yêu cầu buồng phòng duyệt sạch phòng trước.
                </div>
              ` : ''}

              <div class="form-group">
                <label class="form-label required">Chọn số phòng sạch giao cho khách</label>
                <select class="form-select" name="allocatedRoom" style="width: 100%;" required ${availableRooms.length === 0 ? 'disabled' : ''}>
                  ${availableRooms.map(r => `<option value="${r.number}">Phòng ${r.number} (Tầng ${r.floor} - Đã duyệt sạch)</option>`).join('')}
                </select>
              </div>

              <div class="form-group">
                <label class="form-label required">Số CCCD / Hộ chiếu kiểm tra tại quầy</label>
                <input type="text" class="form-control" name="identityCard" required placeholder="040089xxxxxx" />
              </div>

              <!-- Chi tiết tài chính nhận phòng -->
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: var(--radius-sm); padding: 12px 14px; margin-bottom: 12px;">
                <div style="font-weight: 700; color: #0f4c81; font-size: 13px; margin-bottom: 8px;">
                  ĐỐI SOÁT TÀI CHÍNH CHECK-IN (CHO 1 PHÒNG)
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 12.5px; margin-bottom: 4px;">
                  <span>Tiền phòng theo đơn (đã khóa giá):</span>
                  <b>${fmt.currency(roomPrice)}</b>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 12.5px; margin-bottom: 4px; color: var(--success);">
                  <span>Cọc online/chuyển khoản đã trừ cho phòng này:</span>
                  <b>-${fmt.currency(allocatedDeposit)}</b>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 12.5px; margin-bottom: 6px; color: #b45309;">
                  <span>Tiền phòng còn lại cần thu:</span>
                  <b>${fmt.currency(remainingPrepay)}</b>
                </div>

                <div class="form-row" style="margin-top: 10px;">
                  <div class="form-group" style="margin-bottom: 0;">
                    <label class="form-label required">Khoản tiền phòng thu thêm (VNĐ)</label>
                    <input type="number" class="form-control" name="roomPrepaymentRemaining" id="appBookingPrepayRem" value="${remainingPrepay}" min="0" step="50000" oninput="window.app.updateBookingCheckInTotal()" />
                  </div>
                  <div class="form-group" style="margin-bottom: 0;">
                    <label class="form-label required">Cọc đảm bảo (Guarantee Deposit)</label>
                    <input type="number" class="form-control" name="guaranteeDeposit" id="appBookingGuaranteeDeposit" value="${defaultGuarantee}" min="0" step="50000" oninput="window.app.updateBookingCheckInTotal()" />
                  </div>
                </div>

                <div class="form-group" style="margin-top: 10px; margin-bottom: 0;">
                  <label class="form-label required">Phương thức thanh toán</label>
                  <select class="form-select" name="paymentMethod" id="appBookingPaymentMethod" style="width: 100%;">
                    <option value="cash">Tiền mặt tại quầy</option>
                    <option value="vietqr">Chuyển khoản VietQR</option>
                    <option value="pos_card">Thẻ POS ngân hàng</option>
                  </select>
                </div>

                <div style="background: #eff6ff; border: 1.5px solid #93c5fd; border-radius: var(--radius-sm); padding: 8px 12px; margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-size: 12.5px; font-weight: 700; color: #1e40af;">TỔNG THU CHECK-IN TẠI QUẦY:</span>
                  <span id="appBookingTotalCheckInDisplay" style="font-size: 15px; font-weight: 800; color: #1d4ed8;">${fmt.currency(totalCheckInCollect)}</span>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Hủy</button>
              <button type="submit" class="btn btn-primary" ${availableRooms.length === 0 ? 'disabled' : ''}>
                <i data-lucide="check"></i> Thu tiền & Xác nhận Giao phòng
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: modal });
  }

  function updateBookingCheckInTotal() {
    const prepayInput = document.getElementById('appBookingPrepayRem');
    const guarInput = document.getElementById('appBookingGuaranteeDeposit');
    const display = document.getElementById('appBookingTotalCheckInDisplay');
    if (!prepayInput || !guarInput || !display) return;
    const prepay = parseInt(prepayInput.value, 10) || 0;
    const guar = parseInt(guarInput.value, 10) || 0;
    display.textContent = fmt.currency(prepay + guar);
  }

  function submitCheckInFromBooking(event, bookingId) {
    event.preventDefault();
    const form = event.target;
    const roomNumber = form.allocatedRoom.value;
    const idCard = form.identityCard.value.trim();
    const guaranteeDeposit = parseInt(form.guaranteeDeposit.value, 10) || 0;
    const roomPrepaymentRemaining = parseInt(form.roomPrepaymentRemaining.value, 10) || 0;
    const paymentMethod = form.paymentMethod ? form.paymentMethod.value : 'cash';
    let paymentMethodName = 'Tiền mặt tại quầy';
    if (paymentMethod === 'vietqr') paymentMethodName = 'Chuyển khoản VietQR';
    else if (paymentMethod === 'pos_card') paymentMethodName = 'Thẻ POS ngân hàng';

    try {
      const guestDetails = {
        identityCard: idCard,
        guaranteeDeposit: guaranteeDeposit,
        roomPrepaymentRemaining: roomPrepaymentRemaining,
        paymentMethod: paymentMethod,
        paymentMethodName: paymentMethodName
      };

      store.checkInBookingRoom(bookingId, roomNumber, guestDetails, state.currentUser);
      closeModal();
      showToast(`Đã nhận phòng P.${roomNumber} cho đơn ${bookingId} thành công!`);
      renderCurrentScreen();
    } catch (err) {
      if (err.message && err.message.includes('adjustBookingForEarlyArrival')) {
        const wDate = store.getWorkingDate();
        const doAdjust = window.confirm(`Khách đến nhận phòng sớm hơn so với đơn đặt ban đầu!\n\nBạn có muốn tự động điều chỉnh ngày nhận đơn đặt sang ngày làm việc hiện tại (${wDate}), cập nhật lại số đêm và giá phòng rồi hoàn tất nhận phòng không?`);
        if (doAdjust) {
          try {
            store.adjustBookingForEarlyArrival(bookingId, wDate, state.currentUser, 'Khách đến nhận phòng sớm tại quầy lễ tân');
            store.checkInBookingRoom(bookingId, roomNumber, guestDetails, state.currentUser);
            closeModal();
            showToast(`Đã điều chỉnh lịch đến sớm và nhận phòng P.${roomNumber} thành công!`);
            renderCurrentScreen();
            return;
          } catch (adjustErr) {
            showToast(adjustErr.message, 'danger');
            return;
          }
        }
      }
      showToast(err.message, 'danger');
    }
  }

  function promptCancelBooking(bookingId) {
    const reason = window.prompt(`Xác nhận hủy đơn đặt phòng ${bookingId}?\nVui lòng nhập lý do hủy đặt phòng (bắt buộc):`);
    if (reason === null) return;
    if (!reason.trim()) {
      showToast('Bắt buộc phải nhập lý do hủy đặt phòng!', 'danger');
      return;
    }

    try {
      store.cancelBooking(bookingId, reason.trim(), state.currentUser);
      showToast(`Đã hủy đơn đặt phòng ${bookingId} và giải phóng quỹ phòng!`);
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function openCheckoutModal(roomNumber) {
    closeRoomDrawer();
    const data = store ? store.getData() : window.HOTEL_DATA;
    const room = (data.rooms || []).find(r => r.number === roomNumber);
    if (!room) return;
    const stay = (data.stays || []).find(s => s.id === room.currentStayId && s.status === 'in_house');
    if (!stay) {
      showToast('Không tìm thấy lượt lưu trú hợp lệ đang mở cho phòng này!', 'danger');
      return;
    }

    const folio = store.calculateStayFolio(stay.id);
    if (!folio) {
      showToast('Lỗi tính toán Folio thanh toán!', 'danger');
      return;
    }

    // Tự động kiểm tra phụ thu trả phòng muộn
    const lateSurcharge = store.calculateLateCheckOutSurcharge ? store.calculateLateCheckOutSurcharge(stay.id) : { surchargeRate: 0, amount: 0 };
    window._currentCheckoutStayId = stay.id;
    window._currentLateSurcharge = lateSurcharge;

    const remainingDue = folio.billedToMaster ? folio.incidentalFolio.balanceDue : folio.remainingDue;
    const isBalanceCleared = (remainingDue <= 0);

    const isHourly = (stay.stayType === 'hourly');
    const minibarAudited = folio.minibarAudited;
    const isGroupStay = folio.isGroupStay;
    const billedToMaster = folio.billedToMaster;

    const modal = document.getElementById('appModal');
    modal.innerHTML = `
      <div class="modal-overlay active" id="modalBackdrop">
        <div class="modal-container" style="max-width: 780px;">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="receipt"></i> Quyết toán trả phòng (P.${escapeHtml(roomNumber)} - ${escapeHtml(stay.guest.name)})</div>
            <button class="modal-close-btn" onclick="window.app.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <div class="modal-body" style="max-height: 75vh; overflow-y: auto;">
            <!-- Thông tin tóm tắt lưu trú -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: var(--radius-sm); padding: 10px 14px; margin-bottom: 12px; font-size: 12.5px;">
              <b>P.${escapeHtml(roomNumber)}</b> &bull; Khách: <b>${escapeHtml(stay.guest.name)}</b> &bull; ĐT: ${escapeHtml(stay.guest.phone)} &bull; CCCD: ${escapeHtml(stay.guest.identityCard)}<br>
              ${isHourly ? `
                Lưu trú: <b>Thuê theo giờ (${stay.hours || 2} giờ)</b> &bull; Nhận: <b>${stay.checkInDate}</b> &bull; Dự kiến trả: <b>${stay.expectedCheckOutDate}</b>
              ` : `
                Lưu trú: <b>${fmt.date(stay.checkInDate)} &rarr; ${fmt.date(stay.expectedCheckOutDate)}</b> (${stay.nights} đêm)
              `}
            </div>

            <!-- Cảnh báo Minibar nếu chưa kiểm kê -->
            ${!minibarAudited ? `
              <div style="background: #fef2f2; border: 1.5px solid #f87171; border-radius: var(--radius-sm); padding: 10px 14px; margin-bottom: 12px; font-size: 12.5px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                  <div style="color: #991b1b;">
                    <b>⚠️ Chưa có biên bản kiểm kê Minibar từ Buồng phòng!</b><br>
                    <span>Theo quy trình PMS, Thu ngân / Lễ tân có thể xác nhận nhanh tại quầy nếu khách không dùng minibar để không bị kẹt thanh toán.</span>
                  </div>
                  <label style="display: flex; align-items: center; gap: 6px; font-weight: 700; color: #15803d; cursor: pointer; background: #ffffff; padding: 4px 8px; border-radius: 4px; border: 1px solid #bbf7d0;">
                    <input type="checkbox" id="confirmMinibarZeroCheck" checked />
                    Xác nhận nhanh: Tủ lạnh nguyên seal (0đ)
                  </label>
                </div>
              </div>
            ` : `
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: var(--radius-sm); padding: 6px 12px; margin-bottom: 12px; font-size: 12px; color: #166534; display: flex; align-items: center; gap: 6px;">
                <i data-lucide="check-circle" style="width: 14px; height: 14px;"></i>
                Đã có biên bản kiểm kê minibar từ Buồng phòng (${fmt.currency(folio.minibarTotal)}).
              </div>
            `}

            <!-- Cảnh báo & Tùy chọn Phụ thu trả phòng muộn -->
            ${lateSurcharge && lateSurcharge.surchargeRate > 0 ? `
              <div style="background: #fffbeb; border: 1.5px solid #f59e0b; border-radius: var(--radius-sm); padding: 10px 14px; margin-bottom: 12px; font-size: 12.5px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                  <div>
                    <b style="color: #b45309;">⏰ Phát hiện trả phòng muộn sau 12:00 (Thời điểm: ${escapeHtml(lateSurcharge.timeChecked)})</b><br>
                    <span>${escapeHtml(lateSurcharge.reason)}</span>
                  </div>
                  <label style="display: flex; align-items: center; gap: 6px; font-weight: 700; color: #b45309; cursor: pointer; background: #ffffff; padding: 4px 8px; border-radius: 4px; border: 1px solid #fde68a;">
                    <input type="checkbox" id="applyLateCheckoutCheck" checked onchange="window.app.toggleLateCheckout('${stay.id}')" />
                    Tính phụ thu (${fmt.currency(lateSurcharge.amount)})
                  </label>
                </div>
              </div>
            ` : ''}

            <!-- Phân tách Master Folio vs Incidental Folio cho Khách Đoàn -->
            ${isGroupStay ? `
              <div style="background: #eff6ff; border: 1.5px solid #60a5fa; border-radius: var(--radius-sm); padding: 10px 14px; margin-bottom: 12px; font-size: 12.5px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                  <div>
                    <b style="color: #1d4ed8;"><i data-lucide="users" style="width: 14px; height: 14px; vertical-align: middle;"></i> Đơn lưu trú thuộc Khách đoàn / Công ty (${escapeHtml(stay.bookingId || 'Đoàn')})</b><br>
                    ${billedToMaster ? `
                      <span style="color: #15803d; font-weight: 600;">✓ Tiền phòng (${fmt.currency(folio.masterFolio.roomCharges)}) đã chuyển sang Master Folio đoàn. Khách chỉ cần thanh toán phát sinh cá nhân (Incidental).</span>
                    ` : `
                      <span style="color: #475569;">Tiền phòng hiện tính trực tiếp tại phòng. Quản lý/Lễ tân có thể chuyển sang Master Folio để Trưởng đoàn/Công ty thanh toán chung.</span>
                    `}
                  </div>
                  ${!billedToMaster ? `
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.transferToMasterFolio('${stay.id}')">
                      <i data-lucide="share-2" style="width: 14px; height: 14px;"></i> Chuyển tiền phòng vào Master Folio
                    </button>
                  ` : ''}
                </div>
              </div>
            ` : ''}

            <!-- Bảng chi tiết Folio -->
            <div style="font-weight: 700; color: #0f4c81; font-size: 13px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
              <span>1. CHI TIẾT CHI PHÍ LƯU TRÚ & DỊCH VỤ</span>
              <div style="display: flex; gap: 6px;">
                ${!isHourly && stay.nights > 1 ? `
                  <button class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 2px 8px;" onclick="window.app.openShortenStayModal('${stay.id}')">
                    <i data-lucide="clock" style="width: 12px; height: 12px;"></i> Rút ngắn lưu trú (Trả sớm)
                  </button>
                ` : ''}
                <button class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 2px 8px;" onclick="window.app.openAddSurchargeModal('${stay.id}')">
                  <i data-lucide="plus-circle" style="width: 12px; height: 12px;"></i> Thêm phụ thu hư hỏng/phạt
                </button>
              </div>
            </div>

            <table class="data-table" style="margin-bottom: 12px; font-size: 12px;">
              <thead>
                <tr>
                  <th>Khoản mục chi phí</th>
                  <th class="text-center">Số lượng</th>
                  <th class="text-right">Đơn giá</th>
                  <th class="text-center">Trạng thái ghi nhận</th>
                  <th class="text-right">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>${isHourly ? `Tiền phòng thuê theo giờ (${stay.hours || 2} giờ)` : 'Tiền phòng lưu trú (chốt theo đêm)'}</b></td>
                  <td class="text-center">${isHourly ? `${stay.hours || 2} giờ` : `${stay.nights} đêm`}</td>
                  <td class="text-right">${fmt.currency(stay.roomRate)}</td>
                  <td class="text-center">
                    ${billedToMaster ? `
                      <span class="badge" style="background: #dbeafe; color: #1e40af; font-size: 10px;">MASTER FOLIO</span>
                    ` : `
                      <span class="badge badge-vacant">Đã chốt giá</span>
                    `}
                  </td>
                  <td class="text-right font-amount" style="${billedToMaster ? 'text-decoration: line-through; color: var(--text-muted);' : ''}">${fmt.currency(folio.roomCharges)}</td>
                </tr>

                ${(stay.servicesUsed || []).map(sv => {
                  const isPaid = sv.paymentStatus === 'paid';
                  const isMb = !!sv.isMinibar;
                  return `
                    <tr style="${isMb ? 'background: #f0fdf4;' : ''}">
                      <td>
                        ${isMb ? '<span class="badge badge-clean" style="font-size: 10px; margin-right: 4px;">Minibar</span>' : ''}
                        ${escapeHtml(sv.name)}
                      </td>
                      <td class="text-center">x${sv.quantity}</td>
                      <td class="text-right">${fmt.currency(sv.unitPrice)}</td>
                      <td class="text-center">
                        ${isPaid ? 
                          '<span class="badge badge-clean" style="font-size: 10px;">ĐÃ TRẢ NGAY</span>' : 
                          '<span class="badge badge-maintenance" style="font-size: 10px;">GHI NỢ FOLIO</span>'}
                      </td>
                      <td class="text-right font-amount" style="${isPaid ? 'color: var(--text-muted); text-decoration: line-through;' : ''}">
                        ${fmt.currency(sv.amount)}
                      </td>
                    </tr>
                  `;
                }).join('')}

                ${(stay.surcharges || []).map(sc => `
                  <tr style="background: #fff1f2;">
                    <td><span class="badge badge-occupied" style="font-size: 10px; margin-right: 4px;">Phụ thu</span> ${escapeHtml(sc.name || sc.description)}</td>
                    <td class="text-center">1</td>
                    <td class="text-right">${fmt.currency(sc.amount)}</td>
                    <td class="text-center"><span class="badge badge-occupied" style="font-size: 10px;">Phát sinh</span></td>
                    <td class="text-right font-amount" style="color: var(--danger);">${fmt.currency(sc.amount)}</td>
                  </tr>
                `).join('')}

                <tr id="appLateSurchargeRow" style="background: #fefce8; display: ${lateSurcharge && lateSurcharge.surchargeRate > 0 ? 'table-row' : 'none'};">
                  <td><span class="badge" style="background: #fef08a; color: #854d0e; font-size: 10px; margin-right: 4px;">Check-out muộn</span> ${escapeHtml(lateSurcharge ? lateSurcharge.reason : '')}</td>
                  <td class="text-center">1</td>
                  <td class="text-right">${fmt.currency(lateSurcharge ? lateSurcharge.amount : 0)}</td>
                  <td class="text-center"><span class="badge" style="background: #fef08a; color: #854d0e; font-size: 10px;">Phụ thu muộn</span></td>
                  <td class="text-right font-amount" style="color: #b45309;">${fmt.currency(lateSurcharge ? lateSurcharge.amount : 0)}</td>
                </tr>
              </tbody>
            </table>

            <!-- Bảng tổng hợp & Cấn trừ cọc đảm bảo -->
            <div style="background: #f0f9ff; border: 1.5px solid #93c5fd; border-radius: var(--radius-sm); padding: 12px 14px; font-size: 13px;">
              <div style="font-weight: 700; color: #1e40af; font-size: 13px; margin-bottom: 8px;">
                2. QUYẾT TOÁN CÔNG NỢ & HOÀN CỌC ĐẢM BẢO
              </div>

              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span>Tổng chi phí phát sinh trong thời gian ở:</span>
                <span class="font-amount" style="font-weight: 700;">${fmt.currency(folio.totalAmount)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: var(--success);">
                <span>Tiền phòng đã thu trước / Cọc đã cấn trừ:</span>
                <span class="font-amount">-${fmt.currency(folio.netPaid)}</span>
              </div>
              ${billedToMaster ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: #1d4ed8; font-weight: 600;">
                  <span>Tiền phòng chuyển Master Folio (Trưởng đoàn/Công ty):</span>
                  <span class="font-amount">-${fmt.currency(folio.masterFolio.roomCharges)}</span>
                </div>
              ` : ''}

              <div style="margin: 8px 0; border-top: 1px dashed #bfdbfe;"></div>

              <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: #0284c7;">
                <span>Tiền cọc đảm bảo khả dụng (Guarantee Deposit):</span>
                <span class="font-amount">${fmt.currency(folio.guaranteeDeposit)}</span>
              </div>
              ${folio.guaranteeDepositDeduction > 0 ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: var(--danger);">
                  <span>Cấn trừ cọc đảm bảo vào số dư nợ:</span>
                  <span class="font-amount">-${fmt.currency(folio.guaranteeDepositDeduction)}</span>
                </div>
              ` : ''}
              ${folio.guaranteeDepositRefund > 0 ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: var(--success); font-weight: 600;">
                  <span>Tiền cọc đảm bảo hoàn trả lại khách:</span>
                  <span class="font-amount">${fmt.currency(folio.guaranteeDepositRefund)}</span>
                </div>
              ` : ''}

              <div style="display: flex; justify-content: space-between; border-top: 1.5px solid #93c5fd; padding-top: 8px; margin-top: 4px; font-size: 15px; font-weight: 800; color: ${remainingDue > 0 ? 'var(--danger)' : 'var(--success)'};">
                <span>${remainingDue > 0 ? 'SỐ TIỀN CÒN PHẢI THU TẠI QUẦY:' : (remainingDue < 0 ? 'SỐ TIỀN HOÀN LẠI KHÁCH:' : 'KHÁCH ĐÃ TẤT TOÁN ĐỦ:')}</span>
                <span id="appCheckoutRemainingDueDisplay">${fmt.currency(Math.abs(remainingDue))}</span>
              </div>
            </div>

            <!-- Form thu tiền khi còn nợ (Chặn hoàn tất nếu chưa thu) -->
            ${!isBalanceCleared ? `
              <div id="appCheckoutCollectSection" style="margin-top: 12px; background: #fffbeb; border: 1.5px solid #fde68a; border-radius: var(--radius-sm); padding: 12px 14px;">
                <div style="font-weight: 700; color: #b45309; font-size: 13px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                  <i data-lucide="alert-circle" style="width: 16px; height: 16px;"></i>
                  Yêu cầu nghiệp vụ: Thu đủ số tiền còn lại trước khi bàn giao hóa đơn và giải phóng phòng!
                </div>
                <div class="form-row">
                  <div class="form-group" style="margin-bottom: 0;">
                    <label class="form-label required">Phương thức thu tiền còn lại</label>
                    <select class="form-select" id="appSettlementPaymentMethod" style="width: 100%;">
                      <option value="cash">Tiền mặt tại quầy</option>
                      <option value="bank_transfer">Chuyển khoản VietQR</option>
                      <option value="credit_card">Quẹt thẻ POS ngân hàng</option>
                    </select>
                  </div>
                  <div class="form-group" style="margin-bottom: 0;">
                    <label class="form-label required">Số tiền thu quyết toán</label>
                    <input type="text" class="form-control" id="appCheckoutCollectAmountInput" value="${fmt.currency(remainingDue)}" disabled style="font-weight: 800; color: var(--danger); background: #f1f5f9;" />
                  </div>
                </div>
              </div>
            ` : `
              <div style="margin-top: 12px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: var(--radius-sm); padding: 10px 14px; color: #047857; font-weight: 600; font-size: 13px;">
                <i data-lucide="check-circle" style="width: 16px; height: 16px; vertical-align: middle;"></i>
                Số dư công nợ đã được quyết toán đầy đủ. Phòng sẽ tự động chuyển sang CHỜ DỌN (Dirty) sau khi xác nhận.
              </div>
            `}
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="window.app.printInvoice('${stay.id}')">
              <i data-lucide="printer"></i> In Phiếu thanh toán
            </button>
            <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Đóng</button>
            <button type="button" class="btn btn-danger" onclick="window.app.confirmCheckoutFolio('${stay.id}')">
              <i data-lucide="check"></i> ${!isBalanceCleared ? 'Thu tiền & Hoàn tất Check-out' : 'Hoàn tất Check-out'}
            </button>
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: modal });
  }

  function toggleLateCheckout(stayId) {
    const applyCheck = document.getElementById('applyLateCheckoutCheck');
    const row = document.getElementById('appLateSurchargeRow');
    const late = window._currentLateSurcharge || { amount: 0 };
    if (!applyCheck || !row) return;

    row.style.display = applyCheck.checked ? 'table-row' : 'none';
    const folio = store.calculateStayFolio(stayId);
    let baseDue = folio.billedToMaster ? folio.incidentalFolio.balanceDue : folio.remainingDue;
    if (applyCheck.checked) {
      baseDue += late.amount;
    }
    const display = document.getElementById('appCheckoutRemainingDueDisplay');
    const input = document.getElementById('appCheckoutCollectAmountInput');
    if (display) display.textContent = fmt.currency(Math.abs(baseDue));
    if (input) input.value = fmt.currency(Math.max(0, baseDue));
  }

  function openShortenStayModal(stayId) {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const stay = (data.stays || []).find(s => s.id === stayId && s.status === 'in_house');
    if (!stay) return;
    const wDate = store ? store.getWorkingDate() : '2026-10-25';
    const inDate = stay.checkInDate.split(' ')[0];
    const oldOutDate = stay.expectedCheckOutDate.split(' ')[0];

    const modal = document.getElementById('appModal');
    modal.innerHTML = `
      <div class="modal-overlay active" id="modalBackdrop">
        <div class="modal-container" style="max-width: 520px;">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="clock"></i> Rút ngắn lưu trú / Trả phòng sớm (P.${escapeHtml(stay.roomNumber)})</div>
            <button class="modal-close-btn" onclick="window.app.openCheckoutModal('${stay.roomNumber}')"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.app.submitShortenStay(event, '${stay.id}')">
            <div class="modal-body">
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: var(--radius-sm); padding: 10px 14px; margin-bottom: 12px; font-size: 12.5px;">
                Phòng: <b>P.${escapeHtml(stay.roomNumber)}</b> &bull; Khách: <b>${escapeHtml(stay.guest.name)}</b><br>
                Ngày nhận: <b>${fmt.date(inDate)}</b> &bull; Dự kiến trả cũ: <b>${fmt.date(oldOutDate)}</b> (${stay.nights} đêm)
              </div>
              <div class="form-group">
                <label class="form-label required">Ngày trả phòng thực tế mới</label>
                <input type="date" class="form-control" name="newCheckOutDate" id="shortenNewDate" value="${wDate}" min="${inDate}" max="${oldOutDate}" required />
                <small style="color: var(--text-secondary); margin-top: 4px; display: block;">
                  Hệ thống sẽ cập nhật lại số đêm thực tế và tính lại tiền phòng trên Folio.
                </small>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.app.openCheckoutModal('${stay.roomNumber}')">Hủy</button>
              <button type="submit" class="btn btn-primary"><i data-lucide="check"></i> Cập nhật trả sớm</button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: modal });
  }

  function submitShortenStay(event, stayId) {
    event.preventDefault();
    const form = event.target;
    const newDate = form.newCheckOutDate.value;
    try {
      const res = store.shortenStay(stayId, newDate, state.currentUser);
      showToast(`Đã rút ngắn lưu trú P.${res.stay.roomNumber} về ${res.newNights} đêm thành công!`);
      openCheckoutModal(res.stay.roomNumber);
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function transferToMasterFolio(stayId) {
    try {
      const res = store.transferRoomChargeToMasterFolio(stayId, state.currentUser);
      showToast(`Đã chuyển tiền phòng P.${res.stay.roomNumber} vào Master Folio đoàn!`);
      openCheckoutModal(res.stay.roomNumber);
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function confirmCheckoutFolio(stayId) {
    const paymentMethodEl = document.getElementById('appSettlementPaymentMethod');
    const paymentMethod = paymentMethodEl ? paymentMethodEl.value : 'cash';
    let methodName = 'Tiền mặt tại quầy';
    if (paymentMethod === 'bank_transfer') methodName = 'Chuyển khoản VietQR';
    else if (paymentMethod === 'credit_card') methodName = 'Quẹt thẻ POS';

    const confirmMb = document.getElementById('confirmMinibarZeroCheck');
    const applyLateCheck = document.getElementById('applyLateCheckoutCheck');

    try {
      const settlementDetails = {
        confirmedPayment: true,
        paymentMethod: paymentMethod,
        methodName: methodName,
        autoCreateMinibarAudit: confirmMb ? confirmMb.checked : true,
        confirmMinibarZero: confirmMb ? confirmMb.checked : true
      };

      if (applyLateCheck && applyLateCheck.checked) {
        const lateInfo = store.calculateLateCheckOutSurcharge ? store.calculateLateCheckOutSurcharge(stayId) : null;
        if (lateInfo && lateInfo.amount > 0) {
          settlementDetails.lateCheckOutSurcharge = lateInfo;
        }
      }

      store.settleAndCheckout(stayId, settlementDetails, state.currentUser);
      closeModal();
      showToast('Đã quyết toán và trả phòng thành công! Phòng đã chuyển sang trạng thái CHỜ DỌN.');
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function openAddSurchargeModal(stayId) {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const stay = (data.stays || []).find(s => s.id === stayId && s.status === 'in_house');
    if (!stay) {
      showToast('Không tìm thấy lượt lưu trú hợp lệ!', 'danger');
      return;
    }

    const modal = document.getElementById('appModal');
    modal.innerHTML = `
      <div class="modal-overlay active" id="modalBackdrop">
        <div class="modal-container" style="max-width: 480px;">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="alert-triangle"></i> Thêm phụ thu / Bồi thường (P.${escapeHtml(stay.roomNumber)})</div>
            <button class="modal-close-btn" onclick="window.app.openCheckoutModal('${stay.roomNumber}')"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.app.submitAddSurcharge(event, '${stayId}')">
            <div class="modal-body">
              <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: var(--radius-sm); padding: 10px 12px; margin-bottom: 12px; font-size: 12.5px; color: #991b1b;">
                Phòng: <b>${escapeHtml(stay.roomNumber)}</b> &bull; Khách: <b>${escapeHtml(stay.guest.name)}</b>
              </div>

              <div class="form-group">
                <label class="form-label required">Loại phụ thu</label>
                <select class="form-select" name="surchargeType" style="width: 100%;">
                  <option value="damage">Hư hỏng trang thiết bị trong phòng</option>
                  <option value="penalty">Phạt vi phạm quy định (hút thuốc, ồn ào...)</option>
                  <option value="late_checkout">Phụ thu trả phòng muộn (Late check-out)</option>
                  <option value="lost_item">Mất thẻ phòng / Đồ dùng</option>
                  <option value="other">Khoản phụ thu khác</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label required">Lý do / Mô tả chi tiết</label>
                <input type="text" class="form-control" name="surchargeReason" required placeholder="Ví dụ: Vỡ ly thủy tinh Ocean, Mất thẻ từ..." />
              </div>

              <div class="form-group">
                <label class="form-label required">Số tiền phụ thu (VNĐ)</label>
                <input type="number" class="form-control" name="surchargeAmount" id="appSurchargeAmountInput" required min="10000" step="10000" placeholder="100000" />
                <div style="display: flex; gap: 6px; margin-top: 6px;">
                  <button type="button" class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 2px 8px;" onclick="document.getElementById('appSurchargeAmountInput').value = 100000;">100.000đ</button>
                  <button type="button" class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 2px 8px;" onclick="document.getElementById('appSurchargeAmountInput').value = 200000;">200.000đ</button>
                  <button type="button" class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 2px 8px;" onclick="document.getElementById('appSurchargeAmountInput').value = 500000;">500.000đ</button>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.app.openCheckoutModal('${stay.roomNumber}')">Quay lại</button>
              <button type="submit" class="btn btn-danger"><i data-lucide="check"></i> Ghi nhận phụ thu vào Folio</button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: modal });
  }

  function submitAddSurcharge(event, stayId) {
    event.preventDefault();
    const form = event.target;
    const type = form.surchargeType.value;
    const reason = form.surchargeReason.value.trim();
    const amount = parseInt(form.surchargeAmount.value, 10) || 0;

    const data = store ? store.getData() : window.HOTEL_DATA;
    const stay = (data.stays || []).find(s => s.id === stayId);
    if (!stay) return;

    try {
      store.addSurchargeToStay(stayId, { type, reason, amount }, state.currentUser);
      showToast(`Đã thêm phụ thu "${reason}" (${fmt.currency(amount)}) thành công!`);
      openCheckoutModal(stay.roomNumber);
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }


  function openTransferRoomModal(stayId) {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const stay = (data.stays || []).find(s => s.id === stayId && s.status === 'in_house');
    if (!stay) return;

    const availableRooms = (data.rooms || []).filter(r => 
      r.number !== stay.roomNumber &&
      r.stayStatus === 'vacant' &&
      r.cleanStatus === 'clean' &&
      r.exploitationStatus === 'active'
    );

    const modal = document.getElementById('appModal');
    modal.innerHTML = `
      <div class="modal-overlay active" id="modalBackdrop">
        <div class="modal-container" style="max-width: 500px;">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="arrow-right-left"></i> Chuyển phòng (P.${escapeHtml(stay.roomNumber)})</div>
            <button class="modal-close-btn" onclick="window.app.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.app.submitTransferRoom(event, '${stayId}')">
            <div class="modal-body">
              <div style="background: #e0f2fe; padding: 10px 14px; border-radius: var(--radius-sm); margin-bottom: 12px; font-size: 12.5px;">
                Khách: <b>${escapeHtml(stay.guest.name)}</b> &bull; Phòng hiện tại: <b>P.${escapeHtml(stay.roomNumber)}</b> (${escapeHtml(stay.roomClassCode)})
              </div>
              <div class="form-group">
                <label class="form-label required">Chọn phòng sạch đích đến</label>
                <select class="form-select" name="targetRoom" style="width: 100%;" required ${availableRooms.length === 0 ? 'disabled' : ''}>
                  ${availableRooms.map(r => `<option value="${r.number}">Phòng ${r.number} (${r.classCode} - Tầng ${r.floor})</option>`).join('')}
                </select>
                ${availableRooms.length === 0 ? '<div style="font-size: 11px; color: var(--danger); margin-top: 4px;">Hiện không có phòng sạch nào sẵn sàng để chuyển!</div>' : ''}
              </div>
              <div class="form-group">
                <label class="form-label required">Lý do chuyển phòng (Bắt buộc theo nghiệp vụ)</label>
                <input type="text" class="form-control" name="reason" required placeholder="Khách yêu cầu đổi phòng / Lỗi kỹ thuật..." />
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Hủy</button>
              <button type="submit" class="btn btn-primary" ${availableRooms.length === 0 ? 'disabled' : ''}>Xác nhận chuyển phòng</button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: modal });
  }

  function submitTransferRoom(event, stayId) {
    event.preventDefault();
    const form = event.target;
    const targetRoom = form.targetRoom.value;
    const reason = form.reason.value.trim();

    try {
      store.transferRoom(stayId, targetRoom, reason, state.currentUser);
      closeModal();
      showToast(`Đã chuyển khách sang phòng ${targetRoom} thành công!`);
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function openExtendStayModal(stayId) {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const stay = (data.stays || []).find(s => s.id === stayId && s.status === 'in_house');
    if (!stay) return;

    const currentCheckOut = stay.expectedCheckOutDate.split(' ')[0];
    const minDate = store ? store.addDays(currentCheckOut, 1) : currentCheckOut;

    const modal = document.getElementById('appModal');
    modal.innerHTML = `
      <div class="modal-overlay active" id="modalBackdrop">
        <div class="modal-container" style="max-width: 500px;">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="clock"></i> Gia hạn thời gian lưu trú (P.${escapeHtml(stay.roomNumber)})</div>
            <button class="modal-close-btn" onclick="window.app.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.app.submitExtendStay(event, '${stayId}')">
            <div class="modal-body">
              <div style="background: #e0f2fe; padding: 10px 14px; border-radius: var(--radius-sm); margin-bottom: 12px; font-size: 12.5px;">
                Khách: <b>${escapeHtml(stay.guest.name)}</b> &bull; Ngày trả hiện tại: <b>${fmt.date(currentCheckOut)}</b>
              </div>
              <div class="form-group">
                <label class="form-label required">Ngày trả phòng mới</label>
                <input type="date" class="form-control" name="newCheckOutDate" value="${minDate}" min="${minDate}" required />
              </div>
              <div style="font-size: 12px; color: var(--text-secondary);">
                Hệ thống sẽ tự động kiểm tra quỹ phòng của hạng <b>${escapeHtml(stay.roomClassCode)}</b> trong khoảng gia hạn để đảm bảo không trùng đơn đặt trước.
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Hủy</button>
              <button type="submit" class="btn btn-primary">Xác nhận gia hạn</button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: modal });
  }

  function submitExtendStay(event, stayId) {
    event.preventDefault();
    const form = event.target;
    const newCheckOutDate = form.newCheckOutDate.value;

    try {
      store.extendStay(stayId, newCheckOutDate, state.currentUser);
      closeModal();
      showToast(`Đã gia hạn thành công phòng đến ngày ${fmt.date(newCheckOutDate)}!`);
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function openCreateBookingModal() {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const roomClasses = data.roomClasses || [];
    const wDate = store ? store.getWorkingDate() : '2026-10-25';
    const checkInDefault = store ? store.addDays(wDate, 1) : '2026-10-26';
    const checkOutDefault = store ? store.addDays(wDate, 3) : '2026-10-28';

    const modal = document.getElementById('appModal');
    modal.innerHTML = `
      <div class="modal-overlay active" id="modalBackdrop">
        <div class="modal-container" style="max-width: 620px;">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="calendar-plus"></i> Tạo đơn đặt phòng mới</div>
            <button class="modal-close-btn" onclick="window.app.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.app.submitCreateBooking(event)">
            <div class="modal-body">
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Ngày nhận phòng</label>
                  <input type="date" class="form-control" name="checkInDate" id="appBkCheckInDate" value="${checkInDefault}" min="${wDate}" required 
                         onchange="window.app.onAppBookingFormChange()" />
                </div>
                <div class="form-group">
                  <label class="form-label required">Ngày trả phòng</label>
                  <input type="date" class="form-control" name="checkOutDate" id="appBkCheckOutDate" value="${checkOutDefault}" min="${checkInDefault}" required 
                         onchange="window.app.onAppBookingFormChange()" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Hạng phòng</label>
                  <select class="form-select" name="roomClassCode" id="appBkRoomClassCode" style="width: 100%;" required 
                          onchange="window.app.onAppBookingFormChange()">
                    ${roomClasses.map(rc => `<option value="${rc.code}">${rc.name} (${fmt.currency(rc.basePrice)}/đêm)</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label required">Số lượng phòng</label>
                  <input type="number" class="form-control" name="roomQuantity" id="appBkRoomQuantity" value="1" min="1" max="10" required 
                         onchange="window.app.onAppBookingFormChange()" />
                </div>
              </div>

              <div id="appBookingQuoteBox" style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: var(--radius-sm); padding: 10px 14px; margin-bottom: 12px; font-size: 12.5px;">
                Đang tính toán giá và kiểm tra quỹ phòng...
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Tên khách đại diện</label>
                  <input type="text" class="form-control" name="guestName" required placeholder="Nguyễn Văn A" />
                </div>
                <div class="form-group">
                  <label class="form-label required">Số điện thoại</label>
                  <input type="tel" class="form-control" name="phone" required placeholder="0912 345 678" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Email</label>
                  <input type="email" class="form-control" name="email" placeholder="khach@email.com" />
                </div>
                <div class="form-group">
                  <label class="form-label">Tiền cọc ghi nhận (VNĐ)</label>
                  <input type="number" class="form-control" name="depositAmount" value="0" min="0" step="50000" />
                  <span style="font-size: 11px; color: var(--text-secondary);">Để 0 nếu chưa thu cọc</span>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Ghi chú yêu cầu của khách</label>
                <input type="text" class="form-control" name="notes" placeholder="Tầng cao, không hút thuốc..." />
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Hủy</button>
              <button type="submit" class="btn btn-primary" id="btnAppSubmitBooking">Xác nhận tạo đơn</button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: modal });
    onAppBookingFormChange();
  }

  function onAppBookingFormChange() {
    const inInput = document.getElementById('appBkCheckInDate');
    const outInput = document.getElementById('appBkCheckOutDate');
    const classSelect = document.getElementById('appBkRoomClassCode');
    const qtyInput = document.getElementById('appBkRoomQuantity');
    const quoteBox = document.getElementById('appBookingQuoteBox');
    const btnSubmit = document.getElementById('btnAppSubmitBooking');

    if (!inInput || !outInput || !classSelect || !qtyInput || !quoteBox || !store) return;

    const checkIn = inInput.value;
    const checkOut = outInput.value;
    const classCode = classSelect.value;
    const qty = parseInt(qtyInput.value, 10) || 1;

    try {
      const nights = store.calculateNights(checkIn, checkOut);
      if (nights < 1) {
        quoteBox.innerHTML = '<span style="color: var(--danger); font-weight: 700;">Ngày trả phòng phải sau ngày nhận ít nhất 1 đêm!</span>';
        if (btnSubmit) btnSubmit.disabled = true;
        return;
      }

      const avail = store.checkRoomAvailability(classCode, checkIn, checkOut);
      const pricing = store.calculateNightlyPricing(classCode, checkIn, checkOut);
      const totalEstimated = pricing.totalPerRoom * qty;

      if (!avail.valid || avail.availableQuantity < qty) {
        quoteBox.innerHTML = `
          <div style="color: var(--danger); font-weight: 700;">
            Hết phòng: Hạng ${classCode} chỉ còn <b>${avail.availableQuantity} phòng</b> trống trong khoảng này (yêu cầu: ${qty} phòng).
          </div>
        `;
        if (btnSubmit) btnSubmit.disabled = true;
      } else {
        quoteBox.innerHTML = `
          <div style="color: var(--success); font-weight: 600;">
            Quỹ phòng khả dụng: <b>${avail.availableQuantity} phòng</b> &bull; Số đêm: <b>${nights} đêm</b>
          </div>
          <div style="margin-top: 2px;">
            Tổng giá trị đơn dự kiến: <b style="color: var(--primary); font-size: 14px;">${fmt.currency(totalEstimated)}</b>
          </div>
        `;
        if (btnSubmit) btnSubmit.disabled = false;
      }
    } catch (e) {
      quoteBox.innerHTML = `<span style="color: var(--danger);">${escapeHtml(e.message)}</span>`;
      if (btnSubmit) btnSubmit.disabled = true;
    }
  }

  function submitCreateBooking(event) {
    event.preventDefault();
    const form = event.target;

    try {
      const params = {
        guestName: form.guestName.value.trim(),
        phone: form.phone.value.trim(),
        email: form.email ? form.email.value.trim() : '',
        checkInDate: form.checkInDate.value,
        checkOutDate: form.checkOutDate.value,
        roomClassCode: form.roomClassCode.value,
        roomQuantity: parseInt(form.roomQuantity.value, 10) || 1,
        depositAmount: parseInt(form.depositAmount.value, 10) || 0,
        notes: form.notes ? form.notes.value.trim() : ''
      };

      const newBooking = store.createBooking(params, state.currentUser);
      closeModal();
      showToast(`Đã tạo đơn đặt phòng ${newBooking.id} thành công!`);
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function openRoomDrawer(roomId) {
    state.selectedRoomId = roomId;
    const data = store ? store.getData() : window.HOTEL_DATA;
    const room = (data.rooms || []).find(r => r.id === roomId);
    if (!room) return;
    const stay = (data.stays || []).find(s => s.id === room.currentStayId && s.status === 'in_house');
    const rClass = (data.roomClasses || []).find(c => c.code === room.classCode) || {};

    const drawer = document.getElementById('roomDrawer');
    const overlay = document.getElementById('drawerOverlay');

    let html = `
      <div class="drawer-header">
        <div class="drawer-title-box">
          <div class="drawer-room-badge">Phòng ${room.number}</div>
          <div>
            <div style="font-weight: 700; font-size: 14px;">${escapeHtml(rClass.name)}</div>
            <div style="font-size: 11.5px; color: var(--text-secondary);">Tầng ${room.floor} &bull; Diện tích: ${rClass.area}m²</div>
          </div>
        </div>
        <button class="modal-close-btn" onclick="window.app.closeRoomDrawer()"><i data-lucide="x"></i></button>
      </div>
      <div class="drawer-body">
        ${stay && room.stayStatus === 'occupied' ? `
          <div class="drawer-section">
            <div class="drawer-section-title">Khách đang lưu trú</div>
            <div class="info-grid">
              <span class="info-label">Họ và tên:</span>
              <span class="info-value" style="color: #0284c7; font-weight: 700;">${escapeHtml(stay.guest.name)}</span>
              <span class="info-label">Số điện thoại:</span>
              <span class="info-value">${escapeHtml(stay.guest.phone)}</span>
              <span class="info-label">CCCD:</span>
              <span class="info-value">${escapeHtml(stay.guest.identityCard)}</span>
              <span class="info-label">Nhận phòng:</span>
              <span class="info-value">${fmt.date(stay.checkInDate)}</span>
              <span class="info-label">Dự kiến trả:</span>
              <span class="info-value">${fmt.date(stay.expectedCheckOutDate)}</span>
              <span class="info-label">Tiền cọc:</span>
              <span class="info-value" style="color: var(--success); font-weight: 600;">${fmt.currency(stay.depositAmount)}</span>
            </div>
          </div>

          <div class="drawer-section">
            <div class="drawer-section-title">Dịch vụ đã sử dụng (${(stay.servicesUsed || []).length})</div>
            ${(stay.servicesUsed || []).length === 0 ? '<div style="font-size: 12px; color: var(--text-secondary);">Chưa có dịch vụ phát sinh</div>' : `
              <div style="max-height: 180px; overflow-y: auto;">
                ${stay.servicesUsed.map(s => `
                  <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #f1f5f9; font-size: 12px;">
                    <span>${s.isMinibar ? '<span class="badge badge-clean">Minibar</span> ' : ''}${escapeHtml(s.name)} (x${s.quantity})</span>
                    <span class="font-amount">${fmt.currency(s.amount)}</span>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        ` : `
          <div style="padding: 20px; text-align: center; color: var(--text-secondary);">
            Phòng hiện đang trống.<br>
            Trạng thái vệ sinh: <b>${room.cleanStatus === 'clean' ? 'Sạch' : 'Chờ dọn'}</b><br>
            Giá cơ sở: <b>${fmt.currency(rClass.basePrice)}/đêm</b>
          </div>
        `}
      </div>
      <div class="drawer-footer">
        ${room.stayStatus === 'occupied' && stay ? `
          <button class="btn btn-secondary btn-sm" onclick="window.app.openAddServiceModal('${room.number}')">Thêm dịch vụ</button>
          <button class="btn btn-secondary btn-sm" onclick="window.app.openTransferRoomModal('${stay.id}')">Đổi phòng</button>
          <button class="btn btn-secondary btn-sm" onclick="window.app.openExtendStayModal('${stay.id}')">Gia hạn</button>
          <button class="btn btn-danger btn-sm" onclick="window.app.openCheckoutModal('${room.number}')">Trả phòng & Thu tiền</button>
        ` : `
          ${room.cleanStatus === 'clean' && room.exploitationStatus === 'active' ? `
            <button class="btn btn-primary" style="width: 100%;" onclick="window.app.openDirectCheckInModal('${room.number}')">Nhận phòng ngay</button>
          ` : '<button class="btn btn-secondary disabled" style="width: 100%;" disabled>Chờ xử lý buồng phòng</button>'}
        `}
      </div>
    `;

    drawer.innerHTML = html;
    drawer.classList.add('open');
    overlay.classList.add('active');
    if (window.lucide) lucide.createIcons({ root: drawer });
  }

  function closeRoomDrawer() {
    const drawer = document.getElementById('roomDrawer');
    const overlay = document.getElementById('drawerOverlay');
    if (drawer) drawer.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
  }

  
  function approveRoomClean(roomNumber) {
    try {
      store.updateRoomCleanStatus(roomNumber, 'clean', state.currentUser);
      showToast(`Đã nghiệm thu và duyệt phòng ${roomNumber} SẠCH! Phòng chuyển sang trạng thái SẴN SÀNG NHẬN KHÁCH.`, 'success');
      closeRoomDrawer();
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function toggleRoomMaintenance(roomNumber) {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const room = (data.rooms || []).find(r => r.number === roomNumber);
    if (!room) return;

    if (room.stayStatus === 'occupied') {
      showToast('Không thể khóa bảo trì phòng đang có khách ở!', 'danger');
      return;
    }

    try {
      const isMaint = room.exploitationStatus === 'maintenance';
      store.toggleRoomMaintenance(roomNumber, isMaint ? 'Mở lại khai thác' : 'Khóa bảo trì định kỳ', state.currentUser);
      showToast(isMaint ? `Đã mở khai thác phòng ${roomNumber}!` : `Đã tạm khóa phòng ${roomNumber} để bảo trì!`);
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function openAddServiceModal(roomNumber) {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const services = data.services || [];
    const modal = document.getElementById('appModal');
    modal.innerHTML = `
      <div class="modal-overlay active" id="modalBackdrop">
        <div class="modal-container" style="max-width: 500px;">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="coffee"></i> Thêm dịch vụ cho P.${escapeHtml(roomNumber)}</div>
            <button class="modal-close-btn" onclick="window.app.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.app.submitAddService(event, '${roomNumber}')">
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label required">Chọn dịch vụ</label>
                <select class="form-select" name="serviceId" id="appAddServiceIdSelect" style="width: 100%;" required onchange="window.app.updateServiceAmountPreview()">
                  ${services.map(s => `<option value="${s.id}" data-price="${s.price}">${s.name} - ${fmt.currency(s.price)} / ${s.unit}</option>`).join('')}
                </select>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Số lượng</label>
                  <input type="number" class="form-control" name="quantity" id="appAddServiceQtyInput" value="1" min="1" max="50" required oninput="window.app.updateServiceAmountPreview()" />
                </div>
                <div class="form-group">
                  <label class="form-label">Thành tiền tạm tính</label>
                  <input type="text" class="form-control" id="appAddServiceAmountPreview" value="${fmt.currency(services[0] ? services[0].price : 0)}" disabled style="font-weight: 700; color: var(--primary); background: #f8fafc;" />
                </div>
              </div>

              <!-- Payment option -->
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: var(--radius-sm); padding: 10px 12px; margin-bottom: 12px;">
                <label class="form-label required" style="font-weight: 700; margin-bottom: 6px;">Hình thức thanh toán dịch vụ:</label>
                <div style="display: flex; gap: 16px; margin-bottom: 8px;">
                  <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px;">
                    <input type="radio" name="paymentOption" value="room_charge" checked onchange="window.app.toggleServicePaymentMethod(false)" />
                    Ghi nợ vào Folio (Trả khi Check-out)
                  </label>
                  <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px;">
                    <input type="radio" name="paymentOption" value="immediate" onchange="window.app.toggleServicePaymentMethod(true)" />
                    Thanh toán ngay tại chỗ
                  </label>
                </div>

                <div id="appServicePaymentMethodWrap" style="display: none; margin-top: 8px; border-top: 1px dashed #cbd5e1; padding-top: 8px;">
                  <label class="form-label required">Phương thức thanh toán ngay</label>
                  <select class="form-select" name="paymentMethod" style="width: 100%;">
                    <option value="cash">Tiền mặt tại quầy</option>
                    <option value="vietqr">Chuyển khoản VietQR</option>
                    <option value="pos_card">Thẻ POS ngân hàng</option>
                  </select>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Ghi chú phục vụ</label>
                <input type="text" class="form-control" name="notes" placeholder="Yêu cầu riêng của khách..." />
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Hủy</button>
              <button type="submit" class="btn btn-primary"><i data-lucide="check"></i> Xác nhận cung cấp dịch vụ</button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: modal });
  }

  function toggleServicePaymentMethod(show) {
    const wrap = document.getElementById('appServicePaymentMethodWrap');
    if (wrap) wrap.style.display = show ? 'block' : 'none';
  }

  function updateServiceAmountPreview() {
    const select = document.getElementById('appAddServiceIdSelect');
    const qtyInput = document.getElementById('appAddServiceQtyInput');
    const preview = document.getElementById('appAddServiceAmountPreview');
    if (!select || !qtyInput || !preview) return;
    const selectedOpt = select.options[select.selectedIndex];
    const price = selectedOpt ? parseInt(selectedOpt.dataset.price, 10) || 0 : 0;
    const qty = parseInt(qtyInput.value, 10) || 1;
    preview.value = fmt.currency(price * qty);
  }

  function submitAddService(event, roomNumber) {
    event.preventDefault();
    const form = event.target;
    const serviceId = form.serviceId.value;
    const qty = parseInt(form.quantity.value, 10) || 1;
    const notes = form.notes ? form.notes.value.trim() : '';
    const paymentOption = form.paymentOption ? form.paymentOption.value : 'room_charge';
    const paymentMethod = form.paymentMethod ? form.paymentMethod.value : 'cash';

    const data = store ? store.getData() : window.HOTEL_DATA;
    const stay = (data.stays || []).find(s => s.roomNumber === roomNumber && s.status === 'in_house');
    if (!stay) {
      showToast('Không tìm thấy lượt lưu trú!', 'danger');
      return;
    }

    try {
      store.addServiceToStay(stay.id, serviceId, qty, notes, state.currentUser, paymentOption, paymentMethod);
      closeModal();
      showToast(`Đã thêm dịch vụ thành công cho P.${roomNumber}!`);
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }


  function openExtendStayModal(stayId) {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const stay = (data.stays || []).find(s => s.id === stayId && s.status === 'in_house');
    if (!stay) return;

    const currentCheckOut = stay.expectedCheckOutDate.split(' ')[0];
    const minDate = store ? store.addDays(currentCheckOut, 1) : currentCheckOut;

    const modal = document.getElementById('appModal');
    modal.innerHTML = `
      <div class="modal-overlay active" id="modalBackdrop">
        <div class="modal-container" style="max-width: 500px;">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="clock"></i> Gia hạn thời gian lưu trú (P.${escapeHtml(stay.roomNumber)})</div>
            <button class="modal-close-btn" onclick="window.app.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.app.submitExtendStay(event, '${stayId}')">
            <div class="modal-body">
              <div style="background: #e0f2fe; padding: 10px 14px; border-radius: var(--radius-sm); margin-bottom: 12px; font-size: 12.5px;">
                Khách: <b>${escapeHtml(stay.guest.name)}</b> &bull; Ngày trả hiện tại: <b>${fmt.date(currentCheckOut)}</b>
              </div>
              <div class="form-group">
                <label class="form-label required">Ngày trả phòng mới</label>
                <input type="date" class="form-control" name="newCheckOutDate" value="${minDate}" min="${minDate}" required />
              </div>
              <div style="font-size: 12px; color: var(--text-secondary);">
                Hệ thống sẽ tự động kiểm tra quỹ phòng của hạng <b>${escapeHtml(stay.roomClassCode)}</b> trong khoảng gia hạn để đảm bảo không trùng đơn đặt trước.
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Hủy</button>
              <button type="submit" class="btn btn-primary">Xác nhận gia hạn</button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: modal });
  }

  function submitExtendStay(event, stayId) {
    event.preventDefault();
    const form = event.target;
    const newCheckOutDate = form.newCheckOutDate.value;

    try {
      store.extendStay(stayId, newCheckOutDate, state.currentUser);
      closeModal();
      showToast(`Đã gia hạn thành công phòng đến ngày ${fmt.date(newCheckOutDate)}!`);
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function openCreateBookingModal() {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const roomClasses = data.roomClasses || [];
    const wDate = store ? store.getWorkingDate() : '2026-10-25';
    const checkInDefault = store ? store.addDays(wDate, 1) : '2026-10-26';
    const checkOutDefault = store ? store.addDays(wDate, 3) : '2026-10-28';

    const modal = document.getElementById('appModal');
    modal.innerHTML = `
      <div class="modal-overlay active" id="modalBackdrop">
        <div class="modal-container" style="max-width: 620px;">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="calendar-plus"></i> Tạo đơn đặt phòng mới</div>
            <button class="modal-close-btn" onclick="window.app.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.app.submitCreateBooking(event)">
            <div class="modal-body">
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Ngày nhận phòng</label>
                  <input type="date" class="form-control" name="checkInDate" id="appBkCheckInDate" value="${checkInDefault}" min="${wDate}" required 
                         onchange="window.app.onAppBookingFormChange()" />
                </div>
                <div class="form-group">
                  <label class="form-label required">Ngày trả phòng</label>
                  <input type="date" class="form-control" name="checkOutDate" id="appBkCheckOutDate" value="${checkOutDefault}" min="${checkInDefault}" required 
                         onchange="window.app.onAppBookingFormChange()" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Hạng phòng</label>
                  <select class="form-select" name="roomClassCode" id="appBkRoomClassCode" style="width: 100%;" required 
                          onchange="window.app.onAppBookingFormChange()">
                    ${roomClasses.map(rc => `<option value="${rc.code}">${rc.name} (${fmt.currency(rc.basePrice)}/đêm)</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label required">Số lượng phòng</label>
                  <input type="number" class="form-control" name="roomQuantity" id="appBkRoomQuantity" value="1" min="1" max="10" required 
                         onchange="window.app.onAppBookingFormChange()" />
                </div>
              </div>

              <div id="appBookingQuoteBox" style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: var(--radius-sm); padding: 10px 14px; margin-bottom: 12px; font-size: 12.5px;">
                Đang tính toán giá và kiểm tra quỹ phòng...
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Tên khách đại diện</label>
                  <input type="text" class="form-control" name="guestName" required placeholder="Nguyễn Văn A" />
                </div>
                <div class="form-group">
                  <label class="form-label required">Số điện thoại</label>
                  <input type="tel" class="form-control" name="phone" required placeholder="0912 345 678" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Email</label>
                  <input type="email" class="form-control" name="email" placeholder="khach@email.com" />
                </div>
                <div class="form-group">
                  <label class="form-label">Tiền cọc ghi nhận (VNĐ)</label>
                  <input type="number" class="form-control" name="depositAmount" value="0" min="0" step="50000" />
                  <span style="font-size: 11px; color: var(--text-secondary);">Để 0 nếu chưa thu cọc</span>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Ghi chú yêu cầu của khách</label>
                <input type="text" class="form-control" name="notes" placeholder="Tầng cao, không hút thuốc..." />
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Hủy</button>
              <button type="submit" class="btn btn-primary" id="btnAppSubmitBooking">Xác nhận tạo đơn</button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: modal });
    onAppBookingFormChange();
  }

  function onAppBookingFormChange() {
    const inInput = document.getElementById('appBkCheckInDate');
    const outInput = document.getElementById('appBkCheckOutDate');
    const classSelect = document.getElementById('appBkRoomClassCode');
    const qtyInput = document.getElementById('appBkRoomQuantity');
    const quoteBox = document.getElementById('appBookingQuoteBox');
    const btnSubmit = document.getElementById('btnAppSubmitBooking');

    if (!inInput || !outInput || !classSelect || !qtyInput || !quoteBox || !store) return;

    const checkIn = inInput.value;
    const checkOut = outInput.value;
    const classCode = classSelect.value;
    const qty = parseInt(qtyInput.value, 10) || 1;

    try {
      const nights = store.calculateNights(checkIn, checkOut);
      if (nights < 1) {
        quoteBox.innerHTML = '<span style="color: var(--danger); font-weight: 700;">Ngày trả phòng phải sau ngày nhận ít nhất 1 đêm!</span>';
        if (btnSubmit) btnSubmit.disabled = true;
        return;
      }

      const avail = store.checkRoomAvailability(classCode, checkIn, checkOut);
      const pricing = store.calculateNightlyPricing(classCode, checkIn, checkOut);
      const totalEstimated = pricing.totalPerRoom * qty;

      if (!avail.valid || avail.availableQuantity < qty) {
        quoteBox.innerHTML = `
          <div style="color: var(--danger); font-weight: 700;">
            Hết phòng: Hạng ${classCode} chỉ còn <b>${avail.availableQuantity} phòng</b> trống trong khoảng này (yêu cầu: ${qty} phòng).
          </div>
        `;
        if (btnSubmit) btnSubmit.disabled = true;
      } else {
        quoteBox.innerHTML = `
          <div style="color: var(--success); font-weight: 600;">
            Quỹ phòng khả dụng: <b>${avail.availableQuantity} phòng</b> &bull; Số đêm: <b>${nights} đêm</b>
          </div>
          <div style="margin-top: 2px;">
            Tổng giá trị đơn dự kiến: <b style="color: var(--primary); font-size: 14px;">${fmt.currency(totalEstimated)}</b>
          </div>
        `;
        if (btnSubmit) btnSubmit.disabled = false;
      }
    } catch (e) {
      quoteBox.innerHTML = `<span style="color: var(--danger);">${escapeHtml(e.message)}</span>`;
      if (btnSubmit) btnSubmit.disabled = true;
    }
  }

  function submitCreateBooking(event) {
    event.preventDefault();
    const form = event.target;

    try {
      const params = {
        guestName: form.guestName.value.trim(),
        phone: form.phone.value.trim(),
        email: form.email ? form.email.value.trim() : '',
        checkInDate: form.checkInDate.value,
        checkOutDate: form.checkOutDate.value,
        roomClassCode: form.roomClassCode.value,
        roomQuantity: parseInt(form.roomQuantity.value, 10) || 1,
        depositAmount: parseInt(form.depositAmount.value, 10) || 0,
        notes: form.notes ? form.notes.value.trim() : ''
      };

      const newBooking = store.createBooking(params, state.currentUser);
      closeModal();
      showToast(`Đã tạo đơn đặt phòng ${newBooking.id} thành công!`);
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function openRoomDrawer(roomId) {
    state.selectedRoomId = roomId;
    const data = store ? store.getData() : window.HOTEL_DATA;
    const room = (data.rooms || []).find(r => r.id === roomId);
    if (!room) return;
    const stay = (data.stays || []).find(s => s.id === room.currentStayId && s.status === 'in_house');
    const rClass = (data.roomClasses || []).find(c => c.code === room.classCode) || {};

    const drawer = document.getElementById('roomDrawer');
    const overlay = document.getElementById('drawerOverlay');

    let html = `
      <div class="drawer-header">
        <div class="drawer-title-box">
          <div class="drawer-room-badge">Phòng ${room.number}</div>
          <div>
            <div style="font-weight: 700; font-size: 14px;">${escapeHtml(rClass.name)}</div>
            <div style="font-size: 11.5px; color: var(--text-secondary);">Tầng ${room.floor} &bull; Diện tích: ${rClass.area}m²</div>
          </div>
        </div>
        <button class="modal-close-btn" onclick="window.app.closeRoomDrawer()"><i data-lucide="x"></i></button>
      </div>
      <div class="drawer-body">
        ${stay && room.stayStatus === 'occupied' ? `
          <div class="drawer-section">
            <div class="drawer-section-title">Khách đang lưu trú</div>
            <div class="info-grid">
              <span class="info-label">Họ và tên:</span>
              <span class="info-value" style="color: #0284c7; font-weight: 700;">${escapeHtml(stay.guest.name)}</span>
              <span class="info-label">Số điện thoại:</span>
              <span class="info-value">${escapeHtml(stay.guest.phone)}</span>
              <span class="info-label">CCCD:</span>
              <span class="info-value">${escapeHtml(stay.guest.identityCard)}</span>
              <span class="info-label">Nhận phòng:</span>
              <span class="info-value">${fmt.date(stay.checkInDate)}</span>
              <span class="info-label">Dự kiến trả:</span>
              <span class="info-value">${fmt.date(stay.expectedCheckOutDate)}</span>
              <span class="info-label">Tiền cọc:</span>
              <span class="info-value" style="color: var(--success); font-weight: 600;">${fmt.currency(stay.depositAmount)}</span>
            </div>
          </div>

          <div class="drawer-section">
            <div class="drawer-section-title">Dịch vụ đã sử dụng (${(stay.servicesUsed || []).length})</div>
            ${(stay.servicesUsed || []).length === 0 ? '<div style="font-size: 12px; color: var(--text-secondary);">Chưa có dịch vụ phát sinh</div>' : `
              <div style="max-height: 180px; overflow-y: auto;">
                ${stay.servicesUsed.map(s => `
                  <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #f1f5f9; font-size: 12px;">
                    <span>${s.isMinibar ? '<span class="badge badge-clean">Minibar</span> ' : ''}${escapeHtml(s.name)} (x${s.quantity})</span>
                    <span class="font-amount">${fmt.currency(s.amount)}</span>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        ` : `
          <div style="padding: 20px; text-align: center; color: var(--text-secondary);">
            Phòng hiện đang trống.<br>
            Trạng thái vệ sinh: <b>${room.cleanStatus === 'clean' ? 'Sạch' : 'Chờ dọn'}</b><br>
            Giá cơ sở: <b>${fmt.currency(rClass.basePrice)}/đêm</b>
          </div>
        `}
      </div>
      <div class="drawer-footer">
        ${room.stayStatus === 'occupied' && stay ? `
          <button class="btn btn-secondary btn-sm" onclick="window.app.openAddServiceModal('${room.number}')">Thêm dịch vụ</button>
          <button class="btn btn-secondary btn-sm" onclick="window.app.openTransferRoomModal('${stay.id}')">Đổi phòng</button>
          <button class="btn btn-secondary btn-sm" onclick="window.app.openExtendStayModal('${stay.id}')">Gia hạn</button>
          <button class="btn btn-danger btn-sm" onclick="window.app.openCheckoutModal('${room.number}')">Trả phòng & Thu tiền</button>
        ` : `
          ${room.cleanStatus === 'clean' && room.exploitationStatus === 'active' ? `
            <button class="btn btn-primary" style="width: 100%;" onclick="window.app.openDirectCheckInModal('${room.number}')">Nhận phòng ngay</button>
          ` : '<button class="btn btn-secondary disabled" style="width: 100%;" disabled>Chờ xử lý buồng phòng</button>'}
        `}
      </div>
    `;

    drawer.innerHTML = html;
    drawer.classList.add('open');
    overlay.classList.add('active');
    if (window.lucide) lucide.createIcons({ root: drawer });
  }

  function closeRoomDrawer() {
    const drawer = document.getElementById('roomDrawer');
    const overlay = document.getElementById('drawerOverlay');
    if (drawer) drawer.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
  }

  
  function approveRoomClean(roomNumber) {
    try {
      store.updateRoomCleanStatus(roomNumber, 'clean', state.currentUser);
      showToast(`Đã nghiệm thu và duyệt phòng ${roomNumber} SẠCH! Phòng chuyển sang trạng thái SẴN SÀNG NHẬN KHÁCH.`, 'success');
      closeRoomDrawer();
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function toggleRoomMaintenance(roomNumber) {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const room = (data.rooms || []).find(r => r.number === roomNumber);
    if (!room) return;

    if (room.stayStatus === 'occupied') {
      showToast('Không thể khóa bảo trì phòng đang có khách ở!', 'danger');
      return;
    }

    try {
      const isMaint = room.exploitationStatus === 'maintenance';
      store.toggleRoomMaintenance(roomNumber, isMaint ? 'Mở lại khai thác' : 'Khóa bảo trì định kỳ', state.currentUser);
      showToast(isMaint ? `Đã mở khai thác phòng ${roomNumber}!` : `Đã tạm khóa phòng ${roomNumber} để bảo trì!`);
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }



  // SANDBOX GATEWAY WEBHOOK SIMULATION
  function triggerSandboxWebhook(transId, isSuccess) {
    try {
      store.simulateGatewayWebhook(transId, isSuccess);
      showToast(`Đã mô phỏng IPN từ Cổng thanh toán: ${isSuccess ? 'THÀNH CÔNG' : 'THẤT BẠI'}!`);
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  // REFUND WORKFLOW ACTIONS
  function openRequestRefundModal() {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const stays = (data.stays || []);
    const bookings = (data.bookings || []);

    const modal = document.getElementById('appModal');
    modal.innerHTML = `
      <div class="modal-overlay active" id="modalBackdrop">
        <div class="modal-container" style="max-width: 520px;">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="rotate-ccw"></i> Lập đề xuất hoàn tiền (Refund Request)</div>
            <button class="modal-close-btn" onclick="window.app.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.app.submitRequestRefund(event)">
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label required">Chọn lượt lưu trú / đơn đặt hoàn tiền</label>
                <select class="form-select" name="referenceKey" id="refundRefKey" style="width: 100%;" required onchange="window.app.onRefundTargetChange()">
                  <optgroup label="Lượt lưu trú">
                    ${stays.map(s => `<option value="stay:${s.id}">P.${s.roomNumber} - ${s.guest.name} (${s.id})</option>`).join('')}
                  </optgroup>
                  <optgroup label="Đơn đặt phòng">
                    ${bookings.map(b => `<option value="booking:${b.id}">${b.id} - ${b.guestName}</option>`).join('')}
                  </optgroup>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label required">Số tiền đề xuất hoàn (VNĐ)</label>
                <input type="number" class="form-control" name="refundAmount" id="refundAmountInput" value="500000" min="10000" step="50000" required />
                <span id="refundCapNotice" style="font-size: 11px; color: var(--text-secondary); margin-top: 3px; display: block;"></span>
              </div>
              <div class="form-group">
                <label class="form-label required">Lý do hoàn tiền (Bắt buộc theo kiểm toán)</label>
                <textarea class="form-control" name="reason" rows="3" required placeholder="Khách trả phòng sớm / Hoàn cọc hủy phòng hợp lệ..."></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Hủy</button>
              <button type="submit" class="btn btn-primary">Gửi Quản lý duyệt</button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: modal });
    onRefundTargetChange();
  }

  function onRefundTargetChange() {
    const sel = document.getElementById('refundRefKey');
    const notice = document.getElementById('refundCapNotice');
    if (!sel || !notice || !store) return;

    const val = sel.value;
    const [type, id] = val.split(':');
    const data = store.getData();

    let customerName = '';
    let maxCap = 0;

    if (type === 'stay') {
      const stay = (data.stays || []).find(s => s.id === id);
      if (stay) {
        customerName = stay.guest.name;
        // tính tiền đã thu
        const folio = store.calculateStayFolio(stay.id);
        maxCap = folio ? (folio.paymentsCollected + folio.depositPaid) : 0;
      }
    } else {
      const b = (data.bookings || []).find(bk => bk.id === id);
      if (b) {
        customerName = b.guestName;
        maxCap = b.depositPaid || b.depositAmount || 0;
      }
    }

    notice.innerHTML = `Khách: <b>${escapeHtml(customerName)}</b> &bull; Hạn mức hoàn tiền tối đa: <b style="color: var(--primary);">${fmt.currency(maxCap)}</b>`;
  }

  function submitRequestRefund(event) {
    event.preventDefault();
    const form = event.target;
    const [type, id] = form.referenceKey.value.split(':');
    const amount = parseInt(form.refundAmount.value, 10) || 0;
    const reason = form.reason.value.trim();

    try {
      const params = {
        stayId: type === 'stay' ? id : null,
        bookingId: type === 'booking' ? id : null,
        refundAmount: amount,
        reason: reason
      };

      store.requestRefund(params, state.currentUser);
      closeModal();
      showToast('Đã tạo đề xuất hoàn tiền thành công! Đang chờ Quản lý phê duyệt.');
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function approveRefundRequest(refundId) {
    try {
      store.approveRefund(refundId, state.currentUser);
      showToast(`Quản lý đã phê duyệt đề xuất hoàn tiền ${refundId}! Chuyển Thu ngân thực chi.`);
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function completeRefundRequest(refundId) {
    try {
      store.completeRefund(refundId, state.currentUser);
      showToast(`Kế toán/Thu ngân đã thực chi hoàn tiền cho phiếu ${refundId} thành công!`);
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function printInvoice(stayId) {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const stay = (data.stays || []).find(s => s.id === stayId);
    if (!stay) {
      showToast('Không tìm thấy lượt lưu trú!', 'danger');
      return;
    }

    const folio = store.calculateStayFolio(stayId);
    const isClosed = stay.status === 'checked_out';
    const printArea = document.getElementById('printableArea');

    printArea.innerHTML = `
      <div id="printable-invoice" style="font-family: 'Times New Roman', Times, serif; padding: 30px; max-width: 800px; margin: 0 auto; color: #000;">
        <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px;">
          <h2 style="margin: 0; text-transform: uppercase; font-size: 20px;">KHÁCH SẠN SÔNG LAM - MƯỜNG THANH LUXURY SÔNG LAM</h2>
          <div style="font-size: 13px; margin-top: 4px;">Địa chỉ: Số 13 đường Quang Trung, TP. Vinh, Nghệ An &bull; Hotline: 0238 357 8888</div>
          <div style="font-size: 11px; font-style: italic; color: #555; margin-top: 2px;">
            Mã số thuế mô phỏng đồ án học phần (Không thay thế hóa đơn tài chính hợp pháp)
          </div>
        </div>

        <div style="text-align: center; margin-bottom: 16px;">
          <h1 style="margin: 0; font-size: 18px; text-transform: uppercase;">PHIẾU THANH TOÁN MINH HỌA (FOLIO)</h1>
          <div style="font-size: 12px; font-weight: bold; margin-top: 4px;">
            Trạng thái: ${isClosed ? '<span style="color: green;">[ĐÃ QUYẾT TOÁN ĐỦ]</span>' : '<span style="color: red;">[PHIẾU TẠM TÍNH - CHƯA CHECK-OUT]</span>'}
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 14px; line-height: 1.6;">
          <div>
            <div>Khách hàng: <b>${escapeHtml(stay.guest.name)}</b></div>
            <div>Số CCCD/Hộ chiếu: ${escapeHtml(stay.guest.identityCard)}</div>
            <div>Điện thoại: ${escapeHtml(stay.guest.phone)}</div>
          </div>
          <div style="text-align: right;">
            <div>Phòng số: <b>P.${escapeHtml(stay.roomNumber)}</b> (${escapeHtml(stay.roomClassCode)})</div>
            <div>Nhận phòng: ${fmt.date(stay.checkInDate)}</div>
            <div>Dự kiến/Thực trả: ${fmt.date(stay.actualCheckOutDate || stay.expectedCheckOutDate)}</div>
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 12.5px; margin-bottom: 16px;">
          <thead>
            <tr style="background: #f1f5f9; border-top: 1px solid #000; border-bottom: 1px solid #000;">
              <th style="padding: 6px; text-align: left;">STT</th>
              <th style="padding: 6px; text-align: left;">Diễn giải khoản mục</th>
              <th style="padding: 6px; text-align: center;">Số lượng</th>
              <th style="padding: 6px; text-align: right;">Đơn giá</th>
              <th style="padding: 6px; text-align: right;">Thành tiền (VNĐ)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 6px; border-bottom: 1px dashed #ccc;">1</td>
              <td style="padding: 6px; border-bottom: 1px dashed #ccc;">Tiền phòng (${stay.nights} đêm)</td>
              <td style="padding: 6px; text-align: center; border-bottom: 1px dashed #ccc;">${stay.nights}</td>
              <td style="padding: 6px; text-align: right; border-bottom: 1px dashed #ccc;">${fmt.currency(stay.roomRate)}</td>
              <td style="padding: 6px; text-align: right; font-weight: bold; border-bottom: 1px dashed #ccc;">${fmt.currency(folio.roomCharges)}</td>
            </tr>
            ${(stay.servicesUsed || []).map((sv, idx) => `
              <tr>
                <td style="padding: 6px; border-bottom: 1px dashed #ccc;">${idx + 2}</td>
                <td style="padding: 6px; border-bottom: 1px dashed #ccc;">${sv.isMinibar ? '[Minibar] ' : ''}${escapeHtml(sv.name)}</td>
                <td style="padding: 6px; text-align: center; border-bottom: 1px dashed #ccc;">${sv.quantity}</td>
                <td style="padding: 6px; text-align: right; border-bottom: 1px dashed #ccc;">${fmt.currency(sv.unitPrice)}</td>
                <td style="padding: 6px; text-align: right; font-weight: bold; border-bottom: 1px dashed #ccc;">${fmt.currency(sv.amount)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="float: right; width: 320px; font-size: 13px; line-height: 1.8;">
          <div style="display: flex; justify-content: space-between;">
            <span>Tổng tiền dịch vụ & phòng:</span>
            <b>${fmt.currency(folio.totalAmount)}</b>
          </div>
          <div style="display: flex; justify-content: space-between; color: green;">
            <span>Tiền đặt cọc đã thu:</span>
            <b>-${fmt.currency(folio.depositPaid)}</b>
          </div>
          ${folio.paymentsCollected > 0 ? `
            <div style="display: flex; justify-content: space-between; color: green;">
              <span>Đã thanh toán trước:</span>
              <b>-${fmt.currency(folio.paymentsCollected)}</b>
            </div>
          ` : ''}
          <div style="display: flex; justify-content: space-between; border-top: 1px solid #000; padding-top: 4px; font-size: 14px; font-weight: bold;">
            <span>${folio.remainingDue > 0 ? 'Còn phải thanh toán:' : 'Số dư hoàn lại khách:'}</span>
            <span>${fmt.currency(Math.abs(folio.remainingDue))}</span>
          </div>
        </div>
        <div style="clear: both;"></div>

        <div style="display: flex; justify-content: space-between; margin-top: 40px; text-align: center; font-size: 13px;">
          <div>
            <b>Khách hàng</b><br>
            <span style="font-size: 11px;">(Ký và ghi rõ họ tên)</span>
            <div style="height: 60px;"></div>
            <div>${escapeHtml(stay.guest.name)}</div>
          </div>
          <div>
            <b>Đại diện Khách sạn</b><br>
            <span style="font-size: 11px;">(Ký xác nhận)</span>
            <div style="height: 60px;"></div>
            <div>${escapeHtml(state.currentUser.fullName)}</div>
          </div>
        </div>
      </div>
    `;

    window.print();
  }

  function openAddCustomerModal() {
    const modal = document.getElementById('appModal');
    modal.innerHTML = `
      <div class="modal-overlay active" id="modalBackdrop">
        <div class="modal-container" style="max-width: 500px;">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="user-plus"></i> Thêm hồ sơ khách hàng mới</div>
            <button class="modal-close-btn" onclick="window.app.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.app.submitAddCustomer(event)">
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label required">Họ và tên khách hàng</label>
                <input type="text" class="form-control" name="name" required placeholder="Nguyễn Văn A" />
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Số điện thoại</label>
                  <input type="tel" class="form-control" name="phone" required placeholder="0912 345 678" />
                </div>
                <div class="form-group">
                  <label class="form-label required">Số CCCD / Hộ chiếu</label>
                  <input type="text" class="form-control" name="identityCard" required placeholder="040089xxxxxx" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Email</label>
                  <input type="email" class="form-control" name="email" placeholder="khach@email.com" />
                </div>
                <div class="form-group">
                  <label class="form-label">Hạng thẻ hội viên</label>
                  <select class="form-select" name="tier">
                    <option value="Standard">Standard</option>
                    <option value="VIP Silver">VIP Silver</option>
                    <option value="VIP Gold">VIP Gold</option>
                    <option value="VIP Diamond">VIP Diamond</option>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Địa chỉ</label>
                <input type="text" class="form-control" name="address" placeholder="Hà Nội / TP.HCM / Nghệ An..." />
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Hủy</button>
              <button type="submit" class="btn btn-primary">Lưu hồ sơ khách hàng</button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: modal });
  }

  function submitAddCustomer(event) {
    event.preventDefault();
    const form = event.target;
    try {
      const custData = {
        name: form.name.value.trim(),
        phone: form.phone.value.trim(),
        identityCard: form.identityCard.value.trim(),
        email: form.email.value.trim(),
        tier: form.tier.value,
        address: form.address.value.trim()
      };
      store.addCustomer(custData, state.currentUser);
      closeModal();
      showToast(`Đã thêm khách hàng ${custData.name} thành công!`);
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function openAddRoleModal() {
    const modal = document.getElementById('appModal');
    modal.innerHTML = `
      <div class="modal-overlay active" id="modalBackdrop">
        <div class="modal-container" style="max-width: 500px;">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="shield-plus"></i> Thêm vai trò mới (RBAC)</div>
            <button class="modal-close-btn" onclick="window.app.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.app.submitAddRole(event)">
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label required">Mã vai trò (viết liền, không dấu)</label>
                <input type="text" class="form-control" name="code" required placeholder="vd: security, fnb_supervisor" />
              </div>
              <div class="form-group">
                <label class="form-label required">Tên vai trò hiển thị</label>
                <input type="text" class="form-control" name="name" required placeholder="vd: Nhân viên An ninh / Bảo vệ" />
              </div>
              <div class="form-group">
                <label class="form-label">Mô tả nhiệm vụ</label>
                <textarea class="form-control" name="description" rows="2" placeholder="Nhiệm vụ và phạm vi công việc..."></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Hủy</button>
              <button type="submit" class="btn btn-primary">Tạo vai trò</button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: modal });
  }

  function submitAddRole(event) {
    event.preventDefault();
    const form = event.target;
    try {
      const roleData = {
        code: form.code.value.trim(),
        name: form.name.value.trim(),
        description: form.description.value.trim(),
        permissions: { viewRoomRack: true }
      };
      store.createRole(roleData, state.currentUser);
      closeModal();
      showToast(`Đã thêm vai trò mới "${roleData.name}" thành công!`);
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function openAddUserModal() {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const roles = data.roles || [];
    const modal = document.getElementById('appModal');
    modal.innerHTML = `
      <div class="modal-overlay active" id="modalBackdrop">
        <div class="modal-container" style="max-width: 500px;">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="user-plus"></i> Thêm tài khoản nhân viên mới</div>
            <button class="modal-close-btn" onclick="window.app.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.app.submitAddUser(event)">
            <div class="modal-body">
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Tên đăng nhập</label>
                  <input type="text" class="form-control" name="username" required placeholder="vd: hoa.buongphong" />
                </div>
                <div class="form-group">
                  <label class="form-label required">Họ và tên</label>
                  <input type="text" class="form-control" name="fullName" required placeholder="Lê Thị Hoa" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Vai trò hệ thống</label>
                  <select class="form-select" name="roleCode" style="width: 100%;" required>
                    ${roles.map(r => `<option value="${r.code}">${r.name}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Bộ phận</label>
                  <input type="text" class="form-control" name="department" placeholder="Lễ tân / Buồng phòng / Thu ngân" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Số điện thoại</label>
                  <input type="tel" class="form-control" name="phone" placeholder="0987 654 321" />
                </div>
                <div class="form-group">
                  <label class="form-label">Email nội bộ</label>
                  <input type="email" class="form-control" name="email" placeholder="nhanvien@songlamhotel.vn" />
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Hủy</button>
              <button type="submit" class="btn btn-primary">Tạo tài khoản</button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: modal });
  }

  function submitAddUser(event) {
    event.preventDefault();
    const form = event.target;
    const data = store ? store.getData() : window.HOTEL_DATA;
    const role = (data.roles || []).find(r => r.code === form.roleCode.value);

    try {
      const userData = {
        username: form.username.value.trim(),
        fullName: form.fullName.value.trim(),
        roleCode: form.roleCode.value,
        roleName: role ? role.name : form.roleCode.value,
        department: form.department.value.trim() || 'Vận hành',
        phone: form.phone.value.trim(),
        email: form.email.value.trim()
      };
      store.createUser(userData, state.currentUser);
      closeModal();
      showToast(`Đã tạo tài khoản cho nhân viên ${userData.fullName} thành công!`);
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function closeModal() {
    const modal = document.getElementById('appModal');
    if (modal) modal.innerHTML = '';
  }

  // =========================================================================
  // BỘ ĐIỀU PHỐI MÀN HÌNH CHÍNH (SCREEN CONTROLLER)
  // =========================================================================
  function renderCurrentScreen() {
    if (!window.SongLamUI.canScreen(state.currentScreen)) { window.SongLamUI.denied(); window.SongLamUI.sync(); return; }
    updateTopbarInfo();

    switch (state.currentScreen) {
      case 'overview': renderOverview(); break;
      case 'timeline': renderTimeline(); break;
      case 'exceptions': renderExceptions(); break;
      case 'shifts_audit': renderShiftsAudit(); break;
      case 'room_rack': renderRoomRack(); break;
      case 'bookings': renderBookings(); break;
      case 'stays': renderStays(); break;
      case 'customers': renderCustomers(); break;
      case 'room_classes': renderRoomClasses(); break;
      case 'rooms_catalog': renderRoomsCatalog(); break;
      case 'rates_policies': renderRatesPoliciesWrapper(); break;
      case 'services_catalog': renderServicesCatalog(); break;
      case 'housekeeping': renderHousekeeping(); break;
      case 'billing': renderBilling(); break;
      case 'reports': renderReports(); break;
      case 'system_admin': renderSystemAdmin(); break;
      default: renderRoomRack(); break;
    }

    document.querySelectorAll('.nav-item').forEach(item => {
      const screenTarget = item.getAttribute('data-screen');
      if (screenTarget === state.currentScreen) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    if (window.lucide) lucide.createIcons();
  }

  function renderRatesPoliciesWrapper() {
    renderRatesAndPolicies();
  }

  function switchScreen(screenKey) {
    state.currentScreen = screenKey;
    renderCurrentScreen();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateRoomFilter(key, value) {
    state.filters.roomRack[key] = value;
    state.currentScreen = 'room_rack';
    renderCurrentScreen();
    if (window.lucide) lucide.createIcons();
  }

  function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    state.sidebarCollapsed = !state.sidebarCollapsed;
    if (state.sidebarCollapsed) sidebar.classList.add('collapsed');
    else sidebar.classList.remove('collapsed');
  }

  function toggleNotifications() {
    const pop = document.getElementById('notificationsPopover');
    if (pop) {
      pop.style.display = pop.style.display === 'block' ? 'none' : 'block';
    }
  }

  // Khởi tạo và lắng nghe đồng bộ thời gian thực
  document.addEventListener('DOMContentLoaded', () => {
    if (window.location.hash) {
      const hashScreen = window.location.hash.replace('#', '').trim();
      if (hashScreen) state.currentScreen = hashScreen;
    }

    if (store && typeof store.subscribe === 'function') {
      store.subscribe((latestData, meta) => {
        // Tự động re-render khi có thay đổi dữ liệu từ tab khác
        renderCurrentScreen();
      });
    }

    renderCurrentScreen();
  });

  // Public Interface cho Window App
  
  // =========================================================================
  // LỊCH PHÒNG TỔNG THỂ (ROOM TIMELINE / TAPE CHART - QUẢN LÝ)
  // =========================================================================

  function shiftTimeline(deltaDays) {
    const wDate = store ? store.getWorkingDate() : '2026-10-25';
    const currentStart = state.timelineStart || store.addDays(wDate, -2);
    state.timelineStart = store.addDays(currentStart, deltaDays);
    renderTimeline();
  }

  function setTimelineFilter(key, value) {
    state.timelineFilters[key] = value;
    renderTimeline();
  }

  function renderTimeline() { window.SongLamUI.timeline(state, 'app'); }

  function onTimelineEventClick(type, id) {
    if (type === 'stay') {
      openRoomDrawer(id);
    } else if (type === 'booking') {
      switchScreen('bookings');
    } else if (type === 'maintenance') {
      showToast('Phòng đang khóa bảo trì.', 'info');
    }
  }

  // =========================================================================
  // HỒ SƠ NGOẠI LỆ & THEO DÕI TRANH CHẤP (MỤC XIII)
  // =========================================================================

  function renderExceptions() {
    const list = store ? store.getExceptionCases() : [];

    let html = `
      <div class="page-header">
        <div class="page-title-box">
          <h1 class="page-title"><i data-lucide="alert-triangle" style="color: #ea580c;"></i> Hồ sơ Ngoại lệ & Theo dõi Tranh chấp</h1>
          <div class="page-breadcrumb">Xử lý các tình huống đặc biệt: Thừa tiền thanh toán, đổi phòng do hỏng, đền bù dịch vụ & giải quyết tranh chấp</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="window.app.openCreateExceptionModal()">
            <i data-lucide="plus-circle"></i> Tạo hồ sơ ngoại lệ mới
          </button>
        </div>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Mã hồ sơ</th>
              <th>Phân loại ngoại lệ</th>
              <th>Phòng / Lượt ở</th>
              <th>Mô tả sự cố & Tranh chấp</th>
              <th class="text-right">Số tiền liên quan</th>
              <th>Người tạo / Thời gian</th>
              <th class="text-center">Trạng thái</th>
              <th>Phương án giải quyết</th>
              <th class="text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${list.length === 0 ? `
              <tr><td colspan="9" class="text-center" style="padding: 30px; color: var(--text-secondary);">Chưa có hồ sơ ngoại lệ nào được ghi nhận.</td></tr>
            ` : list.map(c => {
              let badge = '<span class="badge badge-warning">Chờ xử lý</span>';
              if (c.status === 'resolved' || c.status === 'approved') badge = '<span class="badge badge-clean">Đã giải quyết</span>';
              else if (c.status === 'rejected') badge = '<span class="badge badge-danger">Từ chối</span>';

              const catNames = {
                'overpayment': 'Thừa tiền thanh toán',
                'damage': 'Hư hỏng tài sản / Minibar',
                'maintenance_relocation': 'Đổi phòng do sự cố bảo trì',
                'booking_conflict': 'Xung đột quỹ phòng / Giữ chỗ',
                'dispute': 'Khiếu nại khách hàng'
              };

              return `
                <tr>
                  <td><span style="font-weight: 700; color: var(--primary);">${escapeHtml(c.id)}</span></td>
                  <td><b>${catNames[c.category] || c.category}</b></td>
                  <td>${c.roomNumber ? `P.${c.roomNumber}` : 'N/A'}${c.stayId ? ` &bull; ${c.stayId}` : ''}</td>
                  <td style="max-width: 280px; font-size: 12px;">${escapeHtml(c.description)}</td>
                  <td class="text-right font-amount" style="font-weight: 700; color: #dc2626;">
                    ${c.amount > 0 ? fmt.currency(c.amount) : '0 VNĐ'}
                  </td>
                  <td style="font-size: 11.5px;">${escapeHtml(c.createdBy)}<br><span style="color: var(--text-muted);">${store.formatDate(c.createdAt)}</span></td>
                  <td class="text-center">${badge}</td>
                  <td style="font-size: 12px; color: #166534; font-weight: 600;">${escapeHtml(c.resolutionPlan || 'Chưa có phương án')}</td>
                  <td class="text-right">
                    ${c.status === 'pending' ? `
                      <button class="btn btn-primary btn-xs" onclick="window.app.openResolveExceptionModal('${c.id}')">
                        <i data-lucide="check"></i> Xử lý
                      </button>
                    ` : `
                      <span style="font-size: 11px; color: var(--text-muted);"><i data-lucide="check-check" style="width:12px;height:12px;vertical-align:middle;"></i> Xong</span>
                    `}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('mainContent').innerHTML = html;
    if (window.lucide) lucide.createIcons();
  }

  function openCreateExceptionModal() {
    let modalHtml = `
      <div class="modal-backdrop" onclick="window.app.closeModal(event)">
        <div class="modal-card" style="max-width: 580px;" onclick="event.stopPropagation()">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="alert-triangle" style="color: #ea580c;"></i> Tạo Hồ sơ Ngoại lệ / Tranh chấp mới</div>
            <button class="modal-close-btn" onclick="window.app.closeModal()">&times;</button>
          </div>
          <div class="modal-body">
            <form onsubmit="window.app.submitCreateException(event)">
              <div class="form-group">
                <label class="form-label required">Phân loại ngoại lệ</label>
                <select class="form-select" id="exCategory" required>
                  <option value="overpayment">Thừa tiền thanh toán (Cần hoàn hoặc cấn trừ)</option>
                  <option value="damage">Hư hỏng tài sản phòng / Tranh chấp minibar</option>
                  <option value="maintenance_relocation">Sự cố phòng đột xuất & Chuyển phòng</option>
                  <option value="booking_conflict">Xung đột quỹ phòng hoặc tiền về muộn</option>
                  <option value="dispute">Khiếu nại dịch vụ khách hàng</option>
                </select>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div class="form-group">
                  <label class="form-label">Số phòng liên quan (nếu có)</label>
                  <input type="text" class="form-input" id="exRoom" placeholder="VD: 505" />
                </div>
                <div class="form-group">
                  <label class="form-label">Số tiền tranh chấp / xử lý (VNĐ)</label>
                  <input type="number" class="form-input" id="exAmount" min="0" step="50000" value="0" />
                </div>
              </div>

              <div class="form-group">
                <label class="form-label required">Mô tả chi tiết sự cố</label>
                <textarea class="form-textarea" id="exDesc" rows="3" placeholder="Ghi nhận rõ thời điểm, nguyên nhân phát sinh và các bên liên quan..." required></textarea>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Hủy bỏ</button>
                <button type="submit" class="btn btn-primary"><i data-lucide="check"></i> Lưu hồ sơ ngoại lệ</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    document.getElementById('appModal').innerHTML = modalHtml;
    if (window.lucide) lucide.createIcons();
  }

  function submitCreateException(e) {
    e.preventDefault();
    const category = document.getElementById('exCategory').value;
    const roomNumber = document.getElementById('exRoom').value.trim();
    const amount = parseInt(document.getElementById('exAmount').value, 10) || 0;
    const description = document.getElementById('exDesc').value.trim();

    try {
      store.createExceptionCase({
        category: category,
        roomNumber: roomNumber,
        amount: amount,
        description: description
      }, state.currentUser);

      showToast('Đã tạo thành công hồ sơ ngoại lệ!', 'success');
      closeModal();
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function openResolveExceptionModal(caseId) {
    const list = store ? store.getExceptionCases() : [];
    const c = list.find(item => item.id === caseId);
    if (!c) return;

    let modalHtml = `
      <div class="modal-backdrop" onclick="window.app.closeModal(event)">
        <div class="modal-card" style="max-width: 580px;" onclick="event.stopPropagation()">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="check-square" style="color: #107c41;"></i> Phê duyệt Xử lý Ngoại lệ: ${caseId}</div>
            <button class="modal-close-btn" onclick="window.app.closeModal()">&times;</button>
          </div>
          <div class="modal-body">
            <div style="background: #f8fafc; padding: 10px; border-radius: 4px; border: 1px solid #e2e8f0; margin-bottom: 12px; font-size: 12px;">
              <b>Mô tả:</b> ${escapeHtml(c.description)}<br>
              ${c.amount > 0 ? `<b>Số tiền:</b> <span style="color: #dc2626; font-weight: 700;">${fmt.currency(c.amount)}</span>` : ''}
            </div>

            <form onsubmit="window.app.submitResolveException(event, '${caseId}')">
              <div class="form-group">
                <label class="form-label required">Phương án giải quyết (Resolution Plan)</label>
                <textarea class="form-textarea" id="resPlan" rows="3" placeholder="VD: Đã duyệt hoàn 500.000 VNĐ tiền cọc thừa qua tài khoản VietinBank... Hoặc: Chuyển khách sang phòng 602 miễn phí phụ thu..." required></textarea>
              </div>

              <div class="form-group">
                <label class="form-label required">Quyết định phê duyệt</label>
                <select class="form-select" id="resDecision">
                  <option value="resolved" selected>Chấp thuận & Đóng hồ sơ (Resolved)</option>
                  <option value="rejected">Từ chối khiếu nại (Rejected)</option>
                </select>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Đóng</button>
                <button type="submit" class="btn btn-primary"><i data-lucide="check"></i> Lưu quyết định</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    document.getElementById('appModal').innerHTML = modalHtml;
    if (window.lucide) lucide.createIcons();
  }

  function submitResolveException(e, caseId) {
    e.preventDefault();
    const plan = document.getElementById('resPlan').value.trim();
    const decision = document.getElementById('resDecision').value;

    try {
      store.resolveExceptionCase(caseId, plan, decision, state.currentUser);
      showToast('Đã xử lý và lưu kết quả hồ sơ ngoại lệ!', 'success');
      closeModal();
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  // =========================================================================
  // CHỐT CA THU NGÂN & NIGHT AUDIT (MỤC XIV)
  // =========================================================================

  function renderShiftsAudit() {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const wDate = store ? store.getWorkingDate() : '2026-10-25';
    const shifts = data.cashierShifts || [];
    const ledgers = data.dailyLedgers || [];
    const stats = store ? store.getDashboardStats() : {};

    let html = `
      <div class="page-header">
        <div class="page-title-box">
          <h1 class="page-title"><i data-lucide="history" style="color: #0f4c81;"></i> Chốt Ca Thu Ngân & Chốt Ngày Kinh Doanh (Night Audit)</h1>
          <div class="page-breadcrumb">Đối soát quỹ tiền mặt từng ca trực, chốt doanh thu ngày và chuyển giao ngày kinh doanh PMS</div>
        </div>
        <div class="page-actions" style="display: flex; gap: 8px;">
          <button class="btn btn-secondary" onclick="window.app.openStartShiftModal()">
            <i data-lucide="clock"></i> Mở ca thu ngân mới
          </button>
          <button class="btn btn-primary" onclick="window.app.openNightAuditModal()">
            <i data-lucide="moon"></i> Chốt ngày (Night Audit)
          </button>
        </div>
      </div>

      <!-- Thống kê ca và ngày làm việc -->
      <div class="stats-grid">
        <div class="stat-card revenue">
          <div class="stat-card-header"><span class="stat-title">Ngày làm việc hiện tại</span></div>
          <div class="stat-value font-amount">${fmt.date(wDate)}</div>
          <div class="stat-subtitle">Ngày kinh doanh trên hệ thống PMS</div>
        </div>
        <div class="stat-card ready">
          <div class="stat-card-header"><span class="stat-title">Thực thu trong ngày</span></div>
          <div class="stat-value font-amount">${fmt.currency(stats.collectedToday || 0)}</div>
          <div class="stat-subtitle">Tổng tiền khách thanh toán</div>
        </div>
        <div class="stat-card departure">
          <div class="stat-card-header"><span class="stat-title">Tổng hoàn tiền</span></div>
          <div class="stat-value font-amount" style="color: var(--danger);">${fmt.currency(stats.refundsToday || 0)}</div>
          <div class="stat-subtitle">Tiền đã hoàn cho khách</div>
        </div>
        <div class="stat-card occupied">
          <div class="stat-card-header"><span class="stat-title">Doanh thu thuần</span></div>
          <div class="stat-value font-amount" style="color: #15803d;">${fmt.currency(stats.netRevenueToday || 0)}</div>
          <div class="stat-subtitle">Thực thu trừ hoàn tiền</div>
        </div>
      </div>

      <!-- Bảng 1: Lịch sử các ca thu ngân -->
      <div style="margin: 20px 0 8px; font-size: 15px; font-weight: 700; color: #0f4c81; display: flex; align-items: center; gap: 8px;">
        <i data-lucide="user-check"></i> Sổ bàn giao & Chốt ca Thu ngân
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Mã ca</th>
              <th>Thu ngân</th>
              <th>Thời gian mở</th>
              <th>Thời gian đóng</th>
              <th class="text-right">Tiền két đầu ca</th>
              <th class="text-right">Két sổ sách</th>
              <th class="text-right">Két thực đếm</th>
              <th class="text-right">Chênh lệch</th>
              <th class="text-center">Trạng thái</th>
              <th class="text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${shifts.length === 0 ? `
              <tr><td colspan="10" class="text-center" style="padding: 24px; color: var(--text-secondary);">Chưa có ca thu ngân nào được mở.</td></tr>
            ` : shifts.map(s => {
              const isOpen = s.status === 'open';
              return `
                <tr>
                  <td><span style="font-weight: 700; color: var(--primary);">${escapeHtml(s.id)}</span></td>
                  <td><b>${escapeHtml(s.cashierName || s.cashier)}</b></td>
                  <td style="font-size: 11.5px;">${store.formatDate(s.startTime)}</td>
                  <td style="font-size: 11.5px;">${s.endTime ? store.formatDate(s.endTime) : '<span style="color: #107c41;">Đang mở</span>'}</td>
                  <td class="text-right font-amount">${fmt.currency(s.initialFloat)}</td>
                  <td class="text-right font-amount">${fmt.currency(s.expectedCash || s.initialFloat)}</td>
                  <td class="text-right font-amount" style="font-weight: 700;">${isOpen ? '-' : fmt.currency(s.countedCash)}</td>
                  <td class="text-right font-amount" style="color: ${(s.discrepancy || 0) < 0 ? 'var(--danger)' : '#15803d'};">
                    ${isOpen ? '-' : fmt.currency(s.discrepancy || 0)}
                  </td>
                  <td class="text-center">
                    <span class="badge ${isOpen ? 'badge-cleaning' : 'badge-clean'}">${isOpen ? 'Đang mở' : 'Đã chốt ca'}</span>
                  </td>
                  <td class="text-right">
                    ${isOpen ? `
                      <button class="btn btn-primary btn-xs" onclick="window.app.openCloseShiftModal('${s.id}')">
                        <i data-lucide="lock"></i> Chốt ca này
                      </button>
                    ` : `
                      <span style="font-size: 11px; color: var(--text-muted);"><i data-lucide="check" style="width:12px;height:12px;vertical-align:middle;"></i> Đã chốt</span>
                    `}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <!-- Bảng 2: Lịch sử Chốt ngày kinh doanh (Night Audit Ledgers) -->
      <div style="margin: 24px 0 8px; font-size: 15px; font-weight: 700; color: #0f4c81; display: flex; align-items: center; gap: 8px;">
        <i data-lucide="archive"></i> Lịch sử Chốt ngày kinh doanh (Daily Ledger Snapshots)
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Ngày kinh doanh</th>
              <th>Thời điểm chốt</th>
              <th>Người thực hiện</th>
              <th class="text-right">Doanh thu thuần</th>
              <th class="text-right">Tiền thực thu</th>
              <th class="text-right">Tiền hoàn</th>
              <th class="text-center">Công suất phòng</th>
              <th class="text-center">Xử lý No-Show</th>
              <th class="text-center">Quá hạn</th>
              <th>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            ${ledgers.length === 0 ? `
              <tr><td colspan="10" class="text-center" style="padding: 24px; color: var(--text-secondary);">Chưa có nhật ký chốt ngày kinh doanh nào.</td></tr>
            ` : ledgers.map(l => `
              <tr>
                <td><b>${fmt.date(l.date)}</b></td>
                <td style="font-size: 11.5px;">${store.formatDate(l.closedAt)}</td>
                <td>${escapeHtml(l.auditedBy)}</td>
                <td class="text-right font-amount" style="font-weight: 700; color: #15803d;">${fmt.currency(l.netRevenue)}</td>
                <td class="text-right font-amount">${fmt.currency(l.collected)}</td>
                <td class="text-right font-amount" style="color: var(--danger);">${fmt.currency(l.refunds)}</td>
                <td class="text-center font-amount">${l.occupancyRate}%</td>
                <td class="text-center"><span class="badge ${l.noShowBookings > 0 ? 'badge-warning' : 'badge-vacant'}">${l.noShowBookings} đơn</span></td>
                <td class="text-center"><span class="badge ${l.overstayStays > 0 ? 'badge-danger' : 'badge-vacant'}">${l.overstayStays} phòng</span></td>
                <td style="font-size: 11.5px; color: var(--text-secondary);">${escapeHtml(l.notes)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('mainContent').innerHTML = html;
    if (window.lucide) lucide.createIcons();
  }

  function openStartShiftModal() {
    let modalHtml = `
      <div class="modal-backdrop" onclick="window.app.closeModal(event)">
        <div class="modal-card" style="max-width: 480px;" onclick="event.stopPropagation()">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="clock" style="color: #0284c7;"></i> Mở ca Thu ngân mới</div>
            <button class="modal-close-btn" onclick="window.app.closeModal()">&times;</button>
          </div>
          <div class="modal-body">
            <form onsubmit="window.app.submitStartShift(event)">
              <div class="form-group">
                <label class="form-label required">Tiền két đầu ca (Initial Float - VNĐ)</label>
                <input type="number" class="form-input" id="shiftFloat" min="0" step="100000" value="2000000" required />
                <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">Số tiền mặt có sẵn trong két để trả lại tiền thừa cho khách.</div>
              </div>
              <div class="form-group">
                <label class="form-label">Ghi chú bàn giao</label>
                <input type="text" class="form-input" id="shiftNotes" placeholder="Ca sáng 07:00 - 15:00..." />
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Hủy</button>
                <button type="submit" class="btn btn-primary"><i data-lucide="check"></i> Bắt đầu ca trực</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    document.getElementById('appModal').innerHTML = modalHtml;
    if (window.lucide) lucide.createIcons();
  }

  function submitStartShift(e) {
    e.preventDefault();
    const float = parseInt(document.getElementById('shiftFloat').value, 10) || 0;
    const notes = document.getElementById('shiftNotes').value.trim();

    try {
      const shift = store.startCashierShift({
        initialFloat: float,
        notes: notes
      }, state.currentUser);

      showToast(`Đã mở ca thu ngân thành công (Mã: ${shift.id})!`, 'success');
      closeModal();
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function openCloseShiftModal(shiftId) {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const shift = (data.cashierShifts || []).find(s => s.id === shiftId);
    if (!shift) return;

    let modalHtml = `
      <div class="modal-backdrop" onclick="window.app.closeModal(event)">
        <div class="modal-card" style="max-width: 520px;" onclick="event.stopPropagation()">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="lock" style="color: #0f4c81;"></i> Chốt ca Thu ngân: ${shift.id}</div>
            <button class="modal-close-btn" onclick="window.app.closeModal()">&times;</button>
          </div>
          <div class="modal-body">
            <form onsubmit="window.app.submitCloseShift(event, '${shiftId}')">
              <div style="background: #f8fafc; padding: 10px; border-radius: 4px; border: 1px solid #e2e8f0; margin-bottom: 12px; font-size: 12px;">
                <b>Thu ngân:</b> ${escapeHtml(shift.cashierName || shift.cashier)}<br>
                <b>Tiền két đầu ca:</b> ${fmt.currency(shift.initialFloat)}
              </div>

              <div class="form-group">
                <label class="form-label required">Số tiền mặt kiểm đếm thực tế trong két (VNĐ)</label>
                <input type="number" class="form-input" id="countedCash" min="0" step="10000" placeholder="Nhập số tiền thực đếm..." required />
              </div>

              <div class="form-group">
                <label class="form-label">Biên bản bàn giao ca</label>
                <textarea class="form-textarea" id="handoverNotes" rows="2" placeholder="Ghi chú số tiền bàn giao cho ca tiếp theo hoặc lý do chênh lệch (nếu có)..."></textarea>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Đóng</button>
                <button type="submit" class="btn btn-primary"><i data-lucide="check"></i> Xác nhận Chốt ca</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    document.getElementById('appModal').innerHTML = modalHtml;
    if (window.lucide) lucide.createIcons();
  }

  function submitCloseShift(e, shiftId) {
    e.preventDefault();
    const counted = parseInt(document.getElementById('countedCash').value, 10);
    const notes = document.getElementById('handoverNotes').value.trim();

    try {
      const res = store.closeCashierShift({
        shiftId: shiftId,
        countedCash: counted,
        handoverNotes: notes
      }, state.currentUser);

      showToast(`Chốt ca thành công! Chênh lệch két: ${fmt.currency(res.discrepancy)}.`, res.discrepancy === 0 ? 'success' : 'warning');
      closeModal();
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function openNightAuditModal() {
    const wDate = store ? store.getWorkingDate() : '2026-10-25';
    const nextDate = store.addDays(wDate, 1);

    let modalHtml = `
      <div class="modal-backdrop" onclick="window.app.closeModal(event)">
        <div class="modal-card" style="max-width: 580px;" onclick="event.stopPropagation()">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="moon" style="color: #6366f1;"></i> Thực hiện Chốt Ngày (Night Audit)</div>
            <button class="modal-close-btn" onclick="window.app.closeModal()">&times;</button>
          </div>
          <div class="modal-body">
            <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 12px; border-radius: var(--radius-sm); margin-bottom: 14px; font-size: 12px; line-height: 1.6;">
              <b style="color: #1e40af;">Quy trình Night Audit tự động sẽ thực hiện:</b><br>
              1. Quét các đơn đặt phòng chưa đến (No-Show) để cập nhật trạng thái.<br>
              2. Đánh dấu các lượt khách quá hạn chưa trả phòng (Overstay).<br>
              3. Đóng băng và lưu snapshot doanh thu ngày kinh doanh <b>${store.formatDate(wDate)}</b>.<br>
              4. Chuyển ngày kinh doanh hệ thống sang ngày mới <b>${store.formatDate(nextDate)}</b>.
            </div>

            <form onsubmit="window.app.submitNightAudit(event)">
              <div class="form-group">
                <label class="form-label required">Ngày kinh doanh tiếp theo</label>
                <input type="date" class="form-input" id="targetWorkingDate" value="${nextDate}" required />
              </div>
              <div class="form-group">
                <label class="form-label">Ghi chú chốt ngày</label>
                <input type="text" class="form-input" id="auditNotes" placeholder="Chốt ngày ca đêm hoàn tất đúng quy trình..." />
              </div>

              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Hủy bỏ</button>
                <button type="submit" class="btn btn-primary" style="background: #4f46e5; border-color: #4f46e5;">
                  <i data-lucide="moon"></i> Chạy Night Audit & Đổi Ngày
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    document.getElementById('appModal').innerHTML = modalHtml;
    if (window.lucide) lucide.createIcons();
  }

  function submitNightAudit(e) {
    e.preventDefault();
    const targetDate = document.getElementById('targetWorkingDate').value;
    const notes = document.getElementById('auditNotes').value.trim();

    try {
      const res = store.runNightAudit({
        targetDate: targetDate,
        notes: notes
      }, state.currentUser);

      showToast(`Chốt ngày ${res.closedDate} thành công! Ngày làm việc mới: ${store.formatDate(res.nextDate)}.`, 'success');
      closeModal();
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  // =========================================================================
  // ĐẶT PHÒNG KHÁCH ĐOÀN DÀNH CHO QUẢN LÝ (GROUP BOOKINGS)
  // =========================================================================

  function openCreateGroupBookingModal() {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const roomClasses = data.roomClasses || [];
    const wDate = store ? store.getWorkingDate() : '2026-10-25';
    const checkOutDefault = store.addDays(wDate, 2);

    let modalHtml = `
      <div class="modal-backdrop" onclick="window.app.closeModal(event)">
        <div class="modal-card" style="max-width: 780px;" onclick="event.stopPropagation()">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="users" style="color: #0284c7;"></i> Đặt phòng Khách đoàn (Nhiều hạng phòng)</div>
            <button class="modal-close-btn" onclick="window.app.closeModal()">&times;</button>
          </div>
          <div class="modal-body">
            <form onsubmit="window.app.submitCreateGroupBooking(event)">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div class="form-group">
                  <label class="form-label required">Tên đoàn khách / Công ty</label>
                  <input type="text" class="form-input" id="appGrpName" placeholder="VD: Đoàn VietinBank Nghệ An" required />
                </div>
                <div class="form-group">
                  <label class="form-label required">Người đại diện liên hệ</label>
                  <input type="text" class="form-input" id="appGrpContact" placeholder="Họ và tên trưởng đoàn" required />
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div class="form-group">
                  <label class="form-label required">Số điện thoại liên hệ</label>
                  <input type="tel" class="form-input" id="appGrpPhone" placeholder="0912..." required />
                </div>
                <div class="form-group">
                  <label class="form-label">Email liên hệ</label>
                  <input type="email" class="form-input" id="appGrpEmail" placeholder="contact@company.com" />
                </div>
              </div>

              <div style="margin: 14px 0 8px; font-weight: 700; color: #0f4c81; font-size: 13px; display: flex; justify-content: space-between; align-items: center;">
                <span>DANH SÁCH HẠNG PHÒNG ĐOÀN ĐẶT</span>
                <button type="button" class="btn btn-secondary btn-xs" onclick="window.app.addGroupAllocRow()">+ Thêm dòng</button>
              </div>

              <div id="appGroupAllocRows" style="display: flex; flex-direction: column; gap: 8px;">
                <div class="group-alloc-row" style="display: grid; grid-template-columns: 2fr 1fr 1.5fr 1.5fr auto; gap: 8px; align-items: center; background: #f8fafc; padding: 8px; border-radius: 4px; border: 1px solid #e2e8f0;">
                  <div>
                    <label style="font-size: 10.5px; color: var(--text-secondary);">Hạng phòng</label>
                    <select class="form-select alloc-class" required>
                      ${roomClasses.map(rc => `<option value="${rc.code}">${rc.name} (${rc.code})</option>`).join('')}
                    </select>
                  </div>
                  <div>
                    <label style="font-size: 10.5px; color: var(--text-secondary);">Số lượng</label>
                    <input type="number" class="form-input alloc-qty" min="1" max="20" value="2" required />
                  </div>
                  <div>
                    <label style="font-size: 10.5px; color: var(--text-secondary);">Ngày nhận</label>
                    <input type="date" class="form-input alloc-in" value="${wDate}" required />
                  </div>
                  <div>
                    <label style="font-size: 10.5px; color: var(--text-secondary);">Ngày trả</label>
                    <input type="date" class="form-input alloc-out" value="${checkOutDefault}" required />
                  </div>
                  <div style="padding-top: 14px;">
                    <button type="button" class="btn btn-danger btn-xs" onclick="this.closest('.group-alloc-row').remove()">&times;</button>
                  </div>
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px;">
                <div class="form-group">
                  <label class="form-label">Tiền đặt cọc trước (VNĐ)</label>
                  <input type="number" class="form-input" id="appGrpDeposit" min="0" step="50000" value="2000000" />
                </div>
                <div class="form-group">
                  <label class="form-label">Phương thức thanh toán cọc</label>
                  <select class="form-select" id="appGrpPaymentMethod">
                    <option value="cash" selected>Tiền mặt</option>
                    <option value="vietqr">VietQR Chuyển khoản</option>
                    <option value="pos">Thẻ ngân hàng (POS)</option>
                  </select>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Ghi chú đoàn</label>
                <textarea class="form-textarea" id="appGrpNotes" rows="2"></textarea>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Hủy</button>
                <button type="submit" class="btn btn-primary"><i data-lucide="check"></i> Lưu đơn đoàn</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    document.getElementById('appModal').innerHTML = modalHtml;
    if (window.lucide) lucide.createIcons();
  }

  function addGroupAllocRow() {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const roomClasses = data.roomClasses || [];
    const wDate = store ? store.getWorkingDate() : '2026-10-25';
    const checkOutDefault = store.addDays(wDate, 2);

    const div = document.createElement('div');
    div.className = 'group-alloc-row';
    div.style.cssText = 'display: grid; grid-template-columns: 2fr 1fr 1.5fr 1.5fr auto; gap: 8px; align-items: center; background: #f8fafc; padding: 8px; border-radius: 4px; border: 1px solid #e2e8f0;';
    div.innerHTML = `
      <div>
        <label style="font-size: 10.5px; color: var(--text-secondary);">Hạng phòng</label>
        <select class="form-select alloc-class" required>
          ${roomClasses.map(rc => `<option value="${rc.code}">${rc.name} (${rc.code})</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size: 10.5px; color: var(--text-secondary);">Số lượng</label>
        <input type="number" class="form-input alloc-qty" min="1" max="20" value="1" required />
      </div>
      <div>
        <label style="font-size: 10.5px; color: var(--text-secondary);">Ngày nhận</label>
        <input type="date" class="form-input alloc-in" value="${wDate}" required />
      </div>
      <div>
        <label style="font-size: 10.5px; color: var(--text-secondary);">Ngày trả</label>
        <input type="date" class="form-input alloc-out" value="${checkOutDefault}" required />
      </div>
      <div style="padding-top: 14px;">
        <button type="button" class="btn btn-danger btn-xs" onclick="this.closest('.group-alloc-row').remove()">&times;</button>
      </div>
    `;
    const container = document.getElementById('appGroupAllocRows');
    if (container) container.appendChild(div);
  }

  function submitCreateGroupBooking(e) {
    e.preventDefault();
    const groupName = document.getElementById('appGrpName').value.trim();
    const contactName = document.getElementById('appGrpContact').value.trim();
    const phone = document.getElementById('appGrpPhone').value.trim();
    const email = document.getElementById('appGrpEmail').value.trim();
    const depositAmount = parseInt(document.getElementById('appGrpDeposit').value, 10) || 0;
    const paymentMethod = document.getElementById('appGrpPaymentMethod').value;
    const notes = document.getElementById('appGrpNotes').value.trim();

    const rowEls = document.querySelectorAll('#appGroupAllocRows .group-alloc-row');
    const allocations = [];
    rowEls.forEach(row => {
      allocations.push({
        classCode: row.querySelector('.alloc-class').value,
        quantity: parseInt(row.querySelector('.alloc-qty').value, 10),
        checkInDate: row.querySelector('.alloc-in').value,
        checkOutDate: row.querySelector('.alloc-out').value
      });
    });

    try {
      const res = store.createGroupBooking({
        groupName: groupName,
        contactName: contactName,
        phone: phone,
        email: email,
        allocations: allocations,
        depositAmount: depositAmount,
        paymentMethod: paymentMethod,
        notes: notes
      }, state.currentUser);

      showToast(`Đã tạo thành công đơn khách đoàn ${groupName} (${res.totalRooms} phòng)!`, 'success');
      closeModal();
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function openBulkAssignRoomsModal(bookingId) {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const booking = data.bookings.find(b => b.id === bookingId);
    if (!booking) return;

    const candidateRooms = data.rooms.filter(r => r.classCode === booking.roomClassCode && r.exploitationStatus === 'active');

    let modalHtml = `
      <div class="modal-backdrop" onclick="window.app.closeModal(event)">
        <div class="modal-card" style="max-width: 550px;" onclick="event.stopPropagation()">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="grid" style="color: #0284c7;"></i> Phân phòng cho đơn: ${booking.id}</div>
            <button class="modal-close-btn" onclick="window.app.closeModal()">&times;</button>
          </div>
          <div class="modal-body">
            <div style="background: #f1f5f9; padding: 10px; border-radius: 4px; margin-bottom: 12px; font-size: 12.5px;">
              <b>Đoàn:</b> ${escapeHtml(booking.groupName || booking.guest.name)}<br>
              <b>Hạng phòng:</b> ${booking.roomClassCode} &bull; <b>Số lượng:</b> ${booking.roomQuantity} phòng
            </div>

            <form onsubmit="window.app.submitBulkAssignRooms(event, '${booking.id}')">
              <div style="font-weight: 600; font-size: 12px; margin-bottom: 6px;">Chọn ${booking.roomQuantity} phòng vật lý:</div>
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; max-height: 250px; overflow-y: auto; padding: 4px;">
                ${candidateRooms.map(r => {
                  const isChecked = Array.isArray(booking.assignedRooms) && booking.assignedRooms.includes(r.number);
                  return `
                    <label style="display: flex; align-items: center; gap: 6px; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; cursor: pointer; background: ${isChecked ? '#e0f2fe' : '#fff'};">
                      <input type="checkbox" name="appAssignRoom" value="${r.number}" ${isChecked ? 'checked' : ''} />
                      <span><b>P.${r.number}</b> (T.${r.floor})</span>
                    </label>
                  `;
                }).join('')}
              </div>

              <div class="modal-footer" style="margin-top: 16px;">
                <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Đóng</button>
                <button type="submit" class="btn btn-primary">Lưu phân phòng</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    document.getElementById('appModal').innerHTML = modalHtml;
    if (window.lucide) lucide.createIcons();
  }

  function submitBulkAssignRooms(e, bookingId) {
    e.preventDefault();
    const checked = Array.from(document.querySelectorAll('input[name="appAssignRoom"]:checked')).map(cb => cb.value);

    try {
      store.bulkAssignRooms(bookingId, checked, state.currentUser);
      showToast(`Đã gán phòng [${checked.join(', ')}] cho đơn ${bookingId}!`, 'success');
      closeModal();
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }


  window.app = {
    openCreateExceptionModal,
    submitCreateException,
    openResolveExceptionModal,
    submitResolveException,
    openStartShiftModal,
    submitStartShift,
    openCloseShiftModal,
    submitCloseShift,
    openNightAuditModal,
    submitNightAudit,
    shiftTimeline,
    setTimelineFilter,
    renderTimeline,
    getUIContext: () => ({ user: state.currentUser, screen: state.currentScreen }),
    resetTimeline: () => { state.timelineStart = null; renderTimeline(); },
    setBookingFilter: (key,value) => { state.filters.bookings[key]=value; renderBookings(); },
    filterRooms: filter => {
      state.filters.roomRack = { floor:'all',roomClass:'all',stayStatus:'all',cleanStatus:'all',exploitationStatus:'all',search:'' };
      const f=state.filters.roomRack;
      if(filter==='occupied') f.stayStatus='occupied';
      if(filter==='ready') Object.assign(f,{stayStatus:'vacant',cleanStatus:'clean',exploitationStatus:'active'});
      if(filter==='dirty') f.cleanStatus='dirty';
      if(filter==='unavailable') f.exploitationStatus='unavailable';
      switchScreen('room_rack');
    },
    state,
    switchScreen,
    switchRole,
    updateRoomFilter,
    openRoomDrawer,
    closeRoomDrawer,
    openDirectCheckInModal,
    onDirectDatesChange,
    submitDirectCheckIn,
    onStayTypeChange,
    onHourlyHoursChange,
    toggleLateCheckout,
    openShortenStayModal,
    submitShortenStay,
    transferToMasterFolio,
    openCheckInForBooking,
    submitCheckInFromBooking,
    promptCancelBooking,
    openCheckoutModal,
    confirmCheckoutFolio,
    printInvoice,
    openQuickWalkInModal,
    openAddServiceModal,
    submitAddService,
    updateServiceAmountPreview,
    toggleServicePaymentMethod,
    updateDirectTotal,
    setGuaranteeDeposit,
    setPrepaymentPercent,
    updateBookingCheckInTotal,
    openAddSurchargeModal,
    submitAddSurcharge,
    openAddRoomClassModal,
    openEditRoomClassModal,
    submitRoomClassForm,
    promptDeleteRoomClass,
    openAddRoomModal,
    openEditRoomModal,
    submitRoomForm,
    promptDeleteRoom,
    openEditPricingPolicyModal,
    submitPricingPolicyForm,
    openAddServiceCatalogModal,
    openEditServiceCatalogModal,
    submitServiceCatalogForm,
    promptDeleteServiceCatalog,
    switchReportFilter,
    switchRevenuePeriod,
    switchRevenueTab,
    toggleRevenueViewMode,
    openTransferRoomModal,
    submitTransferRoom,
    openExtendStayModal,
    submitExtendStay,
    openCreateBookingModal,
    onAppBookingFormChange,
    submitCreateBooking,
    toggleRoomMaintenance,
    approveRoomClean,
    triggerSandboxWebhook,
    openRequestRefundModal,
    onRefundTargetChange,
    submitRequestRefund,
    approveRefundRequest,
    completeRefundRequest,
    switchAdminTab,
    switchBillingTab,
    switchCustomerTab,
    filterCustomers,
    toggleRolePermission,
    saveWorkingDate,
    promptResetSampleData,
    openAddCustomerModal,
    submitAddCustomer,
    openAddRoleModal,
    submitAddRole,
    openAddUserModal,
    submitAddUser,
    openCreateGroupBookingModal,
    addGroupAllocRow,
    submitCreateGroupBooking,
    openBulkAssignRoomsModal,
    submitBulkAssignRooms,
    closeModal,
    toggleSidebar,
    toggleNotifications
  };

})();
