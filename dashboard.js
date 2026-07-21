// dashboard.js

document.addEventListener('DOMContentLoaded', () => {
    // 1. Security Check: Allow all valid roles to view the dashboard[cite: 2]
    const hasAccess = checkUserAccess(['ADMIN', 'FM', 'AFM', 'STORE', 'TECH_SUPERVISOR']);
    if (!hasAccess) return;

    // Display User Info and Current Date
    const user = getCurrentUser();
    document.getElementById('currentUserName').innerText = `${user.name} (${user.role})`;
    document.getElementById('currentDateDisplay').innerText = formatDate(new Date());

    // Load all dashboard data concurrently
    loadDashboardData();

    // Event Listener for refresh button
    document.getElementById('btnRefreshStock').addEventListener('click', loadLowStockAlerts);
});

// --- MAIN DATA CONTROLLER ---

async function loadDashboardData() {
    // Run these fetches in parallel to make the dashboard load instantly
    await Promise.all([
        loadMetrics(),
        loadRecentRequests(),
        loadLowStockAlerts()
    ]);
}

// --- METRICS LOGIC ---

async function loadMetrics() {
    try {
        // 1. Pending Requests Count[cite: 1, 3]
        const { count: pendingCount, error: pendingError } = await supabase
            .from('material_requests')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'PENDING');
        
        if (!pendingError) {
            document.getElementById('dashPendingRequests').innerText = pendingCount || 0;
        }

        // 2. Active Items Count[cite: 1, 3]
        const { count: itemsCount, error: itemsError } = await supabase
            .from('materials')
            .select('*', { count: 'exact', head: true });
        
        if (!itemsError) {
            document.getElementById('dashActiveItems').innerText = itemsCount || 0;
        }

        // 3. Low Stock Alerts Count from view[cite: 1, 3]
        const { count: lowStockCount, error: lowStockError } = await supabase
            .from('low_stock_alerts')
            .select('*', { count: 'exact', head: true });
        
        if (!lowStockError) {
            document.getElementById('dashLowStock').innerText = lowStockCount || 0;
        }

        // 4. Calculate Total Inventory Value[cite: 3]
        // Fetch material prices and current stock quantities separately to join locally
        const { data: materialsData } = await supabase.from('materials').select('material_id, price');
        const { data: stockData } = await supabase.from('current_stock').select('material_id, stock_qty');

        if (materialsData && stockData) {
            let totalValue = 0;
            
            stockData.forEach(stock => {
                const mat = materialsData.find(m => m.material_id === stock.material_id);
                if (mat) {
                    const price = parseFloat(mat.price) || 0;
                    const qty = parseInt(stock.stock_qty) || 0;
                    totalValue += (price * qty);
                }
            });

            document.getElementById('dashTotalValue').innerText = formatCurrency(totalValue);
        }

    } catch (error) {
        console.error("Error loading metrics:", error.message);
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
                requested_by,
                status,
                departments (name)
            `)
            .order('created_at', { ascending: false })
            .limit(5); // Fetch only the 5 most recent[cite: 2]

        if (error) throw error;

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">No recent requests</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        data.forEach(req => {
            const deptName = req.departments ? req.departments.name : 'N/A';
            const tr = document.createElement('tr');
            
            tr.innerHTML = `
                <td class="fw-bold text-primary">${req.ticket_no}</td>
                <td>${req.requested_by || 'Unknown'}</td>
                <td>${deptName}</td>
                <td>${getStatusBadge(req.status)}</td>
            `;
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error("Error loading recent requests:", error.message);
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger py-3">Failed to load requests</td></tr>';
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
