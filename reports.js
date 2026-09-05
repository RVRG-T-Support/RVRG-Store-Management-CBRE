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

                materials!material_requests_material_id_fkey(
                    material_name,
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

            material:
                row.materials
                    ?.material_name
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

            extra:
                `Complaint Number: ${
                    row.anacity_complaint_no
                    || "N/A"
                } | Status: ${
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
                approved_qty,
                request_status,
                approval_date,
                technician_name,

                materials!material_requests_material_id_fkey(
                    material_name,
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

            material:
                row.materials
                    ?.material_name
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

            extra:
                `Complaint Number: ${
                    row.anacity_complaint_no
                    || "N/A"
                } | Requested: ${
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
// MATERIAL CONSUMPTION / ISSUE
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

                materials!material_issue_register_material_id_fkey(
                    material_name,
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
                row.issued_date,

            reference:
                row.ticket_no,

            material:
                row.materials
                    ?.material_name
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
                    row.issued_qty || 0
                ),

            value:
                Number(
                    row.issued_qty || 0
                )
                *
                Number(
                    row.unit_cost || 0
                )

        })
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

                    materials!material_issue_register_material_id_fkey(
                        material_name,
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
                line_total,

                stock_entry_header!inner(
                    invoice_no,
                    invoice_date
                ),

                materials!stock_entry_details_material_id_fkey(
                    material_name,
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


    return filtered.map(
        row => ({

            date:
                row.stock_entry_header
                    .invoice_date,

            reference:
                row.stock_entry_header
                    .invoice_no,

            material:
                row.materials
                    ?.material_name
                || "-",

            department:
                row.materials
                    ?.departments
                    ?.department_name
                || "-",

            area:
                "Stock Purchase",

            quantity:
                Number(
                    row.quantity || 0
                ),

            value:
                Number(
                    row.line_total || 0
                )

        })
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
// RENDER REPORT TABLE
// ====================================================

function renderReportTable(
    data,
    recordType
) {

    const tableBody =
        document.getElementById(
            "reportTableBody"
        );


    const tableFooter =
        document.getElementById(
            "reportTableFooter"
        );


    if (
        !data ||
        data.length === 0
    ) {

        tableBody.innerHTML = `
            <tr>
                <td colspan="7"
                    class="text-center text-muted py-5">

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


            let reference =
                row.reference || "-";


            let material =
                row.material || "-";


            let department =
                row.department || "-";


            let area =
                row.area || "-";


            let quantity =
                row.quantity ?? 0;


            let value =
                row.value ?? 0;


            if (
                recordType === "ALL"
                &&
                row.transactionType
            ) {

                reference =
                    `<span class="badge bg-secondary me-1">
                        ${row.transactionType}
                    </span>
                    ${reference}`;

            }


            if (row.extra) {

                material =
                    `${material}
                    <br>
                    <small class="text-muted">
                        ${row.extra}
                    </small>`;

            }


            const rowClass =
                recordType === "ALL"
                    ? getTransactionRowClass(
                        row.transactionType
                    )
                    : "";


            tr.className =
                rowClass;


            tr.innerHTML = `

                <td>
                    ${formatDate(
                        row.date
                    )}
                </td>

                <td class="fw-bold">
                    ${reference}
                </td>

                <td>
                    ${material}
                </td>

                <td>
                    ${department}
                </td>

                <td>
                    <small>
                        ${area}
                    </small>
                </td>

                <td class="fw-bold">
                    ${quantity}
                </td>

                <td>
                    ${formatCurrency(
                        value
                    )}
                </td>

            `;


            tableBody.appendChild(
                tr
            );

        }
    );


    document
        .getElementById(
            "totalQuantity"
        )
        .innerText =
        totalQty;


    document
        .getElementById(
            "totalValue"
        )
        .innerText =
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

function exportToExcel() {

    const table =
        document.querySelector(
            ".card table"
        );


    if (!table) {

        showAlert(
            "Report table not found.",
            "warning"
        );

        return;

    }


    const rows =
        table.querySelectorAll(
            "tbody tr"
        );


    if (
        rows.length === 0
        ||
        rows[0]
            .innerText
            .includes(
                "Select filters"
            )
        ||
        rows[0]
            .innerText
            .includes(
                "No records found"
            )
    ) {

        showAlert(
            "No data available to export. Please generate a report first.",
            "warning"
        );

        return;

    }


    try {

        const wb =
            XLSX.utils.table_to_book(
                table,
                {
                    sheet: "Report"
                }
            );


        const dateStr =
            new Date()
                .toISOString()
                .split("T")[0];


        const fileName =
            `RVRG_Report_${dateStr}.xlsx`;


        XLSX.writeFile(
            wb,
            fileName
        );


        showAlert(
            "Report downloaded successfully!",
            "success"
        );

    }
    catch (error) {

        console.error(
            "Export error:",
            error
        );


        showAlert(
            "Failed to export report.",
            "error"
        );

    }

}
