//====================================================
// USER MANAGEMENT
//====================================================

// Global user list
let usersData = [];


//====================================================
// PAGE INITIALIZATION
//====================================================

document.addEventListener("DOMContentLoaded", async () => {

    // Only ADMIN should manage users
    const hasAccess = checkUserAccess(["ADMIN"]);

    if (!hasAccess) {
        console.error("USER MANAGEMENT ACCESS DENIED");
        return;
    }

    await loadUsers();

});


//====================================================
// LOAD USERS
//====================================================

async function loadUsers() {

    const tableBody =
        document.getElementById("userTableBody");

    if (!tableBody) return;

    tableBody.innerHTML = `
        <tr>
            <td colspan="7"
                class="text-center text-muted py-4">
                Loading users...
            </td>
        </tr>
    `;

    try {

        const {
            data,
            error
        } = await supabaseClient

            .from("users_master")

            .select(`
                id,
                full_name,
                email,
                role,
                is_active,
                created_at,
                username
            `)

            .order("id", {
                ascending: true
            });


        if (error)
            throw error;


        usersData = data || [];


        renderUsers(usersData);


    } catch (error) {

        console.error(
            "Load Users Error:",
            error
        );

        tableBody.innerHTML = `
            <tr>
                <td colspan="7"
                    class="text-center text-danger py-4">

                    Failed to load users:
                    ${error.message}

                </td>
            </tr>
        `;

    }

}


//====================================================
// RENDER USERS
//====================================================

function renderUsers(users) {

    const tableBody =
        document.getElementById("userTableBody");

    const count =
        document.getElementById("userCount");


    if (!tableBody) return;


    if (!users || users.length === 0) {

        tableBody.innerHTML = `
            <tr>
                <td colspan="7"
                    class="text-center text-muted py-4">

                    No users found.

                </td>
            </tr>
        `;

        if (count)
            count.textContent = "0 Records";

        return;
    }


    tableBody.innerHTML = "";


    users.forEach(user => {

        const statusClass =
            user.is_active
                ? "bg-success"
                : "bg-secondary";


        const statusText =
            user.is_active
                ? "ACTIVE"
                : "INACTIVE";


        const createdDate =
            user.created_at
                ? formatDate(user.created_at)
                : "-";


        const row =
            document.createElement("tr");


        row.innerHTML = `

            <td class="fw-semibold">
                ${escapeHtml(user.full_name || "-")}
            </td>

            <td>
                ${escapeHtml(user.username || "-")}
            </td>

            <td>
                ${escapeHtml(user.email || "-")}
            </td>

            <td>
                ${escapeHtml(user.role || "-")}
            </td>

            <td>
                <span class="badge ${statusClass}">
                    ${statusText}
                </span>
            </td>

            <td>
                ${createdDate}
            </td>

            <td>

                <button
                    class="btn btn-sm btn-primary"
                    disabled>

                    <i class="fa-solid fa-pen"></i>
                    Edit

                </button>

                <button
                    class="btn btn-sm btn-secondary"
                    disabled>

                    <i class="fa-solid fa-copy"></i>
                    Copy

                </button>

            </td>

        `;


        tableBody.appendChild(row);

    });


    if (count)
        count.textContent =
            `${users.length} Records`;

}


//====================================================
// ESCAPE HTML
//====================================================

function escapeHtml(value) {

    const div =
        document.createElement("div");

    div.textContent =
        value ?? "";

    return div.innerHTML;

}


//====================================================
// SEARCH + FILTER
//====================================================

function filterUsers() {

    const search =
        (
            document.getElementById("userSearch")
                ?.value || ""
        )
        .trim()
        .toLowerCase();


    const role =
        document.getElementById("roleFilter")
            ?.value || "";


    const status =
        document.getElementById("statusFilter")
            ?.value || "";


    const filtered =
        usersData.filter(user => {

            const matchesSearch =
                !search ||

                (user.full_name || "")
                    .toLowerCase()
                    .includes(search) ||

                (user.username || "")
                    .toLowerCase()
                    .includes(search) ||

                (user.email || "")
                    .toLowerCase()
                    .includes(search);


            const matchesRole =
                !role ||
                user.role === role;


            const matchesStatus =
                !status ||
                String(user.is_active) === status;


            return (
                matchesSearch &&
                matchesRole &&
                matchesStatus
            );

        });


    renderUsers(filtered);

}
