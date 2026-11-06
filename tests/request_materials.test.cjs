const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','material_request.js'),'utf8');
const material=(id,stock=5)=>({id, material_code:`CIV-${id}`, material_name:'Hose Clamp',category:'Nut & Bolt',brand:'Acme',item_type:'Spare',item_size:'3 Inch',specification:'SS 304',unit:'Nos',current_stock:stock});
function setup(materials=[material(1)], stockRows=[{material_id:1,current_stock:5}], fail=false){
 const nodes=new Map(), alerts=[], queries=[];
 const node=()=>{const n={innerHTML:'',value:'',dataset:{},style:{},children:[],className:'',listeners:{},appendChild(x){this.children.push(x)},setAttribute(k,v){this[k]=v},addEventListener(k,v){this.listeners[k]=v},focus(){}};n.classList={add(value){n.className+=' '+value}};return n};
 const element=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)};
 const context=vm.createContext({
  document:{getElementById:element,createElement:node,addEventListener(){},querySelector(){return null}},
  window:{location:{replace(){}}},getCurrentUser:()=>({id:6}),checkUserAccess:()=>true,
  showAlert:(...args)=>alerts.push(args),console:{error(){},warn(){}},
  supabase:{from(table){queries.push(table);const q={select(){return q},eq(){return q},in(){return q},order(){return q},range:async(start,end)=>({data:stockRows.slice(start,end+1),error:fail?new Error('Read denied'):null}),then(resolve,reject){return Promise.resolve({data:materials,error:null}).then(resolve,reject)}};return q}}
 });
 vm.runInContext(source,context);context.window.currentMaterials=materials;
 vm.runInContext('renderRequestItems = () => {};',context);
 return {run:code=>vm.runInContext(code,context),element,alerts,queries,window:context.window};
}

test('material loading attaches stock and category; a missing stock row has no stock',async()=>{
 const app=setup([material(1),material(2)]);
 await app.run('loadMaterials(1)');
 assert.equal(app.window.currentMaterials[0].current_stock,5);
 assert.equal(app.window.currentMaterials[0].category,'Nut & Bolt');
 assert.equal(app.window.currentMaterials[1].current_stock,0);
});

test('multi-term search covers code, name, category, brand, type, size and specification',()=>{
 for(const text of ['civ-1','hose clamp','nut bolt','acme','spare','3 inch','ss 304','acme 3 spare']){
  const app=setup();const input={dataset:{itemId:'1'},value:text};app.window.input=input;
  app.run('handleRequestItemSearch(window.input)');
  assert.equal(app.element('materialSearchResults-1').children.length,1,text);
 }
 const empty=setup();empty.window.input={dataset:{itemId:'1'},value:'not-a-match'};
 empty.run('handleRequestItemSearch(window.input)');
 assert.match(empty.element('materialSearchResults-1').innerHTML,/No matching/);
});

test('options show full details and stock, with zero and negative stock red and disabled',()=>{
 const app=setup([material(1),material(2,0),material(3,-1)]);
 app.run('renderMaterialSearchResults(1, window.currentMaterials)');
 const buttons=app.element('materialSearchResults-1').children;
 assert.equal(buttons[0].disabled,false);
 for(const value of ['Hose Clamp','Nut &amp; Bolt','Acme','Spare','3 Inch','SS 304','Stock: 5 Nos'])assert.ok(buttons[0].innerHTML.includes(value),value);
 for(const button of buttons.slice(1)){
  assert.equal(button.disabled,true);assert.match(button.className,/text-danger/);
  assert.match(button.innerHTML,/OUT OF STOCK/);assert.equal(button.listeners.click,undefined);
 }
});

test('out-of-stock items cannot be selected programmatically; available items can',()=>{
 const app=setup([material(1),material(2,0)]);
 app.run('selectRequestMaterial(1,2)');assert.equal(app.window.requestItems[0].materialId,'');
 assert.match(app.alerts[0][0],/out of stock/);
 app.run('selectRequestMaterial(1,1)');assert.equal(app.window.requestItems[0].materialId,'1');
});

test('duplicate material stays disabled even when in stock',()=>{
 const app=setup();app.window.requestItems.push({id:2,materialId:'1'});
 app.run('renderMaterialSearchResults(1, window.currentMaterials)');
 assert.equal(app.element('materialSearchResults-1').children[0].disabled,true);
});

test('submission rechecks stock and refuses an item that ran out after selection',async()=>{
 const app=setup([material(1)], [{material_id:1,current_stock:0}]);
 app.window.requestItems[0].materialId='1';app.window.requestItems[0].quantity=1;
 await app.run('submitMaterialRequest({preventDefault(){}})');
 assert.match(app.alerts[0][0],/out of stock/);
 assert.deepEqual(app.queries,['current_stock']);
});

test('stock lookup failures clear choices and prevent submission',async()=>{
 const app=setup([material(1)],[],true);await app.run('loadMaterials(1)');
 assert.equal(app.window.currentMaterials.length,0);assert.match(app.alerts[0][0],/Unable to load/);
 const submit=setup([material(1)],[],true);submit.window.requestItems[0].materialId='1';submit.window.requestItems[0].quantity=1;
 await submit.run('submitMaterialRequest({preventDefault(){}})');
 assert.match(submit.alerts[0][0],/Unable to verify/);assert.deepEqual(submit.queries,['current_stock']);
});

test('material detail text is escaped and includes category and stock',()=>{
 const app=setup([{...material(1),brand:'<img src=x onerror=alert(1)>'}]);
 app.run('renderMaterialSearchResults(1,window.currentMaterials)');
 assert.doesNotMatch(app.element('materialSearchResults-1').children[0].innerHTML,/<img/);
 const details=app.run('buildMaterialDetails(1)');assert.match(details,/Available Stock/);assert.match(details,/Stock: 5 Nos/);
});
