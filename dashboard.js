// dashboard.js
// Protect page
const currentUser = getCurrentUser();

if (!currentUser)
window.location.replace("index.html");

document.addEventListener('DOMContentLoaded', () => {
// 1. Security Check: Allow all valid roles to view the dashboard[cite: 2]
const hasAccess = checkUserAccess(['ADMIN', 'FM', 'AFM', 'AFM', 'STOREKEEPER', 'TECH_SUPERVISOR']);
if (!hasAccess) return;

// Display User Info and Current Date
document.getElementById('currentUserName').innerText =`${currentUser.name} (${currentUser.role})`;
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

updateDateTime();
setInterval(updateDateTime, 1000);
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

await loadLowStockAlerts().catch(console.error);

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
               <td class="fw-bold text-primary">${req.ticket_no}</td>
               <td>${req.users_master?.full_name || 'Unknown'}</td>
               <td>${deptName}</td>
               <td>${getStatusBadge(req.request_status)}</td>
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
