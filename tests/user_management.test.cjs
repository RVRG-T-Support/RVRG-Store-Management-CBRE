const {test}=require('node:test');const assert=require('node:assert/strict');
const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
function setup(duplicate=null){
 const nodes=new Map(),writes=[],alerts=[];
 const element=id=>{if(!nodes.has(id))nodes.set(id,{value:'',type:'password',style:{},setAttribute(k,v){this[k]=v},scrollIntoView(){}});return nodes.get(id)};
 for(const [id,value]of Object.entries({userId:'3',fullName:'Upender',email:'afm@example.test',username:'Updated.Name',password:'',role:'EXECUTIVE',isActive:'true'}))element(id).value=value;
 const client={from(table){const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:duplicate}),single:async()=>({data:{id:3,full_name:'Upender',username:'Old.Name',email:'afm@example.test',role:'AFM',is_active:true}}),
 update(values){writes.push({table,values});return q},delete(){return q},insert(values){writes.push({table,values});return q},then(resolve,reject){return Promise.resolve({data:null,error:null}).then(resolve,reject)}};return q}};
 const context=vm.createContext({window:{},supabaseClient:client,document:{addEventListener(){},getElementById:element},showAlert:(message,type)=>alerts.push({message,type}),console:{error(){}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../users.js'),'utf8'),context);
 vm.runInContext('getSelectedPermissions=()=>[];loadUsers=async()=>{};loadUserPermissions=async()=>{};clearUserForm=()=>{};',context);
 return{run:code=>vm.runInContext(code,context),element,writes,alerts};
}
test('password eye switches the field, icon and accessible pressed state',()=>{
 const app=setup();app.element('password').value='typed-only';app.run('togglePassword()');
 assert.equal(app.element('password').type,'text');assert.equal(app.element('password').value,'typed-only');
 assert.equal(app.element('togglePasswordButton')['aria-pressed'],'true');
 app.run('togglePassword()');assert.equal(app.element('password').type,'password');
});
test('existing usernames are editable and edits preserve the unchanged password',async()=>{
 const app=setup();await app.run('editUser(3)');assert.equal(app.element('username').disabled,false);
 app.element('username').value='New.Username';app.element('role').value='SUPERVISOR';await app.run('updateUser()');
 assert.equal(app.writes[0].values.username,'New.Username');assert.equal(app.writes[0].values.role,'SUPERVISOR');
 assert.ok(!('password' in app.writes[0].values));assert.equal(app.alerts.at(-1).type,'success');
});
test('duplicate usernames stop updates while an unchanged username is allowed',async()=>{
 const duplicate=setup({id:4});await duplicate.run('updateUser()');assert.equal(duplicate.writes.length,0);assert.match(duplicate.alerts[0].message,/already exists/);
 const same=setup({id:3});await same.run('updateUser()');assert.equal(same.writes[0].values.role,'EXECUTIVE');
});
test('new user creation succeeds and both new roles preserve the selected title',async()=>{
 for(const role of ['EXECUTIVE','SUPERVISOR']){
  const app=setup();app.element('role').value=role;app.element('password').value='new-password';await app.run('saveUser()');
  assert.equal(app.writes[0].values.role,role);assert.equal(app.alerts.at(-1).type,'success');
 }
});

test('Executive and Supervisor pages follow assigned sections without implicit Admin access',()=>{
 for(const role of ['EXECUTIVE','SUPERVISOR']){
  for(const [file,grants,expected]of [
   ['dashboard.html',{dashboard:true},true],['dashboard.html',{stock_entry:true},false],['material_categories.html',{material_categories:true},true],
   ['stock_entry.html',{stock_entry:true},true],['stock_entry.html',{},false],['users.html',{user_management:true},false]
  ]){
   const user={id:3,role,sectionPermissions:grants};const context=vm.createContext({
    window:{location:{pathname:'/'+file,replace(){}},supabaseClient:{from(){return{select(){return{eq(){return{single:async()=>({data:{id:3,is_active:true}})}}}}}}}},localStorage:{getItem:()=>JSON.stringify(user),removeItem(){}},
    supabase:{from(){return{select(){return{eq(){return{single:async()=>({data:{id:3,is_active:true}})}}}}}}},alert(){},console
   });
   vm.runInContext(fs.readFileSync(path.join(__dirname,'../common.js'),'utf8'),context);
   assert.equal(vm.runInContext("checkUserAccess(['ADMIN'])",context),expected,role+file);
   if(file==='dashboard.html'&&grants.stock_entry)assert.equal(context.window.location.href,'stock_entry.html');
  }
 }
});
