// return.js
// Protect page
const currentUser = getCurrentUser();

if (!currentUser)
    window.location.replace("index.html");

document.addEventListener('DOMContentLoaded', () => {
    // 1. Security Check: STORE, ADMIN, FM, AFM can access
    const hasAccess = checkUserAccess(['ADMIN', 'FM', 'AFM', 'STORE']);
    if (!hasAccess) return;

// User information is handled by navigation.js

    // Event Listeners
    document.getElementById('btnSearchTicket').addEventListener('click', searchTicket);
    document.getElementById('btnLoadRecent').addEventListener('click', loadRecentIssues);

    // Load return history
    loadReturnHistory();
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
            query = query.eq('ticket_no', ticketFilter);
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
const ticketSearchValue =
    document.getElementById('searchTicketNo').value.trim();

if (ticketSearchValue) {

    fetchIssues(ticketSearchValue);

} else {

    loadRecentIssues();

}

// Refresh return history
loadReturnHistory();

    } catch (error) {
        console.error("Return Transaction Error:", error.message);
        showAlert("Failed to complete return process. Check console.", "error");
    }
};

// ====================================================
// RETURN HISTORY
// ====================================================

async function loadReturnHistory() {

    const tableBody =
        document.getElementById("returnHistoryTable");

    if (!tableBody)
        return;

    tableBody.innerHTML = `
        <tr>
            <td colspan="8"
                class="text-center text-muted py-4">

                Loading return history...

            </td>
        </tr>
    `;

    try {

        const {
            data: returns,
            error
        } = await supabase

            .from("material_returns")

            .select(`
                id,
                returned_qty,
                return_condition,
                return_date,
                remarks,
                issue_id,

                material_issue_register!material_returns_issue_id_fkey (
                    ticket_no,
                    issued_qty,
                    technician_name,

                    materials!material_issue_register_material_id_fkey (
                        material_name
                    ),

                    material_requests!material_issue_register_request_id_fkey (
                        anacity_complaint_no,
                        ticket_no
                    )
                )
            `)

            .order(
                "return_date",
                {
                    ascending: false
                }
            )

            .limit(50);


        if (error)
            throw error;


        if (
            !returns ||
            returns.length === 0
        ) {

            tableBody.innerHTML = `
                <tr>
                    <td colspan="8"
                        class="text-center text-muted py-4">

                        No return history yet.

                    </td>
                </tr>
            `;

            return;

        }


        tableBody.innerHTML = "";


        returns.forEach(returnRecord => {

            const issue =
                returnRecord.material_issue_register || {};

            const request =
                issue.material_requests || {};

            const material =
                issue.materials || {};


            const complaintNumber =
                request.anacity_complaint_no || "N/A";


            const requestNumber =
                request.ticket_no ||
                issue.ticket_no ||
                "N/A";


            const materialName =
                material.material_name || "-";


            const technician =
                issue.technician_name || "-";


            const issuedQty =
                Number(
                    issue.issued_qty || 0
                );


            const returnedQty =
                Number(
                    returnRecord.returned_qty || 0
                );


            const condition =
                returnRecord.return_condition || "-";


            const remarks =
                returnRecord.remarks || "-";


            const returnDate =
                returnRecord.return_date
                    ? formatDate(
                        returnRecord.return_date
                    )
                    : "N/A";


            const tr =
                document.createElement("tr");


            tr.innerHTML = `

                <!-- COMPLAINT / REQUEST -->

                <td>

                    <div class="fw-bold text-success">

                        Complaint Number:
                        ${complaintNumber}

                    </div>

                    <div class="fw-bold text-primary">

                        MR:
                        ${requestNumber}

                    </div>

                </td>


                <!-- MATERIAL -->

                <td>

                    ${materialName}

                </td>


                <!-- TECHNICIAN -->

                <td>

                    ${technician}

                </td>


                <!-- ISSUED -->

                <td>

                    <span class="badge bg-secondary">

                        ${issuedQty}

                    </span>

                </td>


                <!-- RETURNED -->

                <td>

                    <span class="badge bg-success">

                        ${returnedQty}

                    </span>

                </td>


                <!-- CONDITION -->

                <td>

                    <span class="badge bg-success">

                        ${condition}

                    </span>

                </td>


                <!-- REMARKS -->

                <td>

                    ${remarks}

                </td>


                <!-- RETURN DATE -->

                <td>

                    <small class="text-muted">

                        ${returnDate}

                    </small>

                </td>

            `;


            tableBody.appendChild(tr);

        });


    }
    catch(error) {

        console.error(
            "Error loading return history:",
            error.message
        );


        tableBody.innerHTML = `
            <tr>
                <td colspan="8"
                    class="text-center text-danger py-4">

                    Failed to load return history.

                </td>
            </tr>
        `;

    }

}
