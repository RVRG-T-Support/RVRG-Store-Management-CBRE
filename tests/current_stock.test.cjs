const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '..', 'current_stock.js'), 'utf8');

function setup(stockRows, materialRows, materialError = null, purchases = [], purchaseError = null) {
    const elements = new Map();
    const exports = [];
    const alerts = [];
    const queries = [];
    const document = {
        addEventListener() {},
        createElement: () => ({}),
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, {
                innerHTML: '', textContent: '', value: '',
                classList: { add() {}, remove() {} },
                appendChild() {}, addEventListener() {}
            });
            return elements.get(id);
        }
    };
    const context = vm.createContext({
        document,
        console: { log() {}, table() {}, error() {} },
        showAlert: (...args) => alerts.push(args),
        window: { supabaseClient: { from(table) {
            // Deliberately expose only read operations: any write fails the test.
            return { select(columns) {
                queries.push({ table, columns });
                if (table === 'current_stock') return {
                    order: async () => ({ data: stockRows, error: null })
                };
                if (table === 'stock_entry_details') {
                    const query = {
                        in(field, ids) { this.ids = ids.map(String); return this; },
                        gt() { return this; },
                        order(field, options) {
                            assert.equal(field, 'stock_entry_id');
                            assert.equal(options.ascending, false);
                            return this;
                        },
                        async range(start, end) {
                            return { data: purchases
                                .filter(row => this.ids.includes(String(row.material_id)))
                                .sort((a, b) => b.stock_entry_id - a.stock_entry_id)
                                .slice(start, end + 1), error: purchaseError };
                        }
                    };
                    return query;
                }
                assert.equal(table, 'materials');
                return Promise.resolve({ data: materialRows, error: materialError });
            } };
        } } },
        XLSX: {
            utils: {
                json_to_sheet(rows) { exports.push(rows); return {}; },
                book_new: () => ({}), book_append_sheet() {}
            },
            writeFile() {}
        }
    });
    vm.runInContext(source, context);
    return {
        run: code => vm.runInContext(code, context),
        element: id => document.getElementById(id),
        exports, alerts, queries
    };
}

const stock = (id, cost, quantity = 6) => ({
    material_id: id, material_code: `HKP-${id}`, material_name: `Item ${id}`,
    department_name: 'Housekeeping', unit: 'CANS', unit_cost: cost,
    current_stock: quantity, minimum_stock: 2
});

test('zero stock-view cost falls back to Material Master in table, totals and export', async () => {
    const app = setup([stock(1, 0)], [{ id: 1, unit_cost: '125.50', category: 'Cleaning' }]);
    await app.run('loadCurrentStock()');
    assert.match(app.queries.find(q => q.table === 'materials').columns, /unit_cost/);
    assert.match(app.element('stockTableBody').innerHTML, /₹125\.50/);
    assert.match(app.element('stockTableBody').innerHTML, /₹753\.00/);
    assert.match(app.element('stockTableBody').innerHTML, /Cleaning/);
    assert.equal(app.element('totalInventoryValue').textContent, '₹753.00');
    assert.equal(app.element('footerInventoryValue').textContent, '₹753.00');
    assert.equal(app.element('totalQuantity').textContent, '6.00');
    app.run('exportCurrentStock()');
    assert.equal(app.exports[0][0]['Unit Cost'], 125.5);
    assert.equal(app.exports[0][0]['Stock Value'], 753);
    assert.equal(app.exports[0][1]['Stock Value'], 753);
});

test('valid stock cost keeps priority; missing/invalid costs fall back safely', async () => {
    const costs = [90, null, '', 'invalid', -1, Infinity, 0];
    const app = setup(costs.map((cost, i) => stock(i + 1, cost)),
        costs.slice(0, -1).map((_, i) => ({ id: i + 1, unit_cost: 125 })));
    await app.run('loadCurrentStock()');
    const actual = JSON.parse(app.run('JSON.stringify(stockData.map(row => row.unit_cost))'));
    assert.deepEqual(actual, [90, 125, 125, 125, 125, 125, 0]);
    assert.doesNotMatch(app.element('stockTableBody').innerHTML, /NaN|Infinity/);
});

test('falls back by normalized material code when ID lookup is unavailable', async () => {
    const app = setup([{ ...stock(99, 0), material_code: ' hkp-1 ' }],
        [{ id: 1, material_code: 'HKP-1', unit_cost: 200 }]);
    await app.run('loadCurrentStock()');
    assert.equal(app.run('stockData[0].unit_cost'), 200);
    assert.equal(app.element('totalInventoryValue').textContent, '₹1,200.00');
});

test('filters and export retain corrected costs without changing stock quantities', async () => {
    const app = setup([stock(1, 0), { ...stock(2, 50, 1), department_name: 'Engineering' }],
        [{ id: 1, unit_cost: 125.5 }, { id: 2, unit_cost: 99 }]);
    await app.run('loadCurrentStock()');
    assert.equal(app.element('totalInventoryValue').textContent, '₹803.00');
    app.element('stockDepartment').value = 'Engineering';
    app.run('applyStockFilters(); exportCurrentStock()');
    assert.equal(app.element('stockRecordCount').textContent, '1 Records');
    assert.equal(app.element('totalInventoryValue').textContent, '₹50.00');
    assert.equal(app.exports[0][0]['Unit Cost'], 50);
    assert.equal(app.exports[0][0]['Current Stock'], 1);
    app.run('clearStockFilters()');
    assert.equal(app.element('stockRecordCount').textContent, '2 Records');
    assert.equal(app.element('totalInventoryValue').textContent, '₹803.00');
});

test('empty results and backend failures preserve the existing error handling', async () => {
    const empty = setup([], []);
    await empty.run('loadCurrentStock()');
    assert.equal(empty.element('stockRecordCount').textContent, '0 Records');
    assert.equal(empty.element('totalInventoryValue').textContent, '₹0.00');
    const failed = setup([stock(1, 0)], null, { message: 'Access denied' });
    await failed.run('loadCurrentStock()');
    assert.match(failed.element('stockTableBody').innerHTML, /Failed to load current stock/);
    assert.match(failed.alerts[0][0], /Access denied/);
});

test('PDF exports filtered rows, corrected costs and matching totals', async () => {
    const app = setup([stock(1, 0), { ...stock(2, 50), department_name: 'Engineering' }],
        [{ id: 1, unit_cost: 125.5 }]);
    await app.run('loadCurrentStock()');
    app.element('stockDepartment').value = 'Housekeeping';
    app.element('stockStatus').selectedOptions = [{ textContent: 'All Stock' }];
    app.run(`
        var pdfResult = {};
        window.jspdf = { jsPDF: function(options) {
            pdfResult.options = options;
            this.setFontSize = () => {};
            this.text = () => {};
            this.autoTable = table => { pdfResult.table = table; };
            this.save = filename => { pdfResult.filename = filename; };
        } };
        applyStockFilters();
        exportCurrentStockPdf();
    `);
    const result = JSON.parse(app.run('JSON.stringify(pdfResult)'));
    assert.equal(result.options.orientation, 'landscape');
    assert.equal(result.filename, 'RVRG_Current_Stock.pdf');
    assert.equal(result.table.body.length, 1);
    assert.equal(result.table.body[0][4], '125.50');
    assert.equal(result.table.body[0][7], '753.00');
    assert.equal(result.table.foot[0][5], '6.00');
    assert.equal(result.table.foot[0][7], '753.00');
});

test('PDF handles empty data, missing libraries and generation errors', async () => {
    const empty = setup([], []);
    empty.run('exportCurrentStockPdf()');
    assert.match(empty.alerts[0][0], /no stock data/);
    const app = setup([stock(1, 10)], []);
    await app.run('loadCurrentStock()');
    app.run('exportCurrentStockPdf()');
    assert.match(app.alerts[0][0], /PDF library is not loaded/);
    app.run('window.jspdf = { jsPDF: function() {} }; exportCurrentStockPdf()');
    assert.match(app.alerts[1][0], /PDF table library is not loaded/);
});


test('uses newest recorded purchase only when stock and master costs are missing', async () => {
    const app = setup([stock(1, 0), stock(2, 30), stock(3, 0), stock(4, 0)],
        [{ id: 1, unit_cost: 0 }, { id: 3, unit_cost: 40 }], null, [
            { material_id: 1, purchase_price: 100, stock_entry_id: 1 },
            { material_id: 1, purchase_price: '125.50', stock_entry_id: 2 },
            { material_id: 2, purchase_price: 999, stock_entry_id: 3 },
            { material_id: 3, purchase_price: 999, stock_entry_id: 3 }
        ]);
    await app.run('loadCurrentStock()');
    assert.deepEqual(JSON.parse(app.run('JSON.stringify(stockData.map(row => row.unit_cost))')),
        [125.5, 30, 40, 0]);
    assert.equal(app.element('totalInventoryValue').textContent, '₹1,173.00');
    app.run('exportCurrentStock()');
    assert.equal(app.exports[0][0]['Unit Cost'], 125.5);
    assert.equal(app.exports[0][0]['Stock Value'], 753);
    assert.equal(app.exports[0][4]['Stock Value'], 1173);
});

test('skips purchase lookup when all existing costs are available', async () => {
    const app = setup([stock(1, 30)], []);
    await app.run('loadCurrentStock()');
    assert.equal(app.queries.some(q => q.table === 'stock_entry_details'), false);
});

test('purchase read failure keeps stock visible and warns about incomplete valuation', async () => {
    const app = setup([stock(1, 0)], [], null, [], { message: 'Permission denied' });
    await app.run('loadCurrentStock()');
    assert.equal(app.element('stockRecordCount').textContent, '1 Records');
    assert.match(app.alerts[0][0], /Inventory values may be incomplete.*Permission denied/);
});

test('paginates purchase history to find an older price for another material', async () => {
    const history = Array.from({ length: 1000 }, (_, i) => ({
        material_id: 1, purchase_price: 10, stock_entry_id: i + 2
    }));
    history.push({ material_id: 2, purchase_price: 20, stock_entry_id: 1 });
    const app = setup([stock(1, 0), stock(2, 0)], [], null, history);
    await app.run('loadCurrentStock()');
    assert.equal(app.run('stockData[1].unit_cost'), 20);
    assert.equal(app.element('totalInventoryValue').textContent, '₹180.00');
});

test('dashboard reorder filter includes low and zero stock, excludes healthy stock, and survives refresh', async () => {
    const app = setup([stock(1, 10, 0),stock(2, 10, 1),stock(3, 10, 10)], []);
    app.element('stockStatus').value = 'REORDER';
    await app.run('loadCurrentStock()');
    assert.equal(app.element('stockRecordCount').textContent, '2 Records');
    await app.run('loadCurrentStock()');
    assert.equal(app.element('stockRecordCount').textContent, '2 Records');
});
