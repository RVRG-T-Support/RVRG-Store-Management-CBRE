const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
process.chdir(path.join(__dirname, '../..'));
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/*', route => route.abort());
        const html = fs.readFileSync('stock_entry.html', 'utf8')
            .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<link\b[^>]*>/gi, tag => {
                if (tag.includes('bootstrap')) return process.env.BOOTSTRAP_CSS ? '<style>' + fs.readFileSync(process.env.BOOTSTRAP_CSS, 'utf8') + '</style>' : '';
                const href = tag.match(/href="([^"]+)"/)?.[1];
                return href && fs.existsSync(href) ? '<style>' + fs.readFileSync(href, 'utf8') + '</style>' : '';
            });
        await page.setContent(html);
        await page.evaluate(() => {
            window.getCurrentUser = () => ({ id: 6 });
            window.formatCurrency = value => '₹' + Number(value).toFixed(2);
            window.showAlert = (message, type) => (window.alerts ||= []).push({ message, type });
            window.writes = [];
            window.supabase = { from(table) { return {
                select: () => ({ limit: async () => ({ error: null }) }),
                insert(rows) {
                    window.writes.push({ table, rows });
                    if (table === 'stock_entry_header') return { select: async () => ({ data: [{ id: 42 }] }) };
                    if (table === 'stock_entry_details') return { select: async () => ({ data: rows }) };
                    return Promise.resolve({});
                },
                update(values) { return { eq(field, id) {
                    window.writes.push({ table, values, id });
                    return table === 'materials' ? { select: async () => ({ data: [{ id }] }) } : Promise.resolve({});
                } }; }
            }; } };
        });
        await page.addScriptTag({ content: fs.readFileSync('sales-pricing.js', 'utf8') });
        await page.addScriptTag({ content: fs.readFileSync('stock_entry.js', 'utf8') });
        await page.evaluate(() => {
            materialsData = [{ id: 1, material_code: 'TEST-001', material_name: 'Hose Clamp', unit: 'Nos', unit_cost: 68, gst_type: 'EXCLUDED', gst_percentage: 18, departments: {department_name:'Civil'} }];
            confirmModalInstance = { hide() {}, show() {} };
            addRow();
            selectMaterial(1, materialsData[0]);
        });
        assert.equal(await page.locator('#price-1').inputValue(), '68.00');
        assert.equal(await page.locator('#sales-1').inputValue(), '80.24');
        await page.locator('#qty-1').fill('1');
        assert.match(await page.locator('#total-1').textContent(), /80.24/);
        assert.match(await page.locator('#sales-gross-1').textContent(), /80.24/);
        assert.equal(await page.evaluate(() => window.RvrgSales.unit(materialsData[0])), 80.24);
        const gstArtifacts = process.env.ARTIFACT_DIR || 'test-results';
        fs.mkdirSync(gstArtifacts, { recursive: true });
        await page.screenshot({ path: path.join(gstArtifacts, 'gst-excluded-68.png'), fullPage: true });
        // An inclusive master price must be converted to pre-GST for entry,
        // without taxing the gross amount a second time.
        await page.locator('#price-1').fill('');
        await page.evaluate(() => selectMaterial(1, {...materialsData[0],unit_cost:80.24,gst_type:'INCLUDED'}));
        assert.equal(await page.locator('#price-1').inputValue(), '68.00');
        assert.match(await page.locator('#total-1').textContent(), /80.24/);
        await page.locator('#qty-1').fill('2');
        await page.locator('#price-1').fill('100');
        await page.locator('#gst-1').fill('18');
        assert.equal(await page.locator('#sales-1').inputValue(), '118');
        assert.match(await page.locator('#sales-gross-1').textContent(), /118.00/);
        assert.equal(await page.locator('#sales-gst-type-1').inputValue(), 'INCLUDED');
        await page.locator('#sales-1').fill('100');
        assert.match(await page.locator('#sales-gross-1').textContent(), /100.00/);
        await page.locator('#sales-gst-type-1').selectOption('EXCLUDED');
        assert.match(await page.locator('#sales-gross-1').textContent(), /118.00/);
        await page.locator('#sales-1').fill('120');
        assert.match(await page.locator('#sales-gross-1').textContent(), /141.60/);
        assert.match(await page.locator('#total-1').textContent(), /236.00/);
        await page.locator('#price-1').fill('110');
        assert.equal(await page.locator('#sales-1').inputValue(), '120');
        await page.locator('#sales-1').fill('');
        assert.equal(await page.locator('#sales-1').inputValue(), '110');
        await page.locator('#price-1').fill('100');
        await page.locator('#sales-1').fill('120');
        for (const width of [1440, 1024, 768]) {
            await page.setViewportSize({ width, height: 1050 });
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Page clipping at ${width}`);
        }
        await page.setViewportSize({ width: 1440, height: 1050 });
        const artifactDir = process.env.ARTIFACT_DIR || 'test-results';
        fs.mkdirSync(artifactDir, { recursive: true });
        await page.screenshot({ path: path.join(artifactDir, 'sales-pricing.png'), fullPage: true });
        await page.locator('#invoiceNo').fill('SALES-TEST');
        await page.locator('#invoiceDate').fill('2026-11-12');
        await page.locator('#billedAmount').fill('236');
        await page.evaluate(() => openConfirmationModal({ preventDefault() {} }));
        assert.match(await page.locator('#modalSalesTotal').textContent(), /283.20/);
        await page.evaluate(() => saveStockEntry());
        const writes = await page.evaluate(() => window.writes);
        const detail = writes.find(row => row.table === 'stock_entry_details').rows[0];
        assert.equal(detail.purchase_price, 100);
        assert.equal(detail.sales_price, 120);
        assert.equal(detail.sales_gst_type, 'EXCLUDED');
        assert.equal(detail.gst_percentage, 18);
        assert.equal(detail.line_total, 236);
        assert.equal(writes.find(row => row.table === 'materials').values.unit_cost, 100);
        assert.ok((await page.evaluate(() => window.alerts)).some(alert => alert.type === 'success'));
        assert.deepEqual(errors, []);
        console.log('PASS: automatic sales default, manual override, reset, invoice GST, purchase totals, sales confirmation, persisted separate rates, 1440/1024/768px layouts. Production requests: 0.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
