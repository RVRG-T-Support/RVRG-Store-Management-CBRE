// approvals.js
// Protect page
const currentUser = getCurrentUser();

if (!currentUser)
    window.location.replace("index.html");

// Global variable to hold the ID of the request being rejected
let currentRejectId = null; 
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
// Initialize the Bootstrap modal
let rejectModalInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    if (window.RvrgSecure?.enabled()) { window.location.replace('approval_workflow.html'); return; }
    // 1. Security Check: Only ADMIN, FM, and AFM can access approvals
    // If a STORE user tries to load this, they get redirected to the dashboard.
    const hasAccess = checkUserAccess(['ADMIN', 'FM', 'AFM']);
    if (!hasAccess) return;
    
    // Initialize Bootstrap Modal
    rejectModalInstance = new bootstrap.Modal(document.getElementById('rejectModal'));

    // Load initial data
window.RvrgRecords.mount('pendingApprovalsTable', loadPendingApprovals, true);
window.RvrgRecords.mount('approvedHistoryTable', loadApprovedHistory, true);
loadPendingApprovals();
loadApprovedHistory();

    // Event Listeners
document.getElementById('btnRefreshApprovals').addEventListener('click', () => {
    loadPendingApprovals();
    loadApprovedHistory();
});

document.getElementById('confirmRejectBtn').addEventListener('click', processRejection);
});

function approvalEscape(value) {
    return window.RvrgRecords.escape(value);
}

function approvalMaterialDetails(req, includePrice = false) {
    return window.RvrgTickets.material(req, includePrice);
}

// --- DATA LOADING LOGIC ---

async function loadPendingApprovals() {
    const tableBody = document.getElementById('pendingApprovalsTable');
    tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Loading pending requests...</td></tr>';

    try {
        // Fetch requests with PENDING status, joining related tables
        const { data, error } = await window.RvrgRecords.load('pendingApprovalsTable', supabase, {
            table:'material_requests', select:`
                *,
    materials!material_requests_material_id_fkey (
    material_code,
    material_name,
    brand,
    item_type,
    item_size,
    specification,
    unit,
    unit_cost,
    gst_type,
    gst_percentage,
    department_id,
    departments (
    department_name
    )
)
`, order:'created_at', ascending:true, filter:q=>q.eq('request_status','PENDING')
        });
        if (!data && !error) return;

        if (error) throw error;
        await window.RvrgSales.load(supabase, (data || []).map(r => r.material_id));

        if (data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-success py-4"><i class="fa-solid fa-check-circle me-2"></i>All caught up! No pending requests.</td></tr>';
            return;
        }

        let pendingStock = null;
        try { pendingStock = await window.RvrgOps.stockBalances(supabase, data.map(row=>row.material_id)); }
        catch (error) { console.error('Approval stock lookup failed:', error); }

        if (!window.RvrgRecords.isCurrent('pendingApprovalsTable', data)) return;
        tableBody.innerHTML = ''; // Clear table
        
        const tickets = new Map();
        for (const req of data) {
            if (!tickets.has(req.ticket_no)) tickets.set(req.ticket_no, []);
            tickets.get(req.ticket_no).push(req);
        }
        for (const [ticketNo, items] of tickets) {
            const first = items[0];
            const row = document.createElement('tr');
            row.className = 'approval-ticket-row';
            row.innerHTML = `<td colspan="6">
                <article class="approval-ticket" aria-label="${approvalEscape(ticketNo)}">
                    <header class="approval-ticket-header">
                        <div class="approval-ticket-identity">
                            <div class="approval-eyebrow">MATERIAL REQUEST <span class="approval-count">${items.length} material${items.length === 1 ? '' : 's'}</span></div>
                            <div class="approval-ticket-number">${approvalEscape(ticketNo)}</div>
                            <div>Complaint <strong>${approvalEscape(first.anacity_complaint_no || 'N/A')}</strong></div>
                            <div class="approval-muted">${approvalEscape(formatDateTime(first.created_at))}</div>
                        </div>
                        <div class="approval-ticket-context">
                            <div class="approval-eyebrow">DEPARTMENT / TECHNICIAN</div>
                            <strong>${approvalEscape(first.materials?.departments?.department_name || '-')}</strong>
                            <div class="approval-muted">${approvalEscape(first.technician_name || '-')}</div>
                        </div>
                        <div class="approval-ticket-location">
                            <div class="approval-eyebrow">LOCATION</div>
                            <strong>${approvalEscape(first.location_type || 'N/A')}</strong>
                            <div class="approval-muted">${approvalEscape(first.location_name || 'N/A')}</div>
                        </div>
                        <div class="approval-ticket-actions">
                            <button type="button" class="btn btn-success btn-sm" data-approve>Approve ticket</button>
                            <button type="button" class="btn btn-outline-danger btn-sm" data-reject>Reject</button>
                        </div>
                    </header>
                    <div class="approval-items-scroll" tabindex="0" aria-label="Materials for ${approvalEscape(ticketNo)}">
                        <table class="table approval-item-table mb-0">
                            <colgroup><col style="width:49%"><col style="width:14%"><col style="width:15%"><col style="width:10%"><col style="width:12%"></colgroup>
                            <thead><tr><th>Material details</th><th>Available stock</th><th>Sales / unit <small>incl. GST</small></th><th class="text-center">Requested</th><th>Approve qty</th></tr></thead>
                            <tbody>${items.map(req => {
                                const unit = req.materials?.unit || '-';
                                const stock = pendingStock === null ? null : Number(pendingStock.get(String(req.material_id)) || 0);
                                const requested = Number(req.requested_qty || 0);
                                return `<tr>
                                    <td>${approvalMaterialDetails(req)}</td>
                                    <td><span class="approval-stock ${stock === null ? 'stock-unknown' : stock > 0 ? 'stock-available' : 'stock-empty'}">${stock === null ? 'Unavailable' : stock.toLocaleString('en-IN')}</span><div class="approval-muted">${approvalEscape(unit)}</div></td>
                                    <td class="approval-price">${formatCurrency(window.RvrgSales.unit(req.materials, req.material_id))}</td>
                                    <td class="text-center"><span class="approval-quantity">${requested}</span></td>
                                    <td><label class="visually-hidden" for="approvedQty_${req.id}">Approve quantity for ${approvalEscape(req.materials?.material_code || req.id)}</label><input type="number" class="form-control form-control-sm approval-qty-input" id="approvedQty_${req.id}" value="${requested}" min="1" max="${requested}" step="1"></td>
                                </tr>`;
                            }).join('')}</tbody>
                        </table>
                    </div>
                </article>
            </td>`;
            row.querySelector('[data-approve]').addEventListener('click', () => window.approveTicket(ticketNo));
            row.querySelector('[data-reject]').addEventListener('click', () => window.openRejectModal(ticketNo));
            tableBody.appendChild(row);
        }

    } catch (error) {
        console.error("Error loading approvals:", error.message);
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Failed to load pending requests.</td></tr>';
    }
}

// ====================================================
// APPROVE COMPLETE TICKET
// ====================================================

window.approveTicket = async function(ticketNo){

    try{

        // --------------------------------------------
        // LOAD ALL PENDING ITEMS FOR THIS TICKET
        // --------------------------------------------

        const {
            data: requests,
            error: requestError
        } = await supabase

            .from("material_requests")

            .select(
                "id, ticket_no, requested_qty, request_status"
            )

            .eq(
                "ticket_no",
                ticketNo
            )

            .eq(
                "request_status",
                "PENDING"
            )

            .order(
                "id",
                {
                    ascending: true
                }
            );


        if(requestError)
            throw requestError;


        if(
            !requests ||
            !requests.length
        ){

            showAlert(
                "No pending materials found for this ticket.",
                "warning"
            );

            return;

        }


        // --------------------------------------------
        // READ + VALIDATE EVERY APPROVED QUANTITY
        // --------------------------------------------

        const approvals = [];

        for(
            const req of requests
        ){

            const input =
                document.getElementById(
                    `approvedQty_${req.id}`
                );


            if(!input){

                showAlert(
                    `Approved quantity field not found for request ${req.id}.`,
                    "danger"
                );

                return;

            }


            const requestedQty =
                Number(
                    req.requested_qty || 0
                );


            const approvedQty =
                Number(
                    input.value
                );


            if(
                !Number.isFinite(
                    approvedQty
                ) ||
                approvedQty <= 0
            ){

                showAlert(
                    `Invalid approval quantity for one of the materials.`,
                    "warning"
                );

                input.focus();

                return;

            }


            if(
                approvedQty >
                requestedQty
            ){

                showAlert(
                    `Approved quantity cannot be greater than requested quantity (${requestedQty}).`,
                    "warning"
                );

                input.focus();

                return;

            }


            approvals.push({

                id:
                    req.id,

                requestedQty:
                    requestedQty,

                approvedQty:
                    approvedQty

            });

        }


        // --------------------------------------------
        // CONFIRM COMPLETE TICKET
        // --------------------------------------------

        let summary = "";

        approvals.forEach(
            item => {

                summary +=
                    `Requested: ${item.requestedQty} | ` +
                    `Approved: ${item.approvedQty}\n`;

            }
        );


        const confirmed =
            confirm(

                `Approve complete ticket ${ticketNo}?\n\n` +

                `${requests.length} material(s)\n\n` +

                summary

            );


        if(!confirmed)
            return;


        const user =
            getCurrentUser();


        const approvalDate =
            new Date().toISOString();


        // --------------------------------------------
        // UPDATE EACH MATERIAL ROW
        // --------------------------------------------

        for(
            const item of approvals
        ){

            const approvalStatus =
                item.approvedQty <
                item.requestedQty
                    ? "PARTIALLY_APPROVED"
                    : "APPROVED";


            const {
                error: updateError
            } = await supabase

                .from(
                    "material_requests"
                )

                .update({

                    request_status:
                        approvalStatus,

                    approved_qty:
                        item.approvedQty,

                    approved_by:
                        user.id,

                    approval_date:
                        approvalDate

                })

                .eq(
                    "id",
                    item.id
                );


            if(updateError)
                throw updateError;

        }


        // --------------------------------------------
        // SUCCESS
        // --------------------------------------------

        showAlert(
            `Ticket ${ticketNo} approved successfully.\n${approvals.length} material(s) processed.`,
            "success"
        );


        // Refresh
        await loadPendingApprovals();

        await loadApprovedHistory();

    }

    catch(error){

        console.error(
            "Ticket Approval Error:",
            error
        );

        showAlert(
            error.message,
            "danger"
        );

    }

};

// --- REJECTION LOGIC ---

function openRejectModal(ticketNo){

    currentRejectId =
        ticketNo;

    document
        .getElementById(
            "rejectTicketNoDisplay"
        )
        .innerText =
            ticketNo;

    document
        .getElementById(
            "rejectReason"
        )
        .value = "";

    rejectModalInstance.show();

}
async function processRejection(){

    if(!currentRejectId)
        return;


    const ticketNo =
        currentRejectId;


    const reason =
        document
            .getElementById(
                "rejectReason"
            )
            .value
            .trim();


    const user =
        getCurrentUser();


    try{

        // --------------------------------------------
        // REJECT ALL PENDING MATERIALS IN TICKET
        // --------------------------------------------

        const {
            error
        } = await supabase

            .from(
                "material_requests"
            )

            .update({

                request_status:
                    "REJECTED",

                remarks:
                    reason
                        ? `Rejected: ${reason}`
                        : "Rejected without remarks",

                approved_by:
                    user.id,

                approval_date:
                    new Date().toISOString()

            })

            .eq(
                "ticket_no",
                ticketNo
            )

            .eq(
                "request_status",
                "PENDING"
            );


        if(error)
            throw error;


        rejectModalInstance.hide();


        showAlert(
            `Ticket ${ticketNo} rejected successfully.`,
            "info"
        );


        await loadPendingApprovals();


        await loadApprovedHistory();

    }

    catch(error){

        console.error(
            "Error rejecting ticket:",
            error.message
        );

        showAlert(
            "Failed to reject ticket.",
            "danger"
        );

    }

    finally{

        currentRejectId =
            null;

    }

}

// --- APPROVED HISTORY LOGIC ---

async function loadApprovedHistory() {

    const tableBody =
        document.getElementById('approvedHistoryTable');

    if (!tableBody) return;

    tableBody.innerHTML = `
        <tr>
            <td colspan="8"
                class="text-center text-muted py-4">
                Loading approved history...
            </td>
        </tr>
    `;

    try {

        const { data, error } = await window.RvrgRecords.load('approvedHistoryTable', supabase, {
            table:'material_requests', select:`
                *,
                materials!material_requests_material_id_fkey (
                    material_code,
                    material_name,
                    brand,
                    item_type,
                    item_size,
                    specification,
                    unit,
                    unit_cost,
                    gst_type,
                    gst_percentage,
                    department_id,
                    departments (
                        department_name
                    )
                )
            `, wholeTicket:true, order:'approval_date', ascending:false, filter:q=>q.in('request_status',['APPROVED','PARTIALLY_APPROVED','PARTIALLY_ISSUED','ISSUED'])
        });
        if (!data && !error) return;

        if (error) throw error;
        await window.RvrgSales.load(supabase, (data || []).map(r => r.material_id));
        if (!window.RvrgRecords.isCurrent('approvedHistoryTable', data)) return;

        if (!data || data.length === 0) {

            tableBody.innerHTML = `
                <tr>
                    <td colspan="8"
                        class="text-center text-muted py-4">
                        No approved requests yet.
                    </td>
                </tr>
            `;

            return;
        }

        tableBody.innerHTML = '';

        window.RvrgTickets.history(tableBody, data, 'approval');

    } catch (error) {

        console.error(
            "Error loading approved history:",
            error.message
        );

        tableBody.innerHTML = `
            <tr>
                <td colspan="8"
                    class="text-center text-danger py-4">

                    Failed to load approved history.

                </td>
            </tr>
        `;
    }
}
