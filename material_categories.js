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
                        onclick="editDepartment(${dept.id})">

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
    onclick="editCategory(${category.id})">

    <i class="fa-solid fa-pen"></i>
    Edit

</button>

<button
    class="btn btn-sm ${category.is_active ? 'btn-danger' : 'btn-success'}"
    onclick="toggleCategoryStatus(${category.id}, ${category.is_active})">

    <i class="fa-solid ${category.is_active ? 'fa-ban' : 'fa-check'}"></i>

    ${category.is_active ? 'Inactive' : 'Activate'}

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

//====================================================
// EDIT DEPARTMENT
//====================================================

async function editDepartment(id) {

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
                prefix
            `)

            .eq("id", id)

            .single();


        if (error)
            throw error;


        document.getElementById("departmentId").value =
            data.id;

        document.getElementById("departmentCode").value =
            data.department_code || "";

        document.getElementById("departmentName").value =
            data.department_name || "";

        document.getElementById("departmentPrefix").value =
            data.prefix || "";


        // Code and prefix remain editable
        document.getElementById("departmentCode")
            .disabled = false;

        document.getElementById("departmentPrefix")
            .disabled = false;


        // Switch to Update mode

        document.getElementById("btnSaveDepartment")
            .style.display = "none";

        document.getElementById("btnUpdateDepartment")
            .style.display = "inline-block";


        document.getElementById("departmentCode")
            .scrollIntoView({
                behavior: "smooth",
                block: "center"
            });


    } catch (error) {

        console.error(
            "Edit Department Error:",
            error
        );

        showAlert(
            error.message,
            "danger"
        );

    }

}

//====================================================
// UPDATE DEPARTMENT
//====================================================

async function updateDepartment() {

    try {

        const id =
            document.getElementById("departmentId").value;

        if (!id)
            throw new Error(
                "No department selected for update."
            );


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


        if (!code)
            throw new Error(
                "Department Code is required."
            );

        if (!name)
            throw new Error(
                "Department Name is required."
            );

        if (!prefix)
            throw new Error(
                "Department Prefix is required."
            );


        // Duplicate code check excluding current record

        const {
            data: codeExists,
            error: codeError
        } = await supabaseClient

            .from("departments")

            .select("id")

            .eq("department_code", code)

            .neq("id", id)

            .maybeSingle();


        if (codeError)
            throw codeError;


        if (codeExists)
            throw new Error(
                "Department Code already exists."
            );


        // Duplicate name check

        const {
            data: nameExists,
            error: nameError
        } = await supabaseClient

            .from("departments")

            .select("id")

            .eq("department_name", name)

            .neq("id", id)

            .maybeSingle();


        if (nameError)
            throw nameError;


        if (nameExists)
            throw new Error(
                "Department Name already exists."
            );


        // Duplicate prefix check

        const {
            data: prefixExists,
            error: prefixError
        } = await supabaseClient

            .from("departments")

            .select("id")

            .eq("prefix", prefix)

            .neq("id", id)

            .maybeSingle();


        if (prefixError)
            throw prefixError;


        if (prefixExists)
            throw new Error(
                "Department Prefix already exists."
            );


        // Update

        const {
            error
        } = await supabaseClient

            .from("departments")

            .update({

                department_code: code,

                department_name: name,

                prefix: prefix

            })

            .eq("id", id);


        if (error)
            throw error;


        showAlert(
            "Department updated successfully.",
            "success"
        );


        clearDepartmentForm();

        await loadDepartments();

        await loadCategories();


    } catch (error) {

        console.error(
            "Update Department Error:",
            error
        );

        showAlert(
            error.message,
            "danger"
        );

    }

}

//====================================================
// EDIT MATERIAL CATEGORY
//====================================================

async function editCategory(id) {

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
                is_active
            `)

            .eq("id", id)

            .single();


        if (error)
            throw error;


        document.getElementById("categoryId").value =
            data.id;

        document.getElementById("categoryDepartment").value =
            data.department_id;

        document.getElementById("categoryName").value =
            data.category_name || "";

        document.getElementById("categoryShortCode").value =
            data.short_code || "";

        document.getElementById("categoryDescription").value =
            data.description || "";

        document.getElementById("categoryActive").value =
            data.is_active ? "true" : "false";


        // Switch to Update mode

        document.getElementById("btnSaveCategory")
            .style.display = "none";

        document.getElementById("btnUpdateCategory")
            .style.display = "inline-block";


        document.getElementById("categoryDepartment")
            .scrollIntoView({
                behavior: "smooth",
                block: "center"
            });


    } catch (error) {

        console.error(
            "Edit Category Error:",
            error
        );

        showAlert(
            error.message,
            "danger"
        );

    }

}

//====================================================
// UPDATE MATERIAL CATEGORY
//====================================================

async function updateCategory() {

    try {

        const id =
            document.getElementById("categoryId").value;

        if (!id)
            throw new Error(
                "No category selected for update."
            );


        const departmentId =
            document.getElementById("categoryDepartment")
                .value;

        const categoryName =
            document.getElementById("categoryName")
                .value.trim();

        const shortCode =
            document.getElementById("categoryShortCode")
                .value.trim()
                .toUpperCase();

        const description =
            document.getElementById("categoryDescription")
                .value.trim();

        const isActive =
            document.getElementById("categoryActive")
                .value === "true";


        // Validation

        if (!departmentId)
            throw new Error(
                "Please select a Department."
            );

        if (!categoryName)
            throw new Error(
                "Category Name is required."
            );

        if (!shortCode)
            throw new Error(
                "Short Code is required."
            );


        // Duplicate category name
        // within selected department

        const {
            data: existingCategory,
            error: categoryError
        } = await supabaseClient

            .from("material_categories")

            .select("id")

            .eq("department_id", departmentId)

            .eq("category_name", categoryName)

            .neq("id", id)

            .maybeSingle();


        if (categoryError)
            throw categoryError;


        if (existingCategory)
            throw new Error(
                "This Category already exists in the selected Department."
            );


        // Duplicate short code

        const {
            data: existingCode,
            error: codeError
        } = await supabaseClient

            .from("material_categories")

            .select("id")

            .eq("short_code", shortCode)

            .neq("id", id)

            .maybeSingle();


        if (codeError)
            throw codeError;


        if (existingCode)
            throw new Error(
                "Category Short Code already exists."
            );


        // Update

        const {
            error
        } = await supabaseClient

            .from("material_categories")

            .update({

                department_id: Number(departmentId),

                category_name: categoryName,

                short_code: shortCode,

                description: description || null,

                is_active: isActive

            })

            .eq("id", id);


        if (error)
            throw error;


        showAlert(
            "Material Category updated successfully.",
            "success"
        );


        clearCategoryForm();

        await loadCategories();


    } catch (error) {

        console.error(
            "Update Category Error:",
            error
        );

        showAlert(
            error.message,
            "danger"
        );

    }

}

//====================================================
// ACTIVATE / INACTIVE CATEGORY
//====================================================

async function toggleCategoryStatus(id, currentStatus) {

    try {

        const action =
            currentStatus
                ? "make this category inactive"
                : "activate this category";


        if (!confirm(
            `Are you sure you want to ${action}?`
        )) {
            return;
        }


        const newStatus =
            !currentStatus;


        const {
            error
        } = await supabaseClient

            .from("material_categories")

            .update({
                is_active: newStatus
            })

            .eq("id", id);


        if (error)
            throw error;


        showAlert(

            newStatus
                ? "Category activated successfully."
                : "Category made inactive successfully.",

            "success"

        );


        await loadCategories();


    } catch (error) {

        console.error(
            "Category Status Error:",
            error
        );

        showAlert(
            error.message,
            "danger"
        );

    }

}
