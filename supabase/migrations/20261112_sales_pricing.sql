-- Additive migration. Run in Supabase SQL Editor as postgres.
-- Keeps purchase amounts and all completed issue records unchanged.
BEGIN;

CREATE TABLE IF NOT EXISTS public.material_sales_prices (
    material_id bigint PRIMARY KEY REFERENCES public.materials(id),
    sales_price numeric NOT NULL CHECK (sales_price >= 0 AND sales_price::text NOT IN ('NaN','Infinity','-Infinity')),
    gst_type text NOT NULL CHECK (gst_type IN ('INCLUDED','EXCLUDED')),
    gst_percentage numeric NOT NULL CHECK (gst_percentage BETWEEN 0 AND 100),
    updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_entry_details ADD COLUMN IF NOT EXISTS sales_price numeric
    CHECK (sales_price >= 0 AND sales_price::text NOT IN ('NaN','Infinity','-Infinity'));

-- Default existing materials to their latest saved invoice rate and invoice GST.
-- No historical stock-entry or issue rows are rewritten. Reruns preserve overrides.
INSERT INTO public.material_sales_prices(material_id,sales_price,gst_type,gst_percentage)
SELECT m.id,
    GREATEST(COALESCE(d.purchase_price,m.unit_cost,0),0),
    CASE WHEN upper(COALESCE(d.gst_type,m.gst_type,'INCLUDED')) = 'EXCLUDED' THEN 'EXCLUDED' ELSE 'INCLUDED' END,
    COALESCE(d.gst_percentage,m.gst_percentage,0)
FROM public.materials m
LEFT JOIN LATERAL (
    SELECT purchase_price,gst_type,gst_percentage FROM public.stock_entry_details
    WHERE material_id=m.id ORDER BY id DESC LIMIT 1
) d ON true
ON CONFLICT (material_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_stock_entry_sales_price()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    NEW.sales_price := COALESCE(NEW.sales_price,NEW.purchase_price);
    IF NEW.material_id IS NULL OR NEW.sales_price IS NULL OR NEW.sales_price < 0
       OR NEW.sales_price::text IN ('NaN','Infinity','-Infinity')
       OR NEW.gst_percentage IS NULL OR NOT (NEW.gst_percentage BETWEEN 0 AND 100)
       OR NEW.gst_percentage::text IN ('NaN','Infinity','-Infinity')
       OR upper(COALESCE(NEW.gst_type,'')) NOT IN ('INCLUDED','EXCLUDED') THEN
        RAISE EXCEPTION 'Invalid material sales price or invoice GST';
    END IF;
    RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.sync_stock_entry_sales_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
    INSERT INTO public.material_sales_prices(material_id,sales_price,gst_type,gst_percentage,updated_at)
    VALUES(NEW.material_id,NEW.sales_price,upper(NEW.gst_type),NEW.gst_percentage,now())
    ON CONFLICT (material_id) DO UPDATE SET
        sales_price=EXCLUDED.sales_price,gst_type=EXCLUDED.gst_type,
        gst_percentage=EXCLUDED.gst_percentage,updated_at=EXCLUDED.updated_at;
    RETURN NEW;
END;
$$;
-- Replace only this migration's own triggers; existing triggers are retained.
DROP TRIGGER IF EXISTS trg_stock_entry_sales_default ON public.stock_entry_details;
CREATE TRIGGER trg_stock_entry_sales_default BEFORE INSERT ON public.stock_entry_details
FOR EACH ROW EXECUTE FUNCTION public.set_stock_entry_sales_price();
DROP TRIGGER IF EXISTS trg_stock_entry_sales_sync ON public.stock_entry_details;
CREATE TRIGGER trg_stock_entry_sales_sync AFTER INSERT ON public.stock_entry_details
FOR EACH ROW EXECUTE FUNCTION public.sync_stock_entry_sales_price();

-- The existing app can read rates; changes come only through stock-entry inserts.
-- This does not alter grants/policies on any existing table or enable the staged
-- authentication/approval workflow.
ALTER TABLE public.material_sales_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS material_sales_prices_read ON public.material_sales_prices;
CREATE POLICY material_sales_prices_read ON public.material_sales_prices
    FOR SELECT TO anon,authenticated USING (true);
REVOKE ALL ON public.material_sales_prices FROM anon,authenticated;
GRANT SELECT ON public.material_sales_prices TO anon,authenticated;
REVOKE ALL ON FUNCTION public.sync_stock_entry_sales_price() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_stock_entry_sales_price() FROM PUBLIC;
NOTIFY pgrst, 'reload schema';
COMMIT;

SELECT to_regclass('public.material_sales_prices') IS NOT NULL AS sales_prices_installed,
       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
              AND table_name='stock_entry_details' AND column_name='sales_price') AS invoice_sales_price_installed;
