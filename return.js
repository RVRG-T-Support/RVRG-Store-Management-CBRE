// return.js
// Protect page
const currentUser = getCurrentUser();

if (!currentUser)
    window.location.replace("index.html");

document.addEventListener('DOMContentLoaded', () => {
    // 1. Security Check: STORE, ADMIN, FM, AFM can access
    const hasAccess = checkUserAccess(['ADMIN', 'FM', 'AFM', 'STORE']);
    if (!hasAccess) return;

    // Display current user name
    const user = getCurrentUser();
    document.getElementById('currentUserName').innerText = `${user.name} (${user.role})`;

    // Event Listeners
    document.getElementById('btnSearchTicket').addEventListener('click', searchTicket);
    document.getElementById('btnLoadRecent').addEventListener('click', loadRecentIssues);
});

// --- DATA LOADING LOGIC ---

async function loadRecentIssues() {
    fetchIssues(null); // Pass null to load latest without ticket filter
}

async function searchTicket() {
    const ticketNo = document.getElementById('searchTicketNo').value.trim();
    if (!ticketNo) {
        showAlert("Please enter a ticket number to search.", "warning");
        return;
    }
    fetchIssues(ticketNo);
}

async function fetchIssues(ticketFilter) {
    const tableBody = document.getElementById('returnTableBody');
    tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Loading issued materials...</td></tr>';

    try {
        // Start building the query on material_issue_register
        let query = supabase
            .from('material_issue_register')
        .select(`
    id,
    ticket_no,
    material_id,
    technician_name,
    issued_qty,
    issued_date,
    materials!material_issue_register_material_id_fkey(
        material_name
    )
`)
.order('issued_date', { ascending: false });    

        // Apply ticket filter if provided
        if (ticketFilter) {
            query = query.eq('material_requests.ticket_no', ticketFilter);
        } else {
            query = query.limit(20); // Just load last 20 issues if no filter
        }

        const { data: issues, error: issueError } = await query;

        if (issueError) throw issueError;

        if (issues.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-warning py-4"><i class="fa-solid fa-triangle-exclamation me-2"></i>No issued materials found ${ticketFilter ? 'for this ticket' : ''}.</td></tr>`;
            return;
        }

        tableBody.innerHTML = ''; // Clear table
        
        issues.forEach(issue => {
            const ticketNo = issue.ticket_no;
const materialName = issue.materials?.material_name || "-";
const techName = issue.technician_name || "-";

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="fw-bold">${ticketNo}<br><small class="text-muted fw-normal">${formatDate(issue.issued_date)}</small></td>
                <td>${materialName}</td>
                <td>${techName}</td>
                <td class="table-info fw-bold" id="issued-${issue.id}">${issue.issued_qty}</td>
                <td class="bg-warning-subtle">
                    <input type="number" class="form-control form-control-sm return-input mx-auto" 
                           id="returnInput-${issue.id}" min="1" max="${issue.issued_qty}" 
                           oninput="validateReturn(${issue.id}, ${issue.issued_qty})">
                </td>
                <td>
                    <input type="text" class="form-control form-control-sm" id="returnRemarks-${issue.id}" placeholder="Reason...">
                </td>
                <td>
                    <button class="btn btn-warning btn-sm fw-bold shadow-sm" onclick="processReturn(${issue.id}, ${issue.material_id})" id="btnReturn-${issue.id}">
                        Return
                    </button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

    } catch (error) {
        console.error("Error fetching issues:", error.message);
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Failed to load issued records.</td></tr>';
    }
}

// --- DYNAMIC UI VALIDATION ---

window.validateReturn = function(issueId, maxIssued) {
    const inputEl = document.getElementById(`returnInput-${issueId}`);
    const btnEl = document.getElementById(`btnReturn-${issueId}`);
    
    let returnQty = parseInt(inputEl.value) || 0;

    // Validation: Cannot return more than issued
    if (returnQty > maxIssued || returnQty <= 0) {
        inputEl.classList.add('is-invalid');
        btnEl.disabled = true;
    } else {
        inputEl.classList.remove('is-invalid');
        btnEl.disabled = false;
    }
};

// --- RETURN PROCESS WORKFLOW ---

window.processReturn = async function(issueId, materialId) {
    const inputEl = document.getElementById(`returnInput-${issueId}`);
    const remarksEl = document.getElementById(`returnRemarks-${issueId}`);
    const returnQty = parseInt(inputEl.value);
    const remarks = remarksEl.value.trim();
    const maxIssued = parseInt(document.getElementById(`issued-${issueId}`).innerText);
    const user = getCurrentUser();

    if (!returnQty || returnQty <= 0) {
        showAlert("Please enter a valid return quantity.", "error");
        return;
    }
    if (returnQty > maxIssued) {
        showAlert("Cannot return more than what was issued.", "error");
        return;
    }

    if (!confirm(`Are you sure you want to process the return of ${returnQty} items to stock?`)) return;

    try {
        // Step 1: Insert into material_returns
        const { data: returnData, error: returnError } = await supabase
            .from('material_returns')
            .insert([{
                issue_id: issueId,
                material_id: materialId,
                returned_qty: returnQty,
                remarks: remarks || 'Unused material returned',
                return_condition: "GOOD",

received_by: user.id,

return_date: new Date().toISOString(),

remarks: remarks || "Unused material returned"
            }])
            .select();

        if (returnError) throw returnError;
        const newReturnId = returnData[0].id;

        // Step 2: Update stock_ledger (RETURN type) -> adds back to inventory
        const { error: ledgerError } = await supabase
            .from('stock_ledger')
    .insert([{
    material_id: materialId,
    transaction_type: "RETURN",
    quantity: Math.abs(returnQty),
    reference_no: `RET-${newReturnId}`,
    request_id: null,
    remarks: `Returned from Issue ${issueId}. ${remarks}`,
    created_by: user.id,
    transaction_date: new Date().toISOString()
    }]);

        if (ledgerError) throw ledgerError;

        // Success!
        showAlert(`Successfully returned ${returnQty} items to inventory!`, 'success');
        
        // Refresh the current view
        const ticketSearchValue = document.getElementById('searchTicketNo').value.trim();
        if (ticketSearchValue) {
            fetchIssues(ticketSearchValue);
        } else {
            loadRecentIssues();
        }

    } catch (error) {
        console.error("Return Transaction Error:", error.message);
        showAlert("Failed to complete return process. Check console.", "error");
    }
};
