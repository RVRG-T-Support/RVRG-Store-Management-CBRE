const {test}=require('node:test');const assert=require('node:assert/strict');const {PGlite}=require('@electric-sql/pglite');const fs=require('node:fs');const path=require('node:path');
test('profile-photo migration preserves user fields, isolates photos and reruns without loss',async()=>{
 const db=new PGlite();try{
  await db.exec("CREATE TABLE users_master(id bigint PRIMARY KEY,username text UNIQUE,password text,role text);INSERT INTO users_master VALUES(1,'store','existing-password','STOREKEEPER'),(6,'admin','admin-password','ADMIN')");
  const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261113180000_profile_photo.sql'),'utf8');await db.exec(sql);
  await db.exec("UPDATE users_master SET profile_photo='data:image/jpeg;base64,/9j/AA==' WHERE id=6");await db.exec(sql);
  const rows=(await db.query('SELECT * FROM users_master ORDER BY id')).rows;
  assert.equal(rows[0].profile_photo,null);assert.equal(rows[1].profile_photo,'data:image/jpeg;base64,/9j/AA==');
  assert.equal(rows[0].password,'existing-password');assert.equal(rows[1].username,'admin');
  await assert.rejects(()=>db.exec("UPDATE users_master SET profile_photo='https://external.test/image.jpg' WHERE id=1"),/check constraint/);
  await assert.rejects(()=>db.exec("UPDATE users_master SET profile_photo='data:image/svg+xml;base64,AAAA' WHERE id=1"),/check constraint/);
 }finally{await db.close()}
});
