const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261112_sales_pricing.sql'), 'utf8');
test('sales migration preserves history, defaults rates, supports overrides and reruns safely', async () => {
    const db = new PGlite();
    try {
        await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
            CREATE TABLE materials(id bigint PRIMARY KEY,unit_cost numeric,gst_type text,gst_percentage numeric);
            CREATE TABLE stock_entry_details(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,material_id bigint REFERENCES materials(id),purchase_price numeric,gst_type text,gst_percentage numeric,quantity numeric,line_total numeric);
            CREATE TABLE material_issue_register(id bigint PRIMARY KEY,unit_cost numeric,total_cost numeric);
            INSERT INTO materials VALUES(1,100,'EXCLUDED',18),(2,50,'INCLUDED',18),(3,0,'INCLUDED',18);
            INSERT INTO stock_entry_details(material_id,purchase_price,gst_type,gst_percentage,quantity,line_total) VALUES(1,100,'EXCLUDED',18,2,236);
            INSERT INTO material_issue_register VALUES(1,100,200);`);
        await db.exec(migration);
        const rows = async sql => (await db.query(sql)).rows;
        assert.equal(Number((await rows('SELECT * FROM material_sales_prices WHERE material_id=1'))[0].sales_price),100);
        assert.equal(Number((await rows('SELECT * FROM material_sales_prices WHERE material_id=2'))[0].sales_price),50);
        assert.equal((await rows('SELECT sales_price FROM stock_entry_details WHERE id=1'))[0].sales_price,null);
        await db.exec(`INSERT INTO stock_entry_details(material_id,purchase_price,sales_price,gst_type,gst_percentage,quantity,line_total) VALUES(1,100,120,'EXCLUDED',18,2,236)`);
        let price=(await rows('SELECT * FROM material_sales_prices WHERE material_id=1'))[0];
        assert.equal(Number(price.sales_price),120);
        assert.equal(Number(price.gst_percentage),18);
        assert.equal(Number((await rows('SELECT unit_cost FROM materials WHERE id=1'))[0].unit_cost),100);
        await db.exec(migration);
        assert.equal(Number((await rows('SELECT sales_price FROM material_sales_prices WHERE material_id=1'))[0].sales_price),120);
        await db.exec(`INSERT INTO stock_entry_details(material_id,purchase_price,gst_type,gst_percentage,quantity,line_total) VALUES(2,60,'EXCLUDED',5,1,63)`);
        assert.equal(Number((await rows('SELECT sales_price FROM material_sales_prices WHERE material_id=2'))[0].sales_price),60);
        assert.deepEqual(await rows('SELECT * FROM material_issue_register'),[{id:1,unit_cost:'100',total_cost:'200'}]);
        await assert.rejects(() => db.exec(`INSERT INTO stock_entry_details(material_id,purchase_price,sales_price,gst_type,gst_percentage) VALUES(1,100,-1,'EXCLUDED',18)`),/Invalid material sales price/);
        await db.exec('SET ROLE anon');
        assert.equal((await rows('SELECT * FROM material_sales_prices')).length,3);
        await assert.rejects(() => db.exec('UPDATE material_sales_prices SET sales_price=1'),/permission denied/);
        await db.exec('RESET ROLE');
    } finally { await db.close(); }
});
