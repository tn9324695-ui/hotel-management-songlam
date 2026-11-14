(function (root) {
  'use strict';
  const labels = { VACANT: 'Trống', OCCUPIED: 'Có khách', CLEAN: 'Sạch', DIRTY: 'Chờ dọn', CLEANING: 'Đang dọn', INSPECTING: 'Chờ nghiệm thu', ACTIVE: 'Đang khai thác', INACTIVE: 'Ngừng khai thác', MAINTENANCE: 'Bảo trì / chặn',
    PENDING: 'Chờ xác nhận', CONFIRMED: 'Đã xác nhận', PARTIALLY_CHECKED_IN: 'Đã nhận một phần', CHECKED_IN: 'Đã nhận đủ', IN_HOUSE: 'Đang lưu trú', CHECKED_OUT: 'Đã trả', CANCELLED: 'Đã hủy', NO_SHOW: 'Không đến', COMPLETED: 'Hoàn tất', BOOKING: 'Đặt trước', STAY: 'Đang ở', BLOCK: 'Chặn phòng', HELD:'Đang giữ phòng', BLOCKED:'Bị chặn', NIGHT:'Tiền phòng theo đêm', HOURLY_PACKAGE:'Gói theo giờ', HOURLY_EXTRA_BLOCKS:'Giờ phát sinh', EARLY_ARRIVAL:'Nhận sớm', LATE_DEPARTURE:'Trả muộn' };
  const money = value => { try {
    if (!(typeof value === 'string' && /^-?(?:0|[1-9]\d*)$/.test(value) || typeof value === 'number' && Number.isSafeInteger(value))) return 'Chưa có giá';
    return new Intl.NumberFormat('vi-VN').format(BigInt(value)) + ' ₫';
  } catch { return 'Chưa có giá'; } };
  // Explicit hotel clock, never browser timezone. v1 backend supports fixed offset.
  function hotelInstant(value, zone) {
    if (!['SE Asia Standard Time', 'Asia/Ho_Chi_Minh'].includes(zone)) throw new Error('Chưa xác minh múi giờ khách sạn để gửi ngày giờ.');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Ngày giờ không hợp lệ.');
    const instant = value + ':00+07:00';
    if (!Number.isFinite(Date.parse(instant)) || new Date(Date.parse(instant) + 7 * 3600000).toISOString().slice(0, 16) !== value) throw new Error('Ngày giờ không tồn tại.');
    return instant;
  }
  function hotelDate(value, zone) {
    if (!['SE Asia Standard Time', 'Asia/Ho_Chi_Minh'].includes(zone) || !Number.isFinite(Date.parse(value))) throw new Error('Chưa có ngày giờ và múi giờ khách sạn hợp lệ.');
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value)).map(part=>[part.type,part.value]));
    return parts.year+'-'+parts.month+'-'+parts.day;
  }
  function quote(value) {
    const validAmount=amount=>typeof amount==='string'&&/^(?:0|[1-9]\d{0,18})$/.test(amount);
    if(value?.kind!=='ESTIMATE'||value.committed!==false||value.currency!=='VND'||!validAmount(value.totals?.accommodationTotalVnd)
      ||typeof value.policy?.code!=='string'||!value.policy.code||!Number.isSafeInteger(value.policy.version)||value.policy.version<1
      ||!Number.isFinite(Date.parse(value.quotedAt))||!Array.isArray(value.breakdown)||!value.breakdown.length
      ||value.breakdown.some(line=>!validAmount(line.totalVnd)||typeof line.kind!=='string'))throw new Error('Báo giá chưa có tổng tiền, bảng kê hoặc phiên bản chính sách hợp lệ. Không thể dùng để xác nhận.');
    return value;
  }
  root.SongLamUi = Object.freeze({ money, hotelInstant, hotelDate, quote, label: value => labels[value] || value || '—',
    date: value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.split('-').reverse().join('/') : value ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—' });
}(window));
