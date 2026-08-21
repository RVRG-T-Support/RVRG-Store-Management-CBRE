// RVRG Store Management - Bulk Material Category Import / Export

let categoryImportRows = [];


// ============================================================
// OPEN IMPORT MODAL
// ============================================================

function openCategoryImport() {

    categoryImportRows = [];

    document.getElementById('categoryExcelFile').value = '';
    document.getElementById('categoryImportPreview').innerHTML = '';
    document.getElementById('categoryImportResult').innerHTML = '';
    document.getElementById('btnImportCategories').disabled = true;

    bootstrap.Modal.getOrCreateInstance(
        document.getElementById('categoryImportModal')
    ).show();
}


// ============================================================
// DOWNLOAD EXCEL TEMPLATE
// ============================================================

function downloadCategoryTemplate() {

    if (typeof XLSX === 'undefined') {

        showAlert(
            'Excel library is not loaded.',
            'danger'
        );

        return;
    }

    const rows = [

        {
            'Department Code': 'ELE',
            'Category Name': 'MCB',
            'Short Code': 'MCB',
            'Description': 'Miniature Circuit Breaker',
            'Status': 'ACTIVE'
        },

        {
            'Department Code': 'ELE',
            'Category Name': 'Switch',
            'Short Code': 'SW',
            'Description': 'Electrical Switch',
            'Status': 'ACTIVE'
        }

    ];

    const ws =
        XLSX.utils.json_to_sheet(rows);

    ws['!cols'] = [
        { wch: 18 },
        { wch: 30 },
        { wch: 18 },
        { wch: 45 },
        { wch: 14 }
    ];

    const wb =
        XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
        wb,
        ws,
        'Categories'
    );

    XLSX.writeFile(
        wb,
        'RVRG_Material_Category_Import_Template.xlsx'
    );
}


// ============================================================
// NORMALIZE EXCEL HEADER
// ============================================================

function normalizeHeader(value) {

    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[ _-]+/g, '');
}


// ============================================================
// NORMALIZE STATUS
// ============================================================

function normalizeStatus(value) {

    const status =
        String(value ?? '')
            .trim()
            .toUpperCase();

    if (
        !status ||
        [
            'ACTIVE',
            'TRUE',
            '1',
            'YES'
        ].includes(status)
    ) {

        return true;
    }

    if (
        [
            'INACTIVE',
            'FALSE',
            '0',
            'NO'
        ].includes(status)
    ) {

        return false;
    }

    return null;
}


// ============================================================
// HTML ESCAPE
// ============================================================

function esc(value) {

    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}


// ============================================================
// READ EXCEL FILE
// ============================================================

async function handleCategoryExcelFile(event) {

    const file =
        event.target.files?.[0];

    const preview =
        document.getElementById(
            'categoryImportPreview'
        );

    const result =
        document.getElementById(
            'categoryImportResult'
        );

    const btn =
        document.getElementById(
            'btnImportCategories'
        );

    categoryImportRows = [];

    preview.innerHTML = '';
    result.innerHTML = '';

    btn.disabled = true;

    if (!file) {
        return;
    }


    try {

        const workbook =
            XLSX.read(
                await file.arrayBuffer(),
                {
                    type: 'array'
                }
            );


        if (!workbook.SheetNames.length) {

            throw new Error(
                'No worksheet found.'
            );

        }


        const sheet =
            workbook.Sheets[
                workbook.SheetNames[0]
            ];


        const raw =
            XLSX.utils.sheet_to_json(
                sheet,
                {
                    defval: '',
                    raw: false
                }
            );


        if (!raw.length) {

            throw new Error(
                'The worksheet is empty.'
            );

        }


        categoryImportRows =
            raw.map(
                (row, index) => {

                    const x = {};


                    Object.entries(row)
                        .forEach(
                            ([key, value]) => {

                                x[
                                    normalizeHeader(key)
                                ] = value;

                            }
                        );


                    return {

                        excelRow:
                            index + 2,

                        departmentCode:
                            String(
                                x.departmentcode ||
                                x.deptcode ||
                                ''
                            )
                            .trim()
                            .toUpperCase(),

                        categoryName:
                            String(
                                x.categoryname ||
                                x.category ||
                                ''
                            )
                            .trim(),

                        shortCode:
                            String(
                                x.shortcode ||
                                x.shortname ||
                                ''
                            )
                            .trim()
                            .toUpperCase(),

                        description:
                            String(
                                x.description ||
                                ''
                            )
                            .trim(),

                        status:
                            String(
                                x.status ??
                                ''
                            )
                            .trim()

                    };

                }
            );


        // ====================================================
        // PREVIEW TABLE
        // ====================================================

        preview.innerHTML =

            '<div class="small text-muted mb-2">' +

            categoryImportRows.length +

            ' row(s) detected.</div>' +

            '<div class="table-responsive" ' +
            'style="max-height:320px">' +

            '<table class="table table-sm ' +
            'table-bordered align-middle">' +

            '<thead class="table-dark sticky-top">' +

            '<tr>' +

            '<th>Row</th>' +
            '<th>Department</th>' +
            '<th>Category</th>' +
            '<th>Short Code</th>' +
            '<th>Description</th>' +
            '<th>Status</th>' +

            '</tr>' +

            '</thead>' +

            '<tbody>' +

            categoryImportRows
                .slice(0, 100)
                .map(
                    row =>

                        '<tr>' +

                        '<td>' +
                        row.excelRow +
                        '</td>' +

                        '<td>' +
                        esc(row.departmentCode) +
                        '</td>' +

                        '<td>' +
                        esc(row.categoryName) +
                        '</td>' +

                        '<td>' +
                        esc(row.shortCode) +
                        '</td>' +

                        '<td>' +
                        esc(
                            row.description || '-'
                        ) +
                        '</td>' +

                        '<td>' +
                        esc(
                            row.status ||
                            'ACTIVE'
                        ) +
                        '</td>' +

                        '</tr>'

                )
                .join('') +

            '</tbody>' +

            '</table>' +

            '</div>';


        btn.disabled = false;


    }
    catch (error) {

        console.error(
            'Category Excel Read Error:',
            error
        );

        showAlert(
            'Unable to read Excel file: ' +
            error.message,
            'danger'
        );

    }
}


// ============================================================
// IMPORT CATEGORIES
// ============================================================

async function importCategoriesFromExcel() {

    const btn =
        document.getElementById(
            'btnImportCategories'
        );

    const result =
        document.getElementById(
            'categoryImportResult'
        );


    if (!categoryImportRows.length) {

        showAlert(
            'Please select an Excel file first.',
            'warning'
        );

        return;
    }


    btn.disabled = true;

    btn.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin me-1"></i>' +
        'Importing...';

    result.innerHTML = '';


    try {

        // ====================================================
        // LOAD DEPARTMENTS
        // ====================================================

        const departmentResponse =
            await supabase
                .from('departments')
                .select(
                    'id, department_code, department_name'
                );


        if (departmentResponse.error) {

            throw departmentResponse.error;

        }


        const departmentMap = {};


        (
            departmentResponse.data || []
        )
        .forEach(
            department => {

                const code =
                    String(
                        department.department_code ||
                        ''
                    )
                    .trim()
                    .toUpperCase();


                if (code) {

                    departmentMap[code] =
                        department;

                }

            }
        );


        // ====================================================
        // LOAD EXISTING CATEGORIES
        // ====================================================

        const categoryResponse =
            await supabase
                .from('material_categories')
                .select(
                    'department_id, category_name, short_code'
                );


        if (categoryResponse.error) {

            throw categoryResponse.error;

        }


        const existingCategories =
            new Set();

        const existingShortCodes =
            new Set();


        (
            categoryResponse.data || []
        )
        .forEach(
            category => {

                existingCategories.add(

                    String(
                        category.department_id
                    ) +

                    '|' +

                    String(
                        category.category_name ||
                        ''
                    )
                    .trim()
                    .toUpperCase()

                );


                existingShortCodes.add(

                    String(
                        category.department_id
                    ) +

                    '|' +

                    String(
                        category.short_code ||
                        ''
                    )
                    .trim()
                    .toUpperCase()

                );

            }
        );


        // ====================================================
        // VALIDATE EXCEL ROWS
        // ====================================================

        const validRows = [];

        const failedRows = [];

        const excelCategories =
            new Set();

        const excelShortCodes =
            new Set();


        for (
            const row
            of categoryImportRows
        ) {

            try {

                // Department Code

                if (!row.departmentCode) {

                    throw new Error(
                        'Department Code missing'
                    );

                }


                // Category Name

                if (!row.categoryName) {

                    throw new Error(
                        'Category Name missing'
                    );

                }


                // Short Code

                if (!row.shortCode) {

                    throw new Error(
                        'Short Code missing'
                    );

                }


                // Find Department

                const department =
                    departmentMap[
                        row.departmentCode
                    ];


                if (!department) {

                    throw new Error(
                        'Department Code not found: ' +
                        row.departmentCode
                    );

                }


                // Status

                const active =
                    normalizeStatus(
                        row.status
                    );


                if (active === null) {

                    throw new Error(
                        'Invalid Status. ' +
                        'Use ACTIVE or INACTIVE'
                    );

                }


                // Keys

                const categoryKey =

                    String(
                        department.id
                    ) +

                    '|' +

                    row.categoryName
                        .toUpperCase();


                const shortKey =

                    String(
                        department.id
                    ) +

                    '|' +

                    row.shortCode
                        .toUpperCase();


                // Existing category

                if (
                    existingCategories
                        .has(categoryKey)
                ) {

                    throw new Error(
                        'Category already exists ' +
                        'in this department'
                    );

                }


                // Existing short code

                if (
                    existingShortCodes
                        .has(shortKey)
                ) {

                    throw new Error(
                        'Short Code already exists ' +
                        'in this department'
                    );

                }


                // Duplicate category in Excel

                if (
                    excelCategories
                        .has(categoryKey)
                ) {

                    throw new Error(
                        'Duplicate Category in Excel'
                    );

                }


                // Duplicate short code in Excel

                if (
                    excelShortCodes
                        .has(shortKey)
                ) {

                    throw new Error(
                        'Duplicate Short Code in Excel'
                    );

                }


                excelCategories.add(
                    categoryKey
                );

                excelShortCodes.add(
                    shortKey
                );


                // Valid row

                validRows.push({

                    department_id:
                        Number(
                            department.id
                        ),

                    category_name:
                        row.categoryName,

                    short_code:
                        row.shortCode,

                    description:
                        row.description ||
                        null,

                    is_active:
                        active

                });

            }
            catch (error) {

                failedRows.push({

                    row:
                        row.excelRow,

                    category:
                        row.categoryName ||
                        '(blank)',

                    error:
                        error.message

                });

            }

        }


        // ====================================================
        // INSERT VALID ROWS
        // ====================================================

        let successCount = 0;


        for (
            const item
            of validRows
        ) {

            const insertResponse =
                await supabase
                    .from(
                        'material_categories'
                    )
                    .insert(item);


            if (insertResponse.error) {

                failedRows.push({

                    row: '-',

                    category:
                        item.category_name,

                    error:
                        insertResponse
                            .error
                            .message

                });

            }
            else {

                successCount++;

            }

        }


        // ====================================================
        // DISPLAY RESULT
        // ====================================================

        let output =

            '<div class="alert ' +

            (
                failedRows.length
                    ? 'alert-warning'
                    : 'alert-success'
            ) +

            '">' +

            '<strong>Import Completed</strong>' +

            '<br>' +

            successCount +

            ' category(s) imported successfully.' +

            '<br>' +

            failedRows.length +

            ' row(s) failed.' +

            '</div>';


        // Failed rows

        if (failedRows.length) {

            output +=

                '<div class="table-responsive">' +

                '<table class="table table-sm ' +
                'table-bordered">' +

                '<thead class="table-warning">' +

                '<tr>' +

                '<th>Excel Row</th>' +
                '<th>Category</th>' +
                '<th>Reason</th>' +

                '</tr>' +

                '</thead>' +

                '<tbody>' +

                failedRows
                    .map(
                        row =>

                            '<tr>' +

                            '<td>' +
                            esc(row.row) +
                            '</td>' +

                            '<td>' +
                            esc(row.category) +
                            '</td>' +

                            '<td class="text-danger">' +
                            esc(row.error) +
                            '</td>' +

                            '</tr>'
                    )
                    .join('') +

                '</tbody>' +

                '</table>' +

                '</div>';

        }


        result.innerHTML =
            output;


        // Refresh existing category list

        if (
            typeof loadCategories ===
            'function'
        ) {

            await loadCategories();

        }


        showAlert(

            successCount +
            ' category(s) imported successfully.',

            failedRows.length
                ? 'warning'
                : 'success'

        );


    }
    catch (error) {

        console.error(
            'Category Import Error:',
            error
        );


        result.innerHTML =

            '<div class="alert alert-danger">' +

            '<strong>Import failed:</strong> ' +

            esc(
                error.message
            ) +

            '</div>';


        showAlert(
            'Category import failed: ' +
            error.message,
            'danger'
        );

    }
    finally {

        btn.disabled = false;

        btn.innerHTML =
            '<i class="fa-solid fa-file-import me-1"></i>' +
            'Import Categories';

    }
}


// ============================================================
// EXPORT CATEGORIES TO EXCEL
// ============================================================

async function exportCategoriesToExcel() {

    try {

        const response =
            await supabase

                .from(
                    'material_categories'
                )

                .select(`
                    category_name,
                    short_code,
                    description,
                    is_active,
                    departments (
                        department_code,
                        department_name
                    )
                `)

                .order(
                    'category_name'
                );


        if (response.error) {

            throw response.error;

        }


        const rows =

            (
                response.data ||
                []
            )
            .map(
                category => ({

                    'Department Code':

                        category
                            .departments
                            ?.department_code ||
                        '',


                    'Department Name':

                        category
                            .departments
                            ?.department_name ||
                        '',


                    'Category Name':

                        category
                            .category_name ||
                        '',


                    'Short Code':

                        category
                            .short_code ||
                        '',


                    'Description':

                        category
                            .description ||
                        '',


                    'Status':

                        category
                            .is_active

                            ? 'ACTIVE'

                            : 'INACTIVE'

                })
            );


        const ws =
            XLSX.utils.json_to_sheet(
                rows
            );


        const wb =
            XLSX.utils.book_new();


        XLSX.utils.book_append_sheet(
            wb,
            ws,
            'Categories'
        );


        XLSX.writeFile(
            wb,
            'RVRG_Material_Categories.xlsx'
        );


        showAlert(

            rows.length +
            ' category(s) exported successfully.',

            'success'

        );

    }
    catch (error) {

        console.error(
            'Category Export Error:',
            error
        );


        showAlert(

            'Unable to export categories: ' +
            error.message,

            'danger'

        );

    }
}
