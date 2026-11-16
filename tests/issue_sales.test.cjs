const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID}=require('node:crypto');
function setup(request,qty='1',rpcHandler){
 const calls=[],alerts=[];let reads=0;
 const client={from(table){return {select(){return this;},eq(){return this;},async single(){reads++;return {data:table==='current_stock'?{current_stock:20}:request};}};},async rpc(name,args){calls.push({name,args});return rpcHandler?rpcHandler(calls.length):{};}};
 const context=vm.createContext({crypto:{randomUUID},document:{addEventListener(){},getElementById:id=>({value:qty,disabled:false})},window:{supabaseClient:client},getCurrentUser:()=>({id:6,name:'Admin'}),confirm:()=>true,showAlert:(message,type)=>alerts.push({message,type}),console});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../issue.js'),'utf8'),context);
 vm.runInContext('loadApprovedRequests=async()=>{};loadIssuedHistory=async()=>{};',context);
 return {context,calls,alerts,get reads(){return reads;},run:()=>vm.runInContext('window.processIssue(7,1)',context)};
}
const base={requested_qty:5,approved_qty:2,issued_qty:1,material_id:1,request_status:'PARTIALLY_ISSUED',ticket_no:'MR-TEST',materials:{unit:'Nos'}};
test('browser rejects over-approval even with ample stock',async()=>{
 const s=setup(base,'11');await s.run();assert.equal(s.calls.length,0);assert.match(s.alerts[0].message,/Remaining to issue: 1/);
});
test('issue goes through checked atomic RPC and double tap is ignored',async()=>{
 const s=setup(base);await Promise.all([s.run(),s.run()]);assert.equal(s.calls.length,1);assert.equal(s.calls[0].name,'issue_material_checked');assert.equal(s.calls[0].args.p_quantity,1);assert.equal(s.calls[0].args.p_actor,6);assert.ok(s.alerts.some(a=>a.type==='success'));
});
test('lost-response retry reuses UUID before stale preflight',async()=>{
 const s=setup(base,'1',n=>n===1?{error:{message:'Network response lost'}}:{});await s.run();const reads=s.reads;await s.run();assert.equal(s.calls.length,2);assert.equal(s.calls[0].args.p_client_id,s.calls[1].args.p_client_id);assert.equal(s.reads,reads);
});
test('missing migration fails closed without raw writes',async()=>{
 const s=setup(base,'1',()=>({error:{code:'PGRST202',message:'function missing'}}));await s.run();assert.match(s.alerts[0].message,/database update is required/);
});

test('manual fractions pass only for litre aliases and never for count, KG or metre items',async()=>{
 for(const unit of ['L','LTR','Ltr.',' ltrs ','Liter','Litres']){
  const s=setup({...base,materials:{unit}},'0.5');await s.run();assert.equal(s.calls.length,1,unit);assert.equal(s.calls[0].args.p_quantity,0.5);
 }
 for(const unit of ['Nos','KG','Mtr','Roll','unknown']){
  const s=setup({...base,materials:{unit}},'0.5');await s.run();assert.equal(s.calls.length,0,unit);assert.match(s.alerts[0].message,/Whole units only/);
 }
});
test('MR-2026-0421 partial issue clearly explains that only one remains',async()=>{
 const s=setup({...base,ticket_no:'MR-2026-0421',requested_qty:2,approved_qty:2,issued_qty:1},'2');await s.run();assert.equal(s.calls.length,0);assert.match(s.alerts[0].message,/Approved: 2. Already issued: 1. Remaining to issue: 1/);
});
