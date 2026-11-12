const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
function setup(role='STOREKEEPER'){
 const elements=new Map(),events=[],exports=[];
 const element=id=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',style:{},textContent:'',selectedOptions:[{text:'All'}],classList:{add(){},remove(){}},addEventListener(type,fn){events.push({id,type,fn})}});return elements.get(id)};
 for(const [id,val]of Object.entries({filterFromDate:'2026-11-01',filterToDate:'2026-11-09',filterDepartment:'ALL',filterRecordType:'REQUESTS',filterAreaType:'ALL'}))element(id).value=val;
 const context=vm.createContext({document:{addEventListener(type,fn){events.push({type,fn})},getElementById:element},window:{location:{replace(){}}},getCurrentUser:()=>({id:1,role,name:'Store'}),checkUserAccess:roles=>roles.includes(role),showAlert(){},console,setTimeout,
 formatDate:v=>v,XLSX:{utils:{json_to_sheet(rows){exports.push(rows);return{}},book_new:()=>({}),book_append_sheet(){}},writeFile(){}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'..','sales-pricing.js'),'utf8'),context);
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


test('suggestions match partial names/codes, combined terms and department',()=>{
 const a=setup();const catalog=[{material_code:'ELE-032',material_name:'Combined Box',department_name:'Electrical'},{material_code:'CIV-032',material_name:'Combined Box',department_name:'Civil'}];
 const data=JSON.stringify(catalog);
 assert.equal(a.run(`matchReportMaterials(${data},'comb','ALL').length`),2);
 assert.equal(a.run(`matchReportMaterials(${data},'ELE box','Electrical').length`),1);
 assert.equal(a.run(`matchReportMaterials(${data},'box','Civil')[0].material_code`),'CIV-032');
 assert.equal(a.run(`matchReportMaterials(${data},'','ALL').length`),0);
});
test('a selected suggestion matches its exact code, excluding similar codes and names',()=>{
 const a=setup();const rows=[...records,{materialCode:'ELE-0320',material:'Combined Box',quantity:1}];
 assert.equal(a.run(`filterReportByMaterial(${JSON.stringify(rows)},'ELE-032','ELE-032').length`),1);
});


test('universal search matches ticket, invoice and numeric complaint identifiers',()=>{
 const a=setup();const rows=[{reference:'MR-2026-0022',complaintNumber:191838,materialCode:'ELE-115',material:'Spike Lights'},{reference:'CASH-STE-2026-000042',complaintNumber:'-',materialCode:'CIV-084',material:'Hose Clamp'}];
 for(const [text,expected] of [['mr-2026-0022','ELE-115'],['191838','ELE-115'],['cash-ste-2026-000042','CIV-084'],['191838 spike','ELE-115']]){
  const found=a.run(`filterReportByMaterial(${JSON.stringify(rows)},${JSON.stringify(text)})`);
  assert.equal(found.length,1);assert.equal(found[0].materialCode,expected);
 }
 assert.equal(a.run(`filterReportByMaterial(${JSON.stringify(rows)},'notfound').length`),0);
});
test('ticket search keeps all items on that ticket and exports only those rows',async()=>{
 const a=setup();const rows=[{reference:'MR-2026-0022',complaintNumber:'191838',materialCode:'ELE-115',material:'Spike Lights',quantity:1,value:10},{reference:'MR-2026-0022',complaintNumber:'191838',materialCode:'ELE-134',material:'Meter',quantity:2,value:20},{reference:'MR-2026-0023',complaintNumber:'191842',materialCode:'ELE-115',material:'Spike Lights',quantity:3,value:30}];
 a.element('filterMaterialSearch').value='MR-2026-0022';
 a.run(`fetchRequestData=async()=>${JSON.stringify(rows)};renderReportTable=(rows,type)=>{lastReportData=rows;lastReportType=type};`);
 await a.run('generateReport({preventDefault(){}})');assert.equal(a.run('lastReportData.length'),2);assert.match(a.element('reportMaterialSummary').textContent,/Search: MR-2026-0022/);
 a.run('exportToExcel()');assert.equal(a.exports[0].length,2);assert.equal(a.run('lastReportData.reduce((sum,row)=>sum+row.value,0)'),30);
});

test('request quantity columns distinguish requested, approved and issued values',()=>{
 const a=setup();assert.equal(a.run("reportQuantityHeaders('REQUESTS').join('|')"),'Requested Qty|Approved Qty|Issued Qty');
 assert.equal(a.run("reportQuantityCells({quantity:10,approvedQuantity:6,issuedQuantity:4,unit:'NOS'},'REQUESTS').join('|')"),'10 NOS|6 NOS|4 NOS');
 assert.equal(a.run("reportQuantityCells({quantity:10,approvedQuantity:null,issuedQuantity:0,unit:'NOS'},'REQUESTS').join('|')"),'10 NOS|-|0 NOS');
 assert.equal(a.run("reportQuantityHeaders('CONSUMPTION').join('|')"),'Net Qty / Unit');
});
test('Excel request exports include all three quantity columns',()=>{
 const a=setup();a.run("lastReportType='REQUESTS';lastReportData=[{materialCode:'ELE-001',quantity:10,approvedQuantity:6,issuedQuantity:4,unit:'NOS'}];exportToExcel()");
 assert.equal(a.exports[0][0]['Requested Qty'],'10 NOS');assert.equal(a.exports[0][0]['Approved Qty'],'6 NOS');assert.equal(a.exports[0][0]['Issued Qty'],'4 NOS');
});

test('report material details include identifying fields, stock, cost and storage information',()=>{
 const a=setup();const text=a.run("reportMaterialDetails({current_stock:7,category:'Lighting',brand:'Acme',item_type:'LED',item_size:'20mm',specification:'10W',unit:'NOS',unit_cost:100,gst_type:'INCLUDED',gst_percentage:18,rack_location:'A1',minimum_stock:2,status:'ACTIVE',manufacturer_part_no:'ABC'})");
 for(const field of ['Stock: 7','Category: Lighting','Brand: Acme','Type: LED','Size: 20mm','Spec: 10W','Unit: NOS','Sales / unit (incl. GST): ₹100.00','Sales GST: INCLUDED','Rack: A1','Minimum stock: 2','Status: ACTIVE','Part no.: ABC'])assert.ok(text.includes(field),field);
});
