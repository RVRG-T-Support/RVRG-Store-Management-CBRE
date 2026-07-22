// inventory_correction.js
// Protect page
const currentUser = getCurrentUser();

if (!currentUser)
    window.location.replace("index.html");

document.addEventListener('DOMContentLoaded', () => {
    // 1. Security Check: STORE, ADMIN, FM, AFM can access this page[cite: 2]
    const hasAccess = checkUserAccess(['ADMIN', 'FM', 'AFM', 'STORE']);
    if (!hasAccess) return;

    // Display current user name
    const user = getCurrentUser();
    document.getElementById('currentUserName').innerText = `${user.name} (${user.role})`;

    // Initialize page data
    loadDepartments();
    loadRecentIcrs();

    // Event Listeners
    document.getElementById('departmentSelect').addEventListener('change', handleDepartmentChange);
    document.getElementById('materialSelect').addEventListener('change', handleMaterialChange);
    document.getElementById('physicalStockInput').addEventListener('input', calculateDifference);
    document.getElementById('icrForm').addEventListener('submit', submitIcr);
    document.getElementById('btnRefreshTable').addEventListener('click', loadRecentIcrs);
});

// --- DATA LOADING LOGIC ---

async function loadDepartments() {
    try {
        const { data, error } = await supabase
            .from('departments')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;

        const deptSelect = document.getElementById('departmentSelect');
        deptSelect.innerHTML = '<option value="" selected disabled>Select Department</option>';
        
        data.forEach(dept => {
            deptSelect.innerHTML += `<option value="${dept.id}">${dept.name}</option>`;
        });
    } catch (error) {
        console.error("Error loading departments:", error.message);
    }
}

async function handleDepartmentChange(e) {
    const departmentId = e.target.value;
    
    // Reset dependant fields
    resetStockDisplay();
    
    try {
        const { data, error } = await supabase
            .from('materials')
            .select('*')
            .eq('department_id', departmentId)
            .order('name', { ascending: true });

        if (error) throw error;

        const matSelect = document.getElementById('materialSelect');
        matSelect.innerHTML = '<option value="" selected disabled>Select Material</option>';
        
        data.forEach(mat => {
            matSelect.innerHTML += `<option value="${mat.material_id}">${mat.name}</option>`;
        });
    } catch (error) {
        console.error("Error loading materials:", error.message);
    }
}

async function handleMaterialChange(e) {
    const materialId = e.target.value;
    const physicalInput = document.getElementById('physicalStockInput');
    const btnSubmit = document.getElementById('btnSubmitIcr');
    const systemStockDisplay = document.getElementById('systemStockDisplay');
    
    // Disable inputs while fetching
    physicalInput.disabled = true;
    btnSubmit.disabled = true;
    systemStockDisplay.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

    try {
        // Fetch current stock from view[cite: 1, 3]
        const { data, error } = await supabase
            .from('current_stock')
            .select('stock_qty')
            .eq('material_id', materialId)
            .single();

        // If no stock record exists yet, assume 0
        const currentStock = data ? parseInt(data.stock_qty) : 0;
        
        systemStockDisplay.innerText = currentStock;
        systemStockDisplay.dataset.value = currentStock;

        // Enable inputs for the user
        physicalInput.disabled = false;
        physicalInput.value = '';
        document.getElementById('differenceDisplay').innerText = '-';
        document.getElementById('differenceDisplay').className = 'fw-bold fs-4';

    } catch (error) {
        console.error("Error fetching current stock:", error.message);
        // Fallback if view fails or no data
        systemStockDisplay.innerText = '0';
        systemStockDisplay.dataset.value = '0';
        physicalInput.disabled = false;
    }
}

function calculateDifference() {
    const systemStock = parseInt(document.getElementById('systemStockDisplay').dataset.value) || 0;
    const physicalStockValue = document.getElementById('physicalStockInput').value;
    const differenceDisplay = document.getElementById('differenceDisplay');
    const btnSubmit = document.getElementById('btnSubmitIcr');

    if (physicalStockValue === '') {
        differenceDisplay.innerText = '-';
        differenceDisplay.className = 'fw-bold fs-4';
        btnSubmit.disabled = true;
        return;
    }

    const physicalStock = parseInt(physicalStockValue);
    const difference = physicalStock - systemStock;

    // Display the difference with appropriate styling
    if (difference > 0) {
        differenceDisplay.innerText = `+${difference}`;
        differenceDisplay.className = 'fw-bold fs-4 text-success';
    } else if (difference < 0) {
        differenceDisplay.innerText = difference; // Negative sign is included automatically
        differenceDisplay.className = 'fw-bold fs-4 text-danger';
    } else {
        differenceDisplay.innerText = '0';
        differenceDisplay.className = 'fw-bold fs-4 text-muted';
    }

    // Enable submit only if there is an actual difference to correct
    btnSubmit.disabled = (difference === 0);
}

function resetStockDisplay() {
    document.getElementById('materialSelect').innerHTML = '<option value="" selected disabled>Select Department First</option>';
    document.getElementById('systemStockDisplay').innerText = '-';
    document.getElementById('systemStockDisplay').dataset.value = '';
    document.getElementById('differenceDisplay').innerText = '-';
    document.getElementById('differenceDisplay').className = 'fw-bold fs-4';
    document.getElementById('physicalStockInput').value = '';
    document.getElementById('physicalStockInput').disabled = true;
    document.getElementById('btnSubmitIcr').disabled = true;
}

// --- SUBMIT WORKFLOW ---

async function submitIcr(e) {
    e.preventDefault();

    const materialId = document.getElementById('materialSelect').value;
    const systemStock = parseInt(document.getElementById('systemStockDisplay').dataset.value);
    const physicalStock = parseInt(document.getElementById('physicalStockInput').value);
    const remarks = document.getElementById('icrRemarks').value.trim();
    const user = getCurrentUser();

    const difference = physicalStock - systemStock;
    if (difference === 0) {
        showAlert("Physical stock matches system stock. No correction needed.", "info");
        return;
    }

    const btnSubmit = document.getElementById('btnSubmitIcr');
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Submitting...';

    try {
        // Generate ICR Ticket Number
        const year = new Date().getFullYear();
        const randomId = Math.floor(1000 + Math.random() * 9000);
        const ticketNo = `ICR-${year}-${randomId}`;

        // Insert into inventory_correction_requests[cite: 1, 3]
        const { error } = await supabase
            .from('inventory_correction_requests')
            .insert([{
                ticket_no: ticketNo,
                material_id: materialId,
                system_qty: systemStock,
                physical_qty: physicalStock,
                difference: difference,
                remarks: remarks,
                status: 'PENDING',
                requested_by: user.name
            }]);

        if (error) throw error;

        showAlert(`Correction Request ${ticketNo} raised successfully for FM approval.`, 'success');
        
        // Reset form
        document.getElementById('icrForm').reset();
        resetStockDisplay();
        document.getElementById('departmentSelect').value = '';
        
        // Refresh table
        loadRecentIcrs();

    } catch (error) {
        console.error("Error submitting ICR:", error.message);
        showAlert("Failed to submit request. Check console.", "error");
    } finally {
        btnSubmit.innerHTML = '<i class="fa-solid fa-paper-plane me-2"></i>Submit for FM Approval';
    }
}

// --- RECENT ICR TABLE LOGIC ---

async function loadRecentIcrs() {
    const tableBody = document.getElementById('recentIcrTable');
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">Loading requests...</td></tr>';

    try {
        const { data, error } = await supabase
            .from('inventory_correction_requests')
            .select(`
                ticket_no,
                system_qty,
                physical_qty,
                status,
                created_at,
                materials (name)
            `)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) throw error;

        if (data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">No recent correction requests found.</td></tr>';
            return;
        }

        tableBody.innerHTML = '';
        data.forEach(req => {
            const materialName = req.materials ? req.materials.name : 'Unknown Material';
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="fw-bold text-warning">${req.ticket_no}</span><br><small class="text-muted">${formatDate(req.created_at)}</small></td>
                <td>${materialName}</td>
                <td class="text-center">${req.system_qty}</td>
                <td class="text-center fw-bold">${req.physical_qty}</td>
                <td>${getStatusBadge(req.status)}</td>
            `;
            tableBody.appendChild(tr);
        });

    } catch (error) {
        console.error("Error loading recent ICRs:", error.message);
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Failed to load requests.</td></tr>';
    }
}
