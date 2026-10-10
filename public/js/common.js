// Small wrapper around fetch for our JSON API
async function api(url, method = 'GET', body = null) {
  const options = { method, headers: {} };
  if (body) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

// Where each role lands after login (we'll build these pages in later steps)
const HOME_PAGE = {
  customer: '/customer.html',
  storekeeper: '/store.html',
  delivery: '/delivery.html',
  admin: '/admin.html'
};

// Escape text before putting it inside HTML
function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}