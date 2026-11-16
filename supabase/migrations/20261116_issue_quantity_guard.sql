-- Run as postgres in the MAIN project for the existing app.
-- Additive: no historical quantities, prices, stock, users or RLS settings are rewritten.
BEGIN;
ALTER TABLE public.material_issue_register ADD COLUMN IF NOT EXISTS issue_client_id uuid;
ALTER TABLE public.material_issue_register ADD COLUMN IF NOT EXISTS issue_actor_id bigint REFERENCES public.users_master(id);
CREATE UNIQUE INDEX IF NOT EXISTS rvrg_issue_retry_key
 ON public.material_issue_register(issue_actor_id,issue_client_id) WHERE issue_client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rvrg_issue_request_idx ON public.material_issue_register(request_id);
CREATE INDEX IF NOT EXISTS rvrg_request_ticket_browse_idx ON public.material_requests(ticket_no);

CREATE OR REPLACE FUNCTION public.rvrg_guard_issue_quantity()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r public.material_requests%ROWTYPE; other_issued numeric; cap numeric;
BEGIN
 IF NEW.request_id IS NULL THEN RAISE EXCEPTION 'An approved request is required for material issue'; END IF;
 IF TG_OP='UPDATE' AND (NEW.request_id IS DISTINCT FROM OLD.request_id OR NEW.material_id IS DISTINCT FROM OLD.material_id) THEN
  RAISE EXCEPTION 'An issue cannot be moved to another request or material';
 END IF;
 IF NEW.issued_qty IS NULL OR NEW.issued_qty::text IN ('NaN','Infinity','-Infinity') OR NEW.issued_qty<=0
  OR NEW.issued_qty<>round(NEW.issued_qty,2) THEN RAISE EXCEPTION 'Invalid issued quantity'; END IF;
 SELECT * INTO STRICT r FROM public.material_requests WHERE id=NEW.request_id FOR UPDATE;
 IF NEW.material_id IS DISTINCT FROM r.material_id OR NEW.ticket_no IS DISTINCT FROM r.ticket_no THEN
  RAISE EXCEPTION 'Issue material and ticket must match the request';
 END IF;
 IF TG_OP='INSERT' AND coalesce(r.request_status,'') NOT IN ('APPROVED','PARTIALLY_APPROVED','PARTIALLY_ISSUED') THEN
  RAISE EXCEPTION 'Request is not approved for issue';
 END IF;
 cap := least(r.requested_qty,coalesce(r.approved_qty,r.requested_qty));
 IF cap IS NULL OR cap::text IN ('NaN','Infinity','-Infinity') OR cap<=0 THEN RAISE EXCEPTION 'Invalid approved quantity'; END IF;
 SELECT coalesce(sum(i.issued_qty),0) INTO other_issued FROM public.material_issue_register i
 WHERE i.request_id=r.id AND (TG_OP='INSERT' OR i.id<>OLD.id);
 IF other_issued+NEW.issued_qty>cap THEN RAISE EXCEPTION 'Issued quantity cannot exceed approved quantity (%)',cap; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rvrg_issue_quantity_guard ON public.material_issue_register;
CREATE TRIGGER rvrg_issue_quantity_guard BEFORE INSERT OR UPDATE OF issued_qty,request_id,material_id,ticket_no
 ON public.material_issue_register FOR EACH ROW EXECUTE FUNCTION public.rvrg_guard_issue_quantity();

CREATE OR REPLACE FUNCTION public.rvrg_guard_request_issue_total()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE cap numeric;
BEGIN
 -- Existing anomalies remain readable; reject new or worsened over-issues.
 IF TG_OP='UPDATE' AND NEW.issued_qty IS NOT DISTINCT FROM OLD.issued_qty
  AND NEW.requested_qty IS NOT DISTINCT FROM OLD.requested_qty
  AND NEW.approved_qty IS NOT DISTINCT FROM OLD.approved_qty THEN RETURN NEW; END IF;
 cap := least(NEW.requested_qty,coalesce(NEW.approved_qty,NEW.requested_qty));
 IF cap IS NULL OR cap::text IN ('NaN','Infinity','-Infinity') OR cap<0
  OR NEW.issued_qty IS NULL OR NEW.issued_qty::text IN ('NaN','Infinity','-Infinity') OR NEW.issued_qty<0
  OR NEW.issued_qty<>round(NEW.issued_qty,2) OR NEW.issued_qty>cap THEN
  RAISE EXCEPTION 'Issued total cannot exceed approved quantity (%)',cap;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rvrg_request_issue_total_guard ON public.material_requests;
CREATE TRIGGER rvrg_request_issue_total_guard BEFORE INSERT OR UPDATE OF issued_qty,requested_qty,approved_qty
 ON public.material_requests FOR EACH ROW EXECUTE FUNCTION public.rvrg_guard_request_issue_total();

-- Invoker permissions: this does not bypass table grants/RLS or activate Auth.
-- Legacy login supplies p_actor; the Auth migration must replace that with verified identity.
CREATE OR REPLACE FUNCTION public.issue_material_checked(
 p_request bigint,p_quantity numeric,p_actor bigint,p_client_id uuid
) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE
 r public.material_requests%ROWTYPE;
 m public.materials%ROWTYPE;
 u public.users_master%ROWTYPE;
 prior public.material_issue_register%ROWTYPE;
 sales public.material_sales_prices%ROWTYPE;
 cap numeric; already numeric; available numeric; price numeric; gst numeric; gross numeric;
 issue_id bigint; verified_actor bigint;
BEGIN
 IF p_client_id IS NULL OR p_quantity IS NULL OR p_quantity::text IN ('NaN','Infinity','-Infinity')
  OR p_quantity<=0 OR p_quantity<>round(p_quantity,2) OR p_quantity>=100000000 THEN
  RAISE EXCEPTION 'Enter a positive issue quantity with at most two decimal places';
 END IF;
 IF auth.uid() IS NOT NULL THEN
  IF to_regprocedure('public.app_user_id()') IS NULL THEN RAISE EXCEPTION 'Authenticated profile lookup is required'; END IF;
  EXECUTE 'SELECT public.app_user_id()' INTO verified_actor;
  IF verified_actor IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Issuer does not match the authenticated account'; END IF;
 END IF;
 SELECT * INTO u FROM public.users_master WHERE id=p_actor AND is_active IS TRUE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active issuer required'; END IF;
 IF upper(u.role)<>'ADMIN' AND NOT EXISTS(SELECT 1 FROM public.user_permissions
  WHERE user_id=u.id AND section_key='issue_materials' AND is_allowed IS TRUE) THEN
  RAISE EXCEPTION 'Issue Materials access required';
 END IF;
 SELECT * INTO STRICT r FROM public.material_requests WHERE id=p_request FOR UPDATE;
 -- Serialize all checked issues for a material, including different requests.
 SELECT * INTO STRICT m FROM public.materials WHERE id=r.material_id FOR UPDATE;
 SELECT * INTO prior FROM public.material_issue_register WHERE issue_actor_id=p_actor AND issue_client_id=p_client_id;
 IF FOUND THEN
  IF prior.request_id<>p_request OR prior.issued_qty<>p_quantity THEN RAISE EXCEPTION 'Retry identifier belongs to a different issue'; END IF;
  RETURN jsonb_build_object('issue_id',prior.id,'ticket_no',prior.ticket_no,'already_processed',true);
 END IF;
 IF coalesce(r.request_status,'') NOT IN ('APPROVED','PARTIALLY_APPROVED','PARTIALLY_ISSUED') THEN RAISE EXCEPTION 'Request is not approved for issue'; END IF;
 cap := least(r.requested_qty,coalesce(r.approved_qty,r.requested_qty));
 SELECT coalesce(sum(issued_qty),0) INTO already FROM public.material_issue_register WHERE request_id=r.id;
 IF already IS DISTINCT FROM coalesce(r.issued_qty,0) THEN
  RAISE EXCEPTION 'Issue history and request total differ. Admin must reconcile this request before issuing';
 END IF;
 IF cap IS NULL OR cap::text IN ('NaN','Infinity','-Infinity') OR p_quantity>cap-already THEN
  RAISE EXCEPTION 'Issued quantity cannot exceed remaining approved quantity (%)',greatest(0,cap-already);
 END IF;
 IF lower(btrim(coalesce(m.unit,''))) NOT IN ('kg','kgs','kilogram','kilograms','g','gram','grams',
  'l','ltr','ltrs','liter','liters','litre','litres','m','mtr','meter','meters','metre','metres')
  AND p_quantity<>trunc(p_quantity) THEN RAISE EXCEPTION 'Whole-number quantity required for this unit'; END IF;
 SELECT current_stock INTO available FROM public.current_stock WHERE material_id=m.id;
 IF available IS NULL OR p_quantity>available THEN RAISE EXCEPTION 'Insufficient available stock'; END IF;
 SELECT * INTO sales FROM public.material_sales_prices WHERE material_id=m.id;
 IF FOUND THEN price:=sales.sales_price;gst:=CASE WHEN upper(sales.gst_type)='EXCLUDED' THEN sales.gst_percentage ELSE 0 END;
 ELSE price:=coalesce(m.unit_cost,0);gst:=CASE WHEN upper(m.gst_type)='EXCLUDED' THEN coalesce(m.gst_percentage,0) ELSE 0 END; END IF;
 IF price IS NULL OR price::text IN ('NaN','Infinity','-Infinity') OR price<0
  OR gst IS NULL OR gst::text IN ('NaN','Infinity','-Infinity') OR gst NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'Invalid sales price or GST'; END IF;
 gross:=round(price*(1+gst/100),2);
 INSERT INTO public.material_issue_register(request_id,material_id,ticket_no,location_name,location_type,
  technician_name,issued_qty,unit_cost,total_cost,remarks,issued_by,issue_client_id,issue_actor_id)
 VALUES(r.id,m.id,r.ticket_no,r.location_name,r.location_type,r.technician_name,p_quantity,gross,
  round(gross*p_quantity,2),'Material issued with approval quantity check',u.full_name,p_client_id,p_actor)
 RETURNING id INTO issue_id;
 INSERT INTO public.stock_ledger(material_id,transaction_type,quantity,reference_no,request_id,remarks,created_by,transaction_date)
 VALUES(m.id,'ISSUE',p_quantity,issue_id::text,r.id,'Issued against ticket '||r.ticket_no,p_actor,now());
 UPDATE public.material_requests SET issued_qty=already+p_quantity,
  request_status=CASE WHEN already+p_quantity>=cap THEN 'ISSUED' ELSE 'PARTIALLY_ISSUED' END WHERE id=r.id;
 RETURN jsonb_build_object('issue_id',issue_id,'ticket_no',r.ticket_no,'issued_qty',already+p_quantity,'already_processed',false);
END $$;
REVOKE ALL ON FUNCTION public.rvrg_guard_issue_quantity(),public.rvrg_guard_request_issue_total() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.issue_material_checked(bigint,numeric,bigint,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_material_checked(bigint,numeric,bigint,uuid) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
SELECT to_regprocedure('public.issue_material_checked(bigint,numeric,bigint,uuid)') IS NOT NULL AS checked_issue_installed,
 EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='rvrg_issue_quantity_guard' AND tgrelid='public.material_issue_register'::regclass) AS issue_limit_guard_installed;
