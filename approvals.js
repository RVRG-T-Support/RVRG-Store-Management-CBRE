// approvals.js
// Protect page
const currentUser = getCurrentUser();

if (!currentUser)
    window.location.replace("index.html");

// Global variable to hold the ID of the request being rejected
let currentRejectId = null; 
//====================================================
// DATE & TIME FORMAT
//====================================================

function formatDateTime(dateValue){

    if(!dateValue)
        return "N/A";

    return new Date(dateValue).toLocaleString(
        "en-IN",
        {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true
        }
    );

}
// Initialize the Bootstrap modal
let rejectModalInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Security Check: Only ADMIN, FM, and AFM can access approvals
    // If a STORE user tries to load this, they get redirected to the dashboard.
    const hasAccess = checkUserAccess(['ADMIN', 'FM', 'AFM']);
    if (!hasAccess) return;
    
    // Initialize Bootstrap Modal
    rejectModalInstance = new bootstrap.Modal(document.getElementById('rejectModal'));

    // Load initial data
loadPendingApprovals();
loadApprovedHistory();

    // Event Listeners
document.getElementById('btnRefreshApprovals').addEventListener('click', () => {
    loadPendingApprovals();
    loadApprovedHistory();
});

document.getElementById('confirmRejectBtn').addEventListener('click', processRejection);
});

// --- DATA LOADING LOGIC ---

async function loadPendingApprovals() {
    const tableBody = document.getElementById('pendingApprovalsTable');
    tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Loading pending requests...</td></tr>';

    try {
        // Fetch requests with PENDING status, joining related tables
        const { data, error } = await supabase
            .from('material_requests')
            .select(`
                *,
    materials!material_requests_material_id_fkey (
    material_code,
    material_name,
    brand,
    item_type,
    item_size,
    specification,
    unit,
    unit_cost,
    department_id,
    departments (
    department_name
    )
)
`)
        .eq('request_status', 'PENDING')
            .order('created_at', { ascending: true }); // Oldest first

        if (error) throw error;

        if (data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-success py-4"><i class="fa-solid fa-check-circle me-2"></i>All caught up! No pending requests.</td></tr>';
            return;
        }

        tableBody.innerHTML = ''; // Clear table
        
// ====================================================
// GROUP PENDING REQUESTS BY TICKET
// ====================================================

const ticketGroups = {};

data.forEach(req => {

    const ticketNo =
        req.ticket_no || "NO-TICKET";

    if(!ticketGroups[ticketNo]){

        ticketGroups[ticketNo] = {
            ticketNo: ticketNo,
            complaintNo:
                req.anacity_complaint_no || "N/A",
            department:
                req.materials?.departments?.department_name || "-",
            technician:
                req.technician_name || "-",
            locationType:
                req.location_type || "N/A",
            locationName:
                req.location_name || "N/A",
            createdAt:
                req.created_at,
            items: []
        };

    }

    ticketGroups[ticketNo].items.push(req);

});


// ====================================================
// RENDER ONE ROW PER TICKET
// ====================================================

Object.values(ticketGroups).forEach(
    ticket => {

        const tr =
            document.createElement("tr");

        // --------------------------------------------
        // COMPLAINT / TICKET
        // --------------------------------------------

        let ticketHtml = `

            <div class="fw-bold text-success">
                Complaint Number:
                ${ticket.complaintNo}
            </div>

            <div class="fw-bold text-primary">
                MR:
                ${ticket.ticketNo}
            </div>

            <small class="text-muted">
                ${formatDateTime(ticket.createdAt)}
            </small>

        `;


        // --------------------------------------------
        // MATERIAL DETAILS
        // --------------------------------------------

        let materialHtml = "";

        ticket.items.forEach(
            (req, index) => {

                const material =
                    req.materials || {};

                const materialCode =
                    material.material_code || "-";

                const materialName =
                    material.material_name || "-";

                const brand =
                    material.brand || "-";

                const itemType =
                    material.item_type || "-";

                const itemSize =
                    material.item_size || "-";

                const specification =
                    material.specification || "-";

                const unit =
                    material.unit || "-";

                const unitCost =
                    Number(
                        material.unit_cost || 0
                    );


                materialHtml += `

                    <div
                        class="border-bottom pb-2 mb-2"
                    >

                        <div class="fw-bold text-primary">
                            ${materialCode}
                        </div>

                        <div class="fw-semibold">
                            ${materialName}
                        </div>

                        <div class="small text-muted">

                            <div>
                                <strong>Brand:</strong>
                                ${brand}
                            </div>

                            <div>
                                <strong>Type:</strong>
                                ${itemType}
                            </div>

                            <div>
                                <strong>Size:</strong>
                                ${itemSize}
                            </div>

                            <div>
                                <strong>Specification:</strong>
                                ${specification}
                            </div>

                            <div>
                                <strong>Unit:</strong>
                                ${unit}
                            </div>

                            <div>
                                <strong>Unit Cost:</strong>
                                ₹${unitCost.toFixed(2)}
                            </div>

                        </div>

                    </div>

                `;

            }
        );


        // --------------------------------------------
        // QUANTITY / APPROVAL QUANTITY
        // --------------------------------------------

        let quantityHtml = "";

        ticket.items.forEach(
            req => {

                const requestedQty =
                    Number(
                        req.requested_qty || 0
                    );

                quantityHtml += `

                    <div
                        class="border-bottom pb-2 mb-2"
                    >

                        <div class="fw-bold mb-1">

                            Requested:
                            <span
                                class="badge bg-secondary"
                            >
                                ${requestedQty}
                            </span>

                        </div>

                        <label
                            class="form-label small mb-1"
                            for="approvedQty_${req.id}"
                        >
                            Approve Qty
                        </label>

                        <input
                            type="number"
                            class="form-control form-control-sm text-center"
                            id="approvedQty_${req.id}"
                            value="${requestedQty}"
                            min="1"
                            max="${requestedQty}"
                            step="1"
                        >

                    </div>

                `;

            }
        );


        // --------------------------------------------
        // BUILD TICKET ROW
        // --------------------------------------------

        tr.innerHTML = `

            <td>

                ${ticketHtml}

                <div class="mt-2">

                    <span
                        class="badge bg-info text-dark"
                    >
                        ${ticket.items.length}
                        Material(s)
                    </span>

                </div>

            </td>


            <td>

                <strong>
                    ${ticket.department}
                </strong>

                <br>

                <small class="text-muted">

                    <i
                        class="fa-solid fa-user-wrench me-1"
                    ></i>

                    ${ticket.technician}

                </small>

            </td>


            <td>

                ${materialHtml}

            </td>


            <td>

                ${quantityHtml}

            </td>


            <td>

                ${ticket.locationType}

                <br>

                <small class="text-muted">
                    ${ticket.locationName}
                </small>

            </td>


            <td class="text-center">

                <button
                    class="btn btn-success btn-sm fw-bold mb-2"
                    onclick="approveTicket('${ticket.ticketNo}')"
                    title="Approve complete ticket"
                >

                    <i class="fa-solid fa-check"></i>

                    Approve Ticket

                </button>


                <br>


                <button
                    class="btn btn-outline-danger btn-sm"
                    onclick="openRejectModal('${ticket.ticketNo}')"
                    title="Reject complete ticket"
                >

                    <i class="fa-solid fa-xmark"></i>

                    Reject Ticket

                </button>

            </td>

        `;


        tableBody.appendChild(tr);

    }
);

    } catch (error) {
        console.error("Error loading approvals:", error.message);
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Failed to load pending requests.</td></tr>';
    }
}

// ====================================================
// APPROVE COMPLETE TICKET
// ====================================================

window.approveTicket = async function(ticketNo){

    try{

        // --------------------------------------------
        // LOAD ALL PENDING ITEMS FOR THIS TICKET
        // --------------------------------------------

        const {
            data: requests,
            error: requestError
        } = await supabase

            .from("material_requests")

            .select(
                "id, ticket_no, requested_qty, request_status"
            )

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


        if(requestError)
            throw requestError;


        if(
            !requests ||
            !requests.length
        ){

            showAlert(
                "No pending materials found for this ticket.",
                "warning"
            );

            return;

        }


        // --------------------------------------------
        // READ + VALIDATE EVERY APPROVED QUANTITY
        // --------------------------------------------

        const approvals = [];

        for(
            const req of requests
        ){

            const input =
                document.getElementById(
                    `approvedQty_${req.id}`
                );


            if(!input){

                showAlert(
                    `Approved quantity field not found for request ${req.id}.`,
                    "danger"
                );

                return;

            }


            const requestedQty =
                Number(
                    req.requested_qty || 0
                );


            const approvedQty =
                Number(
                    input.value
                );


            if(
                !Number.isFinite(
                    approvedQty
                ) ||
                approvedQty <= 0
            ){

                showAlert(
                    `Invalid approval quantity for one of the materials.`,
                    "warning"
                );

                input.focus();

                return;

            }


            if(
                approvedQty >
                requestedQty
            ){

                showAlert(
                    `Approved quantity cannot be greater than requested quantity (${requestedQty}).`,
                    "warning"
                );

                input.focus();

                return;

            }


            approvals.push({

                id:
                    req.id,

                requestedQty:
                    requestedQty,

                approvedQty:
                    approvedQty

            });

        }


        // --------------------------------------------
        // CONFIRM COMPLETE TICKET
        // --------------------------------------------

        let summary = "";

        approvals.forEach(
            item => {

                summary +=
                    `Requested: ${item.requestedQty} | ` +
                    `Approved: ${item.approvedQty}\n`;

            }
        );


        const confirmed =
            confirm(

                `Approve complete ticket ${ticketNo}?\n\n` +

                `${requests.length} material(s)\n\n` +

                summary

            );


        if(!confirmed)
            return;


        const user =
            getCurrentUser();


        const approvalDate =
            new Date().toISOString();


        // --------------------------------------------
        // UPDATE EACH MATERIAL ROW
        // --------------------------------------------

        for(
            const item of approvals
        ){

            const approvalStatus =
                item.approvedQty <
                item.requestedQty
                    ? "PARTIALLY_APPROVED"
                    : "APPROVED";


            const {
                error: updateError
            } = await supabase

                .from(
                    "material_requests"
                )

                .update({

                    request_status:
                        approvalStatus,

                    approved_qty:
                        item.approvedQty,

                    approved_by:
                        user.id,

                    approval_date:
                        approvalDate

                })

                .eq(
                    "id",
                    item.id
                );


            if(updateError)
                throw updateError;

        }


        // --------------------------------------------
        // SUCCESS
        // --------------------------------------------

        showAlert(
            `Ticket ${ticketNo} approved successfully.\n${approvals.length} material(s) processed.`,
            "success"
        );


        // Refresh
        await loadPendingApprovals();

        await loadApprovedHistory();

    }

    catch(error){

        console.error(
            "Ticket Approval Error:",
            error
        );

        showAlert(
            error.message,
            "danger"
        );

    }

};

// --- REJECTION LOGIC ---

function openRejectModal(ticketNo){

    currentRejectId =
        ticketNo;

    document
        .getElementById(
            "rejectTicketNoDisplay"
        )
        .innerText =
            ticketNo;

    document
        .getElementById(
            "rejectReason"
        )
        .value = "";

    rejectModalInstance.show();

}
async function processRejection(){

    if(!currentRejectId)
        return;


    const ticketNo =
        currentRejectId;


    const reason =
        document
            .getElementById(
                "rejectReason"
            )
            .value
            .trim();


    const user =
        getCurrentUser();


    try{

        // --------------------------------------------
        // REJECT ALL PENDING MATERIALS IN TICKET
        // --------------------------------------------

        const {
            error
        } = await supabase

            .from(
                "material_requests"
            )

            .update({

                request_status:
                    "REJECTED",

                remarks:
                    reason
                        ? `Rejected: ${reason}`
                        : "Rejected without remarks",

                approved_by:
                    user.id,

                approval_date:
                    new Date().toISOString()

            })

            .eq(
                "ticket_no",
                ticketNo
            )

            .eq(
                "request_status",
                "PENDING"
            );


        if(error)
            throw error;


        rejectModalInstance.hide();


        showAlert(
            `Ticket ${ticketNo} rejected successfully.`,
            "info"
        );


        await loadPendingApprovals();


        await loadApprovedHistory();

    }

    catch(error){

        console.error(
            "Error rejecting ticket:",
            error.message
        );

        showAlert(
            "Failed to reject ticket.",
            "danger"
        );

    }

    finally{

        currentRejectId =
            null;

    }

}

// --- APPROVED HISTORY LOGIC ---

async function loadApprovedHistory() {

    const tableBody =
        document.getElementById('approvedHistoryTable');

    if (!tableBody) return;

    tableBody.innerHTML = `
        <tr>
            <td colspan="8"
                class="text-center text-muted py-4">
                Loading approved history...
            </td>
        </tr>
    `;

    try {

        const { data, error } = await supabase
            .from('material_requests')
            .select(`
                *,
                materials!material_requests_material_id_fkey (
                    material_code,
                    material_name,
                    brand,
                    item_type,
                    item_size,
                    specification,
                    unit,
                    unit_cost,
                    department_id,
                    departments (
                        department_name
                    )
                )
            `)
            .in(
                'request_status',
                ['APPROVED', 'PARTIALLY_APPROVED']
            )
            .order(
                'approval_date',
                { ascending: false }
            );

        if (error) throw error;

        if (!data || data.length === 0) {

            tableBody.innerHTML = `
                <tr>
                    <td colspan="8"
                        class="text-center text-muted py-4">
                        No approved requests yet.
                    </td>
                </tr>
            `;

            return;
        }

        tableBody.innerHTML = '';

        data.forEach(req => {

            const material =
                req.materials || {};

            const materialCode =
                material.material_code || "-";

            const materialName =
                material.material_name || "-";

            const brand =
                material.brand || "-";

            const itemType =
                material.item_type || "-";

            const itemSize =
                material.item_size || "-";

            const specification =
                material.specification || "-";

            const unit =
                material.unit || "-";

            const unitCost =
                Number(material.unit_cost || 0);

            const deptName =
                material.departments?.department_name || "-";

            const techName =
                req.technician_name || "-";

            const requestedQty =
                Number(req.requested_qty || 0);

            const approvedQty =
                Number(
                    req.approved_qty ?? requestedQty
                );

            const status =
                req.request_status;

            const statusBadge =
                status === "PARTIALLY_APPROVED"
                    ? `
                        <span class="badge bg-warning text-dark">
                            Partially Approved
                        </span>
                    `
                    : `
                        <span class="badge bg-success">
                            Approved
                        </span>
                    `;

const approvalDate =
    req.approval_date
        ? formatDateTime(req.approval_date)
        : "N/A";
            const tr =
                document.createElement('tr');

            tr.innerHTML = `

                <td>

                    <div class="fw-bold text-success">
                        Complaint Number:
                        ${req.anacity_complaint_no || "N/A"}
                    </div>

                    <div class="fw-bold text-primary">
                        MR:
                        ${req.ticket_no || "N/A"}
                    </div>

                </td>

                <td>

                    <strong>
                        ${deptName}
                    </strong>

                    <br>

                    <small class="text-muted">
                        <i class="fa-solid fa-user-wrench me-1"></i>
                        ${techName}
                    </small>

                </td>

                <td>

                    <div class="fw-bold text-primary">
                        ${materialCode}
                    </div>

                    <div class="fw-semibold">
                        ${materialName}
                    </div>

                    <div class="small text-muted mt-1">

                        <div>
                            <strong>Brand:</strong>
                            ${brand}
                        </div>

                        <div>
                            <strong>Type:</strong>
                            ${itemType}
                        </div>

                        <div>
                            <strong>Size:</strong>
                            ${itemSize}
                        </div>

                        <div>
                            <strong>Specification:</strong>
                            ${specification}
                        </div>

                        <div>
                            <strong>Unit:</strong>
                            ${unit}
                        </div>

                        <div>
                            <strong>Unit Cost:</strong>
                            ₹${unitCost.toFixed(2)}
                        </div>

                    </div>

                </td>

                <td>

                    <span class="badge bg-secondary">
                        ${requestedQty}
                    </span>

                </td>

                <td>

                    <span class="badge ${
                        approvedQty < requestedQty
                            ? "bg-warning text-dark"
                            : "bg-success"
                    }">

                        ${approvedQty}

                    </span>

                    ${
                        approvedQty < requestedQty
                            ? `
                                <div class="small text-muted mt-1">
                                    of ${requestedQty}
                                </div>
                            `
                            : ""
                    }

                </td>

                <td>

                    ${req.location_type || "N/A"}

                    <br>

                    <small class="text-muted">
                        ${req.location_name || "N/A"}
                    </small>

                </td>

                <td>
                    ${statusBadge}
                </td>

                <td>
                    <small class="text-muted">
                        ${approvalDate}
                    </small>
                </td>

            `;

            tableBody.appendChild(tr);
        });

    } catch (error) {

        console.error(
            "Error loading approved history:",
            error.message
        );

        tableBody.innerHTML = `
            <tr>
                <td colspan="8"
                    class="text-center text-danger py-4">

                    Failed to load approved history.

                </td>
            </tr>
        `;
    }
}
