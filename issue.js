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
    
// User information is handled by navigation.js
    
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
    department_id,
    departments (
        department_name
    )
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

const deptName =
    material.departments?.department_name ||
    "-";
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
    <td>
        ${formatDate(req.created_at)}
    </td>

    <td class="fw-bold">
        ${req.ticket_no}
    </td>

    <td>
        <small>
            ${req.location_name || 'N/A'}
        </small>
    </td>

    <td>
        ${deptName}
    </td>

    <td>
        ${material.material_code || ''}
        <br>
        <strong>
            ${material.material_name || 'N/A'}
        </strong>
    </td>

    <!-- REQUESTED -->
    <td>
        ${req.requested_qty}
    </td>

    <!-- ALREADY ISSUED -->
    <td>
        ${issuedQty}
    </td>

    <!-- CURRENT STOCK -->
    <td
        class="table-info fw-bold ${
            currentStock <= 0
                ? 'text-danger'
                : 'text-dark'
        }">

        ${currentStock}

    </td>

    <!-- UNIT COST -->
    <td>
        ${formatCurrency(unitCost)}
    </td>

    <!-- AMOUNT -->
    <td
        class="fw-bold text-success"
        id="amount-${req.id}">

        ₹ 0.00

    </td>

    <!-- MANUAL ISSUE QUANTITY -->
    <td class="bg-primary-subtle">

        <input
            type="number"
            class="form-control form-control-sm issue-input mx-auto"
            id="issueInput-${req.id}"

            min="1"

            max="${Math.min(
                Number(req.requested_qty) - issuedQty,
                currentStock
            )}"

            placeholder="Qty"

            oninput="calculateAmount(
                ${req.id},
                ${unitCost},
                ${Math.min(
                    Number(req.requested_qty) - issuedQty,
                    currentStock
                )}
            )"

        >

    </td>

    <!-- ACTION -->
    <td>

        <button
            class="btn btn-primary btn-sm fw-bold shadow-sm"

            onclick="processIssue(
                ${req.id},
                ${req.material_id}
            )"

            id="btnIssue-${req.id}">

            Issue

        </button>

    </td>
`;

tableBody.appendChild(tr);
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

    // ====================================================
    // FINAL STOCK VALIDATION
    // ====================================================

    const { data: stockRecord, error: stockError } =
        await supabaseClient
            .from("current_stock")
            .select("current_stock")
            .eq("material_id", materialId)
            .single();

    if (stockError) {
        throw stockError;
    }

    const currentStock =
        Number(stockRecord?.current_stock || 0);

    if (issueQty > currentStock) {

        showAlert(
            "Insufficient stock.\n\n" +
            "Available stock: " +
            currentStock +
            "\nRequested quantity: " +
            issueQty +
            "\n\nMaterial cannot be issued.",
            "danger"
        );

        return;
    }
// Step 1: Insert into material_issue_register
// Step 1: Fetch request details
const { data: requestInfo, error: requestError } = await supabaseClient
    .from("material_requests")
    .select(`
        ticket_no,
        location_name,
        location_type,
        technician_id,
        materials!material_requests_material_id_fkey (
            unit_cost
        )
    `)
    .eq("id", requestId)
    .single();

if (requestError) throw requestError;

const unitCost =
    Number(requestInfo.materials?.unit_cost || 0);

const totalCost =
    unitCost * issueQty;

// Step 2: Insert into material_issue_register
const { data: issueData, error: issueError } = await supabase
    .from("material_issue_register")
    .insert([{
        request_id: requestId,
        material_id: materialId,
        ticket_no: requestInfo.ticket_no,
        location_name: requestInfo.location_name,
        location_type: requestInfo.location_type,
        technician_name: requestInfo.technician_id,
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
        showAlert(error.message, "danger");
    }
};
