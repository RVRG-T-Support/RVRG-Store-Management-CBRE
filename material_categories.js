//====================================================
// MATERIAL CATEGORIES & DEPARTMENT MANAGEMENT
//====================================================

let departmentsData = [];
let categoriesData = [];


//====================================================
// PAGE INITIALIZATION
//====================================================

document.addEventListener("DOMContentLoaded", async () => {

    const hasAccess = checkUserAccess(["ADMIN"]);

    if (!hasAccess) return;

    await loadDepartments();

    await loadCategories();

});


//====================================================
// LOAD DEPARTMENTS
//====================================================

async function loadDepartments() {

    try {

        const {
            data,
            error
        } = await supabaseClient

            .from("departments")

            .select(`
                id,
                department_code,
                department_name,
                created_at,
                prefix
            `)

            .order("id", {
                ascending: true
            });


        if (error)
            throw error;


        departmentsData = data || [];


        renderDepartments();

        populateDepartmentDropdown();


    } catch (error) {

        console.error(
            "Load Departments Error:",
            error
        );

        const tbody =
            document.getElementById(
                "departmentTableBody"
            );

        if (tbody) {

            tbody.innerHTML = `
                <tr>
                    <td colspan="5"
                        class="text-center text-danger">
                        Failed to load departments:
                        ${escapeHtml(error.message)}
                    </td>
                </tr>
            `;

        }

    }

}


//====================================================
// RENDER DEPARTMENTS
//====================================================

function renderDepartments() {

    const tbody =
        document.getElementById(
            "departmentTableBody"
        );

    if (!tbody) return;


    if (!departmentsData.length) {

        tbody.innerHTML = `
            <tr>
                <td colspan="5"
                    class="text-center text-muted">
                    No departments found.
                </td>
            </tr>
        `;

        return;

    }


    tbody.innerHTML = "";


    departmentsData.forEach(dept => {

        const row =
            document.createElement("tr");


        row.innerHTML = `

            <td>
                ${escapeHtml(
                    dept.department_code || "-"
                )}
            </td>

            <td class="fw-semibold">
                ${escapeHtml(
                    dept.department_name || "-"
                )}
            </td>

            <td>
                ${escapeHtml(
                    dept.prefix || "-"
                )}
            </td>

            <td>
                ${formatDate(dept.created_at)}
            </td>

            <td>

                <button
                    class="btn btn-sm btn-primary"
                    disabled>

                    <i class="fa-solid fa-pen"></i>
                    Edit

                </button>

            </td>

        `;


        tbody.appendChild(row);

    });

}


//====================================================
// DEPARTMENT DROPDOWN
//====================================================

function populateDepartmentDropdown() {

    const select =
        document.getElementById(
            "categoryDepartment"
        );

    if (!select) return;


    select.innerHTML = `
        <option value="">
            Select Department
        </option>
    `;


    departmentsData.forEach(dept => {

        const option =
            document.createElement("option");


        option.value = dept.id;


        option.textContent =
            `${dept.department_name} (${dept.department_code})`;


        select.appendChild(option);

    });

}


//====================================================
// LOAD CATEGORIES
//====================================================

async function loadCategories() {

    try {

        const {
            data,
            error
        } = await supabaseClient

            .from("material_categories")

            .select(`
                id,
                department_id,
                category_name,
                short_code,
                description,
                is_active,
                created_at
            `)

            .order("id", {
                ascending: true
            });


        if (error)
            throw error;


        categoriesData = data || [];


        renderCategories();


    } catch (error) {

        console.error(
            "Load Categories Error:",
            error
        );


        const tbody =
            document.getElementById(
                "categoryTableBody"
            );


        if (tbody) {

            tbody.innerHTML = `
                <tr>
                    <td colspan="6"
                        class="text-center text-danger">

                        Failed to load categories:
                        ${escapeHtml(error.message)}

                    </td>
                </tr>
            `;

        }

    }

}


//====================================================
// RENDER CATEGORIES
//====================================================

function renderCategories() {

    const tbody =
        document.getElementById(
            "categoryTableBody"
        );

    if (!tbody) return;


    if (!categoriesData.length) {

        tbody.innerHTML = `
            <tr>
                <td colspan="6"
                    class="text-center text-muted">

                    No categories found.

                </td>
            </tr>
        `;

        return;

    }


    tbody.innerHTML = "";


    categoriesData.forEach(category => {

        const department =
            departmentsData.find(
                dept =>
                    dept.id === category.department_id
            );


        const statusClass =
            category.is_active
                ? "bg-success"
                : "bg-secondary";


        const statusText =
            category.is_active
                ? "ACTIVE"
                : "INACTIVE";


        const row =
            document.createElement("tr");


        row.innerHTML = `

            <td>
                ${escapeHtml(
                    department
                        ? department.department_name
                        : "-"
                )}
            </td>

            <td class="fw-semibold">
                ${escapeHtml(
                    category.category_name || "-"
                )}
            </td>

            <td>
                ${escapeHtml(
                    category.short_code || "-"
                )}
            </td>

            <td>
                ${escapeHtml(
                    category.description || "-"
                )}
            </td>

            <td>
                <span class="badge ${statusClass}">
                    ${statusText}
                </span>
            </td>

            <td>

                <button
                    class="btn btn-sm btn-primary"
                    disabled>

                    <i class="fa-solid fa-pen"></i>
                    Edit

                </button>

            </td>

        `;


        tbody.appendChild(row);

    });

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
// SAVE DEPARTMENT
//====================================================

async function saveDepartment() {

    try {

        const code =
            document.getElementById("departmentCode")
                .value.trim()
                .toUpperCase();

        const name =
            document.getElementById("departmentName")
                .value.trim();

        const prefix =
            document.getElementById("departmentPrefix")
                .value.trim()
                .toUpperCase();


        // Validation

        if (!code)
            throw new Error("Department Code is required.");

        if (!name)
            throw new Error("Department Name is required.");

        if (!prefix)
            throw new Error("Department Prefix is required.");


        // Check duplicate code

        const {
            data: existingCode,
            error: codeError
        } = await supabaseClient

            .from("departments")

            .select("id")

            .eq("department_code", code)

            .maybeSingle();


        if (codeError)
            throw codeError;


        if (existingCode)
            throw new Error(
                "Department Code already exists."
            );


        // Check duplicate name

        const {
            data: existingName,
            error: nameError
        } = await supabaseClient

            .from("departments")

            .select("id")

            .eq("department_name", name)

            .maybeSingle();


        if (nameError)
            throw nameError;


        if (existingName)
            throw new Error(
                "Department Name already exists."
            );


        // Check duplicate prefix

        const {
            data: existingPrefix,
            error: prefixError
        } = await supabaseClient

            .from("departments")

            .select("id")

            .eq("prefix", prefix)

            .maybeSingle();


        if (prefixError)
            throw prefixError;


        if (existingPrefix)
            throw new Error(
                "Department Prefix already exists."
            );


        // Insert

        const {
            error
        } = await supabaseClient

            .from("departments")

            .insert({

                department_code: code,

                department_name: name,

                prefix: prefix

            });


        if (error)
            throw error;


        showAlert(
            "Department saved successfully.",
            "success"
        );


        clearDepartmentForm();

        await loadDepartments();


    } catch (error) {

        console.error(
            "Save Department Error:",
            error
        );

        showAlert(
            error.message,
            "danger"
        );

    }

}

//====================================================
// CLEAR DEPARTMENT FORM
//====================================================

function clearDepartmentForm() {

    document.getElementById("departmentId").value = "";

    document.getElementById("departmentCode").value = "";

    document.getElementById("departmentName").value = "";

    document.getElementById("departmentPrefix").value = "";


    document.getElementById("btnSaveDepartment")
        .style.display = "inline-block";


    document.getElementById("btnUpdateDepartment")
        .style.display = "none";

}
