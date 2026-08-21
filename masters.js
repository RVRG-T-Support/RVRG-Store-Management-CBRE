// masters.js//
// Protect page//
const currentUser = getCurrentUser();

if (!currentUser)
    window.location.replace("index.html");

document.addEventListener('DOMContentLoaded', () => {
    // 1. Security Check: Only ADMIN and FM should manage master data
    const hasAccess = checkUserAccess(['ADMIN', 'FM']);
    if (!hasAccess) return;

    // Display current user name
    const user = getCurrentUser();
    document.getElementById('currentUserName').innerText = `${user.name} (${user.role})`;

    // Initialize all master data
    loadAllMasterData();

    // Event Listeners for Forms
    document.getElementById('formDepartment').addEventListener('submit', saveDepartment);
    document.getElementById('formMaterial').addEventListener('submit', saveMaterial);
    document.getElementById('formTechnician').addEventListener('submit', saveTechnician);
});

// --- DATA LOADING LOGIC ---

async function loadAllMasterData() {
    // Must load departments first so the dropdowns in other tabs populate correctly
    await loadDepartments();
    await Promise.all([
        loadMaterials(),
        loadTechnicians()
    ]);
}

async function loadDepartments() {
    const tableBody = document.getElementById('tableDepartments');
    tableBody.innerHTML = '<tr><td colspan="2" class="text-center text-muted">Loading...</td></tr>';

    try {
        const { data, error } = await supabase
            .from('departments')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;

        // Populate Table
        tableBody.innerHTML = '';
        if (data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="2" class="text-center text-muted">No departments found.</td></tr>';
        } else {
            data.forEach(dept => {
                tableBody.innerHTML += `
                    <tr>
                        <td class="fw-bold">${dept.id}</td>
                        <td>${dept.name}</td>
                    </tr>
                `;
            });
        }

        // Populate Dropdowns in Material and Technician Forms
        const matDeptSelect = document.getElementById('matDepartment');
        const techDeptSelect = document.getElementById('techDepartment');
        
        const optionsHtml = '<option value="" selected disabled>Select Department</option>' + 
            data.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
            
        matDeptSelect.innerHTML = optionsHtml;
        techDeptSelect.innerHTML = optionsHtml;

    } catch (error) {
        console.error("Error loading departments:", error.message);
        tableBody.innerHTML = '<tr><td colspan="2" class="text-center text-danger">Failed to load.</td></tr>';
    }
}

async function loadMaterials() {
    const tableBody = document.getElementById('tableMaterials');
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Loading...</td></tr>';

    try {
        const { data, error } = await supabase
            .from('materials')
            .select(`
                material_id,
                name,
                price,
                min_stock_level,
                departments (name)
            `)
            .order('name', { ascending: true });

        if (error) throw error;

        tableBody.innerHTML = '';
        if (data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No materials found.</td></tr>';
            return;
        }

        data.forEach(mat => {
            const deptName = mat.departments ? mat.departments.name : 'Unknown';
            tableBody.innerHTML += `
                <tr>
                    <td class="fw-bold text-primary">${mat.material_id}</td>
                    <td class="fw-semibold">${mat.name}</td>
                    <td>${deptName}</td>
                    <td>${formatCurrency(mat.price)}</td>
                    <td>${mat.min_stock_level}</td>
                </tr>
            `;
        });

    } catch (error) {
        console.error("Error loading materials:", error.message);
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Failed to load.</td></tr>';
    }
}

async function loadTechnicians() {
    const tableBody = document.getElementById('tableTechnicians');
    tableBody.innerHTML = '<tr><td colspan="2" class="text-center text-muted">Loading...</td></tr>';

    try {
        const { data, error } = await supabase
            .from('technicians')
            .select(`
                name,
                departments (name)
            `)
            .order('name', { ascending: true });

        if (error) throw error;

        tableBody.innerHTML = '';
        if (data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="2" class="text-center text-muted">No technicians found.</td></tr>';
            return;
        }

        data.forEach(tech => {
            const deptName = tech.departments ? tech.departments.name : 'Unknown';
            tableBody.innerHTML += `
                <tr>
                    <td class="fw-bold">${tech.name}</td>
                    <td>${deptName}</td>
                </tr>
            `;
        });

    } catch (error) {
        console.error("Error loading technicians:", error.message);
        tableBody.innerHTML = '<tr><td colspan="2" class="text-center text-danger">Failed to load.</td></tr>';
    }
}

// --- SAVE WORKFLOWS ---

async function saveDepartment(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const name = document.getElementById('deptName').value.trim();

    btn.disabled = true;
    try {
        const { error } = await supabase.from('departments').insert([{ name }]);
        if (error) throw error;

        showAlert(`Department '${name}' added successfully.`, 'success');
        e.target.reset();
        await loadDepartments(); // Refresh list and dropdowns
    } catch (error) {
        console.error("Save Dept Error:", error.message);
        showAlert("Failed to save department.", "error");
    } finally {
        btn.disabled = false;
    }
}

async function saveMaterial(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    
    const material_id = document.getElementById('matId').value.trim().toUpperCase();
    const name = document.getElementById('matName').value.trim();
    const department_id = document.getElementById('matDepartment').value;
    const price = parseFloat(document.getElementById('matPrice').value) || 0;
    const min_stock_level = parseInt(document.getElementById('matMinStock').value) || 0;

    btn.disabled = true;
    try {
        const { error } = await supabase.from('materials').insert([{
            material_id,
            name,
            department_id,
            price,
            min_stock_level
        }]);
        if (error) throw error;

        showAlert(`Material '${name}' added successfully.`, 'success');
        e.target.reset();
        await loadMaterials(); // Refresh list
    } catch (error) {
        console.error("Save Material Error:", error.message);
        showAlert("Failed to save material. Verify the Material ID is unique.", "error");
    } finally {
        btn.disabled = false;
    }
}

async function saveTechnician(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    
    const name = document.getElementById('techName').value.trim();
    const department_id = document.getElementById('techDepartment').value;

    btn.disabled = true;
    try {
        const { error } = await supabase.from('technicians').insert([{
            name,
            department_id
        }]);
        if (error) throw error;

        showAlert(`Technician '${name}' added successfully.`, 'success');
        e.target.reset();
        await loadTechnicians(); // Refresh list
    } catch (error) {
        console.error("Save Technician Error:", error.message);
        showAlert("Failed to save technician.", "error");
    } finally {
        btn.disabled = false;
    }
}
