(function (root) {
  'use strict';
  const $ = id => document.getElementById(id), client = root.SongLamHttp.getClient();
  const displayError = error => (error.message || 'Không tải được kết quả.') + (error.requestId ? ' · Mã theo dõi: ' + error.requestId : '');
  async function lookup(ticket) {
    const me = await client.request('/auth/me');
    const result = await client.request('/requests/lookup', { method: 'POST', body: {
      operation: ticket.operation, originalRequestId: ticket.originalRequestId, idempotencyKey: ticket.idempotencyKey
    }, headers: { 'X-CSRF-Token': me.data.csrfToken } });
    if (['COMMITTED', 'REJECTED'].includes(result.data.status)) root.SongLamWrites.resolved(ticket, result.data);
    const labels = { COMMITTED: 'Đã commit. Không thực hiện lại; tải lại màn hình nghiệp vụ để đối chiếu.', REJECTED: 'Yêu cầu gốc bị từ chối. Không có giao dịch mới được tạo bởi thao tác tra cứu.',
      PENDING: 'Đang xử lý. Tiếp tục khóa thao tác, tra cứu lại bằng mã cũ.', UNKNOWN: 'Chưa xác định. Dừng ghi và báo người phụ trách; không suy ra là đã rollback.' };
    $('lookup-result').textContent = (labels[result.data.status] || 'Phản hồi chưa hợp lệ. Giữ nguyên trạng thái chờ.')
      + (result.data.receiptReference ? ' · Receipt: ' + result.data.receiptReference : '');
    renderPending();
  }
  function renderPending() {
    const area = $('pending-requests'); area.replaceChildren();
    try {
      const rows = root.SongLamWrites.pending();
      if (!rows.length) { area.textContent = 'Không có mã chờ trong tab này. Điều này không chứng minh toàn hệ thống đã đối soát.'; return; }
      for (const row of rows) {
        const box = document.createElement('div'), text = document.createElement('p'), button = document.createElement('button');
        text.textContent = row.operation + ' · ' + row.originalRequestId + ' · Khóa: ' + row.idempotencyKey;
        button.type = 'button'; button.className = 'btn btn-outline-primary'; button.textContent = 'Tra cứu bằng khóa gốc';
        button.addEventListener('click', async () => { button.disabled = true; try { await lookup(row); } catch (e) { $('lookup-result').textContent = displayError(e); } finally { button.disabled = false; } });
        box.append(text, button); area.append(box);
      }
    } catch (error) { area.textContent = displayError(error); }
  }
  async function refresh() {
    const state = await root.SongLamDeployment.refresh();
    $('deployment-status').textContent = 'Chế độ: ' + state.mode + ' · ' + (state.writable ? 'Backend cho phép ghi theo phạm vi nghiệm thu.' : 'Ghi đang khóa.')
      + ' · Build: ' + (state.buildId || 'chưa xác nhận') + ' · Điểm chặn: ' + (state.blockers?.join(', ') || 'không có thông tin đối soát');
    renderPending();
  }
  $('lookup-request').addEventListener('submit', async event => {
    event.preventDefault(); const submit = event.currentTarget.querySelector('button'); submit.disabled = true;
    try { await lookup({ operation: $('request-operation').value.trim(), originalRequestId: $('request-id').value.trim(), idempotencyKey: $('request-key').value.trim() }); }
    catch (error) { $('lookup-result').textContent = displayError(error); } finally { submit.disabled = false; }
  });
  $('reload-status').addEventListener('click', refresh);
  root.addEventListener('pms-pending-change', renderPending);
  refresh();
}(globalThis));
