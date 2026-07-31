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

    // Event Listeners
    document.getElementById('btnRefreshApprovals').addEventListener('click', loadPendingApprovals);
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
                    material_name,
                    department_id
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
            const materialName =
        req.materials?.material_name || '-';

        const deptName = "-";

    
        const techName =
            req.technician_name || '-';
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <span class="fw-bold text-primary">${req.ticket_no}</span><br>
                    <small class="text-muted">${formatDate(req.created_at)}</small>
                </td>
                <td>
                    <strong>${deptName}</strong><br>
                    <small class="text-muted"><i class="fa-solid fa-user-wrench me-1"></i>${techName}</small>
                </td>
                <td><span class="fw-semibold">${materialName}</span></td>
                <td><h5><span class="badge bg-secondary">${req.requested_qty}</span></h5></td>
                <td>
                    ${req.location_type}<br>
                    <small class="text-muted">${req.location_name || 'N/A'}</small>
                </td>
                <td class="text-center">
                    <button class="btn btn-success btn-sm me-1 mb-1" onclick="approveRequest(${req.id}, '${req.ticket_no}')" title="Approve">
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
    if (!confirm(`Are you sure you want to APPROVE ticket ${ticketNo}?`)) return;

    try {
        const user = getCurrentUser();

        // Update status to APPROVED in database
        const { error } = await supabase
            .from('material_requests')
            .update({ 
                request_status: 'APPROVED',
                approved_by: user.id, // Assuming you have this column or track it
                approval_date: new Date().toISOString()
            })
            .eq('id', requestId);

        if (error) throw error;

        showAlert(`Ticket ${ticketNo} successfully approved!`, 'success');
        
        // Refresh the table to remove the approved item
        loadPendingApprovals();

    } catch (error) {
        console.error("Error approving request:", error.message);
        showAlert("Failed to approve request.", "danger");
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
