const {PGlite}=require('@electric-sql/pglite');
const {chromium}=require('playwright');
const fs=require('node:fs');const assert=require('node:assert/strict');const path=require('node:path');
process.chdir(path.join(__dirname,'../..'));
const artifacts=process.env.ARTIFACT_DIR || path.join(process.cwd(),'test-results');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 const db=new PGlite();await db.exec(fs.readFileSync('tests/fixtures/approval-schema.sql','utf8'));await db.exec(fs.readFileSync('supabase/migrations/20261107_approval_workflow.sql','utf8'));
 const uid=id=>'00000000-0000-0000-0000-'+String(id).padStart(12,'0');
 for(let id=1;id<=5;id++){await db.query('INSERT INTO auth.users VALUES($1)',[uid(id)]);await db.query('UPDATE users_master SET auth_user_id=$1 WHERE id=$2',[uid(id),id])}
 async function actor(id){await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[uid(id)]);await db.exec('SET ROLE authenticated')}
 await actor(4);await db.exec('SELECT approval_assign(2,1,1,true); SELECT approval_assign(3,2,1,true);');await db.exec('RESET ROLE');await db.exec(fs.readFileSync('supabase/activate_approval_workflow.sql','utf8'));
 await actor(1);const ticket=(await db.query("SELECT approval_submit($1::jsonb,'COMMON_AREA','Lobby','TEST','','') AS ticket",[JSON.stringify([{material_id:1,quantity:4}])])).rows[0].ticket;
 const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});const p=await b.newPage({viewport:{width:1440,height:1100}});const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',dialog=>dialog.accept());
 await p.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<html></html>'}));await p.goto('https://approval.test/');
 await p.exposeFunction('dbProfile',async()=> (await db.query('SELECT approval_profile() AS profile')).rows[0].profile);
 const tables=['approval_settings','approval_assignments','users_master','departments','approval_tickets','approval_lines','approval_audit'];
 await p.exposeFunction('dbRows',async(table,columns,start,end)=>{
  assert.ok(tables.includes(table));assert.match(columns,/^[a-z_, *]+$/);
  const key=table==='approval_tickets'?'created_at':table==='approval_lines'?'request_id':'id';
  return (await db.query(`SELECT ${columns} FROM ${table} ORDER BY ${key} DESC LIMIT $1 OFFSET $2`,[end-start+1,start])).rows;
 });
 await p.exposeFunction('dbRpc',async(name,args)=>{
  assert.ok(['approval_save_settings','approval_assign','approval_decide','approval_release_hold'].includes(name));
  const entries=Object.entries(args);const params=entries.map(([k,v],i)=>`${k} => $${i+1}${typeof v==='object'&&v!==null?'::jsonb':''}`).join(',');
  try{return {data:(await db.query(`SELECT ${name}(${params}) AS result`,entries.map(([k,v])=>typeof v==='object'&&v!==null?JSON.stringify(v):v))).rows[0].result}}catch(error){return{error:{message:error.message}}}
 });
 async function open(file,enabled=true){
  let html=fs.readFileSync(file,'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,tag=>{
   if(tag.includes('bootstrap'))return process.env.BOOTSTRAP_CSS ? '<style>'+fs.readFileSync(process.env.BOOTSTRAP_CSS,'utf8')+'</style>' : '';
   const href=tag.match(/href="([^"]+)"/)?.[1];return href&&fs.existsSync(href)?'<style>'+fs.readFileSync(href,'utf8')+'</style>':'';
  });
  await p.setContent(html);
  await p.evaluate(enabled=>{
   window.RvrgSecure={enabled:()=>enabled,profile:()=>window.dbProfile()};
   window.supabaseClient={rpc:(name,args)=>window.dbRpc(name,args),from(table){let columns;return{select(value){columns=value;return{order(){return{range:async(start,end)=>{try{return{data:await window.dbRows(table,columns,start,end)}}catch(e){return{error:{message:e.message}}}}}}}}}}};
  },enabled);
  await p.addScriptTag({content:fs.readFileSync('approval-workflow.js','utf8')});await p.evaluate(()=>document.dispatchEvent(new Event('DOMContentLoaded')));
 }
 await actor(4);await open('approval_management.html');await p.waitForFunction(()=>!document.getElementById('workflowContent').hidden);
 assert.equal(await p.locator('#total_ticket_value').isChecked(),true);assert.equal(await p.locator('#sequential_levels').isChecked(),true);assert.equal(await p.locator('#hold_missing_cost').isChecked(),false);
 await p.locator('#threshold').fill('3500');await p.locator('#settingsForm button').click();await p.waitForFunction(()=>document.getElementById('workflowMessage').textContent.includes('Settings saved'));
 assert.equal(Number((await db.query('SELECT threshold FROM approval_settings')).rows[0].threshold),3500);
 await p.locator('#threshold').fill('3000');await p.locator('#settingsForm button').click();await p.waitForFunction(()=>!document.querySelector('#settingsForm button').disabled);
 await p.screenshot({path:path.join(artifacts,'approval-management-preview.png'),fullPage:true});
 await actor(2);await open('approval_workflow.html');await p.waitForFunction(()=>!document.getElementById('workflowContent').hidden);
 await p.screenshot({path:path.join(artifacts,'approval-queue-preview.png'),fullPage:true});
 await p.getByRole('button',{name:'Approve',exact:true}).click();await p.waitForFunction(()=>document.getElementById('workflowMessage').textContent.includes('PENDING_L2'));
 assert.equal((await db.query('SELECT state FROM approval_tickets WHERE ticket_no=$1',[ticket])).rows[0].state,'PENDING_L2');
 await actor(3);await open('approval_workflow.html');await p.waitForFunction(()=>!document.getElementById('workflowContent').hidden);await p.getByRole('button',{name:'Approve',exact:true}).click();await p.waitForFunction(()=>document.getElementById('workflowMessage').textContent.includes('APPROVED'));
 await actor(2);await open('approval_management.html');await p.waitForFunction(()=>document.getElementById('workflowMessage').textContent.includes('Only Admin'));assert.equal(await p.locator('#workflowContent').isVisible(),false);
 await open('approval_management.html',false);await p.waitForFunction(()=>document.getElementById('workflowMessage').textContent.includes('disabled'));assert.equal(await p.locator('#workflowContent').isVisible(),false);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({settings:'saved in local PostgreSQL',defaults:'total/sequential on, cost hold off',approval:'Level 1 then Level 2 via browser and SQL',nonAdmin:'blocked',featureOff:'safe',pageErrors:errors,productionRequests:0}));
 await b.close();await db.close();
})().catch(e=>{console.error(e);process.exit(1)});
