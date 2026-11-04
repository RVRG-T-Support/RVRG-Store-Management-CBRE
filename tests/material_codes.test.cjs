const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'materials.js'), 'utf8');

function setup(rows = [], failAt = -1) {
    const elements = new Map(), alerts = [], pages = [];
    const element = id => {
        if (!elements.has(id)) elements.set(id, { value: '', addEventListener() {}, dataset: {} });
        return elements.get(id);
    };
    element('department').value = '1';
    element('department').selectedIndex = 1;
    element('department').options = [{}, { dataset: { prefix: 'CIV' } }];
    element('materialName').value = 'SS Hose Clamp';
    element('materialShortName').value = 'NUTBOL';
    const context = vm.createContext({
        window: { supabaseClient: { from(table) {
            assert.equal(table, 'materials');
            // Generation is read-only: no insert/update/delete methods exist.
            return { select() { return { order() { return { range: async (start, end) => {
                pages.push(start);
                return start === failAt ? { error: { message: 'Read denied' } }
                    : { data: rows.slice(start, end + 1), error: null };
            } }; } }; } };
        } } },
        document: { addEventListener() {}, getElementById: element },
        getCurrentUser: () => ({ id: 1 }),
        showAlert: (...args) => alerts.push(args),
        console: { error() {}, log() {} }
    });
    vm.runInContext(source, context);
    return { run: code => vm.runInContext(code, context), element, alerts, pages, rows };
}
const civil = (material_code, id = 1) => ({ id, material_code, department_id: 1 });

test('83 existing department items produce CIV-084 from the real Generate handler', async () => {
    const app = setup(Array.from({ length: 83 }, (_, i) => civil(i ? `CIV-${String(i).padStart(3, '0')}` : 'CIV', i + 1)));
    await app.run('generateMaterialCode()');
    assert.equal(app.element('materialCode').value, 'CIV-084');
    assert.equal(app.alerts.length, 0);
});

test('legacy bare, 2-digit, 3-digit and category codes all count without renaming', async () => {
    const rows = [civil('CIV'), civil('CIV-01', 2), civil('CIV-001', 3), civil('CIV-NUTBOL', 4)];
    const before = JSON.stringify(rows);
    const app = setup(rows);
    assert.equal(await app.run('generateImportMaterialCode("CIV", 1)'), 'CIV-005');
    assert.equal(JSON.stringify(rows), before);
});

test('highest serial takes priority over count, including old two-digit serials', async () => {
    const app = setup([civil('CIV-99')]);
    assert.equal(await app.run('generateImportMaterialCode("CIV", 1)'), 'CIV-100');
    app.rows.push(civil('CIV-200', 2));
    assert.equal(await app.run('generateImportMaterialCode("CIV", 1)'), 'CIV-201');
});

test('department counts stay independent and include inactive materials', async () => {
    const app = setup([civil('CIV'), { ...civil('CIV-001', 2), is_active: false },
        { id: 3, material_code: 'HKP-250', department_id: 2 }]);
    assert.equal(await app.run('generateImportMaterialCode("CIV", 1)'), 'CIV-003');
    assert.equal(await app.run('generateImportMaterialCode("HKP", 2)'), 'HKP-251');
    assert.equal(await app.run('generateImportMaterialCode("ELE", 3)'), 'ELE-001');
});

test('reads beyond first 1000 materials instead of restarting numbering', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, material_code: `HKP-${i}`, department_id: 2 }));
    rows.push(civil('CIV-250', 1001));
    const app = setup(rows);
    assert.equal(await app.run('generateImportMaterialCode("CIV", 1)'), 'CIV-251');
    assert.deepEqual(app.pages, [0, 1000]);
});

test('read errors and serial limits never yield a guessed code', async () => {
    const failed = setup([], 0);
    await failed.run('generateMaterialCode()');
    assert.equal(failed.element('materialCode').value, '');
    assert.match(failed.alerts[0][0], /Read denied/);
    const exhausted = setup([civil('CIV-999')]);
    await assert.rejects(exhausted.run('generateImportMaterialCode("CIV", 1)'), /limit reached/);
});

test('editing guards keep existing material codes unchanged', async () => {
    const app = setup([civil('CIV-001')]);
    app.element('materialId').value = '123';
    app.element('materialCode').value = 'CIV-NUTBOL';
    await app.run('generateMaterialCode()');
    assert.equal(app.element('materialCode').value, 'CIV-NUTBOL');
    assert.equal(app.pages.length, 0);
});

test('shared import rule advances across a batch and handles punctuation in prefixes', async () => {
    const app = setup([civil('CIV')]);
    app.run('var batch = [{ material_code: "A.B-09", department_id: 4 }];');
    assert.equal(app.run('formatSerialMaterialCode("A.B", nextMaterialSerial(batch, "A.B", 4))'), 'A.B-010');
    app.run('batch.push({material_code:"A.B-010", department_id:4})');
    assert.equal(app.run('formatSerialMaterialCode("A.B", nextMaterialSerial(batch, "A.B", 4))'), 'A.B-011');
});
