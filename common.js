
// common.js - Core Utilities & Navigation

// Safe initialization using 'var' to prevent redeclaration crashes
var supabase = window.supabaseClient;

// 1. Session & Auth Management
function getCurrentUser() {
const userString = localStorage.getItem('RVRG_ACTIVE_USER');
if (!userString) {
window.location.replace("index.html");
return null;
}
return JSON.parse(userString);
}

//====================================================
// VALIDATE ACTIVE USER SESSION
//====================================================

async function validateActiveSession() {

    const user = getCurrentUser();

    if (!user) return false;

    try {

        const { data, error } = await supabase

            .from("users_master")

            .select("id, is_active")

            .eq("id", user.id)

            .single();


        if (error || !data || data.is_active !== true) {

            localStorage.removeItem("RVRG_ACTIVE_USER");

            alert(
                "Your account has been deactivated. Please contact the administrator."
            );

            window.location.replace("index.html");

            return false;
        }


        return true;


    } catch (error) {

        console.error(
            "Session Validation Error:",
            error
        );

        return false;

    }

}

// Protect page
const loggedInUser = getCurrentUser();

if (!loggedInUser)
    window.location.replace("index.html");
// Validate that the logged-in user is still active
validateActiveSession();

function logout() {

    if (!confirm("Are you sure you want to logout?"))
        return;

    localStorage.removeItem("RVRG_ACTIVE_USER");

    window.location.replace("index.html");

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

// Get status abdge

function getStatusBadge(status) {

    if (!status) {
        return '<span class="badge bg-secondary">Unknown</span>';
    }

    const badges = {

        PENDING: "warning",

        APPROVED: "primary",

        ISSUED: "success",

        REJECTED: "danger",

        RETURNED: "info",

        CANCELLED: "secondary"

    };

    const color = badges[status] || "secondary";

    return `<span class="badge bg-${color}">${status}</span>`;
}

// 3. Formatting Utilities
function formatCurrency(amount) {
if (amount === null || amount === undefined) return '₹ 0.00';
return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
}
function formatDate(dateString) {
if (!dateString) return '-';
return new Date(dateString).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function showAlert(message, type = 'info') {
alert(`[${type.toUpperCase()}]: ${message}`);
}
