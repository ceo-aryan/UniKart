const STEPS = ['placed', 'accepted', 'ready', 'out_for_delivery', 'delivered'];
const LABELS = {
  placed: 'Order placed',
  accepted: 'Accepted by store',
  ready: 'Ready for pickup',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  rejected: 'Rejected by store'
};

api('/api/auth/me')
  .then((data) => {
    if (data.user.role !== 'customer') {
      window.location.href = HOME_PAGE[data.user.role];
      return;
    }
    loadOrders();
    setInterval(loadOrders, 10000); // refresh every 10 seconds for live status
  })
  .catch(() => (window.location.href = '/login.html'));

document.getElementById('logoutBtn').onclick = async () => {
  await api('/api/auth/logout', 'POST');
  window.location.href = '/login.html';
};

async function loadOrders() {
  const { orders } = await api('/api/orders/mine');
  const box = document.getElementById('orderList');

  if (orders.length === 0) {
    box.innerHTML = '<p class="text-muted">You have not placed any orders yet.</p>';
    return;
  }

  box.innerHTML = orders.map((o) => {
    const rejected = o.status === 'rejected';
    const step = STEPS.indexOf(o.status);
    const percent = rejected ? 100 : ((step + 1) / STEPS.length) * 100;
    const color = rejected ? 'bg-danger' : o.status === 'delivered' ? 'bg-success' : 'bg-primary';

    return `
      <div class="card shadow-sm mb-3">
        <div class="card-body">
          <div class="d-flex justify-content-between">
            <h6 class="mb-0">Order #${o.id} · ${esc(o.store_name)}</h6>
            <span class="fw-bold">₹${o.total}</span>
          </div>
          <small class="text-muted">${esc(o.created_at)} (UTC) · Deliver to: ${esc(o.location_name)}</small>

          <ul class="list-unstyled my-3 small">
            ${o.items.map((i) => `<li>${esc(i.name)} × ${i.quantity} — ₹${i.price * i.quantity}</li>`).join('')}
          </ul>

          <div class="progress mb-1" style="height: 8px;">
            <div class="progress-bar ${color}" style="width: ${percent}%"></div>
          </div>
          <small class="fw-semibold ${rejected ? 'text-danger' : ''}">${LABELS[o.status]}</small>
        </div>
      </div>`;
  }).join('');
}