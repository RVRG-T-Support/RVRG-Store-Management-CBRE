//====================================================
// MATERIAL MASTER
// RVRG Store Management Enterprise
//====================================================

var supabase = window.supabaseClient;
const currentUser = getCurrentUser();

document.addEventListener("DOMContentLoaded", initializePage);

async function initializePage() {
    try {
        await loadDepartments();
        initializeDefaults();
        registerEvents();
    }
   catch (error) {

    console.error("Material Master Error:", error);

    alert(error.message);

}
}

//====================================================
// DEFAULT VALUES
//====================================================

function initializeDefaults(){

    document.getElementById("gstPercentage").value = 18;

    document.getElementById("status").value = "ACTIVE";

    document.getElementById("minimumStock").value = 0;

}

//====================================================
// LOAD DEPARTMENTS
//====================================================

async function loadDepartments(){

    const department=document.getElementById("department");

    department.innerHTML=
    `<option value="">Select Department</option>`;

    const { data, error } = await supabase
    .from("departments")
    .select("id, department_name, prefix")
    .order("department_name");

    if(error) throw error;

    data.forEach(item=>{

        department.innerHTML+=`

        <option
            value="${item.id}"
            data-prefix="${item.prefix}">

            ${item.department_name}

        </option>

        `;

    });

}

//====================================================
// LOAD MANAGE DEPARTMENTS
//====================================================

async function loadManageDepartments(){

    try{

        const {data,error}=await supabase

        .from("departments")

        .select("id, department_name")

        .order("department_name");

        if(error) throw error;

        const ddl=document.getElementById("manageDepartment");

        ddl.innerHTML=
        `<option value="">All Departments</option>`;

        data.forEach(dept=>{

            ddl.innerHTML+=`

            <option value="${dept.id}">

                ${dept.department_name}

            </option>

            `;

        });

    }

    catch(error){

        console.error(error);

        showAlert(error.message,"danger");

    }

}

//====================================================
// LOAD MATERIAL CATEGORIES
//====================================================

async function loadCategories(){

    const deptId=
        document.getElementById("department").value;

    const category=
        document.getElementById("category");

    category.innerHTML=
    `<option value="">Select Category</option>`;

    document.getElementById(
        "materialShortName"
    ).value="";

    if(!deptId)
        return;

    const {data,error}=await supabase

        .from("material_categories")

        .select("*")

        .eq("department_id",deptId)

        .eq("is_active",true)

        .order("category_name");

    if(error)
        throw error;

    data.forEach(item=>{

        category.innerHTML+=`

        <option

        value="${item.id}"

        data-short="${item.short_code}">

        ${item.category_name}

        </option>

        `;

    });

}

//====================================================
// CATEGORY CHANGED
//====================================================

function categoryChanged(){

    const category=
        document.getElementById("category");

    if(category.selectedIndex<=0){

        document
        .getElementById(
        "materialShortName"
        ).value="";

        return;

    }

    document
    .getElementById(
    "materialShortName"
    ).value=

    category.options[
    category.selectedIndex
    ].dataset.short;

}

//====================================================
// EVENTS
//====================================================

function registerEvents(){

    // Generate Material Code
    document
        .getElementById("btnGenerateCode")
        .addEventListener("click", generateMaterialCode);

    // Department Changed
    document
        .getElementById("department")
        .addEventListener("change", loadCategories);

    // Category Changed
    document
        .getElementById("category")
        .addEventListener("change", categoryChanged);

    // Save
    document
        .getElementById("btnSave")
        .addEventListener("click", saveMaterial);

    // Refresh
    document
        .getElementById("btnRefresh")
        .addEventListener("click", initializePage);

    // New Material
    document
        .getElementById("btnNewMaterial")
        .addEventListener("click", clearMaterialForm);

    // Manage Materials
    document
        .getElementById("btnManageMaterials")
        .addEventListener("click", openMaterialManager);

    // Export Excel
    document
        .getElementById("btnExportExcel")
        .addEventListener("click", exportMaterials);

    // Download Template
    document
        .getElementById("btnDownloadTemplate")
        .addEventListener("click", downloadTemplate);

    // Import Excel
    document
        .getElementById("btnImportExcel")
        .addEventListener("click", openImportDialog);

//======================================
// MANAGE MATERIAL FILTERS
//======================================

document
.getElementById("manageSearch")
.addEventListener("keyup", loadManageMaterials);

document
.getElementById("manageDepartment")
.addEventListener("change", loadManageMaterials);

document
.getElementById("manageStatus")
.addEventListener("change", loadManageMaterials);

}

//====================================================
// OPEN MATERIAL MANAGER
//====================================================

async function openMaterialManager(){

    await loadManageDepartments();

    await loadManageMaterials();

    const canvas=new bootstrap.Offcanvas(

        document.getElementById(

            "manageMaterialsCanvas"

        )

    );

    canvas.show();

}

//====================================================
// LOAD MANAGE MATERIALS
//====================================================

async function loadManageMaterials(){

    try{

        const search =
        document.getElementById("manageSearch").value.trim();

        const department =
        document.getElementById("manageDepartment").value;

        const status =
        document.getElementById("manageStatus").value;

        let query = supabase

            .from("materials")

            .select(`
                id,
                material_code,
                material_name,
                category,
                brand,
                department_id,
                status
            `)

            .order("material_code");

        if(search!=""){

           query = query.or(
    `material_code.ilike.%${search}%,material_name.ilike.%${search}%,brand.ilike.%${search}%`
);
            ;

        }

        if(department!=""){

            query=query.eq(

            "department_id",

            department

            );

        }

        if(status!=""){

            query=query.eq(

            "status",

            status

            );

        }

        const {data,error}=await query;

        if(error) throw error;

        let html=`

        <div class="table-responsive">

        <table class="table table-hover table-bordered align-middle">

        <thead class="table-success">

        <tr>

            <th width="130">Code</th>

            <th>Material</th>

            <th>Category</th>

            <th>Brand</th>

            <th width="90">Status</th>

            <th width="170">Action</th>

        </tr>

        </thead>

        <tbody>

        `;

        if(data.length==0){

            html+=`

            <tr>

            <td colspan="6"

            class="text-center text-muted">

            No Materials Found

            </td>

            </tr>

            `;

        }

        data.forEach(item=>{

            html+=`

            <tr>

            <td>

            ${item.material_code}

            </td>

            <td>

            ${item.material_name}

            </td>

            <td>

            ${item.category ?? "-"}

            </td>

            <td>

            ${item.brand ?? "-"}

            </td>

            <td>

            <span class="badge bg-${
            item.status=="ACTIVE"
            ?"success"
            :"secondary"
            }">

            ${item.status}

            </span>

            </td>

            <td>

<button
class="btn btn-sm btn-primary me-1"
onclick="editMaterial(${item.id})">

<i class="fa-solid fa-pen"></i>

Edit

</button>

<button
class="btn btn-sm btn-secondary me-1"
onclick="copyMaterial(${item.id})">

<i class="fa-solid fa-copy"></i>

Copy

</button>

<button
class="btn btn-sm btn-danger"
onclick="inactiveMaterial(${item.id})">

<i class="fa-solid fa-ban"></i>

Inactive

</button>

            </td>

            </tr>

            `;

        });

        html+=`

        </tbody>

        </table>

        </div>

        `;

        document

        .getElementById(

        "manageMaterialList"

        ).innerHTML=html;

    }

    catch(error){

        console.error(error);

        showAlert(error.message,"danger");

    }

}

//====================================================
// EDIT MATERIAL
//====================================================

async function editMaterial(id){

    try{

        const {data,error}=await supabase
            .from("materials")
            .select("*")
            .eq("id",id)
            .single();

        if(error) throw error;

        document.getElementById("materialId").value=data.id;

        document.getElementById("materialCode").value=
            data.material_code || "";

        document.getElementById("materialName").value=
            data.material_name || "";

        document.getElementById("department").value=
            data.department_id;

        await loadCategories();

        document.getElementById("category").value=
            data.category_id;

        categoryChanged();

        document.getElementById("brand").value=
            data.brand || "";

        document.getElementById("itemType").value=
            data.item_type || "";

        document.getElementById("specification").value=
            data.specification || "";

        document.getElementById("itemSize").value=
            data.item_size || "";

        document.getElementById("unit").value=
            data.unit || "";

        document.getElementById("minimumStock").value=
            data.minimum_stock || 0;

        document.getElementById("rackLocation").value=
            data.rack_location || "";

        document.getElementById("status").value=
            data.status || "ACTIVE";

        document.getElementById("unitCost").value=
            data.unit_cost || 0;

        document.getElementById("gstType").value=
            data.gst_type || "INCLUDED";

        document.getElementById("gstPercentage").value=
            data.gst_percentage || 18;

        document.getElementById("description").value=
            data.description || "";

        // Close Manage Materials
        const canvasElement =
            document.getElementById("manageMaterialsCanvas");

        const canvas =
            bootstrap.Offcanvas.getInstance(canvasElement);

        if(canvas){
            canvas.hide();
        }

        // Switch buttons

document.getElementById("btnSave")
    .style.display="none";

document.getElementById("btnClear")
    .style.display="none";

document.getElementById("btnUpdate")
    .style.display="inline-block";

document.getElementById("btnDelete")
    .style.display="inline-block";

    }

    catch(error){

        console.error("Edit Material Error:",error);

        showAlert(error.message,"danger");

    }

}
//====================================================
// GENERATE MATERIAL CODE
//====================================================

async function generateMaterialCode(){

    try{

        const dept=document.getElementById("department");

        const materialName=document
            .getElementById("materialName")
            .value
            .trim();

        const shortName=document
            .getElementById("materialShortName")
            .value
            .trim()
            .toUpperCase();

        const specification=document
            .getElementById("specification")
            .value
            .trim()
            .toUpperCase();

        if(dept.selectedIndex<=0){

            showAlert("Select Department","warning");

            return;

        }

        if(materialName==""){

            showAlert("Enter Material Name","warning");

            return;

        }

        let prefix=
            dept.options[
                dept.selectedIndex
            ].dataset.prefix;

        if(!prefix){

            showAlert("Department Prefix Missing","danger");

            return;

        }

        let code=prefix;

        if(shortName!=""){

            code+="-"+cleanCode(shortName);

        }

        if(specification!=""){

            code+="-"+cleanCode(specification);

        }

        code=await getUniqueMaterialCode(code);

        document
            .getElementById("materialCode")
            .value=code;

    }

    catch(error){

        console.error(error);

        showAlert(error.message,"danger");

    }

}

//====================================================
// CLEAN CODE
//====================================================

function cleanCode(text){

    return text

        .replace(/\s+/g,"-")

        .replace(/\//g,"-")

        .replace(/[^\w-]/g,"")

        .toUpperCase();

}

//====================================================
// CHECK DUPLICATE CODE
//====================================================

async function getUniqueMaterialCode(baseCode){

    let finalCode=baseCode;

    let count=1;

    while(true){

        const {data,error}=await supabase

            .from("materials")

            .select("id")

            .eq("material_code",finalCode);

        if(error) throw error;

        if(data.length==0){

            return finalCode;

        }

        finalCode=baseCode+"-"+String(count).padStart(2,"0");

        count++;

    }

}

//====================================================
// TEMP PLACEHOLDERS
//====================================================

function clearMaterialForm(){

    document.getElementById("materialForm").reset();

    initializeDefaults();

    document.getElementById("materialCode").value="";
    document.getElementById("materialShortName").value="";
    document.getElementById("category").innerHTML =
        '<option value="">Select Category</option>';

}

function exportMaterials(){

    showAlert("Export Excel - Coming in Part 5","info");

}

function downloadTemplate(){

    showAlert("Download Template - Coming in Part 6","info");

}

function openImportDialog(){

    const modal = new bootstrap.Modal(
        document.getElementById("importModal")
    );

    modal.show();

}

//====================================================
// SAVE MATERIAL
//====================================================

async function saveMaterial(){

    try{

        // Validation

        if(document.getElementById("department").value==""){

            showAlert("Select Department","warning");
            return;

        }

        if(document.getElementById("category").value==""){

            showAlert("Select Category","warning");
            return;

        }

        if(document.getElementById("materialName").value.trim()==""){

            showAlert("Enter Material Name","warning");
            return;

        }

        if(document.getElementById("materialCode").value.trim()==""){

            await generateMaterialCode();

        }

        const material={

            material_code:
                document.getElementById("materialCode").value.trim(),

            material_name:
                document.getElementById("materialName").value.trim(),

            department_id:
                Number(document.getElementById("department").value),

            category:
                document.getElementById("category").value,

            brand:
                document.getElementById("brand").value.trim(),

            item_type:
                document.getElementById("itemType").value,

            specification:
                document.getElementById("specification").value.trim(),

            item_size:
                document.getElementById("itemSize").value.trim(),

            unit:
                document.getElementById("unit").value,

            minimum_stock:
                Number(document.getElementById("minimumStock").value || 0),

            rack_location:
                document.getElementById("rackLocation").value.trim(),

            status:
                document.getElementById("status").value,

            unit_cost:
                Number(document.getElementById("unitCost").value || 0),

            gst_type:
                document.getElementById("gstType").value,

            gst_percentage:
                Number(document.getElementById("gstPercentage").value || 0),

            material_short_name:
                document.getElementById("materialShortName").value,

            description:
                document.getElementById("description").value.trim(),

            is_active:true

        };

        // Duplicate Check

        const {data:duplicate}=await supabase

            .from("materials")

            .select("id")

            .eq("material_code",material.material_code);

        if(duplicate.length){

            showAlert("Material Code already exists","danger");

            return;

        }

        const {error}=await supabase

            .from("materials")

            .insert(material);

        if(error)
            throw error;

        showAlert("Material Saved Successfully","success");

        clearMaterialForm();

        await loadManageMaterials();

    }

    catch(error){

        console.error(error);

        showAlert(error.message,"danger");

    }

}
