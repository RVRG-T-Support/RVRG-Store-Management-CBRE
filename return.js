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
    const searchValue = document.getElementById('searchTicketNo').value.trim();

    if (!searchValue) {
        showAlert(
            "Please enter a Complaint Number or MR Ticket Number to search.",
            "warning"
        );
        return;
    }

    try {
        // First check whether the entered value is an Anacity complaint number.
        const { data: requestRows, error: requestError } = await supabase
            .from('material_requests')
            .select('ticket_no')
            .eq('anacity_complaint_no', searchValue);

        if (requestError) throw requestError;

        // Complaint number found -> get all MR ticket numbers linked to it.
        if (requestRows && requestRows.length > 0) {

            const ticketNumbers = [
                ...new Set(
                    requestRows
                        .map(row => row.ticket_no)
                        .filter(Boolean)
                )
            ];

            if (ticketNumbers.length > 0) {
                fetchIssues(ticketNumbers);
                return;
            }
        }

        // If complaint number was not found, treat the value as the
        // generated MR ticket number.
        fetchIssues(searchValue);

    } catch (error) {
        console.error("Search Error:", error.message);
        showAlert(
            "Failed to search issued materials.",
            "error"
        );
    }
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
            material_code,
            material_name,
            category,
            brand,
            item_type,
            item_size,
            specification,
            unit
        )
    `)
    .order('issued_date', { ascending: false });

        // Apply ticket filter if provided
        if (ticketFilter) {

            if (Array.isArray(ticketFilter)) {
                // Anacity complaint number may be linked to multiple MR tickets
                query = query.in('ticket_no', ticketFilter);
            } else {
                // Direct MR ticket search
                query = query.eq('ticket_no', ticketFilter);
            }

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

    const material = issue.materials || {};

    const materialName =
        material.material_name || "-";

    const techName =
        issue.technician_name || "-";

    const materialDetails = [
        material.material_code
            ? `Code: ${material.material_code}`
            : null,

        material.category
            ? `Category: ${material.category}`
            : null,

        material.brand
            ? `Brand: ${material.brand}`
            : null,

        material.item_type
            ? `Type: ${material.item_type}`
            : null,

        material.item_size
            ? `Size: ${material.item_size}`
            : null,

        material.specification
            ? `Spec: ${material.specification}`
            : null,

        material.unit
            ? `Unit: ${material.unit}`
            : null

    ].filter(Boolean);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="fw-bold">${ticketNo}<br><small class="text-muted fw-normal">${formatDate(issue.issued_date)}</small></td>
<td class="text-start">
    <div class="fw-bold">
        ${materialName}
    </div>

    <div class="small text-muted mt-1">
        ${materialDetails.join(' &nbsp;|&nbsp; ')}
    </div>
</td>                <td>${techName}</td>
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

        // --------------------------------------------------
        // 1. Load return records + issued material details
        // --------------------------------------------------

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
                        material_code,
                        material_name,
                        category,
                        brand,
                        item_type,
                        item_size,
                        specification,
                        unit
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


        if (!returns || returns.length === 0) {

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


        // --------------------------------------------------
        // 2. Collect MR ticket numbers
        // --------------------------------------------------

        const ticketNumbers = [
            ...new Set(
                returns
                    .map(returnRecord =>
                        returnRecord
                            .material_issue_register
                            ?.ticket_no
                    )
                    .filter(Boolean)
            )
        ];


        // --------------------------------------------------
        // 3. Load Anacity complaint numbers separately
        // --------------------------------------------------

        let complaintMap = {};

        if (ticketNumbers.length > 0) {

            const {
                data: requestRows,
                error: requestError
            } = await supabase

                .from("material_requests")

                .select(`
                    ticket_no,
                    anacity_complaint_no
                `)

                .in("ticket_no", ticketNumbers);


            if (requestError)
                throw requestError;


            (requestRows || []).forEach(row => {

                const ticketNo =
                    String(row.ticket_no || "");

                if (ticketNo) {

                    complaintMap[ticketNo] =
                        row.anacity_complaint_no || "N/A";
                }

            });
        }


        // --------------------------------------------------
        // 4. Render history
        // --------------------------------------------------

        tableBody.innerHTML = "";


        returns.forEach(returnRecord => {

            const issue =
                returnRecord.material_issue_register || {};

            const material =
                issue.materials || {};


            const ticketNo =
                issue.ticket_no || "N/A";


            const complaintNumber =
                complaintMap[String(ticketNo)] || "N/A";


            const requestNumber =
                ticketNo;


            const materialName =
                material.material_name || "-";


            const materialDetails = [
                material.material_code
                    ? `Code: ${material.material_code}`
                    : null,

                material.category
                    ? `Category: ${material.category}`
                    : null,

                material.brand
                    ? `Brand: ${material.brand}`
                    : null,

                material.item_type
                    ? `Type: ${material.item_type}`
                    : null,

                material.item_size
                    ? `Size: ${material.item_size}`
                    : null,

                material.specification
                    ? `Spec: ${material.specification}`
                    : null,

                material.unit
                    ? `Unit: ${material.unit}`
                    : null

            ].filter(Boolean);


            const technician =
                issue.technician_name || "-";


            const issuedQty =
                Number(issue.issued_qty || 0);


            const returnedQty =
                Number(returnRecord.returned_qty || 0);


            const condition =
                returnRecord.return_condition || "-";


            const remarks =
                returnRecord.remarks || "-";


            const returnDate =
                returnRecord.return_date
                    ? formatDate(returnRecord.return_date)
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

                <td class="text-start">

                    <div class="fw-bold">
                        ${materialName}
                    </div>

                    <div class="small text-muted mt-1">
                        ${materialDetails.join(
                            ' &nbsp;|&nbsp; '
                        )}
                    </div>

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
            error
        );


        tableBody.innerHTML = `
            <tr>
                <td colspan="8"
                    class="text-center text-danger py-4">

                    Failed to load return history.

                    <br>

                    <small>
                        ${error.message || ""}
                    </small>

                </td>
            </tr>
        `;

    }

}
