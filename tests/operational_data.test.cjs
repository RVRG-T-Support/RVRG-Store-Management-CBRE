const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const window={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','operational-data.js'),'utf8'),{window});const ops=window.RvrgOps;
function client(tables,fail=false){const calls=[];return{calls,from(table){let ids=[],date='9999';const q={select(){return q},in(field,values){ids=values.map(String);return q},lte(field,value){date=value;return q},order(){return q},range:async(start,end)=>{calls.push({table,start,ids});return{data:(tables[table]||[]).filter(r=>ids.includes(String(table==='current_stock'?r.material_id:r.issue_id))&&(!r.return_date||r.return_date<=date)).slice(start,end+1),error:fail?new Error('Unavailable'):null}}};return q}}}
test('returns reduce net quantity at the original issue cost, including partial returns',async()=>{
 const db=client({material_returns:[{id:1,issue_id:11,returned_qty:2,return_date:'2026-11-05'},{id:2,issue_id:11,returned_qty:1,return_date:'2026-11-06'},{id:3,issue_id:12,returned_qty:9,return_date:'2026-11-05'}]});
 const returns=await ops.returnedByIssue(db,[11],'2026-11-10');assert.equal(ops.netIssued({id:11,issued_qty:10},returns),7);assert.equal(ops.netIssued({id:11,issued_qty:10},returns)*125,875);assert.equal(ops.netIssued({id:99,issued_qty:4},returns),4);
});
test('historical net consumption excludes returns after the selected end date',async()=>{
 const db=client({material_returns:[{id:1,issue_id:11,returned_qty:2,return_date:'2026-11-05'},{id:2,issue_id:11,returned_qty:3,return_date:'2026-11-11'}]});
 const returns=await ops.returnedByIssue(db,[11],'2026-11-10');assert.equal(ops.netIssued({id:11,issued_qty:10},returns),8);
});
test('return lookup paginates beyond 1000 records without losing adjustments',async()=>{
 const db=client({material_returns:Array.from({length:1001},(_,i)=>({id:i,issue_id:11,returned_qty:0.1}))});const returns=await ops.returnedByIssue(db,[11],'2026-11-10');assert.ok(Math.abs(returns.get('11')-100.1)<0.00001);assert.equal(db.calls.length,2);
});
test('stock lookup is batched and retains actual zero and positive balances',async()=>{
 const ids=Array.from({length:101},(_,i)=>i+1);const db=client({current_stock:ids.map(id=>({material_id:id,current_stock:id===1?0:5}))});const stocks=await ops.stockBalances(db,ids);assert.equal(stocks.get('1'),0);assert.equal(stocks.get('101'),5);assert.equal(db.calls.length,2);
});
test('failed read lookups fail visibly rather than inventing stock or consumption',async()=>{
 const db=client({},true);await assert.rejects(ops.stockBalances(db,[1]),/Unavailable/);await assert.rejects(ops.returnedByIssue(db,[1],'2026-11-10'),/Unavailable/);
});

test('dashboard starts independent sections concurrently instead of waiting for each section',async()=>{
 const context=vm.createContext({getCurrentUser:()=>({id:6}),document:{addEventListener(){}},window:{},console});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'..','dashboard.js'),'utf8'),context);
 vm.runInContext("var started=[],finish=[];for(const name of ['loadMetrics','loadRecentRequests','loadDepartmentConsumption','loadLowStockAlerts'])globalThis[name]=()=>{started.push(name);return new Promise(resolve=>finish.push(resolve))};",context);
 const running=vm.runInContext('loadDashboardData()',context);assert.equal(vm.runInContext('started.length',context),4);vm.runInContext('finish.forEach(resolve=>resolve())',context);await running;
});
