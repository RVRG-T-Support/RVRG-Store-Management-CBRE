const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const XLSX=require('xlsx-js-style');
const material=(id)=>({id,material_code:`PLB-${id}`,material_name:'Aerator',unit:'Nos',gst_percentage:18,departments:{department_name:'Plumbing'}});
function setup(){
    const nodes=new Map(),alerts=[],imported=[];let workbook,buffer;
    const element=id=>{if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',files:[]});return nodes.get(id)};
    const context=vm.createContext({
        window:{},getCurrentUser:()=>({id:6}),console,
        showAlert:(message,type)=>alerts.push({message,type}),
        document:{addEventListener(){},getElementById:element,querySelectorAll:()=>imported.map(m=>({value:m.Material_ID}))},
        XLSX:{...XLSX,writeFile(wb){workbook=wb;buffer=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});}},
        FileReader:class{readAsBinaryString(file){this.onload({target:{result:file.toString('binary')}})}}
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../stock_entry.js'),'utf8'),context);
    const run=code=>vm.runInContext(code,context);
    run(`materialsData=${JSON.stringify([material(388),material(389)])};`);
    context.captureRow=row=>imported.push(row);
    run('addRow=captureRow;calculateGrandTotal=()=>{};');
    return{run,alerts,imported,get workbook(){return workbook},get buffer(){return buffer},upload(wb){
        element('excelUpload').files=[XLSX.write(wb,{type:'buffer',bookType:'xlsx'})];run('processExcelUpload()');
    }};
}
test('styled Excel template roundtrips widths, filters, purchase formulas and instructions',()=>{
    const app=setup();app.run('downloadExcelTemplate()');
    const wb=XLSX.read(app.buffer,{type:'buffer',cellStyles:true});const ws=wb.Sheets.Stock_Entry;
    assert.deepEqual(wb.SheetNames,['Stock_Entry','Instructions']);
    assert.equal(ws.A2.v,'Plumbing');assert.equal(ws.B2.v,'PLB-388');
    assert.equal(ws.F1.v,'Purchased Amount');assert.equal(ws.G1.v,'Purchased GST %');
    assert.equal(ws.J1.v,'Sales Amount');assert.equal(ws.K2.v,'INCLUDED');
    assert.equal(ws['!cols'].length,11);
    assert.ok(ws['!cols'][10].wch>=20);
    assert.equal(ws['!autofilter'].ref,'A1:K3');
    assert.match(ws.H2.f,/D2\*F2\*G2\/100/);assert.match(ws.I2.f,/D2\*F2\+H2/);
    assert.equal(ws.A1.s.fgColor.rgb,'143D52');
    assert.equal(ws.F2.s.fgColor.rgb,'FFF3CD');
    assert.equal(ws.H2.s.fgColor.rgb,'F0F5F9');
});
test('new template uploads only completed catalogue rows and recalculates rather than trusting totals',()=>{
    const app=setup();app.run('downloadExcelTemplate()');const wb=app.workbook,ws=wb.Sheets.Stock_Entry;
    ws.D2={t:'n',v:2};ws.F2={t:'n',v:68};ws.J2={t:'n',v:100};ws.H2={t:'n',v:999};ws.I2={t:'n',v:999};
    app.upload(wb);
    assert.equal(app.imported.length,1);const row=app.imported[0];
    assert.equal(row.Material_ID,388);assert.equal(row.Quantity,2);assert.equal(row.Unit_Price,68);
    assert.equal(row.Sales_Price,100);assert.equal(row.GST_Percentage,18);assert.equal(row.Sales_GST_Type,'INCLUDED');
    assert.equal(app.alerts.at(-1).type,'success');
});
test('legacy Unit Price, GST % and Sales Price templates remain compatible',()=>{
    const app=setup();const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{'Material Code':'PLB-388',Quantity:2,'Unit Price':68,'GST %':5,'Sales Price':100,'Sales GST Type':'EXCLUDED'}]),'Old_Template');
    app.upload(wb);assert.equal(app.imported.length,1);
    assert.equal(app.imported[0].Unit_Price,68);assert.equal(app.imported[0].GST_Percentage,5);assert.equal(app.imported[0].Sales_GST_Type,'EXCLUDED');
});
test('invalid entered prices are rejected rather than silently accepting a numeric prefix',()=>{
    const app=setup();const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{'Material Code':'PLB-388',Quantity:2,'Purchased Amount':'68abc'}]),'Stock_Entry');
    app.upload(wb);assert.equal(app.imported.length,0);assert.equal(app.alerts.at(-1).type,'error');
});
