const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
function setup(role='STOREKEEPER'){
 const elements=new Map(),events=[],exports=[];
 const element=id=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',style:{},textContent:'',selectedOptions:[{text:'All'}],classList:{add(){},remove(){}},addEventListener(type,fn){events.push({id,type,fn})}});return elements.get(id)};
 for(const [id,val]of Object.entries({filterFromDate:'2026-11-01',filterToDate:'2026-11-09',filterDepartment:'ALL',filterRecordType:'REQUESTS',filterAreaType:'ALL'}))element(id).value=val;
 const context=vm.createContext({document:{addEventListener(type,fn){events.push({type,fn})},getElementById:element},window:{location:{replace(){}}},getCurrentUser:()=>({id:1,role,name:'Store'}),checkUserAccess:roles=>roles.includes(role),showAlert(){},console,setTimeout,
 formatDate:v=>v,XLSX:{utils:{json_to_sheet(rows){exports.push(rows);return{}},book_new:()=>({}),book_append_sheet(){}},writeFile(){}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'..','reports.js'),'utf8'),context);
 vm.runInContext('saveReportDownloadHistory=()=>{};',context);
 return{run:s=>vm.runInContext(s,context),element,events,exports};
}
const records=[{materialCode:'ELE-032',material:'Combined Box',quantity:2,value:40},{materialCode:'ELE-121',material:'Insulation Tape',quantity:3,value:60}];
test('search matches code, name and combined case-insensitive terms',()=>{const a=setup();for(const query of ['ele-032','COMBINED box','  ele-032   box '])assert.equal(a.run(`filterReportByMaterial(${JSON.stringify(records)},${JSON.stringify(query)}).length`),1);assert.equal(a.run(`filterReportByMaterial(${JSON.stringify(records)},'missing').length`),0);assert.equal(a.run(`filterReportByMaterial(${JSON.stringify(records)},' ').length`),2)});
test('all six report types filter before rendering and Excel receives only matching rows',async()=>{
 for(const type of ['REQUESTS','APPROVALS','CONSUMPTION','RETURNS','PURCHASE','ALL']){
  const a=setup();a.element('filterMaterialSearch').value='ele-032';a.element('filterRecordType').value=type;
  a.run(`for(const name of ['fetchRequestData','fetchApprovalData','fetchConsumptionData','fetchReturnData','fetchPurchaseData','fetchAllTransactions'])globalThis[name]=async()=>${JSON.stringify(records)};renderReportTable=(rows,type)=>{lastReportData=rows;lastReportType=type};`);
  await a.run('generateReport({preventDefault(){}})');assert.equal(a.run('lastReportData.length'),1,type);a.run('exportToExcel()');assert.equal(a.exports[0].length,1);assert.equal(a.exports[0][0]['Item Code'],'ELE-032');assert.match(a.element('reportMaterialSummary').textContent,/1 record/);
 }
});
test('Storekeeper id 1 gets a visible, wired Excel button; AFM stays restricted',()=>{
 const a=setup();a.events.find(e=>!e.id).fn();assert.ok(a.events.some(e=>e.id==='btnExportReport'&&e.type==='click'));assert.equal(a.run("canExportReportExcel({id:1,role:'STOREKEEPER'})"),true);assert.equal(a.run("canExportReportExcel({role:'ADMIN'})"),true);assert.equal(a.run("canExportReportExcel({role:'AFM'})"),false);
});
test('failed regeneration clears the old export dataset',async()=>{const a=setup();a.run("lastReportData=[{material:'Old'}];fetchRequestData=async()=>{throw new Error('Test failure')}");await a.run('generateReport({preventDefault(){}})');assert.equal(a.run('lastReportData.length'),0)});
