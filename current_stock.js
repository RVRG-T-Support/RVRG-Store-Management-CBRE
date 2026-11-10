//====================================================
// RVRG STORE MANAGEMENT
// CURRENT STOCK / INVENTORY
//====================================================

let stockData = [];
let filteredStockData = [];


//====================================================
// PAGE INITIALIZATION
//====================================================

document.addEventListener("DOMContentLoaded", async function () {

    try {

        if (new URLSearchParams(window.location.search).get('status') === 'REORDER') {
            document.getElementById('stockStatus').value = 'REORDER';
        }
        await loadCurrentStock();

        setupStockEvents();

    } catch (error) {

        console.error(
            "Current Stock Initialization Error:",
            error
        );

        showAlert(
            "Failed to initialize Current Stock page.",
            "error"
        );

    }

});


//====================================================
// LOAD CURRENT STOCK
//====================================================

async function loadCurrentStock() {

    const tbody =
        document.getElementById("stockTableBody");

    try {

        tbody.innerHTML = `
            <tr>
                <td colspan="10"
                    class="text-center text-muted py-5">

                    <div class="spinner-border spinner-border-sm text-success me-2"></div>

                    Loading current stock...

                </td>
            </tr>
        `;


        // ------------------------------------------------
        // LOAD STOCK DATA
        // ------------------------------------------------

        const {
            data: stockRows,
            error: stockError
        } = await window.supabaseClient

            .from("current_stock")

            .select(`
                material_id,
                material_code,
                material_name,
                department_name,
                unit,
                unit_cost,
                current_stock,
                minimum_stock
            `)

            .order(
                "material_code",
                {
                    ascending: true
                }
            );


        if (stockError)
            throw stockError;


        // ------------------------------------------------
        // LOAD MATERIAL MASTER DETAILS
        // ------------------------------------------------

        const {
            data: materialRows,
            error: materialError
        } = await window.supabaseClient

            .from("materials")

            .select(`
                id,
                material_code,
                unit_cost,
                category,
                brand,
                item_type,
                item_size,
                specification
            `);


        if (materialError)
            throw materialError;


        // ------------------------------------------------
        // CREATE MATERIAL LOOKUP
        // ------------------------------------------------

        const materialMap = {};
        const materialByCode = {};

        const normalizeCode = code =>
            String(code || "").trim().toUpperCase();

        const positiveCost = value => {
            const cost = Number(value);
            return Number.isFinite(cost) && cost > 0 ? cost : 0;
        };


        (materialRows || []).forEach(
            material => {

                materialMap[
                    String(material.id)
                ] = material;

                const code = normalizeCode(material.material_code);
                if (code) materialByCode[code] = material;

            }
        );


        // ------------------------------------------------
        // MERGE STOCK + MATERIAL DETAILS
        // ------------------------------------------------

        stockData =
            (stockRows || []).map(
                stock => {

                    const details =
                        materialMap[
                            String(
                                stock.material_id
                            )
                        ] || {};


                    // Match the dashboard: prefer the stock cost, then the
                    // Material Master cost by ID, then by material code.
                    const unitCost =
                        positiveCost(stock.unit_cost) ||
                        positiveCost(details.unit_cost) ||
                        positiveCost(
                            materialByCode[normalizeCode(stock.material_code)]?.unit_cost
                        );

                    return {

                        ...stock,

                        unit_cost: unitCost,

                        category:
                            details.category || "",

                        brand:
                            details.brand || "",

                        item_type:
                            details.item_type || "",

                        item_size:
                            details.item_size || "",

                        specification:
                            details.specification || ""

                    };

                }
            );


        await fillMissingStockCosts(stockData);

        filteredStockData =
            [...stockData];


        populateDepartmentFilter();

        applyStockFilters();


    }
    catch (error) {

        console.error(
            "Load Current Stock Error:",
            error
        );


        tbody.innerHTML = `
            <tr>
                <td colspan="10"
                    class="text-center text-danger py-5">

                    <i class="fa-solid fa-circle-exclamation me-2"></i>

                    Failed to load current stock.

                </td>
            </tr>
        `;


        showAlert(
            "Failed to load current stock: " +
            (
                error?.message ||
                String(error)
            ),
            "error"
        );

    }

}

// Stock Entry stores purchase prices separately from Material Master. Use the
// newest recorded entry only when both existing cost sources have no price.
async function fillMissingStockCosts(rows) {
    const missingIds = [...new Set(rows
        .filter(row => !(Number(row.unit_cost) > 0) && row.material_id != null)
        .map(row => row.material_id))];
    const costs = new Map();
    const pageSize = 1000;

    try {
        // Bound URL size and paginate so older purchases are not silently lost.
        for (let start = 0; start < missingIds.length; start += 100) {
            const ids = missingIds.slice(start, start + 100);
            for (let offset = 0; ; offset += pageSize) {
                const { data, error } = await window.supabaseClient
                    .from("stock_entry_details")
                    .select("material_id, purchase_price, stock_entry_id")
                    .in("material_id", ids)
                    .gt("purchase_price", 0)
                    .order("stock_entry_id", { ascending: false })
                    .range(offset, offset + pageSize - 1);
                if (error) throw error;

                for (const entry of data || []) {
                    const id = String(entry.material_id);
                    const cost = Number(entry.purchase_price);
                    if (!costs.has(id) && Number.isFinite(cost) && cost > 0) {
                        costs.set(id, cost);
                    }
                }
                if ((data || []).length < pageSize ||
                    ids.every(id => costs.has(String(id)))) break;
            }
        }

        rows.forEach(row => {
            if (!(Number(row.unit_cost) > 0)) {
                row.unit_cost = costs.get(String(row.material_id)) || 0;
            }
        });
    } catch (error) {
        console.error("Stock purchase cost lookup failed:", error);
        showAlert(
            "Some unit costs could not be loaded from Stock Entry. " +
            "Inventory values may be incomplete. " + (error?.message || String(error)),
            "warning"
        );
    }
}


//====================================================
// POPULATE DEPARTMENT FILTER
//====================================================

function populateDepartmentFilter() {

    const select =
        document.getElementById("stockDepartment");


    const currentValue =
        select.value;


    const departments =
        [
            ...new Set(
                stockData
                    .map(item =>
                        item.department_name
                    )
                    .filter(Boolean)
            )
        ]
        .sort(
            (a, b) =>
                a.localeCompare(b)
        );


    select.innerHTML = `
        <option value="">
            All Departments
        </option>
    `;


    departments.forEach(department => {

        const option =
            document.createElement("option");

        option.value = department;

        option.textContent = department;

        select.appendChild(option);

    });


    if (
        departments.includes(currentValue)
    ) {

        select.value =
            currentValue;

    }

}


//====================================================
// APPLY FILTERS
//====================================================

function applyStockFilters() {

    const search =
        document.getElementById("stockSearch")
            .value
            .trim()
            .toLowerCase();


    const department =
        document.getElementById("stockDepartment")
            .value;


    const status =
        document.getElementById("stockStatus")
            .value;


    filteredStockData =
        stockData.filter(item => {

            const code =
                String(
                    item.material_code || ""
                )
                .toLowerCase();


            const name =
                String(
                    item.material_name || ""
                )
                .toLowerCase();


            const departmentName =
                item.department_name || "";


            const currentStock =
                Number(
                    item.current_stock || 0
                );


            const minimumStock =
                Number(
                    item.minimum_stock || 0
                );


            // Search

            const matchesSearch =
                !search ||
                code.includes(search) ||
                name.includes(search);


            // Department

            const matchesDepartment =
                !department ||
                departmentName === department;


            // Stock status

            let matchesStatus = true;


            if (status === "REORDER") {
                matchesStatus = currentStock <= minimumStock;
            } else if (status === "OUT") {

                matchesStatus =
                    currentStock <= 0;

            } else if (status === "LOW") {

                matchesStatus =
                    currentStock > 0 &&
                    currentStock <= minimumStock;

            } else if (status === "IN_STOCK") {

                matchesStatus =
                    currentStock > minimumStock;

            }


            return (
                matchesSearch &&
                matchesDepartment &&
                matchesStatus
            );

        });


    renderStockTable();

    updateStockSummary();

    reconcileStockTotal();

}


//====================================================
// RENDER STOCK TABLE
//====================================================

function renderStockTable() {

    const tbody =
        document.getElementById("stockTableBody");

    const emptyState =
        document.getElementById("stockEmpty");


    if (!filteredStockData.length) {

        tbody.innerHTML = "";

        emptyState.classList.remove(
            "d-none"
        );

        document.getElementById(
            "stockRecordCount"
        ).textContent =
            "0 Records";

        return;

    }


    emptyState.classList.add(
        "d-none"
    );


    let html = "";


    filteredStockData.forEach(
        (item, index) => {

            const currentStock =
                Number(
                    item.current_stock || 0
                );


            const minimumStock =
                Number(
                    item.minimum_stock || 0
                );


            const unitCost =
                Number(
                    item.unit_cost || 0
                );


            const stockValue =
                currentStock *
                unitCost;


            let statusText;
            let statusClass;
            let stockClass;


            if (currentStock <= 0) {

                statusText =
                    "OUT OF STOCK";

                statusClass =
                    "bg-danger";

                stockClass =
                    "stock-zero";

            } else if (
                currentStock <= minimumStock
            ) {

                statusText =
                    "LOW";

                statusClass =
                    "bg-warning text-dark";

                stockClass =
                    "stock-low";

            } else {

                statusText =
                    "OK";

                statusClass =
                    "bg-success";

                stockClass =
                    "stock-ok";

            }


            html += `

                <tr>

                    <td>
                        ${index + 1}
                    </td>

                    <td>
                        <strong>
                            ${escapeHtml(
                                item.material_code || "-"
                            )}
                        </strong>
                    </td>

<td>
    <div class="fw-bold">
        ${escapeHtml(
            item.material_name || "-"
        )}
    </div>

    <div class="small text-muted">
        <strong>Category:</strong>
        ${escapeHtml(item.category || "-")}
        &nbsp; | &nbsp;

        <strong>Brand:</strong>
        ${escapeHtml(item.brand || "-")}
    </div>

    <div class="small text-muted">
        <strong>Type:</strong>
        ${escapeHtml(item.item_type || "-")}
        &nbsp; | &nbsp;

        <strong>Size:</strong>
        ${escapeHtml(item.item_size || "-")}
    </div>

    <div class="small text-muted">
        <strong>Specification:</strong>
        ${escapeHtml(item.specification || "-")}
    </div>
</td>

<td>
    ${escapeHtml(
        item.department_name || "-"
    )}
</td>

<td>
    ${escapeHtml(
        item.unit || "-"
    )}
</td>
                    <td class="text-end">
                        ₹${formatNumber(unitCost)}
                    </td>

                    <td class="text-end ${stockClass}">
                        ${formatNumber(currentStock)}
                    </td>

                    <td class="text-end">
                        ${formatNumber(minimumStock)}
                    </td>

                    <td class="text-end fw-semibold">
                        ₹${formatNumber(stockValue)}
                    </td>

                    <td class="text-center">

                        <span class="badge ${statusClass}">
                            ${statusText}
                        </span>

                    </td>

                </tr>

            `;

        }
    );


    tbody.innerHTML =
        html;


    document.getElementById(
        "stockRecordCount"
    ).textContent =
        `${filteredStockData.length} Records`;

}

//====================================================
// STOCK TOTAL RECONCILIATION
//====================================================

function reconcileStockTotal() {

    let total = 0;

    const breakdown = [];

    (stockData || []).forEach(item => {

        const quantity =
            Number(item.current_stock || 0);

        total += quantity;

        breakdown.push({
            code:
                item.material_code || "",

            name:
                item.material_name || "",

            quantity:
                quantity
        });

    });

    console.log(
        "===================================="
    );

    console.log(
        "RVRG STOCK RECONCILIATION"
    );

    console.log(
        "Total materials:",
        breakdown.length
    );

    console.log(
        "Total current stock:",
        total
    );

    console.log(
        "===================================="
    );

    console.table(breakdown);

    return total;
}

//====================================================
// UPDATE SUMMARY CARDS
//====================================================

function updateStockSummary() {

    let totalQuantity = 0;

    let totalValue = 0;

    let lowStockCount = 0;


    filteredStockData.forEach(item => {

        const currentStock =
            Number(
                item.current_stock || 0
            );


        const minimumStock =
            Number(
                item.minimum_stock || 0
            );


        const unitCost =
            Number(
                item.unit_cost || 0
            );


        totalQuantity +=
            currentStock;


        totalValue +=
            currentStock *
            unitCost;


        if (
            currentStock <= minimumStock
        ) {

            lowStockCount++;

        }

    });


    document.getElementById(
        "totalMaterials"
    ).textContent =
        filteredStockData.length;


    document.getElementById(
        "totalQuantity"
    ).textContent =
        formatNumber(totalQuantity);


    document.getElementById(
        "totalInventoryValue"
    ).textContent =
        "₹" +
        formatNumber(totalValue);


    document.getElementById(
        "lowStockCount"
    ).textContent =
        lowStockCount;


    document.getElementById(
        "footerInventoryValue"
    ).textContent =
        "₹" +
        formatNumber(totalValue);

}

//====================================================
// STOCK TOTAL RECONCILIATION
//====================================================

function reconcileStockTotal() {

    let total = 0;

    const stockBreakdown = [];

    (stockData || []).forEach(item => {

        const qty =
            Number(
                item.current_stock || 0
            );

        total += qty;

        stockBreakdown.push({

            code:
                item.material_code || "",

            name:
                item.material_name || "",

            quantity:
                qty

        });

    });


    console.log(
        "===================================="
    );

    console.log(
        "RVRG STOCK RECONCILIATION"
    );

    console.log(
        "Materials:",
        stockBreakdown.length
    );

    console.log(
        "Total Current Stock:",
        total
    );

    console.log(
        "===================================="
    );

    console.table(
        stockBreakdown
    );

    return total;
}

//====================================================
// EVENT HANDLERS
//====================================================

function setupStockEvents() {

    document.getElementById(
        "stockSearch"
    )
    .addEventListener(
        "input",
        applyStockFilters
    );


    document.getElementById(
        "stockDepartment"
    )
    .addEventListener(
        "change",
        applyStockFilters
    );


    document.getElementById(
        "stockStatus"
    )
    .addEventListener(
        "change",
        applyStockFilters
    );


    document.getElementById(
        "btnClearFilters"
    )
    .addEventListener(
        "click",
        clearStockFilters
    );


    document.getElementById(
        "btnRefreshStock"
    )
    .addEventListener(
        "click",
        loadCurrentStock
    );


    document.getElementById(
        "btnExportStock"
    )
    .addEventListener(
        "click",
        exportCurrentStock
    );

    document.getElementById("btnExportStockPdf")
        .addEventListener("click", exportCurrentStockPdf);

}


//====================================================
// CLEAR FILTERS
//====================================================

function clearStockFilters() {

    document.getElementById(
        "stockSearch"
    ).value = "";


    document.getElementById(
        "stockDepartment"
    ).value = "";


    document.getElementById(
        "stockStatus"
    ).value = "";


    applyStockFilters();

}


//====================================================
// EXPORT EXCEL
//====================================================

//====================================================
// EXPORT CURRENT STOCK TO EXCEL
//====================================================

function exportCurrentStock() {

    try {

        if (
            typeof XLSX === "undefined"
        ) {

            showAlert(
                "Excel library is not loaded.",
                "error"
            );

            return;
        }


        if (
            !filteredStockData ||
            !filteredStockData.length
        ) {

            showAlert(
                "There is no stock data to export.",
                "warning"
            );

            return;
        }


        // ====================================================
        // CALCULATE TOTALS FROM EXACT EXPORTED DATASET
        // ====================================================

        let totalQuantity = 0;
        let totalValue = 0;


        const exportData =
            filteredStockData.map(item => {

                const currentStock =
                    Number(
                        item.current_stock || 0
                    );

                const unitCost =
                    Number(
                        item.unit_cost || 0
                    );

                const minimumStock =
                    Number(
                        item.minimum_stock || 0
                    );

                const stockValue =
                    currentStock *
                    unitCost;


                totalQuantity +=
                    currentStock;

                totalValue +=
                    stockValue;


                return {

                    "Material Code":
                        item.material_code || "",

                    "Material Name":
                        item.material_name || "",

                    "Department":
                        item.department_name || "",

                    "Unit":
                        item.unit || "",

                    "Unit Cost":
                        unitCost,

                    "Current Stock":
                        currentStock,

                    "Minimum Stock":
                        minimumStock,

                    "Stock Value":
                        stockValue

                };

            });


        // ====================================================
        // ADD SUMMARY ROW
        // ====================================================

        exportData.push({

            "Material Code":
                "",

            "Material Name":
                "TOTAL",

            "Department":
                `${filteredStockData.length} Materials`,

            "Unit":
                "",

            "Unit Cost":
                "",

            "Current Stock":
                totalQuantity,

            "Minimum Stock":
                "",

            "Stock Value":
                totalValue

        });


        // ====================================================
        // CREATE WORKSHEET
        // ====================================================

        const worksheet =
            XLSX.utils.json_to_sheet(
                exportData
            );


        worksheet["!cols"] = [

            { wch: 18 },
            { wch: 30 },
            { wch: 20 },
            { wch: 12 },
            { wch: 15 },
            { wch: 15 },
            { wch: 15 },
            { wch: 18 }

        ];


        // ====================================================
        // CREATE WORKBOOK
        // ====================================================

        const workbook =
            XLSX.utils.book_new();


        XLSX.utils.book_append_sheet(
            workbook,
            worksheet,
            "Current Stock"
        );


        // ====================================================
        // DOWNLOAD
        // ====================================================

        XLSX.writeFile(
            workbook,
            "RVRG_Current_Stock.xlsx"
        );


        showAlert(
            `${filteredStockData.length} materials exported. ` +
            `Total Stock: ${formatNumber(totalQuantity)}`,
            "success"
        );

    }
    catch (error) {

        console.error(
            "Stock Export Error:",
            error
        );

        showAlert(
            "Failed to export current stock: " +
            error.message,
            "error"
        );

    }

}

//====================================================
// NUMBER FORMAT
//====================================================

function formatNumber(value) {

    return Number(
        value || 0
    ).toLocaleString(
        "en-IN",
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    );

}


//====================================================
// HTML ESCAPE
//====================================================

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


// Export the same filtered stock and resolved costs used by the table and Excel.
function exportCurrentStockPdf() {
    if (!filteredStockData.length) {
        showAlert("There is no stock data to export.", "warning");
        return;
    }

    if (typeof window.jspdf?.jsPDF !== "function") {
        showAlert("PDF library is not loaded. Please refresh and try again.", "error");
        return;
    }

    try {
        const doc = new window.jspdf.jsPDF({
            orientation: "landscape", unit: "mm", format: "a4"
        });
        if (typeof doc.autoTable !== "function") {
            throw new Error("PDF table library is not loaded. Please refresh and try again.");
        }

        let totalQuantity = 0;
        let totalValue = 0;
        const rows = filteredStockData.map(item => {
            const quantity = Number(item.current_stock || 0);
            const cost = Number(item.unit_cost || 0);
            const minimum = Number(item.minimum_stock || 0);
            const value = quantity * cost;
            totalQuantity += quantity;
            totalValue += value;
            return [
                item.material_code || "", item.material_name || "",
                item.department_name || "", item.unit || "",
                formatNumber(cost), formatNumber(quantity), formatNumber(minimum),
                formatNumber(value),
                quantity <= 0 ? "OUT OF STOCK" : quantity <= minimum ? "LOW" : "OK"
            ];
        });

        // Standard PDF fonts do not support the rupee glyph; label currency INR.
        doc.setFontSize(16);
        doc.text("RVRG Store Management - Current Stock", 14, 16);
        doc.setFontSize(9);
        doc.text(`Department: ${document.getElementById("stockDepartment").value || "All Departments"}`, 14, 23);
        doc.text(`Search: ${document.getElementById("stockSearch").value.trim() || "All materials"} | Stock status: ${document.getElementById("stockStatus").selectedOptions[0]?.textContent.trim() || "All Stock"}`, 14, 29);
        doc.autoTable({
            startY: 35,
            head: [["Material Code", "Material Name", "Department", "Unit",
                "Unit Cost (INR)", "Current Stock", "Minimum Stock", "Stock Value (INR)", "Status"]],
            body: rows,
            foot: [["", "TOTAL", `${rows.length} Materials`, "", "",
                formatNumber(totalQuantity), "", formatNumber(totalValue), ""]],
            showFoot: "lastPage",
            styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak" },
            headStyles: { fillColor: [0, 71, 65] },
            columnStyles: {
                4: { halign: "right" }, 5: { halign: "right" },
                6: { halign: "right" }, 7: { halign: "right" }
            },
            margin: { top: 14, bottom: 16 },
            didDrawPage: () => {
                doc.setFontSize(8);
                doc.text(`Page ${doc.internal.getNumberOfPages()}`, 14,
                    doc.internal.pageSize.getHeight() - 8);
            }
        });
        doc.save("RVRG_Current_Stock.pdf");
    } catch (error) {
        console.error("Stock PDF Export Error:", error);
        showAlert("Failed to export current stock to PDF: " + error.message, "error");
    }
}
