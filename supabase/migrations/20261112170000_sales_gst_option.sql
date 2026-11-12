-- Run after 20261112_sales_pricing.sql. Existing data is not rewritten.
BEGIN;
ALTER TABLE public.stock_entry_details
    ADD COLUMN IF NOT EXISTS sales_gst_type text
    CHECK (sales_gst_type IN ('INCLUDED','EXCLUDED'));

-- New app entries send the sales GST choice. Null retains the old app's
-- purchase-GST interpretation, so the migration can precede deployment.
CREATE OR REPLACE FUNCTION public.sync_stock_entry_sales_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
    INSERT INTO public.material_sales_prices(material_id,sales_price,gst_type,gst_percentage,updated_at)
    VALUES(NEW.material_id,NEW.sales_price,COALESCE(NEW.sales_gst_type,upper(NEW.gst_type)),NEW.gst_percentage,now())
    ON CONFLICT (material_id) DO UPDATE SET
        sales_price=EXCLUDED.sales_price,gst_type=EXCLUDED.gst_type,
        gst_percentage=EXCLUDED.gst_percentage,updated_at=EXCLUDED.updated_at;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_stock_entry_sales_price() FROM PUBLIC;
NOTIFY pgrst, 'reload schema';
COMMIT;
SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='stock_entry_details' AND column_name='sales_gst_type') AS sales_gst_option_installed;
