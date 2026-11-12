// Sales prices are separate from purchase costs. Historical issue rates stay in
// material_issue_register.unit_cost; never revalue completed issues here.
window.RvrgSales = {
    prices: new Map(),
    async load(client, ids) {
        const keys = [...new Set(ids.filter(id => id != null).map(String))];
        for (let start = 0; start < keys.length; start += 100) {
            const batch = keys.slice(start, start + 100);
            const { data, error } = await client.from('material_sales_prices')
                .select('material_id,sales_price,gst_type,gst_percentage').in('material_id', batch);
            if (error) {
                // Existing installations keep working until the migration runs.
                if (['42P01', 'PGRST205'].includes(error.code)) return;
                throw error;
            }
            batch.forEach(id => this.prices.delete(id));
            for (const price of data || []) this.prices.set(String(price.material_id), price);
        }
    },
    unit(material, materialId = material?.id) {
        const price = this.prices.get(String(materialId));
        // Preserve legacy behavior for items without a dedicated sales price.
        if (!price) return Number(material?.unit_cost || 0);
        const base = Number(price.sales_price);
        const gst = String(price.gst_type).toUpperCase() === 'EXCLUDED'
            ? Number(price.gst_percentage || 0) : 0;
        return Math.round((base * (1 + gst / 100) + Number.EPSILON) * 100) / 100;
    },
    gstLabel(material, materialId = material?.id) {
        const price = this.prices.get(String(materialId));
        return price ? `${price.gst_percentage}% (${price.gst_type.toLowerCase()} in base sales price)`
            : (material?.gst_type || '-');
    },
    async requireInstalled(client) {
        const { error } = await client.from('material_sales_prices').select('material_id').limit(1);
        if (error) throw new Error('Sales pricing is not ready. Run 20261112_sales_pricing.sql in Supabase first. No invoice has been saved. ' + error.message);
    }
};
