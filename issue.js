// issue.js
// Protect page
const currentUser = getCurrentUser();

if (!currentUser)
    window.location.replace("index.html");

document.addEventListener('DOMContentLoaded', () => {
    // 1. Security Check: STORE, ADMIN, FM, AFM can access this module
    const hasAccess = checkUserAccess(['ADMIN', 'FM', 'AFM', 'STORE']);
    if (!hasAccess) return;

    // Display current user name
    const user = getCurrentUser();
    document.getElementById('currentUserName').innerText = `${user.name} (${user.role})`;

    // Load initial data
    loadApprovedRequests();

    // Event Listeners
    document.getElementById('btnRefreshIssueList').addEventListener('click', loadApprovedRequests);
});

// --- DATA LOADING LOGIC ---

async function loadApprovedRequests() {
    const tableBody = document.getElementById('approvedRequestsTable');
    tableBody.innerHTML = '<tr><td colspan="13" class="text-center text-muted py-4">Loading approved requests...</td></tr>';

    try {
        // Fetch APPROVED and PARTIALLY_ISSUED requests
        const { data: requests, error: reqError } = await supabase
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
        .in('request_status', ['APPROVED', 'PARTIALLY_ISSUED'])
            .order('created_at', { ascending: true });

        if (reqError) throw reqError;

        if (requests.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="13" class="text-center text-success py-4"><i class="fa-solid fa-check-circle me-2"></i>No materials pending issue!</td></tr>';
            return;
        }

        // Fetch current stock from the current_stock view
        const { data: stockData, error: stockError } = await supabase
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
                <td class="fw-bold text-success" id="amount-${req.id}">₹ 0.00</td>
                <td class="bg-primary-subtle">
                    <input type="number" class="form-control form-control-sm issue-input mx-auto" 
                           id="issueInput-${req.id}" min="1" max="${balance}" 
                           oninput="calculateAmount(${req.id}, ${unitCost}, ${balance}, ${currentStock})">
                </td>
                <td>
                    <button class="btn btn-primary btn-sm fw-bold shadow-sm"onclick="processIssue(${req.id}, ${req.material_id})" id="btnIssue-${req.id}">
                        Issue
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

// --- DYNAMIC UI CALCULATIONS ---

window.calculateAmount = function(requestId, unitCost, maxBalance, currentStock) {
    const inputEl = document.getElementById(`issueInput-${requestId}`);
    const amountEl = document.getElementById(`amount-${requestId}`);
    const btnEl = document.getElementById(`btnIssue-${requestId}`);
    
    let issueQty = parseInt(inputEl.value) || 0;

    // Validation styling
    if (issueQty > maxBalance || issueQty > currentStock) {
        inputEl.classList.add('is-invalid');
        btnEl.disabled = true;
    } else {
        inputEl.classList.remove('is-invalid');
        btnEl.disabled = false;
    }

    // Calculate and display amount
    const totalAmount = issueQty * unitCost;
    amountEl.innerText = formatCurrency(totalAmount);
};

// --- ISSUE PROCESS WORKFLOW ---

window.processIssue = async function(requestId, materialId) {
    const inputEl = document.getElementById(`issueInput-${requestId}`);
    const issueQty = parseInt(inputEl.value);
    const balance = parseInt(document.getElementById(`balance-${requestId}`).innerText);
    const user = getCurrentUser();

    if (!issueQty || issueQty <= 0) {
        showAlert("Please enter a valid issue quantity.", "danger");
        return;
    }
    if (issueQty > balance) {
        showAlert("Cannot issue more than the requested balance.", "danger");
        return;
    }

    const newStatus = (issueQty === balance) ? 'ISSUED' : 'PARTIALLY_ISSUED';
    const confirmMsg = `Are you sure you want to issue ${issueQty} items?\nThis will mark the ticket as ${newStatus}.`;
    
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

    quantity: -Math.abs(issueQty),

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
                request_status: newStatus
            })
            .eq('id', requestId);

        if (updateError) throw updateError;

        // Success!
        showAlert(`Successfully issued ${issueQty} items!`, 'success');
        
        // Refresh the table to update balances and stock views
        loadApprovedRequests();

    } catch (error) {
        console.error("Transaction Error:", error.message);
        showAlert("Failed to complete issue process. Check console.", "danger");
    }
};
