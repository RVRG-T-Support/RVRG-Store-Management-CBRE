// reports.js
// ============================================================
// RVRG STORE MANAGEMENT - SYSTEM REPORTS
// Clean replacement version
// ============================================================

const currentUser = getCurrentUser();

if (!currentUser) {
    window.location.replace("index.html");
}

// ------------------------------------------------------------
// GLOBAL REPORT STATE
// ------------------------------------------------------------

let lastReportData = [];
let lastReportType = "";

// ------------------------------------------------------------
// PAGE INITIALIZATION
// ------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {

    const user = getCurrentUser();

    if (!user) {
        window.location.replace("index.html");
        return;
    }

    const hasAccess = checkUserAccess([
        "ADMIN",
        "FM",
        "AFM",
        "STORE",
        "STOREKEEPER",
        "TECH_SUPERVISOR"
    ]);

    if (!hasAccess) {
        return;
    }

    // Default date range: current month -> today
    const today = new Date();

    const firstDay = new Date(
        today.getFullYear(),
        today.getMonth(),
        1
    );

    const fromInput = document.getElementById("filterFromDate");
    const toInput = document.getElementById("filterToDate");

    if (fromInput) {
        fromInput.value = toLocalDateString(firstDay);
    }

    if (toInput) {
        toInput.value = toLocalDateString(today);
    }

    // Report form
    const reportForm = document.getElementById("reportFilterForm");

    if (reportForm) {
        reportForm.addEventListener("submit", generateReport);
    }

    initializeReportMaterialPicker();

    // Excel
    const excelButton = document.getElementById("btnExportReport");

    if (excelButton) {
        if (canExportReportExcel(user)) {
            excelButton.classList.remove("d-none");
            excelButton.addEventListener("click", exportToExcel);
        } else {
            excelButton.classList.add("d-none");
        }
    }

    // PDF
    const pdfButton = document.getElementById("btnExportPdfReport");

    if (pdfButton) {
        pdfButton.addEventListener("click", exportToPDF);
    }

    // History
    const historyButton = document.getElementById("btnReportHistory");

    if (historyButton) {
        historyButton.addEventListener(
            "click",
            loadReportDownloadHistory
        );
    }
});


// ============================================================
// BASIC HELPERS
// ============================================================

function toLocalDateString(date) {

    const year = date.getFullYear();

    const month = String(
        date.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
        date.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


function getReportDateRange(fromDate, toDate) {

    return {
        start: `${fromDate}T00:00:00`,
        end: `${toDate}T23:59:59.999`
    };
}


function withReportTimeout(
    promise,
    label,
    timeoutMs = 20000
) {

    return Promise.race([

        promise,

        new Promise((_, reject) => {

            setTimeout(() => {

                reject(
                    new Error(
                        `${label} timed out after ${timeoutMs / 1000} seconds.`
                    )
                );

            }, timeoutMs);

        })

    ]);
}


function uniqueIds(values) {

    return [
        ...new Set(
            (values || [])
                .filter(
                    value =>
                        value !== null &&
                        value !== undefined &&
                        String(value).trim() !== ""
                )
                .map(value => String(value).trim())
        )
    ];
}


// ============================================================
// MASTER DATA HELPERS
// ============================================================
// IMPORTANT:
// This version deliberately does NOT use nested Supabase
// material -> departments joins for report generation.
//
// We load material records first and department records
// separately. This removes the dependency on nested relationship
// resolution from the report query.
// ============================================================

async function loadMaterialsMap(materialIds) {

    const ids = uniqueIds(materialIds);

    if (!ids.length) {
        return {};
    }

    const {
        data,
        error
    } = await withReportTimeout(

        supabase
            .from("materials")
            .select(`
                id,
                material_code,
                material_name,
                category,
                unit,
                department_id,
                unit_cost
            `)
            .in("id", ids),

        "Materials"
    );

    if (error) {
        throw error;
    }

    const map = {};

    (data || []).forEach(material => {

        map[String(material.id)] = material;

    });

    return map;
}


async function loadDepartmentMap(departmentIds) {

    const ids = uniqueIds(departmentIds);

    if (!ids.length) {
        return {};
    }

    const {
        data,
        error
    } = await withReportTimeout(

        supabase
            .from("departments")
            .select(`
                id,
                department_name
            `)
            .in("id", ids),

        "Departments"
    );

    if (error) {
        throw error;
    }

    const map = {};

    (data || []).forEach(department => {

        map[String(department.id)] =
            department.department_name || "-";

    });

    return map;
}


async function enrichRowsWithMaterials(
    rows,
    materialIdField = "material_id"
) {

    const materialIds = uniqueIds(
        rows.map(
            row => row[materialIdField]
        )
    );

    const materialsMap =
        await loadMaterialsMap(materialIds);

    const departmentIds = uniqueIds(
        Object.values(materialsMap)
            .map(
                material =>
                    material.department_id
            )
    );

    const departmentMap =
        await loadDepartmentMap(departmentIds);

    return {
        materialsMap,
        departmentMap
    };
}


function getMaterialForRow(
    row,
    materialsMap,
    materialIdField = "material_id"
) {

    return (
        materialsMap[
            String(
                row[materialIdField] || ""
            )
        ] || {}
    );
}


function getDepartmentName(
    material,
    departmentMap
) {

    if (!material) {
        return "-";
    }

    return (
        departmentMap[
            String(
                material.department_id || ""
            )
        ] || "-"
    );
}


let selectedReportMaterialCode = '';
let reportMaterialCatalogPromise = null;

async function loadReportMaterialCatalog() {
    if (!reportMaterialCatalogPromise) {
        reportMaterialCatalogPromise = (async () => {
            const materials = [];
            for (let offset = 0; ; offset += 1000) {
                const { data, error } = await withReportTimeout(
                    supabase.from('materials').select('id, material_code, material_name, department_id')
                        .order('id', { ascending: true }).range(offset, offset + 999),
                    'Material suggestions');
                if (error) throw error;
                materials.push(...(data || []));
                if ((data || []).length < 1000) break;
            }
            const departments = await loadDepartmentMap(materials.map(m => m.department_id));
            return materials.map(m => ({ ...m, department_name: departments[String(m.department_id)] || '' }));
        })().catch(error => { reportMaterialCatalogPromise = null; throw error; });
    }
    return reportMaterialCatalogPromise;
}

function matchReportMaterials(materials, search, department = 'ALL') {
    const terms = String(search || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return materials.filter(m => (department === 'ALL' || m.department_name === department) &&
        terms.every(term => `${m.material_code || ''} ${m.material_name || ''}`.toLowerCase().includes(term)));
}

function initializeReportMaterialPicker() {
    const input = document.getElementById('filterMaterialSearch');
    const list = document.getElementById('reportMaterialSuggestions');
    const picker = document.getElementById('reportMaterialPicker');
    if (!input?.setAttribute || !list || !picker || input.dataset.suggestionsBound) return;
    input.dataset.suggestionsBound = 'true';
    let version = 0, active = -1;
    const close = () => { version++; list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
    const status = text => { list.textContent = ''; const item = document.createElement('div'); item.className = 'list-group-item small text-muted'; item.textContent = text; list.appendChild(item); };
    async function show() {
        const search = input.value.trim();
        if (!search) { close(); return; }
        const current = ++version;
        list.hidden = false; input.setAttribute('aria-expanded', 'true'); active = -1;
        input.removeAttribute('aria-activedescendant'); status('Loading materials...');
        try {
            const catalog = await loadReportMaterialCatalog();
            if (current !== version) return;
            const matches = matchReportMaterials(catalog, search, document.getElementById('filterDepartment')?.value || 'ALL');
            list.textContent = '';
            if (!matches.length) { status('No material suggestions. Click Generate to search ticket/invoice numbers, complaints and materials.'); return; }
            matches.slice(0, 20).forEach((material, index) => {
                const option = document.createElement('button'); option.type = 'button';
                option.className = 'list-group-item list-group-item-action text-start';
                option.id = `reportMaterialOption-${index}`; option.setAttribute('role', 'option'); option.setAttribute('aria-selected', 'false');
                const code = document.createElement('strong'); code.textContent = material.material_code || '-';
                const name = document.createElement('div'); name.textContent = material.material_name || '-';
                const department = document.createElement('small'); department.textContent = material.department_name;
                option.append(code, name, department);
                option.onclick = () => { selectedReportMaterialCode = material.material_code; input.value = material.material_code; close(); input.focus(); };
                list.appendChild(option);
            });
            if (matches.length > 20) { const hint = document.createElement('div'); hint.className = 'list-group-item small text-muted'; hint.textContent = 'Showing 20 matches. Keep typing to narrow the list.'; list.appendChild(hint); }
        } catch (error) {
            if (current === version) status('Material suggestions unavailable. Type a ticket, complaint, material code or name and click Generate.');
        }
    }
    input.addEventListener('input', () => { selectedReportMaterialCode = ''; show(); });
    input.addEventListener('focus', () => { if (!selectedReportMaterialCode || input.value !== selectedReportMaterialCode) show(); });
    input.addEventListener('keydown', event => {
        if (event.key === 'Escape') { close(); return; }
        if (list.hidden) return;
        const options = [...list.querySelectorAll('[role="option"]')];
        if (event.key === 'Enter' && active >= 0) { event.preventDefault(); options[active]?.click(); return; }
        if (!['ArrowDown', 'ArrowUp'].includes(event.key) || !options.length) return;
        event.preventDefault(); active = (active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        options.forEach((option, index) => { option.classList.toggle('active', index === active); option.setAttribute('aria-selected', String(index === active)); });
        input.setAttribute('aria-activedescendant', options[active].id); options[active].scrollIntoView({block:'nearest'});
    });
    picker.addEventListener('focusout', event => { if (!picker.contains(event.relatedTarget)) close(); });
    document.addEventListener('click', event => { if (!picker.contains(event.target)) close(); });
    document.getElementById('filterDepartment')?.addEventListener('change', close);
}

function canExportReportExcel(user) {
    return ['ADMIN', 'STOREKEEPER', 'STORE'].includes(String(user?.role || '').trim().toUpperCase());
}

function filterReportByMaterial(rows, search, exactCode = '') {
    if (exactCode) return rows.filter(row => String(row.materialCode || '').trim().toLowerCase() === exactCode.trim().toLowerCase());
    const terms = String(search || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return rows;
    return rows.filter(row => {
        const text = `${row.reference ?? ''} ${row.complaintNumber ?? ''} ${row.materialCode ?? ''} ${row.material ?? ''}`.toLowerCase();
        return terms.every(term => text.includes(term));
    });
}

// ============================================================
// REPORT GENERATION
// ============================================================

async function generateReport(e) {

    e.preventDefault();

    const fromDate =
        document.getElementById(
            "filterFromDate"
        )?.value || "";

    const toDate =
        document.getElementById(
            "filterToDate"
        )?.value || "";

    const departmentName =
        document.getElementById(
            "filterDepartment"
        )?.value || "ALL";

    const recordType =
        document.getElementById(
            "filterRecordType"
        )?.value || "REQUESTS";

    const areaType =
        document.getElementById(
            "filterAreaType"
        )?.value || "ALL";

    if (!fromDate || !toDate) {

        showAlert(
            "Please select From Date and To Date.",
            "warning"
        );

        return;
    }

    if (new Date(fromDate) > new Date(toDate)) {

        showAlert(
            "From Date cannot be after To Date.",
            "warning"
        );

        return;
    }

    const materialSearch = document.getElementById('filterMaterialSearch')?.value.trim() || '';
    const exactMaterialCode = materialSearch.toLowerCase() === selectedReportMaterialCode.toLowerCase() ? selectedReportMaterialCode : '';
    // Never export a previous report while a new query is loading or has failed.
    lastReportData = [];
    const summary = document.getElementById('reportMaterialSummary');
    if (summary) summary.textContent = 'Generating report...';

    const tableBody =
        document.getElementById(
            "reportTableBody"
        );

    if (tableBody) {

        tableBody.innerHTML = `
            <tr>
                <td
                    colspan="11"
                    class="text-center text-muted py-4"
                >
                    <div
                        class="spinner-border text-primary"
                        role="status"
                    ></div>

                    <br>

                    Fetching data...
                </td>
            </tr>
        `;
    }

    const tableFooter =
        document.getElementById(
            "reportTableFooter"
        );

    if (tableFooter) {
        tableFooter.style.display = "none";
    }

    try {

        const {
            start,
            end
        } = getReportDateRange(
            fromDate,
            toDate
        );

        let reportData = [];

        switch (recordType) {

            case "REQUESTS":

                reportData =
                    await fetchRequestData(
                        start,
                        end,
                        departmentName,
                        areaType
                    );

                break;


            case "APPROVALS":

                reportData =
                    await fetchApprovalData(
                        start,
                        end,
                        departmentName,
                        areaType
                    );

                break;


            case "CONSUMPTION":

                reportData =
                    await fetchConsumptionData(
                        start,
                        end,
                        departmentName,
                        areaType
                    );

                break;


            case "RETURNS":

                reportData =
                    await fetchReturnData(
                        start,
                        end,
                        departmentName,
                        areaType
                    );

                break;


            case "PURCHASE":

                reportData =
                    await fetchPurchaseData(
                        start,
                        end,
                        departmentName
                    );

                break;


            case "ALL":

                reportData =
                    await fetchAllTransactions(
                        start,
                        end,
                        departmentName,
                        areaType
                    );

                break;


            default:

                throw new Error(
                    `Unsupported report type: ${recordType}`
                );
        }

        const matchingData = filterReportByMaterial(reportData, materialSearch, exactMaterialCode);
        renderReportTable(matchingData, recordType);
        if (summary) summary.textContent = `${materialSearch ? (exactMaterialCode ? 'Material: ' : 'Search: ') + materialSearch : 'All records'} — ${matchingData.length} record(s)`;

    }
    catch (error) {

        console.error(
            "REPORT ERROR:",
            error
        );
        if (summary) summary.textContent = 'Report could not be generated.';

        if (tableBody) {

            tableBody.innerHTML = `
                <tr>
                    <td
                        colspan="11"
                        class="text-center text-danger py-5"
                    >
                        <strong>
                            Error generating report
                        </strong>

                        <br>

                        <small>
                            ${escapeHtml(
                                error?.message || "Unknown error"
                            )}
                        </small>
                    </td>
                </tr>
            `;
        }

        if (tableFooter) {
            tableFooter.style.display = "none";
        }

        showAlert(
            error?.message ||
            "Failed to load report data.",
            "error"
        );
    }
}


// Resolve the users recorded on each request, rather than the report viewer.
// Fetch only display fields; passwords and contact details are not needed.
async function loadReportUserNames(rows) {
    const ids = uniqueIds(rows.flatMap(row => [row.requested_by, row.approved_by]));
    const names = new Map();
    for (let start = 0; start < ids.length; start += 100) {
        const { data, error } = await withReportTimeout(
            supabase.from("users_master")
                .select("id, full_name, username")
                .in("id", ids.slice(start, start + 100)),
            "Report user names"
        );
        if (error) throw error;
        for (const user of data || []) {
            names.set(String(user.id), String(user.full_name || "").trim() ||
                String(user.username || "").trim());
        }
    }
    return id => {
        if (id == null || String(id).trim() === "") return "-";
        const key = String(id).trim();
        return names.get(key) || `Unknown user (ID: ${key})`;
    };
}


// ============================================================
// MATERIAL REQUEST REPORT
// ============================================================

async function fetchRequestData(
    fromDate,
    toDate,
    departmentName,
    areaType
) {

    console.log(
        "REPORT: Loading material requests..."
    );

    const {
        data,
        error
    } = await withReportTimeout(

        supabase
            .from("material_requests")
            .select(`
                id,
                ticket_no,
                anacity_complaint_no,
                material_id,
                location_name,
                location_type,
                requested_qty,
                request_status,
                created_at,
                requested_by,
                approved_by
            `)
            .gte("created_at", fromDate)
            .lte("created_at", toDate)
            .order(
                "created_at",
                {
                    ascending: false
                }
            ),

        "Material Requests"
    );

    if (error) {
        throw error;
    }

    const rows = data || [];
    const userName = await loadReportUserNames(rows);

    console.log(
        "REPORT: Material requests loaded:",
        rows.length
    );

    const {
        materialsMap,
        departmentMap
    } = await enrichRowsWithMaterials(
        rows
    );

    return rows
        .filter(row => {

            const material =
                getMaterialForRow(
                    row,
                    materialsMap
                );

            const department =
                getDepartmentName(
                    material,
                    departmentMap
                );

            const departmentMatch =
                departmentName === "ALL" ||
                department === departmentName;

            const areaMatch =
                areaType === "ALL" ||
                row.location_type === areaType;

            return (
                departmentMatch &&
                areaMatch
            );
        })
        .map(row => {

            const material =
                getMaterialForRow(
                    row,
                    materialsMap
                );

            return {

                date:
                    row.created_at,

                reference:
                    row.ticket_no || "-",

                complaintNumber:
                    row.anacity_complaint_no ||
                    "N/A",

                materialCode:
                    material.material_code ||
                    "-",

                material:
                    material.material_name ||
                    "-",

                category:
                    material.category ||
                    "-",

                department:
                    getDepartmentName(
                        material,
                        departmentMap
                    ),

                area:
                    row.location_type ||
                    "-",

                unit:
                    material.unit ||
                    "-",

                quantity:
                    Number(
                        row.requested_qty || 0
                    ),

                value:
                    0,

                requestedBy:
                    userName(row.requested_by),

                approvedBy:
                    userName(row.approved_by),

                issuedBy:
                    "-"
            };
        });
}


// ============================================================
// APPROVAL HISTORY REPORT
// ============================================================

async function fetchApprovalData(
    fromDate,
    toDate,
    departmentName,
    areaType
) {

    const {
        data,
        error
    } = await withReportTimeout(

        supabase
            .from("material_requests")
            .select(`
                id,
                ticket_no,
                anacity_complaint_no,
                material_id,
                location_name,
                location_type,
                requested_qty,
                approved_qty,
                request_status,
                created_at,
                approval_date,
                technician_name,
                requested_by,
                approved_by
            `)
.in(
    "request_status",
    [
        "APPROVED",
        "PARTIALLY_APPROVED",
        "ISSUED"
    ]
)
            .gte(
                "approval_date",
                fromDate
            )
            .lte(
                "approval_date",
                toDate
            )
            .order(
                "approval_date",
                {
                    ascending: false
                }
            ),

        "Approval History"
    );

    if (error) {
        throw error;
    }

    const rows = data || [];
    const userName = await loadReportUserNames(rows);

    const {
        materialsMap,
        departmentMap
    } = await enrichRowsWithMaterials(
        rows
    );

    return rows
        .filter(row => {

            const material =
                getMaterialForRow(
                    row,
                    materialsMap
                );

            const department =
                getDepartmentName(
                    material,
                    departmentMap
                );

            const departmentMatch =
                departmentName === "ALL" ||
                department === departmentName;

            const areaMatch =
                areaType === "ALL" ||
                row.location_type === areaType;

            return (
                departmentMatch &&
                areaMatch
            );
        })
        .map(row => {

            const material =
                getMaterialForRow(
                    row,
                    materialsMap
                );

            return {

                date:
                    row.approval_date ||
                    row.created_at,

                reference:
                    row.ticket_no ||
                    "-",

                complaintNumber:
                    row.anacity_complaint_no ||
                    "N/A",

                materialCode:
                    material.material_code ||
                    "-",

                material:
                    material.material_name ||
                    "-",

                category:
                    material.category ||
                    "-",

                department:
                    getDepartmentName(
                        material,
                        departmentMap
                    ),

                area:
                    row.location_type ||
                    "-",

                unit:
                    material.unit ||
                    "-",

                quantity:
                    Number(
                        row.approved_qty ??
                        row.requested_qty ??
                        0
                    ),

                value:
                    0,

                requestedBy:
                    userName(row.requested_by),

                approvedBy:
                    userName(row.approved_by),

                issuedBy:
                    "-",

                extra:
                    `Requested: ${
                        row.requested_qty || 0
                    } | Approved: ${
                        row.approved_qty ??
                        row.requested_qty ??
                        0
                    } | Status: ${
                        row.request_status ||
                        "-"
                    }`
            };
        });
}


// ============================================================
// COMPLAINT NUMBER MAP
// ============================================================

async function loadComplaintNumberMap(
    ticketNumbers
) {

    const uniqueTickets =
        uniqueIds(ticketNumbers);

    const complaintMap = {};

    if (!uniqueTickets.length) {
        return complaintMap;
    }

    const {
        data,
        error
    } = await withReportTimeout(

        supabase
            .from("material_requests")
            .select(
                "ticket_no, anacity_complaint_no"
            )
            .in(
                "ticket_no",
                uniqueTickets
            ),

        "Complaint Numbers"
    );

    if (error) {
        throw error;
    }

    (data || []).forEach(row => {

        const ticket =
            String(
                row.ticket_no || ""
            ).trim();

        if (ticket) {

            complaintMap[ticket] =
                row.anacity_complaint_no ||
                "-";
        }
    });

    return complaintMap;
}


// ============================================================
// MATERIAL CONSUMPTION / ISSUE REPORT
// ============================================================

async function fetchConsumptionData(
    fromDate,
    toDate,
    departmentName,
    areaType
) {

    const {
        data,
        error
    } = await withReportTimeout(

        supabase
            .from("material_issue_register")
            .select(`
                id,
                ticket_no,
                material_id,
                location_type,
                location_name,
                issued_date,
                issued_qty,
                unit_cost,
                issued_by
            `)
            .gte(
                "issued_date",
                fromDate
            )
            .lte(
                "issued_date",
                toDate
            )
            .order(
                "issued_date",
                {
                    ascending: false
                }
            ),

        "Material Consumption"
    );

    if (error) {
        throw error;
    }

    const rows = data || [];

    const {
        materialsMap,
        departmentMap
    } = await enrichRowsWithMaterials(
        rows
    );

    const filtered =
        rows.filter(row => {

            const material =
                getMaterialForRow(
                    row,
                    materialsMap
                );

            const department =
                getDepartmentName(
                    material,
                    departmentMap
                );

            const departmentMatch =
                departmentName === "ALL" ||
                department === departmentName;

            const areaMatch =
                areaType === "ALL" ||
                row.location_type === areaType;

            return (
                departmentMatch &&
                areaMatch
            );
        });

    const complaintMap =
        await loadComplaintNumberMap(
            filtered.map(
                row => row.ticket_no
            )
        );

    return filtered.map(row => {

        const material =
            getMaterialForRow(
                row,
                materialsMap
            );

        const ticketNo =
            row.ticket_no || "-";

        const quantity =
            Number(
                row.issued_qty || 0
            );

        const unitCost =
            Number(
                row.unit_cost || 0
            );

        return {

            date:
                row.issued_date,

            complaintNumber:
                complaintMap[
                    String(ticketNo)
                ] || "-",

            reference:
                ticketNo,

            materialCode:
                material.material_code ||
                "-",

            material:
                material.material_name ||
                "-",

            category:
                material.category ||
                "-",

            department:
                getDepartmentName(
                    material,
                    departmentMap
                ),

            area:
                row.location_type ||
                "-",

            unit:
                material.unit ||
                "-",

            quantity:
                quantity,

            value:
                quantity * unitCost,

            requestedBy:
                "-",

            approvedBy:
                "-",

            issuedBy:
                row.issued_by ||
                "-"
        };
    });
}


// ============================================================
// MATERIAL RETURN REPORT
// ============================================================

async function fetchReturnData(
    fromDate,
    toDate,
    departmentName,
    areaType
) {

    const {
        data,
        error
    } = await withReportTimeout(

        supabase
            .from("material_returns")
            .select(`
                id,
                issue_id,
                material_id,
                returned_qty,
                return_condition,
                received_by,
                return_date,
                remarks
            `)
            .gte(
                "return_date",
                fromDate
            )
            .lte(
                "return_date",
                toDate
            )
            .order(
                "return_date",
                {
                    ascending: false
                }
            ),

        "Material Returns"
    );

    if (error) {
        throw error;
    }

    const rows = data || [];

    const {
        materialsMap,
        departmentMap
    } = await enrichRowsWithMaterials(
        rows
    );

    // Material return rows normally contain material_id.
    // Area and ticket are loaded from issue register separately.
    const issueIds = uniqueIds(
        rows.map(
            row => row.issue_id
        )
    );

    let issueMap = {};

    if (issueIds.length) {

        const {
            data: issues,
            error: issueError
        } = await withReportTimeout(

            supabase
                .from("material_issue_register")
                .select(`
                    id,
                    ticket_no,
                    location_type,
                    location_name
                `)
                .in(
                    "id",
                    issueIds
                ),

            "Return Issue Details"
        );

        if (issueError) {
            throw issueError;
        }

        (issues || []).forEach(issue => {

            issueMap[
                String(issue.id)
            ] = issue;

        });
    }

    const filtered =
        rows.filter(row => {

            const material =
                getMaterialForRow(
                    row,
                    materialsMap
                );

            const issue =
                issueMap[
                    String(
                        row.issue_id || ""
                    )
                ] || {};

            const department =
                getDepartmentName(
                    material,
                    departmentMap
                );

            const departmentMatch =
                departmentName === "ALL" ||
                department === departmentName;

            const areaMatch =
                areaType === "ALL" ||
                issue.location_type === areaType;

            return (
                departmentMatch &&
                areaMatch
            );
        });

    const complaintMap =
        await loadComplaintNumberMap(
            filtered.map(row => {

                const issue =
                    issueMap[
                        String(
                            row.issue_id || ""
                        )
                    ] || {};

                return issue.ticket_no;
            })
        );

    return filtered.map(row => {

        const material =
            getMaterialForRow(
                row,
                materialsMap
            );

        const issue =
            issueMap[
                String(
                    row.issue_id || ""
                )
            ] || {};

        const ticketNo =
            issue.ticket_no || "-";

        const quantity =
            Number(
                row.returned_qty || 0
            );

        const unitCost =
            Number(
                material.unit_cost || 0
            );

        return {

            date:
                row.return_date,

            complaintNumber:
                complaintMap[
                    String(ticketNo)
                ] || "-",

            reference:
                ticketNo,

            materialCode:
                material.material_code ||
                "-",

            material:
                material.material_name ||
                "-",

            category:
                material.category ||
                "-",

            department:
                getDepartmentName(
                    material,
                    departmentMap
                ),

            area:
                issue.location_type ||
                "-",

            unit:
                material.unit ||
                "-",

            quantity:
                quantity,

            value:
                quantity * unitCost,

            requestedBy:
                "-",

            approvedBy:
                "-",

            issuedBy:
                row.received_by ||
                "-",

            extra:
                `Condition: ${
                    row.return_condition ||
                    "-"
                } | Remarks: ${
                    row.remarks ||
                    "-"
                }`
        };
    });
}


// ============================================================
// STOCK PURCHASE REPORT
// ============================================================

async function fetchPurchaseData(
    fromDate,
    toDate,
    departmentName
) {

    const {
        data,
        error
    } = await withReportTimeout(

        supabase
            .from("stock_entry_details")
            .select(`
                material_id,
                quantity,
                purchase_price,
                gst_percentage,
                line_total,

                stock_entry_header!inner(
                    invoice_no,
                    invoice_date,
                    created_by
                )
            `)
            .gte(
                "stock_entry_header.invoice_date",
                fromDate
            )
            .lte(
                "stock_entry_header.invoice_date",
                toDate
            )
            .order(
                "invoice_date",
                {
                    foreignTable:
                        "stock_entry_header",
                    ascending: false
                }
            ),

        "Stock Purchase"
    );

    if (error) {
        throw error;
    }

    const rows = data || [];

    const {
        materialsMap,
        departmentMap
    } = await enrichRowsWithMaterials(
        rows
    );

    const filtered =
        rows.filter(row => {

            const material =
                getMaterialForRow(
                    row,
                    materialsMap
                );

            const department =
                getDepartmentName(
                    material,
                    departmentMap
                );

            return (
                departmentName === "ALL" ||
                department === departmentName
            );
        });

    // Load creator names.
    const createdByIds =
        uniqueIds(
            filtered.map(
                row =>
                    row.stock_entry_header
                        ?.created_by
            )
        );

    const userMap = {};

    if (createdByIds.length) {

        const {
            data: users,
            error: usersError
        } = await withReportTimeout(

            supabase
                .from("users_master")
                .select(
                    "id, full_name"
                )
                .in(
                    "id",
                    createdByIds
                ),

            "Purchase Users"
        );

        if (usersError) {
            throw usersError;
        }

        (users || []).forEach(user => {

            userMap[
                String(user.id)
            ] =
                user.full_name ||
                "-";
        });
    }

    return filtered.map(row => {

        const header =
            row.stock_entry_header ||
            {};

        const material =
            getMaterialForRow(
                row,
                materialsMap
            );

        const quantity =
            Number(
                row.quantity || 0
            );

        const unitPrice =
            Number(
                row.purchase_price || 0
            );

        const gstPercentage =
            Number(
                row.gst_percentage || 0
            );

        const basicAmount =
            quantity * unitPrice;

        const gstAmount =
            basicAmount *
            gstPercentage /
            100;

        const finalAmount =
            basicAmount +
            gstAmount;

        return {

            date:
                header.invoice_date,

            complaintNumber:
                "-",

            reference:
                header.invoice_no ||
                "-",

            materialCode:
                material.material_code ||
                "-",

            material:
                material.material_name ||
                "-",

            category:
                material.category ||
                "-",

            department:
                getDepartmentName(
                    material,
                    departmentMap
                ),

            area:
                "Stock Purchase",

            unit:
                material.unit ||
                "-",

            quantity:
                quantity,

            value:
                Number(
                    finalAmount.toFixed(2)
                ),

            requestedBy:
                userMap[
                    String(
                        header.created_by || ""
                    )
                ] || "-",

            approvedBy:
                "-",

            issuedBy:
                "-"
        };
    });
}
// ============================================================
// ALL TRANSACTIONS
// ============================================================

async function fetchAllTransactions(
    fromDate,
    toDate,
    departmentName,
    areaType
) {

    const [
        requests,
        approvals,
        consumption,
        returns,
        purchases
    ] = await Promise.all([

        fetchRequestData(
            fromDate,
            toDate,
            departmentName,
            areaType
        ),

        fetchApprovalData(
            fromDate,
            toDate,
            departmentName,
            areaType
        ),

        fetchConsumptionData(
            fromDate,
            toDate,
            departmentName,
            areaType
        ),

        fetchReturnData(
            fromDate,
            toDate,
            departmentName,
            areaType
        ),

        fetchPurchaseData(
            fromDate,
            toDate,
            departmentName
        )
    ]);

    return [

        ...requests.map(row => ({
            ...row,
            transactionType:
                "REQUEST"
        })),

        ...approvals.map(row => ({
            ...row,
            transactionType:
                "APPROVAL"
        })),

        ...consumption.map(row => ({
            ...row,
            transactionType:
                "ISSUE"
        })),

        ...returns.map(row => ({
            ...row,
            transactionType:
                "RETURN"
        })),

        ...purchases.map(row => ({
            ...row,
            transactionType:
                "PURCHASE"
        }))

    ].sort(
        (a, b) =>
            new Date(b.date) -
            new Date(a.date)
    );
}


// ============================================================
// PROCESSED BY
// ============================================================

function getProcessedBy(
    row,
    recordType
) {

    if (recordType === "REQUESTS") {
        return escapeHtml(row.requestedBy || "-");
    }

    if (recordType === "APPROVALS") {

        return `
            <div>
                Requested:
                ${escapeHtml(
                    row.requestedBy || "-"
                )}
            </div>

            <div>
                Approved:
                ${escapeHtml(
                    row.approvedBy || "-"
                )}
            </div>
        `;
    }

    if (recordType === "CONSUMPTION") {
        return row.issuedBy || "-";
    }

    if (recordType === "RETURNS") {
        return row.issuedBy || "-";
    }

    if (recordType === "PURCHASE") {
        return escapeHtml(row.requestedBy || "-");
    }

    if (recordType === "ALL") {

        if (row.transactionType === "REQUEST") {
            return escapeHtml(row.requestedBy || "-");
        }

        if (row.transactionType === "APPROVAL") {

            return `
                Requested:
                ${escapeHtml(
                    row.requestedBy || "-"
                )}

                <br>

                Approved:
                ${escapeHtml(
                    row.approvedBy || "-"
                )}
            `;
        }

        if (row.transactionType === "ISSUE") {
            return row.issuedBy || "-";
        }

        if (row.transactionType === "RETURN") {
            return row.issuedBy || "-";
        }

        if (row.transactionType === "PURCHASE") {
            return escapeHtml(row.requestedBy || "-");
        }
    }

    return "-";
}


// ============================================================
// RENDER STANDARD REPORT TABLE
// ============================================================

function renderReportTable(
    data,
    recordType
) {

    const tableBody =
        document.getElementById(
            "reportTableBody"
        );

    const tableFooter =
        document.getElementById(
            "reportTableFooter"
        );

    lastReportData =
        Array.isArray(data)
            ? data
            : [];

    lastReportType =
        recordType || "";

    if (!tableBody) {
        return;
    }

    if (!lastReportData.length) {

        tableBody.innerHTML = `
            <tr>
                <td
                    colspan="11"
                    class="text-center text-muted py-5"
                >
                    No records found
                    for the selected filters.
                </td>
            </tr>
        `;

        if (tableFooter) {
            tableFooter.style.display =
                "none";
        }

        updateReportTotals(0, 0);

        return;
    }

    tableBody.innerHTML = "";

    let totalQty = 0;
    let totalValue = 0;

    lastReportData.forEach(row => {

        totalQty +=
            Number(
                row.quantity || 0
            );

        totalValue +=
            Number(
                row.value || 0
            );

        const tr =
            document.createElement(
                "tr"
            );

        if (
            recordType === "ALL" &&
            row.transactionType
        ) {

            tr.className =
                getTransactionRowClass(
                    row.transactionType
                );
        }

        const reference =
            row.reference || "-";

        const complaintNumber =
            row.complaintNumber || "-";

        const complaintCell =
            recordType === "PURCHASE"
                ? "-"
                : complaintNumber;

        const ticketCell =
            reference;

        const processedBy =
            getProcessedBy(
                row,
                recordType
            );

        tr.innerHTML = `

            <td class="text-nowrap">
                ${formatDate(row.date)}
            </td>

            <td class="text-start text-nowrap">
                ${escapeHtml(complaintCell)}
            </td>

            <td class="fw-semibold text-primary text-nowrap">
                ${escapeHtml(ticketCell)}
            </td>

            <td class="fw-semibold text-primary text-nowrap">
                ${escapeHtml(
                    row.materialCode || "-"
                )}
            </td>

            <td class="text-start">
                <div class="fw-semibold">
                    ${escapeHtml(
                        row.material || "-"
                    )}
                </div>
            </td>

            <td class="text-start">
                ${escapeHtml(
                    row.category || "-"
                )}
            </td>

            <td>
                ${escapeHtml(
                    row.department || "-"
                )}
            </td>

            <td>
                <small>
                    ${escapeHtml(
                        row.area || "-"
                    )}
                </small>
            </td>

            <td class="fw-bold text-end text-nowrap">
                ${escapeHtml(
                    String(
                        row.quantity ?? 0
                    )
                )}

                <small class="text-muted">
                    ${escapeHtml(
                        row.unit || ""
                    )}
                </small>
            </td>

            <td class="text-end text-nowrap">
                ${formatCurrency(
                    row.value || 0
                )}
            </td>

            <td class="text-start">
                <small>
                    ${processedBy}
                </small>
            </td>
        `;

        tableBody.appendChild(tr);
    });

    updateReportTotals(
        totalQty,
        totalValue
    );

    if (tableFooter) {
        tableFooter.style.display =
            "table-footer-group";
    }
}


// ============================================================
// TOTALS
// ============================================================

function updateReportTotals(
    totalQty,
    totalValue
) {

    const totalQuantity =
        document.getElementById(
            "totalQuantity"
        );

    const totalValueElement =
        document.getElementById(
            "totalValue"
        );

    if (totalQuantity) {
        totalQuantity.innerText =
            totalQty;
    }

    if (totalValueElement) {
        totalValueElement.innerText =
            formatCurrency(
                totalValue
            );
    }
}


// ============================================================
// ROW STYLE
// ============================================================

function getTransactionRowClass(
    transactionType
) {

    switch (transactionType) {

        case "REQUEST":
            return "table-primary";

        case "APPROVAL":
            return "table-warning";

        case "ISSUE":
            return "table-success";

        case "RETURN":
            return "table-info";

        case "PURCHASE":
            return "table-secondary";

        default:
            return "";
    }
}


// ============================================================
// EXCEL EXPORT
// ============================================================

function exportToExcel() {
    if (!canExportReportExcel(getCurrentUser())) {
        showAlert('Excel export is available to Admin and Storekeeper users.', 'warning');
        return;
    }

    if (
        !lastReportData ||
        !lastReportData.length
    ) {

        showAlert(
            "No data available to export. Please generate a report first.",
            "warning"
        );

        return;
    }

    if (
        typeof XLSX === "undefined"
    ) {

        showAlert(
            "Excel library is not loaded.",
            "danger"
        );

        return;
    }

    try {

        const department =
            document.getElementById(
                "filterDepartment"
            )?.selectedOptions[0]
                ?.text ||
            "All Departments";

        const rows =
            lastReportData.map(row => ({

                "Date":
                    formatDate(
                        row.date
                    ),

                "Complaint Number":
                    row.complaintNumber ||
                    "-",

                "Ticket / Invoice":
                    row.reference ||
                    "-",

                "Item Code":
                    row.materialCode ||
                    "-",

                "Material Name":
                    row.material ||
                    "-",

                "Category":
                    row.category ||
                    "-",

                "Department":
                    row.department ||
                    "-",

                "Area Type":
                    row.area ||
                    "-",

                "Qty / Unit":
                    `${Number(row.quantity || 0)} ${row.unit || ""}`.trim(),

                "Value":
                    Number(
                        row.value || 0
                    ),

                "Processed By":
                    getExcelProcessedBy(row)
            }));

        const worksheet =
            XLSX.utils.json_to_sheet(
                rows
            );

        worksheet["!cols"] = [

            { wch: 14 },
            { wch: 20 },
            { wch: 18 },
            { wch: 15 },
            { wch: 30 },
            { wch: 22 },
            { wch: 20 },
            { wch: 24 },
            { wch: 18 },
            { wch: 28 },
            { wch: 28 }
        ];

        worksheet["!autofilter"] = {
            ref:
                `A1:K${rows.length + 1}`
        };

        const workbook =
            XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(
            workbook,
            worksheet,
            "Report"
        );

        const dateStr =
            new Date()
                .toISOString()
                .split("T")[0];

        const fileName =
            `RVRG_${lastReportType}_Report_${dateStr}.xlsx`;

        XLSX.writeFile(
            workbook,
            fileName
        );

        const user =
            getCurrentUser();

        saveReportDownloadHistory(
            user?.name ||
            "Unknown User",
            department
        );

        showAlert(
            "Excel report downloaded successfully.",
            "success"
        );

    }
    catch (error) {

        console.error(
            "Excel Export Error:",
            error
        );

        showAlert(
            "Failed to export Excel report.",
            "danger"
        );
    }
}


function getExcelProcessedBy(row) {

    if (
        lastReportType ===
        "REQUESTS"
    ) {
        return row.requestedBy || "-";
    }

    if (
        lastReportType ===
        "APPROVALS"
    ) {
        return (
            `Requested: ${
                row.requestedBy || "-"
            } | Approved: ${
                row.approvedBy || "-"
            }`
        );
    }

    if (
        lastReportType ===
        "CONSUMPTION"
    ) {
        return row.issuedBy || "-";
    }

    if (
        lastReportType ===
        "RETURNS"
    ) {
        return row.issuedBy || "-";
    }

    if (
        lastReportType ===
        "PURCHASE"
    ) {
        return row.requestedBy || "-";
    }

    if (
        lastReportType ===
        "ALL"
    ) {

        if (
            row.transactionType ===
            "REQUEST"
        ) {
            return row.requestedBy || "-";
        }

        if (
            row.transactionType ===
            "APPROVAL"
        ) {
            return (
                `Requested: ${
                    row.requestedBy || "-"
                } | Approved: ${
                    row.approvedBy || "-"
                }`
            );
        }

        if (
            row.transactionType ===
            "ISSUE"
        ) {
            return row.issuedBy || "-";
        }

        if (
            row.transactionType ===
            "RETURN"
        ) {
            return row.issuedBy || "-";
        }

        if (
            row.transactionType ===
            "PURCHASE"
        ) {
            return row.requestedBy || "-";
        }
    }

    return "-";
}

// ============================================================
// PDF EXPORT
// ============================================================

function exportToPDF() {

    if (
        !lastReportData ||
        !lastReportData.length
    ) {

        showAlert(
            "No data available to export. Please generate a report first.",
            "warning"
        );

        return;
    }

    if (
        !window.jspdf ||
        !window.jspdf.jsPDF
    ) {

        showAlert(
            "PDF library is not loaded.",
            "danger"
        );

        return;
    }

    if (
        typeof window.jspdf.jsPDF !==
        "function"
    ) {

        showAlert(
            "PDF library is not available.",
            "danger"
        );

        return;
    }

    try {

        const {
            jsPDF
        } = window.jspdf;

        const doc =
            new jsPDF({
                orientation:
                    "landscape",
                unit:
                    "mm",
                format:
                    "a4"
            });

        const fromDate =
            document.getElementById(
                "filterFromDate"
            )?.value || "";

        const toDate =
            document.getElementById(
                "filterToDate"
            )?.value || "";

        const department =
            document.getElementById(
                "filterDepartment"
            )?.selectedOptions[0]
                ?.text ||
            "All Departments";

        const recordType =
            document.getElementById(
                "filterRecordType"
            )?.selectedOptions[0]
                ?.text ||
            lastReportType;

        const areaType =
            document.getElementById(
                "filterAreaType"
            )?.selectedOptions[0]
                ?.text ||
            "All Areas";

        doc.setFontSize(16);

        doc.setFont(
            "helvetica",
            "bold"
        );

        doc.text(
            "RVRG STORE MANAGEMENT",
            14,
            14
        );

        doc.setFontSize(12);

        doc.setFont(
            "helvetica",
            "normal"
        );

        doc.text(
            "System Report",
            14,
            21
        );

        doc.setFontSize(8);

        doc.text(
            `Period: ${fromDate} to ${toDate}`,
            14,
            28
        );

        doc.text(
            `Department: ${department}`,
            95,
            28
        );

        doc.text(
            `Record Type: ${recordType}`,
            190,
            28
        );

        doc.text(
            `Area: ${areaType}`,
            14,
            34
        );

        doc.text(
            `Generated: ${
                new Date().toLocaleString(
                    "en-IN"
                )
            }`,
            95,
            34
        );

        const body =
            lastReportData.map(row => [

                formatDate(
                    row.date
                ),

                row.complaintNumber ||
                "-",

                row.reference ||
                "-",

                row.materialCode ||
                "-",

                row.material ||
                "-",

                row.category ||
                "-",

                row.department ||
                "-",

                row.area ||
                "-",

                `${
                    row.quantity ?? 0
                } ${
                    row.unit || ""
                }`,

                `Rs. ${
                    Number(
                        row.value || 0
                    ).toFixed(2)
                }`,

                getExcelProcessedBy(
                    row
                )
            ]);

        if (
            typeof doc.autoTable !==
            "function"
        ) {

            throw new Error(
                "PDF AutoTable plugin is not loaded."
            );
        }

        doc.autoTable({

            startY: 40,

            head: [[

                "Date",
                "Complaint No.",
                "Ticket / Invoice",
                "Item Code",
                "Material Name",
                "Category",
                "Department",
                "Area Type",
                "Qty / Unit",
                "Value",
                "Processed By"

            ]],

            body: body,

            theme: "grid",

            styles: {

                fontSize: 6.5,

                cellPadding: 2,

                valign:
                    "middle"
            },

            headStyles: {

                fontStyle:
                    "bold",

                fontSize: 7
            },

            columnStyles: {

                0: {
                    cellWidth: 19
                },

                1: {
                    cellWidth: 23
                },

                2: {
                    cellWidth: 23
                },

                3: {
                    cellWidth: 20
                },

                4: {
                    cellWidth: 33
                },

                5: {
                    cellWidth: 24
                },

                6: {
                    cellWidth: 23
                },

                7: {
                    cellWidth: 27
                },

                8: {
                    cellWidth: 19
                },

                9: {
                    cellWidth: 20
                },

                10: {
                    cellWidth: 32
                }
            },

            didDrawPage:
                data => {

                    doc.setFontSize(7);

                    doc.text(
                        `Page ${data.pageNumber}`,
                        280,
                        200
                    );
                }
        });

        const finalY =
            doc.lastAutoTable.finalY +
            6;

        const totalValue =
            lastReportData.reduce(
                (
                    total,
                    row
                ) =>
                    total +
                    Number(
                        row.value || 0
                    ),
                0
            );

        doc.setFontSize(9);

        doc.setFont(
            "helvetica",
            "bold"
        );

        doc.text(
            `Total Records: ${
                lastReportData.length
            }`,
            14,
            finalY
        );

        doc.text(
            `Total Value: Rs. ${
                totalValue.toFixed(2)
            }`,
            70,
            finalY
        );

        const dateStr =
            new Date()
                .toISOString()
                .split("T")[0];

        doc.save(
            `RVRG_${lastReportType}_Report_${dateStr}.pdf`
        );

        showAlert(
            "PDF report downloaded successfully.",
            "success"
        );

    }
    catch (error) {

        console.error(
            "PDF Export Error:",
            error
        );

        showAlert(
            error?.message ||
            "Failed to generate PDF report.",
            "danger"
        );
    }
}

// ============================================================
// REPORT DOWNLOAD HISTORY
// ============================================================

async function saveReportDownloadHistory(
    downloadedBy,
    department
) {

    try {

        const {
            error
        } = await supabase
            .from(
                "report_download_history"
            )
            .insert([

                {
                    downloaded_by:
                        downloadedBy,

                    department:
                        department
                }

            ]);

        if (error) {

            console.error(
                "Failed to save report download history:",
                error.message
            );
        }

    }
    catch (error) {

        console.error(
            "Report history error:",
            error
        );
    }
}


async function loadReportDownloadHistory() {

    const tableBody =
        document.getElementById(
            "reportHistoryTable"
        );

    if (!tableBody) {
        return;
    }

    tableBody.innerHTML = `
        <tr>
            <td
                colspan="3"
                class="text-center text-muted py-4"
            >
                Loading history...
            </td>
        </tr>
    `;

    try {

        const {
            data,
            error
        } = await withReportTimeout(

            supabase
                .from(
                    "report_download_history"
                )
                .select(`
                    downloaded_at,
                    downloaded_by,
                    department
                `)
                .order(
                    "downloaded_at",
                    {
                        ascending: false
                    }
                )
                .limit(50),

            "Report Download History"
        );

        if (error) {
            throw error;
        }

        if (
            !data ||
            !data.length
        ) {

            tableBody.innerHTML = `
                <tr>
                    <td
                        colspan="3"
                        class="text-center text-muted py-4"
                    >
                        No report downloads yet.
                    </td>
                </tr>
            `;

            return;
        }

        tableBody.innerHTML = "";

        data.forEach(record => {

            const row =
                document.createElement(
                    "tr"
                );

            const downloadDate =
                record.downloaded_at
                    ? new Date(
                        record.downloaded_at
                    ).toLocaleString(
                        "en-IN",
                        {
                            day:
                                "2-digit",
                            month:
                                "2-digit",
                            year:
                                "numeric",
                            hour:
                                "2-digit",
                            minute:
                                "2-digit"
                        }
                    )
                    : "-";

            row.innerHTML = `

                <td>
                    ${escapeHtml(
                        downloadDate
                    )}
                </td>

                <td class="fw-semibold">
                    ${escapeHtml(
                        record.downloaded_by ||
                        "-"
                    )}
                </td>

                <td>
                    ${escapeHtml(
                        record.department ||
                        "-"
                    )}
                </td>
            `;

            tableBody.appendChild(row);
        });

    }
    catch (error) {

        console.error(
            "Error loading report download history:",
            error
        );

        tableBody.innerHTML = `
            <tr>
                <td
                    colspan="3"
                    class="text-center text-danger py-4"
                >
                    Failed to load report history.
                    <br>
                    <small>
                        ${escapeHtml(
                            error?.message || ""
                        )}
                    </small>
                </td>
            </tr>
        `;
    }
}


// ============================================================
// HTML ESCAPE HELPER
// ============================================================

function escapeHtml(value) {

    return String(
        value ?? ""
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
}
