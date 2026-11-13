const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');const {stripTypeScriptTypes}=require('node:module');
function setup(role='ADMIN',valid=true){
 let handler;const calls=[];
 const admin={auth:{getUser:async jwt=>({data:{user:valid?{id:'verified-auth-id'}:null},error:valid?null:new Error('invalid')}),admin:{createUser:async body=>{calls.push(['createAuth',body]);return{data:{user:{id:'new-auth-id'}}}},deleteUser:async id=>{calls.push(['deleteAuth',id]);return{}},updateUserById:async(id,body)=>{calls.push(['updateAuth',id,body]);return{}}}},from(table){const q={select(){return q},eq(){return q},insert(values){calls.push(['insert',table,values]);return q},update(values){calls.push(['update',table,values]);return q},single:async()=>({data:table==='users_master'?(calls.some(c=>c[0]==='insert')?{id:8}:{id:4,role,is_active:true,auth_user_id:'target-auth'}):{},error:null})};return q}};
 const text=fs.readFileSync(path.join(__dirname,'..','supabase/functions/admin-users/index.ts'),'utf8').replace(/^import .*;\n/m,'');
 const code=stripTypeScriptTypes(text);
 vm.runInNewContext(code,{createClient:()=>admin,Deno:{env:{get:name=>name==='APP_ORIGIN'?'https://example.test':'test-only'},serve:fn=>handler=fn},Response,Error,Number});
 return {calls,request:async(body,origin='https://example.test')=>handler(new Request('https://backend.test',{method:'POST',headers:{origin,authorization:'Bearer test-token','content-type':'application/json'},body:JSON.stringify(body)}))};
}
test('invalid JWT and non-Admin identities cannot change any account',async()=>{for(const a of [setup('ADMIN',false),setup('AFM')]){const r=await a.request({action:'update',id:8,password:'changed-password-123'});assert.ok([401,403].includes(r.status));assert.equal(a.calls.length,0)}});
test('untrusted origin and short passwords are rejected',async()=>{const a=setup();assert.equal((await a.request({action:'create'},'https://other.test')).status,403);assert.equal((await a.request({action:'create',password:'short'})).status,400);assert.equal(a.calls.length,0)});
test('Admin can create an Auth user without storing the password in users_master',async()=>{const a=setup();const r=await a.request({action:'create',full_name:'New User',email:'new@example.test',username:'new',role:'AFM',password:'long-password-123',is_active:true});assert.equal(r.status,200);const profile=a.calls.find(c=>c[0]==='insert')[2];assert.equal(profile.password,null);assert.equal(profile.auth_user_id,'new-auth-id');assert.equal(a.calls.find(c=>c[0]==='createAuth')[1].password,'long-password-123')});
test('Admin can set another user password through verified backend Auth API',async()=>{const a=setup();const r=await a.request({action:'update',id:8,password:'long-password-123'});assert.equal(r.status,200);assert.equal(a.calls.some(c=>c[0]==='updateAuth'),true);assert.ok(a.calls.filter(c=>c[0]==='update').every(c=>!('password'in c[2])))});
test('Admin cannot disable or demote their own account',async()=>{const a=setup();assert.equal((await a.request({action:'update',id:4,is_active:false})).status,400);assert.equal((await a.request({action:'update',id:4,role:'AFM'})).status,400)});
test('verified Admin endpoint accepts Executive and Supervisor role titles',async()=>{
 for(const role of ['EXECUTIVE','SUPERVISOR']){
  const a=setup();const r=await a.request({action:'create',full_name:'New User',email:'new@example.test',username:'new',role,password:'long-password-123',is_active:true});
  assert.equal(r.status,200);assert.equal(a.calls.find(c=>c[0]==='insert')[2].role,role);
 }
});
