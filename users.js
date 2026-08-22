//====================================================
// USER MANAGEMENT
//====================================================

// Global user list
let usersData = [];
//====================================================
// SECTION PERMISSIONS
//====================================================

let applicationSections = [];
let currentUserPermissions = {};

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

    await loadApplicationSections();
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
// LOAD APPLICATION SECTIONS
//====================================================

async function loadApplicationSections() {

    const container =
        document.getElementById(
            "sectionPermissionsContainer"
        );

    if (!container) return;


    try {

        const {
            data,
            error
        } = await supabaseClient

            .from("application_sections")

            .select(`
                id,
                section_key,
                section_name,
                display_order
            `)

            .eq("is_active", true)

            .order("display_order", {
                ascending: true
            });


        if (error)
            throw error;


        applicationSections = data || [];


        renderPermissionCheckboxes();


    } catch (error) {

        console.error(
            "Load Application Sections Error:",
            error
        );


        container.innerHTML = `
            <div class="col-12 text-center text-danger py-3">
                Failed to load sections:
                ${escapeHtml(error.message)}
            </div>
        `;

    }

}


//====================================================
// RENDER PERMISSION CHECKBOXES
//====================================================

function renderPermissionCheckboxes() {

    const container =
        document.getElementById(
            "sectionPermissionsContainer"
        );


    if (!container) return;


    if (!applicationSections.length) {

        container.innerHTML = `
            <div class="col-12 text-center text-muted py-3">
                No application sections found.
            </div>
        `;

        return;

    }


    container.innerHTML = "";


    applicationSections.forEach(section => {

        const allowed =
            currentUserPermissions[
                section.section_key
            ] === true;


        const col =
            document.createElement("div");


        col.className =
            "col-md-6 col-lg-4";


        col.innerHTML = `

            <div class="form-check border rounded p-3 h-100">

                <input
                    class="form-check-input section-permission"
                    type="checkbox"
                    value="${escapeHtml(section.section_key)}"
                    id="permission_${escapeHtml(section.section_key)}"
                    ${allowed ? "checked" : ""}>

                <label
                    class="form-check-label fw-semibold"
                    for="permission_${escapeHtml(section.section_key)}">

                    ${escapeHtml(section.section_name)}

                </label>

            </div>

        `;


        container.appendChild(col);

    });

}


//====================================================
// LOAD USER PERMISSIONS
//====================================================

async function loadUserPermissions(userId) {

    currentUserPermissions = {};


    if (!userId) {

        renderPermissionCheckboxes();

        return;

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

            currentUserPermissions[
                permission.section_key
            ] =
                permission.is_allowed === true;

        });


        renderPermissionCheckboxes();


    } catch (error) {

        console.error(
            "Load User Permissions Error:",
            error
        );


        showAlert(
            "Unable to load user permissions: " +
            error.message,
            "danger"
        );

    }

}


//====================================================
// GET SELECTED PERMISSIONS
//====================================================

function getSelectedPermissions() {

    const selected = [];


    document
        .querySelectorAll(
            ".section-permission:checked"
        )
        .forEach(checkbox => {

            selected.push(
                checkbox.value
            );

        });


    return selected;

}


//====================================================
// SELECT ALL PERMISSIONS
//====================================================

function selectAllPermissions() {

    document
        .querySelectorAll(
            ".section-permission"
        )
        .forEach(checkbox => {

            checkbox.checked = true;

        });

}


//====================================================
// CLEAR ALL PERMISSIONS
//====================================================

function clearAllPermissions() {

    document
        .querySelectorAll(
            ".section-permission"
        )
        .forEach(checkbox => {

            checkbox.checked = false;

        });

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
                        onclick="editUser(${user.id})">
                    <i class="fa-solid fa-pen"></i>
                    Edit
                </button>

                <button
                    class="btn btn-sm btn-secondary"
                        onclick="copyUser(${user.id})">
                    <i class="fa-solid fa-copy"></i>
                    Copy
                </button>

<button
    class="btn btn-sm ${user.is_active ? 'btn-danger' : 'btn-success'}"
    onclick="toggleUserStatus(${user.id}, ${user.is_active})">

    <i class="fa-solid ${user.is_active ? 'fa-ban' : 'fa-check'}"></i>

    ${user.is_active ? 'Inactive' : 'Activate'}

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
//====================================================
// SAVE NEW USER
//====================================================

async function saveUser() {

    try {

        const fullName =
            document.getElementById("fullName").value.trim();

        const email =
            document.getElementById("email").value.trim();

        const username =
            document.getElementById("username").value.trim();

        const password =
            document.getElementById("password").value;

        const role =
            document.getElementById("role").value;

        const isActive =
            document.getElementById("isActive").value === "true";


        // Validation

        if (!fullName) {
            throw new Error("Full Name is required.");
        }

        if (!username) {
            throw new Error("Username is required.");
        }

        if (!password) {
            throw new Error("Password is required.");
        }

        if (!role) {
            throw new Error("Please select a role.");
        }


        // Check duplicate username

        const {
            data: existingUser,
            error: checkError
        } = await supabaseClient

            .from("users_master")

            .select("id")

            .eq("username", username)

            .maybeSingle();


        if (checkError)
            throw checkError;


        if (existingUser) {

            throw new Error(
                "Username already exists."
            );

        }


        // Insert user

        const {
            error
        } = await supabaseClient

            .from("users_master")

            .insert({

                full_name: fullName,

                email: email || null,

                username: username,

                password: password,

                role: role,

                is_active: isActive

            });


        if (error)
            throw error;


        showAlert(
            "User saved successfully.",
            "success"
        );


        clearUserForm();

        await loadUsers();


    } catch (error) {

        console.error(
            "Save User Error:",
            error
        );

        showAlert(
            error.message,
            "danger"
        );

    }

}

//====================================================
// EDIT USER
//====================================================

async function editUser(id) {

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
                username,
                role,
                is_active
            `)

            .eq("id", id)

            .single();


        if (error)
            throw error;


        // Store ID
        document.getElementById("userId").value =
            data.id;


        // Load user information
        document.getElementById("fullName").value =
            data.full_name || "";

        document.getElementById("email").value =
            data.email || "";

        document.getElementById("username").value =
            data.username || "";

        document.getElementById("role").value =
            data.role || "STOREKEEPER";

        document.getElementById("isActive").value =
            String(data.is_active);


        // Password remains blank
        document.getElementById("password").value = "";


        // Change button mode
        document.getElementById("btnSaveUser")
            .style.display = "none";

        document.getElementById("btnUpdateUser")
            .style.display = "inline-block";


        // Username should not be changed during edit
        document.getElementById("username")
            .disabled = true;
        
        // Load saved section permissions
        await loadUserPermissions(data.id);

        // Scroll to form
        document.getElementById("fullName")
            .scrollIntoView({
                behavior: "smooth",
                block: "center"
            });


    } catch (error) {

        console.error(
            "Edit User Error:",
            error
        );

        showAlert(
            error.message,
            "danger"
        );

    }

}

//====================================================
// UPDATE USER
//====================================================

async function updateUser() {

    try {

        const id =
            document.getElementById("userId").value;

        if (!id) {
            throw new Error(
                "No user selected for update."
            );
        }


        const fullName =
            document.getElementById("fullName")
                .value.trim();

        const email =
            document.getElementById("email")
                .value.trim();

        const password =
            document.getElementById("password")
                .value;

        const role =
            document.getElementById("role")
                .value;

        const isActive =
            document.getElementById("isActive")
                .value === "true";


        if (!fullName) {
            throw new Error(
                "Full Name is required."
            );
        }


        if (!role) {
            throw new Error(
                "Please select a role."
            );
        }


        const updateData = {

            full_name: fullName,

            email: email || null,

            role: role,

            is_active: isActive

        };


        // Only update password if a new one was entered
        if (password) {

            updateData.password = password;

        }


        const {
            error
        } = await supabaseClient

            .from("users_master")

            .update(updateData)

            .eq("id", id);


        if (error)
            throw error;


        showAlert(
            "User updated successfully.",
            "success"
        );


        clearUserForm();

        await loadUsers();


    } catch (error) {

        console.error(
            "Update User Error:",
            error
        );

        showAlert(
            error.message,
            "danger"
        );

    }

}

//====================================================
// CLEAR USER FORM
//====================================================

function clearUserForm() {

    document.getElementById("userId").value = "";

    document.getElementById("fullName").value = "";

    document.getElementById("email").value = "";

    document.getElementById("username").value = "";

    document.getElementById("password").value = "";

    document.getElementById("role").value =
        "STOREKEEPER";

    document.getElementById("isActive").value =
        "true";


    // Enable username for new user
    document.getElementById("username")
        .disabled = false;


    // Return to Save mode
    document.getElementById("btnSaveUser")
        .style.display = "inline-block";

    document.getElementById("btnUpdateUser")
        .style.display = "none";
    
    // Clear section permissions
    currentUserPermissions = {};

    renderPermissionCheckboxes();
}

//====================================================
// COPY USER
//====================================================

async function copyUser(id) {

    try {

        const {
            data,
            error
        } = await supabaseClient

            .from("users_master")

            .select(`
                full_name,
                email,
                role,
                is_active
            `)

            .eq("id", id)

            .single();


        if (error)
            throw error;


        // Clear existing ID
        document.getElementById("userId").value = "";


        // Copy user information
        document.getElementById("fullName").value =
            data.full_name || "";

        document.getElementById("email").value =
            data.email || "";


        // Username MUST be new
        document.getElementById("username").value = "";

        // Password MUST be entered again
        document.getElementById("password").value = "";


        document.getElementById("role").value =
            data.role || "STOREKEEPER";

        document.getElementById("isActive").value =
            String(data.is_active);


        // Save mode
        document.getElementById("btnSaveUser")
            .style.display = "inline-block";

        document.getElementById("btnUpdateUser")
            .style.display = "none";


        // Username enabled
        document.getElementById("username")
            .disabled = false;


        // Scroll to form
        document.getElementById("fullName")
            .scrollIntoView({
                behavior: "smooth",
                block: "center"
            });


    } catch (error) {

        console.error(
            "Copy User Error:",
            error
        );

        showAlert(
            error.message,
            "danger"
        );

    }

}

//====================================================
// ACTIVATE / INACTIVE USER
//====================================================

async function toggleUserStatus(id, currentStatus) {

    try {

        const action =
            currentStatus
                ? "make this user inactive"
                : "activate this user";


        const confirmed =
            confirm(
                `Are you sure you want to ${action}?`
            );


        if (!confirmed)
            return;


        const newStatus =
            !currentStatus;


        const {
            error
        } = await supabaseClient

            .from("users_master")

            .update({
                is_active: newStatus
            })

            .eq("id", id);


        if (error)
            throw error;


        showAlert(

            newStatus
                ? "User activated successfully."
                : "User made inactive successfully.",

            "success"

        );


        await loadUsers();


    } catch (error) {

        console.error(
            "Change User Status Error:",
            error
        );

        showAlert(
            error.message,
            "danger"
        );

    }

}
