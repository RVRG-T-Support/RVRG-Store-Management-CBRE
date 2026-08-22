// =============================================
// navigation.js
// Global Header & Sidebar
// =============================================

function getNavigationItems(role, permissions = {}) {

    const items = [

        {
            name: "Dashboard",
            icon: "fa-house",
            link: "dashboard.html",
            section: "dashboard",
            roles: ["ADMIN","FM","AFM","STOREKEEPER","STORE","TECH_SUPERVISOR"]
        },

        {
            name: "Material Categories",
            icon: "fa-tags",
            link: "material_categories.html",
            section: "material_categories",
            roles: ["ADMIN","FM","AFM","STOREKEEPER","STORE"]
        },

        {
            name: "Material Master",
            icon: "fa-box-open",
            link: "materials.html",
            section: "material_master",
            roles: ["ADMIN","FM","AFM","STOREKEEPER","STORE"]
        },

        {
            name: "Raise Request",
            icon: "fa-file-signature",
            link: "material_request.html",
            section: "raise_request",
            roles: ["ADMIN","FM","AFM","STOREKEEPER","STORE","TECH_SUPERVISOR"]
        },

        {
            name: "Approvals",
            icon: "fa-clipboard-check",
            link: "approvals.html",
            section: "approvals",
            roles: ["ADMIN","FM","AFM"]
        },

        {
            name: "Issue Materials",
            icon: "fa-right-from-bracket",
            link: "issue.html",
            section: "issue_materials",
            roles: ["ADMIN","FM","AFM","STOREKEEPER","STORE"]
        },

        {
            name: "Returns",
            icon: "fa-rotate-left",
            link: "return.html",
            section: "returns",
            roles: ["ADMIN","FM","AFM","STOREKEEPER","STORE"]
        },

        {
            name: "Stock Entry",
            icon: "fa-truck-ramp-box",
            link: "stock_entry.html",
            section: "stock_entry",
            roles: ["ADMIN","FM","AFM","STOREKEEPER","STORE"]
        },

        {
            name: "Current Stock",
            icon: "fa-boxes-stacked",
            link: "current_stock.html",
            section: "current_stock",
            roles: ["ADMIN","FM","AFM","STOREKEEPER","STORE"]
        },

        {
            name: "Reports",
            icon: "fa-chart-line",
            link: "reports.html",
            section: "reports",
            roles: ["ADMIN","FM","AFM","STOREKEEPER","STORE","TECH_SUPERVISOR"]
        },

        {
            name: "User Management",
            icon: "fa-users-gear",
            link: "users.html",
            section: "user_management",
            roles: ["ADMIN"]
        }

    ];


    return items.filter(item => {

        // User must first belong to the role
        if (!item.roles.includes(role)) {
            return false;
        }

        // ADMIN keeps full access
        if (role === "ADMIN") {
            return true;
        }

        // If permission exists, use it
        if (
            Object.prototype.hasOwnProperty.call(
                permissions,
                item.section
            )
        ) {
            return permissions[item.section] === true;
        }

        // No permission record = deny
        return false;

    });

}
async function loadNavigationPermissions(userId) {

    const permissions = {};

    // ADMIN always gets full access
    const user = getCurrentUser();

    if (user && user.role === "ADMIN") {
        return permissions;
    }

    try {

        const {
            data,
            error
        } = await supabaseClient

            .from("user_permissions")

            .select(`
                section_key,
                is_allowed
            `)

            .eq("user_id", userId);


        if (error)
            throw error;


        (data || []).forEach(permission => {

            permissions[
                permission.section_key
            ] = permission.is_allowed === true;

        });


    } catch (error) {

        console.error(
            "Navigation Permission Error:",
            error
        );

    }


    return permissions;

}
async function renderSidebar() {

    const user = getCurrentUser();

    if (!user) return;


    const container =
        document.getElementById("globalSidebar");

    if (!container) return;


    // Load individual section permissions
    const permissions =
        await loadNavigationPermissions(user.id);


    const menu =
        getNavigationItems(
            user.role,
            permissions
        );


    let html = `
        <div class="sidebar">

            <div class="sidebar-title">
                RVRG
            </div>

            <ul class="nav flex-column">
    `;


    menu.forEach(item => {

        const active =
            window.location.pathname.endsWith(
                item.link
            )
            ? "active"
            : "";


        html += `

            <li>

                <a
                    href="${item.link}"
                    class="nav-link ${active}">

                    <i class="fa-solid ${item.icon}"></i>

                    <span>${item.name}</span>

                </a>

            </li>

        `;

    });


    html += `

            <li class="mt-auto">

                <a
                    href="#"
                    class="nav-link text-danger"
                    onclick="logout()">

                    <i class="fa-solid fa-right-from-bracket"></i>

                    <span>Logout</span>

                </a>

            </li>

        </ul>

    </div>

    `;


    container.innerHTML = html;

}

function renderHeader() {

    const user = getCurrentUser();

    if (!user) return;

    const header = document.getElementById("appHeader");

    if (!header) return;

    header.innerHTML = `

<div class="app-header">

    <div class="header-left">

    <button id="menuToggle">
        <i class="fa-solid fa-bars"></i>
    </button>

    <img src="RVRG LOGO.jpg"
         alt="Logo"
         class="header-logo">

    <div class="header-title">

    <div class="title-main">
        RVRG Store Management
    </div>

    <div class="title-divider"></div>

    <div class="title-sub">
        Developed by CBRE
    </div>

</div>

</div>

    <div class="header-center">

        <span id="liveDateTime"></span>

    </div>

    <div class="header-right">

    <img src="cbre_green.png"
         class="cbre-logo"
         alt="CBRE">

    <i class="fa-solid fa-bell notification-icon"></i>

    <i class="fa-solid fa-circle-user"></i>

    <strong>${user.name}</strong>

    <small>(${user.role})</small>

</div>

</div>

`;

}

function startClock() {

    const label = document.getElementById("liveDateTime");

    if (!label) return;

    function updateClock() {
        label.innerHTML = new Date().toLocaleString("en-IN");
    }

    updateClock();

    setInterval(updateClock, 1000);
}

document.addEventListener("DOMContentLoaded",()=>{

    renderHeader();

    renderSidebar();

    startClock();

});
