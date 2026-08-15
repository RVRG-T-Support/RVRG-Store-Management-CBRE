// issue.js
// Protect page
const currentUser = getCurrentUser();

if (!currentUser)
    window.location.replace("index.html");

document.addEventListener('DOMContentLoaded', () => {
    // 1. Security Check: STORE, ADMIN, FM, AFM can access this module
    const hasAccess = checkUserAccess(['ADMIN', 'FM', 'AFM', 'STORE']);
    if (!hasAccess) {
    console.error("ISSUE PAGE ACCESS DENIED");
    console.log("Current User:", getCurrentUser());
    return;
}

    // Display current user name
    const user = getCurrentUser();
    document.getElementById('currentUserName').innerText = `${user.name} (${user.role})`;

    // Load initial data
    loadApprovedRequests();

    // Event Listeners
    document.getElementById('btnRefreshIssueList').addEventListener('click', loadApprovedRequests);
});

//====================================================
// ISSUE MATERIAL - SUPABASE CLIENT
//====================================================

const supabaseClient =
    window.supabaseClient ||
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
);

// --- DATA LOADING LOGIC ---

async function loadApprovedRequests() {
    const tableBody = document.getElementById('approvedRequestsTable');
    tableBody.innerHTML = '<tr><td colspan="13" class="text-center text-muted py-4">Loading approved requests...</td></tr>';

    try {
        // Fetch APPROVED requests
        const { data: requests, error: reqError } = await supabaseClient
            .from('material_requests')
            .select(`
                *,
                materials!material_requests_material_id_fkey (
                    material_name,
                    material_code,
                    unit_cost,
                    department_id
                )
        `)
        .eq('request_status', 'APPROVED')
            .order('created_at', { ascending: true });

        if (reqError) throw reqError;

        if (requests.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="13" class="text-center text-success py-4"><i class="fa-solid fa-check-circle me-2"></i>No materials pending issue!</td></tr>';
            return;
        }

        // Fetch current stock from the current_stock view
        const { data: stockData, error: stockError } = await supabaseClient
            .from("current_stock")
            .select(`
                material_id,
                current_stock
        `);

        if (stockError) throw stockError;

        tableBody.innerHTML = ''; // Clear table
        
        requests.forEach(req => {
            const material = req.materials || {};

            const deptName = "-";

            const unitCost = Number(material.unit_cost || 0);

            const issuedQty = Number(req.issued_qty || 0);

            const balance = Number(req.requested_qty) - issuedQty;

            // Find current stock for this material
            const stockRecord = stockData.find(
                s => s.material_id === req.material_id
            );

            const currentStock = Number(
                stockRecord?.current_stock || 0
            );

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${formatDate(req.created_at)}</td>
                <td class="fw-bold">${req.ticket_no}</td>
                <td><small>${req.location_name || 'N/A'}</small></td>
                <td>${deptName}</td>
                <td>${material.material_code || ''}<br><strong>${material.material_name || 'N/A'}</strong></td>
                <td>${req.requested_qty}</td>
                <td>${issuedQty}</td>
                <td class="table-warning fw-bold text-danger" id="balance-${req.id}">${balance}</td>
                <td>${formatCurrency(unitCost)}</td>
                <td class="fw-bold text-success">
    ${formatCurrency(balance * unitCost)}
</td>
                <td class="fw-bold text-primary">
    ${balance}
</td>

<td>
    <button class="btn btn-success btn-sm fw-bold shadow-sm"
            onclick="processIssue(${req.id}, ${req.material_id}, ${balance})">
        Issue All
    </button>
</td>
                <td class="table-info fw-bold ${currentStock < balance ? 'text-danger' : 'text-dark'}">${currentStock}</td>
            `;
            tableBody.appendChild(tr);
        });

    } catch (error) {
        console.error("Error loading issue desk:", error.message);
        tableBody.innerHTML = '<tr><td colspan="13" class="text-center text-danger">Failed to load requests.</td></tr>';
    }
}

// --- ISSUE PROCESS WORKFLOW ---

window.processIssue = async function(requestId, materialId, balance) {
    const issueQty = balance;
    const user = getCurrentUser();

    const newStatus = 'ISSUED';
    const confirmMsg = `Issue all ${issueQty} item(s) and close this request?`;
    
    if (!confirm(confirmMsg)) return;

    try {
        // Step 1: Insert into material_issue_register
        // Step 1: Fetch request details
const { data: requestInfo, error: requestError } = await supabase
    .from("material_requests")
    .select(`
        ticket_no,
        location_name,
        location_type,
        technician_name,
        materials!material_requests_material_id_fkey (
            unit_cost
        )
    `)
    .eq("id", requestId)
    .single();

if (requestError) throw requestError;

const unitCost = Number(requestInfo.materials?.unit_cost || 0);
const totalCost = unitCost * issueQty;

// Step 2: Insert into material_issue_register
const { data: issueData, error: issueError } = await supabase
    .from("material_issue_register")
    .insert([{
        request_id: requestId,
        material_id: materialId,
        ticket_no: requestInfo.ticket_no,
        location_name: requestInfo.location_name,
        location_type: requestInfo.location_type,
        technician_name: requestInfo.technician_name,
        issued_qty: issueQty,
        unit_cost: unitCost,
        total_cost: totalCost,
        remarks: "Material Issued",
        issued_by: user.name
    }])
    .select();
        if (issueError) throw issueError;
        const newIssueId = issueData[0].id;

        // Step 2: Update stock_ledger (ISSUE type)
        const { error: ledgerError } = await supabase
            .from('stock_ledger')
            .insert([{
    material_id: materialId,

    transaction_type: 'ISSUE',

    quantity: Math.abs(issueQty),

    reference_no: newIssueId.toString(),

    request_id: requestId,

    remarks: `Issued against ticket ${requestId}`,

    created_by: user.id,

    transaction_date: new Date().toISOString()
}]);

        if (ledgerError) throw ledgerError;

        // Step 3: Fetch current issued_qty from requests, then update material_requests table
        const { data: reqData, error: reqFetchError } = await supabase
            .from('material_requests')
            .select('issued_qty')
            .eq('id', requestId)
            .single();
            
        if (reqFetchError) throw reqFetchError;
        
        const previousIssued = reqData.issued_qty || 0;
        const newTotalIssued = previousIssued + issueQty;

        const { error: updateError } = await supabase
            .from('material_requests')
            .update({ 
                issued_qty: newTotalIssued,
                request_status: newStatus,
                issue_date: new Date().toISOString()
            })
            .eq('id', requestId);

        if (updateError) throw updateError;

        // Success!
        showAlert(`Successfully issued ${issueQty} items!`, 'success');
        
        // Refresh the table to update balances and stock views
        loadApprovedRequests();

    } catch (error) {
        console.error("Transaction Error:", error.message);
        showAlert(error.message, "danger");
    }
};
