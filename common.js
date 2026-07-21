// common.js - Core Utilities & Navigation

// Safe initialization using 'var' to prevent redeclaration crashes
var supabase = window.supabaseClient || window.supabase;

// 1. Session & Auth Management
function getCurrentUser() {
    const userString = localStorage.getItem('RVRG_ACTIVE_USER');
    if (!userString) {
        window.location.href = 'index.html';
        return null;
    }
    return JSON.parse(userString);
}

function logout() {
    localStorage.removeItem('RVRG_ACTIVE_USER');
    window.location.href = 'index.html';
}

function checkUserAccess(allowedRoles = []) {
    const user = getCurrentUser();
    if (!user) return false;
    
    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
        alert(`Access Denied. Your role (${user.role}) does not have permission.`);
        window.location.href = 'dashboard.html';
        return false;
    }
    return true;
}

// 2. Dynamic Global Sidebar Injection
function injectGlobalNavigation() {
    const user = getCurrentUser();
    if (!user) return;

    const navItems = [
        { name: 'Dashboard', icon: 'fa-house-chimney', link: 'dashboard.html', roles: ['ADMIN', 'FM', 'AFM', 'STORE', 'TECH_SUPERVISOR'] },
        { name: 'Raise Request', icon: 'fa-file-signature', link: 'material_request.html', roles: ['ADMIN', 'FM', 'AFM', 'STORE', 'TECH_SUPERVISOR'] },
        { name: 'Approvals', icon: 'fa-clipboard-check', link: 'approvals.html', roles: ['ADMIN', 'FM', 'AFM'] },
        { name: 'ICR Approvals', icon: 'fa-check-to-slot', link: 'icr_approval.html', roles: ['ADMIN', 'FM', 'AFM'] },
        { name: 'Issue Materials', icon: 'fa-right-from-bracket', link: 'issue.html', roles: ['ADMIN', 'FM', 'AFM', 'STORE'] },
        { name: 'Returns', icon: 'fa-rotate-left', link: 'return.html', roles: ['ADMIN', 'FM', 'AFM', 'STORE'] },
        { name: 'Stock Entry', icon: 'fa-truck-ramp-box', link: 'stock_entry.html', roles: ['ADMIN', 'FM', 'AFM', 'STORE'] },
        { name: 'Inventory Correction', icon: 'fa-scale-balanced', link: 'inventory_correction.html', roles: ['ADMIN', 'FM', 'AFM', 'STORE'] },
        { name: 'Reports', icon: 'fa-chart-line', link: 'reports.html', roles: ['ADMIN', 'FM', 'AFM', 'STORE', 'TECH_SUPERVISOR'] },
        { name: 'Master Data', icon: 'fa-database', link: 'masters.html', roles: ['ADMIN', 'FM'] }
    ];

    let navHtml = '<ul class="nav flex-column">';
    navItems.forEach(item => {
        if (item.roles.includes(user.role)) {
            const isActive = window.location.pathname.includes(item.link) ? 'active' : '';
            navHtml += `
                <li class="nav-item">
                    <a class="nav-link ${isActive} text-dark" href="${item.link}">
                        <i class="fa-solid ${item.icon} me-2" style="width: 25px;"></i> ${item.name}
                    </a>
                </li>`;
        }
    });
    navHtml += `
        <li class="nav-item mt-4">
            <a class="nav-link text-danger" href="#" onclick="logout()">
                <i class="fa-solid fa-right-from-bracket me-2" style="width: 25px;"></i> Logout
            </a>
        </li>
    `;

    const sidebarContainer = document.getElementById('globalSidebar');
    if (sidebarContainer) {
        sidebarContainer.innerHTML = navHtml;
    }

    const userBadge = document.getElementById('currentUserName');
    if (userBadge) {
        userBadge.innerText = `${user.name} (${user.role})`;
    }
}

document.addEventListener('DOMContentLoaded', injectGlobalNavigation);

// 3. Formatting Utilities
function formatCurrency(amount) {
    if (amount === null || amount === undefined) return '₹ 0.00';
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
}
function formatDate(dateString) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function getStatusBadge(status) {
    const s = (status || '').toUpperCase();
    const badges = {
        'APPROVED': 'bg-success text-white',
        'PENDING': 'bg-warning text-dark',
        'REJECTED': 'bg-danger text-white',
        'ISSUED': 'bg-info text-dark',
        'PARTIALLY_ISSUED': 'bg-primary text-white'
    };
    return `<span class="badge ${badges[s] || 'bg-secondary'}">${s}</span>`;
}
function showAlert(message, type = 'info') {
    alert(`[${type.toUpperCase()}]: ${message}`);
}
