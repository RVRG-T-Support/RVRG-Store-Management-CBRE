const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
test('new issue snapshots gross sales rate rather than purchase cost', async () => {
    const writes = [], alerts = [];
    const client = { from(table) {
        const query = {
            select(columns) { query.columns = columns; return query; },
            eq() { return query; },
            async single() {
                return { data: table === 'current_stock' ? { current_stock:10 } :
                    query.columns.includes('requested_qty') ? { requested_qty:2, issued_qty:0, ticket_no:'MR-TEST' } :
                    { ticket_no:'MR-TEST', materials:{unit_cost:100} } };
            },
            in: async () => ({ data:[{material_id:1,sales_price:120,gst_type:'EXCLUDED',gst_percentage:18}] }),
            insert(rows) {
                writes.push({ table, rows });
                return table === 'material_issue_register' ? { select:async () => ({data:[{id:42}]}) } : Promise.resolve({});
            },
            update(values) { writes.push({table,values});return {eq:async () => ({})}; }
        };
        return query;
    } };
    const context = vm.createContext({
        document:{addEventListener(){},getElementById:() => ({value:'2'})},
        window:{supabaseClient:client},getCurrentUser:() => ({id:6,name:'Admin'}),
        confirm:() => true,showAlert:(message,type) => alerts.push({message,type}),console
    });
    for (const file of ['sales-pricing.js','issue.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
    vm.runInContext('loadApprovedRequests=async()=>{};loadIssuedHistory=async()=>{};',context);
    await vm.runInContext('window.processIssue(7,1)',context);
    const issue = writes.find(row=>row.table==='material_issue_register').rows[0];
    assert.equal(issue.unit_cost,141.6);
    assert.equal(issue.total_cost,283.2);
    assert.ok(alerts.some(a=>a.type==='success'));
});
