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


// Load materials first
await loadMaterials();

// Create first material row automatically
addRow();

    // Event Listeners
    document.getElementById('btnAddRow').addEventListener('click', () => addRow());
    document.getElementById('transportationCost').addEventListener('input', calculateGrandTotal);
    document.getElementById('roundOff').addEventListener('input',calculateGrandTotal);
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
    category,
    brand,
    item_type,
    item_size,
    specification,
    unit,
    unit_cost,
    gst_type,
    gst_percentage,
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

// ====================================================
// DYNAMIC ROWS & CALCULATIONS
// SEARCHABLE MATERIAL SELECTION
// ====================================================

function addRow(prefillData = null) {

    rowCount++;


    const currentRow =
        rowCount;


    const tbody =
        document.getElementById(
            'stockEntryItems'
        );


    const tr =
        document.createElement('tr');


    tr.id =
        `row-${currentRow}`;


    // ==================================================
    // BUILD MATERIAL OPTIONS
    // ==================================================

    let optionsHtml =
        '<option value="" selected disabled>Select Material...</option>';


    materialsData.forEach(
        mat => {

            const details = [

                mat.material_code,
                mat.material_name,
                mat.brand,
                mat.item_type,
                mat.item_size,
                mat.specification

            ]
            .filter(
                value =>
                    String(
                        value ?? ""
                    ).trim() !== ""
            )
            .join(" | ");


            optionsHtml += `

                <option
                    value="${mat.id}"
                    data-search="${escapeHtml(
                        [
                            mat.material_code,
                            mat.material_name,
                            mat.brand
                        ]
                        .filter(
                            value =>
                                String(
                                    value ?? ""
                                ).trim() !== ""
                        )
                        .join(" ")
                    )}"
                >
                    ${escapeHtml(details)}
                </option>

            `;

        }
    );


    // ==================================================
    // CREATE ROW
    // ==================================================

    tr.innerHTML = `

        <td class="align-middle fw-bold text-muted">
            ${currentRow}
        </td>


        <td>

            <!-- MATERIAL SEARCH -->

            <input
                type="text"
                class="form-control form-control-sm mb-1 material-search"
                id="material-search-${currentRow}"
                placeholder="Search code / material / brand..."
                autocomplete="off"
            >


            <!-- MATERIAL SELECT -->

            <select
                class="form-select form-select-sm item-select"
                required
                id="material-${currentRow}"
            >

                ${optionsHtml}

            </select>

        </td>


        <td>

            <input
                type="number"
                class="form-control form-control-sm item-row-input mx-auto qty-input"
                required
                min="1"
                id="qty-${currentRow}"
                oninput="calculateRowTotal(${currentRow})"
            >

        </td>


        <td
            class="align-middle text-center fw-bold"
            id="unit-${currentRow}"
        >
            -
        </td>


        <td>

            <input
                type="number"
                step="0.01"
                class="form-control form-control-sm item-row-input mx-auto price-input"
                required
                min="0"
                id="price-${currentRow}"
                oninput="calculateRowTotal(${currentRow})"
                onkeydown="handleEnterKey(event, ${currentRow})"
            >

        </td>

<td class="align-middle">

    <div
        class="fw-bold gst-amount"
        id="gst-amount-${currentRow}"
    >
        ₹ 0.00
    </div>


    <input
        type="number"
        step="0.01"
        class="form-control form-control-sm gst-input mt-1 mx-auto"
        id="gst-${currentRow}"
value="18"
        min="0"
        max="100"
        style="max-width:75px; font-size:11px;"
        title="GST Percentage"
        oninput="calculateRowTotal(${currentRow})"
        onkeydown="handleEnterKey(event, ${currentRow})"
    >

</td>

        <td
            class="align-middle fw-bold row-total"
            id="total-${currentRow}"
            data-value="0"
        >
            ₹ 0.00
        </td>


        <td class="align-middle">

            <button
                type="button"
                class="btn btn-sm btn-outline-danger"
                onclick="removeRow(${currentRow})"
                title="Remove"
            >

                <i class="fa-solid fa-trash"></i>

            </button>

        </td>

    `;


    tbody.appendChild(tr);


    // ==================================================
    // MATERIAL SELECT CHANGE
    // ==================================================

    const materialSelect =
        document.getElementById(
            `material-${currentRow}`
        );


    materialSelect.addEventListener(
        "change",
        function () {

            const material =
                materialsData.find(
                    m =>
                        m.id == this.value
                );


            document.getElementById(
                `unit-${currentRow}`
            ).innerText =
                material?.unit || "-";


            // Put selected material name in search box
            // so the user can clearly see what was selected.

            if (material) {

                document.getElementById(
                    `material-search-${currentRow}`
                ).value =
                    [
                        material.material_code,
                        material.material_name,
                        material.brand
                    ]
                    .filter(
                        value =>
                            String(
                                value ?? ""
                            ).trim() !== ""
                    )
                    .join(" | ");

            }

        }
    );


    // ==================================================
    // MATERIAL SEARCH
    // ==================================================

    const materialSearch =
        document.getElementById(
            `material-search-${currentRow}`
        );


    materialSearch.addEventListener(
        "input",
        function () {

            filterMaterialOptions(
                currentRow,
                this.value
            );

        }
    );


    // ==================================================
    // EXCEL PREFILL
    // ==================================================

    if (prefillData) {

        const matMatch =
            materialsData.find(
                m =>
                    m.id ==
                    prefillData.Material_ID
            );


        if (matMatch) {

            materialSelect.value =
                matMatch.id;


            materialSelect.dispatchEvent(
                new Event("change")
            );

        }


        document.getElementById(
            `qty-${currentRow}`
        ).value =
            prefillData.Quantity || 0;


        document.getElementById(
            `price-${currentRow}`
        ).value =
            prefillData.Unit_Price || 0;


        calculateRowTotal(
            currentRow
        );

    }

}


// ====================================================
// FILTER MATERIAL OPTIONS
// SEARCH BY:
// MATERIAL CODE
// MATERIAL NAME
// BRAND
// ====================================================

function filterMaterialOptions(
    rowId,
    searchText
) {

    const select =
        document.getElementById(
            `material-${rowId}`
        );


    if (!select) {
        return;
    }


    const search =
        String(
            searchText || ""
        )
        .trim()
        .toLowerCase();


    const options =
        select.querySelectorAll(
            "option"
        );


    options.forEach(
        option => {

            // Keep placeholder visible

            if (!option.value) {

                option.style.display =
                    "";

                return;

            }


            const searchableText =
                String(
                    option.dataset.search || ""
                )
                .toLowerCase();


            if (
                !search ||
                searchableText.includes(
                    search
                )
            ) {

                option.style.display =
                    "";

            }
            else {

                option.style.display =
                    "none";

            }

        }
    );


    // ------------------------------------------------
    // If current selected material no longer matches,
    // clear the selection.
    // ------------------------------------------------

    const selectedOption =
        select.options[
            select.selectedIndex
        ];


    if (
        selectedOption &&
        selectedOption.value
    ) {

        const selectedSearch =
            String(
                selectedOption.dataset.search || ""
            )
            .toLowerCase();


        if (
            search &&
            !selectedSearch.includes(
                search
            )
        ) {

            select.value =
                "";

            document.getElementById(
                `unit-${rowId}`
            ).innerText =
                "-";

        }

    }

}

// ====================================================
// DYNAMIC ROWS
// SINGLE-LINE SEARCHABLE MATERIAL FIELD
// ====================================================

function addRow(prefillData = null) {

    rowCount++;

    const currentRow =
        rowCount;

    const tbody =
        document.getElementById(
            "stockEntryItems"
        );

    const tr =
        document.createElement("tr");

    tr.id =
        `row-${currentRow}`;


    // ==================================================
    // ROW HTML
    // ==================================================

    tr.innerHTML = `

        <td class="align-middle fw-bold text-muted">
            ${currentRow}
        </td>


       <td
    style="
        position:relative;
        min-width:320px;
        z-index:100;
    "
>

            <input
                type="text"
                class="form-control form-control-sm material-search"
                id="material-search-${currentRow}"
                placeholder="Search code / material / brand..."
                autocomplete="off"
                required
            >


            <!-- Hidden actual material ID -->

            <input
                type="hidden"
                id="material-${currentRow}"
                class="item-select"
            >


            <!-- Search Results -->

            <div
                id="material-results-${currentRow}"
                class="material-search-results"
                style="
                    display:none;
                    position:absolute;
                    left:0;
                    right:0;
                    top:100%;
                    z-index:1050;
                    background:#fff;
                    border:1px solid #ced4da;
                    border-radius:0 0 4px 4px;
                    max-height:260px;
                    overflow-y:auto;
                    box-shadow:0 4px 10px rgba(0,0,0,0.12);
                "
            >
            </div>

        </td>


        <td>

            <input
                type="number"
                class="form-control form-control-sm item-row-input mx-auto qty-input"
                required
                min="1"
                id="qty-${currentRow}"
                oninput="calculateRowTotal(${currentRow})"
            >

        </td>


        <td
            class="align-middle text-center fw-bold"
            id="unit-${currentRow}"
        >
            -
        </td>


        <td>

            <input
                type="number"
                step="0.01"
                class="form-control form-control-sm item-row-input mx-auto price-input"
                required
                min="0"
                id="price-${currentRow}"
                oninput="calculateRowTotal(${currentRow})"
                onkeydown="handleEnterKey(event, ${currentRow})"
            >

        </td>


        <td class="align-middle">

    <!-- Calculated GST Amount -->

    <div
        class="fw-bold gst-amount"
        id="gst-amount-${currentRow}"
    >
        ₹ 0.00
    </div>


    <!-- Manual GST Percentage -->

    <input
        type="number"
        step="0.01"
        class="form-control form-control-sm gst-input mt-1 mx-auto"
        id="gst-${currentRow}"
        value="18"
        min="0"
        max="100"
        style="max-width:75px; font-size:11px;"
        title="GST Percentage"
        oninput="calculateRowTotal(${currentRow})"
        onkeydown="handleEnterKey(event, ${currentRow})"
    >

</td>


        <td
            class="align-middle fw-bold row-total"
            id="total-${currentRow}"
            data-value="0"
        >
            ₹ 0.00
        </td>


        <td class="align-middle">

            <button
                type="button"
                class="btn btn-sm btn-outline-danger"
                onclick="removeRow(${currentRow})"
                title="Remove"
            >

                <i class="fa-solid fa-trash"></i>

            </button>

        </td>

    `;


    tbody.appendChild(tr);


    // ==================================================
    // SEARCH INPUT
    // ==================================================

    const searchInput =
        document.getElementById(
            `material-search-${currentRow}`
        );


    searchInput.addEventListener(
        "input",
        function () {

            searchMaterials(
                currentRow,
                this.value
            );

        }
    );


    // ==================================================
    // CLOSE RESULTS WHEN CLICKING OUTSIDE
    // ==================================================

    document.addEventListener(
        "click",
        function(event) {

            const results =
                document.getElementById(
                    `material-results-${currentRow}`
                );


            if (!results)
                return;


            if (
                !searchInput.contains(
                    event.target
                ) &&
                !results.contains(
                    event.target
                )
            ) {

                results.style.display =
                    "none";

            }

        }
    );


    // ==================================================
    // EXCEL PREFILL
    // ==================================================

    if (prefillData) {

        const matMatch =
            materialsData.find(
                m =>
                    m.id ==
                    prefillData.Material_ID
            );


        if (matMatch) {

            selectMaterial(
                currentRow,
                matMatch
            );

        }


        document.getElementById(
            `qty-${currentRow}`
        ).value =
            prefillData.Quantity || 0;


        document.getElementById(
            `price-${currentRow}`
        ).value =
            prefillData.Unit_Price || 0;


        calculateRowTotal(
            currentRow
        );

    }

}


// ====================================================
// SEARCH MATERIAL
// DROPDOWN ESCAPES TABLE OVERFLOW
// SHOW 5 RESULTS AT A TIME
// SEARCH BY CODE + NAME + BRAND
// ====================================================

function searchMaterials(
    rowId,
    searchText
) {

    const results =
        document.getElementById(
            `material-results-${rowId}`
        );

    const searchInput =
        document.getElementById(
            `material-search-${rowId}`
        );


    if (!results || !searchInput) {
        return;
    }


    const search =
        String(
            searchText || ""
        )
        .trim()
        .toLowerCase();


    // ==================================================
    // NOTHING TYPED
    // ==================================================

    if (!search) {

        results.innerHTML = "";

        results.style.display =
            "none";

        return;

    }


    // ==================================================
    // FIND MATCHING MATERIALS
    // ==================================================

    const matches =
        materialsData
            .filter(
                material => {

                    const code =
                        String(
                            material.material_code || ""
                        )
                        .toLowerCase();


                    const name =
                        String(
                            material.material_name || ""
                        )
                        .toLowerCase();


                    const brand =
                        String(
                            material.brand || ""
                        )
                        .toLowerCase();


                    return (

                        code.includes(search)

                        ||

                        name.includes(search)

                        ||

                        brand.includes(search)

                    );

                }
            )
            .slice(0, 50);


    // ==================================================
    // NO MATCH
    // ==================================================

    if (
        matches.length === 0
    ) {

        results.innerHTML = `

            <div
                style="
                    padding:9px 12px;
                    background:#fff;
                    color:#6c757d;
                    font-size:13px;
                "
            >
                No matching material found.
            </div>

        `;

        results.style.display =
            "block";

    }
    else {

        // Clear old results

        results.innerHTML = "";


        // ==================================================
        // MOVE DROPDOWN TO BODY
        // THIS PREVENTS TABLE OVERFLOW FROM CLIPPING IT
        // ==================================================

        if (
            results.parentElement !==
            document.body
        ) {

            document.body.appendChild(
                results
            );

        }


        // ==================================================
        // FIXED POSITION
        // ==================================================

        const rect =
            searchInput.getBoundingClientRect();


        results.style.position =
            "fixed";


        results.style.left =
            `${rect.left}px`;


        results.style.top =
            `${rect.bottom + 2}px`;


        results.style.width =
            `${rect.width}px`;


        results.style.minWidth =
            `${rect.width}px`;


        results.style.maxHeight =
            "180px";


        results.style.overflowY =
            "auto";


        results.style.overflowX =
            "hidden";


        results.style.background =
            "#ffffff";


        results.style.border =
            "1px solid #ced4da";


        results.style.borderRadius =
            "4px";


        results.style.boxShadow =
            "0 4px 12px rgba(0,0,0,0.18)";


        results.style.zIndex =
            "2147483647";


        results.style.display =
            "block";


        // ==================================================
        // CREATE RESULT ITEMS
        // ==================================================

matches.forEach(
    material => {

        const option =
            document.createElement(
                "div"
            );


        option.className =
            "material-search-option";


        option.style.display =
            "block";


        option.style.width =
            "100%";


        option.style.boxSizing =
            "border-box";


        option.style.padding =
            "8px 12px";


        option.style.background =
            "#ffffff";


        option.style.color =
            "#212529";


        option.style.fontSize =
            "13px";


        option.style.lineHeight =
            "1.35";


        option.style.cursor =
            "pointer";


        option.style.borderBottom =
            "1px solid #eeeeee";


        // ==================================================
        // BUILD SAME DETAILS STYLE AS CURRENT STOCK
        // ==================================================

        const materialDetails = [

            `Category: ${
                material.category || "-"
            }`,

            `Brand: ${
                material.brand || "-"
            }`,

            `Type: ${
                material.item_type || "-"
            }`,

            `Size: ${
                material.item_size || "-"
            }`,

            `Specification: ${
                material.specification || "-"
            }`

        ].join(" | ");


        option.innerHTML = `

            <div
                style="
                    font-weight:600;
                    color:#212529;
                    margin-bottom:3px;
                "
            >
                ${escapeHtml(
                    material.material_code || "-"
                )}
                |
                ${escapeHtml(
                    material.material_name || "-"
                )}
            </div>


            <div
                style="
                    font-size:11px;
                    color:#6c757d;
                    white-space:normal;
                    line-height:1.35;
                "
            >
                ${escapeHtml(
                    materialDetails
                )}
            </div>

        `;


        // ==================================================
        // HOVER
        // ==================================================

        option.addEventListener(
            "mouseenter",
            function() {

                this.style.background =
                    "#f1f7ff";

            }
        );


        option.addEventListener(
            "mouseleave",
            function() {

                this.style.background =
                    "#ffffff";

            }
        );


        // ==================================================
        // SELECT MATERIAL
        // ==================================================

        option.addEventListener(
            "click",
            function() {

                selectMaterial(
                    rowId,
                    material
                );

            }
        );


        results.appendChild(
            option
        );

    }
);
    }

    // ==================================================
    // POSITION AGAIN
    // ==================================================

    const rect =
        searchInput.getBoundingClientRect();


    let top =
        rect.bottom + 2;


    // If there isn't enough space below,
    // show the list above the search field.

    if (
        top + 180 >
        window.innerHeight
    ) {

        top =
            rect.top - 182;

    }


    results.style.left =
        `${rect.left}px`;


    results.style.top =
        `${top}px`;


    results.style.width =
        `${rect.width}px`;


    results.style.maxHeight =
        "180px";


    results.style.display =
        "block";

}


// ====================================================
// SELECT MATERIAL
// ====================================================

function selectMaterial(
    rowId,
    material
) {

    if (!material)
        return;


    // Actual material ID

    document.getElementById(
        `material-${rowId}`
    ).value =
        material.id;


    // Display text

    document.getElementById(
        `material-search-${rowId}`
    ).value =
        [

            material.material_code,
            material.material_name,
            material.brand

        ]
        .filter(
            value =>
                String(
                    value ?? ""
                ).trim() !== ""
        )
        .join(" | ");


    // Unit

    document.getElementById(
        `unit-${rowId}`
    ).innerText =
        material.unit || "-";


    // Hide results

    const results =
        document.getElementById(
            `material-results-${rowId}`
        );


    if (results) {

        results.innerHTML =
            "";

        results.style.display =
            "none";

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

    const qty =
        parseFloat(
            document.getElementById(
                `qty-${id}`
            ).value
        ) || 0;


    const price =
        parseFloat(
            document.getElementById(
                `price-${id}`
            ).value
        ) || 0;


    const gstPercentage =
        parseFloat(
            document.getElementById(
                `gst-${id}`
            ).value
        ) || 0;


    // --------------------------------------------
    // ITEM VALUE
    // --------------------------------------------

    const itemValue =
        qty * price;


    // --------------------------------------------
    // GST AMOUNT
    // --------------------------------------------

    const gstAmount =
        itemValue *
        gstPercentage /
        100;


    // --------------------------------------------
    // TOTAL = ITEM + GST
    // --------------------------------------------

    const total =
        itemValue +
        gstAmount;


    // --------------------------------------------
    // SHOW GST AMOUNT
    // --------------------------------------------

    const gstAmountCell =
        document.getElementById(
            `gst-amount-${id}`
        );


    if (gstAmountCell) {

        gstAmountCell.innerText =
            formatCurrency(
                gstAmount
            );

    }


    // --------------------------------------------
    // SHOW FINAL TOTAL
    // --------------------------------------------

    const totalCell =
        document.getElementById(
            `total-${id}`
        );


    totalCell.dataset.value =
        total;


    totalCell.innerText =
        formatCurrency(
            total
        );


    // --------------------------------------------
    // UPDATE GRAND TOTAL
    // --------------------------------------------

    calculateGrandTotal();

}

function calculateGrandTotal(){

    // --------------------------------------------
    // ITEM TOTAL
    // ITEMS + INDIVIDUAL GST
    // --------------------------------------------

    let itemTotal = 0;

    document
        .querySelectorAll(".row-total")
        .forEach(td => {

            itemTotal +=
                parseFloat(
                    td.dataset.value
                ) || 0;

        });


    // --------------------------------------------
    // TRANSPORTATION FEES
    // --------------------------------------------

    const transport =
        parseFloat(
            document.getElementById(
                "transportationCost"
            ).value
        ) || 0;


    // --------------------------------------------
    // ROUND OFF
    // CAN BE POSITIVE OR NEGATIVE
    // --------------------------------------------

    const roundOff =
        parseFloat(
            document.getElementById(
                "roundOff"
            ).value
        ) || 0;


    // --------------------------------------------
    // FINAL TOTAL
    // --------------------------------------------

    const grandTotal =
        itemTotal +
        transport +
        roundOff;


    // --------------------------------------------
    // DISPLAY ITEM SUBTOTAL
    // --------------------------------------------

    const itemSubtotalDisplay =
        document.getElementById(
            "itemSubtotalDisplay"
        );

    if(itemSubtotalDisplay){

        itemSubtotalDisplay.innerText =
            formatCurrency(
                itemTotal
            );

    }


    // --------------------------------------------
    // DISPLAY FINAL TOTAL
    // --------------------------------------------

    const totalDisplay =
        document.getElementById(
            "calculatedTotalDisplay"
        );


    if(totalDisplay){

        totalDisplay.dataset.value =
            grandTotal;

        totalDisplay.innerText =
            formatCurrency(
                grandTotal
            );

    }

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
   const differenceInPaise =
    Math.round(
        (billedAmount - calculatedTotal) * 100
    );

if (differenceInPaise !== 0) {
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

const vendorName =
    document
        .getElementById("vendorName")
        .value
        .trim();

const vendorNumber =
    document
        .getElementById("vendorNumber")
        .value
        .trim();

const invoiceNo =
    document
        .getElementById("invoiceNo")
        .value
        .trim();

const invoiceDate =
    document
        .getElementById("invoiceDate")
        .value;
    const transportCost = parseFloat(document.getElementById('transportationCost').value) || 0;
    const roundOff =
    parseFloat(
        document.getElementById(
            'roundOff'
        ).value
    ) || 0;
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

supplier_name:
    vendorName,

supplier_number:
    vendorNumber,

transport_cost:
    transportCost,

round_off:
    roundOff,

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

const basicAmount =
    qty * price;


// --------------------------------------------
// GST CALCULATION
// --------------------------------------------

const gstAmount =
    basicAmount *
    gstPercentage /
    100;


// --------------------------------------------
// FINAL LINE TOTAL
// BASIC + GST
// --------------------------------------------

const lineTotal =
    basicAmount +
    gstAmount;


detailsArray.push({
    stock_entry_id: entryId,
    material_id: Number(materialId),
    quantity: qty,
    purchase_price: price,
    gst_type: "EXCLUDED",
    gst_percentage: gstPercentage,
    line_total: Number(
        lineTotal.toFixed(2)
    )
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
