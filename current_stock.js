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
                <td colspan="10" class="text-center text-muted py-5">
                    <div class="spinner-border spinner-border-sm text-success me-2"></div>
                    Loading current stock...
                </td>
            </tr>
        `;


        const {
            data,
            error
        } = await window.supabaseClient

            .from("current_stock")

            .select(`
    material_id,
    material_code,
    material_name,
    department_name,
    category,
    brand,
    item_type,
    item_size,
    specification,
    unit,
    unit_cost,
    current_stock,
    minimum_stock
`)

            .order("material_code", {
                ascending: true
            });


        if (error)
            throw error;


        stockData = data || [];

        filteredStockData = [...stockData];


populateDepartmentFilter();

renderStockTable();

updateStockSummary();

reconcileStockTotal();
        
    } catch (error) {

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
            error.message,
            "error"
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


            if (status === "OUT") {

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
        ${escapeHtml(
            item.specification || "-"
        )}
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
