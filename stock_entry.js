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

//====================================================
// REFRESH MATERIAL DROPDOWNS
//====================================================

function refreshMaterialDropdowns(){

    document.querySelectorAll('.item-select').forEach(select => {

        const currentValue = select.value;

        let optionsHtml =
            '<option value="" disabled>Select Material...</option>';

        materialsData.forEach(mat => {

            const deptName =
                mat.departments?.department_name || "-";

            optionsHtml += `
                <option value="${mat.id}">
                    ${deptName} - ${mat.material_name}
                </option>
            `;

        });

        select.innerHTML = optionsHtml;

        if(currentValue)
            select.value = currentValue;

    });

}
    // Add one blank row immediately
    addRow();
    // Load materials for the dropdown
    await loadMaterials();

    // Refresh material dropdowns after materials are loaded
    refreshMaterialDropdowns();
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
.from('materials')
.select(`
    id,
    material_name,
    material_code,
    department_id,
    brand,
    item_type,
    item_size,
    specification,
    unit,
    unit_cost,
    departments(
        department_name
    )
`)
.order('material_name', { ascending: true });
            
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
// ====================================================
// HTML ESCAPE HELPER
// ====================================================

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}
// --- DYNAMIC ROWS & CALCULATIONS ---
function addRow(prefillData = null) {
    rowCount++;
    const tbody = document.getElementById('stockEntryItems');
    const tr = document.createElement('tr');
    tr.id = `row-${rowCount}`;

    let optionsHtml =
    '<option value="" selected disabled>Select Material...</option>';

materialsData.forEach(mat => {

    const deptName =
        mat.departments?.department_name || "-";

    const details = [

        mat.material_code,
        mat.material_name,
        mat.brand,
        mat.item_type,
        mat.item_size,
        mat.specification

    ]
    .filter(value =>
        String(value ?? "").trim() !== ""
    )
    .join(" | ");


    optionsHtml += `
        <option value="${mat.id}">
            ${escapeHtml(details)}
        </option>
    `;

});

    tr.innerHTML = `
        <td class="align-middle fw-bold text-muted">${rowCount}</td>
        <td>

    <select
        class="form-select form-select-sm item-select"
        required
        id="material-${rowCount}">

        ${optionsHtml}

    </select>


    <div
        id="materialDetails-${rowCount}"
        class="mt-2 p-2 border rounded bg-light small text-start">

        <span class="text-muted">
            Select a material to view full details.
        </span>

    </div>

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

<td>
    <input type="number"
           step="0.01"
           class="form-control form-control-sm item-row-input mx-auto gst-input"
           id="gst-${rowCount}"
           value="${document.getElementById('gstType').value || 18}"
           min="0"
           max="100"
           oninput="calculateRowTotal(${rowCount})">
</td>
        <td class="align-middle fw-bold row-total" id="total-${rowCount}" data-value="0">₹ 0.00</td>
        <td class="align-middle">
            <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeRow(${rowCount})" title="Remove">
                <i class="fa-solid fa-trash"></i>
            </button>
        </td>
    `;
    tbody.appendChild(tr);
    // ====================================================
// SHOW FULL MATERIAL DETAILS WHEN SELECTED
// ====================================================

document
    .getElementById(`material-${rowCount}`)
    .addEventListener(
        "change",
        function () {

            const material =
                materialsData.find(
                    m =>
                        Number(m.id) ===
                        Number(this.value)
                );


            const detailsBox =
                document.getElementById(
                    `materialDetails-${rowCount}`
                );


            if (!material) {

                detailsBox.innerHTML = `
                    <span class="text-muted">
                        Select a material to view full details.
                    </span>
                `;

                return;

            }


            detailsBox.innerHTML = `

                <div class="fw-bold text-primary mb-1">
                    ${escapeHtml(
                        material.material_code || "-"
                    )}
                    |
                    ${escapeHtml(
                        material.material_name || "-"
                    )}
                </div>


                <div>
                    <strong>Department:</strong>
                    ${escapeHtml(
                        material.departments
                            ?.department_name || "-"
                    )}
                </div>


                <div>
                    <strong>Brand:</strong>
                    ${escapeHtml(
                        material.brand || "-"
                    )}
                </div>


                <div>
                    <strong>Item Type:</strong>
                    ${escapeHtml(
                        material.item_type || "-"
                    )}
                </div>


                <div>
                    <strong>Item Size:</strong>
                    ${escapeHtml(
                        material.item_size || "-"
                    )}
                </div>


                <div>
                    <strong>Specification:</strong>
                    ${escapeHtml(
                        material.specification || "-"
                    )}
                </div>


                <div>
                    <strong>Unit:</strong>
                    ${escapeHtml(
                        material.unit || "-"
                    )}
                </div>


                <div>
                    <strong>Unit Cost:</strong>
                    ₹${Number(
                        material.unit_cost || 0
                    ).toFixed(2)}
                </div>

            `;

        }
    );
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

    const materialSelect =
        document.getElementById(
            `material-${rowCount}`
        );

    materialSelect.value =
        matMatch.id;

    materialSelect.dispatchEvent(
        new Event("change")
    );

}
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

        if (typeof XLSX === "undefined") {
            throw new Error("SheetJS library is not loaded.");
        }


        // Create template rows from current Material Master
        const templateData = materialsData.map(mat => ({

            "Material Code": mat.material_code || "",

            "Material Name": mat.material_name || "",

            "Quantity": "",

            "Unit": mat.unit || "",

            "Unit Price": ""

        }));


        if (templateData.length === 0) {

            showAlert(
                "No materials found. Please add materials in Material Master first.",
                "warning"
            );

            return;
        }


        const ws =
            XLSX.utils.json_to_sheet(templateData);


        // Set column widths

        ws["!cols"] = [
            { wch: 18 },
            { wch: 30 },
            { wch: 12 },
            { wch: 12 },
            { wch: 15 }
        ];


        const wb =
            XLSX.utils.book_new();


        XLSX.utils.book_append_sheet(
            wb,
            ws,
            "Stock_Entry"
        );


        XLSX.writeFile(
            wb,
            "RVRG_Stock_Entry_Template.xlsx"
        );


    } catch (err) {

        console.error(
            "Excel Template Error:",
            err
        );

        showAlert(
            "Failed to download template: " +
            err.message,
            "error"
        );

    }

}

//====================================================
// PROCESS STOCK ENTRY EXCEL
//====================================================

function processExcelUpload() {

    const fileInput =
        document.getElementById("excelUpload");

    const file =
        fileInput.files[0];


    if (!file) {

        showAlert(
            "Please select an Excel file first.",
            "warning"
        );

        return;
    }


    if (typeof XLSX === "undefined") {

        showAlert(
            "SheetJS library is not loaded.",
            "error"
        );

        return;
    }


    const reader =
        new FileReader();


    reader.onload = function (e) {

        try {

            const workbook =
                XLSX.read(
                    e.target.result,
                    { type: "binary" }
                );


            const sheetName =
                workbook.SheetNames[0];


            const sheet =
                workbook.Sheets[sheetName];


            const excelRows =
                XLSX.utils.sheet_to_json(
                    sheet,
                    {
                        defval: ""
                    }
                );


            if (!excelRows.length) {

                showAlert(
                    "The uploaded Excel sheet is empty.",
                    "warning"
                );

                return;
            }


            // Clear existing rows

            document.getElementById(
                "stockEntryItems"
            ).innerHTML = "";

            rowCount = 0;


            let importedCount = 0;

            const errors = [];


            excelRows.forEach((row, index) => {

                const excelLine =
                    index + 2;


                const materialCode =
                    String(
                        row["Material Code"] || ""
                    ).trim();


                const materialName =
                    String(
                        row["Material Name"] || ""
                    ).trim();


                const quantity =
                    parseFloat(
                        row["Quantity"]
                    );


                const unitPrice =
                    parseFloat(
                        row["Unit Price"]
                    );


                // Skip completely blank rows

                if (
                    !materialCode &&
                    !materialName &&
                    !row["Quantity"] &&
                    !row["Unit Price"]
                ) {
                    return;
                }


                // Material Code required

                if (!materialCode) {

                    errors.push(
                        `Excel row ${excelLine}: Material Code is required.`
                    );

                    return;
                }


                // Find material by CODE

                const material =
                    materialsData.find(
                        mat =>
                            String(
                                mat.material_code || ""
                            ).trim().toUpperCase()
                            ===
                            materialCode.toUpperCase()
                    );


                if (!material) {

                    errors.push(
                        `Excel row ${excelLine}: Material Code "${materialCode}" not found in Material Master.`
                    );

                    return;
                }


                // Quantity validation

                if (
                    !Number.isFinite(quantity) ||
                    quantity <= 0
                ) {

                    errors.push(
                        `Excel row ${excelLine}: Quantity must be greater than zero.`
                    );

                    return;
                }


                // Unit Price validation

                if (
                    !Number.isFinite(unitPrice) ||
                    unitPrice <= 0
                ) {

                    errors.push(
                        `Excel row ${excelLine}: Unit Price must be greater than zero.`
                    );

                    return;
                }


                // Check duplicate material

                const alreadyAdded =
                    Array.from(
                        document.querySelectorAll(
                            ".item-select"
                        )
                    ).some(
                        select =>
                            String(select.value)
                            ===
                            String(material.id)
                    );


                if (alreadyAdded) {

                    errors.push(
                        `Excel row ${excelLine}: Material "${materialCode}" is duplicated.`
                    );

                    return;
                }


                // Add row

                addRow({

                    Material_ID: material.id,

                    Quantity: quantity,

                    Unit_Price: unitPrice

                });


                importedCount++;

            });


            if (importedCount === 0) {

                showAlert(
                    errors.length
                        ? errors.join("\n")
                        : "No valid material rows found.",
                    "error"
                );

                return;
            }


            calculateGrandTotal();


            fileInput.value = "";


            if (errors.length) {

                showAlert(
                    `${importedCount} item(s) imported. Some rows were skipped:\n\n${errors.join("\n")}`,
                    "warning"
                );

            } else {

                showAlert(
                    `${importedCount} item(s) imported successfully. Please review before saving.`,
                    "success"
                );

            }


        } catch (err) {

            console.error(
                "Excel Import Error:",
                err
            );

            showAlert(
                "Failed to parse the Excel file. Please use the provided template.",
                "error"
            );

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
const qty =
    parseFloat(document.getElementById(`qty-${rowId}`).value);

const price =
    parseFloat(document.getElementById(`price-${rowId}`).value);

const gstPercentage =
    parseFloat(document.getElementById(`gst-${rowId}`).value) || 0;

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
    gst_percentage: gstPercentage,
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
