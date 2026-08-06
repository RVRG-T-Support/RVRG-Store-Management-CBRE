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

}

//====================================================
// OPEN MATERIAL MANAGER
//====================================================

async function openMaterialManager(){

    const canvas=new bootstrap.Offcanvas(

        document.getElementById(

        "manageMaterialsCanvas"

        )

    );

    canvas.show();

    await loadManageMaterials();

}

//====================================================
// LOAD MANAGE MATERIALS
//====================================================

async function loadManageMaterials(){

    try{

        const {data,error}=await supabase

        .from("materials")

        .select(`
            id,
            material_code,
            material_name,
            category,
            brand,
            status
        `)

        .order("material_code");

        if(error) throw error;

        let html=`

        <table class="table table-sm table-hover align-middle">

        <thead class="table-success">

        <tr>

            <th>Code</th>

            <th>Material</th>

            <th>Category</th>

            <th>Brand</th>

            <th>Status</th>

            <th width="180">Action</th>

        </tr>

        </thead>

        <tbody>

        `;

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

                ${item.category??"-"}

            </td>

            <td>

                ${item.brand??"-"}

            </td>

            <td>

                <span class="badge bg-${item.status=="ACTIVE"?"success":"secondary"}">

                ${item.status}

                </span>

            </td>

            <td>

                <button
                class="btn btn-sm btn-primary"
                onclick="editMaterial(${item.id})">

                <i class="fa fa-pen"></i>

                </button>

                <button
                class="btn btn-sm btn-info"
                onclick="copyMaterial(${item.id})">

                <i class="fa fa-copy"></i>

                </button>

                <button
                class="btn btn-sm btn-danger"
                onclick="inactiveMaterial(${item.id})">

                <i class="fa fa-ban"></i>

                </button>

            </td>

            </tr>

            `;

        });

        html+=`

        </tbody>

        </table>

        `;

        document.getElementById(

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

        document.getElementById("materialCode").value=data.material_code;

        document.getElementById("materialName").value=data.material_name;

        document.getElementById("department").value=data.department_id;

        await loadCategories();

        document.getElementById("category").value=data.category_id;

        categoryChanged();

        document.getElementById("brand").value=data.brand??"";

        document.getElementById("itemType").value=data.item_type??"";

        document.getElementById("specification").value=data.specification??"";

        document.getElementById("itemSize").value=data.item_size??"";

        document.getElementById("unit").value=data.unit;

        document.getElementById("minimumStock").value=data.minimum_stock;

        document.getElementById("rackLocation").value=data.rack_location??"";

        document.getElementById("status").value=data.status;

        document.getElementById("unitCost").value=data.unit_cost;

        document.getElementById("gstType").value=data.gst_type;

        document.getElementById("gstPercentage").value=data.gst_percentage;

        document.getElementById("description").value=data.description??"";

        bootstrap.Offcanvas.getInstance(

        document.getElementById("manageMaterialsCanvas")

        ).hide();

    }

    catch(error){

        console.error(error);

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
