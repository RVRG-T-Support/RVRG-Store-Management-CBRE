// reports.js
// Protect page
const currentUser = getCurrentUser();

if (!currentUser)
    window.location.replace("index.html");

document.addEventListener('DOMContentLoaded', () => {
    // 1. Security Check: All authenticated roles can view reports
    const hasAccess = checkUserAccess(['ADMIN', 'FM', 'AFM', 'STORE', 'TECH_SUPERVISOR']);
    if (!hasAccess) return;
    
const user = getCurrentUser();
// User information is handled by navigation.js

// 2. Master User Check: Enable Download Export for ADMIN only
    if (user.role === 'ADMIN') {
        document.getElementById('btnExportReport').classList.remove('d-none');
    }

    // 3. Set default dates (From: 1st of month, To: Today)
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    
    document.getElementById('filterFromDate').value = firstDay.toISOString().split('T')[0];
    document.getElementById('filterToDate').value = today.toISOString().split('T')[0];

    // 4. Event Listeners
    document.getElementById('reportFilterForm').addEventListener('submit', generateReport);
    document.getElementById('btnExportReport').addEventListener('click', exportToExcel);
});

// --- REPORT GENERATION LOGIC ---

async function generateReport(e) {
    e.preventDefault();

    const fromDate = document.getElementById('filterFromDate').value;
    const toDate = document.getElementById('filterToDate').value;
    const departmentName = document.getElementById('filterDepartment').value;
    const recordType = document.getElementById('filterRecordType').value;
    const areaType = document.getElementById('filterAreaType').value;

    // Adjust 'To Date' to include the full day
    const toDateEndOfDay = new Date(toDate);
    toDateEndOfDay.setHours(23, 59, 59, 999);

    const tableBody = document.getElementById('reportTableBody');
    tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4"><div class="spinner-border text-primary" role="status"></div><br>Fetching data...</td></tr>';
    document.getElementById('reportTableFooter').style.display = 'none';

    try {
        let reportData = [];

        if (recordType === 'CONSUMPTION') {
            reportData = await fetchConsumptionData(fromDate, toDateEndOfDay.toISOString(), departmentName, areaType);
        } else if (recordType === 'PURCHASE') {
            reportData = await fetchPurchaseData(fromDate, toDateEndOfDay.toISOString(), departmentName);
        }

        renderReportTable(reportData, recordType);

    } catch (error) {
        console.error("Error generating report:", error.message);
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-danger py-4">Error generating report. Please try again.</td></tr>';
        showAlert("Failed to load report data.", "error");
    }
}

// --- DATA FETCHING FUNCTIONS ---

async function fetchConsumptionData(fromDate, toDate, departmentName, areaType) {

    let query = supabase
        .from("material_issue_register")
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
        .gte("issued_date", fromDate)
        .lte("issued_date", toDate)
        .order("issued_date", { ascending: false });

    const { data, error } = await query;

    if (error) throw error;

    let filtered = data;

    if (departmentName !== "ALL") {
        filtered = filtered.filter(
            x => x.materials?.departments?.department_name === departmentName
        );
    }

    if (areaType !== "ALL") {
        filtered = filtered.filter(
            x => x.location_type === areaType
        );
    }

    return filtered.map(row => ({
        date: row.issued_date,
        reference: row.ticket_no,
        material: row.materials?.material_name || "-",
        department: row.materials?.departments?.department_name || "-",
        area: row.location_type,
        quantity: row.issued_qty,
        value: Number(row.issued_qty) * Number(row.unit_cost)
    }));

}

async function fetchPurchaseData(fromDate, toDate, departmentName) {

    let query = supabase
        .from("stock_entry_details")
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
        .gte("stock_entry_header.invoice_date", fromDate)
        .lte("stock_entry_header.invoice_date", toDate)
        .order("invoice_date", {
            foreignTable: "stock_entry_header",
            ascending: false
        });

    const { data, error } = await query;

    if (error) throw error;

    let filtered = data;

    if (departmentName !== "ALL") {
        filtered = filtered.filter(
            x => x.materials?.departments?.department_name === departmentName
        );
    }

    return filtered.map(row => ({
        date: row.stock_entry_header.invoice_date,
        reference: row.stock_entry_header.invoice_no,
        material: row.materials?.material_name || "-",
        department: row.materials?.departments?.department_name || "-",
        area: "Stock Purchase",
        quantity: row.quantity,
        value: Number(row.line_total || 0)
    }));

}

// --- RENDERING LOGIC ---

function renderReportTable(data, recordType) {
    const tableBody = document.getElementById('reportTableBody');
    const tableFooter = document.getElementById('reportTableFooter');
    
    if (data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-5">No records found for the selected filters.</td></tr>';
        tableFooter.style.display = 'none';
        return;
    }

    tableBody.innerHTML = '';
    let totalQty = 0;
    let totalVal = 0;

    data.forEach(row => {
        totalQty += row.quantity;
        totalVal += row.value;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDate(row.date)}</td>
            <td class="fw-bold">${row.reference}</td>
            <td>${row.material}</td>
            <td>${row.department}</td>
            <td><small>${row.area}</small></td>
            <td class="fw-bold">${row.quantity}</td>
            <td>${formatCurrency(row.value)}</td>
        `;
        tableBody.appendChild(tr);
    });

    // Update Totals
    document.getElementById('totalQuantity').innerText = totalQty;
    document.getElementById('totalValue').innerText = formatCurrency(totalVal);
    tableFooter.style.display = 'table-footer-group';
}

// --- EXPORT TO EXCEL LOGIC ---

function exportToExcel() {
    const table = document.querySelector('table');
    
    // Check if table has data (exclude the empty state message)
    if (table.rows.length <= 2 || table.rows[1].cells[0].innerText.includes("Select filters")) {
        showAlert("No data available to export. Please generate a report first.", "warning");
        return;
    }

    try {
        // Use SheetJS to parse the HTML table directly into a workbook
        const wb = XLSX.utils.table_to_book(table, {sheet: "Report"});
        
        // Generate file name with current date
        const dateStr = new Date().toISOString().split('T')[0];
        const fileName = `RVRG_Report_${dateStr}.xlsx`;
        
        // Trigger download
        XLSX.writeFile(wb, fileName);
        showAlert("Report downloaded successfully!", "success");
    } catch (error) {
        console.error("Export error:", error);
        showAlert("Failed to export report.", "error");
    }
}
