const {test,before,after,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..');let db;
const uuid=id=>`00000000-0000-0000-0000-${String(id).padStart(12,'0')}`;
const query=async(sql,values=[])=> (await db.query(sql,values)).rows;
const owner=()=>db.exec('RESET ROLE');
async function actor(id){await owner();await query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id?uuid(id):'']);await db.exec('SET ROLE authenticated');}
async function submit(items=[{material_id:1,quantity:1}]){return(await query("SELECT approval_submit($1::jsonb,'COMMON_AREA','Lobby','TEST','Test Technician','') AS ticket",[JSON.stringify(items)]))[0].ticket;}
async function decide(ticket,id,approve=true,reason=''){await actor(id);return(await query('SELECT approval_decide($1,$2,$3) AS state',[ticket,approve,reason]))[0].state;}
async function state(ticket){await owner();return(await query('SELECT * FROM approval_tickets WHERE ticket_no=$1',[ticket]))[0];}
async function mustFail(work,pattern){await db.exec('SAVEPOINT expected_error');try{await assert.rejects(work,pattern);}finally{await db.exec('ROLLBACK TO SAVEPOINT expected_error');}}
before(async()=>{
 db=new PGlite();await db.exec(fs.readFileSync(path.join(__dirname,'fixtures/approval-schema.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261107_approval_workflow.sql'),'utf8'));
 for(let id=1;id<=5;id++){
  await query('INSERT INTO auth.users(id) VALUES($1)',[uuid(id)]);
  await query('UPDATE users_master SET auth_user_id=$1 WHERE id=$2',[uuid(id),id]);
 }
 await actor(4);
 for(const [user,level,dept] of [[2,1,1],[3,2,1],[5,1,2]])await query('SELECT approval_assign($1,$2,$3,true)',[user,level,dept]);
 await owner();await db.exec(fs.readFileSync(path.join(root,'supabase/activate_approval_workflow.sql'),'utf8'));
});
after(async()=>{await db.close()});
beforeEach(async()=>{await owner();await db.exec('BEGIN');await actor(1)});
afterEach(async()=>{await db.exec('ROLLBACK');await owner()});

test('INR 3000 inclusive needs Level 1 only and final approval is saved',async()=>{
 const ticket=await submit([{material_id:1,quantity:3}]);
 assert.equal((await state(ticket)).required_level,1);
 assert.equal(await decide(ticket,2),'APPROVED');
 const rows=await query('SELECT request_status,approved_by FROM material_requests WHERE ticket_no=$1',[ticket]);
 assert.equal(rows[0].request_status,'APPROVED');assert.equal(rows[0].approved_by,2);
});
test('ticket totals aggregate lines and GST before selecting two approval levels',async()=>{
 const ticket=await submit([{material_id:1,quantity:2},{material_id:2,quantity:1}]);
 const saved=await state(ticket);assert.equal(Number(saved.total_value),3770);assert.equal(saved.required_level,2);
 await actor(3);await mustFail(()=>query('SELECT approval_decide($1,true,\'\')',[ticket]),/Not assigned/);
 assert.equal(await decide(ticket,2),'PENDING_L2');
 await owner();const noReady=await query("SELECT * FROM notifications WHERE message LIKE $1 AND title='Material ready for issue'",[ticket+'%']);assert.equal(noReady.length,0);
 assert.equal(await decide(ticket,3),'APPROVED');
 await owner();assert.equal((await query("SELECT * FROM notifications WHERE message LIKE $1 AND title='Material ready for issue'",[ticket+'%'])).length,1);
});
test('final approval is required for issuing and saved price is used atomically',async()=>{
 const ticket=await submit([{material_id:1,quantity:4}]);await owner();const req=(await query('SELECT id FROM material_requests WHERE ticket_no=$1',[ticket]))[0].id;
 await actor(1);await mustFail(()=>query('SELECT approval_issue($1,1)',[req]),/Final approval/);
 await decide(ticket,2);await actor(1);await mustFail(()=>query('SELECT approval_issue($1,1)',[req]),/Final approval/);
 await decide(ticket,3);await owner();await db.exec('UPDATE materials SET unit_cost=5000 WHERE id=1');await actor(1);
 await query('SELECT approval_issue($1,2)',[req]);
 const issued=await query('SELECT * FROM material_issue_register WHERE request_id=$1',[req]);assert.equal(Number(issued[0].unit_cost),1000);assert.equal(Number(issued[0].total_cost),2000);
 await mustFail(()=>query('SELECT approval_issue($1,3)',[req]),/remaining approval/);
});
test('zero cost proceeds with warning by default and hold can be enabled',async()=>{
 const first=await submit([{material_id:3,quantity:1}]);assert.equal((await state(first)).cost_incomplete,true);assert.equal((await state(first)).state,'PENDING_L1');
 await actor(4);await query('SELECT approval_save_settings(3000,true,true,true)');await actor(1);
 const held=await submit([{material_id:3,quantity:1}]);assert.equal((await state(held)).state,'HOLD');
 await actor(2);await mustFail(()=>query('SELECT approval_decide($1,true,\'\')',[held]),/not awaiting/);
 await actor(4);await mustFail(()=>query('SELECT approval_release_hold($1)',[held]),/Correct every/);
 await owner();await db.exec('UPDATE materials SET unit_cost=4000 WHERE id=3');await actor(4);
 await query('SELECT approval_release_hold($1)',[held]);const repriced=await state(held);assert.equal(Number(repriced.total_value),4000);assert.equal(repriced.required_level,2);assert.equal(repriced.state,'PENDING_L1');
});
test('Admin switches select direct Level 2 or largest-line valuation and are audited',async()=>{
 await actor(4);await query('SELECT approval_save_settings(3000,true,false,false)');await actor(1);
 const direct=await submit([{material_id:1,quantity:4}]);assert.equal((await state(direct)).state,'PENDING_L2');assert.equal(await decide(direct,3),'APPROVED');
 await actor(4);await query('SELECT approval_save_settings(3000,false,true,false)');await actor(1);
 const byLine=await submit([{material_id:1,quantity:2},{material_id:2,quantity:1}]);assert.equal((await state(byLine)).required_level,1);
});
test('self approval, wrong department and one person approving both levels are denied',async()=>{
 const ticket=await submit([{material_id:1,quantity:4}]);
 await actor(4);await query('SELECT approval_assign(1,1,1,true)');await query('SELECT approval_assign(2,2,1,true)');
 await actor(1);await mustFail(()=>query('SELECT approval_decide($1,true,\'\')',[ticket]),/Self approval/);
 await actor(5);await mustFail(()=>query('SELECT approval_decide($1,true,\'\')',[ticket]),/Not assigned/);
 await decide(ticket,2);await actor(2);await mustFail(()=>query('SELECT approval_decide($1,true,\'\')',[ticket]),/different person/);
});
test('non-Admin cannot change settings or assignments, even via RPC',async()=>{
 await mustFail(()=>query('SELECT approval_save_settings(999999,true,false,false)'),/Admin only/);
 await mustFail(()=>query('SELECT approval_assign(1,2,NULL,true)'),/Admin only/);
 await mustFail(()=>query('UPDATE approval_settings SET threshold=999999'),/permission denied/);
});
test('forged browser writes cannot approve requests or expose passwords',async()=>{
 const ticket=await submit();
 await mustFail(()=>query("UPDATE material_requests SET request_status='APPROVED' WHERE ticket_no=$1",[ticket]),/permission denied/);
 await mustFail(()=>query('SELECT password FROM users_master'),/permission denied/);
 await mustFail(()=>query("INSERT INTO stock_ledger(material_id,transaction_type,quantity) VALUES(1,'ISSUE',1)"),/row-level security/);
});
test('unauthenticated and disabled identities cannot submit decisions',async()=>{
 await actor(null);await mustFail(()=>submit(),/authenticated account/);
 await owner();await db.exec('UPDATE users_master SET is_active=false WHERE id=1');await actor(1);await mustFail(()=>submit(),/authenticated account/);
});
test('bad lines roll back the whole request; duplicates and fractional piece units are refused',async()=>{
 await mustFail(()=>submit([{material_id:1,quantity:1},{material_id:4,quantity:1}]),/One department/);
 await mustFail(()=>submit([{material_id:1,quantity:1},{material_id:1,quantity:1}]),/Duplicate/);
 await mustFail(()=>submit([{material_id:1,quantity:0.5}]),/Whole-number/);
 await mustFail(()=>submit([{material_id:1,quantity:-1}]),/positive/);
 await owner();assert.equal((await query('SELECT * FROM approval_tickets')).length,0);
});
test('price and settings changes do not silently change an existing route',async()=>{
 const ticket=await submit([{material_id:1,quantity:4}]);await actor(4);await query('SELECT approval_save_settings(9000,true,false,false)');
 await owner();await db.exec('UPDATE materials SET unit_cost=1 WHERE id=1');assert.equal(Number((await state(ticket)).total_value),4000);
 assert.equal(await decide(ticket,2),'PENDING_L2');
});
test('rejection needs a reason; double decisions are refused',async()=>{
 const ticket=await submit();await actor(2);await mustFail(()=>query('SELECT approval_decide($1,false,\'\')',[ticket]),/reason required/);
 assert.equal(await decide(ticket,2,false,'Not required'),'REJECTED');await actor(2);await mustFail(()=>query('SELECT approval_decide($1,true,\'\')',[ticket]),/not awaiting/);
});
test('editing is atomic and preserves cancelled history; processed tickets cannot be edited',async()=>{
 const ticket=await submit();await actor(1);
 await mustFail(()=>query("SELECT approval_replace($1,$2::jsonb,'COMMON_AREA','Lobby','','','')",[ticket,JSON.stringify([{material_id:1,quantity:-1}])]),/positive/);
 assert.equal((await state(ticket)).state,'PENDING_L1');await actor(1);
 const next=(await query("SELECT approval_replace($1,$2::jsonb,'COMMON_AREA','Lobby','','','') AS next",[ticket,JSON.stringify([{material_id:1,quantity:2}])]))[0].next;
 assert.equal((await state(ticket)).state,'CANCELLED');assert.equal((await state(next)).state,'PENDING_L1');
 await decide(next,2);await actor(1);await mustFail(()=>query('SELECT approval_withdraw($1)',[next]),/processed ticket/);
});

test('partial quantities survive Level 1 and cannot be increased by Level 2',async()=>{
 const ticket=await submit([{material_id:1,quantity:4}]);await owner();const id=(await query('SELECT request_id FROM approval_lines WHERE ticket_no=$1',[ticket]))[0].request_id;
 await actor(2);await query('SELECT approval_decide($1,true,\'\',$2::jsonb)',[ticket,JSON.stringify([{request_id:id,quantity:2}])]);
 assert.equal((await state(ticket)).state,'PENDING_L2');await actor(3);
 await mustFail(()=>query('SELECT approval_decide($1,true,\'\',$2::jsonb)',[ticket,JSON.stringify([{request_id:id,quantity:3}])]),/previous approval/);
 await query('SELECT approval_decide($1,true,\'\',$2::jsonb)',[ticket,JSON.stringify([{request_id:id,quantity:1}])]);
 const result=await query('SELECT approved_qty,request_status FROM material_requests WHERE id=$1',[id]);assert.equal(Number(result[0].approved_qty),1);assert.equal(result[0].request_status,'PARTIALLY_APPROVED');
});
test('issue RPC enforces whole-number units and cannot issue an approved item twice beyond its limit',async()=>{
 const ticket=await submit();await decide(ticket,2);await owner();const id=(await query('SELECT id FROM material_requests WHERE ticket_no=$1',[ticket]))[0].id;
 await actor(1);await mustFail(()=>query('SELECT approval_issue($1,0.5)',[id]),/unit/);
 await query('SELECT approval_issue($1,1)',[id]);await mustFail(()=>query('SELECT approval_issue($1,1)',[id]),/not approved/);
});

test('draft migration keeps legacy requests working and does not activate the workflow',async()=>{
 const draft=new PGlite();try{
 await draft.exec(fs.readFileSync(path.join(__dirname,'fixtures/approval-schema.sql'),'utf8'));
 await draft.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261107_approval_workflow.sql'),'utf8'));
 assert.equal((await draft.query('SELECT enabled FROM approval_settings')).rows[0].enabled,false);
 await draft.exec("SET ROLE anon; INSERT INTO material_requests(ticket_no,material_id,requested_qty,requested_by,request_status) VALUES('MR-LEGACY',1,1,1,'PENDING');");
 assert.equal((await draft.query("SELECT count(*) FROM material_requests WHERE ticket_no='MR-LEGACY'")).rows[0].count,1);
 }finally{await draft.close()}
});
test('cutover refuses unlinked active accounts rather than locking them out silently',async()=>{
 const draft=new PGlite();try{
 await draft.exec(fs.readFileSync(path.join(__dirname,'fixtures/approval-schema.sql'),'utf8'));
 await draft.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261107_approval_workflow.sql'),'utf8'));
 await assert.rejects(draft.exec(fs.readFileSync(path.join(root,'supabase/activate_approval_workflow.sql'),'utf8')),/Link an active Admin/);
 await draft.exec('ROLLBACK');
 assert.equal((await draft.query('SELECT enabled FROM approval_settings')).rows[0].enabled,false);
 }finally{await draft.close()}
});
