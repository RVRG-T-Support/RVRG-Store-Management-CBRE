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

async function handleDepartmentChange(e) {
    const departmentId = e.target.value;
    
    // Reset dependant dropdowns
    document.getElementById('unitPriceDisplay').innerText = '₹ 0.00';
    document.getElementById('gstNote').innerText = 'GST info will appear here';
    
    await loadMaterials(Number(departmentId));
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
// MULTI MATERIAL REQUEST ITEMS
// ====================================================

let requestItemCount = 0;


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
    // GENERATE ONE TICKET NUMBER
    // ------------------------------------------------

    const year =
        new Date().getFullYear();


    const random =
        Math.floor(
            1000 +
            Math.random() * 9000
        );


    const ticketNo =
        `MR-${year}-${random}`;


    // ------------------------------------------------
    // BUILD INSERT ROWS
    // ------------------------------------------------

    const insertRows =
        validItems.map(
            item => ({

                ticket_no:
                    ticketNo,

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

        const {
            error
        } =
            await supabase

                .from(
                    "material_requests"
                )

                .insert(
                    insertRows
                );


        if(error)
            throw error;


        showAlert(
            `Request ${ticketNo} submitted successfully with ${validItems.length} material(s).`,
            "success"
        );


        // Reset form
        document
            .getElementById(
                "materialRequestForm"
            )
            .reset();


        window.requestItems = [
            createRequestItem()
        ];


        window.currentMaterials = [];


        document
            .getElementById(
                "materialSelect"
            );


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

    table.innerHTML =
        `<tr>
            <td colspan="5">
                Loading...
            </td>
        </tr>`;

    try {

        const { data, error } =
            await supabase

            .from("material_requests")

            .select(`
                ticket_no,
                location_name,
                location_type,
                requested_qty,
                request_status,
                created_at,
                materials!material_requests_material_id_fkey (
    material_name
)
            `)

            .order("created_at",
                {ascending:false})

            .limit(10);

        if(error) throw error;

        table.innerHTML="";

        data.forEach(req=>{

            table.innerHTML += `

            <tr>

                <td>

                    ${req.ticket_no}

                </td>

                <td>

                    ${req.location_name}

                </td>

                <td>

                    ${req.materials?.material_name ?? "-"}

                </td>

                <td>

                    ${req.requested_qty}

                </td>

                <td>

                    ${getStatusBadge(
                        req.request_status
                    )}

                </td>

            </tr>

            `;

        });

    }

    catch(err){

        console.error(err);

        table.innerHTML=
        `<tr>
            <td colspan="5"
                class="text-danger">

                Failed to load requests

            </td>
        </tr>`;

    }

}

