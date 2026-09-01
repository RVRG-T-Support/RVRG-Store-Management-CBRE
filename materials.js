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

       // Load Main Material Master List
await loadMaterialList();

// Load Manage Materials
await loadManageMaterials();
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

    // Save //
    document
        .getElementById("btnSave")
        .addEventListener("click", saveMaterial);
    
    // Update
    document
    .getElementById("btnUpdate")
    .addEventListener("click", updateMaterial);

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
// LOAD MAIN MATERIAL MASTER LIST
//====================================================

async function loadMaterialList(){

    try{

        const search =
            document.getElementById("searchMaterial").value.trim();

        const department =
            document.getElementById("filterDepartment").value;

        const status =
            document.getElementById("filterStatus").value;

        const {
            data: departments,
            error: departmentError
        } = await supabase
            .from("departments")
            .select("id, department_name")
            .order("department_name");

        if(departmentError) throw departmentError;

        const departmentMap = {};

        (departments || []).forEach(dept => {

            departmentMap[String(dept.id)] =
                dept.department_name;

        });

        let query = supabase
            .from("materials")
            .select(`
                id,
                material_code,
                material_name,
                department_id,
                category,
                brand,
                unit,
                unit_cost,
                minimum_stock,
                rack_location,
                status
            `)
            .order("material_code");

        if(search){

            query = query.or(
                `material_code.ilike.%${search}%,material_name.ilike.%${search}%,brand.ilike.%${search}%`
            );

        }

        if(department){

            query = query.eq(
                "department_id",
                department
            );

        }

        if(status){

            query = query.eq(
                "status",
                status
            );

        }

        const {data,error} = await query;

        if(error) throw error;

        const tbody =
            document.getElementById("materialTableBody");

        const recordCount =
            document.getElementById("recordCount");

        if(!tbody) return;

        if(!data || data.length === 0){

            tbody.innerHTML = `
                <tr>
                    <td colspan="11"
                        class="text-center text-muted">
                        No Materials Found
                    </td>
                </tr>
            `;

            if(recordCount)
                recordCount.textContent = "0 Records";

            return;
        }

        let html = "";

        data.forEach(item => {

            const departmentName =
                departmentMap[
                    String(item.department_id)
                ] || "-";

            html += `
                <tr>

                    <td>${item.material_code || "-"}</td>

                    <td>${item.material_name || "-"}</td>

                    <td>${departmentName}</td>

                    <td>${item.category || "-"}</td>

                    <td>${item.brand || "-"}</td>

                    <td>${item.unit || "-"}</td>

                    <td>₹${item.unit_cost ?? 0}</td>

                    <td>${item.minimum_stock ?? 0}</td>

                    <td>${item.rack_location || "-"}</td>

                    <td>
                        <span class="badge ${
                            item.status === "ACTIVE"
                            ? "bg-success"
                            : "bg-secondary"
                        }">
                            ${item.status || "-"}
                        </span>
                    </td>

                    <td>

                        <button
                            type="button"
                            class="btn btn-sm btn-primary"
                            onclick="editMaterial(${item.id})">

                            <i class="fa-solid fa-pen"></i>

                        </button>

                    </td>

                </tr>
            `;

        });

        tbody.innerHTML = html;

        if(recordCount){

            recordCount.textContent =
                `${data.length} Records`;

        }

    }

    catch(error){

        console.error(
            "Main Material List Error:",
            error
        );

        const tbody =
            document.getElementById("materialTableBody");

        if(tbody){

            tbody.innerHTML = `
                <tr>
                    <td colspan="11"
                        class="text-center text-danger">
                        Unable to load Material Master
                    </td>
                </tr>
            `;

        }

    }

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
// UPDATE MATERIAL
//====================================================

async function updateMaterial(){

    try{

        const materialId =
            document.getElementById("materialId").value;

        if(!materialId){

            showAlert(
                "No material selected for update",
                "danger"
            );

            return;
        }

        // Required fields

        if(
            document.getElementById("department").value === ""
        ){

            showAlert(
                "Select Department",
                "warning"
            );

            return;
        }

        if(
            document.getElementById("category").value === ""
        ){

            showAlert(
                "Select Category",
                "warning"
            );

            return;
        }

        if(
            document.getElementById("materialName").value.trim() === ""
        ){

            showAlert(
                "Enter Material Name",
                "warning"
            );

            return;
        }

        // Category

        const categoryElement =
            document.getElementById("category");

        const categoryId =
            Number(categoryElement.value);

        const categoryName =
            categoryElement.options[
                categoryElement.selectedIndex
            ].text;

        // Searchable text

        const searchableText = (

            document.getElementById("materialCode").value + " " +

            document.getElementById("materialName").value + " " +

            categoryName + " " +

            document.getElementById("brand").value + " " +

            document.getElementById("specification").value + " " +

            document.getElementById("itemSize").value

        ).toUpperCase();

        // Update Supabase

        const {error} = await supabase

            .from("materials")

            .update({

                material_name:
                    document.getElementById("materialName").value.trim(),

                department_id:
                    Number(
                        document.getElementById("department").value
                    ),

                category_id:
                    categoryId,

                category:
                    categoryName,

                material_short_name:
                    document
                        .getElementById("materialShortName")
                        .value
                        .trim(),

                brand:
                    document.getElementById("brand").value.trim(),

                item_type:
                    document.getElementById("itemType").value,

                specification:
                    document
                        .getElementById("specification")
                        .value
                        .trim(),

                item_size:
                    document
                        .getElementById("itemSize")
                        .value
                        .trim(),

                unit:
                    document.getElementById("unit").value,

                minimum_stock:
                    Number(
                        document.getElementById("minimumStock").value || 0
                    ),

                rack_location:
                    document
                        .getElementById("rackLocation")
                        .value
                        .trim(),

                status:
                    document.getElementById("status").value,

                unit_cost:
                    Number(
                        document.getElementById("unitCost").value || 0
                    ),

                gst_type:
                    document.getElementById("gstType").value,

                gst_percentage:
                    Number(
                        document.getElementById("gstPercentage").value || 0
                    ),

                description:
                    document
                        .getElementById("description")
                        .value
                        .trim(),

                searchable_text:
                    searchableText

            })

            .eq("id", materialId);

        if(error)
            throw error;

        showAlert(
            "Material Updated Successfully",
            "success"
        );

        // Return to New Material mode

        clearMaterialForm();

        // Refresh material list

        await loadManageMaterials();

    }

    catch(error){

        console.error(
            "Update Material Error:",
            error
        );

        showAlert(
            error.message,
            "danger"
        );

    }

}
//====================================================
// GENERATE MATERIAL CODE
//====================================================

async function generateMaterialCode(){

    try{
                // Do not regenerate code while editing
        const materialId =
            document.getElementById("materialId").value;

        if(materialId){
            showAlert(
                "Material Code cannot be changed while editing.",
                "warning"
            );
            return;
        }

        const dept =
            document.getElementById("department");

        const materialName =
            document.getElementById("materialName")
                .value
                .trim();

        const shortName =
            document.getElementById("materialShortName")
                .value
                .trim()
                .toUpperCase();

        const specification =
            document.getElementById("specification")
                .value
                .trim()
                .toUpperCase();

        if(dept.selectedIndex <= 0){

            showAlert(
                "Select Department",
                "warning"
            );

            return;
        }

        if(materialName == ""){

            showAlert(
                "Enter Material Name",
                "warning"
            );

            return;
        }

        let prefix =
            dept.options[
                dept.selectedIndex
            ].dataset.prefix;

        if(!prefix){

            showAlert(
                "Department Prefix Missing",
                "danger"
            );

            return;
        }

        let code = prefix;

        if(shortName != ""){

            code += "-" + cleanCode(shortName);

        }

        if(specification != ""){

            code += "-" + cleanCode(specification);

        }

        code =
            await getUniqueMaterialCode(code);

        document
            .getElementById("materialCode")
            .value = code;

    }

    catch(error){

        console.error(
            "Generate Material Code Error:",
            error
        );

        showAlert(
            error.message,
            "danger"
        );

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
// GET UNIQUE MATERIAL CODE
//====================================================

async function getUniqueMaterialCode(baseCode){

    let finalCode = baseCode;

    let count = 1;

    while(true){

        const {data,error} = await supabase

            .from("materials")

            .select("id")

            .eq(
                "material_code",
                finalCode
            );

        if(error)
            throw error;

        if(data.length == 0){

            return finalCode;

        }

        finalCode =
            baseCode +
            "-" +
            String(count).padStart(2,"0");

        count++;

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
        document.getElementById("btnGenerateCode").disabled=true;

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
// UPDATE MATERIAL
//====================================================

async function updateMaterial(){

    try{

        // Get Material ID
        const materialId =
            document.getElementById("materialId").value;

        if(!materialId){

            showAlert(
                "No material selected for update",
                "danger"
            );

            return;
        }

        // Validation
        if(
            document.getElementById("department").value === ""
        ){

            showAlert(
                "Select Department",
                "warning"
            );

            return;
        }

        if(
            document.getElementById("category").value === ""
        ){

            showAlert(
                "Select Category",
                "warning"
            );

            return;
        }

        if(
            document.getElementById("materialName").value.trim() === ""
        ){

            showAlert(
                "Enter Material Name",
                "warning"
            );

            return;
        }

        // Category information
        const categoryElement =
            document.getElementById("category");

        const categoryId =
            Number(categoryElement.value);

        const categoryName =
            categoryElement.options[
                categoryElement.selectedIndex
            ].text;

        // Searchable text
        const searchableText = (

            document.getElementById("materialCode").value + " " +

            document.getElementById("materialName").value + " " +

            categoryName + " " +

            document.getElementById("brand").value + " " +

            document.getElementById("specification").value + " " +

            document.getElementById("itemSize").value

        ).toUpperCase();

        // Update database
        const {error} = await supabase

            .from("materials")

            .update({

                material_name:
                    document.getElementById("materialName").value.trim(),

                department_id:
                    Number(
                        document.getElementById("department").value
                    ),

                category_id:
                    categoryId,

                category:
                    categoryName,

                material_short_name:
                    document.getElementById("materialShortName").value.trim(),

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
                    Number(
                        document.getElementById("minimumStock").value || 0
                    ),

                rack_location:
                    document.getElementById("rackLocation").value.trim(),

                status:
                    document.getElementById("status").value,

                unit_cost:
                    Number(
                        document.getElementById("unitCost").value || 0
                    ),

                gst_type:
                    document.getElementById("gstType").value,

                gst_percentage:
                    Number(
                        document.getElementById("gstPercentage").value || 0
                    ),

                description:
                    document.getElementById("description").value.trim(),

                searchable_text:
                    searchableText

            })

            .eq("id", materialId);

        if(error)
            throw error;

        showAlert(
            "Material Updated Successfully",
            "success"
        );

        // Reset form to New Material mode
        clearMaterialForm();

        // Refresh Manage Materials data
        await loadManageMaterials();

    }

    catch(error){

        console.error(
            "Update Material Error:",
            error
        );

        showAlert(
            error.message,
            "danger"
        );

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
// CLEAR / NEW MATERIAL
//====================================================

function clearMaterialForm(){

    document
        .getElementById("materialForm")
        .reset();

    initializeDefaults();

    // Clear hidden database ID
    document
        .getElementById("materialId")
        .value="";

    // Clear generated values
    document
        .getElementById("materialCode")
        .value="";

    document
        .getElementById("materialShortName")
        .value="";

    // Reset category
    document
        .getElementById("category")
        .innerHTML =
        '<option value="">Select Category</option>';

    // Enable Generate Code for new material
    document
        .getElementById("btnGenerateCode")
        .disabled=false;

    // New Material button state
    document
        .getElementById("btnSave")
        .style.display="inline-block";

    document
        .getElementById("btnClear")
        .style.display="inline-block";

    document
        .getElementById("btnUpdate")
        .style.display="none";

    document
        .getElementById("btnDelete")
        .style.display="none";

}

//====================================================
// EXPORT MATERIAL MASTER TO EXCEL
//====================================================

async function exportMaterials(){

    try{

        const { data, error } = await supabase

            .from("materials")

            .select(`
                material_code,
                material_name,
                department_id,
                category,
                brand,
                item_type,
                specification,
                item_size,
                unit,
                minimum_stock,
                rack_location,
                status,
                unit_cost,
                gst_type,
                gst_percentage,
                description
            `)

            .order("material_code");

        if(error)
            throw error;


        // Load department names

        const {
            data: departments,
            error: departmentError
        } = await supabase

            .from("departments")

            .select("id, department_name");

        if(departmentError)
            throw departmentError;


        const departmentMap = {};

        (departments || []).forEach(dept => {

            departmentMap[String(dept.id)] =
                dept.department_name;

        });


        // Convert database data to Excel format

        const excelData = (data || []).map(item => ({

            "Material Code":
                item.material_code || "",

            "Material Name":
                item.material_name || "",

            "Department":
                departmentMap[
                    String(item.department_id)
                ] || "",

            "Category":
                item.category || "",

            "Brand":
                item.brand || "",

            "Item Type":
                item.item_type || "",

            "Specification":
                item.specification || "",

            "Item Size":
                item.item_size || "",

            "Unit":
                item.unit || "",

            "Minimum Stock":
                item.minimum_stock ?? 0,

            "Rack Location":
                item.rack_location || "",

            "Status":
                item.status || "",

            "Unit Cost":
                item.unit_cost ?? 0,

            "GST Type":
                item.gst_type || "",

            "GST %":
                item.gst_percentage ?? 0,

            "Description":
                item.description || ""

        }));


        // Create Excel worksheet

        const worksheet =
            XLSX.utils.json_to_sheet(excelData);


        // Create workbook

        const workbook =
            XLSX.utils.book_new();


        XLSX.utils.book_append_sheet(
            workbook,
            worksheet,
            "Material Master"
        );


        // Download

        XLSX.writeFile(
            workbook,
            "RVRG_Material_Master.xlsx"
        );


        showAlert(
            `${excelData.length} materials exported successfully`,
            "success"
        );

    }

    catch(error){

        console.error(
            "Export Material Error:",
            error
        );

        showAlert(
            "Unable to export Material Master: " +
            error.message,
            "danger"
        );

    }

}
//====================================================
// DOWNLOAD MATERIAL MASTER EXCEL TEMPLATE
//====================================================

function downloadTemplate(){

    try{

        const templateData = [
    {
        Material_Code: "",
        Department: "",
        Category: "",
        Material_Name: "",
        Brand: "",
        Item_Type: "",
        Item_Size: "",
        Specification: "",
        Unit: "",
        Opening_Stock: 0,
        Minimum_Stock: 0,
        Rack_Location: "",
        Unit_Cost: "",
        GST_Type: "INCLUDED",
        GST_Percentage: 18,
        Description: "",
        Status: "ACTIVE"
    }
];
        const ws =
            XLSX.utils.json_to_sheet(templateData);

        const wb =
            XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(
            wb,
            ws,
            "Material_Master"
        );

        XLSX.writeFile(
            wb,
            "RVRG_Material_Master_Template.xlsx"
        );

        showAlert(
            "Material Master Template Downloaded",
            "success"
        );

    }

    catch(error){

        console.error(
            "Template Download Error:",
            error
        );

        showAlert(
            "Unable to download template. Please check whether Excel library is loaded.",
            "danger"
        );

    }

}

function openImportDialog(){

    const modal = new bootstrap.Modal(
        document.getElementById("importModal")
    );

    modal.show();

}

//====================================================
// EXCEL IMPORT - HEADER NORMALIZATION
//====================================================
// From here to save material code saved in notepad

let importedMaterialRows = [];

function normalizeExcelHeader(value){

    return String(value ?? "")
        .replace(/^\uFEFF/, "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "");

}

function getExcelValue(row, aliases){

    const keys = Object.keys(row || {});
    const wanted = aliases.map(normalizeExcelHeader);

    for(const key of keys){

        if(wanted.includes(normalizeExcelHeader(key))){
            return row[key];
        }

    }

    return "";

}

function normalizeImportedRow(row){
    return {
        Material_Code:
            String(getExcelValue(row, [
                "Material_Code",
                "Material Code",
                "MaterialCode",
                "Code"
            ])).trim(),

        Department:
    String(getExcelValue(row, [
        "Department",
        "Department Name",
        "Department Code",
        "Dept",
        "Dept Code",
        "Department_Name",
        "Department_Code"
    ])).trim(),
        Category:
            String(getExcelValue(row, [
                "Category",
                "Category Name",
                "Material Category",
                "Category_Name"
            ])).trim(),

        Material_Name:
            String(getExcelValue(row, [
                "Material_Name",
                "Material Name",
                "MaterialName",
                "Item Name",
                "Item_Name"
            ])).trim(),

        Brand:
            String(getExcelValue(row, [
                "Brand"
            ])).trim(),

        Item_Type:
            String(getExcelValue(row, [
                "Item_Type",
                "Item Type",
                "ItemType"
            ])).trim(),

        Item_Size:
            String(getExcelValue(row, [
                "Item_Size",
                "Item Size",
                "ItemSize"
            ])).trim(),

        Specification:
            String(getExcelValue(row, [
                "Specification",
                "Spec"
            ])).trim(),

        Unit:
            String(getExcelValue(row, [
                "Unit",
                "UOM"
            ])).trim(),

        Minimum_Stock:
            getExcelValue(row, [
                "Minimum_Stock",
                "Minimum Stock",
                "MinimumStock",
                "Min Stock"
            ]),
        
    Opening_Stock:
    getExcelValue(row, [
        "Opening_Stock",
        "Opening Stock",
        "OpeningStock",
        "Opening Qty",
        "Opening Quantity",
        "Opening_Quantity",
        "Stock",
        "Quantity"
    ]),
        
        Rack_Location:
            String(getExcelValue(row, [
                "Rack_Location",
                "Rack Location",
                "RackLocation"
            ])).trim(),

        Unit_Cost:
            getExcelValue(row, [
                "Unit_Cost",
                "Unit Cost",
                "UnitCost",
                "Cost"
            ]),

        GST_Type:
            String(getExcelValue(row, [
                "GST_Type",
                "GST Type",
                "GSTType"
            ])).trim(),

        GST_Percentage:
            getExcelValue(row, [
                "GST_Percentage",
                "GST Percentage",
                "GST %",
                "GSTPercent"
            ]),

        Description:
            String(getExcelValue(row, [
                "Description",
                "Remarks"
            ])).trim(),

        Status:
            String(getExcelValue(row, [
                "Status"
            ])).trim()

    };

}

//====================================================
// REGISTER EXCEL IMPORT EVENTS
//====================================================

document.addEventListener(
    "DOMContentLoaded",
    function(){

        const excelFile =
            document.getElementById("excelFile");

        const btnImportNow =
            document.getElementById("btnImportNow");


        // --------------------------------------------
        // EXCEL FILE CHANGE
        // --------------------------------------------

        if(
            excelFile &&
            !excelFile.dataset.importBound
        ){

            excelFile.addEventListener(
                "change",
                handleExcelFile
            );

            excelFile.dataset.importBound =
                "true";
        }


        // --------------------------------------------
        // IMPORT BUTTON
        // --------------------------------------------

        if(
            btnImportNow &&
            !btnImportNow.dataset.importBound
        ){

            btnImportNow.addEventListener(
                "click",
                importMaterialsFromExcel
            );

            btnImportNow.dataset.importBound =
                "true";
        }

    }
);

//====================================================
// READ EXCEL FILE
//====================================================

async function handleExcelFile(event){

    try{

        const file =
            event.target.files[0];

        if(!file){
            return;
        }

        if(typeof XLSX === "undefined"){

            showAlert(
                "Excel library is not loaded.",
                "danger"
            );

            return;

        }

        const reader =
            new FileReader();

        reader.onload = async function(e){

            try{

                const workbook =
                    XLSX.read(
                        e.target.result,
                        {
                            type:"array"
                        }
                    );

                const sheetName =
                    workbook.SheetNames[0];

                const worksheet =
                    workbook.Sheets[sheetName];

                const rawRows =
                    XLSX.utils.sheet_to_json(
                        worksheet,
                        {
                            defval:""
                        }
                    );

                if(!rawRows.length){

                    showAlert(
                        "Excel file contains no data.",
                        "warning"
                    );

                    return;

                }

                importedMaterialRows =
                    rawRows.map(
                        normalizeImportedRow
                    );

                await previewImportedMaterials(
                    importedMaterialRows
                );

            }
            catch(error){

                console.error(
                    "Excel Read Error:",
                    error
                );

                showAlert(
                    "Unable to read Excel file: " +
                    error.message,
                    "danger"
                );

            }

        };

        reader.readAsArrayBuffer(file);

    }
    catch(error){

        console.error(error);

        showAlert(
            error.message,
            "danger"
        );

    }

}

//====================================================
// PREVIEW EXCEL DATA
//====================================================

async function previewImportedMaterials(rows){

    const previewArea =
        document.getElementById("previewArea");

    if(!previewArea){
        return;
    }

    try{

        // ====================================================
        // LOAD EXISTING MATERIALS
        // ====================================================

        const {
            data: existingMaterials,
            error: materialError
        } = await supabase
            .from("materials")
            .select(`
                id,
                material_code,
                material_name
            `);

        if(materialError){
            throw materialError;
        }


        // ====================================================
        // LOAD CURRENT STOCK
        // ====================================================

        const {
            data: stockData,
            error: stockError
        } = await supabase
            .from("current_stock")
            .select(`
                material_id,
                current_stock
            `);

        if(stockError){
            throw stockError;
        }


        // ====================================================
        // CREATE LOOKUPS
        // ====================================================

        const materialCodeMap = {};

        (existingMaterials || []).forEach(
            material => {

                const code =
                    String(
                        material.material_code || ""
                    )
                    .trim()
                    .toUpperCase();

                if(code){

                    materialCodeMap[code] =
                        material;

                }

            }
        );


        const stockMap = {};

        (stockData || []).forEach(
            stock => {

                stockMap[
                    String(stock.material_id)
                ] =
                    Number(
                        stock.current_stock || 0
                    );

            }
        );


        // ====================================================
        // BUILD PREVIEW
        // ====================================================

        let newCount = 0;
        let existingCount = 0;

        let totalExcelQty = 0;
        let totalAfterQty = 0;


        let html = `

        <div class="alert alert-info">

            <b>${rows.length}</b>
            material(s) found in Excel.

            <br><br>

            <b>Green = New Material</b><br>
            <b>Yellow = Existing Material — Additional Stock</b>

        </div>


        <div class="table-responsive"
             style="max-height:450px;overflow:auto;">

            <table class="table table-bordered table-sm">

                <thead class="table-dark">

                    <tr>

                        <th>#</th>
                        <th>Material Code</th>
                        <th>Material Name</th>
                        <th>Status</th>
                        <th>Current Stock</th>
                        <th>Excel Qty</th>
                        <th>After Import</th>

                    </tr>

                </thead>

                <tbody>
        `;


        rows.forEach(
            (row,index) => {

                const code =
                    String(
                        row.Material_Code || ""
                    )
                    .trim()
                    .toUpperCase();


                const existingMaterial =
                    code
                        ? materialCodeMap[code]
                        : null;


                const excelQty =
                    Number(
                        row.Opening_Stock || 0
                    );


                let currentStock = 0;

                let afterImport =
                    excelQty;


                let statusText =
                    "NEW";

                let statusClass =
                    "table-success";


                if(existingMaterial){

                    existingCount++;

                    currentStock =
                        Number(
                            stockMap[
                                String(
                                    existingMaterial.id
                                )
                            ] || 0
                        );

                    afterImport =
                        currentStock +
                        excelQty;

                    statusText =
                        "EXISTING";

                    statusClass =
                        "table-warning";

                }
                else{

                    newCount++;

                }


                totalExcelQty +=
                    excelQty;

                totalAfterQty +=
                    afterImport;


                html += `

                    <tr class="${statusClass}">

                        <td>
                            ${index + 1}
                        </td>

                        <td>
                            ${escapeHtml(
                                existingMaterial
                                    ? existingMaterial.material_code
                                    : code || "AUTO"
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                row.Material_Name || ""
                            )}
                        </td>

                        <td>

                            <span class="badge ${
                                existingMaterial
                                    ? "bg-warning text-dark"
                                    : "bg-success"
                            }">

                                ${statusText}

                            </span>

                        </td>

                        <td>
                            ${currentStock}
                        </td>

                        <td>
                            ${excelQty}
                        </td>

                        <td>
                            <b>${afterImport}</b>
                        </td>

                    </tr>

                `;

            }
        );


        html += `

                </tbody>

            </table>

        </div>


        <div class="alert alert-secondary mt-3">

            <div>
                <b>New Materials:</b>
                ${newCount}
            </div>

            <div>
                <b>Existing Materials:</b>
                ${existingCount}
            </div>

            <div>
                <b>Excel Quantity:</b>
                ${totalExcelQty}
            </div>

            <div>
                <b>Total Stock After Import:</b>
                ${totalAfterQty}
            </div>

            <hr>

            Existing materials will receive
            the Excel quantity as <b>additional stock</b>.
            
            <br>

            No existing stock will be overwritten.

        </div>

        `;


        previewArea.innerHTML =
            html;

    }
    catch(error){

        console.error(
            "Import Preview Error:",
            error
        );

        previewArea.innerHTML = `

            <div class="alert alert-danger">

                Unable to generate import preview.

                <br>

                ${escapeHtml(
                    error.message
                )}

            </div>

        `;

    }

}

function escapeHtml(value){

    return String(value ?? "")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#039;");

}

//====================================================
// GENERATE SEQUENTIAL MATERIAL CODE
//====================================================

async function generateImportMaterialCode(prefix){

    const cleanPrefix =
        String(prefix || "")
            .trim()
            .toUpperCase();

    if(!cleanPrefix){

        throw new Error(
            "Department Prefix Missing"
        );

    }

    const {data,error} =
        await supabase
            .from("materials")
            .select("material_code")
            .like(
                "material_code",
                cleanPrefix + "-%"
            );

    if(error){
        throw error;
    }

    let maxNumber = 0;

    (data || []).forEach(item => {

        const code =
            String(
                item.material_code || ""
            )
            .trim()
            .toUpperCase();

        const escapedPrefix =
            cleanPrefix.replace(
                /[-\/\\^$*+?.()|[\]{}]/g,
                "\\$&"
            );

        const match =
            code.match(
                new RegExp(
                    "^" +
                    escapedPrefix +
                    "-(\\d{3})$"
                )
            );

        if(match){

            const number =
                parseInt(
                    match[1],
                    10
                );

            if(number > maxNumber){
                maxNumber = number;
            }

        }

    });

    const nextNumber =
        maxNumber + 1;

    if(nextNumber > 999){

        throw new Error(
            "Material code limit reached for department " +
            cleanPrefix
        );

    }

    return (
        cleanPrefix +
        "-" +
        String(nextNumber)
            .padStart(3,"0")
    );

}
//====================================================
// NORMALIZE VALUE FOR DUPLICATE CHECK
//====================================================

function normalizeImportMatch(value){

    return String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, " ");

}

//====================================================
// FIND EXISTING MATERIAL
// SMART MATCH + ENRICHMENT
//====================================================

function findExistingMaterial(
    materials,
    materialName,
    departmentId,
    categoryId,
    brand,
    itemType,
    itemSize,
    specification
){

    const targetName =
        normalizeImportMatch(materialName);

    const targetBrand =
        normalizeImportMatch(brand);

    const targetItemType =
        normalizeImportMatch(itemType);

    const targetItemSize =
        normalizeImportMatch(itemSize);

    const targetSpecification =
        normalizeImportMatch(specification);


    // ------------------------------------------------
    // CORE MATERIAL MATCH
    // Department + Category + Material Name
    // ------------------------------------------------

    const candidates =
        (materials || []).filter(item => {

            return (

                Number(item.department_id) ===
                Number(departmentId)

                &&

                Number(item.category_id || 0) ===
                Number(categoryId || 0)

                &&

                normalizeImportMatch(
                    item.material_name
                ) === targetName

            );

        });


    if(candidates.length === 0){

        return null;

    }


    // ------------------------------------------------
    // SCORE EACH EXISTING MATERIAL
    //
    // A populated incoming field must either:
    // 1. match existing value
    // OR
    // 2. existing value must be blank so it can
    //    be enriched.
    //
    // Different populated values = NOT a match.
    // ------------------------------------------------

    const scored = [];


    candidates.forEach(item => {

        const existingBrand =
            normalizeImportMatch(
                item.brand
            );

        const existingItemType =
            normalizeImportMatch(
                item.item_type
            );

        const existingItemSize =
            normalizeImportMatch(
                item.item_size
            );

        const existingSpecification =
            normalizeImportMatch(
                item.specification
            );


        let compatible = true;

        let score = 0;


        // --------------------------------------------
        // BRAND
        // --------------------------------------------

        if(targetBrand !== ""){

            if(
                existingBrand !== "" &&
                existingBrand !== targetBrand
            ){

                compatible = false;

            }
            else if(
                existingBrand === targetBrand
            ){

                score += 4;

            }

        }
        else if(existingBrand === ""){

            score += 1;

        }


        // --------------------------------------------
        // ITEM TYPE
        // --------------------------------------------

        if(targetItemType !== ""){

            if(
                existingItemType !== "" &&
                existingItemType !== targetItemType
            ){

                compatible = false;

            }
            else if(
                existingItemType === targetItemType
            ){

                score += 3;

            }

        }
        else if(existingItemType === ""){

            score += 1;

        }


        // --------------------------------------------
        // ITEM SIZE
        // --------------------------------------------

        if(targetItemSize !== ""){

            if(
                existingItemSize !== "" &&
                existingItemSize !== targetItemSize
            ){

                compatible = false;

            }
            else if(
                existingItemSize === targetItemSize
            ){

                score += 3;

            }

        }
        else if(existingItemSize === ""){

            score += 1;

        }


        // --------------------------------------------
        // SPECIFICATION
        // --------------------------------------------

        if(targetSpecification !== ""){

            if(
                existingSpecification !== "" &&
                existingSpecification !==
                    targetSpecification
            ){

                compatible = false;

            }
            else if(
                existingSpecification ===
                    targetSpecification
            ){

                score += 5;

            }

        }
        else if(existingSpecification === ""){

            score += 1;

        }


        if(compatible){

            scored.push({
                item: item,
                score: score
            });

        }

    });


    // ------------------------------------------------
    // NO COMPATIBLE MATERIAL
    //
    // This is NOT an error.
    // It means this is a different material variant.
    // ------------------------------------------------

    if(scored.length === 0){

        return null;

    }


    // ------------------------------------------------
    // SORT BY BEST MATCH
    // ------------------------------------------------

    scored.sort(
        (a,b) =>
            b.score - a.score
    );


    const best =
        scored[0];


    // ------------------------------------------------
    // ONLY RETURN A MATCH WHEN IT IS UNAMBIGUOUS
    //
    // If two materials have exactly the same score,
    // do NOT guess.
    // Return null so a new material can be created.
    // ------------------------------------------------

    if(
        scored.length > 1 &&
        scored[0].score === scored[1].score
    ){

        return null;

    }


    return best.item;

}

// ====================================================
// SAVE / UPDATE OPENING STOCK
// ====================================================

// ====================================================
// ADD STOCK FROM MATERIAL EXCEL IMPORT
// ====================================================

async function saveOpeningStock(
    materialId,
    materialCode,
    openingStock
){

    const qty = Number(openingStock || 0);

    if(qty <= 0){
        return;
    }

    const referenceNo =
        "IMPORT-" +
        String(materialCode).trim() +
        "-" +
        Date.now();

    const {
        error: insertError
    } = await supabase
        .from("stock_ledger")
        .insert([{
            material_id: Number(materialId),

            transaction_type:
                "STOCK_IN",

            quantity: qty,

            reference_no:
                referenceNo,

            request_id: null,

            remarks:
                "Additional stock imported from Excel",

            created_by: null,

            transaction_date:
                new Date().toISOString()
        }]);

    if(insertError){
        throw insertError;
    }
}


// ====================================================
// STRICT MATERIAL EXCEL PRE-VALIDATION
// ====================================================

async function validateMaterialImport(
    rows,
    departments,
    existingMaterials
){

    const errors = [];

    const seenCodes = new Set();
    const seenMaterials = new Map();


    // --------------------------------------------
    // BUILD DEPARTMENT LOOKUP
    // --------------------------------------------

    const departmentMap = {};

    (departments || []).forEach(dept => {

        const name =
            String(
                dept.department_name || ""
            )
            .trim()
            .toUpperCase();

        const code =
            String(
                dept.department_code || ""
            )
            .trim()
            .toUpperCase();

        const prefix =
            String(
                dept.prefix || ""
            )
            .trim()
            .toUpperCase();

        if(name){
            departmentMap[name] = dept;
        }

        if(code){
            departmentMap[code] = dept;
        }

        if(prefix){
            departmentMap[prefix] = dept;
        }

    });


    // --------------------------------------------
    // EXISTING MATERIAL CODE LOOKUP
    // --------------------------------------------

    const existingCodeSet =
        new Set();

    (existingMaterials || []).forEach(
        material => {

            const code =
                String(
                    material.material_code || ""
                )
                .trim()
                .toUpperCase();

            if(code){
                existingCodeSet.add(code);
            }

        }
    );


    // --------------------------------------------
    // VALIDATE EVERY ROW
    // --------------------------------------------

    rows.forEach((row, index) => {

        const excelRow =
            index + 2;

        const materialName =
            String(
                row.Material_Name || ""
            ).trim();

        const departmentValue =
            String(
                row.Department || ""
            )
            .trim()
            .toUpperCase();

        const materialCode =
            String(
                row.Material_Code || ""
            )
            .trim()
            .toUpperCase();

        const categoryValue =
            String(
                row.Category || ""
            ).trim();


        // ----------------------------------------
        // MATERIAL NAME
        // ----------------------------------------

        if(!materialName){

            errors.push({
                row: excelRow,
                material: "(blank)",
                error:
                    "Material Name is missing"
            });

            return;
        }


        // ----------------------------------------
        // DEPARTMENT
        // ----------------------------------------

        const department =
            departmentMap[
                String(departmentValue || "")
            .trim()
            .replace(/\s+/g, " ")
            .toUpperCase()
    ];

        if(!department){

            errors.push({
    row: excelRow,

    material: materialName,

    material_code:
        materialCode,

    Department:
        row.Department || "",

    Category:
        row.Category || "",

    Brand:
        row.Brand || "",

    Unit:
        row.Unit || "",

    Opening_Stock:
        row.Opening_Stock || "",

    error:
        "Department not found: " +
    departmentValue
});

            return;
        }


// ----------------------------------------
// MATERIAL CODE
// ----------------------------------------

if(materialCode){

    // Existing Material Code is allowed.
    // It will be treated as ADDITIONAL STOCK.

    if(
        existingCodeSet.has(
            materialCode
        )
    ){

        const existingMaterial =
            (existingMaterials || []).find(
                item =>
                    String(
                        item.material_code || ""
                    )
                    .trim()
                    .toUpperCase()
                    === materialCode
            );

        if(existingMaterial){

            const existingName =
                normalizeImportMatch(
                    existingMaterial.material_name
                );

            const excelName =
                normalizeImportMatch(
                    materialName
                );

            // Same code but different material
            // is still rejected.
            if(
                existingName !==
                excelName
            ){

                errors.push({
                    row: excelRow,

                    material:
                        materialName,

                    material_code:
                        materialCode,

                    Department:
                        row.Department || "",

                    Category:
                        row.Category || "",

                    Brand:
                        row.Brand || "",

                    Unit:
                        row.Unit || "",

                    Opening_Stock:
                        row.Opening_Stock || "",

                    error:
                        "Material Code " +
                        materialCode +
                        " already belongs to '" +
                        existingMaterial.material_name +
                        "'. Excel contains '" +
                        materialName +
                        "'."
                });

            }

        }

    }


    // Duplicate inside the SAME Excel
    if(
        seenCodes.has(
            materialCode
        )
    ){

        errors.push({
            row: excelRow,

            material:
                materialName,

            error:
                "Duplicate Material Code in Excel: " +
                materialCode
        });

    }

    seenCodes.add(
        materialCode
    );

}
// ----------------------------------------
// DUPLICATE MATERIAL INSIDE EXCEL
// ----------------------------------------

const normalizeDuplicateValue = (value) => {

    return String(value ?? "")
        .replace(/\uFEFF/g, "")
        .replace(/\u200B/g, "")
        .replace(/\u00A0/g, " ")
        .trim()
        .replace(/\s+/g, " ")
        .toUpperCase();

}; 

const duplicateMaterialName =
    normalizeDuplicateValue(
        row.Material_Name
    );

const duplicateItemSize =
    normalizeDuplicateValue(
        row.Item_Size
    );

const duplicateItemType =
    normalizeDuplicateValue(
        row.Item_Type
    );

const duplicateSpecification =
    normalizeDuplicateValue(
        row.Specification
    );

const duplicateBrand =
    normalizeDuplicateValue(
        row.Brand
    );

const materialKey = JSON.stringify({

    Material_Name:
        duplicateMaterialName,

    Brand:
        duplicateBrand,

    Item_Size:
        duplicateItemSize,

    Item_Type:
        duplicateItemType,

    Specification:
        duplicateSpecification

});


if(seenMaterials.has(materialKey)){

    const previousRow =
        seenMaterials.get(
            materialKey
        );

    errors.push({

        row:
            excelRow,

        material:
            materialName,

        error:
            "Duplicate material in Excel. " +

            "Same Material Name + Item Size + Item Type + Specification " +

            "already exists at Excel row " +

            previousRow +

            ". " +

            "Match: " +

            duplicateMaterialName +

            " | " +

            duplicateItemSize +

            " | " +

            duplicateItemType +

            " | " +

            duplicateSpecification

    });

}
else{

    seenMaterials.set(

        materialKey,

        excelRow

    );

}

        // ----------------------------------------
        // OPENING STOCK
        // ----------------------------------------

        const openingStock =
            Number(
                row.Opening_Stock || 0
            );

        if(
            !Number.isFinite(
                openingStock
            ) ||
            openingStock < 0
        ){

            errors.push({
                row: excelRow,
                material: materialName,
                error:
                    "Invalid Opening Stock: " +
                    row.Opening_Stock
            });

        }

    });


    return errors;

}
// ====================================================
// DOWNLOAD FAILED IMPORT ROWS
// ====================================================

function downloadFailedImportRows(failedRows){

    if(
        !failedRows ||
        !failedRows.length
    ){
        return;
    }

    if(
        typeof XLSX === "undefined"
    ){
        console.error(
            "Excel library is not loaded."
        );

        return;
    }


    const exportRows =
        failedRows.map(item => {

            return {
                Excel_Row:
                    item.row || "",

                Material_Code:
                    item.material_code || "",

                Material_Name:
                    item.material ||
                    item.Material_Name ||
                    "",

                Department:
                    item.Department || "",

                Category:
                    item.Category || "",

                Brand:
                    item.Brand || "",

                Unit:
                    item.Unit || "",

                Opening_Stock:
                    item.Opening_Stock || "",

                Failure_Reason:
                    item.error || ""
            };

        });


    const worksheet =
        XLSX.utils.json_to_sheet(
            exportRows
        );


    const workbook =
        XLSX.utils.book_new();


    XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        "Failed Rows"
    );


    XLSX.writeFile(
        workbook,
        "Material_Import_Failed_Rows.xlsx"
    );
}
async function importMaterialsFromExcel(){

    // ====================================================
    // PREVENT DUPLICATE IMPORT EXECUTION
    // ====================================================

    if(window.materialImportRunning === true){

        console.warn(
            "Import already running. Duplicate request ignored."
        );

        return;

    }

    window.materialImportRunning = true;


    try{

        // ====================================================
        // BASIC CHECK
        // ====================================================

        if(!importedMaterialRows.length){

            showAlert(
                "Please select an Excel file first.",
                "warning"
            );

            return;

        }


        const btn =
            document.getElementById(
                "btnImportNow"
            );


        if(btn){

            btn.disabled = true;

            btn.innerHTML =
                '<i class="fa-solid fa-spinner fa-spin"></i> Importing...';

        }


        // ====================================================
        // LOAD DEPARTMENTS
        // ====================================================

        const {
            data: departments,
            error: departmentError
        } = await supabase

            .from("departments")

            .select(
                "id, department_code, department_name, prefix"
            );


        if(departmentError){

            throw departmentError;

        }


        // Department lookup:
        // Department Name
        // Department Code
        // Prefix

        const departmentMap = {};


        (departments || [])
            .forEach(
                dept => {

                    const name =
                        String(
                            dept.department_name ||
                            ""
                        )
                        .trim()
                        .toUpperCase();


                    const code =
                        String(
                            dept.department_code ||
                            ""
                        )
                        .trim()
                        .toUpperCase();


                    const prefix =
                        String(
                            dept.prefix ||
                            ""
                        )
                        .trim()
                        .toUpperCase();


                    if(name){

                        departmentMap[name] =
                            dept;

                    }


                    if(code){

                        departmentMap[code] =
                            dept;

                    }


                    if(prefix){

                        departmentMap[prefix] =
                            dept;

                    }

                }
            );


        // ====================================================
        // LOAD CATEGORIES
        // ====================================================

        const {
            data: categories,
            error: categoryError
        } = await supabase

            .from("material_categories")

            .select(
                "id, department_id, category_name, short_code"
            );
        is_active: true

        if(categoryError){

            throw categoryError;

        }


        // Category lookup by:
        // Department ID + Name
        // Category ID
        // Department ID + Short Code

        const categoryMap = {};


        (categories || [])
            .forEach(
                category => {

                    const departmentId =
                        String(
                            category.department_id
                        );


                    const categoryName =
                        String(
                            category.category_name ||
                            ""
                        )
                        .trim()
                        .toUpperCase();


                    const shortCode =
                        String(
                            category.short_code ||
                            ""
                        )
                        .trim()
                        .toUpperCase();


                    // Name

                    if(categoryName){

                        categoryMap[
                            departmentId +
                            "|NAME|" +
                            categoryName
                        ] = category;

                    }


                    // Short Code

                    if(shortCode){

                        categoryMap[
                            departmentId +
                            "|CODE|" +
                            shortCode
                        ] = category;

                    }


                    // ID

                    categoryMap[
                        "ID|" +
                        String(
                            category.id
                        )
                    ] = category;

                }
            );


        // ====================================================
        // LOAD EXISTING MATERIAL CODES ONCE
        // ====================================================

       const {
    data: existingMaterials,
    error: materialError
} = await supabase
    .from("materials")
   .select(`
    id,
    material_code,
    material_name,
    department_id,
    category_id,
    category,
    brand,
    item_type,
    item_size,
    specification,
    unit,
    minimum_stock,
    rack_location,
    status,
    unit_cost,
    gst_type,
    gst_percentage,
    description
`)
        if(materialError){

            throw materialError;

        }


        // ====================================================
        // FIND CURRENT MAX NUMBER FOR EACH PREFIX
        // ====================================================

        const nextNumbers = {};


        (existingMaterials || [])
            .forEach(
                item => {

                    const code =
                        String(
                            item.material_code ||
                            ""
                        )
                        .trim()
                        .toUpperCase();


                    const match =
                        code.match(
                            /^([A-Z0-9]+)-(\d{3})$/
                        );


                    if(!match){

                        return;

                    }


                    const prefix =
                        match[1];


                    const number =
                        parseInt(
                            match[2],
                            10
                        );


                    if(
                        !nextNumbers[prefix] ||
                        number >=
                        nextNumbers[prefix]
                    ){

                        nextNumbers[prefix] =
                            number + 1;
                    }
                }
            );
// ====================================================
// IMPORT EACH ROW
// ====================================================
// ====================================================
// STRICT PRE-VALIDATION
// NOTHING IS WRITTEN BEFORE VALIDATION PASSES
// ====================================================

const validationErrors =
    await validateMaterialImport(
        importedMaterialRows,
        departments,
        existingMaterials
    );

if(validationErrors.length > 0){

    console.error(
        "Material Import Rejected:",
        validationErrors
    );

    let message =
        "IMPORT REJECTED.\n\n" +
        importedMaterialRows.length +
        " row(s) found in Excel.\n" +
        validationErrors.length +
        " row(s) failed validation.\n\n";


    validationErrors.forEach(
        item => {

            message +=
                "Row " +
                item.row +
                " — " +
                item.material +
                "\n" +
                item.error +
                "\n\n";

        }
    );

    console.table(
        validationErrors
    );


    showAlert(
        message,
        "danger"
    );

    return;
}
        let successCount = 0;

        let failedRows = [];


        for(
            let i = 0;

            i < importedMaterialRows.length;

            i++
        ){

            const row =
                importedMaterialRows[i];


            try{

                // --------------------------------------------
                // BASIC VALUES
                // --------------------------------------------

                const materialCodeFromExcel =
    String(
        row.Material_Code ||
        ""
    )
    .trim()
    .toUpperCase();

const materialName =
    String(
        row.Material_Name ||
        ""
    )
    .trim();

const departmentValue =
                    String(
                        row.Department ||
                        ""
                    )
                    .trim();


                const categoryValue =
                    String(
                        row.Category ||
                        ""
                    )
                    .trim();


                // --------------------------------------------
                // REQUIRED FIELDS
                // --------------------------------------------

                if(!materialName){

                    throw new Error(
                        "Material Name missing"
                    );

                }


                if(!departmentValue){

                    throw new Error(
                        "Department / Department Code missing"
                    );

                }


                // --------------------------------------------
                // FIND DEPARTMENT
                // --------------------------------------------

                const normalizedDepartment =
    String(departmentValue || "")
        .trim()
        .replace(/\s+/g, " ")
        .toUpperCase();

const department =
    departmentMap[
        normalizedDepartment
    ];


                if(!department){

                    throw new Error(
                        "Department not found: " +
                        departmentValue
                    );

                }


                // --------------------------------------------
                // FIND CATEGORY
                // CATEGORY IS OPTIONAL
                // --------------------------------------------

                let category = null;


                if(
                    categoryValue &&
                    categoryValue !== "-"
                ){

                    // ----------------------------------------
                    // CATEGORY ID
                    // Example: 1 or 10
                    // ----------------------------------------

                    if(
                        /^\d+$/.test(
                            categoryValue
                        )
                    ){

                        category =
                            categoryMap[
                                "ID|" +
                                categoryValue
                            ];

                    }


                    // ----------------------------------------
                    // CATEGORY NAME
                    // ----------------------------------------

                    if(!category){

                        category =
                            categoryMap[
                                String(
                                    department.id
                                ) +
                                "|NAME|" +
                                categoryValue
                                    .toUpperCase()
                            ];

                    }


                    // ----------------------------------------
                    // CATEGORY SHORT CODE
                    // ----------------------------------------

                    if(!category){

                        category =
                            categoryMap[
                                String(
                                    department.id
                                ) +
                                "|CODE|" +
                                categoryValue
                                    .toUpperCase()
                            ];

                    }


                   // ----------------------------------------
// AUTO-CREATE CATEGORY IF NOT FOUND
// ----------------------------------------

if(!category){

    // Create a clean short code from category name
    let baseShortCode =
        cleanCode(categoryValue)
            .replace(/-/g, "")
            .substring(0, 6);

    if(!baseShortCode){
        baseShortCode = "CAT";
    }

    let shortCode =
        baseShortCode;

    let counter = 2;

    // Make sure short code is unique within department
    while(
        categoryMap[
            String(department.id) +
            "|CODE|" +
            shortCode
        ]
    ){

        shortCode =
            baseShortCode.substring(
                0,
                Math.max(
                    1,
                    6 - String(counter).length
                )
            ) +
            String(counter);

        counter++;

    }

    // Create new category
    const {
        data: newCategory,
        error: createCategoryError
    } = await supabase

        .from("material_categories")

        .insert({

            department_id:
                Number(department.id),

            category_name:
                categoryValue,

            short_code:
                shortCode,

            is_active:
                true

        })

        .select(
            "id, department_id, category_name, short_code"
        )

        .single();


    if(createCategoryError){

        throw new Error(
            "Unable to create category '" +
            categoryValue +
            "': " +
            createCategoryError.message
        );

    }


    category =
        newCategory;


    // Add newly created category to lookup
    // so another Excel row using the same
    // category will reuse it.

    categoryMap[
        String(department.id) +
        "|NAME|" +
        categoryValue
            .trim()
            .toUpperCase()
    ] = category;


    categoryMap[
        String(department.id) +
        "|CODE|" +
        shortCode
            .trim()
            .toUpperCase()
    ] = category;


    categoryMap[
        "ID|" +
        String(category.id)
    ] = category;


}


                    // ----------------------------------------
                    // VERIFY CATEGORY BELONGS TO DEPARTMENT
                    // ----------------------------------------

                    if(
                        Number(
                            category.department_id
                        ) !==
                        Number(
                            department.id
                        )
                    ){

                        throw new Error(
                            "Category '" +
                            categoryValue +
                            "' does not belong to department " +
                            department.department_name
                        );

                    }

                }


// --------------------------------------------
// MATERIAL CODE / DUPLICATE CHECK
// --------------------------------------------

// Excel Material Code
let materialCode =
    materialCodeFromExcel;

let existingMaterial = null;


// ==================================================
// CASE 1
// EXCEL HAS MATERIAL CODE
// ==================================================

if(materialCode){

    // --------------------------------------------
    // FIRST: MATCH BY MATERIAL CODE
    // --------------------------------------------

    existingMaterial =
        (existingMaterials || []).find(
            item =>
                String(
                    item.material_code || ""
                )
                .trim()
                .toUpperCase()
                === materialCode
        );


    // --------------------------------------------
    // CODE NOT FOUND
    // TRY SMART MATERIAL MATCH
    // --------------------------------------------

    if(!existingMaterial){

        existingMaterial =
            findExistingMaterial(
                existingMaterials,

                materialName,

                department.id,

                category
                    ? category.id
                    : null,

                row.Brand,

                row.Item_Type,

                row.Item_Size,

                row.Specification
            );


        // ----------------------------------------
        // SMART MATCH FOUND
        // KEEP OLD MATERIAL CODE
        // ----------------------------------------

        if(existingMaterial){

            materialCode =
                existingMaterial.material_code;

        }


        // ----------------------------------------
        // NOTHING MATCHED
        // ----------------------------------------

        else{

            throw new Error(
                "Material Code not found and no matching existing material was found: " +
                materialCode
            );

        }

    }

}

// ==================================================
// CASE 2
// EXCEL MATERIAL CODE IS BLANK
// CHECK FOR EXISTING MATERIAL FIRST
// ==================================================

else{

    existingMaterial =
        findExistingMaterial(

            existingMaterials,

            materialName,

            department.id,

            category
                ? category.id
                : null,

            row.Brand,

            row.Item_Type,

            row.Item_Size,

            row.Specification

        );


    // ----------------------------------------------
    // EXISTING MATERIAL FOUND
    // ----------------------------------------------

    if(existingMaterial){

    // Existing material is allowed.
    // Excel Opening_Stock will be treated
    // as ADDITIONAL STOCK.

    materialCode =
        existingMaterial.material_code;

    }

    // ----------------------------------------------
    // MATERIAL DOES NOT EXIST
    // GENERATE NEW CODE
    // ----------------------------------------------

    else{

        const prefix =
            String(
                department.prefix ||
                ""
            )
            .trim()
            .toUpperCase();


        if(!prefix){

            throw new Error(
                "Department Prefix missing for " +
                department.department_name
            );

        }


        if(!nextNumbers[prefix]){

            nextNumbers[prefix] = 1;

        }


        const nextNumber =
            nextNumbers[prefix];


        if(nextNumber > 999){

            throw new Error(
                "Material code limit reached for department " +
                prefix
            );

        }


        materialCode =
            prefix +
            "-" +
            String(nextNumber)
                .padStart(3, "0");


        nextNumbers[prefix] =
            nextNumber + 1;

    }

}
                // --------------------------------------------
                // MATERIAL OBJECT
                // --------------------------------------------

                const status =
                    String(
                        row.Status ||
                        "ACTIVE"
                    )
                    .trim()
                    .toUpperCase();

//====================================================
// MERGE EXCEL DATA WITH EXISTING MATERIAL
//====================================================

function importValue(
    incoming,
    existing
){

    const incomingText =
        String(
            incoming ?? ""
        ).trim();


    if(incomingText !== ""){
        return incoming;
    }


    return existing ?? "";

}
                const material = {

                    material_code:
                        materialCode,


                    material_name:
                        materialName,


                    department_id:
                        Number(
                            department.id
                        ),


                    category_id:
                        category
                            ? Number(
                                category.id
                              )
                            : null,


                    category:
                        category
                            ? String(
                                category.category_name ||
                                ""
                              )
                            : "",


                    material_short_name:
                        category
                            ? String(
                                category.short_code ||
                                ""
                              )
                            : "",


                    brand:
        importValue(
        row.Brand,
        existingMaterial?.brand
        ),


       item_type:
    importValue(
        row.Item_Type,
        existingMaterial?.item_type
    ),

    item_type:
    importValue(
        row.Item_Type,
        existingMaterial?.item_type
    ),


    item_size:
    importValue(
        row.Item_Size,
        existingMaterial?.item_size
    ),


    unit:
    importValue(
        row.Unit,
        existingMaterial?.unit
    ),

                    minimum_stock:
                        Number(
                            row.Minimum_Stock ||
                            0
                        ),


    rack_location:
    importValue(
        row.Rack_Location,
        existingMaterial?.rack_location
    ),


                    status:
                        status,


                    unit_cost:
                        Number(
                            row.Unit_Cost ||
                            0
                        ),


                    gst_type:
                        String(
                            row.GST_Type ||
                            "INCLUDED"
                        )
                        .trim()
                        .toUpperCase(),


                    gst_percentage:
                        Number(
                            row.GST_Percentage ||
                            18
                        ),


     description:
    importValue(
        row.Description,
        existingMaterial?.description
    ),


                    searchable_text:
                    (
                        materialCode +
                        " " +
                        materialName +
                        " " +
                        (
                            category
                                ? category.category_name
                                : ""
                        ) +
                        " " +
                        String(
                            row.Brand ||
                            ""
                        ) +
                        " " +
                        String(
                            row.Specification ||
                            ""
                        ) +
                        " " +
                        String(
                            row.Item_Size ||
                            ""
                        )
                    )
                    .toUpperCase(),


                    is_active:
                        status === "ACTIVE"

                };

//====================================================
// INSERT NEW / UPDATE EXISTING MATERIAL
//====================================================

if(existingMaterial){

// --------------------------------------------
// EXISTING MATERIAL → UPDATE
// --------------------------------------------

    const {
        error: updateError
    } = await supabase

        .from("materials")

        .update(material)

        .eq(
            "id",
            existingMaterial.id
        );


    if(updateError){

        throw updateError;

    }


    // Keep local copy updated
    existingMaterial.material_name =
        material.material_name;

    existingMaterial.department_id =
        material.department_id;

    existingMaterial.category_id =
        material.category_id;

    existingMaterial.brand =
        material.brand;

    existingMaterial.item_type =
        material.item_type;

    existingMaterial.item_size =
        material.item_size;

    existingMaterial.specification =
        material.specification;

    existingMaterial.material_code =
        material.material_code;
// --------------------------------------------
// SAVE / UPDATE OPENING STOCK
// --------------------------------------------

await saveOpeningStock(
    existingMaterial.id,
    material.material_code,
    row.Opening_Stock
);

}


else{

    // --------------------------------------------
    // NEW MATERIAL → INSERT
    // --------------------------------------------

    const {
        data: insertedMaterial,
        error: insertError
    } = await supabase

        .from("materials")

        .insert(material)

        .select(`
            id,
            material_code,
            material_name,
            department_id,
            category_id,
            brand,
            item_type,
            item_size,
            specification
        `)
        .single();


    if(insertError){

        throw insertError;

    }


// --------------------------------------------
// SAVE / UPDATE OPENING STOCK
// --------------------------------------------

await saveOpeningStock(
    insertedMaterial.id,
    insertedMaterial.material_code,
    row.Opening_Stock
);
// --------------------------------------------
// ADD NEWLY INSERTED MATERIAL TO LOCAL LIST
// --------------------------------------------
    if(insertedMaterial){

        existingMaterials.push(
            insertedMaterial
        );

    }

}

successCount++;

            }
            catch(rowError){

                console.error(
                    "Import Row Error:",
                    i + 2,
                    rowError
                );


                failedRows.push({

                    row:
                        i + 2,

                    material:
                        row.Material_Name ||
                        "(blank)",

                    error:
                        rowError.message

                });

            }

        }


// ====================================================
// RESULT
// ====================================================
// ====================================================
// FINAL IMPORT COUNT CHECK
// ====================================================

// ====================================================
// FINAL IMPORT VALIDATION
// ====================================================

if(
    successCount !==
    importedMaterialRows.length
){

    // --------------------------------------------
    // Build complete failure list
    // --------------------------------------------

    const exportFailures =
        failedRows.map(item => {

            const originalRow =
                importedMaterialRows[
                    Number(item.row) - 2
                ] || {};

            return {

                row:
                    item.row,

                material_code:
                    originalRow.Material_Code ||
                    originalRow.material_code ||
                    "",

                material:
                    item.material ||
                    originalRow.Material_Name ||
                    "",

                Material_Name:
                    originalRow.Material_Name ||
                    "",

                Department:
                    originalRow.Department ||
                    "",

                Category:
                    originalRow.Category ||
                    "",

                Brand:
                    originalRow.Brand ||
                    "",

                Unit:
                    originalRow.Unit ||
                    "",

                Opening_Stock:
                    originalRow.Opening_Stock ||
                    "",

                error:
                    item.error ||
                    "Import failed"
            };

        });


    // --------------------------------------------
    // Download failed rows
    // --------------------------------------------

    downloadFailedImportRows(
        exportFailures
    );


    // --------------------------------------------
    // Build user message
    // --------------------------------------------

    let message =
        "IMPORT REJECTED.\n\n" +

        "Excel rows: " +
        importedMaterialRows.length +

        "\nSuccessfully processed: " +
        successCount +

        "\nFailed rows: " +
        exportFailures.length +

        "\n\n";


    exportFailures.forEach(
        item => {

            message +=
                "Row " +
                item.row +
                " — " +
                item.material +
                "\n" +
                item.error +
                "\n\n";

        }
    );


    console.error(
        "Material Import Rejected:",
        exportFailures
    );


    console.table(
        exportFailures
    );


    showAlert(
        message +
        "Failed rows have been downloaded to Excel.",
        "danger"
    );


    // IMPORTANT:
    // Do NOT close the import modal.
    // Do NOT clear the selected Excel.
    // User can inspect and correct it.

    return;
}
        let message =

            successCount +
            " material(s) imported successfully.";


        if(failedRows.length){

            message +=

                "\n\n" +
                failedRows.length +
                " row(s) failed:\n";


            failedRows.forEach(
                item => {

                    message +=

                        "\nRow " +
                        item.row +
                        " — " +
                        item.material +
                        "\n" +
                        item.error +
                        "\n";

                }
            );


            console.error(
                "Failed Import Rows:",
                failedRows
            );


            console.table(
                failedRows
            );

        }


        showAlert(
            message,
            failedRows.length
                ? "warning"
                : "success"
        );


        // ====================================================
        // CLOSE MODAL
        // ====================================================

        const modalElement =
            document.getElementById(
                "importModal"
            );


        const modal =
            bootstrap.Modal.getInstance(
                modalElement
            );


        if(modal){

            modal.hide();

        }


        importedMaterialRows = [];


        const excelFile =
            document.getElementById(
                "excelFile"
            );


        if(excelFile){

            excelFile.value = "";

        }


        const previewArea =
            document.getElementById(
                "previewArea"
            );


        if(previewArea){

            previewArea.innerHTML = "";

        }


        await loadMaterialList();

        await loadManageMaterials();

    }
    catch(error){

        console.error(
            "Material Excel Import Error:",
            error
        );


        showAlert(
            "Import failed: " +
            error.message,
            "danger"
        );

    }
    finally{

    // Release import lock
    window.materialImportRunning = false;


    const btn =
        document.getElementById(
            "btnImportNow"
        );

    if(btn){

        btn.disabled = false;

        btn.innerHTML =
            '<i class="fa-solid fa-file-import"></i> Import Materials';

    }

}

}
//====================================================
// SAVE MATERIAL
//====================================================

async function saveMaterial(){

    try{

        // --------------------------------------------
        // VALIDATION
        // --------------------------------------------

        const department =
            document.getElementById("department").value;

        const materialName =
            document.getElementById("materialName").value.trim();

        if(department === ""){

            showAlert(
                "Select Department",
                "warning"
            );

            return;
        }

        if(materialName === ""){

            showAlert(
                "Enter Material Name",
                "warning"
            );

            return;
        }

        // --------------------------------------------
        // GENERATE MATERIAL CODE
        // --------------------------------------------

        if(
            document
                .getElementById("materialCode")
                .value
                .trim() === ""
        ){

            await generateMaterialCode();
        }

        const materialCode =
            document
                .getElementById("materialCode")
                .value
                .trim();

        if(materialCode === ""){

            showAlert(
                "Unable to generate Material Code",
                "danger"
            );

            return;
        }

        // --------------------------------------------
        // CATEGORY
        // --------------------------------------------

        const categoryElement =
            document.getElementById("category");

        const categoryId =
            categoryElement.value
                ? Number(categoryElement.value)
                : null;

        const categoryName =
            categoryElement.value
                ? categoryElement.options[
                    categoryElement.selectedIndex
                  ].text.trim()
                : "";

        // --------------------------------------------
        // SEARCHABLE TEXT
        // --------------------------------------------

        const searchableText = (

            materialCode + " " +

            materialName + " " +

            categoryName + " " +

            document
                .getElementById("brand")
                .value + " " +

            document
                .getElementById("specification")
                .value + " " +

            document
                .getElementById("itemSize")
                .value

        ).toUpperCase();

        // --------------------------------------------
        // MATERIAL OBJECT
        // --------------------------------------------

        const material = {

            material_code:
                materialCode,

            material_name:
                materialName,

            department_id:
                Number(department),

            category_id:
                categoryId,

            category:
                categoryName,

            material_short_name:
                document
                    .getElementById("materialShortName")
                    .value
                    .trim(),

            brand:
                document
                    .getElementById("brand")
                    .value
                    .trim(),

            item_type:
                document
                    .getElementById("itemType")
                    .value,

            specification:
                document
                    .getElementById("specification")
                    .value
                    .trim(),

            item_size:
                document
                    .getElementById("itemSize")
                    .value
                    .trim(),

            unit:
                document
                    .getElementById("unit")
                    .value,

            minimum_stock:
                Number(
                    document
                        .getElementById("minimumStock")
                        .value || 0
                ),

            rack_location:
                document
                    .getElementById("rackLocation")
                    .value
                    .trim(),

            status:
                document
                    .getElementById("status")
                    .value,

            unit_cost:
                Number(
                    document
                        .getElementById("unitCost")
                        .value || 0
                ),

            gst_type:
                document
                    .getElementById("gstType")
                    .value,

            gst_percentage:
                Number(
                    document
                        .getElementById("gstPercentage")
                        .value || 0
                ),

            description:
                document
                    .getElementById("description")
                    .value
                    .trim(),

            searchable_text:
                searchableText,

            is_active:
                document
                    .getElementById("status")
                    .value === "ACTIVE"

        };

        // --------------------------------------------
        // DUPLICATE MATERIAL CODE CHECK
        // --------------------------------------------

        const {
            data: duplicate,
            error: duplicateError
        } = await supabase

            .from("materials")

            .select("id")

            .eq(
                "material_code",
                material.material_code
            );

        if(duplicateError)
            throw duplicateError;

        if(
            duplicate &&
            duplicate.length > 0
        ){

            showAlert(
                "Material Code already exists",
                "danger"
            );

            return;
        }

        // --------------------------------------------
        // INSERT MATERIAL
        // --------------------------------------------

        const {
            error
        } = await supabase

            .from("materials")

            .insert(material);

        if(error)
            throw error;

        // --------------------------------------------
        // SUCCESS
        // --------------------------------------------

        showAlert(
            "Material Saved Successfully",
            "success"
        );

        clearMaterialForm();

        await loadMaterialList();

        await loadManageMaterials();

    }

    catch(error){

        console.error(
            "Save Material Error:",
            error
        );

        showAlert(
            error.message,
            "danger"
        );

    }

}
