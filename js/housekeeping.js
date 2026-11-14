/**
 * LOGIC NGHIỆP VỤ RIÊNG BIỆT - PHÂN HỆ BUỒNG PHÒNG (HOUSEKEEPING)
 * Khách sạn Sông Lam (Tham khảo Mường Thanh Luxury Sông Lam)
 *
 * Chức năng:
 * - Quy trình vệ sinh 4 bước: Chờ dọn -> Đang dọn -> Chờ kiểm tra -> Sạch.
 * - Tách quyền: Nhân viên dọn (chỉ dọn và báo dọn xong), Giám sát (kiểm tra & duyệt sạch).
 * - Kiểm tra Minibar gắn với mã lượt lưu trú (stayId) đồng bộ sang Lễ tân.
 * - Báo cáo sự cố hư hỏng phòng & Chặn khóa phòng khi đang có khách.
 * - Sổ tài sản khách để quên (Lost & Found).
 * - Sử dụng SongLamStore dùng chung để đồng bộ dữ liệu đa tab qua localStorage & BroadcastChannel.
 */

(function () {
  'use strict';

  // API mode never reaches SongLamStore or the legacy demo controller below.
  if (document.documentElement.dataset.housekeepingMode === 'api') {
    const mount = () => window.SongLamHousekeepingPage.mount();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
    else mount();
    return;
  }

  // Trạng thái cục bộ của giao diện Buồng phòng
  const state = {
    currentScreen: 'hk_room_board',
    // Hỗ trợ chuyển đổi vai trò nhân sự buồng phòng để kiểm thử phân quyền (mục VIII.1, VIII.10)
    currentUser: {
      id: 'NV-04',
      username: 'mai.buongphong',
      fullName: 'Trần Thị Mai',
      roleCode: 'housekeeping_maid',
      roleName: 'Nhân viên Buồng phòng'
    },
    sidebarCollapsed: false,
    searchQuery: '',
    selectedFloor: 'all',
    cleanFilter: 'all'
  };

  const store = window.SongLamStore;

  function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    let iconName = type === 'danger' ? 'alert-triangle' : (type === 'info' ? 'info' : 'check-circle');
    toast.innerHTML = `
      <i data-lucide="${iconName}" style="width: 18px; height: 18px; flex-shrink: 0;"></i>
      <div style="flex: 1;">${store ? store.escapeHtml(message) : message}</div>
    `;
    container.appendChild(toast);
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try { lucide.createIcons({ root: toast }); } catch (e) {}
    }

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function updateTopbarInfo() {
    const workingDateElem = document.getElementById('topbarWorkingDateText');
    if (workingDateElem && store) {
      workingDateElem.textContent = store.formatDate(store.getWorkingDate());
    }
  }

  // Chuyển đổi vai trò nhân sự buồng phòng (Mô phỏng phục vụ đánh giá đồ án)
  function switchHkStaffRole(roleType) {
    if (roleType === 'supervisor') {
      state.currentUser = {
        id: 'NV-05',
        username: 'thu.giamsat',
        fullName: 'Hoàng Minh Thu',
        roleCode: 'manager', // Quyền giám sát duyệt sạch
        roleName: 'Giám sát Buồng phòng'
      };
      showToast('Đã chuyển sang vai trò: Hoàng Minh Thu (Giám sát Buồng phòng - Có quyền duyệt SẠCH)', 'info');
    } else {
      state.currentUser = {
        id: 'NV-04',
        username: 'mai.buongphong',
        fullName: 'Trần Thị Mai',
        roleCode: 'housekeeping_maid', // Nhân viên dọn
        roleName: 'Nhân viên Buồng phòng'
      };
      showToast('Đã chuyển sang vai trò: Trần Thị Mai (Nhân viên Buồng phòng - Chỉ dọn và báo kiểm tra)', 'info');
    }

    // Cập nhật hiển thị trên topbar
    const nameEl = document.querySelector('.user-fullname');
    const roleEl = document.querySelector('.user-role-tag');
    const avatarEl = document.querySelector('.user-avatar-circle');
    if (nameEl) nameEl.textContent = state.currentUser.fullName;
    if (roleEl) roleEl.textContent = state.currentUser.roleName;
    if (avatarEl) avatarEl.textContent = state.currentUser.fullName.slice(-1);

    renderCurrentScreen();
  }

  // 1. MÀN HÌNH SƠ ĐỒ VỆ SINH BUỒNG PHÒNG (ROOM BOARD)
  function renderHkRoomBoard() {
    const data = store.getData();
    const rooms = data.rooms || [];

    let filteredRooms = rooms;
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      filteredRooms = filteredRooms.filter(r => r.number.toLowerCase().includes(q) || r.classCode.toLowerCase().includes(q));
    }
    if (state.selectedFloor !== 'all') {
      filteredRooms = filteredRooms.filter(r => String(r.floor) === String(state.selectedFloor));
    }
    if (state.cleanFilter !== 'all') {
      filteredRooms = filteredRooms.filter(r => r.cleanStatus === state.cleanFilter);
    }

    const countClean = rooms.filter(r => r.cleanStatus === 'clean').length;
    const countDirty = rooms.filter(r => r.cleanStatus === 'dirty').length;
    const countCleaning = rooms.filter(r => r.cleanStatus === 'cleaning').length;
    const countInspecting = rooms.filter(r => r.cleanStatus === 'inspecting').length;
    const countMaintenance = rooms.filter(r => r.exploitationStatus === 'maintenance').length;

    const isSupervisor = (state.currentUser.roleCode === 'manager' || state.currentUser.roleCode === 'admin' || state.currentUser.username === 'thu.giamsat');

    let html = `
      <div class="page-header">
        <div class="page-title-box">
          <h1 class="page-title"><i data-lucide="spray-can" style="color: #059669;"></i> Nghiệp vụ Buồng phòng &bull; Trạng thái vệ sinh</h1>
          <div class="page-breadcrumb">
            Luồng vệ sinh 4 bước chuẩn: Chờ dọn &rarr; Đang dọn &rarr; Chờ kiểm tra &rarr; Đã sạch (Chỉ Giám sát mới được duyệt sạch)
          </div>
        </div>
        <div class="page-actions" style="display: flex; gap: 8px; align-items: center;">
          <!-- Bộ chuyển vai trò kiểm thử buồng phòng -->
          <div style="background: #fff; border: 1px solid #a7f3d0; border-radius: var(--radius-sm); padding: 4px 8px; display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 11px; font-weight: 700; color: #065f46;">Mô phỏng ca trực:</span>
            <select class="form-select" style="font-size: 12px; padding: 2px 6px; height: 26px;" onchange="window.housekeepingApp.switchStaffRole(this.value)">
              <option value="maid" ${!isSupervisor ? 'selected' : ''}>Trần Thị Mai (Nhân viên dọn)</option>
              <option value="supervisor" ${isSupervisor ? 'selected' : ''}>Hoàng Minh Thu (Giám sát duyệt sạch)</option>
            </select>
          </div>

          <button class="btn btn-danger btn-sm" onclick="window.housekeepingApp.openReportMaintenanceModal()">
            <i data-lucide="wrench"></i> Báo sự cố hư hỏng phòng
          </button>
        </div>
      </div>

      <!-- Thống kê chỉ số dọn dẹp ca trực -->
      <div class="pms-stat-strip" style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 16px;">
        <div style="background: #fffbeb; border: 1.5px solid #fde68a; border-radius: var(--radius-sm); padding: 10px 14px; cursor: pointer;" onclick="window.housekeepingApp.filterCleanStatus('dirty')">
          <div style="font-size: 11px; font-weight: 700; color: #b45309; text-transform: uppercase;">1. Chờ dọn (${countDirty})</div>
          <div style="font-size: 22px; font-weight: 800; color: #b45309;">${countDirty} <span style="font-size: 12px; font-weight: normal;">phòng</span></div>
        </div>
        <div style="background: #f0f9ff; border: 1.5px solid #bae6fd; border-radius: var(--radius-sm); padding: 10px 14px; cursor: pointer;" onclick="window.housekeepingApp.filterCleanStatus('cleaning')">
          <div style="font-size: 11px; font-weight: 700; color: #0284c7; text-transform: uppercase;">2. Đang dọn dẹp (${countCleaning})</div>
          <div style="font-size: 22px; font-weight: 800; color: #0284c7;">${countCleaning} <span style="font-size: 12px; font-weight: normal;">phòng</span></div>
        </div>
        <div style="background: #faf5ff; border: 1.5px solid #e9d5ff; border-radius: var(--radius-sm); padding: 10px 14px; cursor: pointer;" onclick="window.housekeepingApp.filterCleanStatus('inspecting')">
          <div style="font-size: 11px; font-weight: 700; color: #7e22ce; text-transform: uppercase;">3. Chờ kiểm tra (${countInspecting})</div>
          <div style="font-size: 22px; font-weight: 800; color: #7e22ce;">${countInspecting} <span style="font-size: 12px; font-weight: normal;">phòng</span></div>
        </div>
        <div style="background: #edfbf3; border: 1.5px solid #b7ebcf; border-radius: var(--radius-sm); padding: 10px 14px; cursor: pointer;" onclick="window.housekeepingApp.filterCleanStatus('clean')">
          <div style="font-size: 11px; font-weight: 700; color: #107c41; text-transform: uppercase;">4. Đã duyệt sạch (${countClean})</div>
          <div style="font-size: 22px; font-weight: 800; color: #107c41;">${countClean} <span style="font-size: 12px; font-weight: normal;">phòng</span></div>
        </div>
        <div style="background: #fef2f2; border: 1.5px solid #fecaca; border-radius: var(--radius-sm); padding: 10px 14px;">
          <div style="font-size: 11px; font-weight: 700; color: #dc2626; text-transform: uppercase;">5. Tạm khóa / Hỏng</div>
          <div style="font-size: 22px; font-weight: 800; color: #dc2626;">${countMaintenance} <span style="font-size: 12px; font-weight: normal;">phòng</span></div>
        </div>
      </div>

      <!-- Bộ lọc tầng và nút xem tất cả -->
      <div style="display: flex; gap: 8px; margin-bottom: 12px; align-items: center;">
        <span style="font-size: 12px; font-weight: 600; color: var(--text-secondary);">Lọc theo tầng:</span>
        <select class="form-select" style="width: 140px; font-size: 12px;" onchange="window.housekeepingApp.filterFloor(this.value)">
          <option value="all">Tất cả tầng</option>
          <option value="4" ${state.selectedFloor === '4' ? 'selected' : ''}>Tầng 4</option>
          <option value="5" ${state.selectedFloor === '5' ? 'selected' : ''}>Tầng 5</option>
          <option value="6" ${state.selectedFloor === '6' ? 'selected' : ''}>Tầng 6</option>
          <option value="7" ${state.selectedFloor === '7' ? 'selected' : ''}>Tầng 7</option>
          <option value="8" ${state.selectedFloor === '8' ? 'selected' : ''}>Tầng 8</option>
          <option value="10" ${state.selectedFloor === '10' ? 'selected' : ''}>Tầng 10</option>
          <option value="12" ${state.selectedFloor === '12' ? 'selected' : ''}>Tầng 12</option>
          <option value="14" ${state.selectedFloor === '14' ? 'selected' : ''}>Tầng 14</option>
          <option value="15" ${state.selectedFloor === '15' ? 'selected' : ''}>Tầng 15</option>
        </select>
        ${state.cleanFilter !== 'all' ? `
          <button class="btn btn-secondary btn-xs" onclick="window.housekeepingApp.filterCleanStatus('all')">
            <i data-lucide="x"></i> Bỏ lọc trạng thái (${state.cleanFilter})
          </button>
        ` : ''}
      </div>

      <!-- Lưới thẻ phòng Buồng phòng -->
      <div class="hk-grid">
        ${filteredRooms.map(room => {
          const isMaintenance = room.exploitationStatus === 'maintenance';
          let statusClass = 'status-clean';
          let statusBadgeText = 'ĐÃ SẠCH';
          let statusBadgeClass = 'badge-clean';

          if (isMaintenance) {
            statusClass = 'status-maintenance';
            statusBadgeText = 'BẢO TRÌ';
            statusBadgeClass = 'badge-maintenance';
          } else if (room.cleanStatus === 'dirty') {
            statusClass = 'status-dirty';
            statusBadgeText = 'CHỜ DỌN';
            statusBadgeClass = 'badge-dirty';
          } else if (room.cleanStatus === 'cleaning') {
            statusClass = 'status-cleaning';
            statusBadgeText = 'ĐANG DỌN';
            statusBadgeClass = 'badge-cleaning';
          } else if (room.cleanStatus === 'inspecting') {
            statusClass = 'status-inspecting';
            statusBadgeText = 'CHỜ KT';
            statusBadgeClass = 'badge-inspecting';
          }

          const hasGuest = room.stayStatus === 'occupied';
          if (!isMaintenance && room.cleanStatus === 'clean') {
            if (!hasGuest) {
              statusBadgeText = 'SẴN SÀNG ĐÓN KHÁCH';
            } else {
              statusBadgeText = 'ĐÃ SẠCH (CÓ KHÁCH)';
            }
          }

          return `
            <div class="hk-card ${statusClass}">
              <div>
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                  <div>
                    <span style="font-size: 18px; font-weight: 800; color: #1e293b;">P.${room.number}</span>
                    <span style="font-size: 12px; color: var(--text-secondary); margin-left: 6px;">T.${room.floor} &bull; ${room.classCode}</span>
                  </div>
                  <div style="display: flex; gap: 4px;">
                    ${hasGuest ? '<span class="badge badge-occupied" style="font-size: 10px;">Có khách</span>' : '<span class="badge badge-vacant" style="font-size: 10px;">Trống</span>'}
                    <span class="badge ${statusBadgeClass}">${statusBadgeText}</span>
                  </div>
                </div>
                <div style="font-size: 11.5px; color: #475569; margin-top: 4px; line-height: 1.4;">
                  ${hasGuest ? '<span style="color: #b45309; font-weight: 600;">Khách đang lưu trú</span>' : (room.cleanStatus === 'clean' && !isMaintenance ? '<span style="color: #15803d; font-weight: 700;"><i data-lucide="check-circle" style="width:12px;height:12px;vertical-align:middle;"></i> Sẵn sàng nhận khách</span>' : 'Phòng trống chờ vệ sinh')}
                </div>
              </div>

              <!-- Nút bấm tác vụ nhanh 1 chạm theo quy trình 4 bước -->
              <div class="hk-action-buttons-row">
                ${room.cleanStatus === 'clean' && !isMaintenance ? `
                  <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 700; color: #166534; background: #dcfce7; padding: 4px 8px; border-radius: 4px;">
                    <i data-lucide="check-check" style="width: 14px; height: 14px;"></i> Đã đạt chuẩn
                  </span>
                  <button class="hk-btn-action" style="color: #b45309;" onclick="window.housekeepingApp.updateRoomCleanState('${room.id}', 'dirty')" title="Báo phòng bị bẩn, chuyển lại về chờ dọn">
                    <i data-lucide="rotate-ccw" style="width: 12px; height: 12px;"></i> Báo bẩn
                  </button>
                ` : `
                  <!-- Bước 1 & 2: Bắt đầu dọn -->
                  <button class="hk-btn-action" style="color: #0284c7;" onclick="window.housekeepingApp.updateRoomCleanState('${room.id}', 'cleaning')" title="Bắt đầu dọn phòng này">
                    <i data-lucide="refresh-cw" style="width: 12px; height: 12px;"></i> Bắt đầu dọn
                  </button>

                  <!-- Bước 2 & 3: Báo dọn xong (Chờ kiểm tra) -->
                  <button class="hk-btn-action" style="color: #7e22ce;" onclick="window.housekeepingApp.updateRoomCleanState('${room.id}', 'inspecting')" title="Báo đã dọn xong, chuyển sang chờ kiểm tra">
                    <i data-lucide="eye" style="width: 12px; height: 12px;"></i> Báo KT
                  </button>

                  <!-- Bước 4: Duyệt sạch (Chỉ Giám sát được duyệt) -->
                  <button class="hk-btn-action" style="color: #107c41; font-weight: 700; ${room.cleanStatus === 'inspecting' ? 'background: #dcfce7; border: 1.5px solid #86efac;' : ''}" onclick="window.housekeepingApp.approveCleanRoom('${room.id}')" title="Chỉ Giám sát/Quản lý mới có quyền duyệt sạch">
                    <i data-lucide="check" style="width: 12px; height: 12px;"></i> Duyệt Sạch
                  </button>
                `}

                <!-- Khóa/Mở bảo trì -->
                <button class="hk-btn-action" style="color: #dc2626;" onclick="window.housekeepingApp.toggleRoomMaintenance('${room.id}')" title="${isMaintenance ? 'Mở lại vào kinh doanh' : 'Tạm dừng khai thác để sửa chữa'}">
                  <i data-lucide="wrench" style="width: 12px; height: 12px;"></i> ${isMaintenance ? 'Mở lại' : 'Khóa hỏng'}
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    document.getElementById('mainContent').innerHTML = html;
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try { lucide.createIcons(); } catch (e) {}
    }
  }

  // Cập nhật trạng thái vệ sinh (nhân viên bắt đầu dọn hoặc báo dọn xong)
  function updateRoomCleanState(roomId, newStatus) {
    try {
      store.updateRoomCleanStatus(roomId, newStatus, state.currentUser);
      let label = newStatus === 'cleaning' ? 'ĐANG DỌN' : (newStatus === 'inspecting' ? 'CHỜ KIỂM TRA' : (newStatus === 'dirty' ? 'CHỜ DỌN' : newStatus));
      showToast(`Phòng đã chuyển sang trạng thái: ${label}!`, 'success');
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  // Duyệt Sạch (Nghiệm thu đạt chuẩn - Tách quyền mục VIII.1)
  function approveCleanRoom(roomId) {
    const isSupervisor = (state.currentUser.roleCode === 'manager' || state.currentUser.roleCode === 'admin' || state.currentUser.username === 'thu.giamsat');
    if (!isSupervisor) {
      showToast(
        'Bạn đang đăng nhập với vai trò [Nhân viên dọn phòng]. Chỉ [Giám sát buồng phòng] hoặc [Quản lý] mới có quyền nghiệm thu và duyệt phòng SẠCH!',
        'danger'
      );
      return;
    }

    try {
      store.updateRoomCleanStatus(roomId, 'clean', state.currentUser);
      showToast('Đã nghiệm thu phòng đạt chuẩn 5 sao và duyệt trạng thái SẠCH thành công! Phòng chuyển sang trạng thái SẴN SÀNG ĐÓN KHÁCH.', 'success');
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  // Khóa / Mở phòng bảo trì (mục VIII.6, VIII.7, VIII.8)
  function toggleRoomMaintenance(roomId) {
    try {
      store.toggleRoomMaintenance(roomId, 'Thao tác từ màn hình Buồng phòng', state.currentUser);
      showToast('Đã cập nhật trạng thái khai thác phòng!', 'success');
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  // 2. BẢNG PHÂN CÔNG VIỆC DỌN DẸP (TASK LIST)
  function renderHkTaskList() {
    const data = store.getData();
    const tasks = data.housekeepingTasks || [];

    let html = `
      <div class="page-header">
        <div class="page-title-box">
          <h1 class="page-title"><i data-lucide="check-square" style="color: #059669;"></i> Bảng phân công việc dọn dẹp ca trực</h1>
          <div class="page-breadcrumb">Theo dõi danh sách các phòng được giao cho nhân viên buồng phòng và kết quả kiểm tra</div>
        </div>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Mã việc</th>
              <th>Số phòng</th>
              <th>Loại công việc</th>
              <th>Nhân viên đảm nhận</th>
              <th>Thời gian giao</th>
              <th class="text-center">Tiến độ</th>
              <th>Kết quả kiểm tra</th>
              <th>Ghi chú</th>
              <th class="text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${tasks.map(t => `
              <tr>
                <td><span style="font-weight: 700; color: var(--primary);">${t.id}</span></td>
                <td><span style="font-size: 16px; font-weight: 800; color: var(--primary);">P.${t.roomNumber}</span></td>
                <td style="font-weight: 600;">${store.escapeHtml(t.taskTypeName || t.taskType)}</td>
                <td>${store.escapeHtml(t.assignedStaff)}</td>
                <td style="font-size: 12px;">${store.formatDate(t.assignedTime)}</td>
                <td class="text-center">
                  <span class="badge ${t.status === 'completed' ? 'badge-clean' : (t.status === 'in_progress' ? 'badge-cleaning' : (t.status === 'inspecting' ? 'badge-inspecting' : 'badge-dirty'))}">
                    ${t.status === 'completed' ? 'Đã hoàn thành' : (t.status === 'in_progress' ? 'Đang dọn' : (t.status === 'inspecting' ? 'Chờ kiểm tra' : 'Chờ dọn'))}
                  </span>
                </td>
                <td style="font-size: 12px; font-weight: 600;">${store.escapeHtml(t.inspectionResult || 'Chưa kiểm tra')}</td>
                <td style="font-size: 12px; color: var(--text-secondary); max-width: 250px;">${store.escapeHtml(t.notes || '')}</td>
                <td class="text-right">
                  ${t.status !== 'completed' ? `
                    <button class="btn btn-secondary btn-xs" onclick="window.housekeepingApp.completeTask('${t.id}', '${t.roomNumber}')" title="Hoàn thành dọn phòng">
                      <i data-lucide="check"></i> Báo xong
                    </button>
                  ` : `
                    <span style="font-size: 11.5px; color: var(--success);"><i data-lucide="check-check" style="width:13px;height:13px;vertical-align:middle;"></i> Xong</span>
                  `}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('mainContent').innerHTML = html;
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try { lucide.createIcons(); } catch (e) {}
    }
  }

  function completeTask(taskId, roomNumber) {
    try {
      store.updateRoomCleanStatus(roomNumber, 'inspecting', state.currentUser);
      showToast(`Đã báo dọn xong phòng ${roomNumber}. Phòng chuyển sang trạng thái CHỜ KIỂM TRA (chưa tự động duyệt sạch).`, 'info');
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  // 3. KIỂM TRA MINIBAR PHÒNG TRẢ (GẮN VỚI MÃ LƯỢT LƯU TRÚ - MỤC VII)
  function renderHkMinibarCheck() {
    const data = store.getData();
    const audits = data.minibarAudits || [];

    // Danh sách các lượt lưu trú đang mở để buồng phòng có thể chọn kiểm tra
    const inHouseStays = (data.stays || []).filter(s => s.status === 'in_house');

    let html = `
      <div class="page-header">
        <div class="page-title-box">
          <h1 class="page-title"><i data-lucide="wine" style="color: #059669;"></i> Kiểm tra Minibar phòng trả (Đồng bộ với Folio Lễ tân)</h1>
          <div class="page-breadcrumb">
            Mỗi phiếu kiểm tra được liên kết trực tiếp bằng mã lượt lưu trú (stayId). Khi buồng phòng gửi, lễ tân nhìn thấy ngay trên hóa đơn phòng.
          </div>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary btn-sm" onclick="window.housekeepingApp.openNewMinibarAuditModal()">
            <i data-lucide="plus-circle"></i> Lập phiếu kiểm tra Minibar mới
          </button>
        </div>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Mã phiếu</th>
              <th>Mã lượt lưu trú (stayId)</th>
              <th>Số phòng</th>
              <th>Thời gian kiểm</th>
              <th>Người kiểm tra</th>
              <th>Các món đã dùng</th>
              <th class="text-right">Tổng tiền phát sinh</th>
              <th class="text-center">Trạng thái đồng bộ</th>
              <th class="text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${audits.map(a => `
              <tr>
                <td><span style="font-weight: 700; color: var(--primary);">${a.id}</span></td>
                <td><span style="font-family: monospace; font-size: 11px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${a.stayId || 'N/A'}</span></td>
                <td><span style="font-size: 16px; font-weight: 800; color: var(--primary);">P.${a.roomNumber}</span></td>
                <td style="font-size: 12px;">${store.formatDate(a.checkoutTime)}</td>
                <td style="font-weight: 600;">${store.escapeHtml(a.inspectedBy)}</td>
                <td>
                  ${a.itemsUsed && a.itemsUsed.length > 0 ?
                    a.itemsUsed.map(it => `<span class="badge badge-vacant" style="margin-right: 4px;">${store.escapeHtml(it.name)} (x${it.quantity})</span>`).join('') :
                    '<span style="color: var(--text-muted); font-style: italic;">Không phát sinh tiêu hao</span>'
                  }
                </td>
                <td class="text-right font-amount" style="color: var(--danger); font-size: 13.5px;">${store.formatCurrency(a.totalAmount)}</td>
                <td class="text-center">
                  <span class="badge ${a.status === 'reported' ? 'badge-clean' : (a.status === 'no_consumption' ? 'badge-vacant' : 'badge-dirty')}">
                    ${a.status === 'reported' ? 'Đã gửi sang Lễ tân' : (a.status === 'no_consumption' ? 'Không phát sinh' : 'Chờ kiểm tra')}
                  </span>
                </td>
                <td class="text-right">
                  <button class="btn btn-secondary btn-xs" onclick="window.housekeepingApp.openRecordMinibarModal('${a.id}', '${a.roomNumber}', '${a.stayId}')">
                    <i data-lucide="edit-3"></i> Sửa / Kiểm lại
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('mainContent').innerHTML = html;
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try { lucide.createIcons(); } catch (e) {}
    }
  }

  // Mở modal lập phiếu minibar cho một phòng đang ở
  function openNewMinibarAuditModal() {
    const data = store.getData();
    const inHouseStays = (data.stays || []).filter(s => s.status === 'in_house');

    if (inHouseStays.length === 0) {
      showToast('Hiện không có phòng nào đang có khách lưu trú để kiểm tra minibar!', 'warning');
      return;
    }

    const modal = document.getElementById('appModal');
    modal.innerHTML = `
      <div class="modal-overlay active" id="modalBackdrop">
        <div class="modal-container" style="max-width: 560px;">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="wine"></i> Lập phiếu kiểm tra Minibar phòng trả</div>
            <button class="modal-close-btn" onclick="window.housekeepingApp.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.housekeepingApp.submitNewMinibarAudit(event)">
            <div class="modal-body">
              <div class="form-group" style="margin-bottom: 14px;">
                <label class="form-label required">Chọn phòng và lượt lưu trú kiểm tra</label>
                <select class="form-select" name="stayIdAndRoom" style="width: 100%;" required>
                  ${inHouseStays.map(s => `
                    <option value="${s.id}|${s.roomNumber}">Phòng ${s.roomNumber} - Khách: ${store.escapeHtml(s.guest.name)} (Mã ở: ${s.id})</option>
                  `).join('')}
                </select>
              </div>

              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: var(--radius-sm); padding: 12px; margin-bottom: 14px;">
                <div style="font-size: 12.5px; font-weight: 700; color: #059669; margin-bottom: 8px;">Nhập số lượng đồ khách đã uống / ăn:</div>
                <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; align-items: center; margin-bottom: 6px;">
                  <span>Bia Tiger Bạc</span>
                  <span style="font-size: 11px; color: var(--text-muted);">35.000đ/lon</span>
                  <input type="number" class="form-control text-center" name="beerQty" min="0" max="20" value="0">
                </div>
                <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; align-items: center; margin-bottom: 6px;">
                  <span>Nước ngọt Coca Cola</span>
                  <span style="font-size: 11px; color: var(--text-muted);">35.000đ/lon</span>
                  <input type="number" class="form-control text-center" name="cokeQty" min="0" max="20" value="0">
                </div>
                <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; align-items: center; margin-bottom: 6px;">
                  <span>Nước khoáng Lavie</span>
                  <span style="font-size: 11px; color: var(--text-muted);">20.000đ/chai</span>
                  <input type="number" class="form-control text-center" name="waterQty" min="0" max="20" value="0">
                </div>
                <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; align-items: center;">
                  <span>Hạt điều rang sấy cao cấp</span>
                  <span style="font-size: 11px; color: var(--text-muted);">45.000đ/gói</span>
                  <input type="number" class="form-control text-center" name="cashewQty" min="0" max="20" value="0">
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Ghi chú của người kiểm phòng</label>
                <input type="text" class="form-control" name="notes" placeholder="vd: Khách để lại vỏ lon trong sọt rác, đồ nguyên vẹn..." />
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.housekeepingApp.closeModal()">Hủy</button>
              <button type="submit" class="btn btn-primary">
                <i data-lucide="send"></i> Lưu & Gửi sang Quầy Lễ Tân
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try { lucide.createIcons({ root: modal }); } catch (e) {}
    }
  }

  function submitNewMinibarAudit(event) {
    event.preventDefault();
    const form = event.target;
    const [stayId, roomNumber] = form.stayIdAndRoom.value.split('|');

    const beer = parseInt(form.beerQty.value, 10) || 0;
    const coke = parseInt(form.cokeQty.value, 10) || 0;
    const water = parseInt(form.waterQty.value, 10) || 0;
    const cashew = parseInt(form.cashewQty.value, 10) || 0;
    const notes = form.notes.value.trim();

    const itemsUsed = [];
    if (beer > 0) itemsUsed.push({ name: 'Bia Tiger Bạc', quantity: beer, price: 35000 });
    if (coke > 0) itemsUsed.push({ name: 'Nước ngọt Coca Cola', quantity: coke, price: 35000 });
    if (water > 0) itemsUsed.push({ name: 'Nước khoáng Lavie', quantity: water, price: 20000 });
    if (cashew > 0) itemsUsed.push({ name: 'Hạt điều rang sấy', quantity: cashew, price: 45000 });

    try {
      store.recordMinibarAudit({
        stayId: stayId,
        roomNumber: roomNumber,
        itemsUsed: itemsUsed,
        notes: notes,
        inspectedBy: state.currentUser.fullName
      }, state.currentUser);

      closeModal();
      showToast(
        itemsUsed.length > 0
          ? `Đã lưu và đồng bộ số liệu Minibar P.${roomNumber} sang Folio Lễ tân thành công!`
          : `Đã ghi nhận kiểm tra P.${roomNumber}: Không phát sinh tiêu hao minibar.`,
        'success'
      );
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  // Mở modal sửa / cập nhật phiếu minibar hiện có
  function openRecordMinibarModal(auditId, roomNumber, stayId) {
    const data = store.getData();
    const audit = data.minibarAudits.find(a => a.id === auditId);

    let beerQty = 0, cokeQty = 0, waterQty = 0, cashewQty = 0;
    if (audit && Array.isArray(audit.itemsUsed)) {
      audit.itemsUsed.forEach(it => {
        if (it.name.includes('Tiger')) beerQty = it.quantity;
        if (it.name.includes('Coca')) cokeQty = it.quantity;
        if (it.name.includes('Lavie')) waterQty = it.quantity;
        if (it.name.includes('điều')) cashewQty = it.quantity;
      });
    }

    const modal = document.getElementById('appModal');
    modal.innerHTML = `
      <div class="modal-overlay active" id="modalBackdrop">
        <div class="modal-container" style="max-width: 540px;">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="wine"></i> Cập nhật phiếu kiểm Minibar - P.${roomNumber}</div>
            <button class="modal-close-btn" onclick="window.housekeepingApp.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.housekeepingApp.submitEditMinibarAudit(event, '${auditId}', '${roomNumber}', '${stayId}')">
            <div class="modal-body">
              <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">
                Mã phiếu: <b>${auditId}</b> &bull; Lượt lưu trú: <b>${stayId || 'N/A'}</b>
              </div>

              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: var(--radius-sm); padding: 12px; margin-bottom: 14px;">
                <div style="font-size: 12.5px; font-weight: 700; color: #059669; margin-bottom: 8px;">Nhập lại số lượng (Hệ thống chống cộng trùng, chỉ cập nhật chênh lệch):</div>
                <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; align-items: center; margin-bottom: 6px;">
                  <span>Bia Tiger Bạc</span>
                  <span style="font-size: 11px; color: var(--text-muted);">35.000đ/lon</span>
                  <input type="number" class="form-control text-center" name="beerQty" min="0" max="20" value="${beerQty}">
                </div>
                <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; align-items: center; margin-bottom: 6px;">
                  <span>Nước ngọt Coca Cola</span>
                  <span style="font-size: 11px; color: var(--text-muted);">35.000đ/lon</span>
                  <input type="number" class="form-control text-center" name="cokeQty" min="0" max="20" value="${cokeQty}">
                </div>
                <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; align-items: center; margin-bottom: 6px;">
                  <span>Nước khoáng Lavie</span>
                  <span style="font-size: 11px; color: var(--text-muted);">20.000đ/chai</span>
                  <input type="number" class="form-control text-center" name="waterQty" min="0" max="20" value="${waterQty}">
                </div>
                <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; align-items: center;">
                  <span>Hạt điều rang sấy</span>
                  <span style="font-size: 11px; color: var(--text-muted);">45.000đ/gói</span>
                  <input type="number" class="form-control text-center" name="cashewQty" min="0" max="20" value="${cashewQty}">
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Ghi chú điều chỉnh</label>
                <input type="text" class="form-control" name="notes" value="${store.escapeHtml(audit ? audit.notes : '')}" />
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.housekeepingApp.closeModal()">Hủy</button>
              <button type="submit" class="btn btn-primary">
                <i data-lucide="check"></i> Cập nhật số liệu
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try { lucide.createIcons({ root: modal }); } catch (e) {}
    }
  }

  function submitEditMinibarAudit(event, auditId, roomNumber, stayId) {
    event.preventDefault();
    const form = event.target;
    const beer = parseInt(form.beerQty.value, 10) || 0;
    const coke = parseInt(form.cokeQty.value, 10) || 0;
    const water = parseInt(form.waterQty.value, 10) || 0;
    const cashew = parseInt(form.cashewQty.value, 10) || 0;
    const notes = form.notes.value.trim();

    const itemsUsed = [];
    if (beer > 0) itemsUsed.push({ name: 'Bia Tiger Bạc', quantity: beer, price: 35000 });
    if (coke > 0) itemsUsed.push({ name: 'Nước ngọt Coca Cola', quantity: coke, price: 35000 });
    if (water > 0) itemsUsed.push({ name: 'Nước khoáng Lavie', quantity: water, price: 20000 });
    if (cashew > 0) itemsUsed.push({ name: 'Hạt điều rang sấy', quantity: cashew, price: 45000 });

    try {
      store.recordMinibarAudit({
        auditId: auditId,
        stayId: stayId,
        roomNumber: roomNumber,
        itemsUsed: itemsUsed,
        notes: notes,
        inspectedBy: state.currentUser.fullName
      }, state.currentUser);

      closeModal();
      showToast(`Đã cập nhật lại phiếu minibar P.${roomNumber} thành công!`, 'success');
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  // 4. BÁO CÁO SỰ CỐ & HƯ HỎNG PHÒNG (MAINTENANCE TICKETS)
  function renderHkMaintenanceReports() {
    const data = store.getData();
    const tickets = data.maintenanceTickets || [];

    let html = `
      <div class="page-header">
        <div class="page-title-box">
          <h1 class="page-title"><i data-lucide="wrench" style="color: #dc2626;"></i> Báo cáo Sự cố & Hư hỏng phòng (Bảo trì)</h1>
          <div class="page-breadcrumb">Theo dõi phiếu sửa chữa thiết bị buồng phòng. Phòng đang có khách sẽ không được tự động khóa để bảo đảm dịch vụ.</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-danger btn-sm" onclick="window.housekeepingApp.openReportMaintenanceModal()">
            <i data-lucide="plus-circle"></i> Báo cáo sự cố mới
          </button>
        </div>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Mã phiếu</th>
              <th>Số phòng</th>
              <th>Mô tả hư hỏng thiết bị</th>
              <th>Người phát hiện & báo</th>
              <th>Thời gian báo</th>
              <th>Kỹ thuật viên phụ trách</th>
              <th class="text-center">Tình trạng sửa</th>
              <th class="text-center">Khóa phòng</th>
            </tr>
          </thead>
          <tbody>
            ${tickets.map(tk => `
              <tr>
                <td><span style="font-weight: 700; color: var(--danger);">${tk.id}</span></td>
                <td><span style="font-size: 16px; font-weight: 800; color: var(--primary);">P.${tk.roomNumber}</span></td>
                <td style="font-weight: 600; max-width: 280px;">${store.escapeHtml(tk.issueDescription)}</td>
                <td>${store.escapeHtml(tk.reportedBy)}</td>
                <td style="font-size: 12px;">${store.formatDate(tk.reportedAt)}</td>
                <td>${store.escapeHtml(tk.technician)}</td>
                <td class="text-center">
                  <span class="badge ${tk.status === 'completed' ? 'badge-clean' : 'badge-dirty'}">
                    ${tk.status === 'completed' ? 'Đã sửa xong' : 'Đang xử lý'}
                  </span>
                </td>
                <td class="text-center">
                  ${tk.roomLocked ? '<span class="badge badge-maintenance">Đang khóa</span>' : '<span class="badge badge-clean">Vẫn mở</span>'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('mainContent').innerHTML = html;
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try { lucide.createIcons(); } catch (e) {}
    }
  }

  function openReportMaintenanceModal() {
    const data = store.getData();
    const rooms = data.rooms || [];

    const modal = document.getElementById('appModal');
    modal.innerHTML = `
      <div class="modal-overlay active" id="modalBackdrop">
        <div class="modal-container" style="max-width: 520px;">
          <div class="modal-header">
            <div class="modal-title" style="color: var(--danger);"><i data-lucide="wrench"></i> Báo cáo Sự cố & Hư hỏng phòng</div>
            <button class="modal-close-btn" onclick="window.housekeepingApp.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.housekeepingApp.submitReportMaintenance(event)">
            <div class="modal-body">
              <div class="form-group" style="margin-bottom: 12px;">
                <label class="form-label required">Số phòng xảy ra sự cố</label>
                <select class="form-select" name="roomNumber" style="width: 100%;" required onchange="window.housekeepingApp.checkRoomGuestStatus(this.value)">
                  ${rooms.map(r => `
                    <option value="${r.number}">Phòng ${r.number} (Tầng ${r.floor} &bull; ${r.stayStatus === 'occupied' ? 'ĐANG CÓ KHÁCH' : 'Trống'})</option>
                  `).join('')}
                </select>
              </div>

              <div id="roomGuestWarningBox" style="display: none; background: #fffbeb; border: 1px solid #fde68a; border-radius: var(--radius-sm); padding: 8px 12px; font-size: 12px; color: #b45309; margin-bottom: 12px;">
                <i data-lucide="alert-triangle" style="width:13px;height:13px;vertical-align:middle;"></i>
                <b>Lưu ý:</b> Phòng này đang có khách ở! Hệ thống sẽ không khóa phòng để tránh ảnh hưởng khách; vui lòng báo Quản lý xử lý đổi phòng cho khách nếu cần sửa gấp.
              </div>

              <div class="form-group" style="margin-bottom: 12px;">
                <label class="form-label required">Mô tả chi tiết sự cố / hư hỏng</label>
                <textarea class="form-control" name="issue" rows="3" placeholder="Ví dụ: Vòi xịt vệ sinh bị rò rỉ nước, điều hòa kêu to, bóng đèn ngủ chập chờn..." required></textarea>
              </div>

              <div class="form-group" style="margin-bottom: 12px;">
                <label class="form-label">Tạm khóa phòng không đón khách mới?</label>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <input type="checkbox" name="lockRoom" id="lockRoomCheckbox" style="width: 16px; height: 16px;">
                  <label for="lockRoomCheckbox" style="font-size: 13px; cursor: pointer;">Khóa phòng chuyển sang trạng thái BẢO TRÌ (Chỉ áp dụng khi phòng trống)</label>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.housekeepingApp.closeModal()">Hủy</button>
              <button type="submit" class="btn btn-danger">
                <i data-lucide="send"></i> Gửi phiếu báo sự cố
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try { lucide.createIcons({ root: modal }); } catch (e) {}
    }
  }

  function checkRoomGuestStatus(roomNumber) {
    const data = store.getData();
    const room = data.rooms.find(r => r.number === roomNumber);
    const box = document.getElementById('roomGuestWarningBox');
    const chk = document.getElementById('lockRoomCheckbox');
    if (room && room.stayStatus === 'occupied') {
      if (box) box.style.display = 'block';
      if (chk) { chk.checked = false; chk.disabled = true; }
    } else {
      if (box) box.style.display = 'none';
      if (chk) chk.disabled = false;
    }
  }

  function submitReportMaintenance(event) {
    event.preventDefault();
    const form = event.target;
    const roomNumber = form.roomNumber.value;
    const issue = form.issue.value.trim();
    const lockRoom = form.lockRoom ? form.lockRoom.checked : false;

    try {
      store.reportMaintenanceTicket({
        roomNumber: roomNumber,
        issueDescription: issue,
        lockRoom: lockRoom
      }, state.currentUser);

      closeModal();
      showToast(`Đã tạo phiếu báo sự cố cho phòng ${roomNumber}!`, 'success');
      renderCurrentScreen();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  // 5. ĐỒ KHÁCH ĐỂ QUÊN (LOST & FOUND)
  function renderHkLostFound() {
    const data = store.getData();
    const items = data.lostAndFound || [];

    let html = `
      <div class="page-header">
        <div class="page-title-box">
          <h1 class="page-title"><i data-lucide="package-search" style="color: #059669;"></i> Quản lý Đồ khách để quên (Lost & Found)</h1>
          <div class="page-breadcrumb">Ghi nhận tài sản khách bỏ quên sau khi trả phòng, vị trí cất giữ và trạng thái bàn giao lại</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary btn-sm" onclick="window.housekeepingApp.openRecordLostFoundModal()">
            <i data-lucide="plus-circle"></i> Ghi nhận đồ để quên mới
          </button>
        </div>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Mã tài sản</th>
              <th>Số phòng</th>
              <th>Ngày nhặt được</th>
              <th>Mô tả đồ thất lạc</th>
              <th>Người nhặt</th>
              <th>Vị trí lưu kho</th>
              <th>Thông tin khách</th>
              <th class="text-center">Tình trạng</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(it => `
              <tr>
                <td><span style="font-weight: 700; color: var(--primary);">${it.id}</span></td>
                <td><span style="font-size: 16px; font-weight: 800; color: var(--primary);">P.${it.roomNumber}</span></td>
                <td style="font-size: 12px;">${store.formatDate(it.foundDate)}</td>
                <td style="font-weight: 600;">${store.escapeHtml(it.itemDescription)}</td>
                <td>${store.escapeHtml(it.foundBy)}</td>
                <td>${store.escapeHtml(it.storageLocation)}</td>
                <td>${store.escapeHtml(it.guestContact)}</td>
                <td class="text-center">
                  <span class="badge ${it.status === 'returned' ? 'badge-clean' : 'badge-dirty'}">
                    ${it.status === 'returned' ? 'Đã bàn giao lại' : 'Đang lưu két'}
                  </span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('mainContent').innerHTML = html;
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try { lucide.createIcons(); } catch (e) {}
    }
  }

  function openRecordLostFoundModal() {
    const data = store.getData();
    const rooms = data.rooms || [];

    const modal = document.getElementById('appModal');
    modal.innerHTML = `
      <div class="modal-overlay active" id="modalBackdrop">
        <div class="modal-container" style="max-width: 500px;">
          <div class="modal-header">
            <div class="modal-title"><i data-lucide="package-search"></i> Ghi nhận Đồ để quên (Lost & Found)</div>
            <button class="modal-close-btn" onclick="window.housekeepingApp.closeModal()"><i data-lucide="x"></i></button>
          </div>
          <form onsubmit="window.housekeepingApp.submitRecordLostFound(event)">
            <div class="modal-body">
              <div class="form-group" style="margin-bottom: 12px;">
                <label class="form-label required">Số phòng nhặt được</label>
                <select class="form-select" name="roomNumber" style="width: 100%;" required>
                  ${rooms.map(r => `<option value="${r.number}">Phòng ${r.number}</option>`).join('')}
                </select>
              </div>

              <div class="form-group" style="margin-bottom: 12px;">
                <label class="form-label required">Mô tả đặc điểm tài sản</label>
                <input type="text" class="form-control" name="itemDescription" placeholder="Ví dụ: Đồng hồ đeo tay, sạc điện thoại, áo khoác..." required />
              </div>

              <div class="form-group" style="margin-bottom: 12px;">
                <label class="form-label required">Vị trí lưu giữ an toàn</label>
                <input type="text" class="form-control" name="storageLocation" value="Két đồ thất lạc tầng 4" required />
              </div>

              <div class="form-group">
                <label class="form-label">Thông tin khách liên hệ (nếu biết)</label>
                <input type="text" class="form-control" name="guestContact" placeholder="Tên khách hoặc SĐT liên hệ..." />
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.housekeepingApp.closeModal()">Hủy</button>
              <button type="submit" class="btn btn-primary">
                <i data-lucide="save"></i> Lưu vào sổ thất lạc
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try { lucide.createIcons({ root: modal }); } catch (e) {}
    }
  }

  function submitRecordLostFound(event) {
    event.preventDefault();
    const form = event.target;
    const roomNumber = form.roomNumber.value;
    const itemDescription = form.itemDescription.value.trim();
    const storageLocation = form.storageLocation.value.trim();
    const guestContact = form.guestContact.value.trim() || 'Chưa xác định';

    try {
      const item = store.recordLostAndFound({
        roomNumber: roomNumber,
        itemDescription: itemDescription,
        storageLocation: storageLocation,
        guestContact: guestContact
      }, state.currentUser);

      closeModal();
      showToast(`Đã lưu tài sản ${item.id} vào sổ thất lạc!`);
      renderCurrentScreen();
    } catch (err) {
      alert('Lỗi: ' + err.message);
    }
  }

  function closeModal() {
    const modal = document.getElementById('appModal');
    if (modal) modal.innerHTML = '';
  }

  function renderCurrentScreen() {
    if (!window.SongLamUI.canScreen(state.currentScreen)) { window.SongLamUI.denied(); window.SongLamUI.sync(); return; }
    updateTopbarInfo();
    // Đánh dấu active trên sidebar
    document.querySelectorAll('.sidebar .nav-item').forEach(item => {
      if (item.getAttribute('data-screen') === state.currentScreen) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    switch (state.currentScreen) {
      case 'hk_room_board': renderHkRoomBoard(); break;
      case 'hk_task_list': renderHkTaskList(); break;
      case 'hk_minibar_check': renderHkMinibarCheck(); break;
      case 'hk_maintenance_reports': renderHkMaintenanceReports(); break;
      case 'hk_lost_found': renderHkLostFound(); break;
      default: renderHkRoomBoard(); break;
    }
  }

  function switchScreen(screenKey) {
    state.currentScreen = screenKey;
    renderCurrentScreen();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function searchRoom(query) {
    state.searchQuery = query.trim();
    if (state.currentScreen === 'hk_room_board') {
      renderHkRoomBoard();
    }
  }

  function filterFloor(floor) {
    state.selectedFloor = floor;
    renderHkRoomBoard();
  }

  function filterCleanStatus(status) {
    state.cleanFilter = status;
    renderHkRoomBoard();
  }

  function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    state.sidebarCollapsed = !state.sidebarCollapsed;
    if (state.sidebarCollapsed) {
      sidebar.classList.add('collapsed');
    } else {
      sidebar.classList.remove('collapsed');
    }
  }

  function toggleNotifications() {
    const pop = document.getElementById('notificationsPopover');
    if (!pop) return;
    pop.style.display = (pop.style.display === 'block') ? 'none' : 'block';
  }

  // Khởi động
  document.addEventListener('DOMContentLoaded', () => {
    updateTopbarInfo();
    renderCurrentScreen();

    // Lắng nghe thay đổi từ các tab khác (Quản lý, Lễ tân) để tự động cập nhật ngay lập tức
    if (store && typeof store.subscribe === 'function') {
      store.subscribe((latestData, meta) => {
        renderCurrentScreen();
      });
    }
  });

  window.housekeepingApp = {
    getUIContext: () => ({ user: state.currentUser, screen: state.currentScreen }),
    state,
    switchStaffRole: switchHkStaffRole,
    switchScreen,
    searchRoom,
    filterFloor,
    filterCleanStatus,
    updateRoomCleanState,
    approveCleanRoom,
    toggleRoomMaintenance,
    completeTask,
    openNewMinibarAuditModal,
    submitNewMinibarAudit,
    openRecordMinibarModal,
    submitEditMinibarAudit,
    openReportMaintenanceModal,
    checkRoomGuestStatus,
    submitReportMaintenance,
    openRecordLostFoundModal,
    submitRecordLostFound,
    closeModal,
    toggleSidebar,
    toggleNotifications
  };

})();
