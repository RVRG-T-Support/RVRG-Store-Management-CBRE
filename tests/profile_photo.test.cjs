const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const photo='data:image/jpeg;base64,/9j/AA==';
function setup(){
 let user={id:6};const writes=[],nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,textContent:'',setAttribute(){},removeAttribute(){}});return nodes.get(id)};
 const client={from(table){return{update(values){return{eq(field,id){writes.push({table,values,field,id});return{select(){return{single:async()=>({data:{id,...values}})}}}}}}}}};
 const context={window:{supabaseClient:client},getCurrentUser:()=>user,document:{getElementById:node}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../profile-photo.js'),'utf8'),context);
 const api=context.window.RvrgProfilePhoto;api.owner='6';api.header=()=>{};
 return{api,writes,node,switchUser:id=>user={id}};
}
test('photo validation rejects external URLs, SVG and oversized data',()=>{
 const {api}=setup();assert.equal(api.valid(photo),true);assert.equal(api.valid(null),true);
 for(const invalid of ['https://example.test/photo.jpg','data:image/svg+xml;base64,AAAA','data:image/jpeg;base64,'+'A'.repeat(100000)])assert.equal(api.valid(invalid),false);
});
test('photo saving and removing target the logged-in user record',async()=>{
 const {api,writes,node}=setup();api.pending=photo;await api.save();assert.equal(writes[0].id,6);assert.equal(writes[0].values.profile_photo,photo);assert.equal(api.current,photo);
 api.pending=null;await api.save();assert.equal(writes[1].values.profile_photo,null);assert.match(node('profilePhotoMessage').textContent,/saved/);
});
test('session changes prevent a photo from being written to another user',async()=>{
 const {api,writes,switchUser}=setup();api.pending=photo;switchUser(3);await api.save();assert.equal(writes.length,0);
});

test('an in-flight save cannot display the previous account photo after switching accounts',async()=>{
 const {api,switchUser}=setup();api.pending=photo;const saving=api.save();
 switchUser(3);api.owner='3';api.current=null;await saving;assert.equal(api.current,null);
});
