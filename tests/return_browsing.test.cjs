const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
test('return success refreshes current paginated views without removed ticket input',async()=>{
 const writes=[],alerts=[],refreshes=[];
 const nodes={'returnInput-42':{value:'1'},'returnRemarks-42':{value:'Test'},'issued-42':{innerText:'2'}};
 const context=vm.createContext({document:{addEventListener(){},getElementById:id=>nodes[id]},window:{},getCurrentUser:()=>({id:6}),confirm:()=>true,showAlert:(...args)=>alerts.push(args),console,supabase:{from(table){return {insert(rows){writes.push({table,rows});return table==='material_returns'?{select:async()=>({data:[{id:5}]})}:Promise.resolve({});}};}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../return.js'),'utf8'),context);context.refreshes=refreshes;
 vm.runInContext("loadRecentIssues=async()=>refreshes.push('issues');loadReturnHistory=async()=>refreshes.push('returns');",context);
 await vm.runInContext('window.processReturn(42,1)',context);
 assert.deepEqual(writes.map(w=>w.table),['material_returns','stock_ledger']);assert.deepEqual(refreshes,['issues','returns']);assert.equal(alerts.length,1);assert.equal(alerts[0][1],'success');
});
