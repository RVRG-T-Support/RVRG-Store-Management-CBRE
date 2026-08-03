//====================================================
// MATERIAL MASTER
// RVRG Store Management Enterprise
//====================================================

const supabase = window.supabaseClient;

const currentUser = getCurrentUser();

document.addEventListener("DOMContentLoaded", initializePage);

async function initializePage() {

    try {

        await loadDepartments();

        initializeDefaults();

        registerEvents();

    }
    catch (error) {

        console.error(error);

        showAlert("Unable to load Material Master", "danger");

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

    const {data,error}=await supabase

        .from("departments")

        .select("id,department_name,prefix")

        .eq("is_active",true)

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
// EVENTS
//====================================================

function registerEvents(){

    document

        .getElementById("btnGenerateCode")

        .addEventListener("click",generateMaterialCode);

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
