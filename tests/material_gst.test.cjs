const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
test('Material Master lists GST-inclusive total and retains the base price',async()=>{
    const nodes=new Map();
    const element=id=>{
        if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:''});
        return nodes.get(id);
    };
    const client={from(table){
        const result={select(){return result},order(){return result},eq(){return result},or(){return result},
            then(resolve,reject){return Promise.resolve({data:table==='departments'?[{id:1,department_name:'Plumbing'}]:[
                {id:388,material_code:'PLB-388',material_name:'Aerator',department_id:1,unit:'Nos',unit_cost:68,gst_type:'EXCLUDED',gst_percentage:18},
                {id:389,material_code:'PLB-389',material_name:'Inclusive item',unit_cost:80.24,gst_type:'INCLUDED',gst_percentage:18}
            ]}).then(resolve,reject)}};
        return result;
    }};
    const context=vm.createContext({window:{supabaseClient:client},getCurrentUser:()=>({id:6}),document:{addEventListener(){},getElementById:element},console});
    for(const file of ['sales-pricing.js','materials.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
    await vm.runInContext('loadMaterialList()',context);
    const html=element('materialTableBody').innerHTML;
    assert.equal((html.match(/₹80\.24/g)||[]).length,3); // both gross prices plus the inclusive item's base
    assert.match(html,/Base: ₹68\.00 · GST 18% excluded/);
    assert.match(html,/Base: ₹80\.24 · GST 18% included/);
});
