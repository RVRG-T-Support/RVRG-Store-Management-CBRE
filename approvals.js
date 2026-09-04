// approvals.js
// Protect page
const currentUser = getCurrentUser();

if (!currentUser)
    window.location.replace("index.html");

// Global variable to hold the ID of the request being rejected
let currentRejectId = null; 
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
    Number(
        material.unit_cost || 0
    );

const deptName =
    material.departments?.department_name ||
    "-";

const techName =
    req.technician_name || "-";
            
            const tr = document.createElement('tr');
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

    <small class="text-muted">
        ${formatDate(req.created_at)}
    </small>

</td>
                <td>
                    <strong>${deptName}</strong><br>
                    <small class="text-muted"><i class="fa-solid fa-user-wrench me-1"></i>${techName}</small>
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
    <div class="fw-bold mb-1">
        Requested:
        <span class="badge bg-secondary">
            ${req.requested_qty}
        </span>
    </div>

    <div class="mt-2">
        <label
            for="approvedQty_${req.id}"
            class="form-label small mb-1"
        >
            Approve Qty
        </label>

        <input
            type="number"
            class="form-control form-control-sm text-center"
            id="approvedQty_${req.id}"
            value="${req.requested_qty}"
            min="1"
            max="${req.requested_qty}"
            step="1"
        >
    </div>
</td>
                <td>
                    ${req.location_type}<br>
                    <small class="text-muted">${req.location_name || 'N/A'}</small>
                </td>
                <td class="text-center">
                    <button
    class="btn btn-success btn-sm me-1 mb-1"
    onclick="approveRequest(${req.id}, '${req.ticket_no}')"
    title="Approve"
>
    <i class="fa-solid fa-check"></i> Approve
</button>
                    <button class="btn btn-outline-danger btn-sm mb-1" onclick="openRejectModal(${req.id}, '${req.ticket_no}')" title="Reject">
                        <i class="fa-solid fa-xmark"></i> Reject
                    </button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

    } catch (error) {
        console.error("Error loading approvals:", error.message);
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Failed to load pending requests.</td></tr>';
    }
}

// --- APPROVAL LOGIC ---

async function approveRequest(requestId, ticketNo) {

    const approvedQtyInput =
        document.getElementById(`approvedQty_${requestId}`);

    if (!approvedQtyInput) {
        showAlert("Approved quantity field was not found.", "danger");
        return;
    }

    const approvedQty =
        Number(approvedQtyInput.value);

    if (!Number.isFinite(approvedQty) || approvedQty <= 0) {
        showAlert("Please enter a valid approved quantity.", "warning");
        approvedQtyInput.focus();
        return;
    }

    // Get the originally requested quantity
    const requestedQty =
        Number(
            approvedQtyInput.getAttribute("max")
        );

    if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
        showAlert("Original requested quantity is invalid.", "danger");
        return;
    }

    if (approvedQty > requestedQty) {
        showAlert(
            `Approved quantity cannot be greater than requested quantity (${requestedQty}).`,
            "warning"
        );

        approvedQtyInput.focus();
        return;
    }

    const approvalType =
        approvedQty < requestedQty
            ? "PARTIALLY_APPROVED"
            : "APPROVED";

    const confirmationMessage =
        approvalType === "PARTIALLY_APPROVED"
            ? `Ticket ${ticketNo}\n\nRequested Quantity: ${requestedQty}\nApproved Quantity: ${approvedQty}\n\nThis request will be marked as PARTIALLY APPROVED.\n\nContinue?`
            : `Ticket ${ticketNo}\n\nRequested Quantity: ${requestedQty}\nApproved Quantity: ${approvedQty}\n\nThis request will be fully APPROVED.\n\nContinue?`;

    if (!confirm(confirmationMessage)) {
        return;
    }

    try {

        const user = getCurrentUser();

        const { error } = await supabase
            .from('material_requests')
            .update({
                request_status: approvalType,
                approved_qty: approvedQty,
                approved_by: user.id,
                approval_date: new Date().toISOString()
            })
            .eq('id', requestId);

        if (error) throw error;

        if (approvalType === "PARTIALLY_APPROVED") {

            showAlert(
                `Ticket ${ticketNo} partially approved: ${approvedQty} of ${requestedQty}.`,
                "warning"
            );

        } else {

            showAlert(
                `Ticket ${ticketNo} successfully approved!`,
                "success"
            );
        }

        // Refresh both sections
        loadPendingApprovals();
        loadApprovedHistory();

    } catch (error) {

        console.error(
            "Error approving request:",
            error.message
        );

        showAlert(
            "Failed to approve request.",
            "danger"
        );
    }
}
// --- REJECTION LOGIC ---

function openRejectModal(requestId, ticketNo) {
    // Store the ID globally so the confirm button knows which ticket to reject
    currentRejectId = requestId;
    document.getElementById('rejectTicketNoDisplay').innerText = ticketNo;
    document.getElementById('rejectReason').value = ''; // Clear previous reasons
    
    rejectModalInstance.show();
}

async function processRejection() {
    if (!currentRejectId) return;

    const reason = document.getElementById('rejectReason').value.trim();
    const user = getCurrentUser();

    try {
        // Update status to REJECTED in database
        const { error } = await supabase
            .from('material_requests')
            .update({ 
                request_status: 'REJECTED',
                remarks: reason ? `Rejected: ${reason}` : 'Rejected without remarks',
                approved_by: user.id,
                approval_date: new Date().toISOString()
            })
            .eq('id', currentRejectId);

        if (error) throw error;

        // Hide modal and show success
        rejectModalInstance.hide();
        showAlert(`Ticket successfully rejected.`, 'info');
        
        // Refresh the table
        loadPendingApprovals();

    } catch (error) {
        console.error("Error rejecting request:", error.message);
        showAlert("Failed to reject request.", "danger");
    } finally {
        currentRejectId = null; // Reset
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
                    ? formatDate(req.approval_date)
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
