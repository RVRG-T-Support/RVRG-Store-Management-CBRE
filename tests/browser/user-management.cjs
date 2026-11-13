const {chromium}=require('playwright');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
process.chdir(path.join(__dirname,'../..'));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const html=fs.readFileSync('users.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,tag=>{
   if(tag.includes('bootstrap'))return '<style>'+fs.readFileSync(process.env.BOOTSTRAP_CSS,'utf8')+'</style>';
   const href=tag.match(/href="([^"]+)"/)?.[1];return href&&fs.existsSync(href)?'<style>'+fs.readFileSync(href,'utf8')+'</style>':'';
  });
  await page.route('**/*',route=>route.request().isNavigationRequest()?route.fulfill({contentType:'text/html',body:html}):route.abort());
  await page.goto('https://users.test/');
  await page.evaluate(()=>{
   window.testUser={id:6,name:'Bibhu Datta',role:'ADMIN'};window.getCurrentUser=()=>window.testUser;
   window.checkUserAccess=()=>true;window.showAlert=(message,type)=>(window.alerts||=[]).push({message,type});
   window.records=[{id:3,full_name:'Upender',username:'AFM.User',email:'user@example.test',password:'unchanged-password',role:'AFM',is_active:true,profile_photo:null},{id:6,full_name:'Bibhu Datta',username:'Admin',role:'ADMIN',is_active:true,profile_photo:null}];
   window.supabaseClient={from(table){const filters=[];let operation='read',values;
    const result=()=>{
     if(table==='user_permissions'||table==='application_sections')return{data:[],error:null};
     const matches=window.records.filter(r=>filters.every(([field,value])=>String(r[field])===String(value)));
     if(operation==='insert'){const record={id:9,...values};window.records.push(record);return{data:record,error:null}}
     if(operation==='update'){matches.forEach(r=>Object.assign(r,values));return{data:matches[0]||null,error:null}}
     return{data:matches,error:null};
    };
    const q={select(){return q},eq(field,value){filters.push([field,value]);return q},order(){return q},
     single:async()=>{const r=result();return{...r,data:Array.isArray(r.data)?r.data[0]:r.data}},
     maybeSingle:async()=>{const r=result();return{...r,data:Array.isArray(r.data)?r.data[0]||null:r.data}},
     update(v){operation='update';values=v;return q},insert(v){operation='insert';values=v;return q},delete(){return q},
     then(resolve,reject){return Promise.resolve(result()).then(resolve,reject)}};return q;
   }};
  });
  await page.addScriptTag({content:fs.readFileSync('profile-photo.js','utf8')});
  await page.addScriptTag({content:fs.readFileSync('navigation.js','utf8')});
  await page.addScriptTag({content:fs.readFileSync('users.js','utf8')});
  await page.evaluate(async()=>{renderHeader();await window.RvrgProfilePhoto.attach();await loadUsers();});
  await page.locator('#password').fill('typed-password');await page.locator('#togglePasswordButton').click();
  assert.equal(await page.locator('#password').getAttribute('type'),'text');await page.locator('#togglePasswordButton').click();assert.equal(await page.locator('#password').getAttribute('type'),'password');
  await page.evaluate(()=>editUser(3));assert.equal(await page.locator('#username').isEnabled(),true);
  assert.equal(await page.locator('#password').inputValue(),'');
  await page.locator('#username').fill('AFM.Updated');await page.locator('#role').selectOption('EXECUTIVE');await page.locator('#btnUpdateUser').click();
  await page.waitForFunction(()=>records.find(r=>r.id===3).username==='AFM.Updated');
  assert.equal(await page.evaluate(()=>records[0].password),'unchanged-password');
  assert.equal(await page.evaluate(()=>records[0].role),'EXECUTIVE');
  await page.evaluate(()=>editUser(3));await page.locator('#username').fill('Admin');await page.locator('#btnUpdateUser').click();
  assert.match(await page.evaluate(()=>alerts.at(-1).message),/already exists/);
  assert.equal(await page.evaluate(()=>records[0].username),'AFM.Updated');
  assert.deepEqual(await page.evaluate(()=>getNavigationItems('SUPERVISOR',{dashboard:true,current_stock:true,user_management:true}).map(r=>r.section)),['dashboard','current_stock']);
  assert.equal(await page.locator('#role option[value="SUPERVISOR"]').count(),1);assert.equal(await page.locator('#roleFilter option[value="EXECUTIVE"]').count(),1);
  await page.locator('#profilePhotoButton').click();
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=300;const x=c.getContext('2d');x.fillStyle='#178253';x.fillRect(0,0,400,300);return c.toDataURL('image/png').split(',')[1]});
  await page.locator('#profilePhotoFile').setInputFiles({name:'profile.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.waitForFunction(()=>document.getElementById('profilePhotoMessage').textContent.includes('Preview ready'));
  await page.locator('#profilePhotoSave').click();await page.waitForFunction(()=>document.getElementById('profilePhotoMessage').textContent.includes('saved'));
  assert.equal(await page.locator('#headerProfilePhoto').isVisible(),true);assert.equal(await page.locator('#headerProfilePhoto').evaluate(img=>img.naturalWidth),256);
  assert.equal(await page.evaluate(()=>records[0].profile_photo),null);
  for(const width of [1440,1024,768]){
   await page.setViewportSize({width,height:1100});
   const bounds=await page.locator('#profilePhotoDialog').boundingBox();
   assert.ok(Math.abs(bounds.x+bounds.width/2-width/2)<2);
   assert.ok(bounds.width<=width-24);
  }
  await page.setViewportSize({width:1440,height:1100});
  const art=process.env.ARTIFACT_DIR||'test-results';fs.mkdirSync(art,{recursive:true});await page.screenshot({path:path.join(art,'user-profile-photo.png'),fullPage:true});
  await page.locator('#profilePhotoClose').click();
  await page.evaluate(async()=>{RvrgProfilePhoto.current=null;await RvrgProfilePhoto.attach()});assert.equal(await page.locator('#headerProfilePhoto').isVisible(),true);
  await page.locator('#profilePhotoButton').click();await page.locator('#profilePhotoRemove').click();await page.locator('#profilePhotoSave').click();
  await page.waitForFunction(()=>records.find(r=>r.id===6).profile_photo===null);assert.equal(await page.locator('#headerProfilePhoto').isVisible(),false);
  await page.locator('#profilePhotoClose').click();
  await page.evaluate(async()=>{testUser={id:3,name:'Upender',role:'EXECUTIVE'};await RvrgProfilePhoto.attach()});assert.equal(await page.locator('#headerProfilePhoto').isVisible(),false);
  assert.deepEqual(errors,[]);
  console.log('PASS: password visibility, editable/duplicate usernames, unchanged passwords, new roles, assigned navigation, photo compression/save/load/remove and account isolation. Production requests: 0.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
