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
                Department: "",
                Category: "",
                Material_Name: "",
                Brand: "",
                Item_Type: "",
                Item_Size: "",
                Specification: "",
                Unit: "",
                Minimum_Stock: 0,
                Rack_Location: "",
                Unit_Cost: "",
                GST_Type: "INCLUDED",
                GST_Percentage: 18,
                Description: ""
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

        Department:
            String(getExcelValue(row, [
                "Department",
                "Department Name",
                "Dept",
                "Department_Name"
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

document.addEventListener("DOMContentLoaded", function(){

    const excelFile =
        document.getElementById("excelFile");

    const btnImportNow =
        document.getElementById("btnImportNow");

    if(excelFile){
        excelFile.addEventListener(
            "change",
            handleExcelFile
        );
    }

    if(btnImportNow){
        btnImportNow.addEventListener(
            "click",
            importMaterialsFromExcel
        );
    }

});

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
        document.getElementById(
            "previewArea"
        );

    if(!previewArea){
        return;
    }

    let html = `
        <div class="alert alert-success">
            <b>${rows.length}</b>
            material(s) found in Excel.
            Material codes will be generated automatically.
        </div>

        <div class="table-responsive"
             style="max-height:400px;overflow:auto;">

            <table class="table table-bordered table-sm">

                <thead class="table-dark">

                    <tr>
                        <th>#</th>
                        <th>Material Name</th>
                        <th>Department</th>
                        <th>Category</th>
                        <th>Brand</th>
                        <th>Unit</th>
                        <th>Unit Cost</th>
                        <th>Status</th>
                    </tr>

                </thead>

                <tbody>
    `;

    rows.forEach((row,index)=>{

        html += `
            <tr>

                <td>${index + 1}</td>

                <td>
                    ${escapeHtml(
                        row.Material_Name || ""
                    )}
                </td>

                <td>
                    ${escapeHtml(
                        row.Department || ""
                    )}
                </td>

                <td>
                    ${escapeHtml(
                        row.Category || "-"
                    )}
                </td>

                <td>
                    ${escapeHtml(
                        row.Brand || "-"
                    )}
                </td>

                <td>
                    ${escapeHtml(
                        row.Unit || "-"
                    )}
                </td>

                <td>
                    ${Number(
                        row.Unit_Cost || 0
                    )}
                </td>

                <td>
                    ${escapeHtml(
                        row.Status || "ACTIVE"
                    )}
                </td>

            </tr>
        `;

    });

    html += `
                </tbody>

            </table>

        </div>
    `;

    previewArea.innerHTML = html;

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
// IMPORT MATERIALS
//====================================================

async function importMaterialsFromExcel(){

    try{

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

        // --------------------------------------------
        // LOAD DEPARTMENTS
        // --------------------------------------------

        const {
            data: departments,
            error: departmentError
        } = await supabase
            .from("departments")
            .select(
                "id, department_name, prefix"
            );

        if(departmentError){
            throw departmentError;
        }

        const departmentMap = {};

        (departments || []).forEach(
            dept => {

                departmentMap[
                    String(
                        dept.department_name
                    )
                    .trim()
                    .toUpperCase()
                ] = dept;

            }
        );

        // --------------------------------------------
        // LOAD CATEGORIES
        // --------------------------------------------

        const {
            data: categories,
            error: categoryError
        } = await supabase
            .from("material_categories")
            .select(
                "id, department_id, category_name, short_code"
            );

        if(categoryError){
            throw categoryError;
        }

        const categoryMap = {};

        (categories || []).forEach(
            cat => {

                const key =
                    String(cat.department_id) +
                    "|" +
                    String(
                        cat.category_name
                    )
                    .trim()
                    .toUpperCase();

                categoryMap[key] = cat;

            }
        );

        // --------------------------------------------
        // IMPORT EACH ROW
        // --------------------------------------------

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

                const materialName =
                    String(
                        row.Material_Name || ""
                    ).trim();

                const departmentName =
                    String(
                        row.Department || ""
                    ).trim();

                const categoryName =
                    String(
                        row.Category || ""
                    ).trim();

                // REQUIRED
                if(!materialName){

                    throw new Error(
                        "Material Name missing"
                    );

                }

                if(!departmentName){

                    throw new Error(
                        "Department missing"
                    );

                }

                // ------------------------------------
                // FIND DEPARTMENT
                // ------------------------------------

                const department =
                    departmentMap[
                        departmentName.toUpperCase()
                    ];

                if(!department){

                    throw new Error(
                        "Department not found: " +
                        departmentName
                    );

                }

                // ------------------------------------
                // FIND CATEGORY
                // Category is OPTIONAL
                // ------------------------------------

                let category = null;

                if(categoryName){

                    const categoryKey =
                        String(department.id) +
                        "|" +
                        categoryName.toUpperCase();

                    category =
                        categoryMap[
                            categoryKey
                        ];

                    if(!category){

                        throw new Error(
                            "Category not found: " +
                            categoryName
                        );

                    }

                }

                // ------------------------------------
                // GENERATE CODE
                // ------------------------------------

                const materialCode =
                    await generateImportMaterialCode(
                        department.prefix
                    );

                // ------------------------------------
                // MATERIAL OBJECT
                // ------------------------------------

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
                            ? category.category_name
                            : "",

                    material_short_name:
                        category
                            ? (
                                category.short_code || ""
                              )
                            : "",

                    brand:
                        String(
                            row.Brand || ""
                        ).trim(),

                    item_type:
                        String(
                            row.Item_Type || ""
                        ).trim(),

                    specification:
                        String(
                            row.Specification || ""
                        ).trim(),

                    item_size:
                        String(
                            row.Item_Size || ""
                        ).trim(),

                    unit:
                        String(
                            row.Unit || ""
                        ).trim(),

                    minimum_stock:
                        Number(
                            row.Minimum_Stock || 0
                        ),

                    rack_location:
                        String(
                            row.Rack_Location || ""
                        ).trim(),

                    status:
                        String(
                            row.Status ||
                            "ACTIVE"
                        )
                        .trim()
                        .toUpperCase(),

                    unit_cost:
                        Number(
                            row.Unit_Cost || 0
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
                        String(
                            row.Description || ""
                        ).trim(),

                    searchable_text:
                    (
                        materialCode + " " +
                        materialName + " " +
                        (
                            category
                                ? category.category_name
                                : ""
                        ) + " " +
                        String(
                            row.Brand || ""
                        ) + " " +
                        String(
                            row.Specification || ""
                        ) + " " +
                        String(
                            row.Item_Size || ""
                        )
                    ).toUpperCase(),

                    is_active:
                        String(
                            row.Status ||
                            "ACTIVE"
                        )
                        .trim()
                        .toUpperCase() ===
                        "ACTIVE"

                };

                // ------------------------------------
                // INSERT INTO MATERIALS
                // ------------------------------------

                const {
                    error: insertError
                } = await supabase
                    .from("materials")
                    .insert(material);

                if(insertError){
                    throw insertError;
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

        // --------------------------------------------
        // RESULT
        // --------------------------------------------

        let message =
            successCount +
            " material(s) imported successfully.";

        if(failedRows.length){

            message +=
                " " +
                failedRows.length +
                " row(s) failed.";

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

        // --------------------------------------------
        // CLOSE MODAL
        // --------------------------------------------

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

        const btn =
            document.getElementById(
                "btnImportNow"
            );

        if(btn){

            btn.disabled = false;

            btn.innerHTML =
                "Import Materials";

        }

    }

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

        if(document.getElementById("materialName").value.trim()==""){

            showAlert("Enter Material Name","warning");
            return;

        }

        if(document.getElementById("materialCode").value.trim()==""){

            await generateMaterialCode();

        }

async function saveMaterial(){

    try{

        // Validation

        if(document.getElementById("department").value==""){

            showAlert("Select Department","warning");
            return;

        }

        if(document.getElementById("materialName").value.trim()==""){

            showAlert("Enter Material Name","warning");
            return;

        }

        if(document.getElementById("materialCode").value.trim()==""){

            await generateMaterialCode();

        }

        // Category information
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
                  ].text
                : "";

        // Material object
        const material = {

            material_code:
                document.getElementById("materialCode").value.trim(),

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
                document.getElementById("description").value.trim()

        };
(
    document.getElementById("materialCode").value + " " +
    document.getElementById("materialName").value + " " +
    document.getElementById("category")
        .options[
            document.getElementById("category").selectedIndex
        ].text + " " +
    document.getElementById("brand").value + " " +
    document.getElementById("specification").value + " " +
    document.getElementById("itemSize").value
).toUpperCase(),

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
