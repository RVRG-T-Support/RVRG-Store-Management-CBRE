const {chromium}=require('playwright');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
process.chdir(path.join(__dirname,'../..'));
(async()=>{
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 for(const [name,tables] of [
  ['material_request',[['recentRequestsTable','loadRecentRequests',true]]],
  ['approvals',[['pendingApprovalsTable','loadPendingApprovals',true],['approvedHistoryTable','loadApprovedHistory',true]]],
  ['issue',[['approvedRequestsTable','loadApprovedRequests',true],['issuedHistoryTable','loadIssuedHistory',true]]],
  ['return',[['returnTableBody','loadRecentIssues',false],['returnHistoryTable','loadReturnHistory',false]]]
 ]){
 const page=await browser.newPage({viewport:{width:1366,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.error(name,m.text());});
 await page.route('**/*',route=>route.abort());
 let html=fs.readFileSync(name+'.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,tag=>{
 const href=tag.match(/href="([^"]+)"/)?.[1]?.split('?')[0];return href?.includes('bootstrap')?'<style>'+(process.env.BOOTSTRAP_CSS ? fs.readFileSync(process.env.BOOTSTRAP_CSS,'utf8') : '')+'</style>':href&&fs.existsSync(href)?'<style>'+fs.readFileSync(href,'utf8')+'</style>':'';});
 await page.setContent(html);
 await page.evaluate(()=>{
 window.getCurrentUser=()=>({id:6,name:'Admin'});window.checkUserAccess=()=>true;
 window.formatDate=d=>new Date(d).toLocaleDateString('en-IN');window.getStatusBadge=s=>'<span>'+s+'</span>';window.formatCurrency=n=>'₹'+Number(n).toFixed(2);window.showAlert=(...a)=>(window.alerts||=[]).push(a);
 window.RvrgOps={stockBalances:async()=>new Map([[1,30]])};window.confirm=()=>true;
 const requests=Array.from({length:365*3},(_,n)=>({id:n+1,material_id:1,ticket_no:'MR-2026-'+String(Math.floor(n/3)+1).padStart(4,'0'),anacity_complaint_no:String(197000+Math.floor(n/3)),requested_qty:2,approved_qty:2,issued_qty:1,request_status:['APPROVED','PENDING','ISSUED','PARTIALLY_ISSUED'][Math.floor(n/3)%4],created_at:new Date(2026,10,Math.floor(n/3)+1).toISOString(),approval_date:new Date(2026,10,Math.floor(n/3)+1).toISOString(),location_name:'Test location',location_type:'Common Area / Free',technician_name:'Test Tech',materials:{id:1,material_code:'PLB-179',material_name:'SOLVENT',unit:'Nos',unit_cost:100,departments:{department_name:'Plumbing'}}}));
 const issued=requests.map(r=>({...r,request_status:'ISSUED'}));
 window.requestRows=requests;window.historyRows=issued;
 window.queryLog=[];
 window.supabase=window.supabaseClient={from(table){
 let select='',filters=[],orders=[],start=0,end=999,count=false;
 const q={select(s,opt){select=s;count=!!opt?.count;return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},in(k,values){filters.push(r=>values.includes(k.includes('.')?r.material_issue_register?.ticket_no:r[k]));return q;},or(s){const term=s.match(/ilike\."%([\s\S]*?)%"/)?.[1].toLowerCase().replace(/\\(.)/g,'$1')||'';filters.push(r=>[r.ticket_no,r.anacity_complaint_no].some(v=>String(v||'').toLowerCase().includes(term)));return q;},order(k,opt={}){orders.push([k,opt.ascending!==false]);return q;},range(a,b){start=a;end=b;return q;},then(resolve,reject){
 let data;
 if(table==='material_requests')data=requests;
 else if(table==='material_issue_register')data=requests.map(r=>({...r,issued_date:r.created_at}));
 else if(table==='material_returns')data=requests.map(r=>({id:r.id,returned_qty:1,return_condition:'GOOD',return_date:r.created_at,material_issue_register:{...r,issued_qty:2}}));
 else if(table==='current_stock')data=[{material_id:1,current_stock:30}];
 else data=[];
 data=data.filter(r=>filters.every(f=>f(r)));
 data.sort((a,b)=>{for(const [key,asc]of orders){if(a[key]!==b[key])return(a[key]>b[key]?1:-1)*(asc?1:-1);}return 0;});
 const total=data.length;window.queryLog.push({table,start,end,count,select});
 return Promise.resolve({data:data.slice(start,end+1),count:count?total:null,error:null}).then(resolve,reject);
 }};return q;}};
 });
 // Pass page name explicitly into mock global.
 await page.evaluate(n=>window.name=n,name);
 for(const script of ['sales-pricing.js','record-browser.js','ticket-view.js',name+'.js'])await page.addScriptTag({content:fs.readFileSync(script,'utf8')});
 await page.evaluate(async tables=>{for(const[id,fn,group]of tables){RvrgRecords.mount(id,()=>window[fn](),group);await window[fn]();}},tables);
 for(const[id,fn,group]of tables){
 const count=async()=>page.locator('#'+id+' > tr').count();
 const initial=await count();assert.ok(initial>=10,`${name}/${id}: initial ${initial}; ${await page.locator('#'+id).innerText()}`);
 const target=id==='pendingApprovalsTable'?'MR-2026-0030':'MR-2026-0032';
 const complaint=id==='pendingApprovalsTable'?'197029':'197031';
 const field=page.locator('#'+id+'-search');const toolbar=page.locator('.record-browser').filter({has:field});
 const panel=page.locator('.record-pagination').nth(tables.findIndex(t=>t[0]===id));
 assert.match(await panel.innerText(),/1–10 of/);
 await page.locator('#'+id+'-size').selectOption('20');await page.waitForFunction(id=>document.querySelector('#'+id+' > tr')&&!document.getElementById(id).innerText.includes('Loading'),id);
 await page.waitForTimeout(50);assert.match(await panel.innerText(),/1–20 of/);
 await page.locator('#'+id+'-size').selectOption('50');await page.waitForTimeout(80);assert.equal(await count(),50,`${name}/${id} size50`);
 await field.fill("MR: "+target);await toolbar.getByRole('button',{name:'Search',exact:true}).click();await page.waitForTimeout(80);
 assert.match(await page.locator('#'+id).innerText(),new RegExp(target));
 assert.equal(await count(),group?1:3,`${name}/${id}: whole ticket/three material rows`);
 await field.fill(complaint);await field.press('Enter');await page.waitForTimeout(80);assert.match(await page.locator('#'+id).innerText(),new RegExp(target));
 await field.fill('NOT-FOUND');await field.press('Enter');await page.waitForTimeout(80);assert.match(await panel.innerText(),/0–0 of 0/);
 await toolbar.getByRole('button',{name:'Clear',exact:true}).click();await page.waitForTimeout(80);
 await page.locator('#'+id+'-size').selectOption('10');await page.waitForTimeout(80);
 await panel.getByRole('button',{name:'Next',exact:true}).click();await page.waitForTimeout(80);assert.match(await panel.innerText(),/11–20 of/);
 await panel.getByRole('button',{name:'Previous',exact:true}).click();await page.waitForTimeout(80);assert.match(await panel.innerText(),/1–10 of/);
 }
 if(name!=='return'){
  await page.evaluate(()=>{
   const template=window.requestRows[0];
   for(let i=0;i<6;i++)window.requestRows.push({...template,id:14000+i,ticket_no:'MR-2026-0478',anacity_complaint_no:'197129',technician_name:'SRIKANTH',location_name:'F block 10 series MBR Domestic GI main line damage',requested_qty:i+1,approved_qty:i===0?null:i+1,issued_qty:i===2?i+1:0,request_status:i===0?'PENDING':i===2?'ISSUED':'APPROVED',materials:{...template.materials,material_code:'PLB-'+(280+i),material_name:i===0?'NIPPLE WITH A LONG MATERIAL DESCRIPTION THAT MUST REMAIN FULLY VISIBLE':'ELBOW',brand:'Manufacturer',item_type:'GI',item_size:'65MM X 4 INCH',specification:'Threaded connection with extended specification'}});
   window.editMaterialRequest=ticket=>window.editedTicket=ticket;
   window.deleteMaterialRequest=ticket=>window.deletedTicket=ticket;
  });
  const historyId=name==='material_request'?'recentRequestsTable':name==='approvals'?'approvedHistoryTable':'issuedHistoryTable';
  const search=page.locator('#'+historyId+'-search');await search.fill('MR-2026-0478');await search.press('Enter');await page.waitForTimeout(100);
  const history=page.locator('#'+historyId+' .approval-ticket');assert.equal(await history.count(),1,'single heading per MR');
  assert.equal(await history.locator('[data-request-id]').count(),6,'all ticket lines, including mixed pending/processed states');
  assert.equal(await history.locator('.approval-ticket-number').count(),1);
  assert.ok((await history.innerText()).includes('NIPPLE WITH A LONG MATERIAL DESCRIPTION THAT MUST REMAIN FULLY VISIBLE'));
  if(name==='material_request'){
   const firstValues=await history.locator('[data-request-id]').first().locator('td').allTextContents();assert.equal(firstValues[2].trim(),'0','pending line is not displayed as approved');
   await page.evaluate(()=>{
    window.currentMaterials=[{...window.requestRows[0].materials,id:1,material_code:'ELE-198',material_name:'2 PIN PLUG',category:'Plug & Socket',unit:'NOS',unit_cost:0,gst_type:'INCLUDED',gst_percentage:18,current_stock:3}];
    window.requestItems=[{id:1,materialId:'1',quantity:1},{id:2,materialId:'',quantity:''}];
    renderRequestItems();
   });
   assert.equal(await page.locator('#requestItemsContainer > div').count(),2);
   const entry=page.locator('#requestItemsContainer > div').first();
   const entryBox=await entry.boundingBox(),containerBox=await page.locator('#requestItemsContainer').boundingBox();
   assert.ok(entryBox.width>=containerBox.width-2,'material card spans full container width');
   assert.ok((await page.locator('#requestItemsContainer > div').nth(1).boundingBox()).y>=entryBox.y+entryBox.height,'materials stack in full-width rows');
   assert.ok(entryBox.height<350,'selected material remains compact');
   for(const label of ['Category','Brand','Type','Size','Specification','Unit','Available Stock','Sales / unit (incl. GST)'])assert.ok((await entry.innerText()).includes(label),label);
   await entry.getByRole('button',{name:'Change material',exact:true}).click();
   assert.equal(await page.locator('#materialDetails-1').isVisible(),false);
   await page.locator('#materialSearch-1').fill('2 PIN');
   await page.locator('#materialSearchResults-1 button').first().click();
   assert.equal(await page.locator('#materialDetails-1').isVisible(),true);
   assert.equal(await page.evaluate(()=>document.activeElement.id),'requestQty-1');
   await page.locator('#requestQty-1').fill('2');
   assert.equal(await page.evaluate(()=>window.requestItems[0].quantity),'2');

   await history.getByRole('button',{name:'Edit request',exact:true}).click();await history.getByRole('button',{name:'Delete request',exact:true}).click();
   assert.equal(await page.evaluate(()=>window.editedTicket),'MR-2026-0478');assert.equal(await page.evaluate(()=>window.deletedTicket),'MR-2026-0478');
   const formBox=await page.locator('#materialRequestForm').boundingBox();const historyBox=await page.locator('#recentRequestsTable').boundingBox();
   assert.ok(formBox.y+formBox.height<historyBox.y,'form above history');assert.ok(formBox.width>1000,'full width form');
  }
  await page.setViewportSize({width:1000,height:1000});await page.waitForTimeout(80);
  const scrollView=history.locator('.approval-items-scroll');const slider=history.locator('.ticket-horizontal-controls input');
  assert.ok(Number(await slider.getAttribute('max'))>0,'ticket columns have an accessible horizontal slider when needed');
  await slider.evaluate(el=>{el.value=el.max;el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.ok(await scrollView.evaluate(el=>el.scrollLeft>0),'slider reveals columns on the right');
  await page.setViewportSize({width:1440,height:1000});await page.waitForTimeout(50);
  fs.mkdirSync('test-results',{recursive:true});await (name==='issue'?page.locator('#issuedHistoryTable').locator('xpath=ancestor::div[contains(@class,"card")][1]'):page.locator('.main-content')).screenshot({path:'test-results/'+name+'-ticket-history.png'});
  console.log('PASS '+name+': complete six-line mixed-status MR grouped once, full material descriptions'+(name==='material_request'?', full-width form above history and edit/delete targets':''));
 }
 assert.deepEqual(errors,[],name+' browser errors');
 if(name==='approvals'){
 await page.evaluate(()=>{
  const template=window.requestRows[0];
  for(let i=0;i<6;i++) window.requestRows.push({...template,id:12000+i,ticket_no:'MR-DESIGN-0470',anacity_complaint_no:'196986',request_status:'PENDING',requested_qty:i===2?1:6,technician_name:'SHAIKH',location_name:'O-BLOCK 2ND SERIES CBR SHAFT FLUSHING GI LINE DAMAGE',materials:{...template.materials,material_code:'PLB-'+(390+i),material_name:i===0?'NUT, BOLTS & WASHERS':i===1?'MS FLANGE':'PIPE FITTING',brand:i===3?'<img src=x onerror=alert(1)>':'Manufacturer',item_type:'Spare',item_size:i===1?'65MM':'16 MM',specification:i===4?'Long specification with corrosion resistance and application details that must wrap naturally without clipping any text.':'Standard fitting',unit:i===0?'Kg':'Nos'}});
  window.RvrgOps.stockBalances=async()=>new Map([['1',6]]);
  window.approveTicket=ticket=>window.lastApproveClick=ticket;
  rejectModalInstance={show(){window.rejectShown=true;}};
 });
 const search=page.locator('#pendingApprovalsTable-search');await search.fill('MR-DESIGN-0470');await search.press('Enter');await page.waitForTimeout(80);
 const card=page.locator('#pendingApprovalsTable .approval-ticket');assert.equal(await card.count(),1);
 assert.equal(await card.locator('.approval-item-table tbody > tr').count(),6);
 assert.equal(await card.locator('input[id^=approvedQty_]').count(),6);
 for(const word of ['196986','SHAIKH','FLUSHING GI LINE DAMAGE','65MM','Available stock','incl. GST','Specification:'])assert.ok((await card.innerText()).includes(word),word);
 assert.equal(await card.locator('img').count(),0);
 await card.locator('[data-approve]').click();assert.equal(await page.evaluate(()=>window.lastApproveClick),'MR-DESIGN-0470');
 await card.locator('[data-reject]').click();assert.equal(await page.locator('#rejectTicketNoDisplay').innerText(),'MR-DESIGN-0470');assert.equal(await page.evaluate(()=>window.rejectShown),true);
 // Use a clean brand label in the design preview after verifying escaped markup.
 await card.locator('.approval-material-meta').nth(3).evaluate(el=>{el.firstElementChild.textContent='Brand: Manufacturer';});
 for(const width of [1440,1180,820,390]){
  await page.setViewportSize({width,height:1000});await page.waitForTimeout(50);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`approval page overflows at ${width}`);
  const geometry=await card.locator('.approval-item-table tbody > tr').evaluateAll(rows=>rows.map(row=>({row:row.getBoundingClientRect().height,field:row.querySelector('input').getBoundingClientRect().y,top:row.getBoundingClientRect().y,bottom:row.getBoundingClientRect().bottom})));
  for(const r of geometry){assert.ok(r.field>=r.top&&r.field<r.bottom,`quantity is outside matching row at ${width}`);assert.ok(r.row<135,`oversized material row ${r.row} at ${width}`);}
  if(width===1440){fs.mkdirSync('test-results',{recursive:true});await page.locator('.main-content').screenshot({path:'test-results/approval-corporate-desktop.png'});}
  if(width===390)await page.screenshot({path:'test-results/approval-corporate-mobile.png',fullPage:true});
 }
 assert.deepEqual(errors,[],'approval redesign browser errors');
 console.log('PASS approval layout: six materials, aligned quantities, complete details, escaped content, action targets, desktop/tablet/mobile overflow checks.');
 }
 if(name==='issue'){
 const input=page.locator('#approvedRequestsTable input').first();
 const requestId=(await input.getAttribute('id')).split('-')[1];
 await input.fill('11');assert.equal(await page.locator('#btnIssue-'+requestId).isDisabled(),true);
 await input.fill('1');assert.equal(await page.locator('#btnIssue-'+requestId).isDisabled(),false);
 assert.match(await page.locator('#amount-'+requestId).innerText(),/100.00/);
 assert.deepEqual(errors,[], 'issue quantity input preview errors');
 await page.evaluate(()=>{
  const template=window.requestRows[0];
  for(const [id,unit,approved,issued,label] of [[9001,'Nos',2,1,'PARTIAL'],[9002,'Ltr',5,0,'PAINT'],[9003,'Nos',10,0,'COUNT']])
   window.requestRows.push({...template,id,ticket_no:'MR-UNIT-'+label,created_at:'2026-01-01T00:00:00Z',requested_qty:approved,approved_qty:approved,issued_qty:issued,request_status:issued?'PARTIALLY_ISSUED':'APPROVED',materials:{...template.materials,unit}});
 });
 const unitSearch=page.locator('#approvedRequestsTable-search');
 await unitSearch.fill('MR-UNIT-');await unitSearch.press('Enter');await page.waitForTimeout(80);
 const partial=page.locator('#issueInput-9001');await partial.fill('2');
 assert.equal(await page.locator('#btnIssue-9001').isDisabled(),true);
 assert.match(await page.locator('#issueError-9001').innerText(),/Maximum available to issue: 1/);
 assert.match(await partial.locator('xpath=ancestor::tr[1]').innerText(),/Issued[\s\S]*1[\s\S]*Remaining[\s\S]*1/);
 await partial.fill('1');assert.equal(await partial.evaluate(el=>el.checkValidity()),true);
 const countInput=page.locator('#issueInput-9003');assert.equal(await countInput.getAttribute('step'),'1');
 await countInput.fill('3');await page.locator('#issuePlus-9003').click();assert.equal(await countInput.inputValue(),'4');
 await page.locator('#issueMinus-9003').click();assert.equal(await countInput.inputValue(),'3');
 await countInput.press('ArrowUp');assert.equal(await countInput.inputValue(),'4');
 await countInput.press('ArrowDown');assert.equal(await countInput.inputValue(),'3');
 await countInput.fill('0.5');assert.equal(await countInput.evaluate(el=>el.checkValidity()),false);assert.equal(await page.locator('#btnIssue-9003').isDisabled(),true);
 await countInput.fill('1');
 const litre=page.locator('#issueInput-9002');assert.equal(await litre.getAttribute('step'),'any');
 await page.locator('#issuePlus-9002').click();assert.equal(await litre.inputValue(),'1');
 await litre.fill('0.5');assert.equal(await litre.evaluate(el=>el.checkValidity()),true);assert.equal(await page.locator('#btnIssue-9002').isDisabled(),false);
 await page.locator('#issuePlus-9002').click();assert.equal(await litre.inputValue(),'1.5');
 await page.locator('#issueMinus-9002').click();assert.equal(await litre.inputValue(),'0.5');
 await litre.press('ArrowUp');assert.equal(await litre.inputValue(),'1.5');await litre.press('ArrowDown');assert.equal(await litre.inputValue(),'0.5');
 await litre.fill('0.125');assert.equal(await litre.evaluate(el=>el.checkValidity()),false);await litre.fill('0.5');
 assert.deepEqual(errors,[], 'whole-unit buttons and manual litre fractions');
 console.log('PASS issue quantity controls: +/- and keyboard step 1; manual 0.5 L valid; fractions on counts rejected; 2 approved minus 1 issued leaves 1.');

 fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/issue-record-browser.png',fullPage:true});
 }
 console.log('PASS '+name+': complaint/MR search, 10/20/50, next/previous, clear/no-match, complete ticket lines');
 await page.close();
 }
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
