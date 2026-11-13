
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
        if (window.RvrgSecure?.enabled()) {
            await window.RvrgSecure.profile();
            return true;
        }

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

        if (window.RvrgSecure?.enabled()) {
            localStorage.removeItem('RVRG_ACTIVE_USER');
            window.location.replace('index.html');
        }
        return false;

    }

}

// Protect page
const loggedInUser = getCurrentUser();

if (!loggedInUser)
    window.location.replace("index.html");
// Validate that the logged-in user is still active
validateActiveSession();

async function logout() {

    if (!confirm("Are you sure you want to logout?"))
        return;

    if (window.RvrgSecure?.enabled()) await window.supabaseClient.auth.signOut();
    localStorage.removeItem("RVRG_ACTIVE_USER");

    window.location.replace("index.html");

}

//====================================================
// CHECK USER ACCESS
// ROLE + SECTION PERMISSION
//====================================================

function checkUserAccess(allowedRoles = []) {

    const user =
        getCurrentUser();


    if (!user) {
        return false;
    }


    // ==================================================
    // ADMIN HAS FULL ACCESS
    // ==================================================

    if (
        String(user.role || "")
            .trim()
            .toUpperCase() === "ADMIN"
    ) {

        return true;

    }


    // ==================================================
    // IDENTIFY CURRENT PAGE
    // ==================================================

    const fileName =
        window.location.pathname
            .split("/")
            .pop()
            .toLowerCase();


    const sectionMap = {

        "dashboard.html":
            "dashboard",

        "materials.html":
            "material_master",

        "material_request.html":
            "raise_request",

        "approvals.html":
            "approvals",

        "issue.html":
            "issue_materials",

        "return.html":
            "returns",

        "stock_entry.html":
            "stock_entry",

        "current_stock.html":
            "current_stock",

        "reports.html":
            "reports",

        "users.html":
            "user_management"

    };


    const assignedRole = ['EXECUTIVE','SUPERVISOR'].includes(String(user.role || '').toUpperCase());
    const requiredSection = sectionMap[fileName] || (assignedRole ? {
        'dashboard.html': 'dashboard',
        'material_categories.html': 'material_categories'
    }[fileName] : undefined);
    if (assignedRole && fileName === 'dashboard.html' && user.sectionPermissions?.dashboard !== true) {
        const landing = Object.entries(sectionMap).find(([, section]) =>
            section !== 'user_management' && user.sectionPermissions?.[section] === true);
        if (landing) window.location.href = landing[0];
        else if (user.sectionPermissions?.material_categories === true) window.location.href = 'material_categories.html';
        else {
            alert('No sections are assigned to your account. Please contact the administrator.');
            localStorage.removeItem('RVRG_ACTIVE_USER');
            window.location.href = 'index.html';
        }
        return false;
    }
    if (assignedRole && requiredSection === 'user_management') {
        alert('Access Denied. Only administrators can manage users.');
        window.location.href = 'dashboard.html';
        return false;
    }


    // ==================================================
    // IF THIS IS A SECTION-CONTROLLED PAGE
    // ==================================================

    if (requiredSection) {

        const permissions =
            user.sectionPermissions || {};


        if (
            permissions[requiredSection] === true
        ) {

            return true;

        }


        // No permission
        alert(
            "Access Denied. You do not have permission to access this section."
        );


        window.location.href =
            "dashboard.html";


        return false;

    }


    // ==================================================
    // FALLBACK ROLE CHECK
    // ==================================================

    if (
        allowedRoles.length > 0 &&
        allowedRoles.includes(user.role)
    ) {

        return true;

    }


    // ==================================================
    // ACCESS DENIED
    // ==================================================

    alert(
        "Access Denied. Your role does not have permission."
    );


    window.location.href =
        "dashboard.html";


    return false;

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
