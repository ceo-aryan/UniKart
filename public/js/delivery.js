function showMsg(text, type = 'danger') {
  document.getElementById('msg').innerHTML = `<div class="alert alert-${type}">${esc(text)}</div>`;
  setTimeout(() => (document.getElementById('msg').innerHTML = ''), 4000);
}

// ---------- Startup ----------
api('/api/auth/me')
  .then((data) => {
    if (data.user.role !== 'delivery') {
      window.location.href = HOME_PAGE[data.user.role];
      return;
    }
    document.getElementById('userName').textContent = data.user.name;
    loadAll();
    setInterval(loadAll, 10000);
  })
  .catch((err) => {
    console.error('Startup failed:', err);
    if (err.message === 'Please log in first') {
      window.location.href = '/login.html';
    } else {
      showMsg('Could not load the page: ' + err.message);
    }
  });

document.getElementById('logoutBtn').onclick = async () => {
  await api('/api/auth/logout', 'POST');
  window.location.href = '/login.html';
};

// ---------- Rendering ----------
function card(o, mode) {
  let action = '';
  if (mode === 'available') {
    action = `<button class="btn btn-success btn-sm" data-pickup="${o.id}">Pick up</button>`;
  } else if (mode === 'active') {
    action = `<button class="btn btn-primary btn-sm" data-deliver="${o.id}">Mark delivered</button>`;
  } else {
    action = '<span class="badge text-bg-success">Delivered</span>';
  }

  return `
    <div class="card shadow-sm mb-3">
      <div class="card-body">
        <div class="d-flex justify-content-between">
          <h6 class="mb-1">Order #${o.id}</h6>
          <b>Collect ₹${o.total}</b>
        </div>
        <div class="small"><b>Pickup:</b> ${esc(o.store_name)} (${esc(o.store_location)})</div>
        <div class="small"><b>Deliver to:</b> ${esc(o.location_name)}</div>
        <div class="small mb-2"><b>Customer:</b> ${esc(o.customer_name)}</div>
        <ul class="list-unstyled small text-muted mb-3">
          ${o.items.map((i) => `<li>${esc(i.name)} × ${i.quantity}</li>`).join('')}
        </ul>
        ${action}
      </div>
    </div>`;
}

async function loadAll() {
  const [avail, mine] = await Promise.all([
    api('/api/delivery/available'),
    api('/api/delivery/mine')
  ]);

  const active = mine.orders.filter((o) => o.status === 'out_for_delivery');
  const done = mine.orders.filter((o) => o.status === 'delivered');

  document.getElementById('myActive').innerHTML =
    active.length ? active.map((o) => card(o, 'active')).join('')
                  : '<p class="text-muted">You have no active deliveries.</p>';

  document.getElementById('availableList').innerHTML =
    avail.orders.length ? avail.orders.map((o) => card(o, 'available')).join('')
                        : '<p class="text-muted">No orders are waiting for pickup.</p>';

  document.getElementById('doneList').innerHTML =
    done.length ? done.map((o) => card(o, 'done')).join('')
                : '<p class="text-muted">No completed deliveries yet.</p>';
}

// ---------- Actions ----------
document.body.addEventListener('click', async (e) => {
  const pickup = e.target.dataset.pickup;
  const deliver = e.target.dataset.deliver;
  if (!pickup && !deliver) return;

  try {
    if (pickup) await api(`/api/delivery/orders/${pickup}/pickup`, 'POST');
    if (deliver) await api(`/api/delivery/orders/${deliver}/deliver`, 'POST');
  } catch (err) {
    showMsg(err.message);
  }
  loadAll();
});