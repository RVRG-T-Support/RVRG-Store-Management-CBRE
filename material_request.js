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
// Load Department

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

// Handle Department Changes

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

// Load Technicans data

async function loadTechnicians(departmentId) {

    const techSelect = document.getElementById("technicianSelect");

    techSelect.innerHTML =
        `<option value="">Loading...</option>`;

    try {

        const { data, error } = await supabase
            .from("technicians")
            .select("id, technician_name")
            .eq("department_id", departmentId)
            .eq("is_active", true)
            .order("technician_name");

        if (error) throw error;

        techSelect.innerHTML =
            `<option value="">Select Technician</option>`;

        data.forEach(tech => {

            techSelect.innerHTML +=
                `<option value="${tech.id}">
                    ${tech.technician_name}
                </option>`;

        });

    }
    catch (err) {

        console.error(err);

        techSelect.innerHTML =
            `<option value="">No Technician</option>`;

    }

}

// Load Materials
async function loadMaterials(departmentId) {

    try {

        const { data, error } = await supabase
            .from("materials")
            .select(`
                id,
                material_name,
                unit,
                unit_cost,
                price,
                gst_type
            `)
            .eq("department_id", departmentId)
            .eq("is_active", true)
            .order("material_name");

        if (error) throw error;

        window.currentMaterials = data;

        const matSelect =
            document.getElementById("materialSelect");

        matSelect.innerHTML =
            `<option value="">Select Material</option>`;

        data.forEach(mat => {

            matSelect.innerHTML += `
                <option value="${mat.id}">
                    ${mat.material_name}
                </option>
            `;

        });

    }

    catch(err){

        console.error(err);

    }

}

// --- PRICE DISPLAY LOGIC ---

function handleMaterialChange(e){

    const materialId = Number(e.target.value);

    const material =
        window.currentMaterials.find(
            m => m.id === materialId
        );

    if(!material) return;

    document.getElementById("unitPriceDisplay")
        .innerHTML =
        "₹ " + Number(material.unit_cost).toFixed(2);

    document.getElementById("gstNote")
        .innerHTML =
        "GST : " +
        material.gst_type;

}

// --- SUBMIT TICKET LOGIC ---
async function submitMaterialRequest(e) {

    e.preventDefault();

    const user = getCurrentUser();

    const locationType =
        document.getElementById("ticketType").value;

    const locationName =
        document.getElementById("locationInput").value;

    const technicianId =
        document.getElementById("technicianSelect").value;

    const materialId =
        document.getElementById("materialSelect").value;

    const qty =
        document.getElementById("requestQuantity").value;

    const remarks =
        document.getElementById("requestRemarks").value;

    try {

        const year = new Date().getFullYear();

        const random =
            Math.floor(1000 + Math.random() * 9000);

        const ticketNo =
            `MR-${year}-${random}`;

        const { error } = await supabase
            .from("material_requests")
            .insert([{

                ticket_no: ticketNo,

                location_type: locationType,

                location_name: locationName,

                technician_id: Number(technicianId),

                material_id: Number(materialId),

                requested_qty: Number(qty),

                remarks: remarks,

                request_status: "PENDING",

                requested_by: user.id

            }]);

        if (error) throw error;

        showAlert(
            "Request submitted successfully.",
            "success"
        );

        document
            .getElementById("materialRequestForm")
            .reset();

        loadRecentRequests();

    }

    catch(err){

        console.error(err);

        showAlert(
            err.message,
            "danger"
        );

    }

}

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

    const table =
        document.getElementById(
            "recentRequestsTable"
        );

    table.innerHTML =
        `<tr>
            <td colspan="5">
                Loading...
            </td>
        </tr>`;

    try {

        const { data, error } =
            await supabase

            .from("material_requests")

            .select(`
                ticket_no,
                location_name,
                location_type,
                requested_qty,
                request_status,
                created_at,
                materials (
                    material_name
                )
            `)

            .order("created_at",
                {ascending:false})

            .limit(10);

        if(error) throw error;

        table.innerHTML="";

        data.forEach(req=>{

            table.innerHTML += `

            <tr>

                <td>

                    ${req.ticket_no}

                </td>

                <td>

                    ${req.location_name}

                </td>

                <td>

                    ${req.materials?.material_name ?? "-"}

                </td>

                <td>

                    ${req.requested_qty}

                </td>

                <td>

                    ${getStatusBadge(
                        req.request_status
                    )}

                </td>

            </tr>

            `;

        });

    }

    catch(err){

        console.error(err);

        table.innerHTML=
        `<tr>
            <td colspan="5"
                class="text-danger">

                Failed to load requests

            </td>
        </tr>`;

    }

}

