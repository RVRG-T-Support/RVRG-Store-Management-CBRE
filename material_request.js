// material_request.js
// Protect page
const currentUser = getCurrentUser();

if (!currentUser)
    window.location.replace("index.html");

document.addEventListener(
    "DOMContentLoaded",
    initializePage
);

async function initializePage(){

    try{

        await loadDepartments();

        registerEvents();

        await loadRecentRequests();

    }

    catch(error){

        console.error(error);

        showAlert(
            error.message,
            "danger"
        );

    }

}
//====================================================
// REGISTER EVENTS
//====================================================

function registerEvents(){

    document
        .getElementById("departmentSelect")
        .addEventListener(
            "change",
            handleDepartmentChange
        );


    document
        .getElementById("materialRequestForm")
        .addEventListener(
            "submit",
            submitMaterialRequest
        );


    document
        .getElementById("btnAddRequestItem")
        .addEventListener(
            "click",
            addRequestItem
        );


    document
        .getElementById("btnRefreshTable")
        .addEventListener(
            "click",
            loadRecentRequests
        );

}
const hasAccess = checkUserAccess([
    'ADMIN',
    'FM',
    'AFM',
    'STOREKEEPER',
    'STORE'
]);

if (!hasAccess) {
    console.warn("User does not have access to Raise Material Request.");
}

// --- DATA LOADING FUNCTIONS ---
// Load Department

async function loadDepartments() {

    try {

        const { data, error } = await supabase
            .from('departments')
            .select('id, department_name')
            .order('department_name', { ascending: true });

        if (error) throw error;

        const deptSelect = document.getElementById('departmentSelect');

        deptSelect.innerHTML =
            `<option value="">Select Department</option>`;

        data.forEach(dept => {

            deptSelect.innerHTML += `
                <option value="${dept.id}">
                    ${dept.department_name}
                </option>
            `;

        });

    }
    catch (err) {

        console.error("Load Departments:", err);

        showAlert(
            "Unable to load departments.",
            "danger"
        );

    }

}

// Handle Department Changes

async function handleDepartmentChange(e){

    const departmentId =
        Number(e.target.value);


    // Clear current request items
    // whenever department changes.

    requestItemCount = 0;

    window.requestItems = [
        createRequestItem()
    ];


    // Load materials for selected department

    await loadMaterials(
        departmentId
    );

}

// ====================================================
// LOAD MATERIALS
// ====================================================

async function loadMaterials(departmentId) {

    try {

        const {
            data,
            error
        } = await supabase

            .from("materials")

            .select(`
                id,
                material_code,
                material_name,
                brand,
                item_type,
                item_size,
                specification,
                unit,
                unit_cost,
                price,
                gst_type
            `)

            .eq(
                "department_id",
                departmentId
            )

            .eq(
                "is_active",
                true
            )

            .order(
                "material_name"
            );


        if(error)
            throw error;


        window.currentMaterials =
            data || [];


        // Start with one request item
        renderRequestItems();

    }

    catch(err){

        console.error(
            "Load Materials:",
            err
        );

        window.currentMaterials = [];

        renderRequestItems();

    }

}
// ====================================================
// HTML ESCAPE HELPER
// ====================================================

function escapeHtml(value){

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}
// ====================================================
// MULTI MATERIAL REQUEST ITEMS
// ====================================================

let requestItemCount = 0;

// Holds the ticket number currently being edited.
// null means we are creating a new request.
let editingTicketNo = null;


function createRequestItem(){
    requestItemCount++;


    return {

        id:
            requestItemCount,

        materialId:
            "",

        quantity:
            ""

    };

}


window.requestItems = [
    createRequestItem()
];


// ====================================================
// RENDER REQUEST ITEMS
// ====================================================

function renderRequestItems(){

    const container =
        document.getElementById(
            "requestItemsContainer"
        );


    if(!container)
        return;


    container.innerHTML = "";


    window.requestItems.forEach(
        (item,index) => {

            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "border rounded p-3 mb-3 bg-light";


            const options =
                (window.currentMaterials || [])
                .map(mat => {

                    const details = [

                        mat.material_code,

                        mat.material_name,

                        mat.brand,

                        mat.item_type,

                        mat.item_size,

                        mat.specification

                    ]
                    .filter(value =>
                        String(
                            value || ""
                        ).trim() !== ""
                    )
                    .join(" | ");


                    return `

                        <option
                            value="${mat.id}"
                            ${String(
                                item.materialId
                            ) === String(mat.id)
                                ? "selected"
                                : ""}>

                            ${escapeHtml(details)}

                        </option>

                    `;

                })
                .join("");


            card.innerHTML = `

                <div class="d-flex justify-content-between align-items-center mb-2">

                    <strong>
                        Item ${index + 1}
                    </strong>

                    ${
                        window.requestItems.length > 1
                        ? `
                            <button
                                type="button"
                                class="btn btn-outline-danger btn-sm"
                                onclick="removeRequestItem(${item.id})">

                                <i class="fa-solid fa-trash"></i>

                            </button>
                          `
                        : ""
                    }

                </div>


                <div class="mb-2">

                    <label class="form-label small fw-semibold">
                        Select Material
                    </label>

                    <select
                        class="form-select"
                        data-item-id="${item.id}"
                        onchange="handleRequestItemMaterialChange(this)"
                        required>

                        <option value="">
                            Select Material
                        </option>

                        ${options}

                    </select>

                </div>


                <div
                    id="materialDetails-${item.id}"
                    class="border rounded bg-white p-2 mb-2 small">

                    ${
                        item.materialId
                        ? buildMaterialDetails(
                            item.materialId
                        )
                        : `
                            <span class="text-muted">
                                Select a material to view full details.
                            </span>
                          `
                    }

                </div>


                <div>

                    <label class="form-label small fw-semibold">
                        Requested Quantity
                    </label>

                    <input
                        type="number"
                        class="form-control"
                        min="1"
                        step="any"
                        value="${item.quantity || ""}"
                        data-item-id="${item.id}"
                        onchange="handleRequestItemQuantityChange(this)"
                        oninput="handleRequestItemQuantityChange(this)"
                        placeholder="Enter quantity"
                        required>

                </div>

            `;


            container.appendChild(card);

        }
    );

}


// ====================================================
// BUILD MATERIAL DETAILS
// ====================================================

function buildMaterialDetails(
    materialId
){

    const material =
        (window.currentMaterials || [])
        .find(
            m =>
                Number(m.id) ===
                Number(materialId)
        );


    if(!material){

        return `
            <span class="text-danger">
                Material details unavailable.
            </span>
        `;

    }


    const detailRows = [

        [
            "Material Code",
            material.material_code
        ],

        [
            "Material Name",
            material.material_name
        ],

        [
            "Brand",
            material.brand
        ],

        [
            "Item Type",
            material.item_type
        ],

        [
            "Item Size",
            material.item_size
        ],

        [
            "Specification",
            material.specification
        ],

        [
            "Unit",
            material.unit
        ],

        [
            "Unit Cost",
            "₹ " +
            Number(
                material.unit_cost || 0
            ).toFixed(2)
        ],

        [
            "GST",
            material.gst_type
        ]

    ];


    return `

        <div class="row g-2">

            ${

                detailRows
                    .map(
                        ([label,value]) => `

                            <div class="col-md-6">

                                <span class="text-muted">
                                    ${label}:
                                </span>

                                <strong>
                                    ${escapeHtml(
                                        value || "-"
                                    )}
                                </strong>

                            </div>

                        `
                    )
                    .join("")

            }

        </div>

    `;

}


// ====================================================
// MATERIAL CHANGE
// ====================================================

function handleRequestItemMaterialChange(
    select
){

    const itemId =
        Number(
            select.dataset.itemId
        );


    const item =
        window.requestItems.find(
            row =>
                row.id === itemId
        );


    if(!item)
        return;


    const selectedMaterialId =
        select.value;


    // Prevent selecting the same
    // material twice in one ticket.

    if(
        selectedMaterialId &&
        window.requestItems.some(
            row =>
                row.id !== itemId &&
                String(
                    row.materialId
                ) ===
                String(
                    selectedMaterialId
                )
        )
    ){

        showAlert(
            "This material is already added to the request.",
            "warning"
        );

        item.materialId = "";

        renderRequestItems();

        return;

    }


    item.materialId =
        selectedMaterialId;


    item.quantity =
        "";


    renderRequestItems();

}


// ====================================================
// QUANTITY CHANGE
// ====================================================

function handleRequestItemQuantityChange(
    input
){

    const itemId =
        Number(
            input.dataset.itemId
        );


    const item =
        window.requestItems.find(
            row =>
                row.id === itemId
        );


    if(!item)
        return;


    item.quantity =
        input.value;

}


// ====================================================
// ADD MORE ITEM
// ====================================================

function addRequestItem(){

    if(
        !window.currentMaterials ||
        !window.currentMaterials.length
    ){

        showAlert(
            "Please select a Department first.",
            "warning"
        );

        return;

    }


    window.requestItems.push(
        createRequestItem()
    );


    renderRequestItems();

}


// ====================================================
// REMOVE ITEM
// ====================================================

function removeRequestItem(
    itemId
){

    window.requestItems =
        window.requestItems.filter(
            item =>
                item.id !== itemId
        );


    if(
        !window.requestItems.length
    ){

        window.requestItems.push(
            createRequestItem()
        );

    }


    renderRequestItems();

}

// ====================================================
// SUBMIT MULTI-MATERIAL REQUEST
// ====================================================

async function submitMaterialRequest(e){

    e.preventDefault();


    const user =
        getCurrentUser();


    const locationType =
        document.getElementById(
            "ticketType"
        ).value;
    
    const anacityComplaintNo =
        document.getElementById(
        "anacityComplaintNo"
        ).value.trim();

    const locationName =
        document.getElementById(
            "locationInput"
        ).value.trim();


    const technicianName =
        document.getElementById(
            "technicianName"
        ).value.trim();


    const remarks =
        document.getElementById(
            "requestRemarks"
        ).value.trim();


    // ------------------------------------------------
    // VALIDATE ITEMS
    // ------------------------------------------------

    const validItems =
        window.requestItems.filter(
            item =>
                item.materialId &&
                Number(item.quantity) > 0
        );


    if(!validItems.length){

        showAlert(
            "Please add at least one material and quantity.",
            "warning"
        );

        return;

    }


    // ------------------------------------------------
    // CHECK DUPLICATES
    // ------------------------------------------------

    const materialIds =
        validItems.map(
            item =>
                String(
                    item.materialId
                )
        );


    const hasDuplicate =
        materialIds.some(
            (id,index) =>
                materialIds.indexOf(id)
                !== index
        );


    if(hasDuplicate){

        showAlert(
            "The same material cannot be added twice in one ticket.",
            "warning"
        );

        return;

    }


// ------------------------------------------------
// GENERATE SEQUENTIAL TICKET NUMBER
// ------------------------------------------------

const year =
    new Date().getFullYear();

const prefix =
    `MR-${year}-`;


// Get existing tickets for this year
const {
    data: existingTickets,
    error: ticketError
} = await supabase

    .from("material_requests")

    .select("ticket_no")

    .like(
        "ticket_no",
        `${prefix}%`
    );


if(ticketError)
    throw ticketError;


// Find the highest existing sequence number
let maxSequence = 0;

(existingTickets || []).forEach(row => {

    const ticketNo =
        String(
            row.ticket_no || ""
        ).trim();


    if(
        !ticketNo.startsWith(prefix)
    )
        return;


    const suffix =
        ticketNo.substring(
            prefix.length
        );


    const number =
        parseInt(
            suffix,
            10
        );


    if(
        Number.isFinite(number) &&
        number > maxSequence
    ){

        maxSequence =
            number;

    }

});


// Generate next sequential number
const nextSequence =
    maxSequence + 1;


// Keep 4 digits
const ticketNo =
    `${prefix}${String(
        nextSequence
    ).padStart(4, "0")}`;


// ------------------------------------------------
// BUILD REQUEST ROWS
// ------------------------------------------------

const saveTicketNo =
    editingTicketNo || ticketNo;


const requestRows =
    validItems.map(
        item => ({

            ticket_no:
                saveTicketNo,

            anacity_complaint_no:
                anacityComplaintNo,

            location_type:
                locationType,

            location_name:
                locationName,

            technician_id:
                null,

            technician_name:
                technicianName,

            material_id:
                Number(
                    item.materialId
                ),

            requested_qty:
                Number(
                    item.quantity
                ),

            remarks:
                remarks,

            request_status:
                "PENDING",

            requested_by:
                user.id

        })
    );


try{

    // ====================================================
    // EDIT EXISTING PENDING TICKET
    // ====================================================

    if(editingTicketNo){

        // Delete the old pending material rows
        // for this ticket before saving the edited version.

        const {
            error: deleteError
        } = await supabase

            .from("material_requests")

            .delete()

            .eq(
                "ticket_no",
                editingTicketNo
            )

            .eq(
                "request_status",
                "PENDING"
            );


        if(deleteError)
            throw deleteError;


        // Insert the edited rows using
        // the same ticket number.

        const {
            error: insertEditError
        } = await supabase

            .from("material_requests")

            .insert(
                requestRows
            );


        if(insertEditError)
            throw insertEditError;


        showAlert(
            `Request ${editingTicketNo} updated successfully.`,
            "success"
        );

    }

    // ====================================================
    // CREATE NEW TICKET
    // ====================================================

    else{

        const {
            error: insertError
        } = await supabase

            .from("material_requests")

            .insert(
                requestRows
            );


        if(insertError)
            throw insertError;


        showAlert(
            `Request ${ticketNo} submitted successfully with ${validItems.length} material(s).`,
            "success"
        );

    }


    // ====================================================
    // RESET FORM
    // ====================================================

    editingTicketNo = null;


    document
        .getElementById(
            "materialRequestForm"
        )
        .reset();


    window.requestItems = [
        createRequestItem()
    ];


    window.currentMaterials = [];


    renderRequestItems();


    loadRecentRequests();

}

catch(err){

    console.error(
        "Submit Material Request:",
        err
    );


    showAlert(
        err.message,
        "danger"
    );

}
}

// --- RECENT REQUESTS TABLE LOGIC ---

async function loadRecentRequests() {

    const table =
        document.getElementById(
            "recentRequestsTable"
        );


    table.innerHTML = `
        <tr>
            <td colspan="6"
                class="text-center text-muted py-4">

                Loading...

            </td>
        </tr>
    `;


    try {

        const {
            data,
            error
        } = await supabase

            .from("material_requests")

            .select(`
                id,
                ticket_no,
                anacity_complaint_no,
                location_name,
                location_type,
                requested_qty,
                request_status,
                created_at,
                material_id,

                materials!material_requests_material_id_fkey (
                    material_name,
                    department_id
                )
            `)

            .order(
                "created_at",
                {
                    ascending: false
                }
            )

            .limit(20);


        if(error)
            throw error;


        table.innerHTML = "";


        if(
            !data ||
            data.length === 0
        ){

            table.innerHTML = `
                <tr>
                    <td colspan="6"
                        class="text-center text-muted py-4">

                        No material requests found.

                    </td>
                </tr>
            `;

            return;

        }


        data.forEach(req => {

            const isPending =
                req.request_status ===
                "PENDING";


            const actionButtons =
                isPending

                ? `

                    <button
                        type="button"
                        class="btn btn-outline-primary btn-sm me-1"
                        onclick="editMaterialRequest('${req.ticket_no}')"
                        title="Edit Request">

                        <i class="fa-solid fa-pen-to-square"></i>
                        Edit

                    </button>

                    <button
                        type="button"
                        class="btn btn-outline-danger btn-sm"
                        onclick="deleteMaterialRequest('${req.ticket_no}')"
                        title="Delete Request">

                        <i class="fa-solid fa-trash"></i>
                        Delete

                    </button>

                  `

                : `

                    <span class="text-muted">
                        -
                    </span>

                  `;


            table.innerHTML += `

                <tr>

                    <td>

                        <strong>
                            ${req.ticket_no}
                        </strong>

                    </td>


                    <td>

                        <strong>
                            ${escapeHtml(
                                req.location_name || "-"
                            )}
                        </strong>

                        <br>

                        <small class="text-muted">

                            Complaint Number:
                            ${
                                escapeHtml(
                                    req.anacity_complaint_no || "-"
                                )
                            }

                        </small>

                    </td>


                    <td>

                        ${
                            escapeHtml(
                                req.materials?.material_name || "-"
                            )
                        }

                    </td>


                    <td>

                        ${req.requested_qty}

                    </td>


                    <td>

                        ${getStatusBadge(
                            req.request_status
                        )}

                    </td>


                    <td class="text-center text-nowrap">

                        ${actionButtons}

                    </td>

                </tr>

            `;

        });

    }

    catch(err){

        console.error(
            "Load Recent Requests:",
            err
        );


        table.innerHTML = `
            <tr>
                <td colspan="6"
                    class="text-center text-danger py-4">

                    Failed to load requests.

                </td>
            </tr>
        `;

    }

}

// ====================================================
// EDIT PENDING MATERIAL REQUEST
// ====================================================

window.editMaterialRequest = async function(
    ticketNo
){

    try{

        // Load all rows belonging to this ticket
        const {
            data,
            error
        } = await supabase

            .from("material_requests")

            .select(`
                id,
                ticket_no,
                anacity_complaint_no,
                location_name,
                location_type,
                technician_name,
                requested_qty,
                remarks,
                request_status,
                material_id,

                materials!material_requests_material_id_fkey (
                    department_id
                )
            `)

            .eq(
                "ticket_no",
                ticketNo
            )

            .eq(
                "request_status",
                "PENDING"
            )

            .order(
                "id",
                {
                    ascending: true
                }
            );


        if(error)
            throw error;


        if(
            !data ||
            !data.length
        ){

            showAlert(
                "This request can no longer be edited.",
                "warning"
            );

            loadRecentRequests();

            return;

        }


        // ------------------------------------------------
        // Fill main form fields
        // ------------------------------------------------

        document
            .getElementById(
                "anacityComplaintNo"
            )
            .value =
            data[0].anacity_complaint_no || "";


        document
            .getElementById(
                "ticketType"
            )
            .value =
            data[0].location_type || "";


        document
            .getElementById(
                "locationInput"
            )
            .value =
            data[0].location_name || "";


        document
            .getElementById(
                "technicianName"
            )
            .value =
            data[0].technician_name || "";


        document
            .getElementById(
                "requestRemarks"
            )
            .value =
            data[0].remarks || "";


        // ------------------------------------------------
        // Load department from first material
        // ------------------------------------------------

        const departmentId =
            data[0]
                .materials
                ?.department_id;


        if(!departmentId){

            showAlert(
                "Unable to determine the request department.",
                "danger"
            );

            return;

        }


        const departmentSelect =
            document.getElementById(
                "departmentSelect"
            );


        departmentSelect.value =
            String(
                departmentId
            );


        await loadMaterials(
            Number(
                departmentId
            )
        );


        // ------------------------------------------------
        // Rebuild all requested material rows
        // ------------------------------------------------

        requestItemCount = 0;


        window.requestItems =
            data.map(
                row => ({

                    id:
                        ++requestItemCount,

                    materialId:
                        String(
                            row.material_id
                        ),

                    quantity:
                        row.requested_qty

                })
            );


        renderRequestItems();


        // ------------------------------------------------
        // Enter edit mode
        // ------------------------------------------------

        editingTicketNo =
            ticketNo;


        // Scroll back to the form
        document
            .getElementById(
                "materialRequestForm"
            )
            .scrollIntoView({
                behavior: "smooth",
                block: "start"
            });


        showAlert(
            `Editing request ${ticketNo}. Make your changes and submit again.`,
            "info"
        );

    }

    catch(error){

        console.error(
            "Edit Material Request:",
            error
        );


        showAlert(
            "Failed to load request for editing.",
            "danger"
        );

    }

};

// ====================================================
// DELETE PENDING MATERIAL REQUEST
// ====================================================

window.deleteMaterialRequest = async function(
    ticketNo
){

    const confirmed =
        confirm(
            `Are you sure you want to DELETE request ${ticketNo}?\n\nThis will delete the complete material request ticket.`
        );


    if(!confirmed)
        return;


    try{

        // Safety check:
        // Only PENDING requests can be deleted.

        const {
            data,
            error: checkError
        } = await supabase

            .from("material_requests")

            .select(
                "id, request_status"
            )

            .eq(
                "ticket_no",
                ticketNo
            );


        if(checkError)
            throw checkError;


        if(
            !data ||
            !data.length
        ){

            showAlert(
                "Request not found.",
                "warning"
            );

            loadRecentRequests();

            return;

        }


        const allPending =
            data.every(
                row =>
                    row.request_status ===
                    "PENDING"
            );


        if(!allPending){

            showAlert(
                "This request has already been approved or processed and cannot be deleted.",
                "warning"
            );

            loadRecentRequests();

            return;

        }


        // Delete all material rows
        // belonging to this ticket.

        const {
            error: deleteError
        } = await supabase

            .from("material_requests")

            .delete()

            .eq(
                "ticket_no",
                ticketNo
            )

            .eq(
                "request_status",
                "PENDING"
            );


        if(deleteError)
            throw deleteError;


        // If the user was editing this ticket,
        // cancel edit mode.

        if(
            editingTicketNo ===
            ticketNo
        ){

            editingTicketNo =
                null;

        }


        showAlert(
            `Request ${ticketNo} deleted successfully.`,
            "success"
        );


        loadRecentRequests();

    }

    catch(error){

        console.error(
            "Delete Material Request:",
            error
        );


        showAlert(
            "Failed to delete request.",
            "danger"
        );

    }

};
