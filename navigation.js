// =============================================
// navigation.js
// Global Header & Sidebar
// =============================================

function getNavigationItems(role) {

    const items = [

        {
            name: "Dashboard",
            icon: "fa-house",
            link: "dashboard.html",
            roles: ["ADMIN","FM","AFM","STOREKEEPER","STORE","TECH_SUPERVISOR"]
        },

        {
            name: "Material Entry",
            icon: "fa-box-open",
            link: "materials.html",
            roles: ["ADMIN","FM","AFM","STOREKEEPER","STORE"]
        },

        {
            name: "Raise Request",
            icon: "fa-file-signature",
            link: "material_request.html",
            roles: ["ADMIN","FM","AFM","STOREKEEPER","STORE","TECH_SUPERVISOR"]
        },

        {
            name: "Approvals",
            icon: "fa-clipboard-check",
            link: "approvals.html",
            roles: ["ADMIN","FM","AFM"]
        },

        {
            name: "Issue Materials",
            icon: "fa-right-from-bracket",
            link: "issue.html",
            roles: ["ADMIN","FM","AFM","STOREKEEPER","STORE"]
        },

        {
            name: "Returns",
            icon: "fa-rotate-left",
            link: "return.html",
            roles: ["ADMIN","FM","AFM","STOREKEEPER","STORE"]
        },

        {
            name: "Stock Entry",
            icon: "fa-truck-ramp-box",
            link: "stock_entry.html",
            roles: ["ADMIN","FM","AFM","STOREKEEPER","STORE"]
        },

        {
            name: "Reports",
            icon: "fa-chart-line",
            link: "reports.html",
            roles: ["ADMIN","FM","AFM","STOREKEEPER","STORE","TECH_SUPERVISOR"]
        },

        {
            name: "User Management",
            icon: "fa-users-gear",
            link: "users.html",
            roles: ["ADMIN"]
        }

    ];

    return items.filter(item => item.roles.includes(role));

}

function renderSidebar() {

    const user = getCurrentUser();

    if (!user) return;

    const container = document.getElementById("globalSidebar");

    if (!container) return;

    const menu = getNavigationItems(user.role);

    let html = `
        <div class="sidebar">

            <div class="sidebar-title">

    <img src="RVRG LOGO.jpg"
         alt="RVRG"
         class="sidebar-logo">

    <div class="sidebar-brand">

        <div class="sidebar-heading">
            RVRG Store Management
        </div>

        <div class="sidebar-subtitle">
            Developed by CBRE
        </div>

    </div>

</div>

            <ul class="nav flex-column">
    `;

    menu.forEach(item => {

        const active =
            window.location.pathname.endsWith(item.link)
            ? "active"
            : "";

        html += `

        <li>

            <a href="${item.link}" class="nav-link ${active}">

                <i class="fa-solid ${item.icon}"></i>

                <span>${item.name}</span>

            </a>

        </li>

        `;

    });

    html += `

        <li class="mt-auto">

            <a href="#" class="nav-link text-danger" onclick="logout()">

                <i class="fa-solid fa-right-from-bracket"></i>

                <span>Logout</span>

            </a>

        </li>

    </ul>

</div>`;

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

        <div class="title-sub">
            Enterprise Edition
        </div>

    </div>

</div>

    <div class="header-center">

        <span id="liveDateTime"></span>

    </div>

    <div class="header-right">

    <img src="cbre_green.jpg"
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
