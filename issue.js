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

       <!-- ISSUE ACTION -->
    <td class="text-center">

        <button
            class="btn btn-primary btn-sm fw-bold shadow-sm"
            onclick="processIssue(
                ${req.id},
                ${req.material_id}
            )"
            id="btnIssue-${req.id}">

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

// --- ISSUE PROCESS WORKFLOW ---

// ====================================================
// MANUAL MATERIAL ISSUE
// ====================================================

window.processIssue = async function(
    requestId,
    materialId
){

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
        !issueQty ||
        issueQty <= 0
    ){

        showAlert(
            "Please enter the issued quantity.",
            "warning"
        );

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
            "requested_qty, issued_qty, ticket_no"
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


    const requestedQty =
        Number(
            requestData.requested_qty || 0
        );

    const alreadyIssued =
        Number(
            requestData.issued_qty || 0
        );

    const remainingQty =
        requestedQty -
        alreadyIssued;


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


    // ------------------------------------------------
    // VALIDATE AGAINST STOCK
    // ------------------------------------------------

    if(
        issueQty > currentStock
    ){

        showAlert(
            "Issued quantity cannot be greater than current stock.\n\n" +
            "Current stock: " +
            currentStock +
            "\nEntered issue quantity: " +
            issueQty,
            "danger"
        );

        return;

    }


    // ------------------------------------------------
    // CALCULATE NEW TOTAL ISSUED
    // ------------------------------------------------

    const newTotalIssued =
        alreadyIssued +
        issueQty;


    // ------------------------------------------------
    // REQUEST COMPLETION RULE
    // ------------------------------------------------
    //
    // Request is complete when:
    //
    // A) requested quantity has been fulfilled
    // OR
    // B) current stock becomes zero after this issue
    //
    // Example:
    // Requested = 5
    // Already Issued = 0
    // Current Stock = 4
    // Issue Now = 4
    //
    // Result:
    // Issued Total = 4
    // Stock = 0
    // Request = ISSUED / CLOSED
    // ------------------------------------------------

    let newStatus;

    if(
        newTotalIssued >= requestedQty ||
        issueQty >= currentStock
    ){

        newStatus =
            "ISSUED";

    }
    else{

        newStatus =
            "PARTIALLY_ISSUED";

    }


    // ------------------------------------------------
    // CONFIRMATION MESSAGE
    // ------------------------------------------------

    const confirmMsg =

        "Confirm material issue?\n\n" +

        "Requested: " +
        requestedQty +
        "\n" +

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

        const {
            data: requestInfo,
            error: requestInfoError
        } = await supabaseClient

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

            .eq(
                "id",
                requestId
            )

            .single();


        if(requestInfoError)
            throw requestInfoError;


        const unitCost =
            Number(
                requestInfo
                    .materials
                    ?.unit_cost || 0
            );


        const totalCost =
            unitCost *
            issueQty;


        // ------------------------------------------------
        // INSERT ISSUE REGISTER
        // ------------------------------------------------

        const {
            data: issueData,
            error: issueError
        } = await supabaseClient

            .from(
                "material_issue_register"
            )

            .insert([{

                request_id:
                    requestId,

                material_id:
                    materialId,

                ticket_no:
                    requestInfo.ticket_no,

                location_name:
                    requestInfo.location_name,

                location_type:
                    requestInfo.location_type,

                technician_name:
                    requestInfo.technician_name,

                issued_qty:
                    issueQty,

                unit_cost:
                    unitCost,

                total_cost:
                    totalCost,

                remarks:
                    "Material issued manually",

                issued_by:
                    user.name

            }])

            .select();


        if(issueError)
            throw issueError;


        const newIssueId =
            issueData[0].id;


        // ------------------------------------------------
        // REDUCE STOCK
        // ------------------------------------------------

        const {
            error: ledgerError
        } = await supabaseClient

            .from(
                "stock_ledger"
            )

            .insert([{

                material_id:
                    materialId,

                transaction_type:
                    "ISSUE",

                // IMPORTANT:
                // ISSUE reduces stock

                quantity:
                    -Math.abs(
                        issueQty
                    ),

                reference_no:
                    newIssueId.toString(),

                request_id:
                    requestId,

                remarks:
                    `Issued against ticket ${requestInfo.ticket_no}`,

                created_by:
                    user.id,

                transaction_date:
                    new Date()
                        .toISOString()

            }]);


        if(ledgerError)
            throw ledgerError;


        // ------------------------------------------------
        // UPDATE REQUEST
        // ------------------------------------------------

        const {
            error: updateError
        } = await supabaseClient

            .from(
                "material_requests"
            )

            .update({

                issued_qty:
                    newTotalIssued,

                request_status:
                    newStatus

            })

            .eq(
                "id",
                requestId
            );


        if(updateError)
            throw updateError;


        // ------------------------------------------------
        // SUCCESS MESSAGE
        // ------------------------------------------------

        if(
            newStatus === "ISSUED" &&
            newTotalIssued < requestedQty
        ){

            showAlert(

                "Issued " +
                issueQty +
                " item(s).\n\n" +

                "Current stock has been exhausted, " +
                "so this request has been completed.",

                "success"

            );

        }
        else{

            showAlert(

                "Successfully issued " +
                issueQty +
                " item(s).",

                "success"

            );

        }


        loadApprovedRequests();

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
