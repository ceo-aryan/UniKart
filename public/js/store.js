const LABELS = {
  placed: ['New order', 'warning'],
  accepted: ['Preparing', 'info'],
  ready: ['Ready for pickup', 'primary'],
  out_for_delivery: ['Out for delivery', 'primary'],
  delivered: ['Delivered', 'success'],
  rejected: ['Rejected', 'danger']
};
const ACTIVE = ['placed', 'accepted', 'ready', 'out_for_delivery'];

function showMsg(text, type = 'danger') {
  document.getElementById('msg').innerHTML = `<div class="alert alert-${type}">${esc(text)}</div>`;
  setTimeout(() => (document.getElementById('msg').innerHTML = ''), 4000);
}

// ---------- Startup ----------
api('/api/auth/me')
  .then(async (data) => {
    if (data.user.role !== 'storekeeper') {
      window.location.href = HOME_PAGE[data.user.role];
      return;
    }
    document.getElementById('userName').textContent = data.user.name;
    const { store } = await api('/api/store/me');
    document.getElementById('storeName').textContent = store.name;
    loadOrders();
    loadProducts();
    setInterval(loadOrders, 10000); // only orders refresh; the product tab has inputs we must not overwrite
  })
  .catch(() => (window.location.href = '/login.html'));

document.getElementById('logoutBtn').onclick = async () => {
  await api('/api/auth/logout', 'POST');
  window.location.href = '/login.html';
};

// ---------- Tabs ----------
document.querySelectorAll('[data-tab]').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('[data-tab]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    ['active', 'history', 'products'].forEach((t) =>
      document.getElementById('tab-' + t).classList.toggle('d-none', t !== btn.dataset.tab));
  };
});

// ---------- Orders ----------
function orderCard(o) {
  const [label, color] = LABELS[o.status];
  let actions = '';
  if (o.status === 'placed') {
    actions = `
      <button class="btn btn-success btn-sm" data-order="${o.id}" data-status="accepted">Accept</button>
      <button class="btn btn-outline-danger btn-sm" data-order="${o.id}" data-status="rejected">Reject</button>`;
  } else if (o.status === 'accepted') {
    actions = `<button class="btn btn-primary btn-sm" data-order="${o.id}" data-status="ready">Mark as ready</button>`;
  } else if (o.status === 'ready' || o.status === 'out_for_delivery') {
    actions = '<small class="text-muted">Waiting for the delivery person</small>';
  }

  return `
    <div class="card shadow-sm mb-3">
      <div class="card-body">
        <div class="d-flex justify-content-between">
          <h6 class="mb-0">Order #${o.id} · ${esc(o.customer_name)}</h6>
          <span class="badge text-bg-${color}">${label}</span>
        </div>
        <small class="text-muted">${esc(o.created_at)} (UTC) · Deliver to: ${esc(o.location_name)}</small>
        <ul class="list-unstyled my-3 small">
          ${o.items.map((i) => `<li>${esc(i.name)} × ${i.quantity}</li>`).join('')}
        </ul>
        <div class="d-flex justify-content-between align-items-center">
          <b>₹${o.total}</b>
          <div class="d-flex gap-2 align-items-center">${actions}</div>
        </div>
      </div>
    </div>`;
}

async function loadOrders() {
  const { orders } = await api('/api/store/orders');
  const active = orders.filter((o) => ACTIVE.includes(o.status));
  const history = orders.filter((o) => !ACTIVE.includes(o.status));

  document.getElementById('activeList').innerHTML =
    active.length ? active.map(orderCard).join('') : '<p class="text-muted">No active orders right now.</p>';
  document.getElementById('historyList').innerHTML =
    history.length ? history.map(orderCard).join('') : '<p class="text-muted">No past orders yet.</p>';
}

// Buttons inside both order lists
document.getElementById('tab-active').addEventListener('click', handleOrderClick);

async function handleOrderClick(e) {
  const { order, status } = e.target.dataset;
  if (!order) return;

  if (status === 'rejected' && !confirm('Reject this order? The stock will be returned.')) return;

  try {
    await api(`/api/store/orders/${order}/status`, 'POST', { status });
    await loadOrders();
    loadProducts(); // stock changes when an order is rejected
  } catch (err) {
    showMsg(err.message);
  }
}

// ---------- Products ----------
async function loadProducts() {
  const { products } = await api('/api/store/products');
  document.getElementById('productRows').innerHTML = products.map((p) => `
    <tr>
      <td>${esc(p.name)}</td>
      <td><span class="badge bg-secondary">${esc(p.category)}</span></td>
      <td><input type="number" min="1" class="form-control form-control-sm" id="price-${p.id}" value="${p.price}"></td>
      <td><input type="number" min="0" class="form-control form-control-sm" id="stock-${p.id}" value="${p.stock}"></td>
      <td><button class="btn btn-outline-primary btn-sm" data-save="${p.id}">Save</button></td>
    </tr>`).join('');
}

document.getElementById('productRows').addEventListener('click', async (e) => {
  const id = e.target.dataset.save;
  if (!id) return;
  try {
    await api(`/api/store/products/${id}`, 'PUT', {
      price: document.getElementById('price-' + id).value,
      stock: document.getElementById('stock-' + id).value
    });
    showMsg('Product updated', 'success');
  } catch (err) {
    showMsg(err.message);
  }
});

document.getElementById('addProductBtn').onclick = async () => {
  try {
    await api('/api/store/products', 'POST', {
      name: document.getElementById('newName').value,
      category: document.getElementById('newCategory').value,
      price: document.getElementById('newPrice').value,
      stock: document.getElementById('newStock').value
    });
    ['newName', 'newCategory', 'newPrice', 'newStock'].forEach((id) => (document.getElementById(id).value = ''));
    showMsg('Product added', 'success');
    loadProducts();
  } catch (err) {
    showMsg(err.message);
  }
};