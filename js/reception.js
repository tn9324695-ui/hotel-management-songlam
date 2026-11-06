  /**
 * LOGIC NGHIỆP VỤ RIÊNG BIỆT - QUẦY LỄ TÂN (FRONT DESK)
 * Khách sạn Sông Lam (Tham khảo Mường Thanh Luxury Sông Lam)
 * Tách biệt độc lập: Chỉ phục vụ đón tiếp, check-in, check-out, đặt phòng và folio tại quầy.
 * Đồng bộ 100% qua window.SongLamStore (BroadcastChannel & localStorage).
 */

(function () {
  'use strict';

  // Lấy dữ liệu qua SongLamStore
  const store = window.SongLamStore;

  const state = {
    timelineStart: null,
    timelineDays: 14,
    timelineFilters: { floor: 'all', classCode: 'all', search: '' },
    currentScreen: 'rec_room_rack',
    currentUser: {
      id: 'NV-02',
      username: 'huong.letan',
      fullName: 'Trần Thu Hương',
      roleCode: 'receptionist',
      roleName: 'Lễ tân trưởng (Ca trực)'
    },
    selectedRoomId: null,
    sidebarCollapsed: false,
    expandedGroups: {},
    filters: {
      roomRack: {
        floor: 'all',
        stayStatus: 'all',
        search: ''
      },
      bookings: {
        status: 'all',
        tab: 'all',
        search: ''
      }
    }
  };

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
    dateInput: function (dateStr) {
      if (!dateStr) return '';
      return dateStr.split(' ')[0];
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

  function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    let iconName = type === 'danger' ? 'alert-triangle' : (type === 'info' ? 'info' : 'check-circle');
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

  function updateTopbarDate() {
    const el = document.getElementById('topbarWorkingDateText');
    if (el && store) {
      el.textContent = fmt.date(store.getWorkingDate());
    }
  }

  // 1. SƠ ĐỒ ĐÓN KHÁCH (ROOM RACK QUẦY LỄ TÂN)
  function renderRecRoomRack() {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const rooms = data.rooms || [];
    const stays = data.stays || [];
    const roomClasses = data.roomClasses || [];
    const wDate = store ? store.getWorkingDate() : '2026-10-25';
    const f = state.filters.roomRack;

    let filteredRooms = rooms.filter(r => {
      if (f.floor !== 'all' && r.floor !== parseInt(f.floor, 10)) return false;
      if (f.stayStatus !== 'all' && r.stayStatus !== f.stayStatus) return false;
      if (f.search.trim()) {
        const q = f.search.trim().toLowerCase();
        const stay = stays.find(s => s.id === r.currentStayId);
        const guestName = (stay && stay.guest && stay.guest.name) ? stay.guest.name.toLowerCase() : '';
        const phone = (stay && stay.guest && stay.guest.phone) ? stay.guest.phone.toLowerCase() : '';
        const cccd = (stay && stay.guest && stay.guest.identityCard) ? stay.guest.identityCard.toLowerCase() : '';
        if (!r.number.toLowerCase().includes(q) && !guestName.includes(q) && !phone.includes(q) && !cccd.includes(q)) {
          return false;
        }
      }
      return true;
    });

    const readyCount = rooms.filter(r => r.stayStatus === 'vacant' && r.cleanStatus === 'clean' && r.exploitationStatus === 'active').length;
    const occupiedCount = rooms.filter(r => r.stayStatus === 'occupied').length;
    const arrivalsTodayCount = (data.bookings || []).filter(b => b.checkInDate === wDate && b.bookingStatus !== 'cancelled' && b.bookingStatus !== 'checked_in').length;
    const departuresTodayCount = stays.filter(s => s.status === 'in_house' && s.expectedCheckOutDate && s.expectedCheckOutDate.startsWith(wDate)).length;

    let html = `
      <div class="rec-quick-actions-bar">
        <div>
          <div style="font-size: 16px; font-weight: 800; color: #0284c7; display: flex; align-items: center; gap: 8px;">
            <i data-lucide="bell" style="width: 20px; height: 20px;"></i>
            QUẦY LỄ TÂN &bull; SƠ ĐỒ ĐÓN TIẾP KHÁCH HÀNG
          </div>
          <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
            Mô hình đón tiếp: Nhận phòng nhanh (Walk-in), Check-in đơn đặt, Đổi phòng, Gia hạn và Quyết toán Folio
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-primary" onclick="window.receptionApp.openCreateBookingModal()">
            <i data-lucide="calendar-plus"></i> Đặt phòng mới
          </button>
          <button class="btn btn-success" onclick="window.receptionApp.openQuickWalkInModal()">
            <i data-lucide="user-plus"></i> Nhận phòng nhanh (Walk-in)
          </button>
        </div>
      </div>

      <!-- Thống kê nhanh ca trực -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 14px;">
        <div style="background: #ffffff; border: 1px solid #b7ebcf; border-radius: var(--radius-sm); padding: 10px 14px;">
          <div style="font-size: 11px; font-weight: 700; color: var(--success); text-transform: uppercase;">Phòng sạch sẵn sàng đón</div>
          <div style="font-size: 20px; font-weight: 800; color: var(--success);">${readyCount} <span style="font-size: 12px; color: var(--text-muted); font-weight: normal;">phòng</span></div>
        </div>
        <div style="background: #ffffff; border: 1px solid #bae6fd; border-radius: var(--radius-sm); padding: 10px 14px;">
          <div style="font-size: 11px; font-weight: 700; color: #0284c7; text-transform: uppercase;">Phòng đang có khách</div>
          <div style="font-size: 20px; font-weight: 800; color: #0284c7;">${occupiedCount} <span style="font-size: 12px; color: var(--text-muted); font-weight: normal;">phòng</span></div>
        </div>
        <div style="background: #ffffff; border: 1px solid #fde68a; border-radius: var(--radius-sm); padding: 10px 14px;">
          <div style="font-size: 11px; font-weight: 700; color: #b45309; text-transform: uppercase;">Khách dự kiến đến hôm nay</div>
          <div style="font-size: 20px; font-weight: 800; color: #b45309;">${arrivalsTodayCount} <span style="font-size: 12px; color: var(--text-muted); font-weight: normal;">đơn</span></div>
        </div>
        <div style="background: #ffffff; border: 1px solid #fecaca; border-radius: var(--radius-sm); padding: 10px 14px;">
          <div style="font-size: 11px; font-weight: 700; color: #dc2626; text-transform: uppercase;">Khách dự kiến trả hôm nay</div>
          <div style="font-size: 20px; font-weight: 800; color: #dc2626;">${departuresTodayCount} <span style="font-size: 12px; color: var(--text-muted); font-weight: normal;">phòng</span></div>
        </div>
      </div>

      <!-- Lọc nhanh -->
      <div class="filter-toolbar">
        <div class="filter-left-group">
          <div class="filter-item">
            <span class="filter-label">Tầng:</span>
            <select class="form-select" onchange="window.receptionApp.updateRoomFilter('floor', this.value)">
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
            <span class="filter-label">Trạng thái:</span>
            <select class="form-select" onchange="window.receptionApp.updateRoomFilter('stayStatus', this.value)">
              <option value="all" ${f.stayStatus === 'all' ? 'selected' : ''}>Tất cả trạng thái</option>
              <option value="vacant" ${f.stayStatus === 'vacant' ? 'selected' : ''}>Phòng trống</option>
              <option value="occupied" ${f.stayStatus === 'occupied' ? 'selected' : ''}>Đang có khách</option>
            </select>
          </div>
        </div>
        <div>
          <input type="text" class="form-input" style="width: 280px;" placeholder="Tìm số phòng, tên khách, CCCD..." 
                 value="${escapeHtml(f.search)}" oninput="window.receptionApp.updateRoomFilter('search', this.value)" />
        </div>
      </div>

      <!-- Lưới thẻ phòng -->
      <div class="room-grid" style="grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));">
        ${filteredRooms.map(room => {
          const stay = stays.find(s => s.id === room.currentStayId && s.status === 'in_house');
          const rClass = roomClasses.find(c => c.code === room.classCode) || {};
          const isOccupied = room.stayStatus === 'occupied';
          const isClean = room.cleanStatus === 'clean';
          const isMaintenance = room.exploitationStatus === 'maintenance';
          const canCheckIn = !isOccupied && isClean && !isMaintenance;

          let cleanBadgeHtml = '';
          if (isClean) {
            cleanBadgeHtml = '<span class="badge badge-clean">SẠCH</span>';
          } else if (room.cleanStatus === 'cleaning') {
            cleanBadgeHtml = '<span class="badge badge-cleaning">ĐANG DỌN</span>';
          } else if (room.cleanStatus === 'inspecting') {
            cleanBadgeHtml = '<span class="badge badge-inspecting">CHỜ KT</span>';
          } else {
            cleanBadgeHtml = '<span class="badge badge-dirty">CHỜ DỌN</span>';
          }

          let borderColor = '#b7ebcf';
          if (isMaintenance) borderColor = '#f87171';
          else if (isOccupied) borderColor = '#93c5fd';
          else if (!isClean) borderColor = '#fde68a';

          return `
            <div class="room-card ${isOccupied ? 'occupied' : ''}" style="border: 2px solid ${borderColor};">
              <div class="room-card-top">
                <div class="room-number-wrap">
                  <span class="room-number">P.${escapeHtml(room.number)}</span>
                  <span class="room-class-code">${escapeHtml(room.classCode)}</span>
                </div>
                <div>
                  ${isMaintenance ? '<span class="badge badge-maintenance">BẢO TRÌ</span> ' : ''}
                  ${cleanBadgeHtml}
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
                    ${isMaintenance ? 'Tạm khóa bảo trì' : (isClean ? 'Sẵn sàng đón khách' : 'Chưa được duyệt sạch')}
                  </div>
                  <div style="font-size: 11.5px; color: var(--text-muted);">${fmt.currency(rClass.basePrice)}/đêm</div>
                `}
              </div>

              <div class="room-card-bottom" style="gap: 4px;">
                ${isOccupied ? `
                  <button class="btn btn-secondary btn-sm" style="flex: 1;" onclick="window.receptionApp.openRoomDrawer('${room.id}')">
                    <i data-lucide="eye"></i> Chi tiết
                  </button>
                  <button class="btn btn-danger btn-sm" style="flex: 1;" onclick="window.receptionApp.openCheckoutModal('${room.number}')">
                    <i data-lucide="log-out"></i> Trả phòng
                  </button>
                ` : `
                  ${canCheckIn ? `
                    <button class="btn btn-primary btn-sm" style="width: 100%; font-weight: 700;" onclick="window.receptionApp.openDirectCheckInModal('${room.number}')">
                      <i data-lucide="user-plus"></i> Nhận phòng ngay
                    </button>
                  ` : `
                    <button class="btn btn-secondary btn-sm disabled" style="width: 100%;" disabled title="${isMaintenance ? 'Phòng đang bảo trì' : 'Phòng chưa sạch, buồng phòng cần dọn và duyệt sạch'}">
                      ${isMaintenance ? 'Đang bảo trì' : 'Chờ buồng phòng duyệt'}
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

  // 2. DANH SÁCH ĐÓN KHÁCH HÔM NAY (CHECK-IN)
  function renderRecArrivals() {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const wDate = store ? store.getWorkingDate() : '2026-10-25';
    const arrivals = (data.bookings || []).filter(b => 
      b.checkInDate === wDate && 
      b.bookingStatus !== 'cancelled' &&
      b.bookingStatus !== 'checked_in'
    );

    let html = `
      <div class="page-header">
        <div class="page-title-box">
          <h1 class="page-title"><i data-lucide="log-in" style="color: #0284c7;"></i> Quầy Lễ Tân &bull; Danh sách khách đón hôm nay (${fmt.date(wDate)})</h1>
          <div class="page-breadcrumb">Khách đã đặt phòng trước đến nhận phòng trong ca trực hôm nay (Hỗ trợ đơn nhiều phòng & nhận từng phần)</div>
        </div>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Mã đặt phòng</th>
              <th>Khách đại diện</th>
              <th>Số điện thoại</th>
              <th>Hạng phòng</th>
              <th class="text-center">Số lượng & Tiến độ</th>
              <th class="text-right">Tiền cọc ghi nhận</th>
              <th>Phòng đã nhận / Gán</th>
              <th class="text-right">Thao tác nhận phòng</th>
            </tr>
          </thead>
          <tbody>
            ${arrivals.length === 0 ? '<tr><td colspan="8" class="text-center" style="padding: 30px;">Không còn khách nào dự kiến đến thêm hôm nay.</td></tr>' : ''}
            ${arrivals.map(b => {
              const checkedCount = (b.checkedInRooms || []).length;
              const totalRooms = b.roomQuantity || 1;
              const isPartiallyCheckedIn = checkedCount > 0 && checkedCount < totalRooms;

              return `
                <tr>
                  <td><span style="font-weight: 700; color: var(--primary);">${escapeHtml(b.id)}</span></td>
                  <td>
                    <div style="font-weight: 600; font-size: 13.5px;">${escapeHtml(b.guestName)}</div>
                    <div style="font-size: 11px; color: var(--text-secondary);">${escapeHtml(b.email || 'khach@letan.vn')}</div>
                  </td>
                  <td style="font-weight: 600;">${escapeHtml(b.phone)}</td>
                  <td><span class="badge badge-vacant">${escapeHtml(b.roomClassCode)}</span></td>
                  <td class="text-center">
                    <span class="font-amount">x${totalRooms}</span>
                    <div style="font-size: 11px; margin-top: 2px;">
                      ${isPartiallyCheckedIn ? `<span class="badge badge-warning">Đã nhận ${checkedCount}/${totalRooms}</span>` : `<span class="badge badge-clean">Chưa nhận</span>`}
                    </div>
                  </td>
                  <td class="text-right font-amount" style="color: ${(b.depositPaid || b.depositAmount) > 0 ? 'var(--success)' : 'var(--text-muted)'};">
                    ${fmt.currency(b.depositPaid || b.depositAmount || 0)}
                  </td>
                  <td>
                    ${(b.checkedInRooms && b.checkedInRooms.length > 0) ? 
                      b.checkedInRooms.map(r => `<span class="badge badge-occupied">P.${r} (Đang ở)</span>`).join(' ') : ''}
                    ${(b.assignedRooms && b.assignedRooms.filter(r => !(b.checkedInRooms || []).includes(r)).map(r => `<span class="badge badge-clean">P.${r} (Dự kiến)</span>`).join(' ')) || ''}
                    ${(!b.assignedRooms || b.assignedRooms.length === 0) && (!b.checkedInRooms || b.checkedInRooms.length === 0) ? '<span style="font-size: 11.5px; color: #b45309;">Chưa gán số phòng</span>' : ''}
                  </td>
                  <td class="text-right">
                    <button class="btn btn-primary" onclick="window.receptionApp.openCheckInForBooking('${b.id}')">
                      <i data-lucide="check"></i> ${isPartiallyCheckedIn ? 'Nhận phòng tiếp theo' : 'Làm thủ tục Nhận phòng'}
                    </button>
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

  // 3. DANH SÁCH TRẢ PHÒNG HÔM NAY (CHECK-OUT & QUYẾT TOÁN)
  function renderRecDepartures() {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const wDate = store ? store.getWorkingDate() : '2026-10-25';
    const departures = (data.stays || []).filter(s => s.status === 'in_house' && s.expectedCheckOutDate && s.expectedCheckOutDate.startsWith(wDate));

    let html = `
      <div class="page-header">
        <div class="page-title-box">
          <h1 class="page-title"><i data-lucide="log-out" style="color: #b45309;"></i> Quầy Lễ Tân &bull; Danh sách khách trả phòng hôm nay (${fmt.date(wDate)})</h1>
          <div class="page-breadcrumb">Quyết toán Folio, kiểm tra biên bản buồng phòng minibar và in Phiếu thanh toán minh họa</div>
        </div>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Số phòng</th>
              <th>Khách lưu trú</th>
              <th>Số điện thoại</th>
              <th>Giờ dự kiến trả</th>
              <th>Kiểm tra Minibar</th>
              <th class="text-right">Tổng chi phí</th>
              <th class="text-right">Đã thanh toán / Cọc</th>
              <th class="text-right">Còn phải thu</th>
              <th class="text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${departures.length === 0 ? '<tr><td colspan="9" class="text-center" style="padding: 30px;">Không có phòng nào sắp trả hôm nay.</td></tr>' : ''}
            ${departures.map(s => {
              const folio = store ? store.calculateStayFolio(s.id) : null;
              const remainingDue = folio ? folio.remainingDue : 0;
              const totalAmount = folio ? folio.totalAmount : 0;
              const paymentsCollected = folio ? (folio.paymentsCollected + folio.depositPaid) : (s.depositAmount || 0);

              // Kiểm tra xem buồng phòng đã kiểm tra minibar chưa
              const minibarItems = (s.servicesUsed || []).filter(sv => sv.isMinibar);
              const minibarTotal = minibarItems.reduce((acc, sv) => acc + (sv.amount || 0), 0);

              return `
                <tr>
                  <td><span style="font-size: 16px; font-weight: 800; color: var(--primary);">P.${escapeHtml(s.roomNumber)}</span></td>
                  <td>
                    <div style="font-weight: 600;">${escapeHtml(s.guest.name)}</div>
                    <div style="font-size: 11px; color: var(--text-secondary);">CCCD: ${escapeHtml(s.guest.identityCard)}</div>
                  </td>
                  <td>${escapeHtml(s.guest.phone)}</td>
                  <td style="font-weight: 600;">${escapeHtml(s.expectedCheckOutDate.split(' ')[1] || '12:00')}</td>
                  <td>
                    ${minibarItems.length > 0 ? 
                      `<span class="badge badge-clean" title="${minibarItems.map(m => m.name + ' x' + m.quantity).join(', ')}">Đã kiểm: ${fmt.currency(minibarTotal)}</span>` : 
                      `<span class="badge badge-vacant">Chưa phát sinh</span>`
                    }
                  </td>
                  <td class="text-right font-amount">${fmt.currency(totalAmount)}</td>
                  <td class="text-right font-amount" style="color: var(--success);">${fmt.currency(paymentsCollected)}</td>
                  <td class="text-right font-amount" style="color: ${remainingDue > 0 ? 'var(--danger)' : 'var(--success)'}; font-weight: 700;">
                    ${fmt.currency(remainingDue)}
                  </td>
                  <td class="text-right">
                    <button class="btn btn-danger btn-sm" onclick="window.receptionApp.openCheckoutModal('${s.roomNumber}')">
                      <i data-lucide="receipt"></i> Quyết toán & Trả phòng
                    </button>
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

  // 4. ĐƠN ĐẶT PHÒNG & QUẢN LÝ KHÁCH ĐOÀN
  function renderRecBookings() {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const allBookings = data.bookings || [];
    const wDate = store ? store.getWorkingDate() : '2026-10-25';

    state.filters.bookings = state.filters.bookings || { status: 'all', tab: 'all', search: '' };
    state.filters.bookings.tab = state.filters.bookings.tab || 'all';
    state.expandedGroups = state.expandedGroups || {};

    const curTab = state.filters.bookings.tab;
    const curSearch = (state.filters.bookings.search || '').trim().toLowerCase();
    const curStatus = state.filters.bookings.status || 'all';

    // Xác định đơn đặt phòng theo đoàn hoặc doanh nghiệp
    const isGroupBooking = b => Boolean(
      b.isGroup ||
      b.masterBookingId ||
      b.groupName ||
      (b.roomQuantity > 1) ||
      b.channel === 'corporate' ||
      b.source === 'Khách đoàn / Doanh nghiệp'
    );

    const groupCount = allBookings.filter(isGroupBooking).length;
    const individualCount = allBookings.filter(b => !isGroupBooking(b)).length;
    const totalCount = allBookings.length;

    // Lọc theo bộ lọc
    const filtered = allBookings.filter(b => {
      if (curTab === 'group' && !isGroupBooking(b)) return false;
      if (curTab === 'individual' && isGroupBooking(b)) return false;
      if (curStatus !== 'all' && b.bookingStatus !== curStatus) return false;

      if (curSearch) {
        const idMatch = (b.id || '').toLowerCase().includes(curSearch);
        const masterMatch = (b.masterBookingId || '').toLowerCase().includes(curSearch);
        const nameMatch = (b.guestName || (b.guest && b.guest.name) || '').toLowerCase().includes(curSearch);
        const groupMatch = (b.groupName || '').toLowerCase().includes(curSearch);
        const phoneMatch = (b.phone || (b.guest && b.guest.phone) || '').toLowerCase().includes(curSearch);
        const classMatch = (b.roomClassCode || '').toLowerCase().includes(curSearch);
        if (!idMatch && !masterMatch && !nameMatch && !groupMatch && !phoneMatch && !classMatch) return false;
      }
      return true;
    });

    // Gom nhóm các đơn đoàn khi xem tab Khách đoàn
    const groupMap = {};
    if (curTab === 'group') {
      filtered.forEach(b => {
        const gKey = b.masterBookingId || (b.isGroup && b.groupName ? b.groupName : b.id);
        if (!groupMap[gKey]) {
          groupMap[gKey] = {
            key: gKey,
            masterId: b.masterBookingId || b.id,
            groupName: b.groupName || b.guestName || (b.guest ? b.guest.name : 'Khách đoàn'),
            contactName: b.guestName || (b.guest ? b.guest.name : 'Người đại diện'),
            phone: b.phone || (b.guest ? b.guest.phone : ''),
            email: b.email || (b.guest ? b.guest.email : ''),
            checkInDate: b.checkInDate,
            checkOutDate: b.checkOutDate,
            totalRooms: 0,
            assignedRoomsCount: 0,
            checkedInRoomsCount: 0,
            totalEstimated: 0,
            depositPaid: 0,
            status: b.bookingStatus,
            subBookings: []
          };
        }
        const grp = groupMap[gKey];
        const qty = b.roomQuantity || 1;
        grp.totalRooms += qty;
        grp.assignedRoomsCount += (b.assignedRooms || []).length;
        grp.checkedInRoomsCount += (b.checkedInRooms || []).length;
        grp.totalEstimated += (b.totalEstimated || b.totalEstimatedPrice || b.totalPrice || 0);
        grp.depositPaid += (b.depositPaid || b.depositAmount || 0);
        grp.subBookings.push(b);
        if (b.checkInDate < grp.checkInDate) grp.checkInDate = b.checkInDate;
        if (b.checkOutDate > grp.checkOutDate) grp.checkOutDate = b.checkOutDate;
      });
    }

    const groupList = Object.values(groupMap);

    let html = `
      <div class="page-header">
        <div class="page-title-box">
          <h1 class="page-title"><i data-lucide="calendar-check" style="color: #0284c7;"></i> Quầy Lễ Tân &bull; Quản lý Đặt phòng & Khách đoàn</h1>
          <div class="page-breadcrumb">Tiếp nhận đặt phòng khách lẻ, khách đoàn doanh nghiệp, gán phòng vật lý và nhận phòng hàng loạt</div>
        </div>
        <div class="page-actions" style="display: flex; gap: 8px;">
          <button class="btn btn-primary" onclick="window.receptionApp.openCreateGroupBookingModal()">
            <i data-lucide="users"></i> Đặt phòng Khách đoàn
          </button>
          <button class="btn btn-secondary" onclick="window.receptionApp.openCreateBookingModal()">
            <i data-lucide="calendar-plus"></i> Đặt phòng Lẻ
          </button>
        </div>
      </div>

      <!-- Thanh chuyển đổi Phân hệ Đặt phòng (Tab pills) & Bộ lọc -->
      <div class="filter-bar" style="background: #ffffff; padding: 12px 16px; border-radius: var(--radius-lg); border: 1px solid var(--border-color); margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <button class="filter-pill-btn ${curTab === 'all' ? 'active' : ''}" onclick="window.receptionApp.setBookingTab('all')">
            <i data-lucide="list"></i> Tất cả đơn (${totalCount})
          </button>
          <button class="filter-pill-btn ${curTab === 'group' ? 'active' : ''}" onclick="window.receptionApp.setBookingTab('group')">
            <i data-lucide="building-2"></i> 🏢 Đặt theo đoàn / Công ty (${groupCount})
          </button>
          <button class="filter-pill-btn ${curTab === 'individual' ? 'active' : ''}" onclick="window.receptionApp.setBookingTab('individual')">
            <i data-lucide="user"></i> 👤 Khách lẻ (${individualCount})
          </button>
        </div>

        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <div style="position: relative; width: 220px;">
            <i data-lucide="search" style="position: absolute; left: 10px; top: 10px; width: 14px; height: 14px; color: var(--text-muted);"></i>
            <input type="text" class="form-control" style="padding-left: 32px; height: 34px; font-size: 12.5px;" 
                   placeholder="Tìm tên đoàn, khách, SĐT..." 
                   value="${escapeHtml(curSearch)}" 
                   oninput="window.receptionApp.updateBookingFilter('search', this.value)" />
          </div>

          <select class="form-select" style="width: 150px; height: 34px; font-size: 12px;" 
                  onchange="window.receptionApp.updateBookingFilter('status', this.value)">
            <option value="all" ${curStatus === 'all' ? 'selected' : ''}>Tất cả trạng thái</option>
            <option value="confirmed" ${curStatus === 'confirmed' ? 'selected' : ''}>Đã xác nhận</option>
            <option value="deposited" ${curStatus === 'deposited' ? 'selected' : ''}>Đã đặt cọc</option>
            <option value="checked_in" ${curStatus === 'checked_in' ? 'selected' : ''}>Đã nhận phòng</option>
            <option value="cancelled" ${curStatus === 'cancelled' ? 'selected' : ''}>Đã hủy</option>
          </select>
        </div>
      </div>
    `;

    // NẾU XEM TAB "ĐẶT THEO ĐOÀN" -> HIỂN THỊ DẠNG THẺ QUẢN LÝ ĐOÀN (GROUP CARDS)
    if (curTab === 'group') {
      if (groupList.length === 0) {
        html += `
          <div class="card" style="padding: 40px; text-align: center; border-radius: var(--radius-lg);">
            <div style="width: 56px; height: 56px; border-radius: 50%; background: #e0f2fe; color: #0284c7; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px;">
              <i data-lucide="users" style="width: 28px; height: 28px;"></i>
            </div>
            <h3 style="font-size: 16px; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">Không tìm thấy đơn khách đoàn nào</h3>
            <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">Chưa có đơn đặt phòng theo đoàn hoặc công ty nào khớp với bộ lọc hiện tại.</p>
            <button class="btn btn-primary" onclick="window.receptionApp.openCreateGroupBookingModal()">
              <i data-lucide="plus-circle"></i> Đặt phòng Khách đoàn Mới ngay
            </button>
          </div>
        `;
      } else {
        html += `
          <div class="group-bookings-list">
            ${groupList.map(grp => {
              const nights = store ? store.calculateNights(grp.checkInDate, grp.checkOutDate) : 1;
              const isFullyAssigned = grp.assignedRoomsCount >= grp.totalRooms;
              const isFullyCheckedIn = grp.checkedInRoomsCount >= grp.totalRooms;
              const isExpanded = state.expandedGroups[grp.key] !== false; // Mặc định mở chi tiết

              // Tìm sub-booking đầu tiên chưa gán phòng hoặc chưa check-in để tạo nút thao tác nhanh
              const unassignedSub = grp.subBookings.find(sb => (sb.assignedRooms || []).length < (sb.roomQuantity || 1));
              const readyCheckInSub = grp.subBookings.find(sb => {
                const assigned = sb.assignedRooms || [];
                const checked = sb.checkedInRooms || [];
                return assigned.some(r => !checked.includes(r));
              });

              return `
                <div class="group-booking-card">
                  <!-- Header Thẻ Đoàn -->
                  <div class="group-card-header">
                    <div class="group-card-title">
                      <div style="width: 38px; height: 38px; border-radius: 8px; background: #0284c7; color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px;">
                        <i data-lucide="building-2" style="width: 20px; height: 20px;"></i>
                      </div>
                      <div>
                        <div style="font-size: 15px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 8px;">
                          <span>${escapeHtml(grp.groupName)}</span>
                          <span class="badge" style="background: #e0e7ff; color: #4338ca; font-size: 11px;">MÃ: ${escapeHtml(grp.masterId)}</span>
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                          <i data-lucide="user" style="width: 12px; height: 12px; vertical-align: middle;"></i> ĐD: <b>${escapeHtml(grp.contactName)}</b> &bull; 
                          <i data-lucide="phone" style="width: 12px; height: 12px; vertical-align: middle;"></i> ${escapeHtml(grp.phone || 'Chưa có SĐT')} &bull; 
                          <i data-lucide="calendar" style="width: 12px; height: 12px; vertical-align: middle;"></i> ${fmt.date(grp.checkInDate)} &rarr; ${fmt.date(grp.checkOutDate)} (<b>${nights}</b> đêm)
                        </div>
                      </div>
                    </div>

                    <!-- Thao tác nhanh cấp Đoàn -->
                    <div style="display: flex; align-items: center; gap: 6px;">
                      ${unassignedSub ? `
                        <button class="btn btn-secondary btn-sm" onclick="window.receptionApp.openBulkAssignRoomsModal('${unassignedSub.id}')" title="Phân phòng vật lý cho đoàn">
                          <i data-lucide="grid"></i> Gán phòng (${grp.totalRooms - grp.assignedRoomsCount} còn lại)
                        </button>
                      ` : ''}

                      ${readyCheckInSub ? `
                        <button class="btn btn-primary btn-sm" onclick="window.receptionApp.openBulkCheckInModal('${readyCheckInSub.id}')" title="Nhận phòng hàng loạt cho đoàn">
                          <i data-lucide="users"></i> Nhận phòng đoàn
                        </button>
                      ` : ''}

                      <button class="btn btn-secondary btn-sm" onclick="window.receptionApp.toggleGroupDetails('${grp.key}')" title="Thu gọn / Mở rộng chi tiết">
                        <i data-lucide="${isExpanded ? 'chevron-up' : 'chevron-down'}"></i> ${isExpanded ? 'Thu gọn' : 'Chi tiết'}
                      </button>
                    </div>
                  </div>

                  <!-- Thân Thẻ Đoàn -->
                  <div class="group-card-body">
                    <!-- Hàng KPI & Tiến độ nghiệp vụ -->
                    <div class="group-metrics-row">
                      <div class="group-metric-badge highlight">
                        <i data-lucide="door-closed" style="width: 14px; height: 14px;"></i>
                        <span>Quy mô: <b>${grp.totalRooms}</b> phòng</span>
                      </div>

                      <div class="group-metric-badge ${isFullyAssigned ? 'success' : 'warning'}">
                        <i data-lucide="${isFullyAssigned ? 'check-circle' : 'alert-circle'}" style="width: 14px; height: 14px;"></i>
                        <span>Tiến độ gán phòng: <b>${grp.assignedRoomsCount} / ${grp.totalRooms}</b></span>
                      </div>

                      <div class="group-metric-badge ${isFullyCheckedIn ? 'success' : 'highlight'}">
                        <i data-lucide="user-check" style="width: 14px; height: 14px;"></i>
                        <span>Tiến độ Check-in: <b>${grp.checkedInRoomsCount} / ${grp.totalRooms}</b></span>
                      </div>

                      <div class="group-metric-badge">
                        <i data-lucide="receipt" style="width: 14px; height: 14px;"></i>
                        <span>Dự kiến: <b class="font-amount">${fmt.currency(grp.totalEstimated)}</b></span>
                      </div>

                      <div class="group-metric-badge ${grp.depositPaid > 0 ? 'success' : 'warning'}">
                        <i data-lucide="shield-check" style="width: 14px; height: 14px;"></i>
                        <span>Cọc ghi nhận: <b>${grp.depositPaid > 0 ? fmt.currency(grp.depositPaid) : 'Chưa thu cọc'}</b></span>
                      </div>
                    </div>

                    <!-- Bảng chi tiết các dòng phòng của đoàn -->
                    ${isExpanded ? `
                      <div class="table-container" style="border: 1px solid var(--border-color); border-radius: var(--radius-md); margin-top: 10px;">
                        <table class="data-table" style="font-size: 12.5px;">
                          <thead>
                            <tr style="background: #f8fafc;">
                              <th>Mã đơn con</th>
                              <th>Hạng phòng</th>
                              <th class="text-center">Số lượng</th>
                              <th>Phòng vật lý đã gán</th>
                              <th class="text-right">Cọc phân bổ</th>
                              <th class="text-right">Tổng tiền</th>
                              <th class="text-center">Trạng thái</th>
                              <th class="text-right">Thao tác</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${grp.subBookings.map(sb => {
                              const assigned = sb.assignedRooms || [];
                              const checked = sb.checkedInRooms || [];
                              const isSubAssigned = assigned.length >= (sb.roomQuantity || 1);
                              const isSubCheckedIn = sb.bookingStatus === 'checked_in' || checked.length >= (sb.roomQuantity || 1);

                              let sbStatusBadge = '<span class="badge badge-clean">Đã xác nhận</span>';
                              if (isSubCheckedIn) {
                                sbStatusBadge = '<span class="badge badge-occupied">Đã nhận phòng</span>';
                              } else if (sb.bookingStatus === 'cancelled') {
                                sbStatusBadge = '<span class="badge badge-maintenance">Đã hủy</span>';
                              } else if (sb.depositPaid > 0 || sb.depositAmount > 0) {
                                sbStatusBadge = '<span class="badge badge-clean">Đã cọc</span>';
                              }

                              return `
                                <tr>
                                  <td><span style="font-weight: 700; color: var(--primary);">${escapeHtml(sb.id)}</span></td>
                                  <td><span class="badge badge-vacant" style="font-size: 11px;">${escapeHtml(sb.roomClassCode)}</span></td>
                                  <td class="text-center"><b>${sb.roomQuantity || 1}</b> phòng</td>
                                  <td>
                                    ${assigned.length > 0 ? assigned.map(rNum => {
                                      const isRoomIn = checked.includes(rNum);
                                      return `<span class="badge ${isRoomIn ? 'badge-occupied' : 'badge-clean'}" style="margin-right: 4px;">P.${rNum} ${isRoomIn ? '(Đang ở)' : ''}</span>`;
                                    }).join('') : '<span style="color: #b45309; font-size: 11.5px;">Chưa phân phòng</span>'}
                                  </td>
                                  <td class="text-right font-amount" style="color: ${(sb.depositPaid || sb.depositAmount) > 0 ? 'var(--success)' : 'var(--text-muted)'}; font-weight: 600;">
                                    ${fmt.currency(sb.depositPaid || sb.depositAmount || 0)}
                                  </td>
                                  <td class="text-right font-amount">${fmt.currency(sb.totalEstimated || sb.totalEstimatedPrice || sb.totalPrice || 0)}</td>
                                  <td class="text-center">${sbStatusBadge}</td>
                                  <td class="text-right">
                                    <div style="display: inline-flex; gap: 4px;">
                                      ${(!isSubCheckedIn && sb.bookingStatus !== 'cancelled') ? `
                                        ${!isSubAssigned ? `
                                          <button class="btn btn-secondary btn-xs" onclick="window.receptionApp.openBulkAssignRoomsModal('${sb.id}')" title="Phân phòng vật lý">
                                            <i data-lucide="grid"></i> Gán phòng
                                          </button>
                                        ` : `
                                          <button class="btn btn-secondary btn-xs" onclick="window.receptionApp.openBulkAssignRoomsModal('${sb.id}')" title="Đổi / Gán lại phòng">
                                            <i data-lucide="refresh-cw"></i> Đổi phòng
                                          </button>
                                        `}

                                        ${(sb.roomQuantity > 1) ? `
                                          <button class="btn btn-primary btn-xs" onclick="window.receptionApp.openBulkCheckInModal('${sb.id}')" title="Nhận phòng hàng loạt">
                                            <i data-lucide="users"></i> Nhận đoàn
                                          </button>
                                        ` : `
                                          <button class="btn btn-primary btn-xs" onclick="window.receptionApp.openCheckInForBooking('${sb.id}')">
                                            <i data-lucide="check"></i> Nhận phòng
                                          </button>
                                        `}

                                        <button class="btn btn-secondary btn-xs" onclick="window.receptionApp.promptCancelBooking('${sb.id}')" title="Hủy đơn">
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
                    ` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }
    } else {
      // TAB "TẤT CẢ" HOẶC "KHÁCH LẺ" -> HIỂN THỊ DẠNG BẢNG TIÊU CHUẨN
      html += `
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Mã đặt</th>
                <th>Khách đại diện / Đoàn</th>
                <th>Điện thoại</th>
                <th>Thời gian lưu trú</th>
                <th class="text-center">Số đêm</th>
                <th>Hạng & SL</th>
                <th class="text-right">Tổng dự kiến</th>
                <th class="text-right">Cọc đã thu</th>
                <th class="text-center">Trạng thái</th>
                <th class="text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.length === 0 ? '<tr><td colspan="10" class="text-center" style="padding: 30px;">Không có đơn đặt phòng nào phù hợp với điều kiện tìm kiếm.</td></tr>' : ''}
              ${filtered.map(b => {
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

                const depositPaid = b.depositPaid || b.depositAmount || 0;
                const isGroup = isGroupBooking(b);
                const assigned = b.assignedRooms || [];
                const isAssigned = assigned.length >= (b.roomQuantity || 1);

                return `
                  <tr>
                    <td><span style="font-weight: 700; color: var(--primary);">${escapeHtml(b.id)}</span></td>
                    <td>
                      <div style="font-weight: 600;">${escapeHtml(b.guestName || (b.guest && b.guest.name))}</div>
                      ${isGroup ? `
                        <div style="margin-top: 2px;">
                          <span class="badge" style="background: #e0e7ff; color: #4338ca; font-weight: 700; font-size: 10.5px;">
                            🏢 ĐOÀN: ${escapeHtml(b.groupName || b.guestName || 'Khách đoàn')}
                          </span>
                        </div>
                      ` : ''}
                      <div style="font-size: 11px; color: var(--text-secondary);">${escapeHtml(b.email || (b.guest && b.guest.email) || '')}</div>
                    </td>
                    <td>${escapeHtml(b.phone || (b.guest && b.guest.phone) || '')}</td>
                    <td>${fmt.date(b.checkInDate)} &rarr; ${fmt.date(b.checkOutDate)}</td>
                    <td class="text-center"><b>${nights}</b> đêm</td>
                    <td>
                      <span class="badge badge-vacant">${escapeHtml(b.roomClassCode)}</span> 
                      <b>x${b.roomQuantity || 1}</b>
                      ${assigned.length > 0 ? `<div style="font-size: 11px; color: #0284c7; margin-top: 2px;">P.${assigned.join(', P.')}</div>` : ''}
                    </td>
                    <td class="text-right font-amount">${fmt.currency(b.totalEstimated || b.totalEstimatedPrice || b.totalPrice || 0)}</td>
                    <td class="text-right font-amount" style="color: ${depositPaid > 0 ? 'var(--success)' : 'var(--text-muted)'}; font-weight: 600;">
                      ${depositPaid > 0 ? fmt.currency(depositPaid) : '<span style="font-size: 11.5px; color: #b45309;">Chưa thu cọc</span>'}
                    </td>
                    <td class="text-center">${statusBadge}</td>
                    <td class="text-right">
                      <div style="display: inline-flex; gap: 4px;">
                        ${(b.bookingStatus !== 'checked_in' && b.bookingStatus !== 'cancelled') ? `
                          ${!isAssigned ? `
                            <button class="btn btn-secondary btn-xs" onclick="window.receptionApp.openBulkAssignRoomsModal('${b.id}')" title="Phân phòng vật lý">
                              <i data-lucide="grid"></i> Gán phòng
                            </button>
                          ` : ''}

                          ${(b.roomQuantity > 1) ? `
                            <button class="btn btn-primary btn-xs" onclick="window.receptionApp.openBulkCheckInModal('${b.id}')" title="Nhận phòng hàng loạt cho đoàn">
                              <i data-lucide="users"></i> Nhận đoàn
                            </button>
                          ` : `
                            <button class="btn btn-primary btn-xs" onclick="window.receptionApp.openCheckInForBooking('${b.id}')">
                              <i data-lucide="check"></i> Nhận phòng
                            </button>
                          `}

                          <button class="btn btn-secondary btn-xs" onclick="window.receptionApp.promptCancelBooking('${b.id}')" title="Hủy đơn giải phóng quỹ phòng">
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
    }

    document.getElementById('mainContent').innerHTML = html;
  }

  function setBookingTab(tab) {
    state.filters.bookings = state.filters.bookings || {};
    state.filters.bookings.tab = tab;
    renderRecBookings();
    if (window.lucide) lucide.createIcons();
  }

  function updateBookingFilter(key, value) {
    state.filters.bookings = state.filters.bookings || {};
    state.filters.bookings[key] = value;
    renderRecBookings();
    if (window.lucide) lucide.createIcons();
  }

  function toggleGroupDetails(groupKey) {
    state.expandedGroups = state.expandedGroups || {};
    state.expandedGroups[groupKey] = !state.expandedGroups[groupKey];
    renderRecBookings();
    if (window.lucide) lucide.createIcons();
  }


    // 5. KHÁCH ĐANG LƯU TRÚ (IN-HOUSE GUESTS)
  function renderRecStays() {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const stays = (data.stays || []).filter(s => s.status === 'in_house');

    let html = `
      <div class="page-header">
        <div class="page-title-box">
          <h1 class="page-title"><i data-lucide="users" style="color: #0284c7;"></i> Quầy Lễ Tân &bull; Danh sách khách đang lưu trú</h1>
          <div class="page-breadcrumb">Theo dõi phòng đang ở, khách đi cùng, phát sinh chi phí, chuyển phòng và gia hạn lưu trú</div>
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
              <th class="text-right">Tổng tạm tính</th>
              <th class="text-right">Đã thu cọc</th>
              <th class="text-right">Thao tác quầy</th>
            </tr>
          </thead>
          <tbody>
            ${stays.map(s => {
              const folio = store ? store.calculateStayFolio(s.id) : null;
              const totalAmount = folio ? folio.totalAmount : 0;
              const depositPaid = folio ? (folio.paymentsCollected + folio.depositPaid) : (s.depositAmount || 0);

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
                  <td class="text-right">
                    <div style="display: inline-flex; gap: 4px;">
                      <button class="btn btn-secondary btn-sm" onclick="window.receptionApp.openAddServiceModal('${s.roomNumber}')" title="Thêm dịch vụ">
                        <i data-lucide="plus"></i> DV
                      </button>
                      <button class="btn btn-secondary btn-sm" onclick="window.receptionApp.openTransferRoomModal('${s.id}')" title="Chuyển phòng">
                        <i data-lucide="arrow-right-left"></i> Chuyển
                      </button>
                      <button class="btn btn-secondary btn-sm" onclick="window.receptionApp.openExtendStayModal('${s.id}')" title="Gia hạn">
                        <i data-lucide="clock"></i> Gia hạn
                      </button>
                      <button class="btn btn-secondary btn-sm" onclick="window.receptionApp.printInvoice('${s.id}')" title="In phiếu tạm tính">
                        <i data-lucide="printer"></i>
                      </button>
                      <button class="btn btn-danger btn-sm" onclick="window.receptionApp.openCheckoutModal('${s.roomNumber}')">
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

  // 6. GỌI DỊCH VỤ PHÒNG (MINIBAR, SPA, F&B)
  function renderRecServices() {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const services = data.services || [];

    let html = `
      <div class="page-header">
        <div class="page-title-box">
          <h1 class="page-title"><i data-lucide="coffee" style="color: #0284c7;"></i> Quầy Lễ Tân &bull; Menu dịch vụ khách sạn</h1>
          <div class="page-breadcrumb">Tra cứu giá niêm yết và phục vụ yêu cầu phát sinh cho khách lưu trú</div>
        </div>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Mã DV</th>
              <th>Tên dịch vụ</th>
              <th>Phân loại</th>
              <th>Đơn vị tính</th>
              <th class="text-right">Đơn giá niêm yết</th>
            </tr>
          </thead>
          <tbody>
            ${services.map(sv => `
              <tr>
                <td><span style="font-weight: 700; color: var(--primary);">${escapeHtml(sv.code)}</span></td>
                <td style="font-weight: 600;">${escapeHtml(sv.name)}</td>
                <td><span class="badge badge-vacant">${escapeHtml(sv.category)}</span></td>
                <td>${escapeHtml(sv.unit)}</td>
                <td class="text-right font-amount">${fmt.currency(sv.price)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('mainContent').innerHTML = html;
  }

  // Modals & Drawer for Reception
  function openQuickWalkInModal() {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const cleanRooms = (data.rooms || []).filter(r => r.stayStatus === 'vacant' && r.cleanStatus === 'clean' && r.exploitationStatus === 'active');
    if (cleanRooms.length === 0) {
      showToast('Hiện tại không có phòng nào vừa trống vừa sạch để đón khách vãng lai!', 'danger');
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

    // Mặc định trả sau 1 ngày (1 đêm)
    const defaultCheckOutDate = store ? store.addDays(wDate, 1) : '2026-10-26';
    const initialPrice = rClass.basePrice || 1200000;
    const defaultGuarantee = 500000;
    const defaultTotal = initialPrice + defaultGuarantee;

    const modal = document.getElementById('appModal');
    modal.innerHTML = `
      <div class="modal-overlay active" id="modalBackdrop">
        <div class="modal-container" style="max-width: 620px;">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="user-plus"></i> Nhận phòng nhanh tại quầy (P.${escapeHtml(roomNumber)})</div>
            <button class="modal-close-btn" onclick="window.receptionApp.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.receptionApp.submitDirectCheckIn(event, '${roomNumber}')">
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
                  <select class="form-select" name="stayType" id="directStayType" onchange="window.receptionApp.onStayTypeChange('${rClass.code}')">
                    <option value="overnight" selected>Theo đêm (Overnight)</option>
                    <option value="hourly">Thuê theo giờ (Hourly Block)</option>
                  </select>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group" id="hourlyBlockGroup" style="display: none;">
                  <label class="form-label required">Số giờ thuê (Block đầu 2 giờ)</label>
                  <select class="form-select" name="hourlyHours" id="directHourlyHours" onchange="window.receptionApp.onHourlyHoursChange('${rClass.code}')">
                    <option value="2" selected>2 giờ (35% giá phòng)</option>
                    <option value="3">3 giờ (+10%/giờ)</option>
                    <option value="4">4 giờ (+10%/giờ)</option>
                    <option value="5">5 giờ (+10%/giờ)</option>
                    <option value="6">6 giờ (+10%/giờ)</option>
                  </select>
                </div>
                <div class="form-group" id="overnightDateGroup" style="width: 100%;">
                  <label class="form-label required">Ngày trả phòng</label>
                  <input type="date" class="form-control" name="checkOutDate" id="directCheckOutDate" value="${defaultCheckOutDate}" min="${defaultCheckOutDate}" required 
                         onchange="window.receptionApp.onDirectDatesChange('${rClass.code}')" />
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
                    <input type="number" class="form-control" name="roomPrepayment" id="directRoomPrepay" value="${initialPrice}" min="0" step="50000" required oninput="window.receptionApp.updateDirectTotal()" />
                    <div style="display: flex; gap: 6px; margin-top: 4px;">
                      <button type="button" class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 2px 6px;" onclick="window.receptionApp.setPrepaymentPercent(100)">Thu đủ 100%</button>
                      <button type="button" class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 2px 6px;" onclick="window.receptionApp.setPrepaymentPercent(50)">Cọc 50%</button>
                      <button type="button" class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 2px 6px;" onclick="window.receptionApp.setPrepaymentPercent(0)">0đ (Trả sau)</button>
                    </div>
                  </div>

                  <div class="form-group" style="margin-bottom: 8px;">
                    <label class="form-label required">Tiền cọc đảm bảo (Guarantee Deposit)</label>
                    <input type="number" class="form-control" name="guaranteeDeposit" id="directGuaranteeDeposit" value="${defaultGuarantee}" min="0" step="50000" required oninput="window.receptionApp.updateDirectTotal()" />
                    <div style="display: flex; gap: 6px; margin-top: 4px;">
                      <button type="button" class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 2px 6px;" onclick="window.receptionApp.setGuaranteeDeposit(500000)">500.000đ</button>
                      <button type="button" class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 2px 6px;" onclick="window.receptionApp.setGuaranteeDeposit(1000000)">1.000.000đ</button>
                      <button type="button" class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 2px 6px;" onclick="window.receptionApp.setGuaranteeDeposit(0)">Không thu</button>
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
              <button type="button" class="btn btn-secondary" onclick="window.receptionApp.closeModal()">Hủy</button>
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
    const stayTypeEl = document.getElementById('directStayType');
    if (!prepayInput || !store) return;
    const roomNumber = window._currentDirectRoomNumber;
    const data = store.getData();
    const room = (data.rooms || []).find(r => r.number === roomNumber);
    if (!room) return;

    if (stayTypeEl && stayTypeEl.value === 'hourly') {
      const hours = parseInt(document.getElementById('directHourlyHours')?.value, 10) || 2;
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
    const stayTypeEl = document.getElementById('directStayType');
    const hourlyGroup = document.getElementById('hourlyBlockGroup');
    const overnightGroup = document.getElementById('overnightDateGroup');
    const quoteBox = document.getElementById('directPriceQuote');
    const prepayInput = document.getElementById('directRoomPrepay');
    const checkOutInput = document.getElementById('directCheckOutDate');
    if (!stayTypeEl || !store) return;

    const isHourly = (stayTypeEl.value === 'hourly');
    if (isHourly) {
      if (hourlyGroup) hourlyGroup.style.display = 'block';
      if (overnightGroup) overnightGroup.style.display = 'none';
      if (checkOutInput) checkOutInput.removeAttribute('required');

      const hours = parseInt(document.getElementById('directHourlyHours')?.value, 10) || 2;
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
    const hours = parseInt(document.getElementById('directHourlyHours')?.value, 10) || 2;
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
            <button class="modal-close-btn" onclick="window.receptionApp.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.receptionApp.submitCheckInFromBooking(event, '${booking.id}')">
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
                    <input type="number" class="form-control" name="roomPrepaymentRemaining" id="bookingPrepayRem" value="${remainingPrepay}" min="0" step="50000" oninput="window.receptionApp.updateBookingCheckInTotal()" />
                  </div>
                  <div class="form-group" style="margin-bottom: 0;">
                    <label class="form-label required">Cọc đảm bảo (Guarantee Deposit)</label>
                    <input type="number" class="form-control" name="guaranteeDeposit" id="bookingGuaranteeDeposit" value="${defaultGuarantee}" min="0" step="50000" oninput="window.receptionApp.updateBookingCheckInTotal()" />
                  </div>
                </div>

                <div class="form-group" style="margin-top: 10px; margin-bottom: 0;">
                  <label class="form-label required">Phương thức thanh toán</label>
                  <select class="form-select" name="paymentMethod" id="bookingPaymentMethod" style="width: 100%;">
                    <option value="cash">Tiền mặt tại quầy</option>
                    <option value="vietqr">Chuyển khoản VietQR</option>
                    <option value="pos_card">Thẻ POS ngân hàng</option>
                  </select>
                </div>

                <div style="background: #eff6ff; border: 1.5px solid #93c5fd; border-radius: var(--radius-sm); padding: 8px 12px; margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-size: 12.5px; font-weight: 700; color: #1e40af;">TỔNG THU CHECK-IN TẠI QUẦY:</span>
                  <span id="bookingTotalCheckInDisplay" style="font-size: 15px; font-weight: 800; color: #1d4ed8;">${fmt.currency(totalCheckInCollect)}</span>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.receptionApp.closeModal()">Hủy</button>
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
    const prepayInput = document.getElementById('bookingPrepayRem');
    const guarInput = document.getElementById('bookingGuaranteeDeposit');
    const display = document.getElementById('bookingTotalCheckInDisplay');
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
            <button class="modal-close-btn" onclick="window.receptionApp.closeModal()"><i data-lucide="x"></i></button>
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
                    <span>Theo quy trình PMS, Lễ tân có thể xác nhận nhanh tại quầy nếu khách không dùng minibar để không bị kẹt thanh toán.</span>
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
                    <input type="checkbox" id="applyLateCheckoutCheck" checked onchange="window.receptionApp.toggleLateCheckout('${stay.id}')" />
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
                      <span style="color: #475569;">Tiền phòng hiện tính trực tiếp tại phòng. Lễ tân có thể chuyển sang Master Folio để Trưởng đoàn/Công ty thanh toán chung.</span>
                    `}
                  </div>
                  ${!billedToMaster ? `
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.receptionApp.transferToMasterFolio('${stay.id}')">
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
                  <button class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 2px 8px;" onclick="window.receptionApp.openShortenStayModal('${stay.id}')">
                    <i data-lucide="clock" style="width: 12px; height: 12px;"></i> Rút ngắn lưu trú (Trả sớm)
                  </button>
                ` : ''}
                <button class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 2px 8px;" onclick="window.receptionApp.openAddSurchargeModal('${stay.id}')">
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

                <tr id="lateSurchargeRow" style="background: #fefce8; display: ${lateSurcharge && lateSurcharge.surchargeRate > 0 ? 'table-row' : 'none'};">
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
                <span id="checkoutRemainingDueDisplay">${fmt.currency(Math.abs(remainingDue))}</span>
              </div>
            </div>

            <!-- Form thu tiền khi còn nợ (Chặn hoàn tất nếu chưa thu) -->
            ${!isBalanceCleared ? `
              <div id="checkoutCollectSection" style="margin-top: 12px; background: #fffbeb; border: 1.5px solid #fde68a; border-radius: var(--radius-sm); padding: 12px 14px;">
                <div style="font-weight: 700; color: #b45309; font-size: 13px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                  <i data-lucide="alert-circle" style="width: 16px; height: 16px;"></i>
                  Yêu cầu nghiệp vụ: Thu đủ số tiền còn lại trước khi bàn giao hóa đơn và giải phóng phòng!
                </div>
                <div class="form-row">
                  <div class="form-group" style="margin-bottom: 0;">
                    <label class="form-label required">Phương thức thu tiền còn lại</label>
                    <select class="form-select" id="settlementPaymentMethod" style="width: 100%;">
                      <option value="cash">Tiền mặt tại quầy</option>
                      <option value="bank_transfer">Chuyển khoản VietQR</option>
                      <option value="credit_card">Quẹt thẻ POS ngân hàng</option>
                    </select>
                  </div>
                  <div class="form-group" style="margin-bottom: 0;">
                    <label class="form-label required">Số tiền thu quyết toán</label>
                    <input type="text" class="form-control" id="checkoutCollectAmountInput" value="${fmt.currency(remainingDue)}" disabled style="font-weight: 800; color: var(--danger); background: #f1f5f9;" />
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
            <button type="button" class="btn btn-secondary" onclick="window.receptionApp.printInvoice('${stay.id}')">
              <i data-lucide="printer"></i> In Phiếu thanh toán
            </button>
            <button type="button" class="btn btn-secondary" onclick="window.receptionApp.closeModal()">Đóng</button>
            <button type="button" class="btn btn-danger" onclick="window.receptionApp.confirmCheckout('${stay.id}')">
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
    const row = document.getElementById('lateSurchargeRow');
    const late = window._currentLateSurcharge || { amount: 0 };
    if (!applyCheck || !row) return;

    row.style.display = applyCheck.checked ? 'table-row' : 'none';
    const folio = store.calculateStayFolio(stayId);
    let baseDue = folio.billedToMaster ? folio.incidentalFolio.balanceDue : folio.remainingDue;
    if (applyCheck.checked) {
      baseDue += late.amount;
    }
    const display = document.getElementById('checkoutRemainingDueDisplay');
    const input = document.getElementById('checkoutCollectAmountInput');
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
            <button class="modal-close-btn" onclick="window.receptionApp.openCheckoutModal('${stay.roomNumber}')"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.receptionApp.submitShortenStay(event, '${stay.id}')">
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
              <button type="button" class="btn btn-secondary" onclick="window.receptionApp.openCheckoutModal('${stay.roomNumber}')">Hủy</button>
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

  function confirmCheckout(stayId) {
    const paymentMethodEl = document.getElementById('settlementPaymentMethod');
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
            <button class="modal-close-btn" onclick="window.receptionApp.openCheckoutModal('${stay.roomNumber}')"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.receptionApp.submitAddSurcharge(event, '${stayId}')">
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
                <input type="number" class="form-control" name="surchargeAmount" id="surchargeAmountInput" required min="10000" step="10000" placeholder="100000" />
                <div style="display: flex; gap: 6px; margin-top: 6px;">
                  <button type="button" class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 2px 8px;" onclick="document.getElementById('surchargeAmountInput').value = 100000;">100.000đ</button>
                  <button type="button" class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 2px 8px;" onclick="document.getElementById('surchargeAmountInput').value = 200000;">200.000đ</button>
                  <button type="button" class="btn btn-secondary btn-sm" style="font-size: 11px; padding: 2px 8px;" onclick="document.getElementById('surchargeAmountInput').value = 500000;">500.000đ</button>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.receptionApp.openCheckoutModal('${stay.roomNumber}')">Quay lại</button>
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
            Mô phỏng đồ án học phần Phân tích Thiết kế Hệ thống Quản lý Khách sạn
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
                <td style="padding: 6px; border-bottom: 1px dashed #ccc;">${sv.isMinibar ? '[Minibar] ' : ''}${escapeHtml(sv.name)} ${sv.paymentStatus === 'paid' ? '(Đã trả ngay)' : ''}</td>
                <td style="padding: 6px; text-align: center; border-bottom: 1px dashed #ccc;">${sv.quantity}</td>
                <td style="padding: 6px; text-align: right; border-bottom: 1px dashed #ccc;">${fmt.currency(sv.unitPrice)}</td>
                <td style="padding: 6px; text-align: right; font-weight: bold; border-bottom: 1px dashed #ccc;">${fmt.currency(sv.amount)}</td>
              </tr>
            `).join('')}
            ${(stay.surcharges || []).map((sc, idx) => `
              <tr>
                <td style="padding: 6px; border-bottom: 1px dashed #ccc;">${(stay.servicesUsed || []).length + idx + 2}</td>
                <td style="padding: 6px; border-bottom: 1px dashed #ccc;">Phụ thu: ${escapeHtml(sc.name || sc.description)}</td>
                <td style="padding: 6px; text-align: center; border-bottom: 1px dashed #ccc;">1</td>
                <td style="padding: 6px; text-align: right; border-bottom: 1px dashed #ccc;">${fmt.currency(sc.amount)}</td>
                <td style="padding: 6px; text-align: right; font-weight: bold; border-bottom: 1px dashed #ccc;">${fmt.currency(sc.amount)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="float: right; width: 340px; font-size: 13px; line-height: 1.8;">
          <div style="display: flex; justify-content: space-between;">
            <span>Tổng tiền dịch vụ & phòng:</span>
            <b>${fmt.currency(folio.totalAmount)}</b>
          </div>
          <div style="display: flex; justify-content: space-between; color: green;">
            <span>Tiền phòng đã thu trước / Tiền cọc:</span>
            <b>-${fmt.currency(folio.netPaid)}</b>
          </div>
          ${folio.guaranteeDeposit > 0 ? `
            <div style="display: flex; justify-content: space-between; color: #0284c7;">
              <span>Cọc đảm bảo đã thu:</span>
              <b>${fmt.currency(folio.guaranteeDeposit)}</b>
            </div>
          ` : ''}
          ${folio.guaranteeDepositRefund > 0 ? `
            <div style="display: flex; justify-content: space-between; color: green;">
              <span>Hoàn cọc đảm bảo lại khách:</span>
              <b>${fmt.currency(folio.guaranteeDepositRefund)}</b>
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
            <b>Nhân viên Lễ tân</b><br>
            <span style="font-size: 11px;">(Ký xác nhận)</span>
            <div style="height: 60px;"></div>
            <div>${escapeHtml(state.currentUser.fullName)}</div>
          </div>
        </div>
      </div>
    `;

    window.print();
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
        <button class="modal-close-btn" onclick="window.receptionApp.closeRoomDrawer()"><i data-lucide="x"></i></button>
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
          <button class="btn btn-secondary btn-sm" onclick="window.receptionApp.openAddServiceModal('${room.number}')">Thêm dịch vụ</button>
          <button class="btn btn-secondary btn-sm" onclick="window.receptionApp.openTransferRoomModal('${stay.id}')">Đổi phòng</button>
          <button class="btn btn-secondary btn-sm" onclick="window.receptionApp.openExtendStayModal('${stay.id}')">Gia hạn</button>
          <button class="btn btn-danger btn-sm" onclick="window.receptionApp.openCheckoutModal('${room.number}')">Trả phòng & Thu tiền</button>
        ` : `
          ${room.cleanStatus === 'clean' && room.exploitationStatus === 'active' ? `
            <button class="btn btn-primary" style="width: 100%;" onclick="window.receptionApp.openDirectCheckInModal('${room.number}')">Nhận phòng ngay</button>
          ` : '<button class="btn btn-secondary disabled" style="width: 100%;" disabled>Chờ buồng phòng xử lý</button>'}
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

  function openAddServiceModal(roomNumber) {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const services = data.services || [];
    const modal = document.getElementById('appModal');
    modal.innerHTML = `
      <div class="modal-overlay active" id="modalBackdrop">
        <div class="modal-container" style="max-width: 500px;">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="coffee"></i> Thêm dịch vụ cho P.${escapeHtml(roomNumber)}</div>
            <button class="modal-close-btn" onclick="window.receptionApp.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.receptionApp.submitAddService(event, '${roomNumber}')">
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label required">Chọn dịch vụ</label>
                <select class="form-select" name="serviceId" id="addServiceIdSelect" style="width: 100%;" required onchange="window.receptionApp.updateServiceAmountPreview()">
                  ${services.map(s => `<option value="${s.id}" data-price="${s.price}">${s.name} - ${fmt.currency(s.price)} / ${s.unit}</option>`).join('')}
                </select>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Số lượng</label>
                  <input type="number" class="form-control" name="quantity" id="addServiceQtyInput" value="1" min="1" max="50" required oninput="window.receptionApp.updateServiceAmountPreview()" />
                </div>
                <div class="form-group">
                  <label class="form-label">Thành tiền tạm tính</label>
                  <input type="text" class="form-control" id="addServiceAmountPreview" value="${fmt.currency(services[0] ? services[0].price : 0)}" disabled style="font-weight: 700; color: var(--primary); background: #f8fafc;" />
                </div>
              </div>

              <!-- Payment option -->
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: var(--radius-sm); padding: 10px 12px; margin-bottom: 12px;">
                <label class="form-label required" style="font-weight: 700; margin-bottom: 6px;">Hình thức thanh toán dịch vụ:</label>
                <div style="display: flex; gap: 16px; margin-bottom: 8px;">
                  <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px;">
                    <input type="radio" name="paymentOption" value="room_charge" checked onchange="window.receptionApp.toggleServicePaymentMethod(false)" />
                    Ghi nợ vào Folio (Trả khi Check-out)
                  </label>
                  <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px;">
                    <input type="radio" name="paymentOption" value="immediate" onchange="window.receptionApp.toggleServicePaymentMethod(true)" />
                    Thanh toán ngay tại chỗ
                  </label>
                </div>

                <div id="servicePaymentMethodWrap" style="display: none; margin-top: 8px; border-top: 1px dashed #cbd5e1; padding-top: 8px;">
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
                <input type="text" class="form-control" name="notes" placeholder="Giao tận phòng / Phục vụ ngay..." />
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.receptionApp.closeModal()">Hủy</button>
              <button type="submit" class="btn btn-primary"><i data-lucide="check"></i> Xác nhận cung cấp dịch vụ</button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: modal });
  }

  function toggleServicePaymentMethod(show) {
    const wrap = document.getElementById('servicePaymentMethodWrap');
    if (wrap) wrap.style.display = show ? 'block' : 'none';
  }

  function updateServiceAmountPreview() {
    const select = document.getElementById('addServiceIdSelect');
    const qtyInput = document.getElementById('addServiceQtyInput');
    const preview = document.getElementById('addServiceAmountPreview');
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


  function openTransferRoomModal(stayId) {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const stay = (data.stays || []).find(s => s.id === stayId && s.status === 'in_house');
    if (!stay) return;

    // Lọc các phòng trống, sạch và đang hoạt động (trừ phòng hiện tại)
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
            <button class="modal-close-btn" onclick="window.receptionApp.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.receptionApp.submitTransferRoom(event, '${stayId}')">
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
                <input type="text" class="form-control" name="reason" required placeholder="Khách yêu cầu tầng cao / Điều hòa ồn..." />
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.receptionApp.closeModal()">Hủy</button>
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
            <button class="modal-close-btn" onclick="window.receptionApp.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.receptionApp.submitExtendStay(event, '${stayId}')">
            <div class="modal-body">
              <div style="background: #e0f2fe; padding: 10px 14px; border-radius: var(--radius-sm); margin-bottom: 12px; font-size: 12.5px;">
                Khách: <b>${escapeHtml(stay.guest.name)}</b> &bull; Ngày trả hiện tại: <b>${fmt.date(currentCheckOut)}</b>
              </div>
              <div class="form-group">
                <label class="form-label required">Ngày trả phòng mới</label>
                <input type="date" class="form-control" name="newCheckOutDate" value="${minDate}" min="${minDate}" required />
              </div>
              <div style="font-size: 12px; color: var(--text-secondary);">
                Hệ thống sẽ kiểm tra tự động quỹ phòng của hạng <b>${escapeHtml(stay.roomClassCode)}</b> trong khoảng gia hạn để đảm bảo không xung đột đơn đặt khác.
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.receptionApp.closeModal()">Hủy</button>
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
            <div class="modal-title"><i data-lucide="calendar-plus"></i> Tạo đơn đặt phòng mới (Lễ tân)</div>
            <button class="modal-close-btn" onclick="window.receptionApp.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.receptionApp.submitCreateBooking(event)">
            <div class="modal-body">
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Ngày nhận phòng</label>
                  <input type="date" class="form-control" name="checkInDate" id="bkCheckInDate" value="${checkInDefault}" min="${wDate}" required 
                         onchange="window.receptionApp.onBookingFormChange()" />
                </div>
                <div class="form-group">
                  <label class="form-label required">Ngày trả phòng</label>
                  <input type="date" class="form-control" name="checkOutDate" id="bkCheckOutDate" value="${checkOutDefault}" min="${checkInDefault}" required 
                         onchange="window.receptionApp.onBookingFormChange()" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Hạng phòng</label>
                  <select class="form-select" name="roomClassCode" id="bkRoomClassCode" style="width: 100%;" required 
                          onchange="window.receptionApp.onBookingFormChange()">
                    ${roomClasses.map(rc => `<option value="${rc.code}">${rc.name} (${fmt.currency(rc.basePrice)}/đêm)</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label required">Số lượng phòng</label>
                  <input type="number" class="form-control" name="roomQuantity" id="bkRoomQuantity" value="1" min="1" max="10" required 
                         onchange="window.receptionApp.onBookingFormChange()" />
                </div>
              </div>

              <div id="bookingQuoteBox" style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: var(--radius-sm); padding: 10px 14px; margin-bottom: 12px; font-size: 12.5px;">
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
                  <label class="form-label">Tiền cọc ghi nhận tại quầy (VNĐ)</label>
                  <input type="number" class="form-control" name="depositAmount" id="bkDepositAmount" value="0" min="0" step="50000" />
                  <span style="font-size: 11px; color: var(--text-secondary);">Để 0 nếu chưa thu cọc</span>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Ghi chú yêu cầu của khách</label>
                <input type="text" class="form-control" name="notes" placeholder="Tầng cao, không hút thuốc, đón sân bay..." />
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.receptionApp.closeModal()">Hủy</button>
              <button type="submit" class="btn btn-primary" id="btnSubmitBooking">Xác nhận tạo đơn</button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: modal });
    onBookingFormChange();
  }

  function onBookingFormChange() {
    const inInput = document.getElementById('bkCheckInDate');
    const outInput = document.getElementById('bkCheckOutDate');
    const classSelect = document.getElementById('bkRoomClassCode');
    const qtyInput = document.getElementById('bkRoomQuantity');
    const quoteBox = document.getElementById('bookingQuoteBox');
    const btnSubmit = document.getElementById('btnSubmitBooking');

    if (!inInput || !outInput || !classSelect || !qtyInput || !quoteBox || !store) return;

    const checkIn = inInput.value;
    const checkOut = outInput.value;
    const classCode = classSelect.value;
    const qty = parseInt(qtyInput.value, 10) || 1;

    try {
      const nights = store.calculateNights(checkIn, checkOut);
      if (nights < 1) {
        quoteBox.innerHTML = '<span style="color: var(--danger); font-weight: 700;">Lỗi: Ngày trả phòng phải sau ngày nhận ít nhất 1 đêm!</span>';
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

  function closeModal() {
    const modal = document.getElementById('appModal');
    if (modal) modal.innerHTML = '';
  }

  function renderCurrentScreen() {
    updateTopbarDate();

    switch (state.currentScreen) {
      case 'rec_room_rack': renderRecRoomRack(); break;
      case 'rec_timeline': renderRecTimeline(); break;
      case 'rec_arrivals': renderRecArrivals(); break;
      case 'rec_departures': renderRecDepartures(); break;
      case 'rec_bookings': renderRecBookings(); break;
      case 'rec_stays': renderRecStays(); break;
      case 'rec_services': renderRecServices(); break;
      default: renderRecRoomRack(); break;
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

  function switchScreen(screenKey) {
    state.currentScreen = screenKey;
    renderCurrentScreen();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateRoomFilter(key, value) {
    state.filters.roomRack[key] = value;
    renderRecRoomRack();
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

  // Khởi động và đăng ký lắng nghe thay đổi thời gian thực
  document.addEventListener('DOMContentLoaded', () => {
    if (store && typeof store.subscribe === 'function') {
      store.subscribe((latestData, meta) => {
        // Tự động re-render khi có tab khác hoặc thao tác ghi dữ liệu thành công
        renderCurrentScreen();
      });
    }

    renderCurrentScreen();
  });

  
  // =========================================================================
  // LỊCH PHÒNG TỔNG THỂ (ROOM TIMELINE / TAPE CHART)
  // =========================================================================

  function shiftTimeline(deltaDays) {
    const wDate = store ? store.getWorkingDate() : '2026-10-25';
    const currentStart = state.timelineStart || store.addDays(wDate, -2);
    state.timelineStart = store.addDays(currentStart, deltaDays);
    renderRecTimeline();
  }

  function setTimelineFilter(key, value) {
    state.timelineFilters[key] = value;
    renderRecTimeline();
  }

  function renderRecTimeline() {
    const wDate = store ? store.getWorkingDate() : '2026-10-25';
    if (!state.timelineStart) {
      state.timelineStart = store.addDays(wDate, -2);
    }

    const tData = store.getTimelineData(state.timelineStart, state.timelineDays, state.timelineFilters);
    const dates = tData.dates;
    const rooms = tData.rooms;
    const unassigned = tData.unassignedBookings;
    const roomClasses = (store.getData().roomClasses || []);

    let html = `
      <div class="page-header" style="margin-bottom: 12px;">
        <div class="page-title-box">
          <h1 class="page-title"><i data-lucide="calendar-range" style="color: #0284c7;"></i> Lịch phòng ma trận (Tape Chart Timeline)</h1>
          <div class="page-breadcrumb">Theo dõi toàn bộ 42 phòng, đặt trước, khách đang ở và phòng bảo trì theo trục thời gian</div>
        </div>
        <div class="page-actions" style="display: flex; gap: 8px;">
          <button class="btn btn-primary btn-sm" onclick="window.receptionApp.openCreateGroupBookingModal()">
            <i data-lucide="users"></i> Đặt phòng Đoàn mới
          </button>
          <button class="btn btn-secondary btn-sm" onclick="window.receptionApp.openCreateBookingModal()">
            <i data-lucide="calendar-plus"></i> Đặt phòng Lẻ
          </button>
        </div>
      </div>

      <!-- Thanh công cụ điều hướng ngày & bộ lọc -->
      <div class="tape-chart-controls">
        <div class="tape-chart-nav">
          <button class="btn btn-secondary btn-xs" onclick="window.receptionApp.shiftTimeline(-7)">
            <i data-lucide="chevron-left"></i> 7 ngày trước
          </button>
          <button class="btn btn-secondary btn-xs" onclick="window.receptionApp.shiftTimeline(-1)">
            <i data-lucide="chevron-left"></i> 1 ngày
          </button>
          <button class="btn btn-primary btn-xs" onclick="state.timelineStart = null; window.receptionApp.renderRecTimeline();">
            Hôm nay (${store.formatDate(wDate)})
          </button>
          <button class="btn btn-secondary btn-xs" onclick="window.receptionApp.shiftTimeline(1)">
            1 ngày <i data-lucide="chevron-right"></i>
          </button>
          <button class="btn btn-secondary btn-xs" onclick="window.receptionApp.shiftTimeline(7)">
            7 ngày sau <i data-lucide="chevron-right"></i>
          </button>
        </div>

        <div style="display: flex; gap: 8px; align-items: center;">
          <select class="form-select" style="font-size: 12px; padding: 3px 8px; height: 30px;" onchange="window.receptionApp.setTimelineFilter('floor', this.value)">
            <option value="all">Tất cả các tầng</option>
            ${[4,5,6,7,8,9,10,11,12,14,15].map(fl => `<option value="${fl}" ${String(state.timelineFilters.floor) === String(fl) ? 'selected' : ''}>Tầng ${fl}</option>`).join('')}
          </select>

          <select class="form-select" style="font-size: 12px; padding: 3px 8px; height: 30px;" onchange="window.receptionApp.setTimelineFilter('classCode', this.value)">
            <option value="all">Tất cả hạng phòng</option>
            ${roomClasses.map(rc => `<option value="${rc.code}" ${state.timelineFilters.classCode === rc.code ? 'selected' : ''}>${rc.name} (${rc.code})</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- Khu vực Đơn chưa xếp phòng (Holding Area) nếu có -->
      ${unassigned.length > 0 ? `
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: var(--radius-sm); padding: 10px 14px; margin-top: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-weight: 700; color: #b45309; font-size: 13px;">
              <i data-lucide="alert-circle" style="width: 14px; height: 14px; vertical-align: middle;"></i>
              Có ${unassigned.length} đơn đặt phòng chưa gán số phòng vật lý:
            </span>
          </div>
          <div style="display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px;">
            ${unassigned.map(b => `
              <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px 10px; font-size: 11.5px; white-space: nowrap;">
                <b>${escapeHtml(b.id)}</b> &bull; ${escapeHtml(b.guest.name)} (${b.roomQuantity} phòng ${b.roomClassCode})<br>
                <span style="color: var(--text-secondary);">${store.formatDate(b.checkInDate)} &rarr; ${store.formatDate(b.checkOutDate)}</span>
                <button class="btn btn-primary btn-xs" style="margin-left: 6px; padding: 1px 6px;" onclick="window.receptionApp.openBulkAssignRoomsModal('${b.id}')">Gán phòng</button>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Bảng Tape Chart Ma Trận -->
      <div class="tape-chart-wrapper">
        <div class="tape-scroll-container">
          <table class="tape-chart-table">
            <thead>
              <tr>
                <th class="tape-col-room" style="background: #f8fafc;">Số phòng</th>
                ${dates.map(d => {
                  const isToday = d === wDate;
                  const parts = d.split('-');
                  const dayName = new Date(d).toLocaleDateString('vi-VN', { weekday: 'short' });
                  return `
                    <th class="tape-header-cell ${isToday ? 'is-today' : ''}">
                      <div>${dayName}</div>
                      <div style="font-size: 12px; font-weight: 800;">${parts[2]}/${parts[1]}</div>
                    </th>
                  `;
                }).join('')}
              </tr>
            </thead>
            <tbody>
              ${rooms.map(room => {
                const totalDays = dates.length;
                return `
                  <tr>
                    <td class="tape-col-room">
                      <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 13px; font-weight: 800; color: #1e293b;">P.${room.number}</span>
                        <span style="font-size: 10px; color: var(--text-secondary);">${room.classCode}</span>
                      </div>
                    </td>
                    ${dates.map((d, colIdx) => `
                      <td class="tape-cell ${d === wDate ? 'is-today' : ''}" 
                          title="Phòng ${room.number} - Ngày ${store.formatDate(d)}"
                          onclick="window.receptionApp.onTimelineCellClick('${room.number}', '${d}')">
                      </td>
                    `).join('')}

                    <!-- Render các thanh sự kiện (Events Overlay) -->
                    ${room.events.map(ev => {
                      const dStart = ev.startDate;
                      const dEnd = ev.endDate;
                      const startIdx = dates.indexOf(dStart);
                      const endIdx = dates.indexOf(dEnd);

                      let visibleStart = startIdx >= 0 ? startIdx : (dStart < dates[0] ? 0 : -1);
                      let visibleEnd = endIdx >= 0 ? endIdx : (dEnd > dates[dates.length - 1] ? totalDays : -1);

                      if (visibleStart === -1 && visibleEnd === -1) return '';
                      if (visibleStart < 0) visibleStart = 0;
                      if (visibleEnd < 0) visibleEnd = totalDays;
                      if (visibleEnd <= visibleStart) visibleEnd = visibleStart + 1;

                      const leftPct = ((visibleStart) / totalDays) * 100;
                      const widthPct = ((visibleEnd - visibleStart) / totalDays) * 100;

                      let barClass = 'tape-bar-stay';
                      if (ev.isOverstay) barClass = 'tape-bar-stay is-overstay';
                      else if (ev.type === 'booking') barClass = 'tape-bar-booking';
                      else if (ev.type === 'maintenance') barClass = 'tape-bar-maintenance';

                      return `
                        <div class="tape-bar ${barClass}" 
                             style="left: calc(125px + (100% - 125px) * ${leftPct / 100} + 2px); width: calc((100% - 125px) * ${widthPct / 100} - 4px);"
                             title="${escapeHtml(ev.title)} (${store.formatDate(dStart)} - ${store.formatDate(dEnd)})"
                             onclick="event.stopPropagation(); window.receptionApp.onTimelineEventClick('${ev.type}', '${ev.id}')">
                          <span>${escapeHtml(ev.title)}</span>
                        </div>
                      `;
                    }).join('')}
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <!-- Chú thích Tape Chart -->
        <div class="tape-legend">
          <span style="font-weight: 700; color: #1e293b;">Chú thích màu:</span>
          <div class="tape-legend-item">
            <span class="tape-legend-color" style="background: #0284c7;"></span>
            <span>Khách đang ở (In-house)</span>
          </div>
          <div class="tape-legend-item">
            <span class="tape-legend-color" style="background: #d97706;"></span>
            <span>Đơn đặt phòng (Booking)</span>
          </div>
          <div class="tape-legend-item">
            <span class="tape-legend-color" style="background: #dc2626;"></span>
            <span>Khách quá hạn (Overstay)</span>
          </div>
          <div class="tape-legend-item">
            <span class="tape-legend-color" style="background: #64748b;"></span>
            <span>Khóa bảo trì kỹ thuật</span>
          </div>
        </div>
      </div>
    `;

    document.getElementById('mainContent').innerHTML = html;
    if (window.lucide) lucide.createIcons();
  }

  function onTimelineCellClick(roomNumber, dateStr) {
    const wDate = store ? store.getWorkingDate() : '2026-10-25';
    openDirectCheckInModal(roomNumber);
  }

  function onTimelineEventClick(type, id) {
    if (type === 'stay') {
      openRoomDrawer(id);
    } else if (type === 'booking') {
      openCheckInForBooking(id);
    } else if (type === 'maintenance') {
      showToast('Phòng đang được khóa bảo trì kỹ thuật.', 'info');
    }
  }

  // =========================================================================
  // ĐẶT PHÒNG KHÁCH ĐOÀN (GROUP BOOKINGS & BULK ACTIONS) - GIAO DIỆN LỄ TÂN
  // =========================================================================

  function openCreateGroupBookingModal() {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const roomClasses = data.roomClasses || [];
    const wDate = store ? store.getWorkingDate() : '2026-10-25';
    const checkOutDefault = store.addDays(wDate, 2);

    window.currentGroupAllocRowCounter = 1;

    let modalHtml = `
      <div class="modal-overlay active" onclick="window.receptionApp.closeModal(event)">
        <div class="modal-container" style="max-width: 820px;" onclick="event.stopPropagation()">
          <div class="modal-header">
            <h3 class="modal-title">
              <i data-lucide="users" style="color: #0284c7;"></i> Đặt phòng Khách đoàn & Doanh nghiệp
            </h3>
            <button class="modal-close-btn" onclick="window.receptionApp.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <div class="modal-body">
            <form id="groupBookingForm" onsubmit="window.receptionApp.submitCreateGroupBooking(event)">

              <!-- PHẦN 1: THÔNG TIN ĐOÀN KHÁCH & NGƯỜI ĐẠI DIỆN -->
              <div style="font-weight: 700; color: #0f4c81; font-size: 13px; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
                <i data-lucide="building" style="width: 15px; height: 15px;"></i> 1. THÔNG TIN ĐOÀN KHÁCH & LIÊN HỆ
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Tên đoàn khách / Công ty</label>
                  <input type="text" class="form-control" id="grpName" placeholder="VD: Đoàn Hội thảo Dược Codupha" required />
                </div>
                <div class="form-group">
                  <label class="form-label required">Người đại diện liên hệ (Trưởng đoàn)</label>
                  <input type="text" class="form-control" id="grpContact" placeholder="Họ và tên trưởng đoàn" required />
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label class="form-label required">Số điện thoại liên hệ</label>
                  <input type="tel" class="form-control" id="grpPhone" placeholder="0912..." required />
                </div>
                <div class="form-group">
                  <label class="form-label">Email liên hệ nhận xác nhận</label>
                  <input type="email" class="form-control" id="grpEmail" placeholder="contact@company.com" />
                </div>
              </div>

              <!-- PHẦN 2: CHỈ ĐỊNH HẠNG PHÒNG, SỐ LƯỢNG & THỜI GIAN -->
              <div style="margin: 16px 0 10px; font-weight: 700; color: #0f4c81; font-size: 13px; display: flex; justify-content: space-between; align-items: center;">
                <span style="display: flex; align-items: center; gap: 6px;">
                  <i data-lucide="calendar" style="width: 15px; height: 15px;"></i> 2. CHỈ ĐỊNH HẠNG PHÒNG & THỜI GIAN LƯU TRÚ
                </span>
                <button type="button" class="btn btn-secondary btn-xs" onclick="window.receptionApp.addGroupAllocRow()">
                  <i data-lucide="plus"></i> Thêm dòng hạng phòng
                </button>
              </div>

              <div id="groupAllocRows" style="display: flex; flex-direction: column; gap: 8px;">
                <div class="group-alloc-row group-alloc-row-box" data-row-idx="0">
                  <div>
                    <label class="form-label" style="font-size: 11px;">Hạng phòng</label>
                    <select class="form-select alloc-class" onchange="window.receptionApp.updateGroupBookingEstimate()" required>
                      ${roomClasses.map(rc => `<option value="${rc.code}">${rc.name} (${rc.code}) - ${fmt.currency(rc.basePrice || 1200000)}/đêm</option>`).join('')}
                    </select>
                  </div>
                  <div>
                    <label class="form-label" style="font-size: 11px;">Số lượng phòng</label>
                    <input type="number" class="form-control alloc-qty" min="1" max="50" value="2" oninput="window.receptionApp.updateGroupBookingEstimate()" required />
                  </div>
                  <div>
                    <label class="form-label" style="font-size: 11px;">Ngày nhận phòng</label>
                    <input type="date" class="form-control alloc-in" value="${wDate}" onchange="window.receptionApp.updateGroupBookingEstimate()" required />
                  </div>
                  <div>
                    <label class="form-label" style="font-size: 11px;">Ngày trả phòng</label>
                    <input type="date" class="form-control alloc-out" value="${checkOutDefault}" onchange="window.receptionApp.updateGroupBookingEstimate()" required />
                  </div>
                  <div>
                    <label class="form-label" style="font-size: 11px;">Tạm tính dòng</label>
                    <div class="alloc-line-estimate font-amount" style="font-weight: 700; color: #0284c7; padding-top: 8px; font-size: 12.5px;">0 VNĐ</div>
                  </div>
                  <div style="padding-top: 22px;">
                    <button type="button" class="btn btn-secondary btn-xs" onclick="window.receptionApp.removeGroupAllocRow(this)" title="Xóa dòng" style="color: var(--danger);">&times;</button>
                  </div>
                </div>
              </div>

              <!-- Banner tóm tắt thời gian thực cho đoàn -->
              <div class="group-summary-banner">
                <div class="group-summary-item">
                  <div class="group-summary-item-label">🏢 Tổng số phòng đoàn</div>
                  <div class="group-summary-item-val" id="grpTotalRoomsSummary">2 phòng</div>
                </div>
                <div class="group-summary-item">
                  <div class="group-summary-item-label">🌙 Số đêm lưu trú</div>
                  <div class="group-summary-item-val" id="grpTotalNightsSummary">2 đêm</div>
                </div>
                <div class="group-summary-item">
                  <div class="group-summary-item-label">💰 Dự kiến tổng tiền phòng</div>
                  <div class="group-summary-item-val" id="grpTotalEstimateSummary">0 VNĐ</div>
                </div>
              </div>

              <!-- PHẦN 3: ĐẶT CỌC ĐOÀN & PHƯƠNG THỨC THANH TOÁN -->
              <div style="margin: 16px 0 10px; font-weight: 700; color: #0f4c81; font-size: 13px; display: flex; align-items: center; gap: 6px;">
                <i data-lucide="shield-check" style="width: 15px; height: 15px;"></i> 3. ĐẶT CỌC ĐOÀN & THANH TOÁN
              </div>

              <div class="form-group" style="margin-bottom: 12px;">
                <label class="form-label">Chọn tỷ lệ đặt cọc nhanh hoặc nhập số tiền:</label>
                <div class="quick-amount-pills" style="margin-bottom: 8px;">
                  <button type="button" class="btn btn-secondary btn-xs btn-deposit-preset" data-pct="0" onclick="window.receptionApp.setGroupDepositPercent(0)">0% (Chưa thu cọc)</button>
                  <button type="button" class="btn btn-secondary btn-xs btn-deposit-preset" data-pct="30" onclick="window.receptionApp.setGroupDepositPercent(30)">30% tổng tiền</button>
                  <button type="button" class="btn btn-secondary btn-xs btn-deposit-preset active" data-pct="50" onclick="window.receptionApp.setGroupDepositPercent(50)">50% tổng tiền</button>
                  <button type="button" class="btn btn-secondary btn-xs btn-deposit-preset" data-pct="100" onclick="window.receptionApp.setGroupDepositPercent(100)">100% (Thu đủ)</button>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Tiền đặt cọc trước (VNĐ)</label>
                  <input type="number" class="form-control" id="grpDeposit" min="0" step="50000" value="0" oninput="window.receptionApp.updateGroupBookingDepositHint()" />
                  <div id="grpDepositHint" style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
                    Cọc sẽ được chia đều chính xác cho từng phòng theo số dư nguyên (bảo toàn đúng đến từng đồng).
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">Phương thức thanh toán cọc</label>
                  <select class="form-select" id="grpPaymentMethod">
                    <option value="cash" selected>Tiền mặt tại quầy</option>
                    <option value="vietqr">VietQR Chuyển khoản ngân hàng</option>
                    <option value="pos">Thẻ ngân hàng (POS)</option>
                  </select>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Ghi chú & Yêu cầu đặc biệt của đoàn</label>
                <textarea class="form-control" id="grpNotes" rows="2" style="height: auto; min-height: 60px;" placeholder="Yêu cầu xếp phòng cùng tầng, bố trí ăn sáng buffet, xuất hóa đơn công ty..."></textarea>
              </div>

              <div class="modal-footer" style="padding: 14px 0 0 0; margin-top: 16px; border-top: 1px solid var(--border-color);">
                <button type="button" class="btn btn-secondary" onclick="window.receptionApp.closeModal()">Hủy bỏ</button>
                <button type="submit" class="btn btn-primary" id="grpSubmitBtn">
                  <i data-lucide="check"></i> Xác nhận Tạo đơn đoàn (<span id="grpSubmitRoomsCount">2</span> phòng)
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    document.getElementById('appModal').innerHTML = modalHtml;
    if (window.lucide) lucide.createIcons();

    // Tính toán tạm tính ban đầu
    updateGroupBookingEstimate();
  }

  function addGroupAllocRow() {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const roomClasses = data.roomClasses || [];
    const wDate = store ? store.getWorkingDate() : '2026-10-25';
    const checkOutDefault = store.addDays(wDate, 2);

    window.currentGroupAllocRowCounter = (window.currentGroupAllocRowCounter || 1) + 1;
    const div = document.createElement('div');
    div.className = 'group-alloc-row group-alloc-row-box';
    div.setAttribute('data-row-idx', window.currentGroupAllocRowCounter);
    div.innerHTML = `
      <div>
        <label class="form-label" style="font-size: 11px;">Hạng phòng</label>
        <select class="form-select alloc-class" onchange="window.receptionApp.updateGroupBookingEstimate()" required>
          ${roomClasses.map(rc => `<option value="${rc.code}">${rc.name} (${rc.code}) - ${fmt.currency(rc.basePrice || 1200000)}/đêm</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="form-label" style="font-size: 11px;">Số lượng phòng</label>
        <input type="number" class="form-control alloc-qty" min="1" max="50" value="1" oninput="window.receptionApp.updateGroupBookingEstimate()" required />
      </div>
      <div>
        <label class="form-label" style="font-size: 11px;">Ngày nhận phòng</label>
        <input type="date" class="form-control alloc-in" value="${wDate}" onchange="window.receptionApp.updateGroupBookingEstimate()" required />
      </div>
      <div>
        <label class="form-label" style="font-size: 11px;">Ngày trả phòng</label>
        <input type="date" class="form-control alloc-out" value="${checkOutDefault}" onchange="window.receptionApp.updateGroupBookingEstimate()" required />
      </div>
      <div>
        <label class="form-label" style="font-size: 11px;">Tạm tính dòng</label>
        <div class="alloc-line-estimate font-amount" style="font-weight: 700; color: #0284c7; padding-top: 8px; font-size: 12.5px;">0 VNĐ</div>
      </div>
      <div style="padding-top: 22px;">
        <button type="button" class="btn btn-secondary btn-xs" onclick="window.receptionApp.removeGroupAllocRow(this)" title="Xóa dòng" style="color: var(--danger);">&times;</button>
      </div>
    `;
    document.getElementById('groupAllocRows').appendChild(div);
    updateGroupBookingEstimate();
  }

  function removeGroupAllocRow(btn) {
    const rows = document.querySelectorAll('#groupAllocRows .group-alloc-row');
    if (rows.length <= 1) {
      showToast('Đơn đặt phòng đoàn phải có ít nhất 1 dòng hạng phòng!', 'warning');
      return;
    }
    const row = btn.closest('.group-alloc-row');
    if (row) row.remove();
    updateGroupBookingEstimate();
  }

  function updateGroupBookingEstimate() {
    const rowEls = document.querySelectorAll('#groupAllocRows .group-alloc-row');
    let totalRooms = 0;
    let totalEstimate = 0;
    let maxNights = 1;

    rowEls.forEach(row => {
      const classCode = row.querySelector('.alloc-class').value;
      const qty = parseInt(row.querySelector('.alloc-qty').value, 10) || 1;
      const checkIn = row.querySelector('.alloc-in').value;
      const checkOut = row.querySelector('.alloc-out').value;

      const nights = store ? store.calculateNights(checkIn, checkOut) : 1;
      if (nights > maxNights) maxNights = nights;

      let pricing = null;
      if (store && typeof store.calculateNightlyPricing === 'function') {
        try {
          pricing = store.calculateNightlyPricing(classCode, checkIn, checkOut);
        } catch (e) {
          pricing = null;
        }
      }
      const unitPrice = pricing ? pricing.totalPerRoom : 1200000;
      const lineTotal = unitPrice * qty;

      const lineEstEl = row.querySelector('.alloc-line-estimate');
      if (lineEstEl) lineEstEl.textContent = fmt.currency(lineTotal);

      totalRooms += qty;
      totalEstimate += lineTotal;
    });

    window.currentGroupEstimatedTotal = totalEstimate;
    window.currentGroupTotalRooms = totalRooms;

    const roomsSumEl = document.getElementById('grpTotalRoomsSummary');
    const nightsSumEl = document.getElementById('grpTotalNightsSummary');
    const estSumEl = document.getElementById('grpTotalEstimateSummary');
    const submitRoomsEl = document.getElementById('grpSubmitRoomsCount');

    if (roomsSumEl) roomsSumEl.textContent = `${totalRooms} phòng`;
    if (nightsSumEl) nightsSumEl.textContent = `${maxNights} đêm`;
    if (estSumEl) estSumEl.textContent = fmt.currency(totalEstimate);
    if (submitRoomsEl) submitRoomsEl.textContent = totalRooms;

    // Cập nhật giá trị cọc theo preset đang chọn (nếu có)
    const activePreset = document.querySelector('.btn-deposit-preset.active');
    if (activePreset) {
      const pct = parseInt(activePreset.getAttribute('data-pct'), 10) || 0;
      const depInput = document.getElementById('grpDeposit');
      if (depInput) depInput.value = Math.round((totalEstimate * pct) / 100);
    }

    updateGroupBookingDepositHint();
  }

  function setGroupDepositPercent(pct) {
    document.querySelectorAll('.btn-deposit-preset').forEach(b => {
      if (parseInt(b.getAttribute('data-pct'), 10) === pct) {
        b.classList.add('active');
        b.style.background = '#0284c7';
        b.style.color = '#ffffff';
      } else {
        b.classList.remove('active');
        b.style.background = '';
        b.style.color = '';
      }
    });

    const total = window.currentGroupEstimatedTotal || 0;
    const deposit = Math.round((total * pct) / 100);
    const depInput = document.getElementById('grpDeposit');
    if (depInput) depInput.value = deposit;

    updateGroupBookingDepositHint();
  }

  function updateGroupBookingDepositHint() {
    const depInput = document.getElementById('grpDeposit');
    const hintEl = document.getElementById('grpDepositHint');
    if (!depInput || !hintEl) return;

    const depVal = parseInt(depInput.value, 10) || 0;
    const totalRooms = window.currentGroupTotalRooms || 1;

    if (depVal <= 0) {
      hintEl.textContent = 'Đơn chưa thu cọc trước. Sẽ ghi nhận thanh toán đầy đủ lúc khách nhận hoặc trả phòng.';
    } else {
      const perRoom = Math.floor(depVal / totalRooms);
      hintEl.textContent = `Tổng cọc ${fmt.currency(depVal)} sẽ được phân bổ ~${fmt.currency(perRoom)}/phòng cho ${totalRooms} phòng (xử lý phần lẻ chính xác).`;
    }
  }

  function submitCreateGroupBooking(e) {
    e.preventDefault();
    const groupName = document.getElementById('grpName').value.trim();
    const contactName = document.getElementById('grpContact').value.trim();
    const phone = document.getElementById('grpPhone').value.trim();
    const email = document.getElementById('grpEmail').value.trim();
    const depositAmount = parseInt(document.getElementById('grpDeposit').value, 10) || 0;
    const paymentMethod = document.getElementById('grpPaymentMethod').value;
    const notes = document.getElementById('grpNotes').value.trim();

    const rowEls = document.querySelectorAll('#groupAllocRows .group-alloc-row');
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

      showToast(`Đã tạo thành công đơn khách đoàn ${groupName} (${res.totalRooms} phòng, cọc: ${fmt.currency(depositAmount)})!`, 'success');
      closeModal();
      // Chuyển sang xem tab đoàn
      state.filters.bookings = state.filters.bookings || {};
      state.filters.bookings.tab = 'group';
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  // PHÂN PHÒNG VẬT LÝ HÀNG LOẠT (BULK ROOM ASSIGNMENT)
  function openBulkAssignRoomsModal(bookingId) {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const booking = data.bookings.find(b => b.id === bookingId);
    if (!booking) return;

    const rc = (data.roomClasses || []).find(c => c.code === booking.roomClassCode);
    const needed = booking.roomQuantity || 1;
    const currentAssigned = booking.assignedRooms || [];

    // Lọc các phòng thuộc hạng này đang mở kinh doanh
    const candidateRooms = data.rooms.filter(r => r.classCode === booking.roomClassCode && r.exploitationStatus === 'active');

    // Kiểm tra xung đột lịch theo đúng logic store.bulkAssignRooms
    const targetStart = booking.checkInDate;
    const targetEnd = booking.checkOutDate;

    const roomStatusList = candidateRooms.map(r => {
      let conflictReason = null;

      // Xung đột với các đơn đặt khác
      const conflictBooking = (data.bookings || []).find(b => {
        if (b.id === booking.id || b.bookingCode === booking.id || b.bookingStatus === 'cancelled') return false;
        const isAssigned = Array.isArray(b.assignedRooms) && b.assignedRooms.includes(r.number);
        if (!isAssigned) return false;
        return (targetStart < b.checkOutDate && b.checkInDate < targetEnd);
      });

      if (conflictBooking) {
        conflictReason = `Trùng đơn ${conflictBooking.id} (${conflictBooking.checkInDate} ➔ ${conflictBooking.checkOutDate})`;
      }

      // Xung đột với khách đang ở
      if (!conflictReason) {
        const conflictStay = (data.stays || []).find(s => {
          if (s.roomNumber !== r.number || s.status !== 'in_house') return false;
          const sIn = s.checkInDate ? s.checkInDate.split(' ')[0] : '';
          const sOut = s.expectedCheckOutDate ? s.expectedCheckOutDate.split(' ')[0] : '';
          return (targetStart < sOut && sIn < targetEnd);
        });
        if (conflictStay) {
          conflictReason = `Đang có khách ở (${conflictStay.expectedCheckOutDate.split(' ')[0]} trả)`;
        }
      }

      return {
        room: r,
        isConflict: Boolean(conflictReason),
        conflictReason: conflictReason,
        isChecked: currentAssigned.includes(r.number)
      };
    });

    let modalHtml = `
      <div class="modal-overlay active" onclick="window.receptionApp.closeModal(event)">
        <div class="modal-container" style="max-width: 660px;" onclick="event.stopPropagation()">
          <div class="modal-header">
            <h3 class="modal-title">
              <i data-lucide="grid" style="color: #0284c7;"></i> Phân / Gán phòng cho đơn: ${escapeHtml(booking.id)}
            </h3>
            <button class="modal-close-btn" onclick="window.receptionApp.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <div class="modal-body">
            <!-- Thông tin đơn đặt -->
            <div style="background: #f0f9ff; border: 1px solid #bae6fd; padding: 12px 14px; border-radius: var(--radius-md); margin-bottom: 14px; font-size: 13px;">
              <div style="font-weight: 700; color: #0369a1; margin-bottom: 4px;">
                ĐOÀN: ${escapeHtml(booking.groupName || booking.guestName || (booking.guest && booking.guest.name))}
              </div>
              <div style="color: var(--text-secondary); font-size: 12px;">
                Hạng phòng: <b>${booking.roomClassCode} - ${rc ? rc.name : ''}</b> &bull; 
                Thời gian: <b>${fmt.date(booking.checkInDate)} &rarr; ${fmt.date(booking.checkOutDate)}</b>
              </div>
              <div style="margin-top: 6px; display: flex; align-items: center; justify-content: space-between;">
                <span>Số lượng cần phân: <b>${needed}</b> phòng</span>
                <span id="bulkAssignCountBadge" class="badge ${currentAssigned.length === needed ? 'badge-clean' : 'badge-warning'}">
                  Đã chọn: <b id="bulkAssignSelectedCount">${currentAssigned.length}</b> / <b>${needed}</b> phòng
                </span>
              </div>
            </div>

            <!-- Thanh nút chọn nhanh -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <span style="font-weight: 600; font-size: 12.5px; color: var(--text-main);">Danh sách phòng thuộc hạng ${booking.roomClassCode}:</span>
              <button type="button" class="btn btn-secondary btn-xs" onclick="window.receptionApp.autoSelectAssignRooms(${needed})">
                <i data-lucide="zap"></i> Tự động chọn ${needed} phòng trống khả dụng
              </button>
            </div>

            <form onsubmit="window.receptionApp.submitBulkAssignRooms(event, '${booking.id}')">
              <!-- Lưới các phòng ứng viên -->
              <div class="room-select-grid">
                ${roomStatusList.map(item => {
                  const r = item.room;
                  return `
                    <div class="room-select-card ${item.isChecked ? 'selected' : ''} ${item.isConflict ? 'disabled' : ''}" 
                         onclick="window.receptionApp.onAssignRoomCardClick(this, event, ${needed})">
                      <div style="display: flex; align-items: center; justify-content: space-between;">
                        <span style="font-weight: 800; font-size: 14px; color: ${item.isConflict ? '#94a3b8' : '#0f4c81'};">P.${r.number}</span>
                        <input type="checkbox" name="assignRoom" value="${r.number}" 
                               ${item.isChecked ? 'checked' : ''} 
                               ${item.isConflict ? 'disabled' : ''} 
                               onchange="window.receptionApp.onAssignRoomCheckboxChange(this, ${needed})" />
                      </div>
                      <div style="font-size: 11px; color: var(--text-secondary);">Tầng ${r.floor} &bull; ${r.bedType || 'Tiêu chuẩn'}</div>
                      <div style="display: flex; align-items: center; gap: 4px; margin-top: 2px;">
                        <span class="badge ${r.cleanStatus === 'clean' ? 'badge-clean' : 'badge-dirty'}" style="font-size: 9.5px; padding: 1px 5px;">
                          ${r.cleanStatus === 'clean' ? 'Sạch' : 'Chưa dọn'}
                        </span>
                      </div>
                      ${item.isConflict ? `<div style="font-size: 10px; color: var(--danger); margin-top: 2px; line-height: 1.2;">${escapeHtml(item.conflictReason)}</div>` : ''}
                    </div>
                  `;
                }).join('')}
              </div>

              <div class="modal-footer" style="padding: 14px 0 0 0; margin-top: 16px; border-top: 1px solid var(--border-color);">
                <button type="button" class="btn btn-secondary" onclick="window.receptionApp.closeModal()">Đóng</button>
                <button type="submit" class="btn btn-primary" id="btnSaveBulkAssign">
                  <i data-lucide="check"></i> Lưu phân phòng
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

  function onAssignRoomCardClick(card, e, neededCount) {
    if (card.classList.contains('disabled')) return;
    if (e.target && e.target.tagName === 'INPUT') return;
    const cb = card.querySelector('input[name="assignRoom"]');
    if (cb && !cb.disabled) {
      cb.checked = !cb.checked;
      onAssignRoomCheckboxChange(cb, neededCount);
    }
  }

  function onAssignRoomCheckboxChange(cb, neededCount) {
    const card = cb.closest('.room-select-card');
    if (card) {
      if (cb.checked) card.classList.add('selected');
      else card.classList.remove('selected');
    }
    updateBulkAssignCounter(neededCount);
  }

  function autoSelectAssignRooms(neededCount) {
    const checkboxes = Array.from(document.querySelectorAll('input[name="assignRoom"]:not(:disabled)'));
    checkboxes.forEach(cb => {
      cb.checked = false;
      const card = cb.closest('.room-select-card');
      if (card) card.classList.remove('selected');
    });

    let selected = 0;
    for (let i = 0; i < checkboxes.length && selected < neededCount; i++) {
      checkboxes[i].checked = true;
      const card = checkboxes[i].closest('.room-select-card');
      if (card) card.classList.add('selected');
      selected++;
    }

    updateBulkAssignCounter(neededCount);
  }

  function updateBulkAssignCounter(neededCount) {
    const checked = document.querySelectorAll('input[name="assignRoom"]:checked');
    const count = checked.length;
    const countEl = document.getElementById('bulkAssignSelectedCount');
    const badgeEl = document.getElementById('bulkAssignCountBadge');

    if (countEl) countEl.textContent = count;
    if (badgeEl) {
      if (count === neededCount) {
        badgeEl.className = 'badge badge-clean';
      } else if (count > neededCount) {
        badgeEl.className = 'badge badge-danger';
      } else {
        badgeEl.className = 'badge badge-warning';
      }
    }
  }

  function submitBulkAssignRooms(e, bookingId) {
    e.preventDefault();
    const checked = Array.from(document.querySelectorAll('input[name="assignRoom"]:checked')).map(cb => cb.value);

    try {
      store.bulkAssignRooms(bookingId, checked, state.currentUser);
      showToast(`Đã gán thành công ${checked.length} phòng [${checked.join(', ')}] cho đơn ${bookingId}!`, 'success');
      closeModal();
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  // NHẬN PHÒNG HÀNG LOẠT CHO ĐOÀN (BULK CHECK-IN)
  function openBulkCheckInModal(bookingId) {
    const data = store ? store.getData() : window.HOTEL_DATA;
    const booking = data.bookings.find(b => b.id === bookingId);
    if (!booking) return;

    const assigned = booking.assignedRooms || [];
    if (assigned.length === 0) {
      showToast('Đơn này chưa được phân phòng vật lý! Vui lòng gán phòng trước.', 'warning');
      openBulkAssignRoomsModal(bookingId);
      return;
    }

    const pendingRooms = assigned.filter(rNum => !Array.isArray(booking.checkedInRooms) || !booking.checkedInRooms.includes(rNum));
    if (pendingRooms.length === 0) {
      showToast('Tất cả phòng trong đơn này đã được nhận đầy đủ!', 'info');
      return;
    }

    const masterGuestName = booking.guestName || (booking.guest && booking.guest.name) || 'Khách đoàn';
    const masterPhone = booking.phone || (booking.guest && booking.guest.phone) || '';
    const allocDeposit = booking.depositPaid || booking.depositAmount || 0;

    let modalHtml = `
      <div class="modal-overlay active" onclick="window.receptionApp.closeModal(event)">
        <div class="modal-container" style="max-width: 760px;" onclick="event.stopPropagation()">
          <div class="modal-header">
            <h3 class="modal-title">
              <i data-lucide="log-in" style="color: #0284c7;"></i> Nhận phòng hàng loạt (Bulk Check-In) &bull; ${escapeHtml(booking.id)}
            </h3>
            <button class="modal-close-btn" onclick="window.receptionApp.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <div class="modal-body">
            <!-- Thẻ tóm tắt thông tin đoàn -->
            <div style="background: #f0f9ff; border: 1px solid #bae6fd; padding: 12px 14px; border-radius: var(--radius-md); margin-bottom: 14px; font-size: 13px;">
              <div style="font-weight: 700; color: #0369a1; font-size: 14px; margin-bottom: 4px;">
                ĐOÀN: ${escapeHtml(booking.groupName || masterGuestName)}
              </div>
              <div style="color: var(--text-secondary); font-size: 12px;">
                Hạng: <b>${booking.roomClassCode}</b> &bull; 
                Tiền cọc phòng đã thu trước: <b style="color: var(--success);">${fmt.currency(allocDeposit)}</b> &bull; 
                Số phòng làm thủ tục check-in: <b>${pendingRooms.length}</b> phòng
              </div>
            </div>

            <!-- Thanh nút thao tác nhanh -->
            <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px;">
              <button type="button" class="btn btn-secondary btn-xs" onclick="window.receptionApp.applyGuestNameToAll('${escapeHtml(masterGuestName)}')">
                <i data-lucide="copy"></i> Sao chép tên trưởng đoàn cho tất cả
              </button>
              <button type="button" class="btn btn-secondary btn-xs" onclick="window.receptionApp.applyGuaranteeDepositToAll(500000)">
                <i data-lucide="dollar-sign"></i> Áp dụng cọc đảm bảo 500k/phòng
              </button>
              <button type="button" class="btn btn-secondary btn-xs" onclick="window.receptionApp.applyGuaranteeDepositToAll(0)">
                <i data-lucide="slash"></i> Miễn cọc đảm bảo (0đ)
              </button>
            </div>

            <form onsubmit="window.receptionApp.submitBulkCheckIn(event, '${booking.id}')">
              <div style="max-height: 320px; overflow-y: auto; padding-right: 4px; display: flex; flex-direction: column; gap: 8px;">
                ${pendingRooms.map(rNum => `
                  <div class="bulk-checkin-row bulk-checkin-card" data-room="${rNum}">
                    <div style="display: grid; grid-template-columns: 80px 1.5fr 1fr 1fr; gap: 10px; align-items: center;">
                      <div>
                        <span style="font-size: 15px; font-weight: 800; color: #0284c7;">P.${rNum}</span>
                        <div style="font-size: 10.5px; color: var(--text-secondary);">${booking.roomClassCode}</div>
                      </div>
                      <div>
                        <label class="form-label" style="font-size: 10.5px; margin-bottom: 3px;">Tên khách ở phòng ${rNum} *</label>
                        <input type="text" class="form-control b-guest" placeholder="Họ và tên khách" value="${escapeHtml(masterGuestName)}" required />
                      </div>
                      <div>
                        <label class="form-label" style="font-size: 10.5px; margin-bottom: 3px;">CCCD / Hộ chiếu</label>
                        <input type="text" class="form-control b-idcard" placeholder="Số giấy tờ..." />
                      </div>
                      <div>
                        <label class="form-label" style="font-size: 10.5px; margin-bottom: 3px;">Tiền đảm bảo (VNĐ)</label>
                        <input type="number" class="form-control b-deposit" placeholder="Cọc đảm bảo" value="500000" min="0" step="50000" oninput="window.receptionApp.updateBulkCheckInTotal()" />
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>

              <!-- Tổng tiền đảm bảo cần thu -->
              <div style="margin-top: 14px; padding: 10px 14px; background: #f8fafc; border: 1px solid var(--border-color); border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 13px; font-weight: 600; color: var(--text-secondary);">Tổng tiền đảm bảo thu tại quầy:</span>
                <span style="font-size: 16px; font-weight: 800; color: #0284c7;" id="bulkTotalGuaranteeText">0 VNĐ</span>
              </div>

              <div class="modal-footer" style="padding: 14px 0 0 0; margin-top: 14px; border-top: 1px solid var(--border-color);">
                <button type="button" class="btn btn-secondary" onclick="window.receptionApp.closeModal()">Đóng</button>
                <button type="submit" class="btn btn-primary">
                  <i data-lucide="check"></i> Xác nhận Nhận tất cả phòng
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    document.getElementById('appModal').innerHTML = modalHtml;
    if (window.lucide) lucide.createIcons();
    updateBulkCheckInTotal();
  }

  function applyGuestNameToAll(name) {
    document.querySelectorAll('.bulk-checkin-row .b-guest').forEach(input => {
      input.value = name;
    });
  }

  function applyGuaranteeDepositToAll(amount) {
    document.querySelectorAll('.bulk-checkin-row .b-deposit').forEach(input => {
      input.value = amount;
    });
    updateBulkCheckInTotal();
  }

  function updateBulkCheckInTotal() {
    let total = 0;
    document.querySelectorAll('.bulk-checkin-row .b-deposit').forEach(input => {
      total += (parseInt(input.value, 10) || 0);
    });
    const el = document.getElementById('bulkTotalGuaranteeText');
    if (el) el.textContent = fmt.currency(total);
  }

  function submitBulkCheckIn(e, bookingId) {
    e.preventDefault();
    const rows = document.querySelectorAll('.bulk-checkin-row');
    const items = [];
    rows.forEach(r => {
      items.push({
        roomNumber: r.getAttribute('data-room'),
        guestName: r.querySelector('.b-guest').value.trim(),
        identityCard: r.querySelector('.b-idcard').value.trim(),
        guaranteeDeposit: parseInt(r.querySelector('.b-deposit').value, 10) || 0,
        paymentMethod: 'cash'
      });
    });

    try {
      const res = store.bulkCheckInGroup(bookingId, items, state.currentUser);
      showToast(`Đã nhận thành công ${res.successCount} phòng, thất bại ${res.failCount} phòng!`, res.failCount > 0 ? 'warning' : 'success');
      closeModal();
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }


  window.receptionApp = {
    state,
    switchScreen,
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
    confirmCheckout,
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
    openTransferRoomModal,
    submitTransferRoom,
    openExtendStayModal,
    submitExtendStay,
    openCreateBookingModal,
    onBookingFormChange,
    submitCreateBooking,
    // CÁC HÀM QUẢN LÝ ĐẶT THEO ĐOÀN & NHẬN PHÒNG HÀNG LOẠT
    openCreateGroupBookingModal,
    addGroupAllocRow,
    removeGroupAllocRow,
    updateGroupBookingEstimate,
    setGroupDepositPercent,
    updateGroupBookingDepositHint,
    submitCreateGroupBooking,
    openBulkAssignRoomsModal,
    onAssignRoomCardClick,
    onAssignRoomCheckboxChange,
    autoSelectAssignRooms,
    submitBulkAssignRooms,
    openBulkCheckInModal,
    applyGuestNameToAll,
    applyGuaranteeDepositToAll,
    updateBulkCheckInTotal,
    submitBulkCheckIn,
    setBookingTab,
    updateBookingFilter,
    toggleGroupDetails,
    closeModal,
    toggleSidebar,
    toggleNotifications
  };

})();