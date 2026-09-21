// reports.js
// Protect page
const currentUser = getCurrentUser();

if (!currentUser)
    window.location.replace("index.html");


document.addEventListener("DOMContentLoaded", () => {

    // ====================================================
    // ACCESS CONTROL
    // ====================================================

    const hasAccess =
        checkUserAccess([
            "ADMIN",
            "FM",
            "AFM",
            "STORE",
            "TECH_SUPERVISOR"
        ]);

    if (!hasAccess)
        return;


    const user =
        getCurrentUser();


    // ====================================================
    // EXCEL EXPORT
    // ====================================================

    if (user.role === "ADMIN") {

        document
            .getElementById("btnExportReport")
            .classList
            .remove("d-none");

        document
    .getElementById(
        "btnExportPdfReport"
    )
    .addEventListener(
        "click",
        exportToPDF
    );

    }


    // ====================================================
    // DEFAULT DATE RANGE
    // ====================================================

    const today =
        new Date();

    const firstDay =
        new Date(
            today.getFullYear(),
            today.getMonth(),
            1
        );


    document
        .getElementById("filterFromDate")
        .value =
        firstDay
            .toISOString()
            .split("T")[0];


    document
        .getElementById("filterToDate")
        .value =
        today
            .toISOString()
            .split("T")[0];


    // ====================================================
    // EVENT LISTENERS
    // ====================================================

    document
        .getElementById("reportFilterForm")
        .addEventListener(
            "submit",
            generateReport
        );


document
    .getElementById("btnExportReport")
    .addEventListener(
        "click",
        exportToExcel
    );


document
    .getElementById("btnReportHistory")
    .addEventListener(
        "click",
        loadReportDownloadHistory
    );

});


// ====================================================
// REPORT GENERATION
// ====================================================

async function generateReport(e) {

    e.preventDefault();


    const fromDate =
        document
            .getElementById("filterFromDate")
            .value;


    const toDate =
        document
            .getElementById("filterToDate")
            .value;


    const departmentName =
        document
            .getElementById("filterDepartment")
            .value;


    const recordType =
        document
            .getElementById("filterRecordType")
            .value;


    const areaType =
        document
            .getElementById("filterAreaType")
            .value;


    // Include the full selected To Date
    const toDateEndOfDay =
        new Date(
            `${toDate}T23:59:59.999`
        );


    const tableBody =
        document.getElementById(
            "reportTableBody"
        );


    tableBody.innerHTML = `
        <tr>
            <td colspan="7"
                class="text-center text-muted py-4">

                <div
                    class="spinner-border text-primary"
                    role="status">
                </div>

                <br>

                Fetching data...

            </td>
        </tr>
    `;


    document
        .getElementById(
            "reportTableFooter"
        )
        .style.display =
        "none";


    try {

        let reportData = [];


        // ====================================================
        // MATERIAL REQUESTS
        // ====================================================

        if (
            recordType === "REQUESTS"
        ) {

            reportData =
                await fetchRequestData(
                    fromDate,
                    toDateEndOfDay.toISOString(),
                    departmentName,
                    areaType
                );

        }


        // ====================================================
        // APPROVAL HISTORY
        // ====================================================

        else if (
            recordType === "APPROVALS"
        ) {

            reportData =
                await fetchApprovalData(
                    fromDate,
                    toDateEndOfDay.toISOString(),
                    departmentName,
                    areaType
                );

        }


        // ====================================================
        // MATERIAL CONSUMPTION / ISSUE
        // ====================================================

        else if (
            recordType === "CONSUMPTION"
        ) {

            reportData =
                await fetchConsumptionData(
                    fromDate,
                    toDateEndOfDay.toISOString(),
                    departmentName,
                    areaType
                );

        }


        // ====================================================
        // MATERIAL RETURNS
        // ====================================================

        else if (
            recordType === "RETURNS"
        ) {

            reportData =
                await fetchReturnData(
                    fromDate,
                    toDateEndOfDay.toISOString(),
                    departmentName,
                    areaType
                );

        }


        // ====================================================
        // STOCK PURCHASE
        // ====================================================

        else if (
            recordType === "PURCHASE"
        ) {

            reportData =
                await fetchPurchaseData(
                    fromDate,
                    toDateEndOfDay.toISOString(),
                    departmentName
                );

        }


        // ====================================================
        // ALL TRANSACTIONS
        // ====================================================

        else if (
            recordType === "ALL"
        ) {

            reportData =
                await fetchAllTransactions(
                    fromDate,
                    toDateEndOfDay.toISOString(),
                    departmentName,
                    areaType
                );

        }


        renderReportTable(
            reportData,
            recordType
        );


    }
    catch (error) {

        console.error(
            "Error generating report:",
            error
        );


        tableBody.innerHTML = `
            <tr>
                <td colspan="7"
                    class="text-center text-danger py-5">

                    Error generating report.

                    <br>

                    <small>
                        ${error.message || ""}
                    </small>

                </td>
            </tr>
        `;


        showAlert(
            "Failed to load report data.",
            "error"
        );

    }

}


// ====================================================
// MATERIAL REQUEST REPORT
// ====================================================

async function fetchRequestData(
    fromDate,
    toDate,
    departmentName,
    areaType
) {

    let query =
        supabase

            .from(
                "material_requests"
            )

    .select(`
    id,
    ticket_no,
    anacity_complaint_no,
    location_name,
    location_type,
    requested_qty,
    request_status,
    created_at,
    technician_name,
    requested_by,
    approved_by,

materials!material_requests_material_id_fkey(
    material_code,
    material_name,
    category,
    unit,
    department_id,
    departments(
        department_name
    )
)
`)       

            .gte(
                "created_at",
                fromDate
            )

            .lte(
                "created_at",
                toDate
            )

            .order(
                "created_at",
                {
                    ascending: false
                }
            );


    const {
        data,
        error
    } = await query;


    if (error)
        throw error;


    let filtered =
        data || [];


    if (
        departmentName !== "ALL"
    ) {

        filtered =
            filtered.filter(
                row =>
                    row.materials
                        ?.departments
                        ?.department_name
                    === departmentName
            );

    }


    if (
        areaType !== "ALL"
    ) {

        filtered =
            filtered.filter(
                row =>
                    row.location_type
                    === areaType
            );

    }


return filtered.map(
    row => ({

        date:
            row.created_at,

        reference:
            row.ticket_no,

        complaintNumber:
            row.anacity_complaint_no
            || "N/A",

       materialCode:
    row.materials
        ?.material_code
    || "-",

material:
    row.materials
        ?.material_name
    || "-",

category:
    row.materials
        ?.category
    || "-",

unit:
    row.materials
        ?.unit
    || "-",

        department:
            row.materials
                ?.departments
                ?.department_name
            || "-",

        area:
            row.location_type
            || "-",

        quantity:
            Number(
                row.requested_qty || 0
            ),

        value:
            0,

        requestedBy:
            row.requested_by || "-",

        approvedBy:
            row.approved_by || "-",

        issuedBy:
            "-",

        extra:
            `Status: ${
                row.request_status
                || "-"
            }`

    })
);

}


// ====================================================
// APPROVAL HISTORY REPORT
// ====================================================

async function fetchApprovalData(
    fromDate,
    toDate,
    departmentName,
    areaType
) {

    let query =
        supabase

            .from(
                "material_requests"
            )

.select(`
    id,
    ticket_no,
    anacity_complaint_no,
    location_name,
    location_type,
    requested_qty,
    request_status,
    created_at,
    technician_name,
    requested_by,
    approved_by,

 materials!material_requests_material_id_fkey(

    material_code,

    material_name,

    category,

    unit,

    department_id,

    departments(
        department_name
    )

)
`)

            .in(
                "request_status",
                [
                    "APPROVED",
                    "PARTIALLY_APPROVED"
                ]
            )

            .gte(
                "approval_date",
                fromDate
            )

            .lte(
                "approval_date",
                toDate
            )

            .order(
                "approval_date",
                {
                    ascending: false
                }
            );


    const {
        data,
        error
    } = await query;


    if (error)
        throw error;


    let filtered =
        data || [];


    if (
        departmentName !== "ALL"
    ) {

        filtered =
            filtered.filter(
                row =>
                    row.materials
                        ?.departments
                        ?.department_name
                    === departmentName
            );

    }


    if (
        areaType !== "ALL"
    ) {

        filtered =
            filtered.filter(
                row =>
                    row.location_type
                    === areaType
            );

    }


return filtered.map(
    row => ({

        date:
            row.approval_date,

        reference:
            row.ticket_no,

        complaintNumber:
            row.anacity_complaint_no
            || "N/A",

materialCode:
    row.materials
        ?.material_code
    || "-",

material:
    row.materials
        ?.material_name
    || "-",

category:
    row.materials
        ?.category
    || "-",

unit:
    row.materials
        ?.unit
    || "-",

        department:
            row.materials
                ?.departments
                ?.department_name
            || "-",

        area:
            row.location_type
            || "-",

        quantity:
            Number(
                row.approved_qty ??
                row.requested_qty ??
                0
            ),

        value:
            0,

        requestedBy:
            row.requested_by || "-",

        approvedBy:
            row.approved_by || "-",

        issuedBy:
            "-",

        extra:
            `Requested: ${
                row.requested_qty
                || 0
            } | Approved: ${
                row.approved_qty
                ?? row.requested_qty
                ?? 0
            } | Status: ${
                row.request_status
                || "-"
            }`

    })
);

}

// ====================================================
// LOAD COMPLAINT NUMBERS BY TICKET
// ====================================================

async function loadComplaintNumberMap(
    ticketNumbers
){

    const complaintMap = {};


    const uniqueTickets =
        [
            ...new Set(
                (ticketNumbers || [])
                    .filter(
                        ticket =>
                            ticket &&
                            String(ticket).trim() !== ""
                    )
                    .map(
                        ticket =>
                            String(ticket).trim()
                    )
            )
        ];


    if(!uniqueTickets.length){

        return complaintMap;

    }


    const {
        data,
        error
    } = await supabase

        .from("material_requests")

        .select(
            "ticket_no, anacity_complaint_no"
        )

        .in(
            "ticket_no",
            uniqueTickets
        );


    if(error)
        throw error;


    (data || []).forEach(
        row => {

            const ticket =
                String(
                    row.ticket_no || ""
                ).trim();


            if(
                ticket &&
                !complaintMap[ticket]
            ){

                complaintMap[ticket] =
                    row.anacity_complaint_no ||
                    "-";

            }

        }
    );


    return complaintMap;

}

// ====================================================
// MATERIAL CONSUMPTION / ISSUE REPORT
// ====================================================

async function fetchConsumptionData(
    fromDate,
    toDate,
    departmentName,
    areaType
) {

    let query =
        supabase

            .from(
                "material_issue_register"
            )

            .select(`
                ticket_no,
                location_type,
                location_name,
                issued_date,
                issued_qty,
                unit_cost,
                issued_by,

                materials!material_issue_register_material_id_fkey(
                    material_code,
                    material_name,
                    category,
                    unit,
                    department_id,

                    departments(
                        department_name
                    )
                )
            `)

            .gte(
                "issued_date",
                fromDate
            )

            .lte(
                "issued_date",
                toDate
            )

            .order(
                "issued_date",
                {
                    ascending: false
                }
            );


    const {
        data,
        error
    } = await query;


    if(error)
        throw error;


    let filtered =
        data || [];


    // ==================================================
    // DEPARTMENT FILTER
    // ==================================================

    if(
        departmentName !==
        "ALL"
    ){

        filtered =
            filtered.filter(
                row =>
                    row.materials
                        ?.departments
                        ?.department_name
                    === departmentName
            );

    }


    // ==================================================
    // AREA FILTER
    // ==================================================

    if(
        areaType !==
        "ALL"
    ){

        filtered =
            filtered.filter(
                row =>
                    row.location_type
                    === areaType
            );

    }


    // ==================================================
    // LOAD COMPLAINT NUMBERS
    // ==================================================

    const complaintMap =
        await loadComplaintNumberMap(

            filtered.map(
                row =>
                    row.ticket_no
            )

        );


    // ==================================================
    // BUILD REPORT
    // ==================================================

    return filtered.map(
        row => {

            const material =
                row.materials || {};


            const ticketNo =
                row.ticket_no
                || "-";


            return {

                date:
                    row.issued_date,


                complaintNumber:
                    complaintMap[
                        String(ticketNo)
                    ]
                    || "-",


                reference:
                    ticketNo,


                materialCode:
                    material.material_code
                    || "-",


                material:
                    material.material_name
                    || "-",


                category:
                    material.category
                    || "-",


                department:
                    material.departments
                        ?.department_name
                    || "-",


                area:
                    row.location_type
                    || "-",


                unit:
                    material.unit
                    || "-",


                quantity:
                    Number(
                        row.issued_qty || 0
                    ),


                value:
                    Number(
                        row.issued_qty || 0
                    )
                    *
                    Number(
                        row.unit_cost || 0
                    ),


                requestedBy:
                    "-",


                approvedBy:
                    "-",


                issuedBy:
                    row.issued_by
                    || "-"

            };

        }
    );

}{

    let query =
        supabase

            .from(
                "material_issue_register"
            )

            .select(`
                ticket_no,
                location_type,
                location_name,
                issued_date,
                issued_qty,
                unit_cost,
                issued_by,

                materials!material_issue_register_material_id_fkey(
                    material_code,
                    material_name,
                    category,
                    brand,
                    item_type,
                    item_size,
                    specification,
                    department_id,

                    departments(
                        department_name
                    )
                )
            `)

            .gte(
                "issued_date",
                fromDate
            )

            .lte(
                "issued_date",
                toDate
            )

            .order(
                "issued_date",
                {
                    ascending: false
                }
            );


    const {
        data,
        error
    } = await query;


    if (error)
        throw error;


    let filtered =
        data || [];


    // ==================================================
    // DEPARTMENT FILTER
    // ==================================================

    if (
        departmentName !== "ALL"
    ) {

        filtered =
            filtered.filter(
                row =>
                    row.materials
                        ?.departments
                        ?.department_name
                    === departmentName
            );

    }


    // ==================================================
    // AREA FILTER
    // ==================================================

    if (
        areaType !== "ALL"
    ) {

        filtered =
            filtered.filter(
                row =>
                    row.location_type
                    === areaType
            );

    }


    // ==================================================
    // BUILD REPORT DATA
    // ==================================================

    return filtered.map(
        row => {

            const material =
                row.materials || {};


            const materialDetails = [

                material.material_code
                    ? `Code: ${material.material_code}`
                    : "",

                material.category
                    ? `Category: ${material.category}`
                    : "",

                material.brand
                    ? `Brand: ${material.brand}`
                    : "",

                material.item_type
                    ? `Type: ${material.item_type}`
                    : "",

                material.item_size
                    ? `Size: ${material.item_size}`
                    : "",

                material.specification
                    ? `Specification: ${material.specification}`
                    : ""

            ]
            .filter(
                value =>
                    value !== ""
            )
            .join(" | ");


            return {

                date:
                    row.issued_date,

                reference:
                    row.ticket_no
                    || "-",

                material:
                    material.material_name
                    || "-",

                department:
                    material.departments
                        ?.department_name
                    || "-",

                area:
                    row.location_type
                    || "-",

                quantity:
                    Number(
                        row.issued_qty || 0
                    ),

                value:
                    Number(
                        row.issued_qty || 0
                    )
                    *
                    Number(
                        row.unit_cost || 0
                    ),

                requestedBy:
                    "-",

                approvedBy:
                    "-",

                issuedBy:
                    row.issued_by
                    || "-",

                extra:
                    materialDetails

            };

        }
    );

}


// ====================================================
// MATERIAL RETURN REPORT
// ====================================================

async function fetchReturnData(
    fromDate,
    toDate,
    departmentName,
    areaType
) {

    let query =
        supabase

            .from(
                "material_returns"
            )

            .select(`
                id,
                issue_id,
                material_id,
                returned_qty,
                return_condition,
                received_by,
                return_date,
                remarks,

                material_issue_register!material_returns_issue_id_fkey(
                    ticket_no,
                    location_name,
                    location_type,
                    technician_name,
                    issued_qty,

    `materials!material_issue_register_material_id_fkey(
    material_code,
    material_name,
    category,
    unit,
    department_id,
    unit_cost,

                        departments(
                            department_name
                        )
                    )
                )
            `)

            .gte(
                "return_date",
                fromDate
            )

            .lte(
                "return_date",
                toDate
            )

            .order(
                "return_date",
                {
                    ascending: false
                }
            );


    const {
        data,
        error
    } = await query;


    if (error)
        throw error;


    let filtered =
        data || [];


    if (
        departmentName !== "ALL"
    ) {

        filtered =
            filtered.filter(
                row =>
                    row.material_issue_register
                        ?.materials
                        ?.departments
                        ?.department_name
                    === departmentName
            );

    }


    if (
        areaType !== "ALL"
    ) {

        filtered =
            filtered.filter(
                row =>
                    row.material_issue_register
                        ?.location_type
                    === areaType
            );

    }

    return filtered.map(
    row => {

        const issue =
            row.material_issue_register
            || {};

        const material =
            issue.materials
            || {};
const complaintMap =
    await loadComplaintNumberMap([
        issue.ticket_no
    ]);

        return {

            date:
                row.return_date,

            reference:
                issue.ticket_no
                || "-",

            material:
                material.material_name
                || "-",

            department:
                material.departments
                    ?.department_name
                || "-",

            area:
                issue.location_type
                || "-",

            quantity:
                Number(
                    row.returned_qty || 0
                ),

            value:
                0,

            requestedBy:
                "-",

            approvedBy:
                "-",

            issuedBy:
                row.received_by || "-",

            extra:
                `Condition: ${
                    row.return_condition
                    || "-"
                } | Remarks: ${
                    row.remarks
                    || "-"
                }`

        };

    }
);
}


// ====================================================
// STOCK PURCHASE REPORT
// ====================================================

async function fetchPurchaseData(
    fromDate,
    toDate,
    departmentName
) {

    let query =
        supabase

            .from(
                "stock_entry_details"
            )

            .select(`
                quantity,
                purchase_price,
                gst_percentage,
                line_total,

                stock_entry_header!inner(
                    invoice_no,
                    invoice_date,
                    created_by
                ),

materials!stock_entry_details_material_id_fkey(

    material_code,

    material_name,

    category,

    unit,

    department_id,

    departments(
        department_name
    )

)
            `)

            .gte(
                "stock_entry_header.invoice_date",
                fromDate
            )

            .lte(
                "stock_entry_header.invoice_date",
                toDate
            )

            .order(
                "invoice_date",
                {
                    foreignTable:
                        "stock_entry_header",

                    ascending: false
                }
            );


    const {
        data,
        error
    } = await query;


    if (error)
        throw error;


    let filtered =
        data || [];


    // ==================================================
    // DEPARTMENT FILTER
    // ==================================================

    if (
        departmentName !== "ALL"
    ) {

        filtered =
            filtered.filter(
                row =>
                    row.materials
                        ?.departments
                        ?.department_name
                    === departmentName
            );

    }


    // ==================================================
    // LOAD USERS
    // ==================================================

    const createdByIds =
        [
            ...new Set(
                filtered
                    .map(
                        row =>
                            row.stock_entry_header
                                ?.created_by
                    )
                    .filter(
                        id =>
                            id !== null &&
                            id !== undefined
                    )
            )
        ];


    let userMap = {};


    if (
        createdByIds.length > 0
    ) {

        const {
            data: users,
            error: usersError
        } = await supabase

            .from(
                "users_master"
            )

            .select(
                "id, full_name"
            )

            .in(
                "id",
                createdByIds
            );


        if (usersError)
            throw usersError;


        (users || []).forEach(
            user => {

                userMap[
                    user.id
                ] =
                    user.full_name || "-";

            }
        );

    }


    // ==================================================
    // BUILD REPORT ROWS
    // ==================================================

    return filtered.map(
        row => {

            const header =
                row.stock_entry_header
                || {};


            const quantity =
                Number(
                    row.quantity || 0
                );


            const unitPrice =
                Number(
                    row.purchase_price || 0
                );


            const gstPercentage =
                Number(
                    row.gst_percentage || 0
                );


            // ------------------------------------------
            // BASIC MATERIAL VALUE
            // ------------------------------------------

            const basicAmount =
                quantity *
                unitPrice;


            // ------------------------------------------
            // GST
            // ------------------------------------------

            const gstAmount =
                basicAmount *
                gstPercentage /
                100;


            // ------------------------------------------
            // FINAL REPORT VALUE
            // BASIC + GST
            // ------------------------------------------

            const finalAmount =
                basicAmount +
                gstAmount;


            return {

                date:
                    header.invoice_date,

                reference:
                    header.invoice_no
                    || "-",

materialCode:
    row.materials
        ?.material_code
    || "-",

material:
    row.materials
        ?.material_name
    || "-",

category:
    row.materials
        ?.category
    || "-",

unit:
    row.materials
        ?.unit
    || "-",

                department:
                    row.materials
                        ?.departments
                        ?.department_name
                    || "-",

                area:
                    "Stock Purchase",

                quantity:
                    quantity,

                value:
                    Number(
                        finalAmount.toFixed(2)
                    ),

                requestedBy:
                    userMap[
                        header.created_by
                    ]
                    || "-",

                approvedBy:
                    "-",

                issuedBy:
                    "-"

            };

        }
    );

}


// ====================================================
// ALL TRANSACTIONS
// ====================================================

async function fetchAllTransactions(
    fromDate,
    toDate,
    departmentName,
    areaType
) {

    const [
        requests,
        approvals,
        consumption,
        returns,
        purchases
    ] = await Promise.all([

        fetchRequestData(
            fromDate,
            toDate,
            departmentName,
            areaType
        ),

        fetchApprovalData(
            fromDate,
            toDate,
            departmentName,
            areaType
        ),

        fetchConsumptionData(
            fromDate,
            toDate,
            departmentName,
            areaType
        ),

        fetchReturnData(
            fromDate,
            toDate,
            departmentName,
            areaType
        ),

        fetchPurchaseData(
            fromDate,
            toDate,
            departmentName
        )

    ]);


    return [

        ...requests.map(
            row => ({
                ...row,
                transactionType:
                    "REQUEST"
            })
        ),

        ...approvals.map(
            row => ({
                ...row,
                transactionType:
                    "APPROVAL"
            })
        ),

        ...consumption.map(
            row => ({
                ...row,
                transactionType:
                    "ISSUE"
            })
        ),

        ...returns.map(
            row => ({
                ...row,
                transactionType:
                    "RETURN"
            })
        ),

        ...purchases.map(
            row => ({
                ...row,
                transactionType:
                    "PURCHASE"
            })
        )

    ].sort(
        (a, b) =>
            new Date(b.date) -
            new Date(a.date)
    );

}

// ====================================================
// LAST GENERATED REPORT
// Used by Excel and PDF exports
// ====================================================

let lastReportData = [];

let lastReportType = "";

// ====================================================
// RENDER STANDARD REPORT TABLE
// ====================================================

function renderReportTable(
    data,
    recordType
){

    const tableBody =
        document.getElementById(
            "reportTableBody"
        );


    const tableFooter =
        document.getElementById(
            "reportTableFooter"
        );

lastReportData =
    data || [];

lastReportType =
    recordType || "";

    // Save for Excel / PDF

    lastReportData =
        data || [];

    lastReportType =
        recordType || "";


    // =================================================
    // EMPTY REPORT
    // =================================================

    if(
        !data ||
        data.length === 0
    ){

        tableBody.innerHTML = `

            <tr>

                <td
                    colspan="11"
                    class="text-center
                           text-muted
                           py-5">

                    No records found
                    for the selected filters.

                </td>

            </tr>

        `;


        tableFooter.style.display =
            "none";


        return;

    }


    tableBody.innerHTML =
        "";


    let totalQty =
        0;


    let totalVal =
        0;


    // =================================================
    // PROCESSED BY
    // =================================================

    function getProcessedBy(row){

        if(
            recordType ===
            "REQUESTS"
        ){

            return row.requestedBy ||
                "-";

        }


        if(
            recordType ===
            "APPROVALS"
        ){

            return `
                <div>
                    Requested:
                    ${row.requestedBy || "-"}
                </div>

                <div>
                    Approved:
                    ${row.approvedBy || "-"}
                </div>
            `;

        }


        if(
            recordType ===
            "CONSUMPTION"
        ){

            return row.issuedBy ||
                "-";

        }


        if(
            recordType ===
            "RETURNS"
        ){

            return row.issuedBy ||
                "-";

        }


        if(
            recordType ===
            "PURCHASE"
        ){

            return row.requestedBy ||
                "-";

        }


        if(
            recordType ===
            "ALL"
        ){

            if(
                row.transactionType ===
                "REQUEST"
            ){

                return row.requestedBy ||
                    "-";

            }


            if(
                row.transactionType ===
                "APPROVAL"
            ){

                return `
                    Requested:
                    ${row.requestedBy || "-"}

                    <br>

                    Approved:
                    ${row.approvedBy || "-"}
                `;

            }


            if(
                row.transactionType ===
                "ISSUE"
            ){

                return row.issuedBy ||
                    "-";

            }


            if(
                row.transactionType ===
                "RETURN"
            ){

                return row.issuedBy ||
                    "-";

            }


            if(
                row.transactionType ===
                "PURCHASE"
            ){

                return row.requestedBy ||
                    "-";

            }

        }


        return "-";

    }


    // =================================================
    // RENDER ROWS
    // =================================================

    data.forEach(
        row => {

            totalQty +=
                Number(
                    row.quantity || 0
                );


            totalVal +=
                Number(
                    row.value || 0
                );


            const tr =
                document.createElement(
                    "tr"
                );


            const reference =
                row.reference ||
                "-";


            const complaintNumber =
                row.complaintNumber ||
                "-";


            const rowClass =
                recordType === "ALL" &&
                row.transactionType

                    ? getTransactionRowClass(
                        row.transactionType
                    )

                    : "";


            tr.className =
                rowClass;


            const displayReference =
                recordType === "PURCHASE"

                    ? `

                        <div
                            class="fw-semibold
                                   text-primary">

                            Invoice:
                            ${reference}

                        </div>

                      `

                    : `

                        <div
                            class="fw-semibold
                                   text-success">

                            Complaint:
                            ${complaintNumber}

                        </div>


                        <div
                            class="fw-semibold
                                   text-primary">

                            MR:
                            ${reference}

                        </div>

                      `;


            const processedBy =
                getProcessedBy(row);


            tr.innerHTML = `

                <!-- DATE -->

                <td class="text-nowrap">

                    ${formatDate(
                        row.date
                    )}

                </td>


                <!-- COMPLAINT / TICKET -->

                <td
                    class="text-start">

                    ${displayReference}

                </td>


                <!-- ITEM CODE -->

                <td
                    class="fw-semibold
                           text-primary
                           text-nowrap">

                    ${row.materialCode || "-"}

                </td>


                <!-- MATERIAL NAME -->

                <td
                    class="text-start">

                    <div
                        class="fw-semibold">

                        ${row.material || "-"}

                    </div>

                </td>


                <!-- CATEGORY -->

                <td
                    class="text-start">

                    ${row.category || "-"}

                </td>


                <!-- DEPARTMENT -->

                <td>

                    ${row.department || "-"}

                </td>


                <!-- AREA -->

                <td>

                    <small>

                        ${row.area || "-"}

                    </small>

                </td>


                <!-- QUANTITY -->

                <td
                    class="fw-bold
                           text-end
                           text-nowrap">

                    ${row.quantity ?? 0}

                    <small
                        class="text-muted">

                        ${row.unit || ""}

                    </small>

                </td>


                <!-- VALUE -->

                <td
                    class="text-end
                           text-nowrap">

                    ${formatCurrency(
                        row.value || 0
                    )}

                </td>


                <!-- PROCESSED BY -->

                <td
                    class="text-start">

                    <small>

                        ${processedBy}

                    </small>

                </td>

            `;


            tableBody.appendChild(
                tr
            );

        }
    );


    // =================================================
    // TOTALS
    // =================================================

    document.getElementById(
        "totalQuantity"
    ).innerText =
        totalQty;


    document.getElementById(
        "totalValue"
    ).innerText =
        formatCurrency(
            totalVal
        );


    tableFooter.style.display =
        "table-footer-group";

}


// ====================================================
// ROW STYLE HELPER
// ====================================================

function getTransactionRowClass(
    transactionType
) {

    switch (
        transactionType
    ) {

        case "REQUEST":
            return "table-primary";

        case "APPROVAL":
            return "table-warning";

        case "ISSUE":
            return "table-success";

        case "RETURN":
            return "table-info";

        case "PURCHASE":
            return "table-secondary";

        default:
            return "";

    }

}


// ====================================================
// EXCEL EXPORT
// ====================================================

function exportToExcel(){

    if(
        !lastReportData ||
        !lastReportData.length
    ){

        showAlert(
            "No data available to export. Please generate a report first.",
            "warning"
        );

        return;

    }


    try{

        const fromDate =
            document.getElementById(
                "filterFromDate"
            )?.value || "";


        const toDate =
            document.getElementById(
                "filterToDate"
            )?.value || "";


        const department =
            document.getElementById(
                "filterDepartment"
            )?.selectedOptions[0]
                ?.text || "All Departments";


        const recordType =
            document.getElementById(
                "filterRecordType"
            )?.selectedOptions[0]
                ?.text || lastReportType;


        const areaType =
            document.getElementById(
                "filterAreaType"
            )?.selectedOptions[0]
                ?.text || "All Areas";


        // =============================================
        // REPORT ROWS
        // =============================================

        const rows =
            lastReportData.map(
                row => ({

                    "Date":
                        formatDate(
                            row.date
                        ),

                    "Complaint Number":
                        row.complaintNumber
                        || "-",

                    "Ticket / Invoice":
                        row.reference
                        || "-",

                    "Item Code":
                        row.materialCode
                        || "-",

                    "Material Name":
                        row.material
                        || "-",

                    "Category":
                        row.category
                        || "-",

                    "Department":
                        row.department
                        || "-",

                    "Area Type":
                        row.area
                        || "-",

                    "Quantity":
                        Number(
                            row.quantity || 0
                        ),

                    "Unit":
                        row.unit || "-",

                    "Value":
                        Number(
                            row.value || 0
                        ),

                    "Processed By":
                        getExcelProcessedBy(
                            row
                        )

                })
            );


        const worksheet =
            XLSX.utils.json_to_sheet(
                rows
            );


        worksheet["!cols"] = [

            { wch: 14 },
            { wch: 20 },
            { wch: 18 },
            { wch: 15 },
            { wch: 30 },
            { wch: 22 },
            { wch: 20 },
            { wch: 24 },
            { wch: 12 },
            { wch: 10 },
            { wch: 15 },
            { wch: 28 }

        ];


        worksheet["!autofilter"] = {

            ref:
                `A1:L${rows.length + 1}`

        };


        // =============================================
        // WORKBOOK
        // =============================================

        const workbook =
            XLSX.utils.book_new();


        XLSX.utils.book_append_sheet(
            workbook,
            worksheet,
            "Report"
        );


        const dateStr =
            new Date()
                .toISOString()
                .split("T")[0];


        const fileName =
            `RVRG_${lastReportType}_Report_${dateStr}.xlsx`;


        XLSX.writeFile(
            workbook,
            fileName
        );


        // =============================================
        // HISTORY
        // =============================================

        const user =
            getCurrentUser();


        saveReportDownloadHistory(

            user?.name ||
            "Unknown User",

            department

        );


        showAlert(
            "Excel report downloaded successfully.",
            "success"
        );

    }

    catch(error){

        console.error(
            "Excel Export Error:",
            error
        );


        showAlert(
            "Failed to export Excel report.",
            "danger"
        );

    }

}

function getExcelProcessedBy(
    row
){

    if(
        lastReportType ===
        "REQUESTS"
    ){

        return row.requestedBy || "-";

    }


    if(
        lastReportType ===
        "APPROVALS"
    ){

        return `Requested: ${
            row.requestedBy || "-"
        } | Approved: ${
            row.approvedBy || "-"
        }`;

    }


    if(
        lastReportType ===
        "CONSUMPTION"
    ){

        return row.issuedBy || "-";

    }


    if(
        lastReportType ===
        "RETURNS"
    ){

        return row.issuedBy || "-";

    }


    if(
        lastReportType ===
        "PURCHASE"
    ){

        return row.requestedBy || "-";

    }


    return "-";

}

// ====================================================
// PDF EXPORT
// ====================================================

function exportToPDF(){

    if(
        !lastReportData ||
        !lastReportData.length
    ){

        showAlert(
            "No data available to export. Please generate a report first.",
            "warning"
        );

        return;

    }


    if(
        !window.jspdf ||
        !window.jspdf.jsPDF
    ){

        showAlert(
            "PDF library is not loaded.",
            "danger"
        );

        return;

    }


    try{

        const {
            jsPDF
        } = window.jspdf;


        const doc =
            new jsPDF({

                orientation:
                    "landscape",

                unit:
                    "mm",

                format:
                    "a4"

            });


        const fromDate =
            document.getElementById(
                "filterFromDate"
            )?.value || "";


        const toDate =
            document.getElementById(
                "filterToDate"
            )?.value || "";


        const department =
            document.getElementById(
                "filterDepartment"
            )?.selectedOptions[0]
                ?.text ||
            "All Departments";


        const recordType =
            document.getElementById(
                "filterRecordType"
            )?.selectedOptions[0]
                ?.text ||
            lastReportType;


        const areaType =
            document.getElementById(
                "filterAreaType"
            )?.selectedOptions[0]
                ?.text ||
            "All Areas";


        // =============================================
        // HEADER
        // =============================================

        doc.setFontSize(16);

        doc.setFont(
            "helvetica",
            "bold"
        );

        doc.text(
            "RVRG STORE MANAGEMENT",
            14,
            14
        );


        doc.setFontSize(12);

        doc.setFont(
            "helvetica",
            "normal"
        );

        doc.text(
            "System Report",
            14,
            21
        );


        doc.setFontSize(8);

        doc.text(
            `Period: ${fromDate} to ${toDate}`,
            14,
            28
        );


        doc.text(
            `Department: ${department}`,
            95,
            28
        );


        doc.text(
            `Record Type: ${recordType}`,
            190,
            28
        );


        doc.text(
            `Area: ${areaType}`,
            14,
            34
        );


        doc.text(
            `Generated: ${
                new Date().toLocaleString(
                    "en-IN"
                )
            }`,
            95,
            34
        );


        // =============================================
        // TABLE DATA
        // =============================================

        const body =
            lastReportData.map(
                row => [

                    formatDate(
                        row.date
                    ),

                    row.complaintNumber
                    || "-",

                    row.reference
                    || "-",

                    row.materialCode
                    || "-",

                    row.material
                    || "-",

                    row.category
                    || "-",

                    row.department
                    || "-",

                    row.area
                    || "-",

                    `${
                        row.quantity ?? 0
                    } ${
                        row.unit || ""
                    }`,

                    `Rs. ${
                        Number(
                            row.value || 0
                        ).toFixed(2)
                    }`,

                    getExcelProcessedBy(
                        row
                    )

                ]
            );


        doc.autoTable({

            startY:
                40,

            head: [[

                "Date",

                "Complaint No.",

                "Ticket / Invoice",

                "Item Code",

                "Material Name",

                "Category",

                "Department",

                "Area Type",

                "Qty / Unit",

                "Value",

                "Processed By"

            ]],

            body:
                body,

            theme:
                "grid",

            styles: {

                fontSize:
                    6.5,

                cellPadding:
                    2,

                valign:
                    "middle"

            },

            headStyles: {

                fontStyle:
                    "bold",

                fontSize:
                    7

            },

            columnStyles: {

                0: {
                    cellWidth: 19
                },

                1: {
                    cellWidth: 23
                },

                2: {
                    cellWidth: 23
                },

                3: {
                    cellWidth: 20
                },

                4: {
                    cellWidth: 33
                },

                5: {
                    cellWidth: 24
                },

                6: {
                    cellWidth: 23
                },

                7: {
                    cellWidth: 27
                },

                8: {
                    cellWidth: 19
                },

                9: {
                    cellWidth: 20
                },

                10: {
                    cellWidth: 32
                }

            },

            didDrawPage:
                data => {

                    doc.setFontSize(
                        7
                    );

                    doc.text(
                        `Page ${data.pageNumber}`,
                        280,
                        200
                    );

                }

        });


        // =============================================
        // TOTAL
        // =============================================

        const finalY =
            doc.lastAutoTable.finalY +
            6;


        const totalValue =
            lastReportData.reduce(
                (
                    total,
                    row
                ) =>
                    total +
                    Number(
                        row.value || 0
                    ),
                0
            );


        doc.setFontSize(9);

        doc.setFont(
            "helvetica",
            "bold"
        );


        doc.text(
            `Total Records: ${
                lastReportData.length
            }`,
            14,
            finalY
        );


        doc.text(
            `Total Value: Rs. ${
                totalValue.toFixed(2)
            }`,
            70,
            finalY
        );


        const dateStr =
            new Date()
                .toISOString()
                .split("T")[0];


        doc.save(
            `RVRG_${lastReportType}_Report_${dateStr}.pdf`
        );


        showAlert(
            "PDF report downloaded successfully.",
            "success"
        );

    }

    catch(error){

        console.error(
            "PDF Export Error:",
            error
        );


        showAlert(
            "Failed to generate PDF report.",
            "danger"
        );

    }

}

// ====================================================
// SAVE REPORT DOWNLOAD HISTORY
// ====================================================

async function saveReportDownloadHistory(
    downloadedBy,
    department
) {

    try {

        const {
            error
        } = await supabase

            .from(
                "report_download_history"
            )

            .insert([

                {
                    downloaded_by:
                        downloadedBy,

                    department:
                        department

                }

            ]);


        if (error) {

            console.error(
                "Failed to save report download history:",
                error.message
            );

        }

    }
    catch (error) {

        console.error(
            "Report history error:",
            error
        );

    }

}


// ====================================================
// LOAD REPORT DOWNLOAD HISTORY
// ====================================================

async function loadReportDownloadHistory() {

    const tableBody =
        document.getElementById(
            "reportHistoryTable"
        );


    if (!tableBody)
        return;


    tableBody.innerHTML = `
        <tr>
            <td
                colspan="3"
                class="text-center text-muted py-4"
            >
                Loading history...
            </td>
        </tr>
    `;


    try {

        const {
            data,
            error
        } = await supabase

            .from(
                "report_download_history"
            )

            .select(`
                downloaded_at,
                downloaded_by,
                department
            `)

            .order(
                "downloaded_at",
                {
                    ascending: false
                }
            )

            .limit(50);


        if (error)
            throw error;


        if (
            !data ||
            data.length === 0
        ) {

            tableBody.innerHTML = `
                <tr>
                    <td
                        colspan="3"
                        class="text-center text-muted py-4"
                    >
                        No report downloads yet.
                    </td>
                </tr>
            `;

            return;

        }


        tableBody.innerHTML = "";


        data.forEach(
            record => {

                const row =
                    document.createElement(
                        "tr"
                    );


                const downloadDate =
                    record.downloaded_at
                        ? new Date(
                            record.downloaded_at
                        ).toLocaleString(
                            "en-IN",
                            {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit"
                            }
                        )
                        : "-";


                row.innerHTML = `

                    <td>
                        ${downloadDate}
                    </td>

                    <td class="fw-semibold">
                        ${record.downloaded_by || "-"}
                    </td>

                    <td>
                        ${record.department || "-"}
                    </td>

                `;


                tableBody.appendChild(
                    row
                );

            }
        );

    }
    catch (error) {

        console.error(
            "Error loading report download history:",
            error.message
        );


        tableBody.innerHTML = `
            <tr>

                <td
                    colspan="3"
                    class="text-center text-danger py-4"
                >

                    Failed to load report history.

                </td>

            </tr>
        `;

    }

}
