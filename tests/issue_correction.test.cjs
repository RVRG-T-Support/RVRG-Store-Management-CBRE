const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {PGlite}=require('@electric-sql/pglite');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const repair=read('supabase/repairs/20261116_MR-2026-0363.sql');
async function setup(){
 const db=new PGlite();await db.exec(read('tests/fixtures/legacy-issue-schema.sql'));
 await db.exec(`ALTER TABLE materials ADD COLUMN material_code text;UPDATE materials SET material_code='PLB-179';
 ALTER TABLE material_requests ADD COLUMN returned_qty numeric DEFAULT 0;
 CREATE TABLE material_returns(issue_id bigint REFERENCES material_issue_register(id),returned_qty numeric);
 CREATE TABLE material_issues(request_id bigint,issued_qty numeric);
 UPDATE stock_ledger SET quantity=30;
 INSERT INTO material_requests(id,material_id,ticket_no,requested_qty,approved_qty,issued_qty,request_status) VALUES(1022,1,'MR-2026-0363',1,1,11,'ISSUED');
 INSERT INTO material_issue_register(id,request_id,material_id,ticket_no,issued_qty,unit_cost,total_cost,issued_date,remarks)
 VALUES(630,1022,1,'MR-2026-0363',11,80.24,882.64,'2026-11-01T09:58:33.993841Z','Original issue');
 INSERT INTO stock_ledger(id,material_id,transaction_type,quantity,reference_no,request_id,transaction_date,remarks)
 VALUES(50,1,'ISSUE',11,'630',1022,'2026-11-01T09:58:33.993841Z','Original deduction');`);
 await db.exec(read('supabase/migrations/20261116_issue_quantity_guard.sql'));return db;
}
const rows=async(db,sql)=>(await db.query(sql)).rows;
test('targeted repair restores ten once and corrects consumption at the original rate',async()=>{
 const db=await setup();try{
 const before=(await rows(db,'SELECT * FROM material_issue_register WHERE id=630'))[0];
 const other=await rows(db,'SELECT * FROM material_requests WHERE id<>1022 ORDER BY id');
 await db.exec(repair);
 assert.equal((await rows(db,'SELECT current_stock FROM current_stock'))[0].current_stock,'29');
 const issue=(await rows(db,'SELECT * FROM material_issue_register WHERE id=630'))[0];
 assert.equal(issue.issued_qty,'1');assert.equal(issue.unit_cost,'80.24');assert.equal(issue.total_cost,'80.24');assert.equal(issue.issued_date.getTime(),before.issued_date.getTime());assert.match(issue.remarks,/Original issue/);assert.match(issue.remarks,/physically issued 1/);
 assert.deepEqual(await rows(db,'SELECT issued_qty,requested_qty,approved_qty,request_status FROM material_requests WHERE id=1022'),[{issued_qty:'1',requested_qty:'1',approved_qty:'1',request_status:'ISSUED'}]);
 assert.equal((await rows(db,"SELECT sum(quantity) AS consumption FROM stock_ledger WHERE transaction_type='ISSUE'"))[0].consumption,'1');
 assert.deepEqual(await rows(db,'SELECT * FROM material_requests WHERE id<>1022 ORDER BY id'),other);
 const audit=(await rows(db,'SELECT * FROM rvrg_data_corrections'))[0];assert.equal(audit.before_state.issue.issued_qty,11);assert.equal(audit.before_state.ledger.quantity,11);assert.equal(audit.after_state.stock_restored,10);assert.equal(audit.before_state.stock,19);assert.equal(audit.after_state.stock,29);
 await db.exec(repair);assert.equal((await rows(db,'SELECT count(*) AS n FROM rvrg_data_corrections'))[0].n,1);assert.equal((await rows(db,'SELECT current_stock FROM current_stock'))[0].current_stock,'29');
 assert.equal((await rows(db,'SELECT count(*) AS n FROM material_returns'))[0].n,0);
 await db.exec('SET ROLE anon');await assert.rejects(()=>db.query('SELECT * FROM rvrg_data_corrections'),/permission denied/);
 }finally{await db.close();}
});
test('unexpected links, returns, legacy issues or missing historical rate stop the whole repair',async()=>{
 for(const change of ["UPDATE stock_ledger SET reference_no='WRONG' WHERE id=50","INSERT INTO material_returns VALUES(630,1)","INSERT INTO material_issues VALUES(1022,11)","UPDATE material_issue_register SET unit_cost=NULL WHERE id=630","UPDATE materials SET material_code='OTHER'"]){
 const db=await setup();try{
 await db.exec(change);await assert.rejects(()=>db.exec(repair));await db.exec('ROLLBACK');
 assert.equal((await rows(db,'SELECT issued_qty FROM material_requests WHERE id=1022'))[0].issued_qty,'11');assert.equal((await rows(db,'SELECT issued_qty FROM material_issue_register WHERE id=630'))[0].issued_qty,'11');assert.equal((await rows(db,'SELECT quantity FROM stock_ledger WHERE id=50'))[0].quantity,'11');
 assert.equal((await rows(db,"SELECT to_regclass('public.rvrg_data_corrections') AS t"))[0].t,null);
 }finally{await db.close();}
 }
});
