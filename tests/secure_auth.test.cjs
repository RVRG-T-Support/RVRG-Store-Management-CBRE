const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
function setup(enabled=true,profileError=null){
 const calls=[],stored=new Map();
 const window={RVRG_APPROVAL_WORKFLOW_ENABLED:enabled,supabaseClient:{
 auth:{getSession:async()=>({data:{session:{access_token:'test-token'}}}),signInWithPassword:async creds=>{calls.push(['login',creds]);return{}},signOut:async()=>{calls.push(['logout'])}},
 rpc:async name=>{calls.push(['rpc',name]);return{data:{id:2,name:'Verified User',role:'AFM'},error:profileError}},
 from(){return{select(){return{eq:async()=>({data:[{section_key:'approvals',is_allowed:true}]})}}}},
 functions:{invoke:async(name,body)=>{calls.push([name,body]);return{data:{id:3}}}}
 }};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','secure-auth.js'),'utf8'),{window,localStorage:{setItem:(k,v)=>stored.set(k,v)}});
 return{bridge:window.RvrgSecure,calls,stored,window};
}
test('legacy mode is off by default and Auth bridge is opt-in',()=>{const a=setup(false);assert.equal(a.bridge.enabled(),false);a.window.RVRG_APPROVAL_WORKFLOW_ENABLED=true;assert.equal(a.bridge.enabled(),true)});
test('verified profile replaces browser claims and loads real permissions',async()=>{const a=setup();await a.bridge.login('test@example.test','test-password');const p=JSON.parse(a.stored.get('RVRG_ACTIVE_USER'));assert.equal(p.id,2);assert.equal(p.name,'Verified User');assert.equal(p.sectionPermissions.approvals,true);assert.equal(a.calls.some(c=>c[0]==='rpc'&&c[1]==='approval_profile'),true)});
test('unlinked profiles sign out instead of falling back to a local user ID',async()=>{const a=setup(true,new Error('Unlinked'));await assert.rejects(a.bridge.login('test@example.test','test-password'),/Unlinked/);assert.equal(a.calls.some(c=>c[0]==='logout'),true);assert.equal(a.stored.size,0)});
test('Admin password operations use the backend function rather than writing passwords to a table',async()=>{const a=setup();await a.bridge.adminUser({action:'update',id:3,password:'test-password-123'});assert.equal(a.calls[0][0],'admin-users');assert.equal(a.calls[0][1].body.action,'update')});
test('checked-in application config leaves the workflow disabled for review',()=>{
 const window={supabase:{createClient:()=>({})}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','config.js'),'utf8'),{window});
 assert.equal(window.RVRG_APPROVAL_WORKFLOW_ENABLED,false);
});
