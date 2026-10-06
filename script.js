// Handle Login Tabs
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(tabId + '-tab').classList.add('active');
}

// Handle Main View Switching
function switchView(viewId) {
    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}

// Handle Shop Registration Form Submission
function handleShopRegistration(e) {
    e.preventDefault(); 
    document.getElementById('reg-success').style.display = 'block';
    document.getElementById('shopRegForm').reset();
    
    setTimeout(() => {
        document.getElementById('reg-success').style.display = 'none';
        switchView('login-view');
        switchTab('store');
    }, 2000);
}

// Handle Admin Login Validation
function handleAdminLogin() {
    const id = document.getElementById('admin-id').value;
    const pass = document.getElementById('admin-pass').value;
    const errorDiv = document.getElementById('admin-error');

    if (id === 'admin.105' && pass === 'admin@105') {
        errorDiv.style.display = 'none';
        switchView('admin-dashboard-view');
        // Clear inputs for security
        document.getElementById('admin-id').value = '';
        document.getElementById('admin-pass').value = '';
    } else {
        errorDiv.style.display = 'block';
    }
}