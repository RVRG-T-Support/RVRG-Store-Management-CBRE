// stock_entry.js
// Protect page
const currentUser = getCurrentUser();

if (!currentUser)
    window.location.replace("index.html");

let materialsData = [];
let rowCount = 0;
let confirmModalInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
    const hasAccess = checkUserAccess(['ADMIN', 'FM', 'AFM', 'STORE']);
    if (!hasAccess) return;

    // User information is handled by navigation.js
    confirmModalInstance = new bootstrap.Modal(document.getElementById('confirmStockModal'));
    document.getElementById('invoiceDate').value = new Date().toISOString().split('T')[0];

    await loadMaterials();
    addRow(); // Add one blank row by default

    // Event Listeners
    document.getElementById('btnAddRow').addEventListener('click', () => addRow());
    document.getElementById('transportationCost').addEventListener('input', calculateGrandTotal);
    document.getElementById('stockEntryForm').addEventListener('submit', openConfirmationModal);
    document.getElementById('btnConfirmSave').addEventListener('click', saveStockEntry);
    
    // Excel Import/Export Listeners
    document.getElementById('btnDownloadTemplate').addEventListener('click', downloadExcelTemplate);
    document.getElementById('btnProcessExcel').addEventListener('click', processExcelUpload);
});

// --- DATA LOADING ---
async function loadMaterials() {
    try {
        const { data, error } = await supabase
    .from("materials")
    .select(`
        id,
        material_name,
        material_code,
        unit,
        department_id,
        departments(
            department_name
        )
    `)
    .order("material_name", { ascending: true });
            
        if (error) throw error;
        
        if (!data || data.length === 0) {
            showAlert("No materials found in database. Please add materials in Master Data first.", "warning");
        }
        
        materialsData = data;
    } catch (error) {
        console.error("Supabase Error Loading Materials:", error.message);
        showAlert(`Database Error: ${error.message}. Please check Supabase Table settings.`, "error");
    }
}

// --- DYNAMIC ROWS & CALCULATIONS ---
function addRow(prefillData = null) {
    rowCount++;
    const tbody = document.getElementById('stockEntryItems');
    const tr = document.createElement('tr');
    tr.id = `row-${rowCount}`;

    let optionsHtml = '<option value="" selected disabled>Select Material...</option>';
    materialsData.forEach(mat => {
        const deptName =
    mat.departments?.department_name || "-";

optionsHtml +=
`<option value="${mat.id}">
${deptName} - ${mat.material_name}
</option>`;
    });

    tr.innerHTML = `
        <td class="align-middle fw-bold text-muted">${rowCount}</td>
        <td>
            <select class="form-select form-select-sm item-select" required id="material-${rowCount}">
                ${optionsHtml}
            </select>
        </td>
        <td>
    <input type="number"
           class="form-control form-control-sm item-row-input mx-auto qty-input"
           required
           min="1"
           id="qty-${rowCount}"
           oninput="calculateRowTotal(${rowCount})">
</td>

<td class="align-middle text-center fw-bold"
    id="unit-${rowCount}">
-
</td>

<td>
    <input type="number"
           step="0.01"
           class="form-control form-control-sm item-row-input mx-auto price-input"
           required
           min="0"
           id="price-${rowCount}"
           oninput="calculateRowTotal(${rowCount})"
           onkeydown="handleEnterKey(event, ${rowCount})">
</td>
        <td class="align-middle fw-bold row-total" id="total-${rowCount}" data-value="0">₹ 0.00</td>
        <td class="align-middle">
            <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeRow(${rowCount})" title="Remove">
                <i class="fa-solid fa-trash"></i>
            </button>
        </td>
    `;
    tbody.appendChild(tr);
    document
    .getElementById(`material-${rowCount}`)
    .addEventListener("change", function () {

        const material = materialsData.find(
            m => m.id == this.value
        );

        document.getElementById(`unit-${rowCount}`).innerText =
            material?.unit || "-";

    });

    // If Excel data is passed in, auto-fill the row
    if (prefillData) {
        // Try to match by Material_ID exactly
        const matMatch = materialsData.find(m => m.id == prefillData.Material_ID);
        if (matMatch) {
            document.getElementById(`material-${rowCount}`).value = matMatch.id;
            document.getElementById(`unit-${rowCount}`).innerText =
matMatch.unit || "-";
        }
        document.getElementById(`qty-${rowCount}`).value = prefillData.Quantity || 0;
        document.getElementById(`price-${rowCount}`).value = prefillData.Unit_Price || 0;
        calculateRowTotal(rowCount);
    }
}

function removeRow(id) {
    const row = document.getElementById(`row-${id}`);
    if (row) {
        row.remove();
        calculateGrandTotal();
    }
}

function handleEnterKey(event, currentId) {
    if (event.key === 'Enter') {
        event.preventDefault();
        addRow();
        setTimeout(() => document.getElementById(`material-${rowCount}`).focus(), 50);
    }
}

function calculateRowTotal(id) {
    const qty = parseFloat(document.getElementById(`qty-${id}`).value) || 0;
    const price = parseFloat(document.getElementById(`price-${id}`).value) || 0;
    const total = qty * price;
    
    document.getElementById(`total-${id}`).dataset.value = total;
    document.getElementById(`total-${id}`).innerText = formatCurrency(total);
    calculateGrandTotal();
}

function calculateGrandTotal() {
    let itemTotal = 0;
    document.querySelectorAll('.row-total').forEach(td => {
        itemTotal += parseFloat(td.dataset.value) || 0;
    });
    const transport = parseFloat(document.getElementById('transportationCost').value) || 0;
    const grandTotal = itemTotal + transport;
    document.getElementById('calculatedTotalDisplay').dataset.value = grandTotal;
    document.getElementById('calculatedTotalDisplay').innerText = formatCurrency(grandTotal);
}

// --- EXCEL BULK UPLOAD LOGIC ---
function downloadExcelTemplate() {
    try {
        const templateData = [
            {"Material_ID": "MAT-001", "Quantity": 10, "Unit_Price": 150.50}
        ];
        // Create a new workbook and worksheet
        const ws = XLSX.utils.json_to_sheet(templateData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Stock_Entry");
        // Trigger download
        XLSX.writeFile(wb, "RVRG_Stock_Entry_Template.xlsx");
    } catch (err) {
        console.error("Excel Export Error:", err);
        showAlert("Failed to download template. Ensure SheetJS library is loaded.", "error");
    }
}

function processExcelUpload() {
    const fileInput = document.getElementById('excelUpload');
    const file = fileInput.files[0];
    if (!file) {
        showAlert("Please select an Excel file first.", "warning");
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = e.target.result;
            const workbook = XLSX.read(data, { type: 'binary' });
            const sheetName = workbook.SheetNames[0];
            const excelRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

            if (excelRows.length === 0) {
                showAlert("The uploaded Excel sheet is empty.", "warning");
                return;
            }

            // Clear existing rows before appending Excel data
            document.getElementById('stockEntryItems').innerHTML = '';
            rowCount = 0;

            excelRows.forEach(row => {
                // Ensure required columns exist
                if (row.Material_ID && row.Quantity !== undefined && row.Unit_Price !== undefined) {
                    addRow({
                        Material_ID: row.Material_ID,
                        Quantity: row.Quantity,
                        Unit_Price: row.Unit_Price
                    });
                }
            });

            showAlert(`${excelRows.length} items imported successfully. Please review.`, "success");
            fileInput.value = ""; // Reset input

        } catch (err) {
            console.error(err);
            showAlert("Failed to parse the Excel file. Please use the provided template format.", "error");
        }
    };
    reader.readAsBinaryString(file);
}

// --- MODAL & VERIFICATION ---
function openConfirmationModal(e) {
    e.preventDefault(); 
    
    const invoiceNo = document.getElementById('invoiceNo').value.trim();
    const billedAmount = parseFloat(document.getElementById('billedAmount').value) || 0;
    if (billedAmount <= 0) {
    showAlert("Please enter the billed invoice amount.", "warning");
    return;
}
    const calculatedTotal = parseFloat(document.getElementById('calculatedTotalDisplay').dataset.value) || 0;
    const itemCount = document.querySelectorAll('.item-select').length;

    if (itemCount === 0) {
        showAlert("Please add at least one material item.", "warning");
        return;
    }

    document.getElementById('modalInvoiceNo').innerText = invoiceNo;
    document.getElementById('modalItemCount').innerText = itemCount;
    document.getElementById('modalBilledAmount').innerText = formatCurrency(billedAmount);
    document.getElementById('modalCalculatedTotal').innerText = formatCurrency(calculatedTotal);
    
    const warningMsg = document.getElementById('mismatchWarning');
    if (Math.abs(billedAmount - calculatedTotal) > 1) {
        warningMsg.classList.remove('d-none');
        document.getElementById('modalCalculatedTotal').classList.replace('text-primary', 'text-danger');
    } else {
        warningMsg.classList.add('d-none');
        document.getElementById('modalCalculatedTotal').classList.replace('text-danger', 'text-primary');
    }
    confirmModalInstance.show();
}

// --- SAVE STOCK ENTRY ---
async function saveStockEntry() {
    const btnConfirm = document.getElementById('btnConfirmSave');
    btnConfirm.disabled = true;
    btnConfirm.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';

    const user = getCurrentUser();
    const invoiceNo = document.getElementById('invoiceNo').value.trim();
    const invoiceDate = document.getElementById('invoiceDate').value;
    const gstType = document.getElementById('gstType').value;
    const transportCost = parseFloat(document.getElementById('transportationCost').value) || 0;
    const totalAmount = parseFloat(document.getElementById('billedAmount').value) || 0;

    try {
        // Generate Stock Entry Number

const currentYear = new Date().getFullYear();

        // Step 1: Insert Header
        const { data: headerData, error: headerError } = await supabase
            .from('stock_entry_header')
            .insert([{

    stock_entry_no: "",

    invoice_no: invoiceNo,

    invoice_date: invoiceDate,

    supplier_name: "N/A",

    transport_cost: transportCost,

    remarks: "",

    created_by: user.id

}])
            .select();

        if (headerError) throw headerError;
        const entryId = headerData[0].id;
        const stockEntryNo =
    `STE-${currentYear}-${String(entryId).padStart(6, "0")}`;

const { error: updateNoError } = await supabase
    .from("stock_entry_header")
    .update({
        stock_entry_no: stockEntryNo
    })
    .eq("id", entryId);

if (updateNoError)
    throw updateNoError;

        // Step 2 & 3: Details and Ledger
        const selectedMaterials = new Set();
        const detailsArray = [];
        const ledgerArray = [];
        const rows = document.querySelectorAll('#stockEntryItems tr');
        
        rows.forEach(row => {
            const rowId = row.id.split('-')[1];
            const materialId = document.getElementById(`material-${rowId}`).value;
            if (!materialId) {
    throw new Error("Please select a material.");
}

if (selectedMaterials.has(materialId)) {
    throw new Error("Duplicate materials are not allowed in one invoice.");
}

selectedMaterials.add(materialId);
            const qty = parseFloat(document.getElementById(`qty-${rowId}`).value);
            const price = parseFloat(document.getElementById(`price-${rowId}`).value);
            if (qty <= 0) {
    throw new Error("Quantity must be greater than zero.");
}

if (price <= 0) {
    throw new Error("Unit Price must be greater than zero.");
}
            const amount = qty * price;

    detailsArray.push({
    stock_entry_id: entryId,
    material_id: Number(materialId),
    quantity: qty,
    purchase_price: price,
    gst_type: "INCLUDED",
    gst_percentage: Number(gstType),
    line_total: amount
});

    ledgerArray.push({
    material_id: Number(materialId),

    transaction_type: "STOCK_IN",

    quantity: qty,

    reference_no: invoiceNo,

    request_id: null,

    remarks: `Invoice ${invoiceNo}`,

    created_by: user.id,

    transaction_date: new Date().toISOString()
});
            
        });

        const { error: detailsError } = await supabase.from('stock_entry_details').insert(detailsArray);
        if (detailsError) throw detailsError;

        const { error: ledgerError } = await supabase.from('stock_ledger').insert(ledgerArray);
        if (ledgerError) throw ledgerError;
    
        confirmModalInstance.hide();
       showAlert(
`Stock Entry Saved Successfully

RVRG Ref No : ${stockEntryNo}

Vendor Invoice : ${invoiceNo}`,
"success");
        
        document.getElementById('stockEntryForm').reset();
        document.getElementById('invoiceDate').value =
        new Date().toISOString().split('T')[0];
        document.getElementById('stockEntryItems').innerHTML = '';
        document.getElementById('calculatedTotalDisplay').innerText = '₹ 0.00';
        document.getElementById('calculatedTotalDisplay').dataset.value = '0';
        rowCount = 0;
        addRow(); 

    } catch (error) {
        console.error("Save Error:", error.message);
        showAlert(error.message, "error");
    } finally {
        btnConfirm.disabled = false;
        btnConfirm.innerHTML = 'Confirm & Save';
    }
}
