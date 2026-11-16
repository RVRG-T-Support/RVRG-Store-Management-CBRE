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
window.RvrgRecords.mount('approvedRequestsTable', loadApprovedRequests, false);
window.RvrgRecords.mount('issuedHistoryTable', loadIssuedHistory, false);
loadApprovedRequests();
loadIssuedHistory();

// Event Listeners
document.getElementById('btnRefreshIssueList').addEventListener('click', () => {
    loadApprovedRequests();
    loadIssuedHistory();
});
});

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

//====================================================
// ISSUE MATERIAL - SUPABASE CLIENT
//====================================================

const supabaseClient =
    window.supabaseClient ||
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
);

// Fractions are accepted only for litre units; all quantity buttons move by 1.
function issueAllowsFraction(unit) {
    return ['l','ltr','ltrs','liter','liters','litre','litres'].includes(
        String(unit || '').trim().toLowerCase().replace(/[.\s]/g, '')
    );
}

// --- DATA LOADING LOGIC ---

async function loadApprovedRequests() {
    const tableBody = document.getElementById('approvedRequestsTable');
    tableBody.innerHTML = '<tr><td colspan="13" class="text-center text-muted py-4">Loading approved requests...</td></tr>';

    try {
        // Fetch APPROVED requests
        const { data: requests, error: reqError } = await window.RvrgRecords.load('approvedRequestsTable', supabaseClient, {
            table:'material_requests', select:`
                *,
    materials!material_requests_material_id_fkey (
    material_name,
    material_code,
    unit,
    unit_cost,
    gst_type,
    gst_percentage,
    department_id,
    departments (
        department_name
    )
)
        `, order:'created_at', ascending:true, filter:q=>q.in('request_status',['APPROVED','PARTIALLY_APPROVED','PARTIALLY_ISSUED'])
        });
        if (!requests && !reqError) return;

        if (reqError) throw reqError;
        await window.RvrgSales.load(supabaseClient, (requests || []).map(r => r.material_id));

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

        if (!window.RvrgRecords.isCurrent('approvedRequestsTable', requests)) return;
        tableBody.innerHTML = ''; // Clear table
        
        requests.forEach(req => {
            const material = req.materials || {};

const deptName =
    material.departments?.department_name ||
    "-";
            const unitCost = window.RvrgSales.unit(material, req.material_id);

            const issuedQty = Number(req.issued_qty || 0);

            const approvedQty = Math.min(Number(req.requested_qty), Number(req.approved_qty ?? req.requested_qty));
            const balance = Math.max(0, Math.round((approvedQty - issuedQty) * 100) / 100);
            const litre = issueAllowsFraction(material.unit);
            const unitLabel = window.RvrgRecords.escape(material.unit || '-');

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
        ${formatDateTime(req.created_at)}
    </td>

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
        <div class="small text-muted">Unit: ${unitLabel}</div>
    </td>

    <!-- REQUESTED -->
    <td>
        ${req.requested_qty}
    </td>

    <td>
        <div class="fw-bold">${approvedQty}</div>
        <div class="small text-muted">Issued: ${issuedQty}</div>
        <div class="small fw-bold text-success">Remaining: ${balance}</div>
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

        <div class="issue-quantity-control">
            <button type="button" class="btn btn-outline-secondary btn-sm" id="issueMinus-${req.id}"
                aria-label="Decrease issued quantity by 1" onclick="adjustIssueQuantity(${req.id}, -1)" disabled>−</button>
            <input type="number" class="form-control form-control-sm issue-input" id="issueInput-${req.id}"
                min="${litre ? '0.01' : '1'}" step="${litre ? 'any' : '1'}" data-litre="${litre}"
                max="${Math.min(balance, currentStock)}" placeholder="Qty"
                aria-label="Issue quantity for ${material.material_code || req.id}"
                aria-describedby="issueHelp-${req.id} issueError-${req.id}"
                oninput="calculateAmount(${req.id}, ${unitCost}, ${Math.min(balance, currentStock)})"
                onkeydown="if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();adjustIssueQuantity(${req.id}, event.key==='ArrowUp'?1:-1)}">
            <button type="button" class="btn btn-outline-secondary btn-sm" id="issuePlus-${req.id}"
                aria-label="Increase issued quantity by 1" onclick="adjustIssueQuantity(${req.id}, 1)"
                ${Math.min(balance, currentStock) < 1 ? 'disabled' : ''}>+</button>
        </div>
        <div id="issueHelp-${req.id}" class="small text-muted mt-1">${litre ? 'Litre: fractions allowed' : 'Whole units only'}</div>
        <div id="issueError-${req.id}" class="small text-danger" aria-live="polite"></div>

    </td>

       <!-- ISSUE ACTION -->
    <td class="text-center">

        <button
            class="btn btn-primary btn-sm fw-bold shadow-sm"
            onclick="processIssue(
                ${req.id},
                ${req.material_id}
            )"
            id="btnIssue-${req.id}" ${balance <= 0 || currentStock <= 0 ? 'disabled' : ''}>

            <i class="fa-solid fa-box-arrow-up me-1"></i>
            Issue
        </button>

    </td>

    <!-- REJECT ACTION -->
    <td class="text-center">

        <button
            class="btn btn-danger btn-sm fw-bold shadow-sm"
            onclick="rejectRequest(
                ${req.id}
            )">

            <i class="fa-solid fa-xmark me-1"></i>
            Reject
        </button>

    </td>
`;

tableBody.appendChild(tr);
});

    } catch (error) {
        console.error("Error loading issue desk:", error.message);
        tableBody.innerHTML = '<tr><td colspan="13" class="text-center text-danger">Failed to load requests.</td></tr>';
    }
}

// A custom +/- control allows a one-unit step without making typed 0.5 L invalid.
window.adjustIssueQuantity = function(requestId, direction) {
    const input = document.getElementById(`issueInput-${requestId}`);
    const current = input.value === '' ? 0 : Number(input.value);
    const next = Math.round((current + direction) * 100) / 100;
    if (!Number.isFinite(next) || next <= 0 || next > Number(input.max)) return;
    input.value = String(next);
    input.dispatchEvent(new Event('input', {bubbles:true}));
};

// Live feedback explains the remaining approval instead of just marking the field red.
window.calculateAmount = function(requestId, unitCost, maximum) {
    const input = document.getElementById(`issueInput-${requestId}`);
    const quantity = Number(input.value);
    let error = '';
    if (input.value !== '') {
        if (!Number.isFinite(quantity) || quantity <= 0) error = 'Enter a positive quantity.';
        else if (quantity !== Math.round(quantity * 100) / 100) error = 'Use at most 2 decimal places.';
        else if (input.dataset.litre !== 'true' && !Number.isInteger(quantity)) error = 'Whole units only. Fractions are allowed for litres.';
        else if (quantity > maximum) error = `Maximum available to issue: ${maximum}.`;
    }
    const valid = input.value !== '' && !error;
    input.setCustomValidity(error);
    input.classList.toggle('is-invalid', !!error);
    input.setAttribute('aria-invalid', String(!!error));
    document.getElementById(`issueError-${requestId}`).textContent = error;
    document.getElementById(`amount-${requestId}`).textContent = formatCurrency(valid ? quantity * unitCost : 0);
    document.getElementById(`btnIssue-${requestId}`).disabled = !valid;
    document.getElementById(`issueMinus-${requestId}`).disabled = !Number.isFinite(quantity) || quantity - 1 <= 0 || quantity - 1 > maximum;
    document.getElementById(`issuePlus-${requestId}`).disabled = !Number.isFinite(quantity) || quantity + 1 > maximum || maximum <= 0;
};

// --- ISSUE PROCESS WORKFLOW ---

// ====================================================
// MANUAL MATERIAL ISSUE
// ====================================================

const issueInFlight = new Set();
const issueRetryKeys = new Map();
window.processIssue = async function(requestId, materialId) {
    if (issueInFlight.has(requestId)) return;
    issueInFlight.add(requestId);
    const button = document.getElementById(`btnIssue-${requestId}`);
    const wasDisabled = button?.disabled;
    if (button) button.disabled = true;
    try { await issueRequest(requestId, materialId); }
    catch (error) { showAlert(error.message, 'danger'); }
    finally { issueInFlight.delete(requestId); if (button) button.disabled = wasDisabled; }
};
async function submitCheckedIssue(requestId, issueQty, user) {
    const previous = issueRetryKeys.get(requestId);
    const retry = previous?.quantity === issueQty ? previous : {quantity:issueQty, id:crypto.randomUUID()};
    issueRetryKeys.set(requestId, retry);
    const {error} = await supabaseClient.rpc('issue_material_checked', {
        p_request:requestId, p_quantity:issueQty, p_actor:user.id, p_client_id:retry.id
    });
    if(error) {
        if(['PGRST202','42883'].includes(error.code))
            throw new Error('The issue quantity database update is required. Ask Admin to run the supplied SQL, then retry.');
        throw error;
    }
    issueRetryKeys.delete(requestId);
    showAlert(`Successfully issued ${issueQty} item(s).`, 'success');
}
async function issueRequest(requestId, materialId) {

    const inputEl =
        document.getElementById(
            `issueInput-${requestId}`
        );

    const issueQty =
        Number(
            inputEl.value || 0
        );

    const user =
        getCurrentUser();


    // ------------------------------------------------
    // VALIDATE ENTERED QUANTITY
    // ------------------------------------------------

    if(
        !Number.isFinite(issueQty) ||
        issueQty <= 0 || issueQty !== Math.round(issueQty * 100) / 100
    ){

        showAlert(
            "Please enter the issued quantity.",
            "warning"
        );

        return;

    }


    // Check an uncertain previous response with its original key before a stale
    // remaining-quantity check. The database returns the original issue once.
    if (!window.RvrgSecure?.enabled() && issueRetryKeys.get(requestId)?.quantity === issueQty) {
        await submitCheckedIssue(requestId, issueQty, user);
        await loadApprovedRequests();
        await loadIssuedHistory();
        return;
    }

    // ------------------------------------------------
    // GET LATEST REQUEST DATA
    // ------------------------------------------------

    const {
        data: requestData,
        error: requestError
    } = await supabaseClient

        .from("material_requests")

        .select(
            "requested_qty, approved_qty, issued_qty, ticket_no, material_id, request_status, materials!material_requests_material_id_fkey(unit)"
        )

        .eq(
            "id",
            requestId
        )

        .single();


    if(requestError){

        showAlert(
            requestError.message,
            "danger"
        );

        return;

    }


    if (!requestData.materials?.unit) {
        showAlert('Material unit is unavailable. Refresh the issue list.', 'warning');
        return;
    }
    if (!issueAllowsFraction(requestData.materials.unit) && !Number.isInteger(issueQty)) {
        showAlert('Whole units only. Fractional quantities are allowed only for litre items.', 'warning');
        return;
    }

    const requestedQty =
        Number(
            requestData.requested_qty || 0
        );

    const alreadyIssued =
        Number(
            requestData.issued_qty || 0
        );

    const approvedQty = Math.min(requestedQty, Number(requestData.approved_qty ?? requestedQty));
    const remainingQty = Math.round((approvedQty - alreadyIssued) * 100) / 100;
    if (Number(requestData.material_id) !== Number(materialId) ||
        !['APPROVED','PARTIALLY_APPROVED','PARTIALLY_ISSUED'].includes(requestData.request_status)) {
        showAlert('This request is no longer available for issue. Refresh the list.', 'warning');
        return;
    }
    if (!Number.isFinite(approvedQty) || issueQty > remainingQty) {
        showAlert(`Approved: ${approvedQty}. Already issued: ${alreadyIssued}. Remaining to issue: ${Math.max(0, remainingQty)}. Enter no more than the remaining quantity.`, 'warning');
        return;
    }


    // ------------------------------------------------
    // GET REAL-TIME STOCK
    // ------------------------------------------------

    const {
        data: stockRecord,
        error: stockError
    } = await supabaseClient

        .from("current_stock")

        .select(
            "current_stock"
        )

        .eq(
            "material_id",
            materialId
        )

        .single();


    if(stockError){

        showAlert(
            stockError.message,
            "danger"
        );

        return;

    }


    const currentStock =
        Number(
            stockRecord?.current_stock || 0
        );


    // ------------------------------------------------
    // VALIDATE AGAINST STOCK
    // ------------------------------------------------

    if (currentStock <= 0) {

        showAlert(
            "Material cannot be issued.\n\n" +
            "Current stock is 0.\n\n" +
            "Please arrange stock availability before issuing this request.",
            "warning"
        );

        return;
    }

    if (issueQty > currentStock) {

        showAlert(
            "Insufficient stock available.\n\n" +
            "Available stock: " +
            currentStock +
            "\nEntered issue quantity: " +
            issueQty +
            "\n\nPlease enter a quantity within the available stock.",
            "warning"
        );

        return;
    }


    const newTotalIssued = alreadyIssued + issueQty;
    const newStatus = newTotalIssued >= approvedQty ? 'ISSUED' : 'PARTIALLY_ISSUED';

    // ------------------------------------------------
    // CONFIRMATION MESSAGE
    // ------------------------------------------------

    const confirmMsg =

        "Confirm material issue?\n\n" +

        "Requested: " +
        requestedQty +
        "\n" +

        "Approved: " + approvedQty + "\n" +
        "Previously Issued: " +
        alreadyIssued +
        "\n" +

        "Issuing Now: " +
        issueQty +
        "\n" +

        "Current Stock: " +
        currentStock +
        "\n\n" +

        (
            newStatus === "ISSUED"
                ? "This request will be marked COMPLETED."
                : "Remaining quantity will stay pending."
        );


    if(
        !confirm(
            confirmMsg
        )
    ){

        return;

    }


    try{

        // ------------------------------------------------
        // FETCH MATERIAL COST
        // ------------------------------------------------

        if (window.RvrgSecure?.enabled()) {
            const { error } = await supabaseClient.rpc('approval_issue', {
                p_request: requestId, p_quantity: issueQty
            });
            if (error) throw error;
            showAlert('Material issued after final approval.', 'success');
            await loadApprovedRequests();
            await loadIssuedHistory();
            return;
        }

        await submitCheckedIssue(requestId, issueQty, user);

        loadApprovedRequests();
        loadIssuedHistory();
    }
    catch(error){

        console.error(
            "Transaction Error:",
            error.message
        );

        showAlert(
            error.message,
            "danger"
        );

    }

};

//====================================================
// REJECT MATERIAL REQUEST
//====================================================

window.rejectRequest = async function(requestId){

    const user = getCurrentUser();

    if (!user) {
        showAlert(
            "User session not found.",
            "danger"
        );
        return;
    }

    const confirmReject = confirm(
        "Reject this material request?\n\n" +
        "The request will be removed from the Issue Desk."
    );

    if (!confirmReject)
        return;

    try {

        const {
            error
        } = await supabaseClient

            .from("material_requests")

            .update({
                request_status: "REJECTED"
            })

            .eq(
                "id",
                requestId
            );

        if (error)
            throw error;

        showAlert(
            "Material request rejected successfully.",
            "success"
        );

        loadApprovedRequests();
        loadIssuedHistory();
    }
    catch(error){

        console.error(
            "Reject Request Error:",
            error.message
        );

        showAlert(
            "Failed to reject request.\n\n" +
            error.message,
            "danger"
        );
    }

};

// ====================================================
// ISSUED HISTORY
// ====================================================

async function loadIssuedHistory() {

    const tableBody =
        document.getElementById("issuedHistoryTable");

    if (!tableBody)
        return;

    tableBody.innerHTML = `
        <tr>
            <td colspan="8"
                class="text-center text-muted py-4">
                Loading issued history...
            </td>
        </tr>
    `;

    try {

        const {
            data: requests,
            error: requestError
        } = await window.RvrgRecords.load('issuedHistoryTable', supabaseClient, {
            table:'material_requests', select:`
                *,
                materials!material_requests_material_id_fkey (
                    material_code,
                    material_name,
                    department_id,
                    unit_cost,
                    departments (
                        department_name
                    )
                )
            `, order:'created_at', ascending:false, filter:q=>q.in('request_status',['ISSUED','PARTIALLY_ISSUED'])
        });
        if (!requests && !requestError) return;


        if (requestError)
            throw requestError;


        if (
            !requests ||
            requests.length === 0
        ) {

            tableBody.innerHTML = `
                <tr>
                    <td colspan="8"
                        class="text-center text-muted py-4">

                        No issued material history yet.

                    </td>
                </tr>
            `;

            return;

        }


        tableBody.innerHTML = "";


        requests.forEach(req => {

            const material =
                req.materials || {};


            const deptName =
                material.departments
                    ?.department_name || "-";


            const requestedQty =
                Number(
                    req.requested_qty || 0
                );


            const approvedQty =
                Number(
                    req.approved_qty ??
                    requestedQty
                );


            const issuedQty =
                Number(
                    req.issued_qty || 0
                );


            const isPartial =
                req.request_status ===
                "PARTIALLY_ISSUED";


            const statusBadge =
                isPartial

                    ? `
                        <span class="badge bg-warning text-dark">
                            Partially Issued
                        </span>
                    `

                    : `
                        <span class="badge bg-success">
                            Issued
                        </span>
                    `;


            const tr =
                document.createElement("tr");


            tr.innerHTML = `

                <!-- COMPLAINT / REQUEST -->

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


                <!-- DEPARTMENT / TECH -->

                <td>

                    <strong>
                        ${deptName}
                    </strong>

                    <br>

                    <small class="text-muted">

                        <i class="fa-solid fa-user-wrench me-1"></i>

                        ${req.technician_name || "N/A"}

                    </small>

                </td>


                <!-- MATERIAL -->

                <td>

                    <div class="fw-bold text-primary">

                        ${material.material_code || "N/A"}

                    </div>

                    <div class="fw-semibold">

                        ${material.material_name || "N/A"}

                    </div>

                </td>


                <!-- REQUESTED -->

                <td>

                    <span class="badge bg-secondary">

                        ${requestedQty}

                    </span>

                </td>


                <!-- APPROVED -->

                <td>

                    <span class="badge bg-info text-dark">

                        ${approvedQty}

                    </span>

                </td>


                <!-- ISSUED -->

                <td>

                    <span class="badge ${
                        issuedQty > approvedQty ? "bg-danger" : issuedQty < approvedQty
                            ? "bg-warning text-dark"
                            : "bg-success"
                    }">

                        ${issuedQty}

                    </span>

                    ${issuedQty > approvedQty ? '<div class="small text-danger">Exceeds approval — review required</div>' : ''}
                    ${
                        issuedQty < approvedQty

                        ? `
                            <div class="small text-muted mt-1">
                                of ${approvedQty}
                            </div>
                        `

                        : ""
                    }

                </td>


                <!-- LOCATION -->

                <td>

                    ${req.location_type || "N/A"}

                    <br>

                    <small class="text-muted">

                        ${req.location_name || "N/A"}

                    </small>

                </td>


                <!-- STATUS -->

                <td>

                    ${statusBadge}

                </td>

            `;


            tableBody.appendChild(tr);

        });


    }
    catch(error){

        console.error(
            "Error loading issued history:",
            error.message
        );


        tableBody.innerHTML = `
            <tr>
                <td colspan="8"
                    class="text-center text-danger py-4">

                    Failed to load issued history.

                </td>
            </tr>
        `;

    }

}
