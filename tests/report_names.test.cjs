const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'reports.js'), 'utf8');

function setup(rows, users, failure = false) {
    const queries = [];
    const context = vm.createContext({
        document: { addEventListener() {} },
        getCurrentUser: () => ({ id: 6, name: 'Bibhu Datta', role: 'ADMIN' }),
        window: { location: { replace() {} } },
        setTimeout, console: { log() {}, error() {} },
        supabase: { from(table) {
            const query = { table };
            queries.push(query);
            const chain = {
                select(columns) { query.columns = columns; return chain; },
                in(field, ids) { query.ids = ids; return chain; },
                gte() { return chain; }, lte() { return chain; }, order() { return chain; },
                then(resolve, reject) {
                    const data = table === 'material_requests' ? rows : table === 'users_master'
                        ? users.filter(user => query.ids.includes(String(user.id)))
                        : table === 'materials' ? [{id:10, material_code:'ELE-032', material_name:'Combined box', department_id:2, unit:'NOS'}]
                        : [{ id: 2, department_name: 'Electrical' }];
                    return Promise.resolve({ data, error: failure && table === 'users_master' ? new Error('User lookup denied') : null }).then(resolve, reject);
                }
            };
            return chain;
        } }
    });
    vm.runInContext(source, context);
    vm.runInContext('withReportTimeout = async promise => promise;', context);
    return { run: code => vm.runInContext(code, context), queries };
}
const request = { material_id:10, requested_by:1, approved_by:'3', requested_qty:2, approved_qty:1,
    location_type:'Common Area', approval_date:'2026-11-04', created_at:'2026-11-04', request_status:'APPROVED' };
const users = [{id:1, full_name:'Store'}, {id:3, full_name:'Upender'}, {id:6, full_name:'Bibhu Datta'}];

test('approval report resolves recorded requester and approver, not the logged-in viewer', async () => {
    const app = setup([request], users);
    const rows = await app.run('fetchApprovalData("2026-11-01", "2026-11-05", "ALL", "ALL")');
    assert.equal(rows[0].requestedBy, 'Store');
    assert.equal(rows[0].approvedBy, 'Upender');
    assert.equal(rows[0].quantity, 1);
    assert.equal(rows[0].department, 'Electrical');
    const query = app.queries.find(q => q.table === 'users_master');
    assert.equal(query.columns, 'id, full_name, username');
    assert.deepEqual(Array.from(query.ids), ['1', '3']);
});

test('request report and filtered results use the same user names', async () => {
    const app = setup([request], users);
    const rows = await app.run('fetchRequestData("2026-11-01", "2026-11-05", "Electrical", "Common Area")');
    assert.equal(rows[0].requestedBy, 'Store');
    assert.equal(rows[0].approvedBy, 'Upender');
    assert.equal(rows[0].quantity, 2);
    const empty = await app.run('fetchRequestData("2026-11-01", "2026-11-05", "Civil", "ALL")');
    assert.equal(empty.length, 0);
});

test('screen, Excel and PDF shared export formatter all include actual names', async () => {
    const app = setup([request], users);
    await app.run('(async () => { lastReportData = await fetchApprovalData("a", "b", "ALL", "ALL"); lastReportType = "APPROVALS"; })()');
    const screen = app.run('getProcessedBy(lastReportData[0], "APPROVALS")');
    assert.match(screen, /Store/); assert.match(screen, /Upender/);
    assert.equal(app.run('getExcelProcessedBy(lastReportData[0])'), 'Requested: Store | Approved: Upender');
    app.run('lastReportType = "ALL"; lastReportData[0].transactionType = "APPROVAL"');
    assert.equal(app.run('getExcelProcessedBy(lastReportData[0])'), 'Requested: Store | Approved: Upender');
});

test('missing users and names are labelled honestly; blank approver remains a dash', async () => {
    const app = setup([{...request, requested_by:99, approved_by:null}], []);
    const rows = await app.run('fetchApprovalData("a", "b", "ALL", "ALL")');
    assert.equal(rows[0].requestedBy, 'Unknown user (ID: 99)');
    assert.equal(rows[0].approvedBy, '-');
    const fallback = setup([request], [{ id:1, full_name:'  ', username:'Store login' }, { id:3, full_name:'Upender', is_active:false }]);
    const named = await fallback.run('fetchApprovalData("a", "b", "ALL", "ALL")');
    assert.equal(named[0].requestedBy, 'Store login');
    assert.equal(named[0].approvedBy, 'Upender');
});

test('names are escaped on screen but exported as plain text', () => {
    const app = setup([], []);
    const output = app.run('getProcessedBy({requestedBy:"<img src=x onerror=alert(1)>", approvedBy:"A & B"}, "APPROVALS")');
    assert.doesNotMatch(output, /<img/);
    assert.match(output, /A &amp; B/);
    assert.equal(app.run('getProcessedBy({requestedBy:"A & B"}, "REQUESTS")'), 'A &amp; B');
});

test('empty reports skip user queries and denied lookups fail visibly', async () => {
    const empty = setup([], []);
    await empty.run('fetchApprovalData("a", "b", "ALL", "ALL")');
    assert.equal(empty.queries.some(q => q.table === 'users_master'), false);
    const denied = setup([request], users, true);
    await assert.rejects(denied.run('fetchApprovalData("a", "b", "ALL", "ALL")'), /User lookup denied/);
});

test('large reports load names in bounded batches', async () => {
    const rows = Array.from({length:205}, (_, i) => ({requested_by:i+1}));
    const app = setup(rows, rows.map(row => ({ id:row.requested_by, full_name:`Person ${row.requested_by}` })));
    const resolve = await app.run('loadReportUserNames(' + JSON.stringify(rows) + ')');
    assert.equal(resolve(205), 'Person 205');
    assert.equal(app.queries.length, 3);
    assert.ok(app.queries.every(q => q.ids.length <= 100));
});
