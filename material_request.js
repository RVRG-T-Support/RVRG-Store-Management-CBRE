// material_request.js
// Protect page
const currentUser = getCurrentUser();

if (!currentUser)
    window.location.replace("index.html");

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize page data
    loadDepartments();
    loadRecentRequests();

    // 2. Set up Event Listeners
    document.getElementById('departmentSelect').addEventListener('change', handleDepartmentChange);
    document.getElementById('materialSelect').addEventListener('change', handleMaterialChange);
    document.getElementById('materialRequestForm').addEventListener('submit', submitMaterialRequest);
    document.getElementById('btnRefreshTable').addEventListener('click', loadRecentRequests);
});

// --- DATA LOADING FUNCTIONS ---

async function loadDepartments() {

    try {

        const { data, error } = await supabase
            .from('departments')
            .select('id, department_name')
            .order('department_name', { ascending: true });

        if (error) throw error;

        const deptSelect = document.getElementById('departmentSelect');

        deptSelect.innerHTML =
            `<option value="">Select Department</option>`;

        data.forEach(dept => {

            deptSelect.innerHTML += `
                <option value="${dept.id}">
                    ${dept.department_name}
                </option>
            `;

        });

    }
    catch (err) {

        console.error("Load Departments:", err);

        showAlert(
            "Unable to load departments.",
            "danger"
        );

    }

}

async function handleDepartmentChange(e) {
    const departmentId = e.target.value;
    
    // Reset dependant dropdowns
    document.getElementById('unitPriceDisplay').innerText = '₹ 0.00';
    document.getElementById('gstNote').innerText = 'GST info will appear here';
    
    await Promise.all([
        loadTechnicians(departmentId),
        loadMaterials(departmentId)
    ]);
}

async function loadTechnicians(departmentId) {

    const techSelect =
        document.getElementById("technicianSelect");

    techSelect.innerHTML =
        `<option value="">Loading...</option>`;

    try {

        const { data, error } = await supabase
            .from("technicians")
            .select("id, technician_name")
            .eq("department_id", departmentId)
            .eq("active", true)
            .order("technician_name");

        if (error) throw error;

        techSelect.innerHTML =
            `<option value="">Select Technician</option>`;

        data.forEach(tech => {

            techSelect.innerHTML += `

                <option value="${tech.id}">
                    ${tech.technician_name}
                </option>

            `;

        });

    }

    catch (err) {

        console.error(err);

        techSelect.innerHTML =
            `<option value="">No Technician</option>`;

    }

}

async function loadMaterials(departmentId) {
    try {
        const { data, error } = await supabase
            .from('materials')
            .select('*')
            .eq('department_id', departmentId)
            .order('name', { ascending: true });

        if (error) throw error;

        const matSelect = document.getElementById('materialSelect');
        matSelect.innerHTML = '<option value="" selected disabled>Select Material</option>';
        
        // Store material data globally for easy access when selecting
        window.currentMaterials = data; 
        
        data.forEach(mat => {
            // Assuming your table has a 'name' and 'material_id' column
            matSelect.innerHTML += `<option value="${mat.material_id}">${mat.name}</option>`;
        });
    } catch (error) {
        console.error("Error loading materials:", error.message);
    }
}

// --- PRICE DISPLAY LOGIC ---

function handleMaterialChange(e) {
    const selectedMatId = e.target.value;
    const materials = window.currentMaterials || [];
    
    // Find the selected material object
    const selectedMat = materials.find(m => m.material_id == selectedMatId);
    
    if (selectedMat) {
        // Display price (Assuming columns 'price' and 'gst_type' exist)
        const price = selectedMat.price || 0;
        const gstInfo = selectedMat.gst_type || 'Excluding GST'; // or 'Including GST'
        
        document.getElementById('unitPriceDisplay').innerText = formatCurrency(price);
        document.getElementById('gstNote').innerText = `Price is ${gstInfo}`;
    }
}

// --- SUBMIT TICKET LOGIC ---

async function submitMaterialRequest(e) {
    e.preventDefault(); // Prevent page reload
    
    const user = getCurrentUser(); // From common.js/config.js

    // Gather form values
    const ticketType = document.getElementById('ticketType').value;
    const location = document.getElementById('locationInput').value;
    const departmentId = document.getElementById('departmentSelect').value;
    const technicianId = document.getElementById('technicianSelect').value;
    const materialId = document.getElementById('materialSelect').value;
    const quantity = document.getElementById('requestQuantity').value;
    const remarks = document.getElementById('requestRemarks').value;

    try {
        // Generate a standard Ticket No (e.g., MR-2026-XXXX)
        const year = new Date().getFullYear();
        const randomId = Math.floor(1000 + Math.random() * 9000);
        const ticketNo = `MR-${year}-${randomId}`;

        // Insert into database
        const { error } = await supabase
            .from('material_requests')
            .insert([{
                ticket_no: ticketNo,
                ticket_type: ticketType,
                location: location,
                department_id: departmentId,
                technician_id: technicianId,
                material_id: materialId,
                requested_qty: parseInt(quantity),
                remarks: remarks,
                status: 'PENDING',
                requested_by: user.name
            }]);

        if (error) throw error;

        showAlert(`Ticket ${ticketNo} generated successfully!`, 'success');
        
        // Reset form and refresh table
        e.target.reset();
        document.getElementById('unitPriceDisplay').innerText = '₹ 0.00';
        document.getElementById('gstNote').innerText = 'GST info will appear here';
        loadRecentRequests();

    } catch (error) {
        console.error("Error submitting request:", error.message);
        showAlert("Failed to submit request. Check console for details.", "error");
    }
}

// --- RECENT REQUESTS TABLE LOGIC ---

async function loadRecentRequests() {
    const tableBody = document.getElementById('recentRequestsTable');
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Loading requests...</td></tr>';

    try {
        // Fetch top 10 recent requests, joining material and technician names
        const { data, error } = await supabase
            .from('material_requests')
            .select(`
                *,
                materials (name),
                technicians (name)
            `)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) throw error;

        if (data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No recent requests found.</td></tr>';
            return;
        }

        tableBody.innerHTML = '';
        data.forEach(req => {
            const materialName = req.materials ? req.materials.name : 'Unknown Material';
            const techName = req.technicians ? req.technicians.name : 'Unknown Tech';
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="fw-bold text-primary">${req.ticket_no || 'N/A'}</span><br><small class="text-muted">${formatDate(req.created_at)}</small></td>
                <td><strong>${req.ticket_type || 'N/A'}</strong><br><small>${req.location || ''}</small></td>
                <td>${materialName}</td>
                <td>${req.requested_qty}</td>
                <td>${getStatusBadge(req.status)}</td>
            `;
            tableBody.appendChild(tr);
        });

    } catch (error) {
        console.error("Error loading recent requests:", error.message);
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Failed to load requests.</td></tr>';
    }
}
