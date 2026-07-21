// reports.js

document.addEventListener('DOMContentLoaded', () => {
    // 1. Security Check: All authenticated roles can view reports
    const hasAccess = checkUserAccess(['ADMIN', 'FM', 'AFM', 'STORE', 'TECH_SUPERVISOR']);
    if (!hasAccess) return;

    const user = getCurrentUser();
    document.getElementById('currentUserName').innerText = `${user.name} (${user.role})`;

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
    // Querying material_issue_register joined with requests, materials, and departments
    let query = supabase
        .from('material_issue_register')
        .select(`
            id,
            issued_qty,
            created_at,
            material_requests!inner ( ticket_no, ticket_type, location, departments!inner (name) ),
            materials ( name, price )
        `)
        .gte('created_at', fromDate)
        .lte('created_at', toDate)
        .order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    // Supabase filtering on deeply nested joined tables can be complex, 
    // so we apply the specific department and area filters locally here.
    let filteredData = data;

    if (departmentName !== 'ALL') {
        filteredData = filteredData.filter(item => item.material_requests.departments.name === departmentName);
    }
    
    if (areaType !== 'ALL') {
        filteredData = filteredData.filter(item => item.material_requests.ticket_type === areaType);
    }

    // Map to a standardized format for the table
    return filteredData.map(item => ({
        date: item.created_at,
        reference: item.material_requests.ticket_no,
        material: item.materials.name,
        department: item.material_requests.departments.name,
        area: item.material_requests.ticket_type,
        quantity: item.issued_qty,
        value: item.issued_qty * (item.materials.price || 0)
    }));
}

async function fetchPurchaseData(fromDate, toDate, departmentName) {
    // Querying stock_entry_details joined with header, materials, and departments
    let query = supabase
        .from('stock_entry_details')
        .select(`
            id,
            quantity,
            amount,
            created_at,
            stock_entry_header!inner ( invoice_no ),
            materials!inner ( name, departments!inner (name) )
        `)
        .gte('created_at', fromDate)
        .lte('created_at', toDate)
        .order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    let filteredData = data;

    if (departmentName !== 'ALL') {
        filteredData = filteredData.filter(item => item.materials.departments.name === departmentName);
    }

    // Map to a standardized format for the table
    return filteredData.map(item => ({
        date: item.created_at,
        reference: item.stock_entry_header.invoice_no,
        material: item.materials.name,
        department: item.materials.departments.name,
        area: 'N/A (Stock In)', // Area doesn't apply to purchases
        quantity: item.quantity,
        value: item.amount || 0
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
