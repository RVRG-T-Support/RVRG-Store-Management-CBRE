-- REVIEW / STAGING ONLY. This script does not activate the live workflow.
BEGIN;
ALTER TABLE public.users_master ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE REFERENCES auth.users(id);
CREATE TABLE public.approval_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 threshold numeric(14,2) NOT NULL DEFAULT 3000 CHECK(threshold >= 0 AND threshold::text NOT IN('NaN','Infinity','-Infinity')),
 total_ticket_value boolean NOT NULL DEFAULT true,
 sequential_levels boolean NOT NULL DEFAULT true,
 hold_missing_cost boolean NOT NULL DEFAULT false,
 enabled boolean NOT NULL DEFAULT false,
 revision bigint NOT NULL DEFAULT 1
);
INSERT INTO public.approval_settings(id) VALUES(true);
CREATE TABLE public.approval_assignments (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id bigint NOT NULL REFERENCES public.users_master(id),
 level integer NOT NULL CHECK(level IN(1,2)),
 department_id bigint REFERENCES public.departments(id),
 active boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX approval_assignment_scope ON public.approval_assignments(user_id,level,COALESCE(department_id,0));
CREATE TABLE public.approval_tickets (
 ticket_no text PRIMARY KEY,
 requested_by bigint NOT NULL REFERENCES public.users_master(id),
 department_id bigint NOT NULL REFERENCES public.departments(id),
 total_value numeric(14,2) NOT NULL DEFAULT 0,
 routing_value numeric(14,2) NOT NULL DEFAULT 0,
 cost_incomplete boolean NOT NULL DEFAULT false,
 required_level integer NOT NULL CHECK(required_level IN(1,2)),
 state text NOT NULL CHECK(state IN('HOLD','PENDING_L1','PENDING_L2','APPROVED','REJECTED')),
 rule_snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE SEQUENCE public.approval_ticket_number;
CREATE TABLE public.approval_lines (
 request_id bigint PRIMARY KEY REFERENCES public.material_requests(id),
 ticket_no text NOT NULL REFERENCES public.approval_tickets(ticket_no),
 material_code text NOT NULL, material_name text NOT NULL, unit text NOT NULL,
 requested_qty numeric NOT NULL,
 unit_cost numeric NOT NULL CHECK(unit_cost>=0),
 gst_percentage numeric NOT NULL CHECK(gst_percentage BETWEEN 0 AND 100),
 gst_type text NOT NULL,
 gross_unit_cost numeric NOT NULL CHECK(gross_unit_cost>=0),
 line_value numeric(14,2) NOT NULL CHECK(line_value>=0),
 cost_missing boolean NOT NULL,
 approved_qty numeric
);
CREATE TABLE public.approval_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 ticket_no text REFERENCES public.approval_tickets(ticket_no),
 actor_id bigint NOT NULL REFERENCES public.users_master(id),
 action text NOT NULL,
 level integer,
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION public.approval_actor() RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor bigint;
BEGIN
 SELECT id INTO actor FROM public.users_master WHERE auth_user_id=auth.uid() AND is_active IS TRUE;
 IF actor IS NULL THEN RAISE EXCEPTION 'A linked, active authenticated account is required'; END IF;
 RETURN actor;
END $$;
CREATE FUNCTION public.approval_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.users_master WHERE id=public.approval_actor() AND upper(role)='ADMIN')
$$;
CREATE FUNCTION public.approval_can_act(p_actor bigint,p_level integer,p_department bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.approval_assignments a JOIN public.users_master u ON u.id=a.user_id
 WHERE a.user_id=p_actor AND a.level=p_level AND a.active AND u.is_active IS TRUE
 AND (a.department_id IS NULL OR a.department_id=p_department))
$$;
CREATE FUNCTION public.approval_profile() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
 SELECT jsonb_build_object('id',id,'name',full_name,'role',role,'is_active',is_active)
 INTO result FROM public.users_master WHERE id=public.approval_actor();
 RETURN result;
END $$;
CREATE FUNCTION public.approval_save_settings(p_threshold numeric,p_total boolean,p_sequential boolean,p_hold boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.approval_is_admin() THEN RAISE EXCEPTION 'Admin only'; END IF;
 UPDATE public.approval_settings SET threshold=p_threshold,total_ticket_value=p_total,
 sequential_levels=p_sequential,hold_missing_cost=p_hold,revision=revision+1 WHERE id;
 INSERT INTO public.approval_audit(actor_id,action,details) VALUES(public.approval_actor(),'SETTINGS',
 jsonb_build_object('threshold',p_threshold,'total_ticket_value',p_total,'sequential_levels',p_sequential,'hold_missing_cost',p_hold));
END $$;
CREATE FUNCTION public.approval_assign(p_user bigint,p_level integer,p_department bigint,p_active boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.approval_is_admin() THEN RAISE EXCEPTION 'Admin only'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users_master WHERE id=p_user AND is_active IS TRUE) THEN RAISE EXCEPTION 'Choose an active user'; END IF;
 INSERT INTO public.approval_assignments(user_id,level,department_id,active) VALUES(p_user,p_level,p_department,p_active)
 ON CONFLICT(user_id,level,(COALESCE(department_id,0))) DO UPDATE SET active=excluded.active;
 IF p_active THEN
 INSERT INTO public.user_permissions(user_id,section_key,is_allowed) VALUES(p_user,'approvals',true)
 ON CONFLICT(user_id,section_key) DO UPDATE SET is_allowed=true;
 END IF;
 INSERT INTO public.approval_audit(actor_id,action,details) VALUES(public.approval_actor(),'ASSIGNMENT',
 jsonb_build_object('user_id',p_user,'level',p_level,'department_id',p_department,'active',p_active));
END $$;
CREATE FUNCTION public.approval_notify(p_ticket text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t public.approval_tickets; target integer;
BEGIN
 SELECT * INTO STRICT t FROM public.approval_tickets WHERE ticket_no=p_ticket;
 target=CASE t.state WHEN 'PENDING_L1' THEN 1 WHEN 'PENDING_L2' THEN 2 ELSE NULL END;
 IF target IS NOT NULL THEN
 INSERT INTO public.notifications(user_id,title,message,notification_type,reference_id,is_read)
 SELECT DISTINCT a.user_id,'Approval required',p_ticket||' awaits Level '||target,'REQUEST_PENDING',
 (SELECT min(request_id) FROM public.approval_lines WHERE ticket_no=p_ticket),false
 FROM public.approval_assignments a JOIN public.users_master u ON u.id=a.user_id
 WHERE a.active AND a.level=target AND (a.department_id IS NULL OR a.department_id=t.department_id)
 AND u.is_active IS TRUE AND a.user_id<>t.requested_by
 AND NOT EXISTS(SELECT 1 FROM public.approval_audit h WHERE h.ticket_no=p_ticket AND h.action='APPROVE' AND h.actor_id=a.user_id);
 ELSE
 INSERT INTO public.notifications(user_id,title,message,notification_type,reference_id,is_read)
 VALUES(t.requested_by,'Request update',p_ticket||': '||t.state,'REQUEST_'||t.state,
 (SELECT min(request_id) FROM public.approval_lines WHERE ticket_no=p_ticket),false);
 IF t.state='APPROVED' THEN
 INSERT INTO public.notifications(user_id,title,message,notification_type,reference_id,is_read)
 SELECT id,'Material ready for issue',p_ticket||' has final approval','REQUEST_APPROVED',
 (SELECT min(request_id) FROM public.approval_lines WHERE ticket_no=p_ticket),false
 FROM public.users_master WHERE is_active IS TRUE AND upper(role) IN('STORE','STOREKEEPER');
 END IF;
 END IF;
END $$;
CREATE FUNCTION public.approval_submit(p_items jsonb,p_location_type text,p_location_name text,p_complaint text,p_technician text,p_remarks text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor bigint=public.approval_actor(); s public.approval_settings; m public.materials;
 item jsonb; qty numeric; rate numeric; gross numeric; missing boolean; dept bigint; req bigint;
 ticket text; total numeric=0; maximum numeric=0; incomplete boolean=false; route numeric; level_needed integer; next_state text;
BEGIN
 SELECT * INTO STRICT s FROM public.approval_settings WHERE id FOR SHARE;
 IF NOT s.enabled THEN RAISE EXCEPTION 'Approval workflow is not activated'; END IF;
 IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 OR jsonb_array_length(p_items)>100 THEN RAISE EXCEPTION 'Provide 1 to 100 material lines'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) x GROUP BY x->>'material_id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate materials'; END IF;
 ticket='MR-'||extract(year FROM now())::text||'-'||lpad(nextval('public.approval_ticket_number')::text,6,'0');
 -- Sequence is seeded above existing ticket numbers during activation.
 INSERT INTO public.approval_tickets(ticket_no,requested_by,department_id,required_level,state,rule_snapshot)
 SELECT ticket,actor,department_id,1,'HOLD',to_jsonb(s) FROM public.materials WHERE id=(p_items->0->>'material_id')::bigint;
 IF NOT FOUND THEN RAISE EXCEPTION 'Material not found'; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
 SELECT * INTO STRICT m FROM public.materials WHERE id=(item->>'material_id')::bigint FOR SHARE;
 IF m.is_active IS NOT TRUE THEN RAISE EXCEPTION 'Material is inactive'; END IF;
 IF dept IS NULL THEN dept=m.department_id; END IF;
 IF dept<>m.department_id THEN RAISE EXCEPTION 'One department per ticket'; END IF;
 qty=(item->>'quantity')::numeric;
 IF qty IS NULL OR qty<=0 OR qty<>round(qty,2) OR qty::text IN('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;
 IF lower(trim(m.unit)) NOT IN('kg','kgs','kilogram','kilograms','g','gram','grams','l','ltr','ltrs','liter','liters','litre','litres','m','mtr','meter','meters','metre','metres') AND qty<>trunc(qty) THEN RAISE EXCEPTION 'Whole-number quantity required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.current_stock WHERE material_id=m.id AND current_stock>0) THEN RAISE EXCEPTION 'Material is out of stock'; END IF;
 missing=m.unit_cost IS NULL OR m.unit_cost<=0;
 rate=CASE WHEN missing THEN 0 ELSE m.unit_cost END;
 IF rate::text IN('NaN','Infinity','-Infinity') OR COALESCE(m.gst_percentage,0) NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'Invalid material price or GST'; END IF;
 IF upper(COALESCE(m.gst_type,'')) NOT IN('INCLUDED','EXCLUDED') THEN RAISE EXCEPTION 'Material GST type must be INCLUDED or EXCLUDED'; END IF;
 gross=rate*CASE WHEN upper(m.gst_type)='EXCLUDED' THEN 1+COALESCE(m.gst_percentage,0)/100 ELSE 1 END;
 INSERT INTO public.material_requests(ticket_no,material_id,requested_qty,requested_by,location_type,location_name,anacity_complaint_no,technician_name,remarks,request_status)
 VALUES(ticket,m.id,qty,actor,p_location_type,p_location_name,p_complaint,p_technician,p_remarks,'PENDING') RETURNING id INTO req;
 INSERT INTO public.approval_lines(request_id,ticket_no,material_code,material_name,unit,requested_qty,unit_cost,gst_percentage,gst_type,gross_unit_cost,line_value,cost_missing)
 VALUES(req,ticket,m.material_code,m.material_name,m.unit,qty,rate,COALESCE(m.gst_percentage,0),m.gst_type,gross,round(gross*qty,2),missing);
 total=total+round(gross*qty,2); maximum=greatest(maximum,round(gross*qty,2)); incomplete=incomplete OR missing;
 END LOOP;
 route=CASE WHEN s.total_ticket_value THEN total ELSE maximum END;
 level_needed=CASE WHEN route>s.threshold THEN 2 ELSE 1 END;
 next_state=CASE WHEN incomplete AND s.hold_missing_cost THEN 'HOLD' WHEN level_needed=2 AND NOT s.sequential_levels THEN 'PENDING_L2' ELSE 'PENDING_L1' END;
 UPDATE public.approval_tickets SET total_value=total,routing_value=route,cost_incomplete=incomplete,required_level=level_needed,state=next_state WHERE ticket_no=ticket;
 INSERT INTO public.approval_audit(ticket_no,actor_id,action,details) VALUES(ticket,actor,'SUBMIT',jsonb_build_object('total',total,'state',next_state));
 PERFORM public.approval_notify(ticket);
 RETURN ticket;
END $$;
CREATE FUNCTION public.approval_decide(p_ticket text,p_approve boolean,p_reason text DEFAULT '',p_quantities jsonb DEFAULT '[]') RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor bigint=public.approval_actor(); t public.approval_tickets; stage integer; next_state text; l record; amount numeric;
BEGIN
 IF p_approve IS NULL THEN RAISE EXCEPTION 'Choose approve or reject'; END IF;
 SELECT * INTO STRICT t FROM public.approval_tickets WHERE ticket_no=p_ticket FOR UPDATE;
 stage=CASE t.state WHEN 'PENDING_L1' THEN 1 WHEN 'PENDING_L2' THEN 2 ELSE NULL END;
 IF stage IS NULL THEN RAISE EXCEPTION 'Ticket is not awaiting approval'; END IF;
 IF t.requested_by=actor THEN RAISE EXCEPTION 'Self approval is not permitted'; END IF;
 IF NOT public.approval_can_act(actor,stage,t.department_id) THEN RAISE EXCEPTION 'Not assigned to this level and department'; END IF;
 IF EXISTS(SELECT 1 FROM public.approval_audit WHERE ticket_no=p_ticket AND action='APPROVE' AND actor_id=actor) THEN RAISE EXCEPTION 'A different person must approve each level'; END IF;
 IF NOT p_approve AND length(trim(COALESCE(p_reason,'')))=0 THEN RAISE EXCEPTION 'Rejection reason required'; END IF;
 IF p_approve THEN
 IF jsonb_typeof(p_quantities)<>'array' THEN RAISE EXCEPTION 'Invalid approved quantities'; END IF;
 IF jsonb_array_length(p_quantities)>0 AND (
 jsonb_array_length(p_quantities)<>(SELECT count(*) FROM public.approval_lines WHERE ticket_no=p_ticket) OR
 EXISTS(SELECT 1 FROM jsonb_array_elements(p_quantities) x GROUP BY x->>'request_id' HAVING count(*)>1) OR
 EXISTS(SELECT 1 FROM jsonb_array_elements(p_quantities) x WHERE NOT EXISTS(SELECT 1 FROM public.approval_lines WHERE ticket_no=p_ticket AND request_id=(x->>'request_id')::bigint))) THEN RAISE EXCEPTION 'Provide every ticket line once'; END IF;
 FOR l IN SELECT * FROM public.approval_lines WHERE ticket_no=p_ticket LOOP
 amount=COALESCE(l.approved_qty,l.requested_qty);
 IF jsonb_array_length(p_quantities)>0 THEN SELECT (x->>'quantity')::numeric INTO amount FROM jsonb_array_elements(p_quantities) x WHERE (x->>'request_id')::bigint=l.request_id; END IF;
 IF amount IS NULL OR amount<=0 OR amount::text IN('NaN','Infinity','-Infinity') OR amount<>round(amount,2) OR amount>COALESCE(l.approved_qty,l.requested_qty) THEN RAISE EXCEPTION 'Approved quantity exceeds the previous approval or request'; END IF;
 IF lower(trim(l.unit)) NOT IN('kg','kgs','kilogram','kilograms','g','gram','grams','l','ltr','ltrs','liter','liters','litre','litres','m','mtr','meter','meters','metre','metres') AND amount<>trunc(amount) THEN RAISE EXCEPTION 'Whole-number approved quantity required'; END IF;
 UPDATE public.approval_lines SET approved_qty=amount WHERE request_id=l.request_id;
 END LOOP;
 END IF;
 next_state=CASE WHEN NOT p_approve THEN 'REJECTED' WHEN stage=1 AND t.required_level=2 THEN 'PENDING_L2' ELSE 'APPROVED' END;
 UPDATE public.approval_tickets SET state=next_state WHERE ticket_no=p_ticket;
 INSERT INTO public.approval_audit(ticket_no,actor_id,action,level,details)
 VALUES(p_ticket,actor,CASE WHEN p_approve THEN 'APPROVE' ELSE 'REJECT' END,stage,jsonb_build_object('reason',p_reason,'next_state',next_state,'quantities',p_quantities));
 IF next_state IN('APPROVED','REJECTED') THEN
 UPDATE public.material_requests r SET request_status=CASE WHEN NOT p_approve THEN 'REJECTED' WHEN saved_line.approved_qty<r.requested_qty THEN 'PARTIALLY_APPROVED' ELSE 'APPROVED' END,
 approved_by=actor,approval_date=now(),approved_qty=CASE WHEN p_approve THEN saved_line.approved_qty ELSE 0 END
 FROM public.approval_lines saved_line WHERE saved_line.request_id=r.id AND saved_line.ticket_no=p_ticket;
 IF NOT p_approve THEN UPDATE public.approval_lines SET approved_qty=0 WHERE ticket_no=p_ticket; END IF;
 END IF;
 PERFORM public.approval_notify(p_ticket);
 RETURN next_state;
END $$;
CREATE FUNCTION public.approval_release_hold(p_ticket text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t public.approval_tickets; state_next text; l record; rate numeric; gross numeric;
 total numeric=0; maximum numeric=0; required integer;
BEGIN
 IF NOT public.approval_is_admin() THEN RAISE EXCEPTION 'Admin only'; END IF;
 SELECT * INTO STRICT t FROM public.approval_tickets WHERE ticket_no=p_ticket FOR UPDATE;
 IF t.state<>'HOLD' THEN RAISE EXCEPTION 'Ticket is not held'; END IF;
 FOR l IN SELECT a.request_id,r.requested_qty,m.* FROM public.approval_lines a JOIN public.material_requests r ON r.id=a.request_id JOIN public.materials m ON m.id=r.material_id WHERE a.ticket_no=p_ticket LOOP
 rate=l.unit_cost;
 IF rate IS NULL OR rate<=0 OR rate::text IN('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Correct every missing material cost before releasing'; END IF;
 IF l.gst_percentage IS NULL OR l.gst_percentage NOT BETWEEN 0 AND 100 OR upper(COALESCE(l.gst_type,'')) NOT IN('INCLUDED','EXCLUDED') THEN RAISE EXCEPTION 'Correct material GST before releasing'; END IF;
 gross=rate*CASE WHEN upper(l.gst_type)='EXCLUDED' THEN 1+l.gst_percentage/100 ELSE 1 END;
 UPDATE public.approval_lines SET unit_cost=rate,gst_percentage=l.gst_percentage,gst_type=l.gst_type,gross_unit_cost=gross,line_value=round(gross*l.requested_qty,2),cost_missing=false WHERE request_id=l.request_id;
 total=total+round(gross*l.requested_qty,2); maximum=greatest(maximum,round(gross*l.requested_qty,2));
 END LOOP;
 required=CASE WHEN (CASE WHEN (t.rule_snapshot->>'total_ticket_value')::boolean THEN total ELSE maximum END)>(t.rule_snapshot->>'threshold')::numeric THEN 2 ELSE 1 END;
 state_next=CASE WHEN required=2 AND NOT (t.rule_snapshot->>'sequential_levels')::boolean THEN 'PENDING_L2' ELSE 'PENDING_L1' END;
 UPDATE public.approval_tickets SET state=state_next,total_value=total,routing_value=CASE WHEN (t.rule_snapshot->>'total_ticket_value')::boolean THEN total ELSE maximum END,required_level=required,cost_incomplete=false WHERE ticket_no=p_ticket;
 INSERT INTO public.approval_audit(ticket_no,actor_id,action,details) VALUES(p_ticket,public.approval_actor(),'REPRICE_HELD',jsonb_build_object('old_total',t.total_value,'new_total',total));
 PERFORM public.approval_notify(p_ticket);
 RETURN state_next;
END $$;
CREATE INDEX approval_ticket_stage ON public.approval_tickets(state,created_at);
CREATE INDEX approval_line_ticket ON public.approval_lines(ticket_no);
CREATE INDEX approval_audit_ticket ON public.approval_audit(ticket_no,id);
CREATE INDEX approval_assignment_lookup ON public.approval_assignments(level,department_id) WHERE active;
CREATE INDEX IF NOT EXISTS approval_request_ticket ON public.material_requests(ticket_no);
-- Protect all new data. There are no client write policies; only RPCs write.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['approval_settings','approval_assignments','approval_tickets','approval_lines','approval_audit'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',t);
 EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 END LOOP;
END $$;
CREATE POLICY approval_settings_read ON public.approval_settings FOR SELECT TO authenticated USING(public.approval_actor() IS NOT NULL);
CREATE POLICY approval_assignments_read ON public.approval_assignments FOR SELECT TO authenticated USING(public.approval_actor() IS NOT NULL);
CREATE POLICY approval_tickets_read ON public.approval_tickets FOR SELECT TO authenticated USING(public.approval_actor() IS NOT NULL);
CREATE POLICY approval_lines_read ON public.approval_lines FOR SELECT TO authenticated USING(public.approval_actor() IS NOT NULL);
CREATE POLICY approval_audit_read ON public.approval_audit FOR SELECT TO authenticated USING(public.approval_actor() IS NOT NULL);
-- SECURITY DEFINER helpers must not be callable with invented actors or notification targets.
REVOKE ALL ON FUNCTION public.approval_can_act(bigint,integer,bigint),public.approval_notify(text) FROM PUBLIC,anon,authenticated;
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT oid::regprocedure AS signature,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'approval_%' AND proname NOT IN('approval_can_act','approval_notify') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',p.signature);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',p.signature);
 END LOOP;
END $$;
-- Continue in the same transaction: all preparation is atomic.
ALTER TABLE public.approval_tickets DROP CONSTRAINT approval_tickets_state_check;
ALTER TABLE public.approval_tickets ADD CONSTRAINT approval_tickets_state_check CHECK(state IN('HOLD','PENDING_L1','PENDING_L2','APPROVED','REJECTED','CANCELLED'));
CREATE FUNCTION public.approval_withdraw(p_ticket text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t public.approval_tickets;
BEGIN
 SELECT * INTO STRICT t FROM public.approval_tickets WHERE ticket_no=p_ticket FOR UPDATE;
 IF t.requested_by<>public.approval_actor() THEN RAISE EXCEPTION 'Only requester can withdraw'; END IF;
 IF t.state NOT IN('HOLD','PENDING_L1','PENDING_L2') OR EXISTS(SELECT 1 FROM public.approval_audit WHERE ticket_no=p_ticket AND action='APPROVE') THEN RAISE EXCEPTION 'Cannot edit a processed ticket'; END IF;
 UPDATE public.approval_tickets SET state='CANCELLED' WHERE ticket_no=p_ticket;
 UPDATE public.material_requests SET request_status='REJECTED',remarks=COALESCE(remarks,'')||' [Withdrawn by requester]' WHERE ticket_no=p_ticket;
 INSERT INTO public.approval_audit(ticket_no,actor_id,action) VALUES(p_ticket,public.approval_actor(),'WITHDRAW');
END $$;
CREATE FUNCTION public.approval_replace(p_ticket text,p_items jsonb,p_location_type text,p_location_name text,p_complaint text,p_technician text,p_remarks text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE new_ticket text;
BEGIN
 PERFORM public.approval_withdraw(p_ticket);
 new_ticket=public.approval_submit(p_items,p_location_type,p_location_name,p_complaint,p_technician,p_remarks);
 INSERT INTO public.approval_audit(ticket_no,actor_id,action,details) VALUES(new_ticket,public.approval_actor(),'REPLACES',jsonb_build_object('old_ticket',p_ticket));
 RETURN new_ticket;
END $$;
CREATE FUNCTION public.approval_issue(p_request bigint,p_quantity numeric) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor bigint=public.approval_actor(); r public.material_requests; available numeric; cost numeric; issue_id bigint; issuer text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users_master WHERE id=actor AND upper(role) IN('ADMIN','STORE','STOREKEEPER','FM','AFM')) THEN RAISE EXCEPTION 'Store access required'; END IF;
 SELECT * INTO STRICT r FROM public.material_requests WHERE id=p_request FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.approval_tickets WHERE ticket_no=r.ticket_no AND state<>'APPROVED') THEN RAISE EXCEPTION 'Final approval is required before issue'; END IF;
 IF r.request_status NOT IN('APPROVED','PARTIALLY_APPROVED','PARTIALLY_ISSUED') THEN RAISE EXCEPTION 'Request is not approved for issue'; END IF;
 IF p_quantity IS NULL OR p_quantity<=0 OR p_quantity::text IN('NaN','Infinity','-Infinity') OR p_quantity>COALESCE(r.approved_qty,r.requested_qty)-COALESCE(r.issued_qty,0) THEN RAISE EXCEPTION 'Quantity exceeds remaining approval'; END IF;
 IF p_quantity<>round(p_quantity,2) OR EXISTS(SELECT 1 FROM public.materials WHERE id=r.material_id AND lower(trim(unit)) NOT IN('kg','kgs','kilogram','kilograms','g','gram','grams','l','ltr','ltrs','liter','liters','litre','litres','m','mtr','meter','meters','metre','metres') AND p_quantity<>trunc(p_quantity)) THEN RAISE EXCEPTION 'Invalid issue quantity for this unit'; END IF;
 -- Serialize all workflow issues for the same material to avoid stock races.
 PERFORM id FROM public.materials WHERE id=r.material_id FOR UPDATE;
 SELECT current_stock INTO available FROM public.current_stock WHERE material_id=r.material_id;
 IF available IS NULL OR p_quantity>available THEN RAISE EXCEPTION 'Insufficient stock'; END IF;
 SELECT gross_unit_cost INTO cost FROM public.approval_lines WHERE request_id=p_request;
 IF cost IS NULL THEN SELECT COALESCE(unit_cost,0) INTO cost FROM public.materials WHERE id=r.material_id; END IF;
 SELECT full_name INTO issuer FROM public.users_master WHERE id=actor;
 INSERT INTO public.material_issue_register(request_id,material_id,ticket_no,location_name,location_type,technician_name,issued_qty,unit_cost,total_cost,remarks,issued_by)
 VALUES(r.id,r.material_id,r.ticket_no,r.location_name,r.location_type,r.technician_name,p_quantity,cost,round(cost*p_quantity,2),'Material issued',issuer) RETURNING id INTO issue_id;
 INSERT INTO public.stock_ledger(material_id,transaction_type,quantity,reference_no,request_id,remarks,created_by,transaction_date)
 VALUES(r.material_id,'ISSUE',p_quantity,issue_id::text,r.id,'Issued against ticket '||r.ticket_no,actor,now());
 UPDATE public.material_requests SET issued_qty=COALESCE(issued_qty,0)+p_quantity,
 request_status=CASE WHEN COALESCE(issued_qty,0)+p_quantity>=COALESCE(approved_qty,requested_qty) THEN 'ISSUED' ELSE 'PARTIALLY_ISSUED' END WHERE id=r.id;
 RETURN issue_id;
END $$;
CREATE FUNCTION public.approval_guard_issue() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.request_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.material_requests r JOIN public.approval_tickets t USING(ticket_no) WHERE r.id=NEW.request_id AND t.state<>'APPROVED') THEN RAISE EXCEPTION 'Final approval required'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER approval_issue_register_guard BEFORE INSERT OR UPDATE ON public.material_issue_register FOR EACH ROW EXECUTE FUNCTION public.approval_guard_issue();
CREATE TRIGGER approval_material_issues_guard BEFORE INSERT OR UPDATE ON public.material_issues FOR EACH ROW EXECUTE FUNCTION public.approval_guard_issue();
REVOKE ALL ON FUNCTION public.approval_withdraw(text),public.approval_replace(text,jsonb,text,text,text,text,text),public.approval_issue(bigint,numeric),public.approval_guard_issue() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.approval_withdraw(text),public.approval_replace(text,jsonb,text,text,text,text,text),public.approval_issue(bigint,numeric) TO authenticated;
COMMIT;
