// dashboard.js
// Protect page
const currentUser = getCurrentUser();

if (!currentUser)
window.location.replace("index.html");

document.addEventListener('DOMContentLoaded', () => {
// 1. Security Check: Allow all valid roles to view the dashboard[cite: 2]
const hasAccess = checkUserAccess(['ADMIN', 'FM', 'AFM', 'STOREKEEPER', 'TECH_SUPERVISOR']);
if (!hasAccess) return;

// Display User Info and Current Date
const userName = document.getElementById("currentUserName");

if (userName) {
    userName.innerText = `${currentUser.name} (${currentUser.role})`;
}
function updateDateTime() {
    const now = new Date();

    document.getElementById("currentDateDisplay").innerText =
        now.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }) +
        " | " +
        now.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });
}

//updateDateTime();
//setInterval(updateDateTime, 1000);
// Load all dashboard data concurrently
loadDashboardData();

// Event Listener for refresh button
document.getElementById('btnRefreshStock').addEventListener('click', loadLowStockAlerts);
});

// --- MAIN DATA CONTROLLER ---

// Run these fetches in parallel to make the dashboard load instantly
async function loadDashboardData() {

await loadMetrics().catch(console.error);

await loadRecentRequests().catch(console.error);

await loadDepartmentConsumption()
    .catch(console.error);

await loadLowStockAlerts()
    .catch(console.error);

}

// --- METRICS LOGIC ---

async function loadMetrics() {
try {

// Pending Requests
const { count: pendingCount } = await supabase
.from('material_requests')
.select('*', { count: 'exact', head: true })
.eq('request_status', 'PENDING');

document.getElementById('dashPendingRequests').innerText = pendingCount || 0;

// Active Items
const { count: itemsCount } = await supabase
.from('materials')
.select('*', { count: 'exact', head: true });

document.getElementById('dashActiveItems').innerText = itemsCount || 0;

// Low Stock
const { count: lowCount } = await supabase
.from('low_stock_alerts')
.select('*', { count: 'exact', head: true });

document.getElementById('dashLowStock').innerText = lowCount || 0;

// Inventory Value
const { data: stock } = await supabase
.from('current_stock')
.select(`
           material_id,
           unit_cost,
           current_stock
       `);

let total = 0;

if (stock) {
stock.forEach(item => {
total +=
(Number(item.unit_cost) || 0) *
(Number(item.current_stock) || 0);
});
}

document.getElementById('dashTotalValue').innerText = formatCurrency(total);

} catch (error) {
console.error(error);
alert(error.message);
}
}
// --- RECENT REQUESTS TABLE LOGIC ---

async function loadRecentRequests() {
const tbody = document.getElementById('dashRecentRequests');

try {
const { data, error } = await supabase
    .from('material_requests')
.select(`
    ticket_no,
    anacity_complaint_no,
    request_status,
    created_at,
    users_master!material_requests_requested_by_fkey(
        full_name
    ),
    materials!material_requests_material_id_fkey(
        departments(
            department_name
        )
    ),
    approver:users_master!material_requests_approved_by_fkey(
        full_name
    )
`)
    .order('created_at', { ascending: false })
    .limit(10); // Fetch only the 5 most recent[cite: 2]

if (error) throw error;

if (data.length === 0) {
tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">No recent requests</td></tr>';
return;
}

tbody.innerHTML = '';
data.forEach(req => {
const deptName =
           req.materials?.departments?.department_name || 'N/A';
const tr = document.createElement('tr');

tr.innerHTML = `
    <td>

        <div class="fw-bold text-success">
            Complaint Number:
            ${req.anacity_complaint_no || 'N/A'}
        </div>

        <div class="fw-bold text-primary">
            MR:
            ${req.ticket_no || 'N/A'}
        </div>

    </td>

    <td>
        ${req.users_master?.full_name || '-'}
    </td>

    <td>
        ${req.approver?.full_name || '-'}
    </td>

    <td>
        ${deptName}
    </td>

    <td>
        ${getStatusBadge(req.request_status)}
    </td>
`;
tbody.appendChild(tr);
});

} 

catch (error) {
console.error(error);
alert(error.message);
tbody.innerHTML =
`<tr><td colspan="4" class="text-danger text-center">${error.message}</td></tr>`;
}
}

// ====================================================
// DEPARTMENT CONSUMPTION - CURRENT MONTH
// ====================================================

async function loadDepartmentConsumption(){

    const container =
        document.getElementById(
            "departmentConsumptionTiles"
        );

    const periodDisplay =
        document.getElementById(
            "departmentConsumptionPeriod"
        );


    if(!container)
        return;


    // ------------------------------------------------
    // CURRENT MONTH PERIOD
    // ------------------------------------------------

    const now =
        new Date();


    const monthStart =
        new Date(
            now.getFullYear(),
            now.getMonth(),
            1,
            0,
            0,
            0,
            0
        );


    const monthEnd =
        new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23,
            59,
            59,
            999
        );


    const formatDate =
        date =>
            date.toLocaleDateString(
                "en-IN",
                {
                    day: "2-digit",
                    month: "short",
                    year: "numeric"
                }
            );


    if(periodDisplay){

        periodDisplay.innerText =
            `Period: ${formatDate(monthStart)} – ` +
            `${formatDate(monthEnd)} ` +
            `(Month-to-Date)`;

    }


    try{

        // ------------------------------------------------
        // LOAD DEPARTMENTS
        // ------------------------------------------------

        const {
            data: departments,
            error: departmentError
        } = await supabase

            .from("departments")

            .select(
                "id, department_name"
            )

            .order(
                "department_name",
                {
                    ascending: true
                }
            );


        if(departmentError)
            throw departmentError;


        // ------------------------------------------------
        // LOAD MATERIAL MASTER
        // ------------------------------------------------

        const {
            data: materials,
            error: materialError
        } = await supabase

            .from("materials")

            .select(
                "id, department_id, unit_cost"
            );


        if(materialError)
            throw materialError;


        // ------------------------------------------------
        // CREATE MATERIAL LOOKUP
        // ------------------------------------------------

        const materialMap = {};


        (materials || []).forEach(
            material => {

                materialMap[
                    String(material.id)
                ] = material;

            }
        );


        // ------------------------------------------------
        // LOAD CURRENT MONTH ISSUE TRANSACTIONS
        // ------------------------------------------------

        const {
            data: issues,
            error: issueError
        } = await supabase

            .from(
                "material_issue_register"
            )

            .select(
                "material_id, issued_qty, unit_cost, issued_date"
            )

            .gte(
                "issued_date",
                monthStart.toISOString()
            )

            .lte(
                "issued_date",
                monthEnd.toISOString()
            );


        if(issueError)
            throw issueError;


        // ------------------------------------------------
        // BUILD DEPARTMENT TOTALS
        // ------------------------------------------------

        const consumptionMap = {};


        (departments || []).forEach(
            department => {

                consumptionMap[
                    String(department.id)
                ] = {

                    name:
                        department.department_name,

                    value:
                        0,

                    issueRecords:
                        0

                };

            }
        );


        (issues || []).forEach(
            issue => {

                const material =
                    materialMap[
                        String(
                            issue.material_id
                        )
                    ];


                if(!material)
                    return;


                const departmentId =
                    String(
                        material.department_id
                    );


                if(
                    !consumptionMap[
                        departmentId
                    ]
                )
                    return;


                const quantity =
                    Number(
                        issue.issued_qty || 0
                    );


                const unitCost =
                    Number(
                        issue.unit_cost ??
                        material.unit_cost ??
                        0
                    );


                consumptionMap[
                    departmentId
                ].value +=
                    quantity *
                    unitCost;


                consumptionMap[
                    departmentId
                ].issueRecords++;

            }
        );


        // ------------------------------------------------
        // RENDER TILES
        // ------------------------------------------------

        container.innerHTML = "";


        if(
            !departments ||
            departments.length === 0
        ){

            container.innerHTML = `

                <div class="col-12">

                    <div
                        class="alert alert-light
                               text-center
                               text-muted
                               mb-0">

                        No departments found.

                    </div>

                </div>

            `;

            return;

        }


        departments.forEach(
            (department, index) => {

                const departmentId =
                    String(
                        department.id
                    );


                const summary =
                    consumptionMap[
                        departmentId
                    ] || {

                        name:
                            department.department_name,

                        value:
                            0,

                        issueRecords:
                            0

                    };


                const tile =
                    document.createElement(
                        "div"
                    );


                tile.className =
                    "col-12 col-sm-6 col-lg-4";


                tile.innerHTML = `

                    <div
                        class="card
                               border-0
                               shadow-sm
                               h-100">

                        <div
                            class="card-body">

                            <div
                                class="d-flex
                                       justify-content-between
                                       align-items-start">

                                <div>

                                    <h6
                                        class="text-muted
                                               fw-bold
                                               mb-2">

                                        ${summary.name}

                                    </h6>

                                    <div
                                        class="small
                                               text-muted
                                               mb-1">

                                        Consumption

                                    </div>

                                    <h4
                                        class="fw-bold
                                               mb-2
                                               text-dark">

                                        ${formatCurrency(
                                            summary.value
                                        )}

                                    </h4>

                                    <small
                                        class="text-muted">

                                        ${
                                            summary.issueRecords
                                        }
                                        issue record(s)

                                    </small>

                                </div>


                                <div
                                    class="rounded-circle
                                           bg-light
                                           p-3">

                                    <i
                                        class="fa-solid
                                               fa-box-open
                                               text-primary">

                                    </i>

                                </div>

                            </div>

                        </div>

                    </div>

                `;


                container.appendChild(
                    tile
                );

            }
        );

    }

    catch(error){

        console.error(
            "Department Consumption Error:",
            error
        );


        container.innerHTML = `

            <div class="col-12">

                <div
                    class="alert alert-danger
                           mb-0">

                    Unable to load
                    department consumption.

                    <br>

                    <small>
                        ${error.message}
                    </small>

                </div>

            </div>

        `;

    }

}

// --- LOW STOCK ALERTS TABLE LOGIC ---

async function loadLowStockAlerts() {
const tbody = document.getElementById('dashLowStockTable');
tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3"><div class="spinner-border spinner-border-sm text-primary"></div></td></tr>';

try {
// Query the low_stock_alerts view[cite: 1, 3]
const { data, error } = await supabase
.from('low_stock_alerts')
.select('*')
.limit(5); // Show top 5 urgent items

if (error) throw error;

if (data.length === 0) {
tbody.innerHTML = '<tr><td colspan="4" class="text-center text-success fw-bold py-3"><i class="fa-solid fa-check-circle me-1"></i> Inventory levels are healthy</td></tr>';
return;
}

tbody.innerHTML = '';
data.forEach(item => {
// Note: Column names rely on how your view is structured in Supabase.
// Adjust 'material_name', 'department_name', 'stock_qty' if your view uses different aliases.
const matName = item.material_name || item.name || `MAT-${item.material_id}`;
const deptName = item.department_name || item.department || 'Unknown';
const currentStock = item.stock_qty || item.current_stock || 0;

const tr = document.createElement('tr');
tr.innerHTML = `
               <td class="fw-semibold">${matName}</td>
               <td>${deptName}</td>
               <td class="text-danger fw-bold">${currentStock}</td>
               <td><span class="badge bg-danger">Low</span></td>
           `;
tbody.appendChild(tr);
});

} catch (error) {
console.warn("View query failed. Attempting manual join fallback...", error.message);

// Manual fallback logic in case the view is not completely defined yet
const { data: materialsData } = await supabase.from('materials').select('material_id, name, min_stock_level, departments(name)');
const { data: stockData } = await supabase.from('current_stock').select('material_id, stock_qty');

tbody.innerHTML = '';
let alertsFound = 0;

if (materialsData && stockData) {
materialsData.forEach(mat => {
const stock = stockData.find(s => s.material_id === mat.material_id);
const qty = stock ? parseInt(stock.stock_qty) : 0;
const minStock = mat.min_stock_level || 10; // Default threshold if null

if (qty <= minStock && alertsFound < 5) {
const dept = mat.departments ? mat.departments.name : 'N/A';
tbody.innerHTML += `
                       <tr>
                           <td class="fw-semibold">${mat.name}</td>
                           <td>${dept}</td>
                           <td class="text-danger fw-bold">${qty}</td>
                           <td><span class="badge bg-danger">Low</span></td>
                       </tr>
                   `;
alertsFound++;
}
});
}

if (alertsFound === 0) {
tbody.innerHTML = '<tr><td colspan="4" class="text-center text-success fw-bold py-3"><i class="fa-solid fa-check-circle me-1"></i> Inventory levels are healthy</td></tr>';
}
}
}
