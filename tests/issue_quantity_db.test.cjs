const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
// Self-contained production-shaped fixture; no staging scripts or credentials.
const fixture=fs.readFileSync(path.join(__dirname,'fixtures/legacy-issue-schema.sql'),'utf8');
test('checked issue caps cumulative approval, retries once and rolls back failures',async()=>{
 const db=new PGlite();try{
 await db.exec(fixture);const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261116_issue_quantity_guard.sql'),'utf8');
 await db.exec(sql);await db.exec(sql);await db.exec('SET ROLE anon');
 const rows=async(q,params=[])=>(await db.query(q,params)).rows;
 const key=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const issue=(qty,k=1,request=1,actor=6)=>rows('SELECT issue_material_checked($1,$2,$3,$4::uuid)',[request,qty,actor,key(k)]);
 await assert.rejects(()=>issue(11),/remaining approved/);
 await assert.rejects(()=>db.exec("INSERT INTO material_issue_register(request_id,material_id,ticket_no,issued_qty) VALUES(1,1,'MR-TEST',11)"),/cannot exceed approved/);
 await assert.rejects(()=>issue(1,1,1,7),/access required/);
 for(const qty of [0,-1,'NaN','Infinity',0.5,1.123]) await assert.rejects(()=>issue(qty));
 await issue(1);await issue(1);assert.equal((await rows('SELECT count(*) AS n FROM material_issue_register'))[0].n,1);
 assert.equal((await rows('SELECT current_stock FROM current_stock'))[0].current_stock,'9');
 const record=(await rows('SELECT * FROM material_issue_register'))[0];assert.equal(record.unit_cost,'141.60');assert.equal(record.total_cost,'141.60');
 await assert.rejects(()=>issue(2),/different issue/);
 assert.equal((await rows('SELECT request_status FROM material_requests WHERE id=1'))[0].request_status,'PARTIALLY_ISSUED');
 await assert.rejects(()=>issue(2,2),/remaining approved/);await issue(1,2);
 assert.equal((await rows('SELECT request_status FROM material_requests WHERE id=1'))[0].request_status,'ISSUED');
 await issue(1,2);await assert.rejects(()=>issue(1,3),/not approved/);
 await assert.rejects(()=>db.exec("UPDATE material_requests SET issued_qty=11 WHERE id=1"),/cannot exceed/);
 await assert.rejects(()=>db.exec("INSERT INTO material_issue_register(request_id,material_id,ticket_no,issued_qty) VALUES(1,1,'MR-TEST',1)"),/not approved/);
 await db.exec("INSERT INTO material_issue_register(request_id,material_id,ticket_no,issued_qty) VALUES(2,1,'MR-SECOND',1)");
 await assert.rejects(()=>db.exec("INSERT INTO material_issue_register(request_id,material_id,ticket_no,issued_qty) VALUES(2,1,'MR-SECOND',5)"),/cannot exceed approved/);
 await assert.rejects(()=>issue(1,4,2),/differ/);
 // Failure after register insertion must roll back the register, ledger and request.
 await db.exec("RESET ROLE;CREATE FUNCTION fail_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'ledger test failure'; END $$;CREATE TRIGGER fail_ledger BEFORE INSERT ON stock_ledger FOR EACH ROW EXECUTE FUNCTION fail_ledger();INSERT INTO material_requests VALUES(3,1,'MR-FAIL',1,1,0,'APPROVED','Test','COMMON_AREA','Tech');SET ROLE anon");
 const before=(await rows('SELECT count(*) AS n FROM material_issue_register'))[0].n;
 await assert.rejects(()=>issue(1,5,3),/ledger test failure/);
 assert.equal((await rows('SELECT count(*) AS n FROM material_issue_register'))[0].n,before);
 assert.equal((await rows('SELECT issued_qty FROM material_requests WHERE id=3'))[0].issued_qty,'0');
 }finally{await db.close();}
});
