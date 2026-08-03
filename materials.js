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

function generateMaterialCode(){

    showAlert(

        "Automatic Material Code Generator will be implemented in Part-2.",

        "info"

    );

}
