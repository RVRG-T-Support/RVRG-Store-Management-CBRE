const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function pricing() {
    const context = vm.createContext({ window: {} });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../sales-pricing.js'), 'utf8'), context);
    return context.window.RvrgSales;
}
test('sales adds invoice GST once, keeps inclusive rates intact and preserves purchase fallback', () => {
    const sales = pricing(), material = { id: 1, unit_cost: 100 };
    assert.equal(sales.unit(material), 100);
    sales.prices.set('1', { sales_price: '120', gst_type: 'EXCLUDED', gst_percentage: '18' });
    assert.equal(sales.unit(material), 141.6);
    assert.equal(material.unit_cost, 100);
    sales.prices.set('1', { sales_price: '141.60', gst_type: 'INCLUDED', gst_percentage: 18 });
    assert.equal(sales.unit(material), 141.6);
    sales.prices.set('1', { sales_price: 120, gst_type: 'EXCLUDED', gst_percentage: 0 });
    assert.equal(sales.unit(material), 120);
    sales.prices.set('1', { sales_price: 0, gst_type: 'EXCLUDED', gst_percentage: 18 });
    assert.equal(sales.unit(material), 0);
});
test('pricing batches loads, replaces stale rates and fails visibly on access errors', async () => {
    const sales = pricing(), calls = [];
    const client = { from() { return { select() { return { async in(field, ids) {
        calls.push(ids); return { data: ids.map(id => ({ material_id: id, sales_price: 50, gst_type: 'EXCLUDED', gst_percentage: 18 })) };
    } }; } }; } };
    await sales.load(client, Array.from({length: 205}, (_, i) => i + 1));
    assert.equal(calls.length, 3);
    assert.equal(sales.unit({}, 205), 59);
    const denied = { from() { return { select() { return { in: async () => ({ error: { code:'42501', message:'Denied' } }) }; } }; } };
    await assert.rejects(() => sales.load(denied, [1]), { message:'Denied' });
});
