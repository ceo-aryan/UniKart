let currentStore = null;       // store being browsed
let productsById = {};         // quick lookup of loaded products
let cart = loadCart();         // { storeId, storeName, items: [...] }
let isGuest = false;           // true when the visitor is not logged in

// ---------- Cart storage ----------
function loadCart() {
  try {
    return JSON.parse(localStorage.getItem('unikart_cart')) ||
      { storeId: null, storeName: '', items: [] };
  } catch {
    return { storeId: null, storeName: '', items: [] };
  }
}

function saveCart() {
  localStorage.setItem('unikart_cart', JSON.stringify(cart));
  renderCart();
}

// A small emoji for each kind of product
function categoryIcon(category) {
  const c = String(category).toLowerCase();
  if (c.includes('note') || c.includes('book')) return '📓';
  if (c.includes('pen')) return '✏️';
  if (c.includes('print')) return '🖨️';
  if (c.includes('file')) return '📁';
  if (c.includes('lab')) return '🧪';
  if (c.includes('snack') || c.includes('food') || c.includes('drink') || c.includes('beverage')) return '🥤';
  if (c.includes('station')) return '📐';
  return '🛍️';
}

// ---------- Startup ----------
api('/api/auth/me')
  .then((data) => {
    if (data.user.role !== 'customer') {
      window.location.href = HOME_PAGE[data.user.role];
      return;
    }
    document.getElementById('userName').textContent = data.user.name;
    document.getElementById('memberArea').classList.remove('d-none');
    renderCart();
    loadStores();

    // Came back after logging in from "add to cart"? Reopen that store.
    const back = sessionStorage.getItem('unikart_return_store');
    if (back) {
      sessionStorage.removeItem('unikart_return_store');
      openStore(Number(back));
    }
  })
  .catch((err) => {
    if (err.message === 'Please log in first') {
      // A visitor: can browse, but cannot buy
      isGuest = true;
      document.getElementById('guestArea').classList.remove('d-none');
      loadStores();
    } else {
      console.error('Startup failed:', err);
      alert('Could not load the page: ' + err.message);
    }
  });

document.getElementById('logoutBtn').onclick = async () => {
  await api('/api/auth/logout', 'POST');
  window.location.href = '/login.html';
};

// ---------- Stores ----------
async function loadStores() {
  const { stores } = await api('/api/stores');
  const list = document.getElementById('storeList');

  if (stores.length === 0) {
    list.innerHTML = '<p class="text-muted">No stores available yet.</p>';
    return;
  }

  list.innerHTML = stores.map((s) => `
    <div class="col-sm-6 col-md-4">
      <div class="card h-100 shadow-sm">
        <div class="store-banner">🏪</div>
        <div class="card-body">
          <h5 class="card-title">${esc(s.name)}</h5>
          <p class="card-text text-muted">📍 ${esc(s.location)}</p>
          <button class="btn btn-primary" data-store="${s.id}">Browse products</button>
        </div>
      </div>
    </div>`).join('');
}

document.getElementById('storeList').addEventListener('click', (e) => {
  const id = e.target.dataset.store;
  if (id) openStore(Number(id));
});

document.getElementById('backBtn').onclick = () => {
  document.getElementById('productsView').classList.add('d-none');
  document.getElementById('storesView').classList.remove('d-none');
};

// ---------- Products ----------
async function openStore(id) {
  currentStore = { id };
  document.getElementById('searchBox').value = '';
  document.getElementById('categoryBox').value = '';
  document.getElementById('storesView').classList.add('d-none');
  document.getElementById('productsView').classList.remove('d-none');
  await loadProducts(true);
}

async function loadProducts(refreshCategories = false) {
  const search = document.getElementById('searchBox').value;
  const category = document.getElementById('categoryBox').value;
  const url = `/api/stores/${currentStore.id}/products` +
    `?search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}`;

  const data = await api(url);
  currentStore = data.store;

  document.getElementById('storeTitle').textContent = data.store.name;
  document.getElementById('storeLocation').textContent = '📍 ' + data.store.location;

  if (refreshCategories) {
    document.getElementById('categoryBox').innerHTML =
      '<option value="">All categories</option>' +
      data.categories.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  }

  productsById = {};
  data.products.forEach((p) => (productsById[p.id] = p));

  const list = document.getElementById('productList');
  if (data.products.length === 0) {
    list.innerHTML = '<p class="text-muted">No products found.</p>';
    return;
  }

  list.innerHTML = data.products.map((p) => `
    <div class="col-sm-6 col-md-4">
      <div class="card h-100 shadow-sm">
        <div class="product-thumb">${categoryIcon(p.category)}</div>
        <div class="card-body">
          <span class="badge bg-secondary mb-2">${esc(p.category)}</span>
          <h6 class="card-title">${esc(p.name)}</h6>
          <p class="fw-bold fs-5 mb-1">₹${p.price}</p>
          <p class="small ${p.stock > 0 ? 'text-success' : 'text-danger'}">
            ${p.stock > 0 ? p.stock + ' in stock' : 'Out of stock'}
          </p>
          <button class="btn btn-outline-primary btn-sm" data-add="${p.id}"
            ${p.stock === 0 ? 'disabled' : ''}>Add to cart</button>
        </div>
      </div>
    </div>`).join('');
}

// Search as the user types (waits 300ms after the last keystroke)
let searchTimer;
document.getElementById('searchBox').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadProducts(false), 300);
});
document.getElementById('categoryBox').addEventListener('change', () => loadProducts(false));

document.getElementById('productList').addEventListener('click', (e) => {
  const id = e.target.dataset.add;
  if (id) addToCart(productsById[Number(id)]);
});

// ---------- Cart ----------
function addToCart(product) {
  // Visitors must log in first. Remember the store so we can return to it.
  if (isGuest) {
    sessionStorage.setItem('unikart_return_store', String(currentStore.id));
    new bootstrap.Modal(document.getElementById('loginPromptModal')).show();
    return;
  }

  // A cart can only hold items from one store
  if (cart.items.length > 0 && cart.storeId !== currentStore.id) {
    const ok = confirm(
      `Your cart has items from ${cart.storeName}. Clear it and start a new cart with ${currentStore.name}?`
    );
    if (!ok) return;
    cart.items = [];
  }

  cart.storeId = currentStore.id;
  cart.storeName = currentStore.name;

  const existing = cart.items.find((i) => i.id === product.id);
  if (existing) {
    if (existing.qty < product.stock) existing.qty++;
    else alert('No more stock available for this item');
  } else {
    cart.items.push({
      id: product.id,
      name: product.name,
      price: product.price,
      stock: product.stock,
      qty: 1
    });
  }
  saveCart();
}

function renderCart() {
  const box = document.getElementById('cartItems');
  const count = cart.items.reduce((sum, i) => sum + i.qty, 0);
  const total = cart.items.reduce((sum, i) => sum + i.qty * i.price, 0);

  document.getElementById('cartCount').textContent = count;
  document.getElementById('cartTotal').textContent = '₹' + total;
  document.getElementById('checkoutBtn').disabled = cart.items.length === 0;

  if (cart.items.length === 0) {
    box.innerHTML = '<p class="text-muted">Your cart is empty.</p>';
    return;
  }

  box.innerHTML =
    `<p class="small text-muted">From: ${esc(cart.storeName)}</p>` +
    cart.items.map((i) => `
      <div class="d-flex justify-content-between align-items-center border-bottom py-2">
        <div>
          <div>${esc(i.name)}</div>
          <small class="text-muted">₹${i.price} each</small>
        </div>
        <div class="d-flex align-items-center gap-1">
          <button class="btn btn-sm btn-outline-secondary" data-act="dec" data-id="${i.id}">-</button>
          <span class="px-2">${i.qty}</span>
          <button class="btn btn-sm btn-outline-secondary" data-act="inc" data-id="${i.id}">+</button>
          <button class="btn btn-sm btn-outline-danger ms-1" data-act="rm" data-id="${i.id}">&times;</button>
        </div>
      </div>`).join('');
}

document.getElementById('cartItems').addEventListener('click', (e) => {
  const { act, id } = e.target.dataset;
  if (!act) return;

  const item = cart.items.find((i) => i.id === Number(id));
  if (!item) return;

  if (act === 'inc' && item.qty < item.stock) item.qty++;
  if (act === 'dec') item.qty--;
  if (act === 'rm') item.qty = 0;

  cart.items = cart.items.filter((i) => i.qty > 0);
  if (cart.items.length === 0) cart.storeId = null;
  saveCart();
});

// ---------- Checkout ----------
const typeNames = {
  department: 'Departments',
  classroom: 'Classrooms',
  hostel: 'Hostels',
  other: 'Other places'
};

document.getElementById('checkoutBtn').onclick = async () => {
  const total = cart.items.reduce((sum, i) => sum + i.qty * i.price, 0);
  document.getElementById('checkoutMsg').innerHTML = '';
  document.getElementById('checkoutSummary').innerHTML =
    `<p class="mb-1"><b>${esc(cart.storeName)}</b></p>` +
    cart.items.map((i) => `<div class="d-flex justify-content-between">
        <span>${esc(i.name)} × ${i.qty}</span><span>₹${i.qty * i.price}</span></div>`).join('') +
    `<hr><div class="d-flex justify-content-between fw-bold"><span>Total</span><span>₹${total}</span></div>`;

  // Load delivery locations, grouped by type
  const { locations } = await api('/api/locations');
  const groups = {};
  locations.forEach((l) => (groups[l.type] = groups[l.type] || []).push(l));

  document.getElementById('locationBox').innerHTML =
    '<option value="">Select a location...</option>' +
    Object.keys(groups).map((type) =>
      `<optgroup label="${typeNames[type]}">` +
      groups[type].map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join('') +
      '</optgroup>').join('');

  new bootstrap.Modal(document.getElementById('checkoutModal')).show();
};

document.getElementById('placeOrderBtn').onclick = async () => {
  const msg = document.getElementById('checkoutMsg');
  const locationId = document.getElementById('locationBox').value;
  if (!locationId) {
    msg.innerHTML = '<div class="alert alert-warning">Please choose a delivery location.</div>';
    return;
  }

  try {
    // Only ids and quantities are sent. The server decides the prices.
    await api('/api/orders', 'POST', {
      storeId: cart.storeId,
      locationId: Number(locationId),
      items: cart.items.map((i) => ({ productId: i.id, qty: i.qty }))
    });
    cart = { storeId: null, storeName: '', items: [] };
    saveCart();
    window.location.href = '/orders.html';
  } catch (err) {
    msg.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
};