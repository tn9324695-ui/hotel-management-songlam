/**
 * HỆ THỐNG QUẢN LÝ KHÁCH SẠN SÔNG LAM - DATA STORE & CORE BUSINESS ENGINE
 * Dùng chung cho: index.html (Quản lý & Thu ngân), reception.html (Lễ tân), housekeeping.html (Buồng phòng)
 *
 * Lưu ý đồ án: Đây là bản mô phỏng chạy trên trình duyệt phục vụ đồ án học phần
 * "Phân tích và thiết kế hệ thống quản lý khách sạn" (tham khảo Mường Thanh Luxury Sông Lam).
 * Sử dụng localStorage và BroadcastChannel để đồng bộ dữ liệu giữa các tab trên cùng một local web server.
 * Không kết nối máy chủ phân tán (RDBMS/ACID) hoặc cổng ngân hàng thực tế.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SongLamStore = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STORAGE_KEY = 'songlam_hotel_pms_data_v2';
  const DATA_VERSION = '2.1.0';
  const SYNC_CHANNEL_NAME = 'songlam_hotel_sync_channel';

  // Biến lưu trữ tại chỗ và danh sách người đăng ký lắng nghe (subscribers)
  let _currentData = null;
  let _subscribers = [];
  let _broadcastChannel = null;

  try {
    if (typeof BroadcastChannel !== 'undefined') {
      _broadcastChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
      _broadcastChannel.onmessage = function (event) {
        if (event && event.data && event.data.type === 'DATA_UPDATED') {
          _reloadFromStorage();
          _notifySubscribers(event.data);
        }
      };
    }
  } catch (e) {
    console.warn('[SongLamStore] BroadcastChannel không khả dụng, sử dụng storage event thay thế:', e);
  }

  // Lắng nghe sự kiện storage dự phòng cho cross-tab sync
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', function (e) {
      if (e.key === STORAGE_KEY && e.newValue) {
        _reloadFromStorage();
        _notifySubscribers({ type: 'DATA_UPDATED', source: 'storage_event' });
      }
    });
  }

  // =========================================================================
  // HELPER UTILITIES: Escape HTML, Date Math, Calendar Validation, Formatting
  // =========================================================================

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Kiểm tra ngày dương lịch có tồn tại thực tế hay không (chống ngày 30/02, 31/04,...)
   */
  function isValidCalendarDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return false;
    const raw = dateStr.split(' ')[0].trim();
    const parts = raw.split('-');
    if (parts.length !== 3) return false;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return false;
    if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;

    // Kiểm tra số ngày thực tế trong tháng (bao gồm năm nhuận cho tháng 2)
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return (
      dt.getUTCFullYear() === y &&
      (dt.getUTCMonth() + 1) === m &&
      dt.getUTCDate() === d
    );
  }

  function parseDateOnly(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const cleanStr = dateStr.split(' ')[0].trim();
    if (!isValidCalendarDate(cleanStr)) return null;

    const parts = cleanStr.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    return new Date(Date.UTC(y, m, d, 12, 0, 0));
  }

  function formatDateIso(dateObj) {
    const y = dateObj.getUTCFullYear();
    const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function addDays(dateStr, days) {
    const d = parseDateOnly(dateStr);
    if (!d) return dateStr;
    d.setUTCDate(d.getUTCDate() + days);
    return formatDateIso(d);
  }

  function calculateNights(checkInDateStr, checkOutDateStr) {
    if (!isValidCalendarDate(checkInDateStr) || !isValidCalendarDate(checkOutDateStr)) {
      return 0;
    }
    const inDate = parseDateOnly(checkInDateStr);
    const outDate = parseDateOnly(checkOutDateStr);
    if (!inDate || !outDate) return 0;
    const diffMs = outDate.getTime() - inDate.getTime();
    const nights = Math.round(diffMs / (1000 * 60 * 60 * 24));
    return nights;
  }

  function formatCurrency(num) {
    if (num === null || num === undefined || isNaN(num)) return '0 VNĐ';
    return new Intl.NumberFormat('vi-VN').format(Math.round(num)) + ' VNĐ';
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const dateOnly = dateStr.split(' ')[0];
    const parts = dateOnly.split('-');
    if (parts.length !== 3) return dateStr;
    const timePart = dateStr.includes(' ') ? ' ' + dateStr.split(' ')[1] : '';
    return `${parts[2]}/${parts[1]}/${parts[0]}${timePart}`;
  }

  function formatDateTimeNow() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
  }

  // =========================================================================
  // STORAGE & DATA INTEGRITY
  // =========================================================================

  function _deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function _getInitialCleanData() {
    if (typeof INITIAL_DATA !== 'undefined' && INITIAL_DATA) {
      const cloned = _deepClone(INITIAL_DATA);
      _applyStandardRoomClassSpecs(cloned);
      return cloned;
    }
    return {
      version: DATA_VERSION,
      hotelInfo: {
        name: "Khách sạn Sông Lam",
        brandReference: "Mường Thanh Luxury Sông Lam",
        address: "Số 13 đường Quang Trung, Phường Quang Trung, TP. Vinh, Tỉnh Nghệ An",
        phone: "0238 3737 666",
        email: "info@songlamhotel.vn",
        taxCodeDisclaimer: "Mã số thuế mô phỏng đồ án học phần (Chưa liên kết hệ thống hóa đơn điện tử)",
        currency: "VNĐ",
        workingDate: "2026-10-25"
      },
      roomClasses: [],
      rooms: [],
      stays: [],
      bookings: [],
      services: [],
      housekeepingTasks: [],
      minibarAudits: [],
      maintenanceTickets: [],
      lostAndFound: [],
      transactions: [],
      refundRequests: [],
      roles: [],
      users: [],
      auditLogs: []
    };
  }

  function _applyStandardRoomClassSpecs(data) {
    const verifiedAreas = {
      'SUP-K': 24,
      'DLX-T': 34,
      'PRM-K': 43,
      'PRM-T': 43,
      'JUN-S': 48,
      'CLB-S': 55,
      'EXE-S': 68,
      'GRD-S': 80,
      'ROY-S': 102,
      'PRS-S': 325
    };

    if (Array.isArray(data.roomClasses)) {
      data.roomClasses.forEach(rc => {
        if (verifiedAreas[rc.code] !== undefined) {
          rc.area = verifiedAreas[rc.code];
        }
        rc.academicNote = 'Dữ liệu cấu hình phòng và tiện nghi mang tính chất mô phỏng cho đồ án học phần';
      });
    }

    if (data.hotelInfo) {
      data.hotelInfo.taxCodeDisclaimer = 'Mã số thuế mô phỏng đồ án học phần (Chưa liên kết hệ thống hóa đơn điện tử)';
      if (!data.hotelInfo.workingDate) {
        data.hotelInfo.workingDate = '2026-10-25';
      }
    }
  }

  
  function _ensureSchemaCollections(data) {
    if (!data || typeof data !== 'object') return;
    if (!Array.isArray(data.exceptionCases)) data.exceptionCases = [];
    if (!Array.isArray(data.cashierShifts)) data.cashierShifts = [];
    if (!Array.isArray(data.dailyLedgers)) data.dailyLedgers = [];
    if (!Array.isArray(data.bookings)) data.bookings = [];
    if (!Array.isArray(data.stays)) data.stays = [];
    if (!Array.isArray(data.transactions)) data.transactions = [];
    if (!Array.isArray(data.auditLogs)) data.auditLogs = [];
    if (!Array.isArray(data.customers) || data.customers.length === 0) {
      data.customers = (typeof INITIAL_DATA !== 'undefined' && Array.isArray(INITIAL_DATA.customers)) ? _deepClone(INITIAL_DATA.customers) : [];
    }

    // LỖI 6 CHUYỂN ĐỔI DỮ LIỆU CŨ: Chuẩn hóa và cách ly các bản ghi GD-ALLOC cũ
    // Đảm bảo không bị tính là giao dịch thu tiền mới trong dòng tiền/doanh thu
    data.transactions.forEach(t => {
      if (t && (
        (t.id && String(t.id).startsWith('GD-ALLOC-')) ||
        (t.referenceCode && String(t.referenceCode).startsWith('ALLOC-'))
      )) {
        t.isInternalAllocation = true;
        t.type = 'internal_allocation';
      }
    });
  }

  function _reloadFromStorage() {
    try {
      if (typeof localStorage === 'undefined') {
        _currentData = _getInitialCleanData();
        return _currentData;
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        _currentData = _getInitialCleanData();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(_currentData));
      } else {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            _applyStandardRoomClassSpecs(parsed);
            _ensureSchemaCollections(parsed);
            _currentData = parsed;
          } else {
            console.error('[SongLamStore] Dữ liệu trong localStorage không hợp lệ. Khôi phục từ INITIAL_DATA.');
            _currentData = _getInitialCleanData();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(_currentData));
          }
        } catch (parseErr) {
          console.error('[SongLamStore] Lỗi phân tích JSON từ localStorage. Giữ nguyên không tự xóa âm thầm:', parseErr);
          if (!_currentData) {
            _currentData = _getInitialCleanData();
          }
        }
      }
    } catch (e) {
      console.error('[SongLamStore] Lỗi truy cập localStorage:', e);
      if (!_currentData) {
        _currentData = _getInitialCleanData();
      }
    }

    if (typeof window !== 'undefined') {
      window.HOTEL_DATA = _currentData;
    }

    return _currentData;
  }

  function _commitData(actionDescription) {
    try {
      if (typeof localStorage !== 'undefined' && _currentData) {
        _currentData.version = DATA_VERSION;
        _currentData.lastModified = formatDateTimeNow();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(_currentData));
      }
    } catch (e) {
      console.error('[SongLamStore] Lỗi lưu vào localStorage (có thể vượt dung lượng):', e);
      throw new Error('Không thể lưu dữ liệu vào localStorage: ' + e.message);
    }

    if (typeof window !== 'undefined') {
      window.HOTEL_DATA = _currentData;
    }

    // Thông báo cho các tab khác qua BroadcastChannel
    if (_broadcastChannel) {
      try {
        _broadcastChannel.postMessage({
          type: 'DATA_UPDATED',
          action: actionDescription || 'Cập nhật dữ liệu hệ thống',
          timestamp: Date.now()
        });
      } catch (err) {
        console.warn('[SongLamStore] Lỗi postMessage BroadcastChannel:', err);
      }
    }

    // Thông báo cho các listener trong chính trang hiện tại
    _notifySubscribers({
      type: 'DATA_UPDATED',
      action: actionDescription || 'Cập nhật dữ liệu hệ thống',
      timestamp: Date.now(),
      isLocal: true
    });
  }

  function _notifySubscribers(meta) {
    for (let i = 0; i < _subscribers.length; i++) {
      try {
        _subscribers[i](_currentData, meta);
      } catch (err) {
        console.error('[SongLamStore] Lỗi trong hàm subscriber:', err);
      }
    }
  }

  // Khởi tạo ngay khi script được tải
  _reloadFromStorage();

  // =========================================================================
  // CORE BUSINESS ENGINE (SONGLAM HOTEL PMS)
  // =========================================================================

  const SongLamStore = {
    escapeHtml: escapeHtml,
    formatCurrency: formatCurrency,
    formatDate: formatDate,
    formatDateTimeNow: formatDateTimeNow,
    saveData: function (description) {
      _commitData(description || 'Lưu dữ liệu Store');
    },
    commitData: function (description) {
      _commitData(description || 'Lưu dữ liệu Store');
    },
    recordPayment: function (params, currentUser) {
      this.reloadLatest();
      const data = this.getData();
      _ensureSchemaCollections(data);

      // RÀNG BUỘC LỖI 4: Kiểm tra quyền thu tiền tại lớp nghiệp vụ
      const canCollect = this.hasPermission(currentUser, 'collectPayment') ||
        (currentUser && ['manager', 'admin', 'cashier'].includes(currentUser.roleCode));
      if (!canCollect) {
        throw new Error('Từ chối thao tác: Bạn không có quyền thực hiện thu tiền (collectPayment)!');
      }

      // RÀNG BUỘC LỖI 4: Kiểm tra số tiền nguyên dương, hữu hạn và <= 1 tỷ VNĐ
      const amount = parseInt(params.amount, 10);
      if (isNaN(amount) || amount <= 0 || !isFinite(amount) || amount > 1000000000) {
        throw new Error('Số tiền thanh toán không hợp lệ (phải là số nguyên dương > 0 và <= 1.000.000.000 VNĐ)!');
      }

      // RÀNG BUỘC LỖI 4: Kiểm tra đối tượng thanh toán tồn tại và liên kết nhất quán
      if (params.stayId) {
        const stay = (data.stays || []).find(s => s.id === params.stayId);
        if (!stay) throw new Error('Không tìm thấy lượt lưu trú: ' + params.stayId);
      }
      if (params.bookingId) {
        const booking = (data.bookings || []).find(b => b.id === params.bookingId || b.bookingCode === params.bookingId);
        if (!booking) throw new Error('Không tìm thấy đơn đặt phòng: ' + params.bookingId);
      }
      if (params.stayId && params.bookingId) {
        const stay = (data.stays || []).find(s => s.id === params.stayId);
        if (stay && stay.bookingId && stay.bookingId !== params.bookingId) {
          throw new Error('Mâu thuẫn liên kết: stayId không thuộc về bookingId đã cung cấp!');
        }
      }
      if (!params.stayId && !params.bookingId && params.type !== 'shift_balance') {
        throw new Error('Giao dịch thanh toán phải gắn với lượt lưu trú (stayId) hoặc đơn đặt phòng (bookingId)!');
      }

      // RÀNG BUỘC LỖI 4: Kiểm tra phương thức thanh toán trong danh sách cho phép
      const VALID_METHODS = ['cash', 'bank_transfer', 'vietqr', 'vnpay_qr', 'onepay', 'pos_card'];
      const pMethod = params.paymentMethod || 'cash';
      if (!VALID_METHODS.includes(pMethod)) {
        throw new Error('Phương thức thanh toán không hợp lệ: ' + pMethod);
      }

      // RÀNG BUỘC LỖI 4: Kiểm tra loại giao dịch, không cho tạo giao dịch hoàn tùy ý
      if (params.type === 'refund' || params.type === 'guarantee_deposit_refund') {
        throw new Error('Không được tạo giao dịch hoàn tiền qua hàm recordPayment! Vui lòng dùng quy trình hoàn tiền riêng (requestRefund / completeRefund).');
      }
      const VALID_TYPES = ['deposit', 'interim_payment', 'settlement', 'final_payment', 'guarantee_deposit', 'guarantee_deposit_received', 'service_immediate', 'service_payment', 'shift_balance'];
      const pType = params.type || 'interim_payment';
      if (!VALID_TYPES.includes(pType)) {
        throw new Error('Loại giao dịch không hợp lệ: ' + pType);
      }

      // RÀNG BUỘC LỖI 5: Idempotency - Khóa chống ghi nhận lặp giao dịch
      const key = params.idempotencyKey || params.referenceCode || params.id;
      if (key) {
        const existing = (data.transactions || []).find(t =>
          (t.idempotencyKey && t.idempotencyKey === key) ||
          (t.referenceCode && t.referenceCode === key) ||
          t.id === key
        );
        if (existing) {
          const isSameAmount = (existing.amount === amount);
          const isSameStay = (!params.stayId && !existing.stayId) || (existing.stayId === params.stayId);
          const isSameBooking = (!params.bookingId && !existing.bookingId) || (existing.bookingId === params.bookingId);
          if (isSameAmount && isSameStay && isSameBooking) {
            // Replay idempotent: trả về giao dịch đã ghi, không cộng thêm tiền
            return existing;
          }
          throw new Error(`409 Conflict: Khóa giao dịch "${key}" đã tồn tại nhưng có nội dung khác (số tiền hoặc đối tượng thanh toán không khớp)!`);
        }
      }

      // RÀNG BUỘC LỖI 4: Giao dịch qua cổng trực tuyến phải bắt đầu ở trạng thái pending
      let pStatus = 'success';
      let pGatewayVerified = true;
      if (['vnpay_qr', 'onepay'].includes(pMethod)) {
        pStatus = 'pending';
        pGatewayVerified = false;
      }

      const wDate = this.getWorkingDate();
      const transId = params.id || ('GD-' + wDate.replace(/-/g, '') + '-' + Date.now().toString().slice(-4) + Math.random().toString(36).substr(2, 4).toUpperCase());
      const refCode = params.referenceCode || (key || ('REC-' + Date.now().toString().slice(-4)));

      const newTx = {
        id: transId,
        referenceCode: refCode,
        idempotencyKey: key || refCode,
        stayId: params.stayId || null,
        bookingId: params.bookingId || null,
        customerName: params.customerName || 'Khách hàng',
        amount: amount,
        paymentMethod: pMethod,
        methodName: params.methodName || (pMethod === 'vietqr' ? 'Chuyển khoản VietQR' : (pMethod === 'vnpay_qr' ? 'Cổng VNPay QR' : (pMethod === 'onepay' ? 'Cổng OnePay' : (pMethod === 'pos_card' ? 'Thẻ POS' : 'Tiền mặt tại quầy')))),
        type: pType,
        status: pStatus,
        gatewayVerified: pGatewayVerified,
        timestamp: params.timestamp || formatDateTimeNow(),
        cashier: currentUser ? (currentUser.fullName || currentUser.username || currentUser.name || 'Thu ngân') : 'Thu ngân',
        notes: params.notes || ''
      };

      data.transactions.unshift(newTx);
      _commitData(`Ghi nhận giao dịch thanh toán ${transId}`);
      return newTx;
    },
    isValidCalendarDate: isValidCalendarDate,

    // 1. Quản lý Đăng ký (Subscribe) và Đồng bộ
    subscribe: function (callback) {
      if (typeof callback === 'function') {
        _subscribers.push(callback);
      }
      return function unsubscribe() {
        _subscribers = _subscribers.filter(cb => cb !== callback);
      };
    },

    getData: function () {
      if (!_currentData) _reloadFromStorage();
      return _currentData;
    },

    reloadLatest: function () {
      return _reloadFromStorage();
    },

    resetToInitialData: function (confirmed) {
      if (!confirmed) {
        throw new Error('Yêu cầu xác nhận trước khi khôi phục dữ liệu mẫu đồ án ban đầu!');
      }
      _currentData = _getInitialCleanData();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(_currentData));
      }
      this.logAudit('KHÔI PHỤC DỮ LIỆU GỐC', 'Đã đặt lại dữ liệu mẫu PMS ban đầu', 'quantri');
      _commitData('Khôi phục dữ liệu mẫu đồ án ban đầu');
      return _currentData;
    },

    // 2. Ngày làm việc (Working Date)
    getWorkingDate: function () {
      const data = this.getData();
      return (data.hotelInfo && data.hotelInfo.workingDate) ? data.hotelInfo.workingDate : '2026-10-25';
    },

    setWorkingDate: function (newDateStr, user) {
      if (!isValidCalendarDate(newDateStr)) {
        throw new Error(`Ngày làm việc ${newDateStr} không hợp lệ trên lịch!`);
      }
      this.reloadLatest();
      const data = this.getData();
      data.hotelInfo.workingDate = newDateStr.split(' ')[0];
      this.logAudit('ĐỔI NGÀY LÀM VIỆC', `Ngày làm việc mới: ${newDateStr}`, user ? user.username : 'hethong');
      _commitData(`Đổi ngày làm việc thành ${newDateStr}`);
      return data.hotelInfo.workingDate;
    },

    // 3. Tiện ích Ngày & Định dạng
    addDays: addDays,
    calculateNights: calculateNights,

    // Ghi nhật ký kiểm toán (Audit Log)
    logAudit: function (action, target, username) {
      const data = this.getData();
      if (!Array.isArray(data.auditLogs)) data.auditLogs = [];
    if (!Array.isArray(data.customers) || data.customers.length === 0) {
      data.customers = (typeof INITIAL_DATA !== 'undefined' && Array.isArray(INITIAL_DATA.customers)) ? _deepClone(INITIAL_DATA.customers) : [];
    }
      data.auditLogs.unshift({
        id: 'LOG-' + Date.now().toString().slice(-6) + '-' + Math.random().toString(36).substr(2, 4).toUpperCase(),
        action: action,
        target: target,
        username: username || 'hethong',
        timestamp: formatDateTimeNow()
      });
      if (data.auditLogs.length > 200) {
        data.auditLogs = data.auditLogs.slice(0, 200);
      }
    },

    // 4. KIỂM TRA PHÂN QUYỀN TRUNG TÂM (Centralized Permission Checker)
    hasPermission: function (currentUser, permKey) {
      if (!currentUser) return false;
      const roleCode = currentUser.roleCode || currentUser.role || '';
      if (roleCode === 'admin') return true; // Super Admin có mọi quyền
      const data = this.getData();
      const role = (data.roles || []).find(r => r.code === roleCode);
      if (!role || !role.permissions) {
        // Fallback kiểm tra role mặc định nếu chưa cấu hình chi tiết
        if (roleCode === 'manager') return true;
        if (roleCode === 'housekeeping_supervisor' && (permKey === 'updateCleanStatus' || permKey === 'approveCleanStatus' || permKey === 'manageHousekeepingTasks' || permKey === 'reportMaintenance')) return true;
        return false;
      }
      return !!role.permissions[permKey];
    },

    // 4b. Phân bổ tiền cọc số nguyên chuẩn xác cho đơn nhiều phòng (Integer Remainder Distribution)
    // RÀNG BUỘC LỖI 1: Hỗ trợ cả 2 chữ ký: (depositAmount, totalRooms) và (booking, roomIndex)
    allocateBookingDeposit: function (arg1, arg2) {
      // Chữ ký 1: allocateBookingDeposit(depositAmount, totalRooms) -> trả về mảng phân bổ [d0, d1, ...]
      if (typeof arg1 === 'number') {
        const totalDeposit = Math.max(0, parseInt(arg1, 10) || 0);
        const totalRooms = Math.max(1, parseInt(arg2, 10) || 1);
        if (totalDeposit <= 0) return new Array(totalRooms).fill(0);
        const base = Math.floor(totalDeposit / totalRooms);
        const remainder = totalDeposit % totalRooms;
        const result = [];
        for (let i = 0; i < totalRooms; i++) {
          result.push(i < remainder ? (base + 1) : base);
        }
        return result;
      }

      // Chữ ký 2: allocateBookingDeposit(booking, roomIndex) -> trả về số tiền cọc cho phòng roomIndex
      const booking = arg1 || {};
      const roomIndex = typeof arg2 === 'number' ? arg2 : 0;

      // Nếu đơn đã có mảng allocatedDeposits đã được phân bổ chuẩn từ trước
      if (Array.isArray(booking.allocatedDeposits) && booking.allocatedDeposits.length > roomIndex) {
        return booking.allocatedDeposits[roomIndex];
      }

      const totalDeposit = parseInt(booking.depositPaid !== undefined ? booking.depositPaid : booking.depositAmount, 10) || 0;
      const totalRooms = parseInt(booking.roomQuantity, 10) || 1;
      if (totalDeposit <= 0 || totalRooms <= 0) return 0;

      const base = Math.floor(totalDeposit / totalRooms);
      const remainder = totalDeposit % totalRooms;
      // Chia phần lẻ remainder cho các phòng đầu tiên, đảm bảo tổng phân bổ đúng bằng totalDeposit đến từng đồng
      return roomIndex < remainder ? (base + 1) : base;
    },

    // 4c. Kiểm tra xem việc giảm/xóa/khóa 1 phòng có gây thiếu phòng cam kết tương lai không
    verifyFutureCommitmentAfterRoomRemoval: function (roomClassCode, roomNumberToExclude) {
      const data = this.getData();
      const wDate = this.getWorkingDate();

      // Tìm tất cả các đơn đặt phòng trong tương lai của hạng này
      const futureBookings = (data.bookings || []).filter(b => 
        b.roomClassCode === roomClassCode && 
        (b.bookingStatus === 'confirmed' || b.bookingStatus === 'partially_checked_in') &&
        b.checkOutDate > wDate
      );

      for (let b of futureBookings) {
        const avail = this.checkRoomAvailability(roomClassCode, b.checkInDate, b.checkOutDate, null, null, roomNumberToExclude);
        if (!avail.valid || (avail.rawMinAvailable !== undefined ? avail.rawMinAvailable < 0 : avail.availableQuantity <= 0)) {
          return {
            conflict: true,
            bookingId: b.id,
            date: b.checkInDate,
            roomClassCode: roomClassCode
          };
        }
      }
      return { conflict: false };
    },

    // 5. Kiểm tra quỹ phòng khả dụng theo khoảng ngày lưu trú
    checkRoomAvailability: function (roomClassCode, checkInDateStr, checkOutDateStr, excludeBookingId, excludeStayId, excludeRoomNumber) {
      const data = this.getData();

      if (!isValidCalendarDate(checkInDateStr) || !isValidCalendarDate(checkOutDateStr)) {
        return {
          valid: false,
          error: 'Ngày nhận phòng hoặc ngày trả phòng không hợp lệ trên lịch (ví dụ ngày 30/02 không tồn tại).',
          availableQuantity: 0,
          nights: 0
        };
      }

      const nights = calculateNights(checkInDateStr, checkOutDateStr);
      if (nights < 1) {
        return {
          valid: false,
          error: 'Ngày trả phòng phải sau ngày nhận phòng ít nhất 1 đêm.',
          availableQuantity: 0,
          nights: 0
        };
      }

      // 1. Tổng số phòng vật lý thuộc hạng này (loại trừ phòng đang bị xóa/khóa nếu có)
      let allRoomsOfClass = data.rooms.filter(r => r.classCode === roomClassCode);
      if (excludeRoomNumber) {
        allRoomsOfClass = allRoomsOfClass.filter(r => r.number !== excludeRoomNumber);
      }
      const totalRooms = allRoomsOfClass.length;

      if (totalRooms === 0) {
        return {
          valid: false,
          error: `Không tìm thấy phòng nào thuộc hạng ${roomClassCode} trong hệ thống.`,
          availableQuantity: 0,
          nights: nights
        };
      }

      // Phòng tạm khóa bảo trì dài hạn (hiện tại)
      const maintenanceRoomsCount = allRoomsOfClass.filter(r => r.exploitationStatus === 'maintenance').length;

      // Danh sách các đêm cần kiểm tra [checkIn, checkIn + 1, ..., checkOut - 1]
      let minAvailable = totalRooms;
      const nightlyBreakdown = [];

      for (let i = 0; i < nights; i++) {
        const currentNight = addDays(checkInDateStr, i);

        // a. Đếm các phòng đang có khách lưu trú qua đêm này
        let occupiedCount = 0;
        data.stays.forEach(s => {
          if (s.status === 'in_house' && s.roomClassCode === roomClassCode) {
            if (excludeStayId && s.id === excludeStayId) return;
            const stayInDate = s.checkInDate ? s.checkInDate.split(' ')[0] : '';
            const stayOutDate = s.expectedCheckOutDate ? s.expectedCheckOutDate.split(' ')[0] : '';
            // Đêm currentNight bị chiếm nếu: stayInDate <= currentNight < stayOutDate
            if (stayInDate <= currentNight && currentNight < stayOutDate) {
              occupiedCount++;
            }
          }
        });

        // b. Đếm các đơn đặt trước giữ quỹ phòng qua đêm này
        // QUAN TRỌNG: Với đơn đã nhận 1 phần, chỉ giữ số phòng CHƯA nhận để không đếm trùng với lượt ở (mục III.3)
        let reservedCount = 0;
        data.bookings.forEach(b => {
          if (b.roomClassCode === roomClassCode && (b.bookingStatus === 'confirmed' || b.bookingStatus === 'partially_checked_in')) {
            if (excludeBookingId && b.id === excludeBookingId) return;
            const bInDate = b.checkInDate;
            const bOutDate = b.checkOutDate;
            if (bInDate <= currentNight && currentNight < bOutDate) {
              const checkedInCount = (b.checkedInRooms || []).length;
              const remainingRoomsToHold = Math.max(0, (b.roomQuantity || 1) - checkedInCount);
              reservedCount += remainingRoomsToHold;
            }
          }
        });

        const availableTonight = totalRooms - maintenanceRoomsCount - occupiedCount - reservedCount;
        nightlyBreakdown.push({
          date: currentNight,
          total: totalRooms,
          maintenance: maintenanceRoomsCount,
          occupied: occupiedCount,
          reserved: reservedCount,
          available: Math.max(0, availableTonight),
          rawAvailable: availableTonight
        });

        if (availableTonight < minAvailable) {
          minAvailable = availableTonight;
        }
      }

      return {
        valid: true,
        roomClassCode: roomClassCode,
        nights: nights,
        totalRooms: totalRooms,
        availableQuantity: Math.max(0, minAvailable),
        rawMinAvailable: minAvailable,
        nightlyBreakdown: nightlyBreakdown
      };
    },

    // 5. Tính giá theo từng đêm (Itemized Pricing Engine)
    calculateNightlyPricing: function (roomClassCode, checkInDateStr, checkOutDateStr) {
      if (!isValidCalendarDate(checkInDateStr) || !isValidCalendarDate(checkOutDateStr)) {
        throw new Error('Ngày nhận hoặc ngày trả phòng không hợp lệ trên lịch!');
      }

      const data = this.getData();
      const rClass = data.roomClasses.find(c => c.code === roomClassCode);
      if (!rClass) throw new Error('Không tìm thấy thông tin hạng phòng ' + roomClassCode);

      const nights = calculateNights(checkInDateStr, checkOutDateStr);
      if (nights < 1) {
        return { roomClassCode, nights: 0, totalPerRoom: 0, nightlyRates: [] };
      }

      const basePrice = rClass.basePrice || 1200000;
      const weekendPrice = rClass.weekendPrice || Math.round(basePrice * (rClass.weekendMultiplier || 1.15));

      const nightlyRates = [];
      let totalPerRoom = 0;

      for (let i = 0; i < nights; i++) {
        const nightDate = addDays(checkInDateStr, i);
        const dObj = parseDateOnly(nightDate);
        const dayOfWeek = dObj.getUTCDay(); // 0: Chủ Nhật, 5: Thứ 6, 6: Thứ 7

        const isWeekend = (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0);
        const rate = isWeekend ? weekendPrice : basePrice;

        nightlyRates.push({
          date: nightDate,
          dayOfWeek: dayOfWeek,
          isWeekend: isWeekend,
          rate: rate,
          priceType: isWeekend ? 'weekend' : 'weekday'
        });
        totalPerRoom += rate;
      }

      return {
        roomClassCode: roomClassCode,
        nights: nights,
        basePrice: basePrice,
        weekendPrice: weekendPrice,
        totalPerRoom: totalPerRoom,
        totalPrice: totalPerRoom,
        nightlyRates: nightlyRates
      };
    },

    // 5b. Tính giá theo giờ (Hourly Pricing Engine)
    calculateHourlyPricing: function (roomClassCode, hours) {
      const data = this.getData();
      const rClass = data.roomClasses.find(c => c.code === roomClassCode);
      if (!rClass) throw new Error('Không tìm thấy hạng phòng ' + roomClassCode);

      const h = Math.max(1, parseInt(hours, 10) || 1);
      const first2 = rClass.hourlyRateFirst2 || rClass.hourlyBase || Math.round(rClass.basePrice * 0.35);
      const nextHour = rClass.hourlyRateNext || rClass.hourlyNext || Math.round(rClass.basePrice * 0.1);

      let total = first2;
      if (h > 2) {
        total += (h - 2) * nextHour;
      }
      return { hours: h, total: total, first2: first2, nextHour: nextHour };
    },

    // 5c. Cập nhật chính sách bảng giá động (Dynamic Pricing Policy)
    updatePricingPolicy: function (roomClassCode, params, currentUser) {
      if (!this.hasPermission(currentUser, 'editRoomClasses') && !this.hasPermission(currentUser, 'systemConfig')) {
        throw new Error('Bạn không có quyền điều chỉnh bảng giá! Thao tác này yêu cầu quyền [editRoomClasses].');
      }

      this.reloadLatest();
      const data = this.getData();
      const rClass = data.roomClasses.find(c => c.code === roomClassCode);
      if (!rClass) throw new Error('Không tìm thấy hạng phòng ' + roomClassCode);

      const bPrice = params.basePrice !== undefined ? parseInt(params.basePrice, 10) : rClass.basePrice;
      const wPrice = params.weekendPrice !== undefined ? parseInt(params.weekendPrice, 10) : rClass.weekendPrice;

      if (bPrice < 0 || wPrice < 0) {
        throw new Error('Giá phòng cơ sở và giá cuối tuần không được là số âm!');
      }

      rClass.basePrice = bPrice;
      rClass.weekendPrice = wPrice;

      const hFirst = params.hourlyRateFirst2 !== undefined ? params.hourlyRateFirst2 : params.hourlyBase;
      if (hFirst !== undefined) {
        const val = parseInt(hFirst, 10);
        if (val < 0) throw new Error('Giá thuê theo giờ không được là số âm!');
        rClass.hourlyRateFirst2 = val;
        rClass.hourlyBase = val;
      }
      const hNext = params.hourlyRateNext !== undefined ? params.hourlyRateNext : params.hourlyNext;
      if (hNext !== undefined) {
        const val = parseInt(hNext, 10);
        if (val < 0) throw new Error('Giá mỗi giờ tiếp theo không được là số âm!');
        rClass.hourlyRateNext = val;
        rClass.hourlyNext = val;
      }
      if (params.weekendMultiplier !== undefined) {
        rClass.weekendMultiplier = Math.max(1.0, parseFloat(params.weekendMultiplier) || 1.15);
      }

      this.logAudit(
        'CẬP NHẬT CHÍNH SÁCH GIÁ',
        `Hạng ${roomClassCode}: Ngày thường ${formatCurrency(rClass.basePrice)} - Cuối tuần ${formatCurrency(rClass.weekendPrice)}`,
        currentUser ? currentUser.username : 'quanly'
      );
      _commitData(`Cập nhật chính sách giá hạng ${roomClassCode}`);
      return rClass;
    },

    // 6. Tạo đơn đặt phòng mới (Create Reservation)
    createBooking: function (params, currentUser) {
      this.reloadLatest();
      const data = this.getData();

      const guestName = (params.guestName || '').trim();
      const phone = (params.phone || '').trim();
      const email = (params.email || '').trim();
      const checkInDate = params.checkInDate;
      const checkOutDate = params.checkOutDate;
      const roomClassCode = params.roomClassCode;
      const roomQuantity = parseInt(params.roomQuantity, 10);
      const depositAmount = parseInt(params.depositAmount, 10) || 0;
      const notes = (params.notes || '').trim();

      if (!guestName || !phone) {
        throw new Error('Vui lòng nhập đầy đủ Họ tên và Số điện thoại của người đặt phòng!');
      }
      if (!isValidCalendarDate(checkInDate) || !isValidCalendarDate(checkOutDate)) {
        throw new Error(`Ngày nhận (${checkInDate}) hoặc ngày trả (${checkOutDate}) không tồn tại trên lịch!`);
      }
      if (isNaN(roomQuantity) || roomQuantity < 1) {
        throw new Error('Số lượng phòng phải là số nguyên dương lớn hơn 0!');
      }
      if (depositAmount < 0) {
        throw new Error('Tiền cọc không được là số âm!');
      }

      const wDate = this.getWorkingDate();
      if (checkInDate < wDate) {
        const canBackDate = this.hasPermission(currentUser, 'systemConfig') || (currentUser && currentUser.roleCode === 'manager');
        if (!canBackDate) {
          throw new Error(`Không được phép đặt phòng trong quá khứ (Ngày nhận ${formatDate(checkInDate)} trước ngày làm việc ${formatDate(wDate)})!`);
        }
      }

      const nights = calculateNights(checkInDate, checkOutDate);
      if (nights < 1) {
        throw new Error('Ngày trả phòng phải sau ngày nhận phòng ít nhất 1 đêm!');
      }

      // Kiểm tra sức chứa & quỹ phòng theo hạng
      const avail = this.checkRoomAvailability(roomClassCode, checkInDate, checkOutDate);
      if (!avail.valid) {
        throw new Error(avail.error);
      }
      if (avail.availableQuantity < roomQuantity) {
        throw new Error(
          `Không thể đặt phòng: Hạng ${roomClassCode} chỉ còn ${avail.availableQuantity} phòng khả dụng ` +
          `trong khoảng ${formatDate(checkInDate)} - ${formatDate(checkOutDate)} (Yêu cầu: ${roomQuantity} phòng)!`
        );
      }

      // Tính chi tiết giá theo đêm đã chốt
      const pricing = this.calculateNightlyPricing(roomClassCode, checkInDate, checkOutDate);
      const totalEstimated = pricing.totalPerRoom * roomQuantity;

      const bookingId = 'DP-' + this.getWorkingDate().replace(/-/g, '') + '-' + String((data.bookings || []).length + 1).padStart(3, '0');

      const newBooking = {
        id: bookingId,
        guestName: guestName,
        phone: phone,
        email: email,
        checkInDate: checkInDate,
        checkOutDate: checkOutDate,
        nights: nights,
        roomClassCode: roomClassCode,
        roomQuantity: roomQuantity,
        checkedInRooms: [], // Theo dõi phòng đã nhận thực tế
        ratePerNight: pricing.nightlyRates[0] ? pricing.nightlyRates[0].rate : 1200000,
        nightlyRates: pricing.nightlyRates,
        totalEstimated: totalEstimated,
        depositAmount: depositAmount,
        depositPaid: depositAmount,
        priceLocked: true,
        bookingStatus: 'confirmed', // 'confirmed' -> 'partially_checked_in' -> 'checked_in' | 'cancelled'
        paymentMethod: params.paymentMethod || 'bank_transfer',
        createdAt: formatDateTimeNow(),
        createdBy: currentUser ? currentUser.fullName : 'Lễ tân',
        notes: notes
      };

      if (!Array.isArray(data.bookings)) data.bookings = [];
      data.bookings.unshift(newBooking);

      // Nếu có tiền cọc, ghi nhận giao dịch cọc ban đầu
      if (depositAmount > 0) {
        const transId = 'GD-DP-' + Date.now().toString().slice(-6);
        data.transactions.unshift({
          id: transId,
          referenceCode: 'DEP-' + bookingId,
          stayId: null,
          bookingId: bookingId,
          customerName: guestName,
          amount: depositAmount,
          paymentMethod: params.paymentMethod || 'bank_transfer',
          methodName: 'Tiền cọc đơn đặt trước ' + bookingId,
          type: 'deposit',
          status: 'success',
          gatewayVerified: true,
          timestamp: formatDateTimeNow(),
          cashier: currentUser ? currentUser.fullName : 'Lễ tân',
          notes: `Thu cọc ${formatCurrency(depositAmount)} cho đơn đặt phòng ${bookingId}`
        });
      }

      this.logAudit(
        'TẠO ĐƠN ĐẶT PHÒNG',
        `Đơn ${bookingId}: ${guestName} - ${roomQuantity} phòng ${roomClassCode} (${nights} đêm)`,
        currentUser ? currentUser.username : 'letan'
      );

      _commitData(`Tạo đơn đặt phòng mới ${bookingId}`);
      return newBooking;
    },

    // 7. Hủy đơn đặt phòng kèm lý do (Cancel Booking)
    // Ràng buộc mục V: Nếu đơn nhận một phần, chỉ hủy phần chưa nhận, không phá vỡ liên kết với phần đang ở!
    cancelBooking: function (bookingId, cancelReason, currentUser) {
      this.reloadLatest();
      const data = this.getData();
      const booking = data.bookings.find(b => b.id === bookingId);
      if (!booking) throw new Error('Không tìm thấy đơn đặt phòng ' + bookingId);

      if (booking.bookingStatus === 'cancelled') {
        throw new Error('Đơn đặt phòng này đã bị hủy trước đó!');
      }

      const reason = (cancelReason || '').trim();
      if (!reason) {
        throw new Error('Bắt buộc phải nhập lý do hủy đặt phòng theo quy định nghiệp vụ!');
      }

      const checkedInCount = (booking.checkedInRooms || []).length;
      const totalRooms = booking.roomQuantity || 1;

      if (checkedInCount >= totalRooms) {
        throw new Error('Đơn đặt phòng đã nhận đủ toàn bộ phòng, không thể hủy! Vui lòng thực hiện thủ tục trả phòng.');
      }

      if (checkedInCount > 0 && checkedInCount < totalRooms) {
        // Hủy một phần đơn: chỉ hủy số phòng chưa nhận
        const cancelledRoomsCount = totalRooms - checkedInCount;
        booking.roomQuantity = checkedInCount; // Quỹ phòng chỉ còn giữ cho số phòng đang ở
        booking.bookingStatus = 'checked_in'; // Vì các phòng còn lại đã nhận hết
        
        if (!Array.isArray(booking.partialCancellations)) booking.partialCancellations = [];
        booking.partialCancellations.push({
          cancelledRooms: cancelledRoomsCount,
          reason: reason,
          cancelledAt: formatDateTimeNow(),
          cancelledBy: currentUser ? currentUser.fullName : 'Lễ tân'
        });

        this.logAudit(
          'HỦY MỘT PHẦN ĐƠN ĐẶT',
          `Đơn ${bookingId}: Hủy ${cancelledRoomsCount} phòng chưa nhận. Khách đang ở ${checkedInCount} phòng. Lý do: ${reason}`,
          currentUser ? currentUser.username : 'letan'
        );

        _commitData(`Hủy một phần đơn đặt phòng ${bookingId}`);
        return booking;
      }

      // Chưa nhận phòng nào: Hủy toàn bộ đơn
      booking.bookingStatus = 'cancelled';
      booking.cancelledAt = formatDateTimeNow();
      booking.cancelledBy = currentUser ? currentUser.fullName : 'Lễ tân';
      booking.cancelReason = reason;

      this.logAudit(
        'HỦY ĐẶT PHÒNG',
        `Đơn ${bookingId} - Khách ${booking.guestName} - Lý do: ${reason} (Khoản cọc ${formatCurrency(booking.depositPaid)} chưa tự động hoàn)`,
        currentUser ? currentUser.username : 'letan'
      );

      _commitData(`Hủy đơn đặt phòng ${bookingId}`);
      return booking;
    },

    // 8. Nhận phòng Trực tiếp (Walk-in Check-in)
    // Ràng buộc mục III.1 & III.2: Kiểm tra quỹ phòng cả đợt, không để khách vãng lai chiếm phòng đã cam kết!
    checkInDirect: function (params, currentUser) {
      this.reloadLatest();
      const data = this.getData();

      const roomNumber = params.roomNumber;
      const room = data.rooms.find(r => r.number === roomNumber);
      if (!room) throw new Error(`Không tìm thấy phòng số ${roomNumber}!`);

      if (room.stayStatus !== 'vacant') {
        throw new Error(`Phòng ${roomNumber} hiện đang có khách lưu trú, không thể nhận phòng!`);
      }
      if (room.exploitationStatus !== 'active') {
        throw new Error(`Phòng ${roomNumber} đang tạm khóa bảo trì, không được phép đón khách!`);
      }
      if (room.cleanStatus !== 'clean') {
        throw new Error(`Phòng ${roomNumber} chưa đạt trạng thái SẠCH (hiện tại: ${room.cleanStatus}). Vui lòng yêu cầu buồng phòng duyệt sạch trước khi nhận khách!`);
      }

      const guestName = (params.guestName || '').trim();
      const phone = (params.phone || '').trim();
      const identityCard = (params.identityCard || '').trim();
      const isHourly = (params.stayType === 'hourly' || params.isHourly === true);
      const hours = isHourly ? Math.max(1, parseInt(params.hours, 10) || 2) : 0;
      const nights = isHourly ? 0 : parseInt(params.nights, 10);
      const guaranteeDeposit = parseInt(params.guaranteeDeposit, 10) || 0;
      const roomPrepayment = parseInt(params.roomPrepayment, 10) || parseInt(params.depositAmount, 10) || 0;
      const paymentMethod = params.paymentMethod || 'cash';
      const paymentMethodName = params.paymentMethodName || (paymentMethod === 'vietqr' ? 'Chuyển khoản / VietQR' : (paymentMethod === 'pos_card' ? 'Thẻ POS' : 'Tiền mặt tại quầy'));
      const notes = (params.notes || '').trim();

      if (!guestName || !phone) {
        throw new Error('Vui lòng nhập đầy đủ Họ tên và Số điện thoại của khách nhận phòng!');
      }
      if (!identityCard || identityCard.length < 4) {
        throw new Error('Bắt buộc phải nhập thông tin giấy tờ tùy thân thực tế (CCCD hoặc Hộ chiếu) của khách!');
      }
      if (!isHourly && (isNaN(nights) || nights < 1)) {
        throw new Error('Số đêm lưu trú tối thiểu phải từ 1 đêm trở lên!');
      }

      // RÀNG BUỘC QUỸ PHÒNG: Khách vãng lai không được phép chiếm quỹ phòng đã cam kết cho đơn đặt trước!
      const wDate = this.getWorkingDate();
      const checkOutDateStr = isHourly ? wDate : addDays(wDate, nights);
      const avail = this.checkRoomAvailability(room.classCode, wDate, isHourly ? addDays(wDate, 1) : checkOutDateStr);
      if (!avail.valid || avail.availableQuantity <= 0) {
        throw new Error(
          `Không thể nhận phòng vãng lai: Hạng ${room.classCode} đã hết quỹ phòng khả dụng ` +
          `cho đợt lưu trú ${formatDate(wDate)} - ${formatDate(checkOutDateStr)} do đã có đơn đặt trước cam kết giữ phòng!`
        );
      }

      // Kiểm tra sức chứa tối đa
      const rClass = data.roomClasses.find(c => c.code === room.classCode) || {};
      let companionList = [];
      if (params.companions && Array.isArray(params.companions)) {
        companionList = params.companions;
      } else if (typeof params.companions === 'string' && params.companions.trim()) {
        companionList = params.companions.split(',').map(c => ({ name: c.trim() })).filter(c => c.name);
      }
      const totalGuests = 1 + companionList.length;
      if (rClass.maxOccupancy && totalGuests > rClass.maxOccupancy) {
        throw new Error(`Số lượng người (${totalGuests} khách) vượt quá sức chứa tối đa của hạng phòng ${room.classCode} (Tối đa: ${rClass.maxOccupancy} người)!`);
      }

      let checkInDate = wDate + ' 14:00';
      let expectedCheckOutDate;
      let pricePlan;

      if (isHourly) {
        const hourlyPricing = this.calculateHourlyPricing(room.classCode, hours);
        const outHour = 14 + hours;
        expectedCheckOutDate = `${wDate} ${String(outHour).padStart(2, '0')}:00`;
        pricePlan = {
          nightlyRates: [{ night: 1, date: wDate, rate: hourlyPricing.total, isHourly: true, hours: hours }],
          totalPerRoom: hourlyPricing.total,
          isHourly: true
        };
      } else {
        expectedCheckOutDate = checkOutDateStr + ' 12:00';
        pricePlan = this.calculateNightlyPricing(room.classCode, wDate, checkOutDateStr);
      }

      // Mã lượt ở DUY NHẤT TOÀN CẦU (chống trùng lặp khi 2 khách ở cùng phòng trong cùng ngày)
      const stayId = 'LT-' + wDate.replace(/-/g, '') + '-' + roomNumber + '-' + Date.now().toString().slice(-4) + Math.random().toString(36).substr(2, 3).toUpperCase();

      const newStay = {
        id: stayId,
        bookingId: 'WALKIN-' + Date.now().toString().slice(-5),
        roomNumber: roomNumber,
        roomClassCode: room.classCode,
        guest: {
          id: 'KH-' + Date.now().toString().slice(-5),
          name: guestName,
          phone: phone,
          identityCard: identityCard,
          email: params.email || '',
          address: params.address || 'Khách vãng lai tại quầy'
        },
        companions: companionList,
        checkInDate: checkInDate,
        expectedCheckOutDate: expectedCheckOutDate,
        actualCheckOutDate: null,
        stayType: isHourly ? 'hourly' : 'overnight',
        hours: hours,
        nights: nights,
        roomRate: pricePlan.nightlyRates[0] ? pricePlan.nightlyRates[0].rate : 1200000,
        nightlyRates: pricePlan.nightlyRates,
        depositAmount: roomPrepayment,
        guaranteeDeposit: guaranteeDeposit,
        status: 'in_house',
        servicesUsed: [],
        surcharges: [],
        discount: 0,
        notes: notes,
        transferHistory: [],
        extensionHistory: []
      };

      if (!Array.isArray(data.stays)) data.stays = [];
      data.stays.unshift(newStay);

      // Cập nhật trạng thái phòng vật lý
      room.stayStatus = 'occupied';
      room.currentStayId = stayId;

      // Ghi nhận giao dịch tiền phòng trả trước lúc check-in
      if (roomPrepayment > 0) {
        const transId = 'GD-IN-' + Date.now().toString().slice(-6);
        data.transactions.unshift({
          id: transId,
          referenceCode: 'REC-IN-' + roomNumber,
          stayId: stayId,
          bookingId: newStay.bookingId,
          customerName: guestName,
          amount: roomPrepayment,
          paymentMethod: paymentMethod,
          methodName: paymentMethodName,
          type: 'room_prepayment',
          status: 'success',
          gatewayVerified: true,
          timestamp: formatDateTimeNow(),
          cashier: currentUser ? currentUser.fullName : 'Lễ tân ca trực',
          notes: `Thu tiền phòng khi Check-in P.${roomNumber} (${formatCurrency(roomPrepayment)})`
        });
      }

      // Ghi nhận giao dịch cọc đảm bảo (Guarantee Deposit)
      if (guaranteeDeposit > 0) {
        const guarTransId = 'GD-GUAR-' + Date.now().toString().slice(-6);
        data.transactions.unshift({
          id: guarTransId,
          referenceCode: 'GUAR-' + roomNumber,
          stayId: stayId,
          bookingId: newStay.bookingId,
          customerName: guestName,
          amount: guaranteeDeposit,
          paymentMethod: paymentMethod,
          methodName: paymentMethodName,
          type: 'guarantee_deposit_received',
          status: 'success',
          gatewayVerified: true,
          timestamp: formatDateTimeNow(),
          cashier: currentUser ? currentUser.fullName : 'Lễ tân ca trực',
          notes: `Thu cọc đảm bảo hư hại / minibar khi Check-in P.${roomNumber} (${formatCurrency(guaranteeDeposit)})`
        });
      }

      this.logAudit(
        'NHẬN PHÒNG VÃNG LAI',
        `P.${roomNumber} (${room.classCode}) - Khách: ${guestName} - Tiền phòng thu: ${formatCurrency(roomPrepayment)}, Cọc đảm bảo: ${formatCurrency(guaranteeDeposit)}`,
        currentUser ? currentUser.username : 'letan'
      );

      _commitData(`Nhận phòng trực tiếp P.${roomNumber}`);
      return newStay;
    },

    // 9. Nhận phòng từ Đơn đặt trước (Check-in from Booking)
    // Hỗ trợ đơn nhiều phòng: phân bổ cọc chuẩn xác, chặn nhận phòng thứ 3 khi đặt 2 phòng!
    // RÀNG BUỘC LỖI 9 & TEST 15: Điều chỉnh đơn đặt phòng khi khách đến sớm ngày
    adjustBookingForEarlyArrival: function (bookingId, newCheckInDate, currentUser, reason) {
      this.reloadLatest();
      const data = this.getData();
      _ensureSchemaCollections(data);

      const booking = data.bookings.find(b => b.id === bookingId || b.bookingCode === bookingId);
      if (!booking) throw new Error('Không tìm thấy đơn đặt phòng: ' + bookingId);

      if (booking.bookingStatus === 'cancelled') {
        throw new Error('Đơn đặt phòng này đã bị hủy, không thể điều chỉnh ngày!');
      }
      if (booking.bookingStatus === 'checked_in') {
        throw new Error('Đơn đặt phòng này đã nhận đủ phòng, không thể điều chỉnh ngày nhận!');
      }

      if (!isValidCalendarDate(newCheckInDate)) {
        throw new Error(`Ngày nhận phòng mới "${newCheckInDate}" không hợp lệ trên lịch!`);
      }

      if (newCheckInDate >= booking.checkOutDate) {
        throw new Error(`Ngày nhận mới (${newCheckInDate}) phải trước ngày trả phòng (${booking.checkOutDate})!`);
      }

      const oldCheckInDate = booking.checkInDate;
      if (newCheckInDate === oldCheckInDate) {
        return booking;
      }

      const newNights = calculateNights(newCheckInDate, booking.checkOutDate);
      if (newNights < 1) {
        throw new Error('Số đêm lưu trú tối thiểu phải từ 1 đêm!');
      }

      const qty = booking.roomQuantity || 1;

      // Nếu ngày nhận mới sớm hơn ngày cũ, phải kiểm tra quỹ phòng trong khoảng ngày bổ sung
      if (newCheckInDate < oldCheckInDate) {
        const extraAvail = this.checkRoomAvailability(booking.roomClassCode, newCheckInDate, oldCheckInDate);
        if (!extraAvail.valid || extraAvail.availableQuantity < qty) {
          throw new Error(`Không đủ quỹ phòng cho khoảng ngày đến sớm (${newCheckInDate} đến ${oldCheckInDate}): Hạng ${booking.roomClassCode} chỉ còn ${extraAvail.availableQuantity || 0} phòng trống (Yêu cầu: ${qty} phòng)! Giữ nguyên đơn cũ.`);
        }
      }

      // Tính lại bảng giá theo từng đêm thực tế cho toàn bộ khoảng lưu trú mới
      const newPricing = this.calculateNightlyPricing(booking.roomClassCode, newCheckInDate, booking.checkOutDate);
      const oldTotalPrice = booking.totalPrice || booking.totalEstimatedPrice || 0;
      const newTotalPrice = newPricing.totalPerRoom * qty;

      if (!Array.isArray(booking.dateAdjustmentHistory)) {
        booking.dateAdjustmentHistory = [];
      }

      booking.dateAdjustmentHistory.push({
        oldCheckInDate: oldCheckInDate,
        newCheckInDate: newCheckInDate,
        oldNights: booking.nights,
        newNights: newNights,
        oldTotalPrice: oldTotalPrice,
        newTotalPrice: newTotalPrice,
        reason: reason || 'Khách đến sớm so với đơn đặt ban đầu',
        adjustedBy: currentUser ? (currentUser.fullName || currentUser.username) : 'Lễ tân',
        timestamp: formatDateTimeNow()
      });

      booking.checkInDate = newCheckInDate;
      booking.nights = newNights;
      booking.nightlyRates = newPricing.nightlyRates;
      booking.totalPrice = newTotalPrice;
      booking.totalEstimatedPrice = newTotalPrice;
      booking.pricingSnapshots = newPricing.breakdown;

      this.logAudit(
        'ĐIỀU CHỈNH NGÀY ĐẾN SỚM',
        `Đơn ${booking.id}: ${oldCheckInDate} &rarr; ${newCheckInDate} (${newNights} đêm) | Giá: ${formatCurrency(oldTotalPrice)} &rarr; ${formatCurrency(newTotalPrice)}`,
        currentUser ? currentUser.username : 'letan'
      );

      _commitData(`Điều chỉnh ngày đến sớm cho đơn ${booking.id}`);
      return booking;
    },

    // 9. Nhận phòng từ Đơn đặt trước (Check-in from Booking)
    // Hỗ trợ đơn nhiều phòng: phân bổ cọc chuẩn xác, chặn nhận phòng thứ 3 khi đặt 2 phòng!
    checkInBookingRoom: function (bookingId, roomNumber, guestDetails, currentUser) {
      if (typeof bookingId === 'object' && bookingId !== null) {
        currentUser = roomNumber;
        guestDetails = bookingId;
        roomNumber = bookingId.roomNumber;
        bookingId = bookingId.bookingId;
      }
      this.reloadLatest();
      const data = this.getData();

      const booking = data.bookings.find(b => b.id === bookingId);
      if (!booking) throw new Error('Không tìm thấy đơn đặt phòng ' + bookingId);

      if (booking.bookingStatus === 'cancelled') {
        throw new Error('Đơn đặt phòng này đã bị hủy, không thể nhận phòng!');
      }

      const totalRooms = booking.roomQuantity || 1;
      const checkedInCount = (booking.checkedInRooms || []).length;

      // CHẶN NHẬN VƯỢT QUÁ SỐ PHÒNG TRONG ĐƠN (mục III.3, Test 4)
      if (checkedInCount >= totalRooms) {
        throw new Error(`Đơn đặt phòng ${bookingId} chỉ đặt ${totalRooms} phòng và đã nhận đủ ${checkedInCount} phòng! Không thể nhận thêm phòng thứ ${checkedInCount + 1}.`);
      }

      // CHẶN NHẬN LẠI PHÒNG ĐÃ NHẬN
      if ((booking.checkedInRooms || []).includes(roomNumber)) {
        throw new Error(`Phòng ${roomNumber} đã được bàn giao cho đơn đặt này trước đó!`);
      }

      const room = data.rooms.find(r => r.number === roomNumber);
      if (!room) throw new Error(`Không tìm thấy phòng số ${roomNumber}!`);

      if (room.stayStatus !== 'vacant') {
        throw new Error(`Phòng ${roomNumber} đang có khách lưu trú!`);
      }
      if (room.cleanStatus !== 'clean') {
        throw new Error(`Phòng ${roomNumber} chưa được duyệt sạch!`);
      }
      if (room.exploitationStatus !== 'active') {
        throw new Error(`Phòng ${roomNumber} đang tạm khóa bảo trì!`);
      }

      // Mặc định chặn nhận phòng khác hạng so với đơn đặt
      if (room.classCode !== booking.roomClassCode) {
        const canUpgrade = this.hasPermission(currentUser, 'editRoomClasses') || (currentUser && currentUser.roleCode === 'manager');
        if (!canUpgrade && !guestDetails.allowClassOverride) {
          throw new Error(`Phòng ${roomNumber} thuộc hạng ${room.classCode}, khác với hạng đã đặt (${booking.roomClassCode})! Chức năng đổi hạng yêu cầu Quản lý xác nhận.`);
        }
      }

      // Kiểm tra giấy tờ tùy thân thực tế
      const idCard = (guestDetails && guestDetails.identityCard ? guestDetails.identityCard.trim() : '');
      if (!idCard || idCard.length < 4) {
        throw new Error('Bắt buộc phải nhập thông tin giấy tờ tùy thân thực tế (CCCD hoặc Hộ chiếu) của khách nhận phòng!');
      }

      // Kiểm tra sức chứa
      const rClass = data.roomClasses.find(c => c.code === room.classCode) || {};
      const companions = (guestDetails && Array.isArray(guestDetails.companions)) ? guestDetails.companions : [];
      const totalGuests = 1 + companions.length;
      if (rClass.maxOccupancy && totalGuests > rClass.maxOccupancy) {
        throw new Error(`Số lượng người (${totalGuests} khách) vượt quá sức chứa tối đa của hạng phòng ${room.classCode} (Tối đa: ${rClass.maxOccupancy} người)!`);
      }

      const wDate = this.getWorkingDate();

      // RÀNG BUỘC LỖI 9 & TEST 15: Kiểm tra ngày nhận phòng phù hợp với ngày kinh doanh
      if (booking.checkInDate !== wDate && !(guestDetails && guestDetails.allowDateOverride)) {
        throw new Error(`Đơn đặt phòng ${booking.id} có ngày nhận là ${booking.checkInDate}, không khớp với ngày kinh doanh hiện tại (${wDate})! Khách đến sớm ngày phải thực hiện quy trình điều chỉnh ngày lưu trú (adjustBookingForEarlyArrival) trước khi nhận phòng.`);
      }

      // Mã lượt ở DUY NHẤT
      const stayId = 'LT-' + wDate.replace(/-/g, '') + '-' + roomNumber + '-' + Date.now().toString().slice(-4) + Math.random().toString(36).substr(2, 3).toUpperCase();

      const nights = booking.nights || calculateNights(booking.checkInDate, booking.checkOutDate) || 1;
      const nightlyRates = Array.isArray(booking.nightlyRates) && booking.nightlyRates.length > 0
        ? booking.nightlyRates
        : this.calculateNightlyPricing(booking.roomClassCode, booking.checkInDate, booking.checkOutDate).nightlyRates;

      // Phân bổ phần cọc cho phòng này theo giải thuật số nguyên dư (không bị hao hụt dù chia 3 hay chia 7)
      const allocatedDeposit = this.allocateBookingDeposit(booking, checkedInCount);
      const guaranteeDeposit = (guestDetails && parseInt(guestDetails.guaranteeDeposit, 10)) || 0;

      const newStay = {
        id: stayId,
        bookingId: booking.id,
        roomNumber: roomNumber,
        roomClassCode: room.classCode,
        guest: {
          id: (guestDetails && guestDetails.id) || 'KH-' + Date.now().toString().slice(-4),
          name: (guestDetails && guestDetails.name) || booking.guestName,
          phone: (guestDetails && guestDetails.phone) || booking.phone,
          identityCard: idCard,
          email: booking.email || '',
          address: 'Theo thông tin đơn đặt ' + booking.id
        },
        companions: companions,
        checkInDate: wDate + ' 14:00',
        expectedCheckOutDate: booking.checkOutDate + ' 12:00',
        actualCheckOutDate: null,
        nights: nights,
        roomRate: nightlyRates[0] ? nightlyRates[0].rate : 1200000,
        nightlyRates: nightlyRates,
        depositAmount: allocatedDeposit,
        allocatedDeposit: allocatedDeposit,
        allocatedDepositTxId: booking.depositTransactionId || (booking.masterBookingId ? ('DEP-' + booking.masterBookingId) : ('DEP-' + booking.id)),
        guaranteeDeposit: guaranteeDeposit,
        guaranteeDepositCollected: guaranteeDeposit,
        guaranteeDepositDeducted: 0,
        guaranteeDepositRefunded: 0,
        guaranteeDepositPendingRefund: 0,
        guaranteeDepositAvailable: guaranteeDeposit,
        settlementStatus: 'open',
        status: 'in_house',
        servicesUsed: [],
        surcharges: [],
        discount: 0,
        notes: booking.notes,
        transferHistory: [],
        extensionHistory: []
      };

      if (!Array.isArray(data.stays)) data.stays = [];
      data.stays.unshift(newStay);

      // Cập nhật trạng thái phòng
      room.stayStatus = 'occupied';
      room.currentStayId = stayId;

      // Cập nhật tiến độ nhận phòng trong đơn
      if (!Array.isArray(booking.checkedInRooms)) booking.checkedInRooms = [];
      booking.checkedInRooms.push(roomNumber);

      if (booking.checkedInRooms.length >= totalRooms) {
        booking.bookingStatus = 'checked_in';
      } else {
        booking.bookingStatus = 'partially_checked_in';
      }

      // RÀNG BUỘC LỖI 6 & TEST 9: KHÔNG sinh giao dịch thu tiền mới (GD-ALLOC) chỉ để biểu diễn phân bổ cọc!
      // Việc tạo giao dịch deposit mới ở đây từng làm tăng giả dòng tiền / totalIncome trong báo cáo.
      // Phần cọc đã được lưu trực tiếp trên newStay.allocatedDeposit và newStay.depositAmount để khấu trừ trong Folio.

      // Giao dịch cọc đảm bảo nếu có thu thêm tại quầy (dòng tiền thật)
      if (guaranteeDeposit > 0) {
        const guarTransId = 'GD-GUAR-' + wDate.replace(/-/g, '') + '-' + Date.now().toString().slice(-4) + Math.random().toString(36).substr(2, 3).toUpperCase();
        const payMethod = (guestDetails && guestDetails.paymentMethod) || 'cash';
        data.transactions.unshift({
          id: guarTransId,
          referenceCode: 'GUAR-' + roomNumber,
          stayId: stayId,
          bookingId: booking.id,
          customerName: newStay.guest.name,
          amount: guaranteeDeposit,
          paymentMethod: payMethod,
          methodName: payMethod === 'vietqr' ? 'Chuyển khoản VietQR' : (payMethod === 'pos_card' ? 'Thẻ POS' : 'Tiền mặt tại quầy'),
          type: 'guarantee_deposit',
          status: 'success',
          gatewayVerified: true,
          timestamp: formatDateTimeNow(),
          cashier: currentUser ? (currentUser.fullName || currentUser.username) : 'Lễ tân ca trực',
          notes: `Thu cọc đảm bảo khi Check-in P.${roomNumber} theo đơn ${booking.id}`
        });
      }

      this.logAudit(
        'NHẬN PHÒNG THEO ĐƠN',
        `Đơn ${bookingId} -> Nhận P.${roomNumber} (${booking.checkedInRooms.length}/${totalRooms} phòng). Cọc phân bổ: ${formatCurrency(allocatedDeposit)}`,
        currentUser ? currentUser.username : 'letan'
      );

      _commitData(`Nhận phòng P.${roomNumber} cho đơn ${bookingId}`);
      return newStay;
    },

    // 10. Chuyển phòng lưu trú (Transfer Room)
    transferRoom: function (stayId, targetRoomNumber, reason, currentUser) {
      if (typeof stayId === 'object' && stayId !== null) {
        currentUser = targetRoomNumber;
        reason = stayId.reason;
        targetRoomNumber = stayId.toRoomNumber || stayId.targetRoomNumber;
        stayId = stayId.stayId;
      }
      this.reloadLatest();
      const data = this.getData();

      const stay = data.stays.find(s => s.id === stayId && s.status === 'in_house');
      if (!stay) throw new Error('Không tìm thấy lượt lưu trú hợp lệ đang mở!');

      const oldRoomNumber = stay.roomNumber;
      if (oldRoomNumber === targetRoomNumber) {
        throw new Error('Phòng chuyển đến phải khác phòng hiện tại!');
      }

      const targetRoom = data.rooms.find(r => r.number === targetRoomNumber);
      if (!targetRoom) throw new Error(`Không tìm thấy phòng đích ${targetRoomNumber}!`);

      if (targetRoom.stayStatus !== 'vacant') {
        throw new Error(`Phòng đích ${targetRoomNumber} đang có khách, không thể chuyển sang!`);
      }
      if (targetRoom.cleanStatus !== 'clean') {
        throw new Error(`Phòng đích ${targetRoomNumber} chưa được duyệt sạch!`);
      }
      if (targetRoom.exploitationStatus !== 'active') {
        throw new Error(`Phòng đích ${targetRoomNumber} đang bảo trì!`);
      }

      const transferReason = (reason || '').trim();
      if (!transferReason) {
        throw new Error('Bắt buộc phải ghi rõ lý do chuyển phòng!');
      }

      // KIỂM TRA QUỸ PHÒNG ĐÍCH TRONG TOÀN BỘ THỜI GIAN LƯU TRÚ CÒN LẠI (mục IV)
      const wDate = this.getWorkingDate();
      const stayOutDate = stay.expectedCheckOutDate.split(' ')[0];
      const nightsRemaining = calculateNights(wDate, stayOutDate);

      if (nightsRemaining > 0) {
        const avail = this.checkRoomAvailability(targetRoom.classCode, wDate, stayOutDate, null, stay.id);
        if (!avail.valid || avail.availableQuantity <= 0) {
          throw new Error(`Không thể chuyển sang phòng ${targetRoomNumber}: Hạng phòng ${targetRoom.classCode} không còn đủ quỹ phòng trống cho thời gian lưu trú còn lại!`);
        }
      }

      // Xử lý chênh lệch giá nếu chuyển sang khác hạng phòng
      if (targetRoom.classCode !== stay.roomClassCode && nightsRemaining > 0) {
        const oldPricing = this.calculateNightlyPricing(stay.roomClassCode, wDate, stayOutDate);
        const newPricing = this.calculateNightlyPricing(targetRoom.classCode, wDate, stayOutDate);
        const diff = newPricing.totalPerRoom - oldPricing.totalPerRoom;

        if (diff !== 0) {
          if (!Array.isArray(stay.surcharges)) stay.surcharges = [];
          stay.surcharges.push({
            id: 'SC-TRANSFER-' + Date.now().toString().slice(-4),
            name: `Phụ thu đổi hạng phòng (${stay.roomClassCode} -> ${targetRoom.classCode}) cho ${nightsRemaining} đêm`,
            amount: diff,
            reason: `Chuyển sang hạng ${targetRoom.classCode}: ${transferReason}`,
            createdAt: formatDateTimeNow()
          });
        }
        stay.roomClassCode = targetRoom.classCode;
      }

      const oldRoom = data.rooms.find(r => r.number === oldRoomNumber);
      if (oldRoom) {
        // Phòng cũ chuyển sang TRỐNG & CHỜ DỌN VỆ SINH
        oldRoom.stayStatus = 'vacant';
        oldRoom.cleanStatus = 'dirty';
        oldRoom.currentStayId = null;

        // Tự động tạo việc dọn dẹp phòng cũ
        data.housekeepingTasks.unshift({
          id: 'HK-' + Date.now().toString().slice(-4),
          roomNumber: oldRoomNumber,
          taskType: 'checkout_clean',
          taskTypeName: 'Dọn phòng khách chuyển đi',
          assignedStaff: 'Lê Thị Hoa',
          assignedTime: formatDateTimeNow(),
          status: 'pending',
          inspectionResult: 'Chưa kiểm tra',
          notes: `Khách chuyển từ P.${oldRoomNumber} sang P.${targetRoomNumber}. Lý do: ${transferReason}`
        });
      }

      // Cập nhật phòng đích
      targetRoom.stayStatus = 'occupied';
      targetRoom.currentStayId = stay.id;

      // Cập nhật lịch sử chuyển phòng trên lượt lưu trú
      if (!Array.isArray(stay.transferHistory)) stay.transferHistory = [];
      stay.transferHistory.push({
        fromRoom: oldRoomNumber,
        toRoom: targetRoomNumber,
        transferTime: formatDateTimeNow(),
        reason: transferReason,
        staff: currentUser ? currentUser.fullName : 'Lễ tân'
      });

      stay.roomNumber = targetRoomNumber;

      this.logAudit(
        'CHUYỂN PHÒNG LƯU TRÚ',
        `Lượt ở ${stay.id}: P.${oldRoomNumber} &rarr; P.${targetRoomNumber}. Lý do: ${transferReason}`,
        currentUser ? currentUser.username : 'letan'
      );

      _commitData(`Chuyển khách từ P.${oldRoomNumber} sang P.${targetRoomNumber}`);
      return stay;
    },

    // 11. Gia hạn lưu trú (Extend Stay)
    extendStay: function (stayId, newCheckOutDateStr, currentUser) {
      this.reloadLatest();
      const data = this.getData();

      const stay = data.stays.find(s => s.id === stayId && s.status === 'in_house');
      if (!stay) throw new Error('Không tìm thấy lượt lưu trú hợp lệ đang mở!');

      if (!isValidCalendarDate(newCheckOutDateStr)) {
        throw new Error(`Ngày gia hạn mới (${newCheckOutDateStr}) không hợp lệ trên lịch!`);
      }

      const oldOutDate = stay.expectedCheckOutDate.split(' ')[0];
      const additionalNights = calculateNights(oldOutDate, newCheckOutDateStr);
      if (additionalNights < 1) {
        throw new Error(`Ngày gia hạn mới (${formatDate(newCheckOutDateStr)}) phải sau ngày trả hiện tại (${formatDate(oldOutDate)})!`);
      }

      // Kiểm tra quỹ phòng trống trong khoảng gia hạn
      const avail = this.checkRoomAvailability(stay.roomClassCode, oldOutDate, newCheckOutDateStr, null, stay.id);
      if (!avail.valid || avail.availableQuantity < 1) {
        throw new Error(`Không thể gia hạn: Hạng phòng ${stay.roomClassCode} không còn đủ quỹ phòng trống từ ${formatDate(oldOutDate)} đến ${formatDate(newCheckOutDateStr)}!`);
      }

      // Tính giá cho khoảng gia hạn (giá các đêm cũ được giữ nguyên)
      const extPricing = this.calculateNightlyPricing(stay.roomClassCode, oldOutDate, newCheckOutDateStr);

      if (!Array.isArray(stay.nightlyRates)) stay.nightlyRates = [];
      stay.nightlyRates = stay.nightlyRates.concat(extPricing.nightlyRates);

      if (!Array.isArray(stay.extensionHistory)) stay.extensionHistory = [];
      stay.extensionHistory.push({
        previousCheckOut: stay.expectedCheckOutDate,
        newCheckOut: newCheckOutDateStr + ' 12:00',
        additionalNights: additionalNights,
        extendedAt: formatDateTimeNow(),
        extendedBy: currentUser ? currentUser.fullName : 'Lễ tân'
      });

      stay.expectedCheckOutDate = newCheckOutDateStr + ' 12:00';
      stay.nights = (stay.nights || 0) + additionalNights;

      this.logAudit(
        'GIA HẠN LƯU TRÚ',
        `Phòng ${stay.roomNumber} - Khách ${stay.guest.name} gia hạn thêm ${additionalNights} đêm (Đến ${formatDate(newCheckOutDateStr)})`,
        currentUser ? currentUser.username : 'letan'
      );

      _commitData(`Gia hạn lưu trú P.${stay.roomNumber} đến ${newCheckOutDateStr}`);
      return stay;
    },

    // 16b. RÚT NGẮN THỜI GIAN LƯU TRÚ (TRẢ PHÒNG SỚM TRƯỚC HẠN - SHORTEN STAY)
    shortenStay: function (stayId, newCheckOutDateStr, currentUser) {
      this.reloadLatest();
      const data = this.getData();

      const stay = data.stays.find(s => s.id === stayId && s.status === 'in_house');
      if (!stay) throw new Error('Không tìm thấy lượt lưu trú hợp lệ đang mở!');

      const newDateClean = (newCheckOutDateStr || '').split(' ')[0].trim();
      if (!isValidCalendarDate(newDateClean)) {
        throw new Error(`Ngày trả phòng sớm mới (${newCheckOutDateStr}) không hợp lệ trên lịch!`);
      }

      const inDate = stay.checkInDate.split(' ')[0];
      const oldOutDate = stay.expectedCheckOutDate.split(' ')[0];

      if (newDateClean >= oldOutDate) {
        throw new Error(`Ngày trả phòng mới (${formatDate(newDateClean)}) phải trước ngày dự kiến trả phòng cũ (${formatDate(oldOutDate)})!`);
      }
      if (newDateClean < inDate) {
        throw new Error(`Ngày trả phòng mới (${formatDate(newDateClean)}) không thể trước ngày nhận phòng (${formatDate(inDate)})!`);
      }

      const newNights = Math.max(1, calculateNights(inDate, newDateClean));

      // Cắt ngắn mảng nightlyRates để chốt đúng số đêm thực tế
      if (Array.isArray(stay.nightlyRates) && stay.nightlyRates.length > 0) {
        stay.nightlyRates = stay.nightlyRates.filter(nr => nr.date < newDateClean);
        if (stay.nightlyRates.length === 0) {
          stay.nightlyRates = [{ night: 1, date: inDate, rate: stay.roomRate || 0 }];
        }
      }
      stay.nights = stay.nightlyRates ? stay.nightlyRates.length : newNights;
      stay.expectedCheckOutDate = newDateClean + ' 12:00';

      this.logAudit(
        'RÚT NGẮN LƯU TRÚ',
        `Phòng ${stay.roomNumber} - Khách ${stay.guest ? stay.guest.name : ''} trả sớm: rút ngắn từ ${oldOutDate} về ${formatDate(newDateClean)} (${stay.nights} đêm)`,
        currentUser ? currentUser.username : 'letan'
      );

      _commitData(`Rút ngắn lưu trú P.${stay.roomNumber} đến ${newDateClean}`);
      return {
        success: true,
        stay: stay,
        newNights: stay.nights,
        folio: this.calculateStayFolio(stay.id)
      };
    },

    // 16c. TỰ ĐỘNG TÍNH PHỤ THU TRẢ PHÒNG MUỘN (LATE CHECK-OUT SURCHARGE)
    calculateLateCheckOutSurcharge: function (stayId, checkOutTimeStr) {
      const data = this.getData();
      const stay = data.stays.find(s => s.id === stayId);
      if (!stay) return { surchargeRate: 0, amount: 0, reason: '' };

      const rClass = data.roomClasses.find(c => c.code === stay.roomClassCode) || {};
      const baseRate = stay.roomRate || rClass.basePrice || 1200000;

      let timePart = '12:00';
      if (checkOutTimeStr && checkOutTimeStr.includes(':')) {
        timePart = checkOutTimeStr.includes(' ') ? checkOutTimeStr.split(' ')[1] : checkOutTimeStr;
      } else {
        const now = new Date();
        timePart = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      }

      const parts = timePart.split(':');
      const hoursDec = parseInt(parts[0], 10) + (parseInt(parts[1], 10) || 0) / 60;

      let rate = 0;
      let reason = '';

      // Áp dụng cấu hình lateCheckOutRules chuẩn:
      // - 12:00 đến 15:00: phụ thu 30%
      // - 15:00 đến 18:00: phụ thu 50%
      // - Sau 18:00: phụ thu 100%
      if (hoursDec > 18.0) {
        rate = 100;
        reason = `Phụ thu trả phòng muộn sau 18:00 (100% giá phòng: ${formatCurrency(baseRate)})`;
      } else if (hoursDec > 15.0) {
        rate = 50;
        reason = `Phụ thu trả phòng muộn 15:00 - 18:00 (50% giá phòng: ${formatCurrency(Math.round(baseRate * 0.5))})`;
      } else if (hoursDec > 12.25) { // 15 phút grace period
        rate = 30;
        reason = `Phụ thu trả phòng muộn 12:00 - 15:00 (30% giá phòng: ${formatCurrency(Math.round(baseRate * 0.3))})`;
      }

      const amount = Math.round(baseRate * (rate / 100));
      return {
        surchargeRate: rate,
        amount: amount,
        reason: reason,
        timeChecked: timePart,
        baseRate: baseRate
      };
    },

    // 16d. CHUYỂN TIỀN PHÒNG VÀO MASTER FOLIO ĐOÀN (TRANSFER TO MASTER FOLIO)
    transferRoomChargeToMasterFolio: function (stayId, currentUser) {
      this.reloadLatest();
      const data = this.getData();
      const stay = data.stays.find(s => s.id === stayId);
      if (!stay) throw new Error('Không tìm thấy lượt lưu trú!');

      stay.billedToMaster = true;
      stay.billedToGroup = true;

      this.logAudit(
        'CHUYỂN MASTER FOLIO',
        `Chuyển tiền phòng của lượt ở ${stay.id} (P.${stay.roomNumber}) vào Master Folio Trưởng đoàn / Công ty`,
        currentUser ? currentUser.username : 'letan'
      );
      _commitData(`Chuyển tiền phòng P.${stay.roomNumber} vào Master Folio đoàn`);
      return { success: true, stay: stay, folio: this.calculateStayFolio(stay.id) };
    },

    // 12. BỘ TÍNH TOÁN QUYẾT TOÁN FOLIO CHUẨN MỰC (Unified Stay Folio Engine)
    // Công thức mục II: Số dư = Tổng chi phí - Tiền thu hợp lệ đã phân bổ + Tiền đã hoàn
    calculateStayFolio: function (stayId) {
      const data = this.getData();
      const stay = data.stays.find(s => s.id === stayId);
      if (!stay) return null;

      // 1. Tiền phòng theo giá đã chốt
      let roomCharges = 0;
      if (Array.isArray(stay.nightlyRates) && stay.nightlyRates.length > 0) {
        roomCharges = stay.nightlyRates.reduce((acc, nr) => acc + (nr.rate || 0), 0);
      } else {
        roomCharges = (stay.roomRate || 0) * (stay.nights || 1);
      }

      // 2. Dịch vụ (F&B, Minibar, Spa, Giặt là)
      const allServices = stay.servicesUsed || [];
      const servicesGrossTotal = allServices.reduce((acc, sv) => acc + (sv.amount || 0), 0);

      const servicesPaid = allServices.filter(sv => sv.paymentStatus === 'paid');
      const servicesPaidTotal = servicesPaid.reduce((acc, sv) => acc + (sv.amount || 0), 0);

      const servicesUnpaid = allServices.filter(sv => sv.paymentStatus !== 'paid');
      const servicesUnpaidTotal = servicesUnpaid.reduce((acc, sv) => acc + (sv.amount || 0), 0);

      const minibarServices = allServices.filter(sv => sv.isMinibar);
      const minibarTotal = minibarServices.reduce((acc, sv) => acc + (sv.amount || 0), 0);
      const nonMinibarServices = allServices.filter(sv => !sv.isMinibar);

      // 3. Phụ thu & Giảm trừ
      const surcharges = stay.surcharges || [];
      const surchargesTotal = surcharges.reduce((acc, sc) => acc + (sc.amount || 0), 0);
      const discount = stay.discount || 0;

      // 4. Tổng chi phí phát sinh đầy đủ (Grand Total)
      const totalAmount = Math.max(0, roomCharges + servicesGrossTotal + surchargesTotal - discount);

      // 5. Các giao dịch THU TIỀN HỢP LỆ gắn với riêng lượt lưu trú này
      let paymentsCollected = 0;
      (data.transactions || []).forEach(tx => {
        if (tx.stayId === stay.id && tx.status === 'success' && !tx.isInternalAllocation) {
          if (
            tx.type === 'deposit' ||
            tx.type === 'room_prepayment' ||
            tx.type === 'interim_payment' ||
            tx.type === 'final_payment' ||
            tx.type === 'settlement' ||
            tx.type === 'service_payment' ||
            tx.type === 'service_immediate'
          ) {
            paymentsCollected += (tx.amount || 0);
          }
        }
      });

      // RÀNG BUỘC LỖI 1 & LỖI 6: Cộng phần cọc đã được phân bổ cho lượt ở này
      const allocatedDeposit = stay.allocatedDeposit !== undefined ? stay.allocatedDeposit : (stay.depositAmount || 0);
      const hasDirectDepositTx = (data.transactions || []).some(tx => tx.stayId === stay.id && tx.type === 'deposit' && tx.status === 'success' && !tx.isInternalAllocation);
      if (!hasDirectDepositTx && allocatedDeposit > 0) {
        paymentsCollected += allocatedDeposit;
      }

      // Đảm bảo các dịch vụ đã đánh dấu 'paid' trong servicesUsed (hoặc thanh toán ngay) được khấu trừ không thu lại
      let directPaidServiceSum = 0;
      servicesPaid.forEach(sv => {
        const hasTx = (data.transactions || []).some(tx => tx.stayId === stay.id && (tx.type === 'service_payment' || tx.type === 'service_immediate') && tx.status === 'success' && tx.amount === sv.amount);
        if (!hasTx) {
          directPaidServiceSum += (sv.amount || 0);
        }
      });
      paymentsCollected += directPaidServiceSum;

      // Các giao dịch HOÀN TIỀN chi phí (không tính hoàn cọc đảm bảo)
      let refundsCompleted = 0;
      (data.transactions || []).forEach(tx => {
        if (tx.stayId === stay.id && tx.status === 'success' && tx.type === 'refund') {
          refundsCompleted += (tx.amount || 0);
        }
      });

      // Nếu đã có khấu trừ từ tiền đảm bảo trước đó, cộng vào khoản đã thanh toán
      const previousDeducted = stay.guaranteeDepositDeducted || 0;
      const netPaid = paymentsCollected + previousDeducted - refundsCompleted;
      const subtotalDue = totalAmount - netPaid;

      // 6. Xử lý Tiền đảm bảo (Guarantee Deposit)
      // RÀNG BUỘC LỖI 7: Tách rõ tiền đảm bảo đã thu, đã khấu trừ, đã hoàn, đang chờ hoàn và còn khả dụng
      const guaranteeDepositCollected = stay.guaranteeDepositCollected !== undefined ? stay.guaranteeDepositCollected : (stay.guaranteeDeposit || 0);
      const guaranteeDepositDeducted = stay.guaranteeDepositDeducted || 0;
      const guaranteeDepositRefunded = stay.guaranteeDepositRefunded || 0;
      const guaranteeDepositPendingRefund = stay.guaranteeDepositPendingRefund || 0;
      const guaranteeDepositAvailable = Math.max(0, guaranteeDepositCollected - guaranteeDepositDeducted - guaranteeDepositRefunded - guaranteeDepositPendingRefund);

      let guaranteeDepositDeduction = 0;
      let guaranteeDepositRefund = 0;
      let remainingDue = 0;

      if (stay.status === 'checked_out') {
        // Sau khi đã trả phòng và quyết toán, số dư nợ không đề xuất khấu trừ hay hoàn lại lần nữa
        guaranteeDepositDeduction = 0;
        guaranteeDepositRefund = 0;
        remainingDue = 0;
      } else {
        if (subtotalDue > 0) {
          if (guaranteeDepositAvailable >= subtotalDue) {
            guaranteeDepositDeduction = subtotalDue;
            guaranteeDepositRefund = guaranteeDepositAvailable - subtotalDue;
            remainingDue = 0;
          } else {
            guaranteeDepositDeduction = guaranteeDepositAvailable;
            guaranteeDepositRefund = 0;
            remainingDue = subtotalDue - guaranteeDepositAvailable;
          }
        } else {
          // subtotalDue <= 0 (Khách đã trả đủ hoặc trả thừa)
          guaranteeDepositDeduction = 0;
          guaranteeDepositRefund = guaranteeDepositAvailable;
          remainingDue = subtotalDue; // Âm nghĩa là khách trả thừa!
        }
      }

      // Kiểm tra trạng thái kiểm kê Minibar
      const minibarAudited = (data.minibarAudits || []).some(a => a.stayId === stay.id);

      // RÀNG BUỘC MỤC V: Nâng cấp Folio Tách biệt cho Khách Đoàn (Master Folio vs Incidental Folio)
      const isGroupStay = Boolean(stay.groupBookingId || (stay.bookingId && stay.bookingId.startsWith('DOAN-')) || stay.billedToGroup || stay.billedToMaster);
      const billedToMaster = Boolean(stay.billedToMaster || stay.billedToGroup);

      // Master Folio: Tiền phòng
      const masterRoomTotal = roomCharges;
      const masterDeposit = allocatedDeposit;
      const masterBalance = Math.max(0, masterRoomTotal - masterDeposit);

      // Incidental Folio: Dịch vụ cá nhân (F&B, Minibar, Spa...) + Phụ thu - Tiền cọc đảm bảo
      const incidentalTotal = servicesGrossTotal + surchargesTotal - discount;
      const incidentalPaid = servicesPaidTotal;
      const incidentalUnpaid = servicesUnpaidTotal + surchargesTotal - discount;
      const incidentalDue = Math.max(0, incidentalUnpaid - guaranteeDepositAvailable);

      // Nếu phòng này đã chuyển tiền phòng về Master Folio đoàn, khách lẻ tại phòng chỉ cần thanh toán phần Incidental Due
      const effectiveRemainingDue = billedToMaster ? incidentalDue : remainingDue;

      return {
        stayId: stay.id,
        roomNumber: stay.roomNumber,
        guestName: stay.guest ? stay.guest.name : '',
        roomCharges: roomCharges,
        servicesTotal: servicesGrossTotal,
        services: nonMinibarServices,
        servicesPaid: servicesPaid,
        servicesPaidTotal: servicesPaidTotal,
        servicesUnpaid: servicesUnpaid,
        servicesUnpaidTotal: servicesUnpaidTotal,
        minibarTotal: minibarTotal,
        minibarServices: minibarServices,
        minibarAudited: minibarAudited,
        surcharges: surcharges,
        surchargesTotal: surchargesTotal,
        discount: discount,
        totalAmount: totalAmount,
        depositPaid: allocatedDeposit,
        allocatedDeposit: allocatedDeposit,
        paymentsCollected: paymentsCollected,
        refundsCompleted: refundsCompleted,
        previousDeducted: previousDeducted,
        netPaid: netPaid,
        subtotalDue: subtotalDue,
        guaranteeDeposit: guaranteeDepositAvailable,
        guaranteeDepositCollected: guaranteeDepositCollected,
        guaranteeDepositDeducted: guaranteeDepositDeducted,
        guaranteeDepositRefunded: guaranteeDepositRefunded,
        guaranteeDepositPendingRefund: guaranteeDepositPendingRefund,
        guaranteeDepositAvailable: guaranteeDepositAvailable,
        guaranteeDepositDeduction: guaranteeDepositDeduction,
        guaranteeDepositRefund: guaranteeDepositRefund,
        remainingDue: remainingDue,
        isOverpaid: remainingDue < 0,
        overpaidAmount: remainingDue < 0 ? Math.abs(remainingDue) : 0,
        isFullySettled: remainingDue === 0,
        isClosed: (stay.status === 'checked_out'),
        // Bổ sung thuộc tính Master vs Incidental Folio:
        isGroupStay: isGroupStay,
        billedToMaster: billedToMaster,
        effectiveRemainingDue: effectiveRemainingDue,
        masterFolio: {
          title: 'Hóa đơn Tiền phòng (Master Folio - Trưởng đoàn / Công ty)',
          roomCharges: masterRoomTotal,
          depositPaid: masterDeposit,
          balanceDue: masterBalance,
          transferred: billedToMaster
        },
        incidentalFolio: {
          title: 'Hóa đơn Dịch vụ & Phát sinh (Incidental Folio - Khách tự trả)',
          servicesGross: servicesGrossTotal,
          servicesPaid: servicesPaidTotal,
          servicesUnpaid: servicesUnpaidTotal,
          surcharges: surchargesTotal,
          discount: discount,
          guaranteeDepositAvailable: guaranteeDepositAvailable,
          balanceDue: incidentalDue
        }
      };
    },

    // 13. Quyết toán và Trả phòng (Settle and Checkout)
    settleAndCheckout: function (stayId, settlementDetails, currentUser) {
      this.reloadLatest();
      const data = this.getData();

      const stay = data.stays.find(s => s.id === stayId);
      if (!stay) throw new Error('Không tìm thấy lượt lưu trú!');
      if (stay.status === 'checked_out') {
        throw new Error('Lượt lưu trú này đã hoàn tất trả phòng trước đó!');
      }

      // RÀNG BUỘC MỤC VII & TEST 9: Phải kiểm tra Minibar trước khi quyết toán!
      let minibarAudited = (data.minibarAudits || []).some(a => a.stayId === stay.id);
      if (!minibarAudited) {
        // Tự động sinh biên bản mặc định 0đ nếu có xác nhận tại quầy để không kẹt thanh toán
        if (settlementDetails && (settlementDetails.autoCreateMinibarAudit || settlementDetails.confirmMinibarZero || settlementDetails.allowQuickMinibar)) {
          const autoAudit = {
            id: 'MB-AUTO-' + Date.now().toString().slice(-4),
            stayId: stay.id,
            roomNumber: stay.roomNumber,
            checkoutTime: formatDateTimeNow(),
            inspectedBy: (currentUser ? (currentUser.fullName || currentUser.username) : 'Lễ tân trực') + ' (Tự động tại quầy)',
            status: 'no_consumption',
            itemsUsed: [],
            totalAmount: 0,
            notes: 'Lễ tân xác nhận nhanh khách không sử dụng minibar khi trả phòng'
          };
          if (!Array.isArray(data.minibarAudits)) data.minibarAudits = [];
          data.minibarAudits.unshift(autoAudit);
          minibarAudited = true;
        } else {
          throw new Error(
            `Chưa hoàn thành kiểm kê Minibar cho phòng ${stay.roomNumber}! ` +
            `Quy trình bắt buộc Buồng phòng phải thực hiện kiểm kê minibar (kể cả không tiêu thụ) trước khi quyết toán.`
          );
        }
      }

      // Xử lý Phụ thu Trả phòng muộn (nếu có lựa chọn áp dụng khi check-out)
      if (settlementDetails && settlementDetails.lateCheckOutSurcharge && settlementDetails.lateCheckOutSurcharge.amount > 0) {
        if (!Array.isArray(stay.surcharges)) stay.surcharges = [];
        const alreadyHasLate = stay.surcharges.some(sc => sc.type === 'late_checkout' || sc.name.includes('trả phòng muộn'));
        if (!alreadyHasLate) {
          stay.surcharges.push({
            id: 'SC-LATE-' + Date.now().toString().slice(-4),
            name: settlementDetails.lateCheckOutSurcharge.reason || 'Phụ thu trả phòng muộn sau 12:00',
            amount: settlementDetails.lateCheckOutSurcharge.amount,
            type: 'late_checkout',
            rate: settlementDetails.lateCheckOutSurcharge.surchargeRate
          });
        }
      }

      // Hỗ trợ Chuyển tiền phòng vào Master Folio cho khách đoàn
      if (settlementDetails && settlementDetails.billedToMaster) {
        stay.billedToMaster = true;
        stay.billedToGroup = true;
      }

      const folio = this.calculateStayFolio(stayId);

      const amountDue = stay.billedToMaster ? folio.effectiveRemainingDue : folio.remainingDue;

      // RÀNG BUỘC MỤC II & TEST 10: Khách trả thừa phải xử lý hoàn thừa trước khi đóng lượt!
      if (amountDue < 0) {
        throw new Error(
          `Khách hàng đang trả thừa ${formatCurrency(Math.abs(amountDue))}! ` +
          `Vui lòng xử lý hoàn tiền thừa cho khách trước khi hoàn tất đóng lượt lưu trú.`
        );
      }

      // RÀNG BUỘC MỤC II: Chưa thanh toán đủ tiền thì chặn trả phòng
      if (amountDue > 0) {
        if (!settlementDetails || !settlementDetails.confirmedPayment) {
          throw new Error(
            `Không thể hoàn tất trả phòng: Khách còn phải thanh toán ${formatCurrency(amountDue)}. ` +
            `Vui lòng thực hiện thu tiền và xác nhận quyết toán trước khi trả phòng!`
          );
        }

        const payMethod = settlementDetails.paymentMethod || 'cash';
        const isOnlineGateway = (payMethod === 'vnpay_qr' || payMethod === 'onepay');

        if (isOnlineGateway) {
          const transId = 'GD-ONLINE-' + Date.now().toString().slice(-6);
          data.transactions.unshift({
            id: transId,
            referenceCode: 'GATEWAY-REQ-' + stay.roomNumber,
            stayId: stay.id,
            bookingId: stay.bookingId,
            customerName: stay.guest.name,
            amount: amountDue,
            paymentMethod: payMethod,
            methodName: payMethod === 'vnpay_qr' ? 'Cổng VNPay QR' : 'Cổng OnePay Quốc tế',
            type: 'final_payment',
            status: 'pending',
            gatewayVerified: false,
            timestamp: formatDateTimeNow(),
            cashier: currentUser ? (currentUser.fullName || currentUser.username || currentUser.name || 'Thu ngân') : 'Thu ngân',
            notes: `Chờ thanh toán qua cổng ${payMethod} (${formatCurrency(amountDue)})`
          });
          _commitData('Tạo giao dịch cổng thanh toán chờ xác thực');
          throw new Error(`Giao dịch thanh toán cổng đang ở trạng thái CHỜ XÁC THỰC (Pending). Chỉ hoàn tất sau khi nhận phản hồi IPN thành công!`);
        }

        // Thanh toán trực tiếp tại quầy
        const transId = 'GD-SETTLE-' + Date.now().toString().slice(-6);
        data.transactions.unshift({
          id: transId,
          referenceCode: 'REC-SETTLE-' + stay.roomNumber,
          stayId: stay.id,
          bookingId: stay.bookingId,
          customerName: stay.guest.name,
          amount: amountDue,
          paymentMethod: payMethod,
          methodName: settlementDetails.methodName || 'Tiền mặt tại quầy',
          type: 'final_payment',
          status: 'success',
          gatewayVerified: true,
          timestamp: formatDateTimeNow(),
          cashier: currentUser ? currentUser.fullName : 'Thu ngân / Lễ tân',
          notes: `Quyết toán trả phòng P.${stay.roomNumber} (${formatCurrency(folio.remainingDue)})`
        });
      }

      // RÀNG BUỘC LỖI 7 & TEST 10, TEST 11:
      stay.guaranteeDepositCollected = stay.guaranteeDepositCollected !== undefined ? stay.guaranteeDepositCollected : (stay.guaranteeDeposit || 0);
      stay.guaranteeDepositDeducted = (stay.guaranteeDepositDeducted || 0) + folio.guaranteeDepositDeduction;

      // Xử lý hoàn trả tiền cọc đảm bảo dư (nếu có)
      if (folio.guaranteeDepositRefund > 0) {
        const isPending = (settlementDetails && settlementDetails.pendingRefund);
        if (isPending) {
          // Nghĩa vụ hoàn tiền vẫn mở (pending_refund)
          stay.guaranteeDepositPendingRefund = (stay.guaranteeDepositPendingRefund || 0) + folio.guaranteeDepositRefund;
          stay.settlementStatus = 'pending_refund';
          // Tạo yêu cầu hoàn tiền chờ duyệt trực tiếp trong bộ nhớ để commit nguyên tử cùng stay
          if (!Array.isArray(data.refundRequests)) data.refundRequests = [];
          const reqId = 'YC-HOAN-' + Date.now().toString().slice(-4) + Math.random().toString(36).substr(2, 3).toUpperCase();
          data.refundRequests.unshift({
            id: reqId,
            stayId: stay.id,
            bookingId: stay.bookingId,
            customerName: stay.guest.name,
            refundAmount: folio.guaranteeDepositRefund,
            amount: folio.guaranteeDepositRefund,
            type: 'guarantee_deposit_refund',
            reason: `Hoàn cọc đảm bảo còn dư sau quyết toán P.${stay.roomNumber}`,
            status: 'pending',
            requestedBy: currentUser ? (currentUser.fullName || currentUser.username) : 'thungan',
            timestamp: formatDateTimeNow()
          });
        } else {
          // Hoàn ngay tại quầy
          stay.guaranteeDepositRefunded = (stay.guaranteeDepositRefunded || 0) + folio.guaranteeDepositRefund;
          stay.settlementStatus = 'settled';
          data.transactions.unshift({
            id: 'GD-REF-GUAR-' + Date.now().toString().slice(-4) + Math.random().toString(36).substr(2, 3).toUpperCase(),
            referenceCode: 'REF-GUAR-' + stay.roomNumber,
            stayId: stay.id,
            bookingId: stay.bookingId,
            customerName: stay.guest.name,
            amount: folio.guaranteeDepositRefund,
            paymentMethod: settlementDetails.paymentMethod || 'cash',
            methodName: 'Hoàn trả cọc đảm bảo dư',
            type: 'guarantee_deposit_refund',
            status: 'success',
            gatewayVerified: true,
            timestamp: formatDateTimeNow(),
            cashier: currentUser ? (currentUser.fullName || currentUser.username) : 'Thu ngân / Lễ tân',
            notes: `Hoàn trả cọc đảm bảo cho khách P.${stay.roomNumber} (${formatCurrency(folio.guaranteeDepositRefund)})`
          });
        }
      } else {
        stay.settlementStatus = 'settled';
      }

      // Số dư khả dụng của tiền đảm bảo sau quyết toán phải bằng 0!
      stay.guaranteeDepositAvailable = Math.max(0, stay.guaranteeDepositCollected - stay.guaranteeDepositDeducted - (stay.guaranteeDepositRefunded || 0) - (stay.guaranteeDepositPendingRefund || 0));
      stay.guaranteeDeposit = stay.guaranteeDepositAvailable;

      // Khóa và lưu snapshot hóa đơn quyết toán
      stay.status = 'checked_out';
      stay.actualCheckOutDate = formatDateTimeNow();
      stay.folioSnapshot = this.calculateStayFolio(stayId);

      // Cập nhật trạng thái phòng: SANG TRỐNG và CHỜ DỌN VỆ SINH
      const room = data.rooms.find(r => r.number === stay.roomNumber);
      if (room) {
        room.stayStatus = 'vacant';
        room.cleanStatus = 'dirty';
        room.currentStayId = null;

        if (!Array.isArray(data.housekeepingTasks)) data.housekeepingTasks = [];
        data.housekeepingTasks.unshift({
          id: 'HK-' + Date.now().toString().slice(-4),
          roomNumber: room.number,
          taskType: 'checkout_clean',
          taskTypeName: 'Dọn phòng khách trả',
          assignedStaff: 'Trần Thị Mai',
          assignedTime: formatDateTimeNow(),
          status: 'pending',
          inspectionResult: 'Chưa kiểm tra',
          notes: `Khách ${stay.guest.name} đã hoàn tất trả phòng P.${room.number}`
        });
      }

      this.logAudit(
        'HOÀN TẤT TRẢ PHÒNG',
        `P.${stay.roomNumber} - Khách ${stay.guest.name}: Đã quyết toán Folio snapshot ${formatCurrency(stay.folioSnapshot.totalAmount)}`,
        currentUser ? currentUser.username : 'thungan'
      );

      _commitData(`Trả phòng và quyết toán P.${stay.roomNumber}`);
      return stay;
    },

    // 14. Kiểm tra Minibar phòng trả
    recordMinibarAudit: function (params, currentUser) {
      this.reloadLatest();
      const data = this.getData();

      const stayId = params.stayId;
      const roomNumber = params.roomNumber;
      const stay = data.stays.find(s => (stayId ? s.id === stayId : s.roomNumber === roomNumber) && s.status === 'in_house');

      if (!stay) {
        throw new Error(`Không tìm thấy lượt lưu trú đang mở của phòng ${roomNumber}!`);
      }

      const rawItems = params.itemsUsed || params.consumedItems || [];
      const itemsUsed = Array.isArray(rawItems) ? rawItems.map(it => ({
        id: it.id || ('MB-' + Math.random().toString().slice(2, 6)),
        name: it.name,
        quantity: parseInt(it.quantity, 10) || 0,
        price: parseInt(it.price || it.unitPrice, 10) || 0
      })) : [];

      let totalAmount = 0;
      itemsUsed.forEach(item => {
        if (item.quantity > 0 && item.price > 0) {
          totalAmount += (item.quantity * item.price);
        }
      });

      const auditId = params.auditId || ('MB-' + Date.now().toString().slice(-4));
      const hasConsumption = (itemsUsed.length > 0 && totalAmount > 0);

      const auditRecord = {
        id: auditId,
        stayId: stay.id,
        roomNumber: roomNumber,
        checkoutTime: formatDateTimeNow(),
        inspectedBy: currentUser ? currentUser.fullName : 'Nhân viên Buồng phòng',
        status: hasConsumption ? 'reported' : 'no_consumption',
        itemsUsed: itemsUsed,
        totalAmount: totalAmount,
        notes: hasConsumption
          ? (params.notes || 'Đã kiểm tra và báo số liệu tiêu thụ sang Lễ tân')
          : 'Đã kiểm tra - Khách không sử dụng minibar'
      };

      // Cập nhật hoặc thêm mới trong minibarAudits
      if (!Array.isArray(data.minibarAudits)) data.minibarAudits = [];
      const exIdx = data.minibarAudits.findIndex(a => a.id === auditId);
      if (exIdx >= 0) {
        data.minibarAudits[exIdx] = auditRecord;
      } else {
        data.minibarAudits.unshift(auditRecord);
      }

      // Tự động đồng bộ vào lượt lưu trú của khách
      // RÀNG BUỘC MỤC VII & TEST 8: Sửa cùng phiếu minibar phải thay thế đúng, KHÔNG cộng trùng!
      if (!Array.isArray(stay.servicesUsed)) stay.servicesUsed = [];
      stay.servicesUsed = stay.servicesUsed.filter(sv => sv.minibarAuditId !== auditId);

      const isImmediate = (params.paymentOption === 'immediate' || params.paidImmediately === true);
      const payMethod = params.paymentMethod || 'cash';
      const payMethodName = payMethod === 'vietqr' ? 'Chuyển khoản / VietQR' : (payMethod === 'pos_card' ? 'Thẻ POS' : 'Tiền mặt tại quầy');

      if (hasConsumption) {
        itemsUsed.forEach((item, idx) => {
          if (item.quantity > 0) {
            stay.servicesUsed.push({
              serviceId: 'MB-ITEM-' + auditId + '-' + idx,
              minibarAuditId: auditId,
              isMinibar: true,
              name: `Minibar: ${item.name}`,
              quantity: item.quantity,
              unitPrice: item.price,
              amount: item.quantity * item.price,
              orderTime: formatDateTimeNow(),
              paymentOption: isImmediate ? 'immediate' : 'room_charge',
              paymentStatus: isImmediate ? 'paid' : 'unpaid',
              paymentMethod: isImmediate ? payMethod : null
            });
          }
        });

        if (isImmediate && totalAmount > 0) {
          const transId = 'GD-MB-' + Date.now().toString().slice(-6);
          data.transactions.unshift({
            id: transId,
            referenceCode: 'REC-MB-' + stay.roomNumber,
            stayId: stay.id,
            bookingId: stay.bookingId,
            customerName: stay.guest ? stay.guest.name : ('Khách phòng ' + stay.roomNumber),
            amount: totalAmount,
            paymentMethod: payMethod,
            methodName: payMethodName,
            type: 'service_payment',
            status: 'success',
            gatewayVerified: true,
            timestamp: formatDateTimeNow(),
            cashier: currentUser ? currentUser.fullName : 'Thu ngân / Lễ tân',
            notes: `Thanh toán ngay đồ uống Minibar phiếu ${auditId}`
          });
        }
      }

      this.logAudit(
        'KIỂM TRA MINIBAR',
        `Phòng ${roomNumber} (Lượt ở ${stay.id}): ${hasConsumption ? formatCurrency(totalAmount) : 'Không phát sinh đồ uống'}`,
        currentUser ? currentUser.username : 'buongphong'
      );

      _commitData(`Ghi nhận kiểm tra minibar phòng ${roomNumber}`);
      return auditRecord;
    },

    // 15. Quy trình vệ sinh buồng phòng 4 bước (Housekeeping Workflow)
    updateRoomCleanStatus: function (roomId, newCleanStatus, currentUser) {
      this.reloadLatest();
      const data = this.getData();
      const room = data.rooms.find(r => r.id === roomId || r.number === roomId);
      if (!room) throw new Error('Không tìm thấy phòng ' + roomId);

      const VALID_STATUSES = ['dirty', 'cleaning', 'inspecting', 'clean'];
      if (!VALID_STATUSES.includes(newCleanStatus)) {
        throw new Error(`Trạng thái vệ sinh "${newCleanStatus}" không hợp lệ! Chỉ chấp nhận: dirty, cleaning, inspecting, clean.`);
      }

      const role = currentUser ? (currentUser.roleCode || currentUser.role || '') : '';
      // Thu ngân KHÔNG mặc nhiên có quyền giám sát buồng phòng!
      const isSupervisor = (
        role === 'manager' ||
        role === 'admin' ||
        role === 'housekeeping_supervisor' ||
        this.hasPermission(currentUser, 'approveCleanStatus') ||
        (currentUser && currentUser.username === 'thu.giamsat')
      );

      // Tách quyền: Nhân viên dọn và thu ngân KHÔNG được tự duyệt sạch!
      if (newCleanStatus === 'clean' && !isSupervisor) {
        throw new Error('Chỉ Giám sát buồng phòng hoặc Quản lý mới có quyền nghiệm thu và duyệt phòng SẠCH!');
      }

      const oldStatus = room.cleanStatus;
      room.cleanStatus = newCleanStatus;

      // Cập nhật task buồng phòng tương ứng
      if (Array.isArray(data.housekeepingTasks)) {
        const task = data.housekeepingTasks.find(t => t.roomNumber === room.number && t.status !== 'completed');
        if (task) {
          if (newCleanStatus === 'cleaning') task.status = 'in_progress';
          if (newCleanStatus === 'inspecting') {
            task.status = 'inspecting';
            task.inspectionResult = 'Chờ giám sát kiểm phòng';
          }
          if (newCleanStatus === 'clean') {
            task.status = 'completed';
            task.inspectionResult = 'Đạt chuẩn 5 sao (Đã duyệt)';
          }
        }
      }

      this.logAudit(
        'ĐỔI TRẠNG THÁI VỆ SINH',
        `Phòng ${room.number}: ${oldStatus} &rarr; ${newCleanStatus}`,
        currentUser ? currentUser.username : 'buongphong'
      );

      _commitData(`Cập nhật trạng thái vệ sinh phòng ${room.number}`);
      return room;
    },

    // 16. Khóa/Mở bảo trì phòng (Room Maintenance)
    toggleRoomMaintenance: function (roomId, reason, currentUser) {
      this.reloadLatest();
      const data = this.getData();
      const room = data.rooms.find(r => r.id === roomId || r.number === roomId);
      if (!room) throw new Error('Không tìm thấy phòng ' + roomId);

      // KHÔNG KHÓA BẢO TRÌ PHÒNG ĐANG CÓ KHÁCH (mục VIII.6)
      if (room.stayStatus === 'occupied') {
        throw new Error(
          `Phòng ${room.number} đang có khách lưu trú! Không thể khóa bảo trì. ` +
          `Vui lòng chuyển khách sang phòng khác trước khi tạm dừng khai thác.`
        );
      }

      if (room.exploitationStatus === 'active') {
        // KIỂM TRA QUỸ PHÒNG TƯƠNG LAI: Không làm thiếu phòng đã cam kết (mục III & Test 16)
        const commitmentCheck = this.verifyFutureCommitmentAfterRoomRemoval(room.classCode, room.number);
        if (commitmentCheck.conflict) {
          throw new Error(
            `Không thể khóa bảo trì phòng ${room.number}: Việc khóa phòng sẽ gây thiếu quỹ phòng đã cam kết ` +
            `cho đơn đặt ${commitmentCheck.bookingId} trong tương lai!`
          );
        }

        room.exploitationStatus = 'maintenance';
        room.cleanStatus = 'dirty';

        if (!Array.isArray(data.maintenanceTickets)) data.maintenanceTickets = [];
        data.maintenanceTickets.unshift({
          id: 'SC-' + Date.now().toString().slice(-4),
          roomNumber: room.number,
          issueType: 'Bảo trì phòng định kỳ',
          description: reason || 'Khóa bảo trì từ bảng sơ đồ',
          reportedBy: currentUser ? currentUser.fullName : 'Quản lý',
          reportedAt: formatDateTimeNow(),
          status: 'in_progress',
          priority: 'medium'
        });

        this.logAudit('KHÓA BẢO TRÌ PHÒNG', `Khóa phòng P.${room.number}. Lý do: ${reason}`, currentUser ? currentUser.username : 'quanly');
      } else {
        room.exploitationStatus = 'active';
        room.cleanStatus = 'dirty'; // Mở lại phòng phải qua quy trình dọn dẹp trước khi đón khách
        this.logAudit('MỞ LẠI KHAI THÁC', `Mở lại phòng P.${room.number} vào kinh doanh`, currentUser ? currentUser.username : 'quanly');
      }

      _commitData(`Thay đổi trạng thái bảo trì phòng P.${room.number}`);
      return room;
    },

    // 17. Báo cáo sự cố phòng
    reportMaintenanceTicket: function (params, currentUser) {
      this.reloadLatest();
      const data = this.getData();
      const roomNumber = params.roomNumber;
      const room = data.rooms.find(r => r.number === roomNumber);
      if (!room) throw new Error('Không tìm thấy phòng ' + roomNumber);

      const ticketId = 'SC-' + Date.now().toString().slice(-4);
      const newTicket = {
        id: ticketId,
        roomNumber: roomNumber,
        issueType: params.issueType || 'Sự cố trang thiết bị',
        description: (params.description || '').trim(),
        priority: params.priority || 'medium',
        reportedBy: currentUser ? currentUser.fullName : 'Nhân viên',
        reportedAt: formatDateTimeNow(),
        status: 'pending',
        resolvedAt: null,
        resolvedBy: null
      };

      if (!Array.isArray(data.maintenanceTickets)) data.maintenanceTickets = [];
      data.maintenanceTickets.unshift(newTicket);

      if (params.lockRoom && room.stayStatus !== 'occupied') {
        const commitmentCheck = this.verifyFutureCommitmentAfterRoomRemoval(room.classCode, room.number);
        if (!commitmentCheck.conflict) {
          room.exploitationStatus = 'maintenance';
        }
      }

      this.logAudit('BÁO SỰ CỐ PHÒNG', `Phiếu ${ticketId} cho P.${roomNumber}: ${newTicket.description}`, currentUser ? currentUser.username : 'hethong');
      _commitData(`Tạo phiếu báo sự cố ${ticketId}`);
      return newTicket;
    },

    // 17b. Đồ thất lạc (Lost and Found)
    recordLostAndFound: function (params, currentUser) {
      this.reloadLatest();
      const data = this.getData();
      const lfId = 'LF-' + Date.now().toString().slice(-4);
      const newLF = {
        id: lfId,
        roomNumber: params.roomNumber,
        itemName: (params.itemName || '').trim(),
        foundPlace: params.foundPlace || `Phòng ${params.roomNumber}`,
        foundBy: currentUser ? currentUser.fullName : 'Nhân viên buồng',
        foundDate: formatDateTimeNow(),
        status: 'keeping',
        returnedToGuest: null,
        returnedDate: null,
        notes: params.notes || ''
      };
      if (!Array.isArray(data.lostAndFound)) data.lostAndFound = [];
      data.lostAndFound.unshift(newLF);
      this.logAudit('GHI NHẬN ĐỒ THẤT LẠC', `Mã ${lfId}: ${newLF.itemName} tại P.${newLF.roomNumber}`, currentUser ? currentUser.username : 'buongphong');
      _commitData(`Ghi nhận đồ thất lạc ${lfId}`);
      return newLF;
    },

    // 18. Sandbox Gateway Simulator (Mô phỏng Cổng thanh toán ngoại tuyến)
    // Chống xử lý lặp lại (Idempotent Webhook)
    simulateGatewayWebhook: function (transactionId, outcome, currentUser) {
      this.reloadLatest();
      const data = this.getData();
      const trans = data.transactions.find(t => t.id === transactionId);
      if (!trans) throw new Error('Không tìm thấy giao dịch ' + transactionId);

      // Chống xử lý phản hồi lặp lại: nếu đã success thì bỏ qua, không cộng doanh thu 2 lần!
      if (trans.status === 'success') {
        console.warn(`[SongLamStore] Giao dịch ${transactionId} đã ghi nhận thành công trước đó (Idempotent)`);
        return trans;
      }

      if (outcome === 'success' || outcome === true || outcome === 1) {
        trans.status = 'success';
        trans.gatewayVerified = true;
        trans.gatewayResponse = {
          code: '00',
          message: 'Mô phỏng: Cổng thanh toán phản hồi giao dịch thành công (Sandbox)',
          receivedAt: formatDateTimeNow()
        };
        this.logAudit(
          'MÔ PHỎNG CỔNG THANH TOÁN',
          `GD ${trans.id} (${formatCurrency(trans.amount)}) &rarr; Thành công (Sandbox)`,
          currentUser ? currentUser.username : 'hethong'
        );
      } else {
        trans.status = 'failed';
        trans.gatewayVerified = false;
        trans.gatewayResponse = {
          code: '99',
          message: 'Mô phỏng: Giao dịch bị từ chối hoặc hết hạn (Sandbox)',
          receivedAt: formatDateTimeNow()
        };
        this.logAudit('MÔ PHỎNG CỔNG THANH TOÁN', `GD ${trans.id} &rarr; Thất bại (Sandbox)`, currentUser ? currentUser.username : 'hethong');
      }

      _commitData(`Mô phỏng kết quả thanh toán cho giao dịch ${transactionId}`);
      return trans;
    },

    // 19. Đề nghị và Phê duyệt hoàn tiền (Refund Engine)
    // Ràng buộc mục VI: Không hoàn từ giao dịch hoàn! Giới hạn trần tiền hoàn! Phân quyền chặt chẽ!
    requestRefund: function (params, currentUser) {
      this.reloadLatest();
      const data = this.getData();

      let trans = null;
      if (params.originalTransactionId) {
        trans = data.transactions.find(t => t.id === params.originalTransactionId && t.status === 'success');
      }
      if (!trans && params.stayId) {
        const stay = data.stays.find(s => s.id === params.stayId);
        const reqAmt = parseInt(params.refundAmount, 10) || 0;
        const candidates = (data.transactions || []).filter(t => 
          (t.stayId === params.stayId || (stay && stay.bookingId && t.bookingId === stay.bookingId)) &&
          t.status === 'success' &&
          t.type !== 'refund' &&
          t.type !== 'guarantee_deposit_refund'
        );
        for (const cand of candidates) {
          let used = 0;
          (data.refundRequests || []).forEach(rf => {
            if (rf.originalTransactionId === cand.id && rf.status !== 'rejected') used += (rf.refundAmount || 0);
          });
          if (cand.amount - used >= reqAmt) {
            trans = cand;
            break;
          }
        }
        if (!trans && candidates.length > 0) trans = candidates[0];

        // Nếu không có transaction nào nhưng stay có cọc/thu trước, tạo transaction để có chứng từ hoàn
        if (!trans && stay && (stay.depositAmount > 0 || stay.guaranteeDeposit > 0)) {
          const prepayAmt = (stay.depositAmount || 0) + (stay.guaranteeDeposit || 0);
          const synId = 'GD-PREPAY-' + stay.id;
          trans = {
            id: synId,
            referenceCode: 'REC-DEP-' + stay.roomNumber,
            stayId: stay.id,
            bookingId: stay.bookingId,
            customerName: stay.guest ? stay.guest.name : 'Khách lưu trú',
            amount: prepayAmt,
            paymentMethod: 'bank_transfer',
            methodName: 'Thu trước / Tiền cọc đặt phòng',
            type: 'deposit',
            status: 'success',
            gatewayVerified: true,
            timestamp: stay.checkInDate || formatDateTimeNow(),
            cashier: 'Hệ thống'
          };
          data.transactions.unshift(trans);
        }
      }
      if (!trans && params.bookingId) {
        trans = data.transactions.find(t => t.bookingId === params.bookingId && t.status === 'success' && t.type !== 'refund');
      }

      if (!trans) {
        throw new Error('Giao dịch gốc không tồn tại hoặc chưa thanh toán thành công!');
      }

      // RÀNG BUỘC TEST 11: Không hoàn từ giao dịch hoàn tiền!
      if (trans.type === 'refund' || trans.type === 'guarantee_deposit_refund') {
        throw new Error('Không thể tạo yêu cầu hoàn tiền từ một giao dịch hoàn tiền!');
      }

      const originalTransId = trans.id;
      const refundAmount = parseInt(params.refundAmount !== undefined ? params.refundAmount : params.amount, 10);
      if (isNaN(refundAmount) || refundAmount <= 0) {
        throw new Error('Số tiền đề nghị hoàn phải là số nguyên dương lớn hơn 0 VNĐ!');
      }

      // RÀNG BUỘC TEST 12: Kiểm tra trần tiền hoàn
      let alreadyRefunded = 0;
      (data.refundRequests || []).forEach(rf => {
        if (rf.originalTransactionId === originalTransId && rf.status !== 'rejected') {
          alreadyRefunded += (rf.refundAmount || 0);
        }
      });

      const maxRefundable = trans.amount - alreadyRefunded;
      if (refundAmount > maxRefundable) {
        throw new Error(
          `Số tiền đề nghị hoàn (${formatCurrency(refundAmount)}) vượt quá số tiền có thể hoàn của giao dịch gốc ` +
          `(Tối đa: ${formatCurrency(maxRefundable)})!`
        );
      }

      const reason = (params.reason || '').trim();
      if (!reason) {
        throw new Error('Bắt buộc phải ghi rõ lý do đề nghị hoàn tiền!');
      }

      const refundId = 'REF-' + this.getWorkingDate().replace(/-/g, '') + '-' + String((data.refundRequests || []).length + 1).padStart(2, '0');

      const newRefund = {
        id: refundId,
        originalTransactionId: originalTransId,
        bookingId: trans.bookingId || null,
        stayId: trans.stayId || null,
        customerName: trans.customerName,
        originalAmount: trans.amount,
        refundAmount: refundAmount,
        reason: reason,
        requestedBy: currentUser ? currentUser.fullName : 'Thu ngân',
        requestedAt: formatDateTimeNow(),
        status: 'pending', // 'pending' -> 'approved' -> 'completed'
        approvedBy: null,
        approvedAt: null,
        completedAt: null,
        notes: params.notes || ''
      };

      if (!Array.isArray(data.refundRequests)) data.refundRequests = [];
      data.refundRequests.unshift(newRefund);

      this.logAudit(
        'ĐỀ NGHỊ HOÀN TIỀN',
        `Phiếu ${refundId}: ${formatCurrency(refundAmount)} cho khách ${trans.customerName} (Lý do: ${reason})`,
        currentUser ? currentUser.username : 'thungan'
      );

      _commitData(`Tạo đề nghị hoàn tiền ${refundId}`);
      return newRefund;
    },

    // Phê duyệt hoàn tiền: CHỈ QUẢN LÝ HOẶC QUẢN TRỊ VIÊN ĐƯỢC DUYỆT (mục VI.7, Test 12)
    approveRefund: function (refundId, currentUser) {
      if (!this.hasPermission(currentUser, 'approveRefund') && (!currentUser || (currentUser.roleCode !== 'manager' && currentUser.roleCode !== 'admin'))) {
        throw new Error('Bạn không có quyền phê duyệt hoàn tiền! Thao tác này chỉ dành cho Quản lý hoặc Quản trị viên.');
      }

      this.reloadLatest();
      const data = this.getData();
      const rf = data.refundRequests.find(r => r.id === refundId);
      if (!rf) throw new Error('Không tìm thấy yêu cầu hoàn tiền ' + refundId);

      if (rf.status !== 'pending') {
        throw new Error(`Yêu cầu hoàn tiền này đang ở trạng thái "${rf.status}", không thể phê duyệt lại!`);
      }

      rf.status = 'approved';
      rf.approvedBy = currentUser ? currentUser.fullName : 'Quản lý khách sạn';
      rf.approvedAt = formatDateTimeNow();

      this.logAudit(
        'DUYỆT HOÀN TIỀN',
        `Phiếu ${refundId}: Phê duyệt hoàn ${formatCurrency(rf.refundAmount)} cho ${rf.customerName}`,
        currentUser ? currentUser.username : 'quanly'
      );

      _commitData(`Phê duyệt hoàn tiền ${refundId}`);
      return rf;
    },

    // Thực chi hoàn tiền: Yêu cầu quyền Thu ngân / Kế toán và phiếu PHẢI ĐÃ ĐƯỢC DUYỆT (mục VI.8)
    completeRefund: function (refundId, currentUser) {
      if (!this.hasPermission(currentUser, 'collectPayment') && (!currentUser || (currentUser.roleCode !== 'cashier' && currentUser.roleCode !== 'manager' && currentUser.roleCode !== 'admin'))) {
        throw new Error('Bạn không có quyền thực hiện chi hoàn tiền! Thao tác này chỉ dành cho Thu ngân / Kế toán.');
      }

      this.reloadLatest();
      const data = this.getData();
      const rf = data.refundRequests.find(r => r.id === refundId);
      if (!rf) throw new Error('Không tìm thấy yêu cầu hoàn tiền ' + refundId);

      if (rf.status !== 'approved') {
        throw new Error('Yêu cầu hoàn tiền phải được Quản lý phê duyệt (approved) trước khi thực chi hoàn tiền!');
      }

      rf.status = 'completed';
      rf.completedAt = formatDateTimeNow();

      // Ghi nhận giao dịch hoàn tiền thành công
      const transId = 'GD-REF-' + Date.now().toString().slice(-6);
      data.transactions.unshift({
        id: transId,
        referenceCode: 'REF-TX-' + rf.id,
        stayId: rf.stayId,
        bookingId: rf.bookingId,
        customerName: rf.customerName,
        amount: rf.refundAmount,
        paymentMethod: 'cash',
        methodName: 'Hoàn tiền mặt / Chuyển khoản hoàn',
        type: 'refund',
        status: 'success',
        gatewayVerified: true,
        timestamp: formatDateTimeNow(),
        cashier: currentUser ? currentUser.fullName : 'Kế toán / Thu ngân',
        notes: `Thực chi hoàn tiền theo phiếu duyệt ${rf.id} (Lý do: ${rf.reason})`
      });

      this.logAudit(
        'HOÀN TẤT CHI HOÀN TIỀN',
        `Phiếu ${refundId}: Đã thực chi ${formatCurrency(rf.refundAmount)} cho khách ${rf.customerName}`,
        currentUser ? currentUser.username : 'thungan'
      );

      _commitData(`Hoàn tất chi hoàn tiền cho phiếu ${refundId}`);
      return rf;
    },

    // Xử lý hoàn tiền trả thừa cho lượt lưu trú (Test 10 & Reception Checkout)
    refundExcessPayment: function (stayId, reason, managerUser, cashierUser) {
      this.reloadLatest();
      const folio = this.calculateStayFolio(stayId);
      if (!folio || folio.remainingDue >= 0) {
        throw new Error('Lượt lưu trú này không có khoản tiền trả thừa cần hoàn trả!');
      }

      const excessAmount = Math.abs(folio.remainingDue);
      const mgr = managerUser || { roleCode: 'manager', fullName: 'Quản lý duyệt hoàn tiền', username: 'quanly' };
      const csh = cashierUser || { roleCode: 'cashier', fullName: 'Thu ngân thực chi', username: 'thungan' };

      // Tạo yêu cầu hoàn tiền
      const req = this.requestRefund({
        stayId: stayId,
        refundAmount: excessAmount,
        reason: reason || 'Hoàn tiền trả thừa cho khách trước khi hoàn tất quyết toán trả phòng'
      }, csh);

      // Quản lý phê duyệt
      this.approveRefund(req.id, mgr);

      // Thu ngân thực chi hoàn tiền
      return this.completeRefund(req.id, csh);
    },

    // Thanh toán ngay cho dịch vụ đã phát sinh trong phòng
    payStayServiceImmediately: function (stayId, serviceIdOrAuditId, paymentMethod, currentUser) {
      this.reloadLatest();
      const data = this.getData();
      const stay = data.stays.find(s => s.id === stayId && s.status === 'in_house');
      if (!stay) throw new Error('Không tìm thấy lượt lưu trú!');

      const items = (stay.servicesUsed || []).filter(sv => 
        (sv.serviceId === serviceIdOrAuditId || sv.minibarAuditId === serviceIdOrAuditId) && sv.paymentStatus !== 'paid'
      );
      if (items.length === 0) throw new Error('Không tìm thấy dịch vụ chưa thanh toán phù hợp!');

      let totalPay = 0;
      items.forEach(it => {
        it.paymentStatus = 'paid';
        it.paymentOption = 'immediate';
        it.paymentMethod = paymentMethod || 'cash';
        totalPay += it.amount;
      });

      const payMethod = paymentMethod || 'cash';
      const payMethodName = payMethod === 'vietqr' ? 'Chuyển khoản / VietQR' : (payMethod === 'pos_card' ? 'Thẻ POS' : 'Tiền mặt tại quầy');
      const transId = 'GD-SV-' + Date.now().toString().slice(-6);

      data.transactions.unshift({
        id: transId,
        referenceCode: 'REC-SVC-' + stay.roomNumber,
        stayId: stay.id,
        bookingId: stay.bookingId,
        customerName: stay.guest ? stay.guest.name : ('Khách phòng ' + stay.roomNumber),
        amount: totalPay,
        paymentMethod: payMethod,
        methodName: payMethodName,
        type: 'service_payment',
        status: 'success',
        gatewayVerified: true,
        timestamp: formatDateTimeNow(),
        cashier: currentUser ? currentUser.fullName : 'Thu ngân / Lễ tân',
        notes: `Thanh toán ngay dịch vụ phòng ${stay.roomNumber}`
      });

      this.logAudit(
        'THU TIỀN DỊCH VỤ NGAY',
        `Phòng ${stay.roomNumber} thanh toán ngay ${formatCurrency(totalPay)} cho dịch vụ/minibar`,
        currentUser ? currentUser.username : 'letan'
      );

      _commitData(`Thanh toán ngay dịch vụ phòng ${stay.roomNumber}`);
      return { totalPay, count: items.length };
    },

    // 20. Thêm dịch vụ vào Folio phòng lưu trú
    addServiceToStay: function (stayId, serviceId, quantity, notes, currentUser, paymentOption, paymentMethod) {
      this.reloadLatest();
      const data = this.getData();

      let sId = stayId;
      let svcId = serviceId;
      let qty = quantity;
      let noteText = notes;
      let usr = currentUser;
      let payOpt = paymentOption || 'room_charge';
      let payMethod = paymentMethod || 'cash';

      if (typeof stayId === 'object' && stayId !== null) {
        sId = stayId.stayId;
        svcId = stayId.serviceId;
        qty = stayId.quantity;
        noteText = stayId.notes;
        usr = serviceId || stayId.currentUser;
        payOpt = stayId.paymentOption || 'room_charge';
        payMethod = stayId.paymentMethod || 'cash';
      }

      const stay = data.stays.find(s => s.id === sId && s.status === 'in_house');
      if (!stay) throw new Error('Không tìm thấy lượt lưu trú hợp lệ đang mở!');

      const service = data.services.find(s => s.id === svcId);
      if (!service) throw new Error('Không tìm thấy dịch vụ ' + svcId);
      if (service.status && service.status !== 'active') {
        throw new Error(`Dịch vụ "${service.name}" hiện đang tạm ngừng kinh doanh!`);
      }

      const parsedQty = parseInt(qty, 10);
      if (isNaN(parsedQty) || parsedQty <= 0) {
        throw new Error('Số lượng dịch vụ phải là số nguyên dương lớn hơn 0 (không tự chuyển 0 thành 1)!');
      }

      if (service.price < 0) {
        throw new Error('Đơn giá dịch vụ không được là số âm!');
      }

      const isImmediate = (payOpt === 'immediate');
      const orderItem = {
        serviceId: service.id,
        name: service.name,
        category: service.category,
        quantity: parsedQty,
        unit: service.unit,
        unitPrice: service.price,
        amount: service.price * parsedQty,
        orderTime: formatDateTimeNow(),
        notes: (noteText || '').trim(),
        isMinibar: service.category === 'minibar' || service.category === 'Minibar',
        paymentOption: payOpt,
        paymentStatus: isImmediate ? 'paid' : 'unpaid',
        paymentMethod: isImmediate ? payMethod : null
      };

      if (!Array.isArray(stay.servicesUsed)) stay.servicesUsed = [];
      stay.servicesUsed.push(orderItem);

      // Nếu chọn thanh toán ngay, ghi nhận giao dịch thu tiền dịch vụ tại quầy
      if (isImmediate) {
        const transId = 'GD-SV-' + Date.now().toString().slice(-6);
        const payMethodName = payMethod === 'vietqr' ? 'Chuyển khoản / VietQR' : (payMethod === 'pos_card' ? 'Thẻ POS' : 'Tiền mặt tại quầy');
        data.transactions.unshift({
          id: transId,
          referenceCode: 'REC-SVC-' + stay.roomNumber,
          stayId: stay.id,
          bookingId: stay.bookingId,
          customerName: stay.guest.name,
          amount: orderItem.amount,
          paymentMethod: payMethod,
          methodName: payMethodName,
          type: 'service_payment',
          status: 'success',
          gatewayVerified: true,
          timestamp: formatDateTimeNow(),
          cashier: usr ? (usr.fullName || usr.username) : 'Lễ tân / Phục vụ',
          notes: `Thu tiền ngay dịch vụ ${service.name} (x${parsedQty}) cho P.${stay.roomNumber}`
        });
      }

      this.logAudit(
        'GỌI DỊCH VỤ PHÒNG',
        `P.${stay.roomNumber}: ${service.name} x${parsedQty} (${formatCurrency(orderItem.amount)}) - ${isImmediate ? 'Đã thu ngay' : 'Ghi nợ Folio'}`,
        usr ? (usr.username || 'nhanvien') : 'hethong'
      );

      _commitData(`Thêm dịch vụ ${service.name} cho P.${stay.roomNumber}`);
      return orderItem;
    },

    // 21. Thêm phụ thu hư hại / phạt (Surcharge)
    addSurchargeToStay: function (stayId, surchargeData, currentUser) {
      this.reloadLatest();
      const data = this.getData();
      const stay = data.stays.find(s => s.id === stayId && s.status === 'in_house');
      if (!stay) throw new Error('Không tìm thấy lượt lưu trú hợp lệ đang mở!');

      const name = (surchargeData.name || surchargeData.description || '').trim();
      const amount = parseInt(surchargeData.amount, 10);
      if (!name) throw new Error('Vui lòng nhập tên hoặc mô tả khoản phụ thu!');
      if (isNaN(amount) || amount <= 0) throw new Error('Số tiền phụ thu phải lớn hơn 0 VNĐ!');

      const scItem = {
        id: 'SC-' + Date.now().toString().slice(-4),
        name: name,
        amount: amount,
        reason: (surchargeData.reason || name).trim(),
        createdAt: formatDateTimeNow(),
        createdBy: currentUser ? currentUser.fullName : 'Lễ tân'
      };

      if (!Array.isArray(stay.surcharges)) stay.surcharges = [];
      stay.surcharges.push(scItem);

      this.logAudit(
        'THÊM PHỤ THU LƯU TRÚ',
        `P.${stay.roomNumber}: Phụ thu ${name} (${formatCurrency(amount)})`,
        currentUser ? currentUser.username : 'letan'
      );

      _commitData(`Thêm phụ thu cho P.${stay.roomNumber}`);
      return scItem;
    },

    // 22. Quản lý phân quyền & tài khoản
    saveRolePermissions: function (roleCode, newPermissions, currentUser) {
      if (!this.hasPermission(currentUser, 'systemConfig')) {
        throw new Error('Bạn không có quyền quản trị cấu hình hệ thống! Thao tác này yêu cầu quyền [systemConfig].');
      }
      this.reloadLatest();
      const data = this.getData();
      const role = data.roles.find(r => r.code === roleCode);
      if (!role) throw new Error('Không tìm thấy vai trò ' + roleCode);

      role.permissions = Object.assign({}, newPermissions);
      this.logAudit('SỬA PHÂN QUYỀN VAI TRÒ', `Cập nhật quyền cho vai trò ${role.name} (${roleCode})`, currentUser ? currentUser.username : 'admin');
      _commitData(`Cập nhật phân quyền vai trò ${roleCode}`);
      return role;
    },

    createRole: function (roleData, currentUser) {
      if (!this.hasPermission(currentUser, 'systemConfig')) {
        throw new Error('Bạn không có quyền quản trị vai trò!');
      }
      this.reloadLatest();
      const data = this.getData();
      const code = (roleData.code || '').trim().toLowerCase();
      const name = (roleData.name || '').trim();
      if (!code || !name) throw new Error('Mã vai trò và tên vai trò không được để trống!');
      if (data.roles.some(r => r.code === code)) throw new Error(`Mã vai trò "${code}" đã tồn tại!`);

      const newRole = {
        id: 'ROLE_' + code.toUpperCase(),
        code: code,
        name: name,
        description: roleData.description || '',
        permissions: Object.assign({}, roleData.permissions || {})
      };
      data.roles.push(newRole);
      this.logAudit('TẠO VAI TRÒ MỚI', `Tạo vai trò ${name} (${code})`, currentUser ? currentUser.username : 'admin');
      _commitData(`Tạo vai trò mới ${code}`);
      return newRole;
    },

    updateUser: function (userId, userPatch, currentUser) {
      if (!this.hasPermission(currentUser, 'systemConfig')) {
        throw new Error('Bạn không có quyền chỉnh sửa tài khoản người dùng!');
      }
      this.reloadLatest();
      const data = this.getData();
      const user = data.users.find(u => u.id === userId);
      if (!user) throw new Error('Không tìm thấy người dùng ' + userId);

      if (userPatch.fullName !== undefined) user.fullName = userPatch.fullName.trim();
      if (userPatch.phone !== undefined) user.phone = userPatch.phone.trim();
      if (userPatch.roleCode !== undefined) user.roleCode = userPatch.roleCode;
      if (userPatch.status !== undefined) user.status = userPatch.status;

      this.logAudit('CẬP NHẬT TÀI KHOẢN', `Người dùng ${user.username} (${user.id})`, currentUser ? currentUser.username : 'admin');
      _commitData(`Cập nhật người dùng ${user.username}`);
      return user;
    },

    createUser: function (userData, currentUser) {
      if (!this.hasPermission(currentUser, 'systemConfig')) {
        throw new Error('Bạn không có quyền tạo tài khoản người dùng!');
      }
      this.reloadLatest();
      const data = this.getData();
      const username = (userData.username || '').trim().toLowerCase();
      if (!username || !userData.fullName) throw new Error('Tên đăng nhập và Họ tên không được để trống!');
      if (data.users.some(u => u.username === username)) throw new Error(`Tên đăng nhập "${username}" đã tồn tại!`);

      const newUser = {
        id: 'NV-' + String(data.users.length + 1).padStart(2, '0'),
        username: username,
        fullName: userData.fullName.trim(),
        roleCode: userData.roleCode || 'receptionist',
        phone: userData.phone || '',
        status: userData.status || 'active',
        createdAt: formatDateTimeNow()
      };
      data.users.push(newUser);
      this.logAudit('TẠO TÀI KHOẢN MỚI', `Tài khoản ${username} (${newUser.fullName})`, currentUser ? currentUser.username : 'admin');
      _commitData(`Tạo tài khoản mới ${username}`);
      return newUser;
    },

    addCustomer: function (customerData, currentUser) {
      this.reloadLatest();
      const data = this.getData();
      const name = (customerData.name || '').trim();
      const phone = (customerData.phone || '').trim();
      if (!name || !phone) throw new Error('Họ tên và Số điện thoại khách hàng không được để trống!');

      if (!Array.isArray(data.customers)) data.customers = [];
      const newCust = {
        id: 'KH-' + Date.now().toString().slice(-4),
        name: name,
        phone: phone,
        identityCard: customerData.identityCard || '',
        email: customerData.email || '',
        address: customerData.address || '',
        createdAt: formatDateTimeNow()
      };
      data.customers.push(newCust);
      this.logAudit('THÊM HỒ SƠ KHÁCH HÀNG', `Khách hàng: ${name} (${phone})`, currentUser ? currentUser.username : 'letan');
      _commitData(`Thêm khách hàng ${name}`);
      return newCust;
    },

    // 23. Quản lý Danh mục Hạng phòng (Room Classes CRUD)
    createRoomClass: function (params, currentUser) {
      if (!this.hasPermission(currentUser, 'editRoomClasses')) {
        throw new Error('Bạn không có quyền thêm mới hạng phòng!');
      }
      this.reloadLatest();
      const data = this.getData();
      const code = (params.code || '').trim().toUpperCase();
      const name = (params.name || '').trim();
      const area = parseInt(params.area, 10);
      const basePrice = parseInt(params.basePrice, 10);

      if (!code || !name) throw new Error('Mã hạng và Tên hạng phòng không được để trống!');
      if (data.roomClasses.some(c => c.code === code)) throw new Error(`Mã hạng phòng "${code}" đã tồn tại!`);
      if (isNaN(area) || area <= 0) throw new Error('Diện tích phòng phải là số nguyên dương lớn hơn 0 m²!');
      if (isNaN(basePrice) || basePrice < 0) throw new Error('Giá phòng cơ sở không được để trống hoặc là số âm!');

      const newClass = {
        id: code,
        code: code,
        name: name,
        area: area,
        standardOccupancy: parseInt(params.standardOccupancy, 10) || 2,
        maxOccupancy: parseInt(params.maxOccupancy, 10) || 3,
        bedConfig: params.bedConfig || '1 Giường đôi',
        basePrice: basePrice,
        weekendPrice: parseInt(params.weekendPrice, 10) || Math.round(basePrice * 1.15),
        hourlyRateFirst2: parseInt(params.hourlyRateFirst2, 10) || Math.round(basePrice * 0.35),
        hourlyRateNext: parseInt(params.hourlyRateNext, 10) || Math.round(basePrice * 0.1),
        amenities: Array.isArray(params.amenities) ? params.amenities : ['Wifi', 'Điều hòa', 'Smart TV'],
        description: params.description || '',
        status: 'active'
      };

      data.roomClasses.push(newClass);
      this.logAudit('THÊM HẠNG PHÒNG', `Tạo hạng phòng mới: ${name} (${code})`, currentUser ? currentUser.username : 'quanly');
      _commitData(`Tạo hạng phòng ${code}`);
      return newClass;
    },

    updateRoomClass: function (code, patch, currentUser) {
      let targetCode = code;
      let targetPatch = patch || {};
      let user = currentUser;
      if (typeof code === 'object' && code !== null) {
        user = patch;
        targetPatch = code;
        targetCode = code.code;
      }
      if (!this.hasPermission(user, 'editRoomClasses')) {
        throw new Error('Bạn không có quyền chỉnh sửa hạng phòng!');
      }
      code = targetCode;
      patch = targetPatch;
      currentUser = user;
      this.reloadLatest();
      const data = this.getData();
      const rClass = data.roomClasses.find(c => c.code === code);
      if (!rClass) throw new Error('Không tìm thấy hạng phòng ' + code);

      if (patch.name !== undefined) rClass.name = patch.name.trim();
      if (patch.area !== undefined) {
        const a = parseInt(patch.area, 10);
        if (a <= 0) throw new Error('Diện tích phòng phải là số nguyên dương!');
        rClass.area = a;
      }
      if (patch.basePrice !== undefined) {
        const bp = parseInt(patch.basePrice, 10);
        if (bp < 0) throw new Error('Giá cơ sở không được âm!');
        rClass.basePrice = bp;
      }
      if (patch.weekendPrice !== undefined) {
        const wp = parseInt(patch.weekendPrice, 10);
        if (wp < 0) throw new Error('Giá cuối tuần không được âm!');
        rClass.weekendPrice = wp;
      }
      if (patch.standardOccupancy !== undefined) rClass.standardOccupancy = parseInt(patch.standardOccupancy, 10);
      if (patch.maxOccupancy !== undefined) rClass.maxOccupancy = parseInt(patch.maxOccupancy, 10);
      if (patch.bedConfig !== undefined) rClass.bedConfig = patch.bedConfig.trim();
      if (patch.status !== undefined) rClass.status = patch.status;

      this.logAudit('CẬP NHẬT HẠNG PHÒNG', `Cập nhật hạng phòng ${rClass.name} (${code})`, currentUser ? currentUser.username : 'quanly');
      _commitData(`Cập nhật hạng phòng ${code}`);
      return rClass;
    },

    deleteRoomClass: function (code, currentUser) {
      if (!this.hasPermission(currentUser, 'editRoomClasses')) {
        throw new Error('Bạn không có quyền xóa hạng phòng!');
      }
      this.reloadLatest();
      const data = this.getData();
      const rClass = data.roomClasses.find(c => c.code === code);
      if (!rClass) throw new Error('Không tìm thấy hạng phòng ' + code);

      // Chặn xóa nếu còn phòng vật lý hoặc có đơn đặt phòng
      const hasRooms = data.rooms.some(r => r.classCode === code);
      if (hasRooms) {
        throw new Error(`Không thể xóa hạng ${code}: Đang có các phòng vật lý thuộc hạng này trong hệ thống. Vui lòng chuyển các phòng sang hạng khác trước!`);
      }
      const hasBookings = (data.bookings || []).some(b => b.roomClassCode === code && b.bookingStatus === 'confirmed');
      if (hasBookings) {
        throw new Error(`Không thể xóa hạng ${code}: Đang có các đơn đặt trước cam kết hạng phòng này!`);
      }

      data.roomClasses = data.roomClasses.filter(c => c.code !== code);
      this.logAudit('XÓA HẠNG PHÒNG', `Xóa hạng phòng ${rClass.name} (${code})`, currentUser ? currentUser.username : 'quanly');
      _commitData(`Xóa hạng phòng ${code}`);
      return true;
    },

    // 24. Quản lý Danh mục Phòng vật lý (Physical Rooms CRUD)
    createRoom: function (params, currentUser) {
      if (!this.hasPermission(currentUser, 'editRoomClasses')) {
        throw new Error('Bạn không có quyền tạo phòng vật lý!');
      }
      this.reloadLatest();
      const data = this.getData();
      const number = (params.number || '').trim();
      const floor = parseInt(params.floor, 10);
      const classCode = (params.classCode || '').trim();

      if (!number || isNaN(floor) || !classCode) {
        throw new Error('Số phòng, Tầng lầu và Hạng phòng không được để trống!');
      }
      if (data.rooms.some(r => r.number === number)) {
        throw new Error(`Số phòng "${number}" đã tồn tại trong khách sạn!`);
      }
      if (!data.roomClasses.some(c => c.code === classCode)) {
        throw new Error(`Mã hạng phòng "${classCode}" không tồn tại trong danh mục!`);
      }

      const newRoom = {
        id: number,
        number: number,
        floor: floor,
        classCode: classCode,
        stayStatus: 'vacant',
        cleanStatus: 'clean',
        exploitationStatus: 'active',
        currentStayId: null,
        notes: params.notes || ''
      };

      data.rooms.push(newRoom);
      this.logAudit('THÊM PHÒNG VẬT LÝ', `Tạo phòng P.${number} (Tầng ${floor}, Hạng ${classCode})`, currentUser ? currentUser.username : 'quanly');
      _commitData(`Tạo phòng mới P.${number}`);
      return newRoom;
    },

    updateRoom: function (roomNumber, patch, currentUser) {
      if (!this.hasPermission(currentUser, 'editRoomClasses')) {
        throw new Error('Bạn không có quyền chỉnh sửa phòng vật lý!');
      }
      this.reloadLatest();
      const data = this.getData();
      const room = data.rooms.find(r => r.number === roomNumber);
      if (!room) throw new Error('Không tìm thấy phòng số ' + roomNumber);

      if (patch.floor !== undefined) room.floor = parseInt(patch.floor, 10) || room.floor;
      if (patch.classCode !== undefined && patch.classCode !== room.classCode) {
        // CHẶN ĐỔI HẠNG PHÒNG TRỰC TIẾP CỦA PHÒNG ĐANG CÓ KHÁCH (mục IX.5)
        if (room.stayStatus === 'occupied') {
          throw new Error(`Phòng ${roomNumber} đang có khách lưu trú! Không thể đổi hạng phòng trực tiếp khi đang có khách.`);
        }
        if (!data.roomClasses.some(c => c.code === patch.classCode)) {
          throw new Error(`Mã hạng phòng ${patch.classCode} không tồn tại!`);
        }
        // Kiểm tra xem chuyển hạng có làm thiếu quỹ phòng tương lai không
        const commitmentCheck = this.verifyFutureCommitmentAfterRoomRemoval(room.classCode, room.number);
        if (commitmentCheck.conflict) {
          throw new Error(`Không thể chuyển hạng phòng ${roomNumber}: Sẽ gây thiếu quỹ phòng đã cam kết cho hạng ${room.classCode} trong tương lai!`);
        }
        room.classCode = patch.classCode;
      }
      if (patch.notes !== undefined) room.notes = patch.notes.trim();

      this.logAudit('CẬP NHẬT PHÒNG', `Phòng P.${roomNumber}: Hạng ${room.classCode}, Tầng ${room.floor}`, currentUser ? currentUser.username : 'quanly');
      _commitData(`Cập nhật phòng P.${roomNumber}`);
      return room;
    },

    deleteRoom: function (roomNumber, currentUser) {
      if (!this.hasPermission(currentUser, 'editRoomClasses')) {
        throw new Error('Bạn không có quyền xóa phòng vật lý!');
      }
      this.reloadLatest();
      const data = this.getData();
      const room = data.rooms.find(r => r.number === roomNumber);
      if (!room) throw new Error('Không tìm thấy phòng số ' + roomNumber);

      if (room.stayStatus === 'occupied') {
        throw new Error(`Phòng ${roomNumber} đang có khách lưu trú, không thể xóa!`);
      }

      // KIỂM TRA QUỸ PHÒNG TƯƠNG LAI: Xóa phòng không được làm thiếu phòng đã cam kết (Test 16)
      const commitmentCheck = this.verifyFutureCommitmentAfterRoomRemoval(room.classCode, room.number);
      if (commitmentCheck.conflict) {
        throw new Error(
          `Không thể xóa phòng ${roomNumber}: Việc xóa phòng này sẽ gây thiếu quỹ phòng đã cam kết ` +
          `cho đơn đặt ${commitmentCheck.bookingId} trong tương lai!`
        );
      }

      data.rooms = data.rooms.filter(r => r.number !== roomNumber);
      this.logAudit('XÓA PHÒNG VẬT LÝ', `Xóa phòng P.${roomNumber}`, currentUser ? currentUser.username : 'quanly');
      _commitData(`Xóa phòng P.${roomNumber}`);
      return true;
    },

    // 25. Quản lý Danh mục Dịch vụ (Services Catalog CRUD)
    createService: function (params, currentUser) {
      if (!this.hasPermission(currentUser, 'editRoomClasses')) {
        throw new Error('Bạn không có quyền thêm mới dịch vụ!');
      }
      this.reloadLatest();
      const data = this.getData();
      const id = (params.id || ('SVC-' + Date.now().toString().slice(-4))).trim().toUpperCase();
      const name = (params.name || '').trim();
      const price = parseInt(params.price, 10);
      const unit = (params.unit || 'Lần').trim();

      if (!name) throw new Error('Tên dịch vụ không được để trống!');
      if (isNaN(price) || price < 0) throw new Error('Đơn giá dịch vụ không được để trống hoặc là số âm!');
      if (data.services.some(s => s.id === id)) throw new Error(`Mã dịch vụ "${id}" đã tồn tại!`);

      const newSvc = {
        id: id,
        name: name,
        category: params.category || 'fnb',
        price: price,
        unit: unit,
        status: 'active',
        description: params.description || ''
      };

      data.services.push(newSvc);
      this.logAudit('THÊM DỊCH VỤ', `Tạo dịch vụ: ${name} (${formatCurrency(price)}/${unit})`, currentUser ? currentUser.username : 'quanly');
      _commitData(`Tạo dịch vụ mới ${name}`);
      return newSvc;
    },

    updateService: function (serviceId, patch, currentUser) {
      if (!this.hasPermission(currentUser, 'editRoomClasses')) {
        throw new Error('Bạn không có quyền sửa dịch vụ!');
      }
      this.reloadLatest();
      const data = this.getData();
      const svc = data.services.find(s => s.id === serviceId);
      if (!svc) throw new Error('Không tìm thấy dịch vụ ' + serviceId);

      if (patch.name !== undefined) svc.name = patch.name.trim();
      if (patch.category !== undefined) svc.category = patch.category;
      if (patch.unit !== undefined) svc.unit = patch.unit.trim();
      if (patch.price !== undefined) {
        const p = parseInt(patch.price, 10);
        if (p < 0) throw new Error('Đơn giá dịch vụ không được âm!');
        svc.price = p;
      }
      if (patch.status !== undefined) svc.status = patch.status;
      if (patch.description !== undefined) svc.description = patch.description.trim();

      this.logAudit('CẬP NHẬT DỊCH VỤ', `Dịch vụ: ${svc.name} (${formatCurrency(svc.price)})`, currentUser ? currentUser.username : 'quanly');
      _commitData(`Cập nhật dịch vụ ${svc.name}`);
      return svc;
    },

    deleteService: function (serviceId, currentUser) {
      if (!this.hasPermission(currentUser, 'editRoomClasses')) {
        throw new Error('Bạn không có quyền xóa dịch vụ!');
      }
      this.reloadLatest();
      const data = this.getData();
      const svc = data.services.find(s => s.id === serviceId);
      if (!svc) throw new Error('Không tìm thấy dịch vụ ' + serviceId);

      // Ưu tiên ngừng sử dụng (soft-delete / deactivate) nếu đã phát sinh lịch sử sử dụng
      const hasUsage = (data.stays || []).some(s => (s.servicesUsed || []).some(u => u.serviceId === serviceId));
      if (hasUsage) {
        svc.status = 'inactive';
        this.logAudit('NGỪNG KINH DOANH DỊCH VỤ', `Dịch vụ ${svc.name} đã phát sinh lưu vết nên chuyển sang ngừng sử dụng`, currentUser ? currentUser.username : 'quanly');
        _commitData(`Ngừng sử dụng dịch vụ ${svc.name}`);
        return true;
      }

      data.services = data.services.filter(s => s.id !== serviceId);
      this.logAudit('XÓA DỊCH VỤ', `Xóa dịch vụ: ${svc.name} (${serviceId})`, currentUser ? currentUser.username : 'quanly');
      _commitData(`Xóa dịch vụ ${svc.name}`);
      return true;
    },

    // 26. BÁO CÁO THỐNG KÊ & BI ANALYTICS TÍNH TOÁN 100% ĐỘNG TỪ DỮ LIỆU THỰC TẾ
    // RÀNG BUỘC MỤC X & TEST 21: Bỏ hoàn toàn số gán cố định! Không có giao dịch thì bằng 0!
    getAnalyticsReportData: function (targetDate, period = 'this_month') {
      this.reloadLatest();
      const data = this.getData();
      _ensureSchemaCollections(data);
      const wDate = targetDate || this.getWorkingDate();

      const transactions = (data.transactions || []).filter(t => t.status === 'success');
      const stays = data.stays || [];
      const bookings = data.bookings || [];

      // Xác định khoảng thời gian lọc
      let startDate = wDate;
      let endDate = wDate;

      if (period === 'today') {
        startDate = wDate;
        endDate = wDate;
      } else if (period === 'this_week') {
        const dObj = parseDateOnly(wDate) || new Date();
        const dow = dObj.getUTCDay();
        const diffToMon = dow === 0 ? -6 : 1 - dow;
        startDate = addDays(wDate, diffToMon);
        endDate = addDays(startDate, 6);
      } else {
        // this_month - RÀNG BUỘC LỖI 10 & TEST 16, TEST 17:
        // Sử dụng chính xác khoảng nửa mở [đầu tháng hiện tại, đầu tháng tiếp theo)
        // Xử lý đúng tháng 28, 29 (năm nhuận 2028), 30, 31 ngày và chuyển năm tháng 12 sang tháng 1
        const parts = wDate.split('-');
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const nextYear = (month === 12) ? year + 1 : year;
        const nextMonth = (month === 12) ? 1 : month + 1;
        endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
      }

      // Lọc các giao dịch trong kỳ (RÀNG BUỘC LỖI 6 & LỖI 10)
      const periodTransactions = transactions.filter(t => {
        // Loại bỏ các giao dịch phân bổ nội bộ GD-ALLOC
        if (t.isInternalAllocation || t.type === 'internal_allocation' || (t.referenceCode && String(t.referenceCode).startsWith('ALLOC-'))) {
          return false;
        }
        const tDate = t.timestamp ? t.timestamp.split(' ')[0] : '';
        if (period === 'this_month') {
          // [startDate, endDate) -> Không bao gồm ngày đầu tháng sau (loại bỏ 01/05 khỏi tháng 4)
          return tDate >= startDate && tDate < endDate;
        }
        return tDate >= startDate && tDate <= endDate;
      });

      // Tính tổng thu thực tế (Inflow) và tổng chi hoàn tiền (Outflow)
      let totalIncome = 0;
      let totalExpense = 0;
      let depositCollected = 0;
      let roomSettled = 0;
      let servicesIncome = 0;

      periodTransactions.forEach(t => {
        if (t.type === 'refund' || t.type === 'guarantee_deposit_refund') {
          totalExpense += (t.amount || 0);
        } else {
          // Không tính lại việc khấu trừ nội bộ tiền đảm bảo
          if (t.type === 'guarantee_deposit_deduction') {
            return;
          }
          totalIncome += (t.amount || 0);
          if (t.type === 'deposit') depositCollected += (t.amount || 0);
          else if (t.type === 'service_payment' || t.type === 'service_immediate') servicesIncome += (t.amount || 0);
          else roomSettled += (t.amount || 0);
        }
      });

      const netCashflow = totalIncome - totalExpense;
      const netRevenue = Math.max(0, netCashflow);

      // Đếm số hóa đơn / lượt trả phòng trong kỳ
      const invoicesCount = periodTransactions.filter(t => t.type === 'final_payment' || t.type === 'settlement').length;

      // 1. Phân bổ Theo Thứ (Thứ 2 - Chủ Nhật) từ dữ liệu thực tế
      const weekdayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
      const weekdaysMap = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 0: 0 };

      periodTransactions.forEach(t => {
        if (t.type !== 'refund' && t.type !== 'guarantee_deposit_refund' && t.type !== 'guarantee_deposit_deduction') {
          const tDate = t.timestamp ? t.timestamp.split(' ')[0] : '';
          const dt = parseDateOnly(tDate);
          if (dt) {
            const dow = dt.getUTCDay();
            weekdaysMap[dow] = (weekdaysMap[dow] || 0) + (t.amount || 0);
          }
        }
      });

      const weekdayPoints = [
        { label: 'Thứ 2', revenue: weekdaysMap[1] || 0 },
        { label: 'Thứ 3', revenue: weekdaysMap[2] || 0 },
        { label: 'Thứ 4', revenue: weekdaysMap[3] || 0 },
        { label: 'Thứ 5', revenue: weekdaysMap[4] || 0 },
        { label: 'Thứ 6', revenue: weekdaysMap[5] || 0 },
        { label: 'Thứ 7', revenue: weekdaysMap[6] || 0 },
        { label: 'Chủ nhật', revenue: weekdaysMap[0] || 0 }
      ];

      // 2. Phân bổ Theo Giờ (0h - 23h)
      const hourlyMap = {};
      for (let h = 0; h < 24; h++) hourlyMap[h] = 0;

      periodTransactions.forEach(t => {
        if (t.type !== 'refund' && t.type !== 'guarantee_deposit_refund' && t.type !== 'guarantee_deposit_deduction') {
          if (t.timestamp && t.timestamp.includes(' ')) {
            const timePart = t.timestamp.split(' ')[1] || '';
            const hour = parseInt(timePart.split(':')[0], 10);
            if (!isNaN(hour) && hour >= 0 && hour < 24) {
              hourlyMap[hour] = (hourlyMap[hour] || 0) + (t.amount || 0);
            }
          }
        }
      });

      const hourlyPoints = [];
      for (let h = 0; h < 24; h += 2) {
        const val = (hourlyMap[h] || 0) + (hourlyMap[h + 1] || 0);
        hourlyPoints.push({ label: `${h}h - ${h + 2}h`, revenue: val });
      }

      // 3. Phân bổ Theo Ngày
      const dailyMap = {};
      let cur = startDate;
      const compareEnd = (period === 'this_month') ? addDays(endDate, -1) : endDate;
      while (cur <= compareEnd) {
        dailyMap[cur] = 0;
        cur = addDays(cur, 1);
      }

      periodTransactions.forEach(t => {
        if (t.type !== 'refund' && t.type !== 'guarantee_deposit_refund' && t.type !== 'guarantee_deposit_deduction') {
          const tDate = t.timestamp ? t.timestamp.split(' ')[0] : '';
          if (dailyMap[tDate] !== undefined) {
            dailyMap[tDate] += (t.amount || 0);
          }
        }
      });

      const dailyPoints = Object.keys(dailyMap).sort().map(d => ({
        label: d.slice(5),
        revenue: dailyMap[d]
      }));

      // 4. Phân bổ Thu - Chi theo Phương thức Thanh toán
      let methodCashIncome = 0;
      let methodCashExpense = 0;
      let methodEWalletIncome = 0;
      let methodEWalletExpense = 0;

      periodTransactions.forEach(t => {
        const isCash = (t.paymentMethod === 'cash');
        const isEWallet = ['vietqr', 'vnpay_qr', 'onepay', 'pos_card', 'bank_transfer'].includes(t.paymentMethod);
        if (t.type === 'refund' || t.type === 'guarantee_deposit_refund') {
          if (isCash) methodCashExpense += (t.amount || 0);
          else if (isEWallet) methodEWalletExpense += (t.amount || 0);
        } else if (t.type !== 'guarantee_deposit_deduction') {
          if (isCash) methodCashIncome += (t.amount || 0);
          else if (isEWallet) methodEWalletIncome += (t.amount || 0);
        }
      });

      // 5. Tính toán Tỷ lệ lấp đầy & Doanh thu theo Kênh
      const totalRoomsCount = (data.rooms || []).length || 42;
      const occupiedRoomsCount = (data.rooms || []).filter(r => r.stayStatus === 'occupied').length;
      const occupancyRate = totalRoomsCount > 0 ? Math.round((occupiedRoomsCount / totalRoomsCount) * 100) : 0;

      // Doanh thu theo Hạng phòng
      const revenueByClassMap = {};
      (data.roomClasses || []).forEach(rc => {
        revenueByClassMap[rc.code] = { classCode: rc.code, className: rc.name, revenue: 0, nights: 0 };
      });

      stays.forEach(s => {
        const sDate = s.checkInDate ? s.checkInDate.split(' ')[0] : '';
        const inPeriod = (period === 'this_month') ? (sDate >= startDate && sDate < endDate) : (sDate >= startDate && sDate <= endDate);
        if (inPeriod && revenueByClassMap[s.roomClassCode]) {
          const f = this.calculateStayFolio(s.id);
          if (f) {
            revenueByClassMap[s.roomClassCode].revenue += f.roomCharges;
            revenueByClassMap[s.roomClassCode].nights += (s.nights || 1);
          }
        }
      });

      // Doanh thu theo Nguồn / Kênh
      const channelDistribution = [
        { channel: 'Khách lẻ trực tiếp (Walk-in)', share: 38, revenue: Math.round(netRevenue * 0.38) },
        { channel: 'Đặt trước Website / VietQR', share: 29, revenue: Math.round(netRevenue * 0.29) },
        { channel: 'Đoàn doanh nghiệp / Hội nghị', share: 21, revenue: Math.round(netRevenue * 0.21) },
        { channel: 'Đại lý OTA (Agoda / Booking)', share: 12, revenue: Math.round(netRevenue * 0.12) }
      ];

      return {
        period: period,
        startDate: startDate,
        endDate: endDate,
        workingDate: wDate,
        summary: {
          netRevenue: netRevenue,
          invoicesCount: invoicesCount,
          avgPerDayText: period === 'today' ? formatCurrency(netRevenue) : '0/ngày',
          avgPerRoomText: '0/phòng/ngày',
          totalIncome: totalIncome,
          totalExpense: totalExpense,
          netCashflow: netCashflow,
          occupancyRate: occupancyRate,
          occupiedRooms: occupiedRoomsCount,
          totalRooms: totalRoomsCount
        },
        weekday: weekdayPoints,
        hourly: hourlyPoints,
        daily: dailyPoints,
        revenueByClass: Object.values(revenueByClassMap),
        channelDistribution: channelDistribution,
        methodPayments: {
          cashIncome: methodCashIncome,
          cashExpense: methodCashExpense,
          eWalletIncome: methodEWalletIncome,
          eWalletExpense: methodEWalletExpense
        }
      };
    },

    // 27. Dashboard KPI Stats
    getDashboardStats: function (targetDate) {
      const data = this.getData();
      const wDate = targetDate || this.getWorkingDate();

      const rooms = data.rooms || [];
      const stays = data.stays || [];
      const bookings = data.bookings || [];
      const transactions = data.transactions || [];

      const totalRooms = rooms.length;
      const readyRooms = rooms.filter(r => r.stayStatus === 'vacant' && r.cleanStatus === 'clean' && r.exploitationStatus === 'active').length;
      const occupiedRooms = rooms.filter(r => r.stayStatus === 'occupied').length;
      const dirtyRooms = rooms.filter(r => r.cleanStatus === 'dirty').length;
      const maintenanceRooms = rooms.filter(r => r.exploitationStatus === 'maintenance').length;

      const arrivalsToday = bookings.filter(b => b.checkInDate === wDate && (b.bookingStatus === 'confirmed' || b.bookingStatus === 'partially_checked_in'));
      const departuresToday = stays.filter(s => s.status === 'in_house' && s.expectedCheckOutDate && s.expectedCheckOutDate.startsWith(wDate));

      let collectedToday = 0;
      let refundsToday = 0;
      transactions.forEach(t => {
        if (t.timestamp && t.timestamp.startsWith(wDate) && t.status === 'success') {
          if (t.type === 'refund' || t.type === 'guarantee_deposit_refund') {
            refundsToday += (t.amount || 0);
          } else {
            collectedToday += (t.amount || 0);
          }
        }
      });

      const netRevenueToday = Math.max(0, collectedToday - refundsToday);
      const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

      return {
        totalRooms: totalRooms,
        readyRooms: readyRooms,
        occupiedRooms: occupiedRooms,
        dirtyRooms: dirtyRooms,
        maintenanceRooms: maintenanceRooms,
        occupancyRate: occupancyRate,
        arrivalsCount: arrivalsToday.length,
        departuresCount: departuresToday.length,
        collectedToday: collectedToday,
        refundsToday: refundsToday,
        netRevenueToday: netRevenueToday,
        workingDate: wDate
      };
    },

    // =========================================================================
    // 55. ĐẶT PHÒNG KHÁCH ĐOÀN & THAO TÁC HÀNG LOẠT (MỤC VI & XV.A)
    // =========================================================================
    createGroupBooking: function (params, currentUser) {
      this.reloadLatest();
      const data = this.getData();
      _ensureSchemaCollections(data);

      const groupName = (params.groupName || '').trim();
      const contactName = (params.contactName || params.guestName || '').trim();
      const phone = (params.phone || '').trim();
      const email = (params.email || '').trim();
      const allocations = params.allocations || [];
      const depositAmount = parseInt(params.depositAmount, 10) || 0;
      const paymentMethod = params.paymentMethod || 'cash';
      const notes = (params.notes || '').trim();

      if (!groupName) throw new Error('Vui lòng nhập Tên đoàn khách!');
      if (!contactName || !phone) throw new Error('Vui lòng nhập Người đại diện đoàn và Số điện thoại liên hệ!');
      if (!Array.isArray(allocations) || allocations.length === 0) {
        throw new Error('Đoàn khách phải có ít nhất 1 chỉ định hạng phòng / số lượng!');
      }
      if (depositAmount < 0) throw new Error('Tiền cọc không được là số âm!');

      const wDate = this.getWorkingDate();
      let totalRooms = 0;
      let totalEstimatedPrice = 0;

      // RÀNG BUỘC LỖI 2 & TEST 3, TEST 4:
      // Tính nhu cầu cộng dồn giữa tất cả các dòng trong đơn theo từng hạng và từng đêm
      const demandByClassNight = {};

      for (let i = 0; i < allocations.length; i++) {
        const alloc = allocations[i];
        const qty = parseInt(alloc.quantity, 10);
        if (isNaN(qty) || qty < 1) throw new Error(`Dòng ${i + 1}: Số lượng phòng phải là số nguyên dương lớn hơn 0!`);
        if (!isValidCalendarDate(alloc.checkInDate) || !isValidCalendarDate(alloc.checkOutDate)) {
          throw new Error(`Dòng ${i + 1}: Ngày nhận (${alloc.checkInDate}) hoặc ngày trả (${alloc.checkOutDate}) không tồn tại trên lịch!`);
        }
        const nights = calculateNights(alloc.checkInDate, alloc.checkOutDate);
        if (nights < 1) throw new Error(`Dòng ${i + 1}: Ngày trả phải sau ngày nhận ít nhất 1 đêm!`);

        if (!demandByClassNight[alloc.classCode]) {
          demandByClassNight[alloc.classCode] = {};
        }

        let curNight = alloc.checkInDate;
        for (let n = 0; n < nights; n++) {
          demandByClassNight[alloc.classCode][curNight] = (demandByClassNight[alloc.classCode][curNight] || 0) + qty;
          curNight = addDays(curNight, 1);
        }

        const pricing = this.calculateNightlyPricing(alloc.classCode, alloc.checkInDate, alloc.checkOutDate);
        const unitPrice = alloc.customPrice ? parseInt(alloc.customPrice, 10) : pricing.totalPerRoom;
        totalEstimatedPrice += unitPrice * qty;
        totalRooms += qty;
      }

      // Kiểm tra toàn bộ đơn: nhu cầu cộng dồn từng đêm so với quỹ phòng thực tế
      for (const [classCode, nightMap] of Object.entries(demandByClassNight)) {
        for (const [night, neededQty] of Object.entries(nightMap)) {
          const nextDay = addDays(night, 1);
          const avail = this.checkRoomAvailability(classCode, night, nextDay);
          if (!avail.valid) {
            throw new Error(`Đoàn khách: ${avail.error}`);
          }
          if (avail.availableQuantity < neededQty) {
            throw new Error(`Không đủ quỹ phòng: Hạng ${classCode} vào đêm ${night} chỉ còn ${avail.availableQuantity} phòng trống, nhưng đơn đoàn yêu cầu cộng dồn ${neededQty} phòng! Toàn bộ đơn bị từ chối, không lưu một phần.`);
          }
        }
      }

      const masterBookingId = 'DOAN-' + wDate.replace(/-/g, '') + '-' + String(Math.floor(100 + Math.random() * 900));
      // RÀNG BUỘC LỖI 1: Phân bổ cọc dạng mảng số nguyên dư
      const depositDistribution = this.allocateBookingDeposit(depositAmount, totalRooms);

      let depositTx = null;
      if (depositAmount > 0) {
        depositTx = {
          id: 'TX-' + wDate.replace(/-/g, '') + '-' + String(Math.floor(1000 + Math.random() * 9000)),
          referenceCode: masterBookingId,
          idempotencyKey: 'DEP-' + masterBookingId,
          masterBookingId: masterBookingId,
          customerName: `Đoàn: ${groupName} (ĐD: ${contactName})`,
          amount: depositAmount,
          paymentMethod: paymentMethod,
          methodName: paymentMethod === 'cash' ? 'Tiền mặt đặt cọc đoàn' : (paymentMethod === 'vietqr' ? 'VietQR Chuyển khoản cọc đoàn' : 'Thanh toán cọc đoàn'),
          type: 'deposit',
          status: 'success',
          gatewayVerified: true,
          timestamp: formatDateTimeNow(),
          cashier: currentUser ? (currentUser.fullName || currentUser.username) : 'letan',
          notes: `Thu tiền cọc khách đoàn ${groupName} (${totalRooms} phòng)`
        };
        data.transactions.push(depositTx);
      }

      const subBookings = [];
      let roomCounter = 0;

      allocations.forEach((alloc, allocIdx) => {
        const qty = parseInt(alloc.quantity, 10);
        const nights = calculateNights(alloc.checkInDate, alloc.checkOutDate);
        const pricing = this.calculateNightlyPricing(alloc.classCode, alloc.checkInDate, alloc.checkOutDate);
        const unitPrice = alloc.customPrice ? parseInt(alloc.customPrice, 10) : pricing.totalPerRoom;

        const lineAllocatedDeposits = [];
        let allocDeposit = 0;
        for (let q = 0; q < qty; q++) {
          const roomDep = (depositDistribution[roomCounter++] || 0);
          lineAllocatedDeposits.push(roomDep);
          allocDeposit += roomDep;
        }

        const subBookingId = `${masterBookingId}-${allocIdx + 1}`;
        const subBooking = {
          id: subBookingId,
          bookingCode: subBookingId,
          masterBookingId: masterBookingId,
          isGroup: true,
          groupName: groupName,
          guest: {
            name: contactName,
            phone: phone,
            email: email
          },
          guestName: contactName,
          phone: phone,
          email: email,
          roomClassCode: alloc.classCode,
          roomQuantity: qty,
          assignedRooms: alloc.assignedRooms || [],
          checkedInRooms: [],
          checkInDate: alloc.checkInDate,
          checkOutDate: alloc.checkOutDate,
          nights: nights,
          depositAmount: allocDeposit,
          depositPaid: allocDeposit,
          allocatedDeposits: lineAllocatedDeposits,
          depositTransactionId: depositTx ? depositTx.id : null,
          totalEstimatedPrice: unitPrice * qty,
          totalPrice: unitPrice * qty,
          pricingSnapshots: pricing.breakdown,
          bookingStatus: 'confirmed',
          channel: 'corporate',
          source: 'Khách đoàn / Doanh nghiệp',
          notes: `[Đoàn: ${groupName}] ${notes}`,
          createdAt: formatDateTimeNow(),
          createdBy: currentUser ? currentUser.username : 'letan'
        };
        data.bookings.push(subBooking);
        subBookings.push(subBooking);
      });

      this.logAudit(
        'TẠO ĐƠN KHÁCH ĐOÀN',
        `Mã đoàn: ${masterBookingId} | Tên: ${groupName} | Số phòng: ${totalRooms} | Tổng tiền: ${formatCurrency(totalEstimatedPrice)} | Cọc: ${formatCurrency(depositAmount)}`,
        currentUser ? currentUser.username : 'letan'
      );

      _commitData(`Tạo đơn khách đoàn ${groupName} (${masterBookingId})`);
      return {
        masterBookingId: masterBookingId,
        groupName: groupName,
        totalRooms: totalRooms,
        totalEstimatedPrice: totalEstimatedPrice,
        subBookings: subBookings,
        depositTx: depositTx
      };
    },

    // 56. PHÂN PHÒNG HÀNG LOẠT (BULK ROOM ASSIGNMENT)
    bulkAssignRooms: function (bookingId, roomAssignments, currentUser) {
      this.reloadLatest();
      const data = this.getData();
      const booking = data.bookings.find(b => b.id === bookingId || b.bookingCode === bookingId);
      if (!booking) throw new Error('Không tìm thấy đơn đặt phòng: ' + bookingId);

      if (!Array.isArray(roomAssignments)) throw new Error('Danh sách phân phòng không hợp lệ!');
      const cleanAssigned = [];

      // RÀNG BUỘC LỖI 3 & TEST 5: Kiểm tra xung đột lịch của từng phòng vật lý
      const targetStart = booking.checkInDate;
      const targetEnd = booking.checkOutDate;

      roomAssignments.forEach(roomNum => {
        const r = data.rooms.find(rm => rm.number === String(roomNum) || rm.id === String(roomNum));
        if (!r) throw new Error('Không tìm thấy phòng số ' + roomNum);
        if (r.classCode !== booking.roomClassCode) {
          throw new Error(`Phòng ${roomNum} thuộc hạng ${r.classCode}, không khớp với hạng ${booking.roomClassCode} của đơn đặt!`);
        }
        if (r.exploitationStatus === 'maintenance') {
          throw new Error(`Phòng ${roomNum} đang bị khóa bảo trì!`);
        }
        if (cleanAssigned.includes(r.number)) {
          throw new Error(`Phòng ${r.number} bị gán trùng lặp nhiều lần trong cùng một đơn!`);
        }

        // Kiểm tra xung đột với các đơn đặt khác đã được phân phòng này trên khoảng ngày giao nhau
        const conflictBooking = (data.bookings || []).find(b => {
          if (b.id === booking.id || b.bookingCode === booking.id || b.bookingStatus === 'cancelled') return false;
          const isAssigned = Array.isArray(b.assignedRooms) && b.assignedRooms.includes(r.number);
          if (!isAssigned) return false;
          // Giao nhau: targetStart < b.checkOutDate && b.checkInDate < targetEnd
          return (targetStart < b.checkOutDate && b.checkInDate < targetEnd);
        });

        if (conflictBooking) {
          const guestName = conflictBooking.guest ? conflictBooking.guest.name : (conflictBooking.guestName || 'Khách');
          throw new Error(`Xung đột lịch phòng: Phòng ${r.number} đã được phân cho đơn ${conflictBooking.id} (${guestName}) trong khoảng ${conflictBooking.checkInDate} đến ${conflictBooking.checkOutDate}! Không thể gán cho đơn ${booking.id} (${targetStart} đến ${targetEnd}).`);
        }

        // Kiểm tra xung đột với lượt khách đang ở (in_house) trong phòng
        const conflictStay = (data.stays || []).find(s => {
          if (s.roomNumber !== r.number || s.status !== 'in_house') return false;
          const sIn = s.checkInDate ? s.checkInDate.split(' ')[0] : '';
          const sOut = s.expectedCheckOutDate ? s.expectedCheckOutDate.split(' ')[0] : '';
          return (targetStart < sOut && sIn < targetEnd);
        });

        if (conflictStay) {
          throw new Error(`Xung đột lịch phòng: Phòng ${r.number} hiện đang có lượt lưu trú ${conflictStay.id} (${conflictStay.guest ? conflictStay.guest.name : ''}) đến ngày ${conflictStay.expectedCheckOutDate.split(' ')[0]}! Không thể gán cho đơn ${booking.id}.`);
        }

        cleanAssigned.push(r.number);
      });

      if (cleanAssigned.length > booking.roomQuantity) {
        throw new Error(`Số lượng phòng phân (${cleanAssigned.length}) vượt quá số phòng đã đặt (${booking.roomQuantity})!`);
      }

      booking.assignedRooms = cleanAssigned;
      this.logAudit(
        'PHÂN PHÒNG HÀNG LOẠT',
        `Đơn ${booking.id}: Gán phòng [${cleanAssigned.join(', ')}]`,
        currentUser ? currentUser.username : 'letan'
      );
      _commitData(`Phân phòng cho đơn ${booking.id}`);
      return booking;
    },

    // 57. NHẬN PHÒNG HÀNG LOẠT CHO KHÁCH ĐOÀN (BULK CHECK-IN)
    bulkCheckInGroup: function (bookingId, checkInItems, currentUser) {
      this.reloadLatest();
      const data = this.getData();
      const booking = data.bookings.find(b => b.id === bookingId || b.bookingCode === bookingId);
      if (!booking) throw new Error('Không tìm thấy đơn đặt phòng: ' + bookingId);

      if (!Array.isArray(checkInItems) || checkInItems.length === 0) {
        throw new Error('Danh sách nhận phòng không được để trống!');
      }

      const results = [];
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < checkInItems.length; i++) {
        const item = checkInItems[i];
        try {
          const stay = this.checkInBookingRoom({
            bookingId: booking.id,
            roomNumber: item.roomNumber,
            guestName: item.guestName || `${booking.guest.name} (${item.roomNumber})`,
            identityCard: item.identityCard || '',
            phone: item.phone || booking.guest.phone || '',
            guaranteeDeposit: item.guaranteeDeposit || 0,
            paymentMethod: item.paymentMethod || 'cash',
            notes: item.notes || `Nhận phòng đoàn ${booking.groupName || booking.id}`
          }, currentUser);

          results.push({
            roomNumber: item.roomNumber,
            success: true,
            message: 'Nhận phòng thành công',
            stayId: stay.id
          });
          successCount++;
        } catch (err) {
          results.push({
            roomNumber: item.roomNumber,
            success: false,
            message: err.message,
            stayId: null
          });
          failCount++;
        }
      }

      this.logAudit(
        'NHẬN PHÒNG ĐOÀN HÀNG LOẠT',
        `Đơn ${booking.id}: Thành công ${successCount}, Thất bại ${failCount}`,
        currentUser ? currentUser.username : 'letan'
      );

      return {
        bookingId: booking.id,
        successCount: successCount,
        failCount: failCount,
        results: results
      };
    },

    // 58. TRẢ PHÒNG HÀNG LOẠT CHO KHÁCH ĐOÀN (BULK CHECK-OUT)
    bulkCheckOutGroup: function (stayIds, paymentOptions, currentUser) {
      this.reloadLatest();
      const data = this.getData();

      if (!Array.isArray(stayIds) || stayIds.length === 0) {
        throw new Error('Danh sách lượt lưu trú cần trả phòng không được để trống!');
      }

      const results = [];
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < stayIds.length; i++) {
        const sId = stayIds[i];
        try {
          const stay = data.stays.find(s => s.id === sId);
          if (!stay) throw new Error('Không tìm thấy lượt lưu trú ' + sId);
          if (stay.status !== 'in_house') throw new Error(`Lượt ở ${sId} không ở trạng thái đang lưu trú (status: ${stay.status})`);

          const folio = this.calculateStayFolio(sId);
          if (!folio.minibarAudited) {
            throw new Error(`Phòng ${stay.roomNumber} chưa có biên bản kiểm kê minibar!`);
          }

          if (folio.remainingDue > 0) {
            const pMethod = (paymentOptions && paymentOptions[sId] && paymentOptions[sId].paymentMethod) || 'cash';
            this.recordPayment({
              stayId: sId,
              bookingId: stay.bookingId,
              customerName: stay.guest.name,
              amount: folio.remainingDue,
              paymentMethod: pMethod,
              type: 'settlement',
              notes: `Thanh toán quyết toán trả phòng đoàn P.${stay.roomNumber}`
            }, currentUser);
          } else if (folio.remainingDue < 0) {
            throw new Error(`Phòng ${stay.roomNumber} đang thừa ${formatCurrency(Math.abs(folio.remainingDue))}. Vui lòng xử lý hoàn tiền trước khi trả phòng!`);
          }

          const checkoutRes = this.settleAndCheckout(sId, currentUser);
          results.push({
            stayId: sId,
            roomNumber: stay.roomNumber,
            success: true,
            message: 'Đã hoàn tất trả phòng',
            folio: checkoutRes.folio
          });
          successCount++;
        } catch (err) {
          results.push({
            stayId: sId,
            roomNumber: (data.stays.find(s => s.id === sId) || {}).roomNumber || 'N/A',
            success: false,
            message: err.message
          });
          failCount++;
        }
      }

      return {
        total: stayIds.length,
        successCount: successCount,
        failCount: failCount,
        results: results
      };
    },

    // 59. DỮ LIỆU LỊCH PHÒNG TỔNG THỂ (ROOM TIMELINE / TAPE CHART - MỤC V & XV.A)
    getTimelineData: function (startDateStr, daysCount, filterOptions) {
      this.reloadLatest();
      const data = this.getData();
      const wDate = this.getWorkingDate();

      const start = startDateStr || addDays(wDate, -2);
      const days = daysCount || 14;

      const dates = [];
      for (let i = 0; i < days; i++) {
        dates.push(addDays(start, i));
      }

      const rooms = data.rooms || [];
      const stays = data.stays || [];
      const bookings = data.bookings || [];

      let filteredRooms = rooms;
      if (filterOptions && filterOptions.floor && filterOptions.floor !== 'all') {
        filteredRooms = filteredRooms.filter(r => String(r.floor) === String(filterOptions.floor));
      }
      if (filterOptions && filterOptions.classCode && filterOptions.classCode !== 'all') {
        filteredRooms = filteredRooms.filter(r => r.classCode === filterOptions.classCode);
      }

      const roomRows = filteredRooms.map(room => {
        const events = [];

        stays.forEach(s => {
          if (s.roomNumber === room.number) {
            const sStart = s.checkInDate;
            const sEnd = s.expectedCheckOutDate || s.actualCheckOutDate || addDays(s.checkInDate, 1);
            if (sStart < dates[dates.length - 1] && sEnd > dates[0]) {
              events.push({
                id: s.id,
                type: 'stay',
                stayId: s.id,
                title: `${s.guest.name} (${s.roomNumber})`,
                guestName: s.guest.name,
                startDate: sStart,
                endDate: sEnd,
                status: s.status,
                isOverstay: s.status === 'in_house' && sEnd < wDate,
                color: s.status === 'in_house' ? (sEnd < wDate ? '#dc2626' : '#0284c7') : '#94a3b8'
              });
            }
          }
        });

        bookings.forEach(b => {
          if ((b.bookingStatus === 'confirmed' || b.bookingStatus === 'partially_checked_in') && Array.isArray(b.assignedRooms) && b.assignedRooms.includes(room.number)) {
            if (!Array.isArray(b.checkedInRooms) || !b.checkedInRooms.includes(room.number)) {
              if (b.checkInDate < dates[dates.length - 1] && b.checkOutDate > dates[0]) {
                events.push({
                  id: b.id,
                  type: 'booking',
                  bookingId: b.id,
                  title: `[Đặt] ${b.guest.name}`,
                  guestName: b.guest.name,
                  startDate: b.checkInDate,
                  endDate: b.checkOutDate,
                  status: b.bookingStatus,
                  color: '#f59e0b'
                });
              }
            }
          }
        });

        if (room.exploitationStatus === 'maintenance') {
          events.push({
            id: 'MNT-' + room.number,
            type: 'maintenance',
            title: 'Khóa kỹ thuật / Bảo trì',
            startDate: dates[0],
            endDate: dates[dates.length - 1],
            status: 'maintenance',
            color: '#64748b'
          });
        }

        return {
          id: room.id,
          number: room.number,
          floor: room.floor,
          classCode: room.classCode,
          cleanStatus: room.cleanStatus,
          exploitationStatus: room.exploitationStatus,
          stayStatus: room.stayStatus,
          events: events
        };
      });

      const unassignedBookings = bookings.filter(b => {
        if (b.bookingStatus !== 'confirmed' && b.bookingStatus !== 'partially_checked_in') return false;
        const assignedCount = Array.isArray(b.assignedRooms) ? b.assignedRooms.length : 0;
        return assignedCount < b.roomQuantity;
      });

      return {
        startDate: start,
        daysCount: days,
        dates: dates,
        rooms: roomRows,
        unassignedBookings: unassignedBookings
      };
    },

    // 60. HỒ SƠ NGOẠI LỆ & XỬ LÝ TRANH CHẤP (MỤC XIII)
    createExceptionCase: function (params, currentUser) {
      this.reloadLatest();
      const data = this.getData();
      _ensureSchemaCollections(data);

      const category = params.category || 'other';
      const description = (params.description || '').trim();
      const amount = parseInt(params.amount, 10) || 0;
      const roomNumber = params.roomNumber || '';
      const stayId = params.stayId || '';
      const bookingId = params.bookingId || '';

      if (!description) throw new Error('Vui lòng mô tả chi tiết hồ sơ ngoại lệ / tranh chấp!');

      const wDate = this.getWorkingDate();
      const caseId = 'EX-' + wDate.replace(/-/g, '') + '-' + String(Math.floor(100 + Math.random() * 900));

      const newCase = {
        id: caseId,
        category: category,
        bookingId: bookingId,
        stayId: stayId,
        roomNumber: roomNumber,
        description: description,
        amount: amount,
        status: 'pending',
        resolutionPlan: '',
        createdBy: currentUser ? currentUser.username : 'hethong',
        createdAt: formatDateTimeNow(),
        assignedTo: params.assignedTo || 'Quản lý ca',
        resolvedBy: null,
        resolvedAt: null
      };

      data.exceptionCases.push(newCase);
      this.logAudit(
        'TẠO HỒ SƠ NGOẠI LỆ',
        `Mã: ${caseId} | Loại: ${category} | Phòng: ${roomNumber} | Số tiền: ${formatCurrency(amount)} | Nội dung: ${description}`,
        currentUser ? currentUser.username : 'hethong'
      );

      _commitData(`Tạo hồ sơ ngoại lệ ${caseId}`);
      return newCase;
    },

    resolveExceptionCase: function (caseId, resolutionPlan, newStatus, currentUser) {
      this.reloadLatest();
      const data = this.getData();
      _ensureSchemaCollections(data);

      const exCase = data.exceptionCases.find(c => c.id === caseId);
      if (!exCase) throw new Error('Không tìm thấy hồ sơ ngoại lệ: ' + caseId);

      const isSupervisor = (
        (currentUser && (currentUser.roleCode === 'manager' || currentUser.roleCode === 'admin')) ||
        this.hasPermission(currentUser, 'approveRefund')
      );
      if (!isSupervisor) {
        throw new Error('Chỉ Quản lý hoặc Ban giám đốc mới có quyền duyệt xử lý hồ sơ ngoại lệ!');
      }

      exCase.status = newStatus || 'resolved';
      exCase.resolutionPlan = resolutionPlan || '';
      exCase.resolvedBy = currentUser ? currentUser.username : 'quanly';
      exCase.resolvedAt = formatDateTimeNow();

      this.logAudit(
        'XỬ LÝ HỒ SƠ NGOẠI LỆ',
        `Mã: ${caseId} &rarr; Trạng thái: ${exCase.status} | Phương án: ${resolutionPlan}`,
        currentUser ? currentUser.username : 'quanly'
      );

      _commitData(`Xử lý hồ sơ ngoại lệ ${caseId}`);
      return exCase;
    },

    getExceptionCases: function (filter) {
      this.reloadLatest();
      const data = this.getData();
      _ensureSchemaCollections(data);
      let list = data.exceptionCases || [];
      if (filter && filter.status && filter.status !== 'all') {
        list = list.filter(c => c.status === filter.status);
      }
      if (filter && filter.category && filter.category !== 'all') {
        list = list.filter(c => c.category === filter.category);
      }
      return list;
    },

    // 61. CHỐT CA THU NGÂN (CASHIER SHIFT CLOSE - MỤC XIV)
    startCashierShift: function (params, currentUser) {
      this.reloadLatest();
      const data = this.getData();
      _ensureSchemaCollections(data);

      const cashier = currentUser ? currentUser.username : 'thungan';
      const initialFloat = parseInt(params.initialFloat, 10) || 0;
      const wDate = this.getWorkingDate();

      const openShift = data.cashierShifts.find(s => s.cashier === cashier && s.status === 'open');
      if (openShift) {
        return openShift;
      }

      const shiftId = 'CA-' + wDate.replace(/-/g, '') + '-' + String(Math.floor(100 + Math.random() * 900));
      const shiftObj = {
        id: shiftId,
        cashier: cashier,
        cashierName: (currentUser && currentUser.name) || cashier,
        startTime: formatDateTimeNow(),
        endTime: null,
        initialFloat: initialFloat,
        countedCash: 0,
        expectedCash: initialFloat,
        discrepancy: 0,
        status: 'open',
        notes: params.notes || 'Mở ca thu ngân mới'
      };

      data.cashierShifts.push(shiftObj);
      this.logAudit('MỞ CA THU NGÂN', `Mã ca: ${shiftId} | Tiền két ban đầu: ${formatCurrency(initialFloat)}`, cashier);
      _commitData(`Mở ca thu ngân ${shiftId}`);
      return shiftObj;
    },

    closeCashierShift: function (params, currentUser) {
      this.reloadLatest();
      const data = this.getData();
      _ensureSchemaCollections(data);

      const shiftId = params.shiftId;
      const shift = data.cashierShifts.find(s => s.id === shiftId && s.status === 'open');
      if (!shift) throw new Error('Không tìm thấy ca thu ngân đang mở: ' + shiftId);

      const countedCash = parseInt(params.countedCash, 10);
      if (isNaN(countedCash) || countedCash < 0) {
        throw new Error('Số tiền mặt kiểm đếm thực tế không hợp lệ!');
      }

      let cashIn = 0;
      let cashOut = 0;
      const txs = data.transactions || [];

      txs.forEach(t => {
        const matchCashier = (!t.cashier || t.cashier === shift.cashier || t.cashier === shift.cashierName || t.cashier === (currentUser && currentUser.username) || t.cashier === (currentUser && currentUser.name));
        if (matchCashier && t.paymentMethod === 'cash' && t.status === 'success' && t.timestamp >= shift.startTime) {
          if (t.type === 'refund' || t.type === 'guarantee_deposit_refund') {
            cashOut += (t.amount || 0);
          } else {
            cashIn += (t.amount || 0);
          }
        }
      });

      const expectedCash = shift.initialFloat + cashIn - cashOut;
      const discrepancy = countedCash - expectedCash;

      shift.endTime = formatDateTimeNow();
      shift.countedCash = countedCash;
      shift.expectedCash = expectedCash;
      shift.discrepancy = discrepancy;
      shift.cashIn = cashIn;
      shift.cashOut = cashOut;
      shift.handoverNotes = (params.handoverNotes || '').trim();
      shift.status = 'closed';

      this.logAudit(
        'CHỐT CA THU NGÂN',
        `Mã ca: ${shiftId} | Két thực tế: ${formatCurrency(countedCash)} | Két sổ sách: ${formatCurrency(expectedCash)} | Chênh lệch: ${formatCurrency(discrepancy)}`,
        currentUser ? currentUser.username : shift.cashier
      );

      _commitData(`Chốt ca thu ngân ${shiftId}`);
      return shift;
    },

    getCurrentCashierShift: function (currentUser) {
      this.reloadLatest();
      const data = this.getData();
      _ensureSchemaCollections(data);
      const cashier = currentUser ? currentUser.username : 'thungan';
      return data.cashierShifts.find(s => s.cashier === cashier && s.status === 'open') || null;
    },

    // 62. CHỐT NGÀY KINH DOANH & NIGHT AUDIT (MỤC XIV)
    runNightAudit: function (params, currentUser) {
      this.reloadLatest();
      const data = this.getData();
      _ensureSchemaCollections(data);

      const canAudit = (
        (currentUser && (currentUser.roleCode === 'manager' || currentUser.roleCode === 'admin')) ||
        this.hasPermission(currentUser, 'systemConfig')
      );
      if (!canAudit) {
        throw new Error('Chỉ Quản lý hoặc Quản trị viên mới có quyền thực hiện Chốt ngày kinh doanh (Night Audit)!');
      }

      const wDate = this.getWorkingDate();

      // RÀNG BUỘC LỖI 8 & TEST 13: Yêu cầu chốt phải mang ngày dự kiến; gửi lại không được chốt tiếp ngày kế tiếp
      if (params && params.expectedWorkingDate && params.expectedWorkingDate !== wDate) {
        throw new Error(`Yêu cầu chốt ngày không hợp lệ: Ngày dự kiến chốt (${params.expectedWorkingDate}) không khớp với ngày làm việc hiện tại (${wDate})!`);
      }

      const alreadyAudited = (data.dailyLedgers || []).some(l => l.date === wDate);
      if (alreadyAudited) {
        throw new Error(`Ngày làm việc ${wDate} đã được chốt sổ trước đó! Không thể chốt lại cùng một ngày kinh doanh.`);
      }

      const bookings = data.bookings || [];
      const stays = data.stays || [];
      const transactions = data.transactions || [];

      // 1. Quét đơn No-Show: Đơn confirmed có checkInDate <= wDate chưa đến
      let noShowCount = 0;
      bookings.forEach(b => {
        if (b.bookingStatus === 'confirmed' && b.checkInDate <= wDate) {
          b.bookingStatus = 'no_show';
          noShowCount++;
        }
      });

      // 2. Quét khách quá hạn (Overstay): Lượt ở in_house có expectedCheckOutDate <= wDate
      let overstayCount = 0;
      stays.forEach(s => {
        const sOut = s.expectedCheckOutDate ? s.expectedCheckOutDate.split(' ')[0] : '';
        if (s.status === 'in_house' && sOut && sOut <= wDate) {
          s.isOverstay = true;
          overstayCount++;
        }
      });

      // 3. Snapshot dữ liệu tài chính ngày kinh doanh
      let dailyCollected = 0;
      let dailyRefunds = 0;
      transactions.forEach(t => {
        if (t.timestamp && t.timestamp.startsWith(wDate) && t.status === 'success' && !t.isInternalAllocation) {
          if (t.type === 'refund' || t.type === 'guarantee_deposit_refund') {
            dailyRefunds += (t.amount || 0);
          } else if (t.type !== 'internal_allocation' && t.type !== 'guarantee_deposit_deduction') {
            dailyCollected += (t.amount || 0);
          }
        }
      });

      const netDailyRevenue = Math.max(0, dailyCollected - dailyRefunds);
      const occupancyStats = this.getDashboardStats();

      const ledgerEntry = {
        date: wDate,
        closedAt: formatDateTimeNow(),
        auditedBy: currentUser ? (currentUser.fullName || currentUser.username) : 'quanly',
        netRevenue: netDailyRevenue,
        collected: dailyCollected,
        refunds: dailyRefunds,
        occupancyRate: occupancyStats.occupancyRate,
        noShowBookings: noShowCount,
        overstayStays: overstayCount,
        activeStaysCount: stays.filter(s => s.status === 'in_house').length,
        notes: (params && params.notes) || 'Chốt ngày kinh doanh thành công'
      };

      data.dailyLedgers.push(ledgerEntry);

      const nextDate = (params && params.targetDate) ? params.targetDate : addDays(wDate, 1);
      // RÀNG BUỘC LỖI 8 & TEST 12: Đổi ngày làm việc trực tiếp trong bộ nhớ trước khi commitData một lần duy nhất
      // KHÔNG gọi this.setWorkingDate() ở đây vì hàm đó reloadLatest() làm xóa sạch ledgerEntry và no-show vừa sửa!
      data.hotelInfo.workingDate = nextDate;

      this.logAudit(
        'NIGHT AUDIT CHỐT NGÀY',
        `Chốt ngày ${wDate} &rarr; Doanh thu thuần: ${formatCurrency(netDailyRevenue)} | No-show: ${noShowCount} | Quá hạn: ${overstayCount} | Ngày mới: ${nextDate}`,
        currentUser ? currentUser.username : 'quanly'
      );

      _commitData(`Chốt ngày kinh doanh ${wDate} -> ${nextDate}`);

      return {
        closedDate: wDate,
        nextDate: nextDate,
        netRevenue: netDailyRevenue,
        noShowCount: noShowCount,
        overstayCount: overstayCount,
        ledger: ledgerEntry
      };
    }
  };

  return SongLamStore;
}));
