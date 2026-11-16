-- MAIN project, SQL Editor, Run as postgres. Manual correction, not a migration.
-- Confirmed by the store: only 1 unit was physically issued; 11 was a typing error.
-- No rows are deleted. Original values are retained in an owner-only correction log.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS public.rvrg_data_corrections (
 correction_key text PRIMARY KEY,
 reason text NOT NULL,
 before_state jsonb NOT NULL,
 after_state jsonb NOT NULL,
 executed_by text NOT NULL DEFAULT session_user,
 executed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rvrg_data_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rvrg_data_corrections FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
 r public.material_requests%ROWTYPE;
 i public.material_issue_register%ROWTYPE;
 l public.stock_ledger%ROWTYPE;
 code text;
 stock_before numeric;
 stock_after numeric;
 original jsonb;
 fix_key constant text := 'MR-2026-0363/request-1022/issue-630/11-to-1';
 note constant text := '[Correction: physically issued 1; 11 was entered by mistake. Excess deduction of 10 reversed; no physical return.]';
BEGIN
 IF current_user NOT IN ('postgres','supabase_admin') THEN
  RAISE EXCEPTION 'Run this correction as postgres in the MAIN project';
 END IF;
 SELECT * INTO STRICT r FROM public.material_requests WHERE id=1022 FOR UPDATE;
 SELECT material_code INTO code FROM public.materials WHERE id=r.material_id FOR UPDATE;
 IF r.ticket_no IS DISTINCT FROM 'MR-2026-0363' OR code IS DISTINCT FROM 'PLB-179'
  OR r.requested_qty IS DISTINCT FROM 1::numeric OR r.approved_qty IS DISTINCT FROM 1::numeric THEN
  RAISE EXCEPTION 'Ticket, material or approval differs from the reviewed record; nothing changed';
 END IF;
 PERFORM id FROM public.material_issue_register WHERE request_id=r.id ORDER BY id FOR UPDATE;
 IF (SELECT count(*) FROM public.material_issue_register WHERE request_id=r.id)<>1 THEN
  RAISE EXCEPTION 'Unexpected issue records; nothing changed';
 END IF;
 SELECT * INTO STRICT i FROM public.material_issue_register WHERE id=630 AND request_id=r.id;
 IF i.material_id IS DISTINCT FROM r.material_id OR i.ticket_no IS DISTINCT FROM r.ticket_no THEN
  RAISE EXCEPTION 'Issue 630 does not match the reviewed request; nothing changed';
 END IF;
 PERFORM id FROM public.stock_ledger WHERE request_id=r.id AND transaction_type='ISSUE' ORDER BY id FOR UPDATE;
 IF (SELECT count(*) FROM public.stock_ledger WHERE request_id=r.id AND transaction_type='ISSUE')<>1 THEN
  RAISE EXCEPTION 'Expected exactly one original ISSUE ledger entry; nothing changed';
 END IF;
 SELECT * INTO STRICT l FROM public.stock_ledger WHERE request_id=r.id AND transaction_type='ISSUE';
 IF l.material_id IS DISTINCT FROM r.material_id OR l.reference_no IS DISTINCT FROM '630' THEN
  RAISE EXCEPTION 'Original stock deduction does not reference issue 630; nothing changed';
 END IF;
 IF EXISTS(SELECT 1 FROM public.rvrg_data_corrections WHERE correction_key=fix_key) THEN
  IF r.issued_qty=1 AND i.issued_qty=1 AND l.quantity=1 THEN
   RAISE NOTICE 'Already corrected. No additional stock restored.';
   RETURN;
  END IF;
  RAISE EXCEPTION 'Correction log exists but records differ; review required';
 END IF;
 IF r.issued_qty IS DISTINCT FROM 11::numeric OR i.issued_qty IS DISTINCT FROM 11::numeric
  OR l.quantity IS DISTINCT FROM 11::numeric OR r.request_status IS DISTINCT FROM 'ISSUED' THEN
  RAISE EXCEPTION 'Expected original issued quantities of 11 and status ISSUED; nothing changed';
 END IF;
 IF coalesce(r.returned_qty,0)<>0 OR EXISTS(SELECT 1 FROM public.material_returns WHERE issue_id=i.id) THEN
  RAISE EXCEPTION 'A return exists; review it before correcting this issue';
 END IF;
 IF EXISTS(SELECT 1 FROM public.material_issues WHERE request_id=r.id) THEN
  RAISE EXCEPTION 'Additional legacy material_issues rows exist; review required';
 END IF;
 IF i.unit_cost IS NULL OR i.unit_cost::text IN ('NaN','Infinity','-Infinity') OR i.unit_cost<0 THEN
  RAISE EXCEPTION 'Saved issue rate needs review; no current price will be substituted';
 END IF;
 SELECT current_stock INTO STRICT stock_before FROM public.current_stock WHERE material_id=r.material_id;
 original := jsonb_build_object('request',to_jsonb(r),'issue',to_jsonb(i),'ledger',to_jsonb(l),'stock',stock_before);

 UPDATE public.material_issue_register SET issued_qty=1,total_cost=round(unit_cost,2),
  remarks=concat_ws(E'\n',nullif(remarks,''),note) WHERE id=i.id;
 -- Correct the ORIGINAL ISSUE deduction. Do not add a fictitious material return.
 UPDATE public.stock_ledger SET quantity=1,
  remarks=concat_ws(E'\n',nullif(remarks,''),note) WHERE id=l.id;
 UPDATE public.material_requests SET issued_qty=1,request_status='ISSUED' WHERE id=r.id;
 SELECT current_stock INTO STRICT stock_after FROM public.current_stock WHERE material_id=r.material_id;
 IF stock_after-stock_before IS DISTINCT FROM 10::numeric THEN
  RAISE EXCEPTION 'Stock did not increase by exactly 10; transaction rolled back';
 END IF;
 INSERT INTO public.rvrg_data_corrections(correction_key,reason,before_state,after_state)
 VALUES(fix_key,'User confirmed physically issued 1; storekeeper typed 11.',original,
  jsonb_build_object('request_id',r.id,'issue_id',i.id,'ledger_id',l.id,
   'issued_qty',1,'total_cost',round(i.unit_cost,2),'stock',stock_after,'stock_restored',10));
END $$;
COMMIT;

SELECT r.ticket_no,m.material_code,r.requested_qty,r.approved_qty,
 r.issued_qty AS request_issued_total,i.issued_qty AS register_issued_total,
 (SELECT sum(quantity) FROM public.stock_ledger WHERE request_id=r.id AND transaction_type='ISSUE') AS ledger_issue_total,
 i.total_cost AS corrected_issue_amount,s.current_stock,
 a.after_state->>'stock_restored' AS stock_restored_by_this_correction
FROM public.material_requests r
JOIN public.materials m ON m.id=r.material_id
JOIN public.material_issue_register i ON i.id=630 AND i.request_id=r.id
JOIN public.current_stock s ON s.material_id=r.material_id
JOIN public.rvrg_data_corrections a ON a.correction_key='MR-2026-0363/request-1022/issue-630/11-to-1'
WHERE r.id=1022;
