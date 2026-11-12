const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'stock_entry.js'), 'utf8');

function setup(items, failure = '') {
    const calls = [], alerts = [];
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, {
            value: '', innerHTML: '', innerText: '', dataset: {}, reset() { this.resetCalled = true; }
        });
        return elements.get(id);
    };
    const values = {
        vendorName: 'Sample Vendor', vendorNumber: '12345', invoiceNo: 'TEST-INVOICE',
        invoiceDate: '2026-11-02', transportationCost: '0', roundOff: '0', billedAmount: '885'
    };
    for (const [id, value] of Object.entries(values)) element(id).value = value;
    items.forEach((item, index) => {
        for (const [field, value] of Object.entries(item)) element(`${field}-${index + 1}`).value = String(value);
    });
    const context = vm.createContext({
        document: {
            addEventListener() {}, getElementById: element,
            querySelectorAll: () => items.map((_, i) => ({ id: `row-${i + 1}` }))
        },
        crypto: require('node:crypto').webcrypto,
        getCurrentUser: () => ({ id: 123 }),
        window: { location: { replace() {} } },
        console: { error() {} },
        showAlert: (message, type) => alerts.push({ message, type }),
        supabase: { from(table) {
            if (table === 'material_sales_prices') return { select: () => ({ limit: async () => ({
                error: failure === 'missing-schema' ? { code: 'PGRST205', message: 'Missing sales pricing table' } : null
            }) }) };
            return {
            insert(rows) {
                calls.push({ table, action: 'insert', rows });
                if (table === 'stock_entry_header') return { select: async () => ({ data: [{ id: 42 }], error: null }) };
                if (table === 'stock_entry_details') return { select: async () => ({
                    data: rows.map(row => ({ ...row,
                        purchase_price: failure === 'missing-price' ? null : row.purchase_price,
                        sales_price: failure === 'missing-sales' ? null : row.sales_price,
                        line_total: failure === 'missing-total' ? 0 : row.line_total
                    })),
                    error: failure === table ? { message: 'Insert denied' } : null
                }) };
                return Promise.resolve({ error: failure === table ? { message: 'Insert denied' } : null });
            },
            update(values) { return { eq(field, id) {
                calls.push({ table, action: 'update', values, field, id });
                if (table === 'stock_entry_header') return Promise.resolve({ error: null });
                assert.equal(table, 'materials');
                return { select: async () => ({
                    data: failure === 'silent-material' ? [] : [{ id }],
                    error: failure === 'materials' ? { message: 'Update denied' } : null
                }) };
            } }; }
        }; } }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'sales-pricing.js'), 'utf8'), context);
    vm.runInContext(source, context);
    vm.runInContext('confirmModalInstance = { hide() {} }; addRow = () => {};', context);
    return { calls, alerts, element, evaluate: code => vm.runInContext(code, context),
        run: () => vm.runInContext('saveStockEntry()', context) };
}
const item = { material: 1, qty: 6, price: 125.5, gst: 18 };

test('save persists invoice price and GST total, then synchronizes master cost', async () => {
    const app = setup([item]);
    await app.run();
    const details = app.calls.find(c => c.table === 'stock_entry_details');
    assert.equal(details.rows[0].purchase_price, 125.5);
    assert.equal(details.rows[0].quantity, 6);
    assert.equal(details.rows[0].line_total, 888.54);
    assert.equal(details.rows[0].stock_entry_id, 42);
    const master = app.calls.find(c => c.table === 'materials');
    assert.equal(master.values.unit_cost, 125.5);
    assert.equal(master.id, 1);
    assert.ok(app.calls.indexOf(master) > app.calls.findIndex(c => c.table === 'stock_ledger'));
    assert.equal(app.element('stockEntryForm').resetCalled, true);
    assert.equal(app.alerts.filter(a => a.type === 'warning').length, 0);
});

test('multiple material prices update their matching master records', async () => {
    const app = setup([item, { material: 2, qty: 10, price: 100, gst: 0 }]);
    await app.run();
    const updates = app.calls.filter(c => c.table === 'materials');
    assert.deepEqual(updates.map(c => [c.id, c.values.unit_cost]), [[1, 125.5], [2, 100]]);
});

test('invalid prices, quantities, duplicate materials and empty invoices write nothing', async () => {
    for (const items of [
        [], [{ ...item, price: '' }], [{ ...item, price: 'Infinity' }],
        [{ ...item, qty: 'NaN' }], [{ ...item, price: '12abc' }],
        [{ ...item, gst: 'Infinity' }], [{ ...item, gst: -1 }], [{ ...item, qty: 0 }], [{ ...item, price: -1 }],
        [{ ...item, material: 'invalid' }], [item, item]
    ]) {
        const app = setup(items);
        await app.run();
        assert.equal(app.calls.length, 0);
        assert.equal(app.alerts[0].type, 'error');
        assert.equal(app.element('btnConfirmSave').disabled, false);
    }
});

test('failed detail or ledger writes never update Material Master costs', async () => {
    for (const table of ['stock_entry_details', 'stock_ledger']) {
        const app = setup([item], table);
        await app.run();
        assert.equal(app.calls.some(c => c.table === 'materials'), false);
        assert.equal(app.alerts[0].type, 'error');
        assert.notEqual(app.element('stockEntryForm').resetCalled, true);
    }
});

test('denied or unconfirmed cost updates warn that invoice is saved and must not be re-entered', async () => {
    for (const failure of ['materials', 'silent-material']) {
        const app = setup([item], failure);
        await app.run();
        const warning = app.alerts.find(a => a.type === 'warning');
        assert.match(warning.message, /was saved.*could not be updated/);
        assert.match(warning.message, /Do not re-enter this invoice/);
        assert.equal(app.element('stockEntryForm').resetCalled, true);
    }
});


test('missing stored price or total prevents success and stock movement', async () => {
    for (const failure of ['missing-price', 'missing-total']) {
        const app = setup([item], failure);
        await app.run();
        assert.equal(app.calls.some(c => c.table === 'stock_ledger'), false);
        assert.equal(app.calls.some(c => c.table === 'materials'), false);
        assert.equal(app.alerts.some(a => a.type === 'success'), false);
        assert.match(app.alerts[0].message, /prices or totals could not be confirmed/);
        assert.match(app.alerts[0].message, /partially saved.*Do not re-enter/);
    }
});

test('a repeated click while saving cannot create a second invoice', async () => {
    const app = setup([item]);
    await Promise.all([app.run(), app.run()]);
    assert.equal(app.calls.filter(c => c.table === 'stock_entry_header' && c.action === 'insert').length, 1);
});


test('cash bill without invoice number saves a generated reference and amounts', async () => {
    const app = setup([{ material: 1, qty: 2, price: 45, gst: 0 }]);
    app.element('isCashBill').checked = true;
    app.element('invoiceNo').value = '';
    await app.run();
    const header = app.calls.find(c => c.table === 'stock_entry_header' && c.action === 'insert');
    assert.match(header.rows[0].invoice_no, /^CASH-PENDING-/);
    const update = app.calls.find(c => c.table === 'stock_entry_header' && c.action === 'update');
    assert.equal(update.values.invoice_no, `CASH-${update.values.stock_entry_no}`);
    const ledger = app.calls.find(c => c.table === 'stock_ledger');
    assert.equal(ledger.rows[0].reference_no, update.values.invoice_no);
    const details = app.calls.find(c => c.table === 'stock_entry_details');
    assert.equal(details.rows[0].purchase_price, 45);
    assert.equal(details.rows[0].line_total, 90);
    assert.equal(app.calls.find(c => c.table === 'materials').values.unit_cost, 45);
    assert.match(app.alerts.find(a => a.type === 'success').message, /Cash Bill Reference : CASH-STE-/);
});

test('regular invoice still requires and preserves vendor invoice number', async () => {
    const missing = setup([item]);
    missing.element('invoiceNo').value = '   ';
    await missing.run();
    assert.equal(missing.calls.length, 0);
    assert.match(missing.alerts[0].message, /vendor invoice number/);
    const app = setup([item]);
    await app.run();
    assert.equal(app.calls.find(c => c.table === 'stock_entry_header').rows[0].invoice_no, 'TEST-INVOICE');
    assert.equal(app.calls.find(c => c.table === 'stock_ledger').rows[0].reference_no, 'TEST-INVOICE');
});

test('cash toggle removes invoice requirement and restores it without losing typed text', () => {
    const app = setup([item]);
    app.element('isCashBill').checked = true;
    app.evaluate('updateInvoiceRequirement()');
    assert.equal(app.element('invoiceNo').required, false);
    assert.equal(app.element('invoiceNo').disabled, true);
    app.element('isCashBill').checked = false;
    app.evaluate('updateInvoiceRequirement()');
    assert.equal(app.element('invoiceNo').required, true);
    assert.equal(app.element('invoiceNo').disabled, false);
    assert.equal(app.element('invoiceNo').value, 'TEST-INVOICE');
});


test('secure stock entry preserves the pre-GST price meaning for approval valuation', async () => {
    const app = setup([item]);
    app.evaluate('window.RvrgSecure = { enabled: () => true };');
    await app.run();
    const master = app.calls.find(c => c.table === 'materials');
    assert.equal(master.values.unit_cost, 125.5);
    assert.equal(master.values.gst_type, 'EXCLUDED');
    assert.equal(master.values.gst_percentage, 18);
});


test('separate sales override is saved without changing purchase or invoice totals', async () => {
    const app = setup([{ ...item, sales: 150 }]);
    await app.run();
    const detail = app.calls.find(c => c.table === 'stock_entry_details').rows[0];
    assert.equal(detail.sales_price, 150);
    assert.equal(detail.purchase_price, 125.5);
    assert.equal(detail.line_total, 888.54);
    assert.equal(app.calls.find(c => c.table === 'materials').values.unit_cost, 125.5);
});
test('sales defaults to purchase and invalid manual values write no invoice', async () => {
    const app = setup([item]);
    await app.run();
    assert.equal(app.calls.find(c => c.table === 'stock_entry_details').rows[0].sales_price, 125.5);
    for (const sales of [0, -1, 'NaN', 'Infinity', '12abc']) {
        const invalid = setup([{ ...item, sales }]);
        await invalid.run();
        assert.equal(invalid.calls.length, 0);
        assert.match(invalid.alerts[0].message, /Sales price/);
    }
});
test('missing migration writes nothing; missing saved sales price prevents stock movement', async () => {
    const missing = setup([item], 'missing-schema');
    await missing.run();
    assert.equal(missing.calls.length, 0);
    assert.match(missing.alerts[0].message, /20261112_sales_pricing.sql/);
    const altered = setup([item], 'missing-sales');
    await altered.run();
    assert.equal(altered.calls.some(c => c.table === 'stock_ledger'), false);
    assert.equal(altered.alerts.some(a => a.type === 'success'), false);
});
