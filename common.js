// common.js
// Shared utilities and helper functions for RVRG Store Management System

// 1. Initialize Supabase Client using variables from config.js
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 2. Role & Access Management
function getCurrentUser() {
    return CURRENT_USER;
}

function checkUserAccess(allowedRoles = []) {
    const user = getCurrentUser();
    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
        alert(`Access Denied. Current role: ${user.role}`);
        window.location.href = 'dashboard.html'; // Redirect unauthorized users
        return false;
    }
    return true;
}

// Switch Role Helper (For Development Testing)
function setDevRole(role) {
    localStorage.setItem("RVRG_ROLE", role);
    window.location.reload();
}

// 3. Formatting Utilities
function formatCurrency(amount) {
    if (amount === null || amount === undefined) return '₹ 0.00';
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR'
    }).format(amount);
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

function formatDateTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

// 4. Status Badge Generator
function getStatusBadge(status) {
    const statusUpper = (status || '').toUpperCase();
    let badgeClass = 'badge-secondary';

    switch (statusUpper) {
        case 'APPROVED':
            badgeClass = 'bg-success text-white';
            break;
        case 'PENDING':
            badgeClass = 'bg-warning text-dark';
            break;
        case 'REJECTED':
            badgeClass = 'bg-danger text-white';
            break;
        case 'ISSUED':
            badgeClass = 'bg-info text-white';
            break;
        case 'PARTIALLY_ISSUED':
            badgeClass = 'bg-primary text-white';
            break;
        default:
            badgeClass = 'bg-secondary text-white';
    }

    return `<span class="badge ${badgeClass}">${statusUpper}</span>`;
}

// 5. Shared Notification / Alert Helper
function showAlert(message, type = 'info') {
    // Basic toast or alert logic
    alert(`[${type.toUpperCase()}]: ${message}`);
}
