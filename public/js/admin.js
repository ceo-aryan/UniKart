const STATUS = {
  placed: ['Placed', 'warning'],
  accepted: ['Preparing', 'info'],
  ready: ['Ready', 'primary'],
  out_for_delivery: ['Out for delivery', 'primary'],
  delivered: ['Delivered', 'success'],
  rejected: ['Rejected', 'danger']
};
const ROLE_COLOR = { admin: 'danger', customer: 'primary', storekeeper: 'dark', delivery: 'success' };

function showMsg(text, type = 'danger') {
  document.getElementById('msg').innerHTML = `<div class="alert alert-${type}">${esc(text)}</div>`;
  setTimeout(() => (document.getElementById('msg').innerHTML = ''), 4000);
}

// ---------- Startup ----------
api('/api/auth/me')
  .then((data) => {
    if (data.user.role !== 'admin') {
      window.location.href = HOME_PAGE[data.user.role];
      return;
    }
    document.getElementById('userName').textContent = data.user.name;
    loadStats(); loadUsers(); loadStores(); loadOrders(); loadLocations();
    // Only monitoring data refreshes automatically; forms are left alone
    setInterval(() => { loadStats(); loadOrders(); }, 10000);
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

// ---------- Tabs ----------
const TABS = ['overview', 'users', 'stores', 'orders', 'locations'];
document.querySelectorAll('[data-tab]').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('[data-tab]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    TABS.forEach((t) =>
      document.getElementById('tab-' + t).classList.toggle('d-none', t !== btn.dataset.tab));
  };
});

// ---------- Overview ----------
async function loadStats() {
  const s = await api('/api/admin/stats');
  const box = (label, value, color = 'primary') => `
    <div class="col-6 col-md-3">
      <div class="card shadow-sm text-center">
        <div class="card-body">
          <div class="fs-3 fw-bold text-${color}">${value}</div>
          <div class="small text-muted">${label}</div>
        </div>
      </div>
    </div>`;

  document.getElementById('statsBox').innerHTML =
    box('Customers', s.customers) +
    box('Delivery staff', s.deliveryStaff, 'success') +
    box('Approved stores', s.approvedStores, 'dark') +
    box('Suspended stores', s.pendingStores, 'warning') +
    box('Total orders', s.totalOrders) +
    box('Active orders', s.activeOrders, 'warning') +
    box('Delivered orders', s.deliveredOrders, 'success') +
    box('Sales delivered', '₹' + s.revenue, 'success');
}

// ---------- Users ----------
async function loadUsers() {
  const { users } = await api('/api/admin/users');
  document.getElementById('userRows').innerHTML = users.map((u) => `
    <tr>
      <td>${esc(u.name)}</td>
      <td>${esc(u.email)}</td>
      <td><span class="badge text-bg-${ROLE_COLOR[u.role]}">${u.role}</span></td>
      <td class="text-end">
        ${u.role === 'admin' ? '' : `<button class="btn btn-outline-danger btn-sm" data-del-user="${u.id}">Delete</button>`}
      </td>
    </tr>`).join('');
}

// Show store fields only when creating a storekeeper
document.getElementById('uRole').onchange = (e) => {
  document.getElementById('storeFields').classList.toggle('d-none', e.target.value !== 'storekeeper');
};

document.getElementById('createUserBtn').onclick = async () => {
  try {
    await api('/api/admin/users', 'POST', {
      name: document.getElementById('uName').value,
      email: document.getElementById('uEmail').value,
      password: document.getElementById('uPassword').value,
      role: document.getElementById('uRole').value,
      storeName: document.getElementById('uStoreName').value,
      storeLocation: document.getElementById('uStoreLocation').value
    });
    ['uName', 'uEmail', 'uPassword', 'uStoreName', 'uStoreLocation']
      .forEach((id) => (document.getElementById(id).value = ''));
    showMsg('Account created', 'success');
    loadUsers(); loadStores(); loadStats();
  } catch (err) {
    showMsg(err.message);
  }
};

// ---------- Stores ----------
async function loadStores() {
  const { stores } = await api('/api/admin/stores');
  document.getElementById('storeRows').innerHTML = stores.map((s) => `
    <tr>
      <td><b>${esc(s.name)}</b><br><small class="text-muted">${esc(s.location)}</small></td>
      <td>${esc(s.owner_name)}</td>
      <td>${s.product_count}</td>
      <td>${s.order_count}</td>
      <td><span class="badge text-bg-${s.status === 'approved' ? 'success' : 'warning'}">
        ${s.status === 'approved' ? 'Approved' : 'Suspended'}</span></td>
      <td class="text-end">
        ${s.status === 'approved'
          ? `<button class="btn btn-outline-warning btn-sm" data-store-status="pending" data-id="${s.id}">Suspend</button>`
          : `<button class="btn btn-success btn-sm" data-store-status="approved" data-id="${s.id}">Approve</button>`}
        <button class="btn btn-outline-danger btn-sm" data-del-store="${s.id}">Delete</button>
      </td>
    </tr>`).join('');
}

// ---------- Orders ----------
async function loadOrders() {
  const { orders } = await api('/api/admin/orders');
  const rows = document.getElementById('orderRows');
  if (orders.length === 0) {
    rows.innerHTML = '<tr><td colspan="7" class="text-muted">No orders yet.</td></tr>';
    return;
  }
  rows.innerHTML = orders.map((o) => {
    const [label, color] = STATUS[o.status];
    return `
      <tr>
        <td>${o.id}</td>
        <td>${esc(o.customer_name)}</td>
        <td>${esc(o.store_name)}</td>
        <td>${esc(o.location_name)}</td>
        <td>${o.delivery_name ? esc(o.delivery_name) : '<span class="text-muted">-</span>'}</td>
        <td>₹${o.total}</td>
        <td><span class="badge text-bg-${color}">${label}</span></td>
      </tr>`;
  }).join('');
}

// ---------- Locations ----------
async function loadLocations() {
  const { locations } = await api('/api/admin/locations');
  document.getElementById('locationRows').innerHTML = locations.map((l) => `
    <tr>
      <td>${esc(l.name)}</td>
      <td><span class="badge bg-secondary">${esc(l.type)}</span></td>
      <td class="text-end"><button class="btn btn-outline-danger btn-sm" data-del-loc="${l.id}">Delete</button></td>
    </tr>`).join('');
}

document.getElementById('addLocationBtn').onclick = async () => {
  try {
    await api('/api/admin/locations', 'POST', {
      name: document.getElementById('lName').value,
      type: document.getElementById('lType').value
    });
    document.getElementById('lName').value = '';
    showMsg('Location added', 'success');
    loadLocations();
  } catch (err) {
    showMsg(err.message);
  }
};

// ---------- Buttons inside the tables ----------
document.body.addEventListener('click', async (e) => {
  const d = e.target.dataset;

  try {
    if (d.delUser) {
      if (!confirm('Delete this user?')) return;
      await api(`/api/admin/users/${d.delUser}`, 'DELETE');
      showMsg('User deleted', 'success');
      loadUsers(); loadStats();
    }
    if (d.storeStatus) {
      await api(`/api/admin/stores/${d.id}/status`, 'POST', { status: d.storeStatus });
      loadStores(); loadStats();
    }
    if (d.delStore) {
      if (!confirm('Delete this store and its products?')) return;
      await api(`/api/admin/stores/${d.delStore}`, 'DELETE');
      showMsg('Store deleted', 'success');
      loadStores(); loadStats();
    }
    if (d.delLoc) {
      if (!confirm('Delete this location?')) return;
      await api(`/api/admin/locations/${d.delLoc}`, 'DELETE');
      showMsg('Location deleted', 'success');
      loadLocations();
    }
  } catch (err) {
    showMsg(err.message);
  }
});