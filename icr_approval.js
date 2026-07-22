// icr_approval.js
// Protect page
const currentUser = getCurrentUser();

if (!currentUser)
    window.location.replace("index.html");

let currentRejectId = null;
let rejectModalInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Security Check: Only ADMIN, FM, and AFM can approve corrections[cite: 2]
    const hasAccess = checkUserAccess(['ADMIN', 'FM', 'AFM']);
    if (!hasAccess) return;

    // Display current user name
    const user = getCurrentUser();
    document.getElementById('currentUserName').innerText = `${user.name} (${user.role})`;

    // Initialize Bootstrap Modal
    rejectModalInstance = new bootstrap.Modal(document.getElementById('rejectIcrModal'));

    // Load initial data
    loadPendingIcrs();

    // Event Listeners
    document.getElementById('btnRefreshIcr').addEventListener('click', loadPendingIcrs);
    document.getElementById('confirmRejectIcrBtn').addEventListener('click', processIcrRejection);
});

// --- DATA LOADING LOGIC ---

async function loadPendingIcrs() {
    const tableBody = document.getElementById('pendingIcrTable');
    tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Loading pending correction requests...</td></tr>';

    try {
        const { data, error } = await supabase
            .from('inventory_correction_requests')
            .select(`
                *,
                materials (name)
            `)
            .eq('status', 'PENDING')
            .order('created_at', { ascending: true });

        if (error) throw error;

        if (data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-success py-4"><i class="fa-solid fa-check-circle me-2"></i>No pending correction requests.</td></tr>';
            return;
        }

        tableBody.innerHTML = ''; 
        
        data.forEach(req => {
            const materialName = req.materials ? req.materials.name : 'Unknown Material';
            
            // Format the difference visually
            let diffHtml = req.difference;
            if (req.difference > 0) {
                diffHtml = `<span class="text-success fw-bold">+${req.difference}</span>`;
            } else if (req.difference < 0) {
                diffHtml = `<span class="text-danger fw-bold">${req.difference}</span>`;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <span class="fw-bold text-warning">${req.ticket_no}</span><br>
                    <small class="text-muted">${formatDate(req.created_at)}</small>
                </td>
                <td class="fw-semibold">${materialName}</td>
                <td>${req.system_qty}</td>
                <td class="fw-bold">${req.physical_qty}</td>
                <td><h5>${diffHtml}</h5></td>
                <td><small class="text-muted">${req.remarks || 'N/A'}</small></td>
                <td>
                    <button class="btn btn-success btn-sm me-1 mb-1 shadow-sm fw-bold" onclick="approveIcr(${req.id}, '${req.ticket_no}', ${req.material_id}, ${req.system_qty}, ${req.physical_qty}, ${req.difference})" title="Approve">
                        <i class="fa-solid fa-check"></i> Approve
                    </button>
                    <button class="btn btn-outline-danger btn-sm mb-1 fw-bold" onclick="openRejectModal(${req.id}, '${req.ticket_no}')" title="Reject">
                        <i class="fa-solid fa-xmark"></i> Reject
                    </button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

    } catch (error) {
        console.error("Error loading pending ICRs:", error.message);
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Failed to load pending requests.</td></tr>';
    }
}

// --- APPROVAL WORKFLOW ---

async function approveIcr(requestId, ticketNo, materialId, systemQty, physicalQty, difference) {
    if (!confirm(`Are you sure you want to APPROVE correction ${ticketNo}?\nThis will permanently adjust the stock by ${difference}.`)) return;

    const user = getCurrentUser();

    try {
        // Step 1: Insert record into stock_adjustments[cite: 1, 3]
        const { data: adjData, error: adjError } = await supabase
            .from('stock_adjustments')
            .insert([{
                icr_id: requestId,
                material_id: materialId,
                system_qty: systemQty,
                physical_qty: physicalQty,
                difference: difference,
                approved_by: user.name
            }])
            .select();

        if (adjError) throw adjError;
        const adjustmentId = adjData[0].id;

        // Step 2: Push the difference to the stock_ledger[cite: 1, 3]
        const { error: ledgerError } = await supabase
            .from('stock_ledger')
            .insert([{
                material_id: materialId,
                transaction_type: 'ADJUSTMENT',
                quantity: difference, // Can be positive or negative
                reference_id: adjustmentId.toString(),
                remarks: `Approved ICR: ${ticketNo}`,
                recorded_by: user.name
            }]);

        if (ledgerError) throw ledgerError;

        // Step 3: Update the original ICR status to APPROVED[cite: 1, 3]
        const { error: updateError } = await supabase
            .from('inventory_correction_requests')
            .update({ 
                status: 'APPROVED',
                approved_by: user.name,
                updated_at: new Date().toISOString()
            })
            .eq('id', requestId);

        if (updateError) throw updateError;

        showAlert(`Correction ${ticketNo} successfully approved and stock adjusted!`, 'success');
        
        // Refresh the table
        loadPendingIcrs();

    } catch (error) {
        console.error("Error approving ICR:", error.message);
        showAlert("Failed to approve correction request. Check console.", "error");
    }
}

// --- REJECTION WORKFLOW ---

function openRejectModal(requestId, ticketNo) {
    currentRejectId = requestId;
    document.getElementById('rejectIcrTicketDisplay').innerText = ticketNo;
    document.getElementById('rejectIcrReason').value = ''; 
    rejectModalInstance.show();
}

async function processIcrRejection() {
    if (!currentRejectId) return;

    const reason = document.getElementById('rejectIcrReason').value.trim();
    if (!reason) {
        showAlert("Please provide a reason for rejecting this correction request.", "warning");
        return;
    }

    const btnConfirm = document.getElementById('confirmRejectIcrBtn');
    btnConfirm.disabled = true;
    btnConfirm.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    
    const user = getCurrentUser();

    try {
        // Update status to REJECTED in database[cite: 1, 3]
        const { error } = await supabase
            .from('inventory_correction_requests')
            .update({ 
                status: 'REJECTED',
                remarks: `Rejected: ${reason}`,
                approved_by: user.name,
                updated_at: new Date().toISOString()
            })
            .eq('id', currentRejectId);

        if (error) throw error;

        rejectModalInstance.hide();
        showAlert(`Correction request rejected successfully.`, 'info');
        
        loadPendingIcrs();

    } catch (error) {
        console.error("Error rejecting ICR:", error.message);
        showAlert("Failed to reject correction request.", "error");
    } finally {
        currentRejectId = null;
        btnConfirm.disabled = false;
        btnConfirm.innerHTML = 'Confirm Reject';
    }
}
