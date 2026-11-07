-- SEPARATE, REVIEWED CUTOVER ONLY. Never run this on production during development.
-- Prerequisites: tested Auth account links, application secure mode, deployed
-- admin-users Edge Function, assigned L1/L2 approvers, and a verified backup.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users_master WHERE upper(role)='ADMIN' AND is_active IS TRUE AND auth_user_id IS NOT NULL) THEN RAISE EXCEPTION 'Link an active Admin Auth account first'; END IF;
 IF EXISTS(SELECT 1 FROM public.users_master WHERE is_active IS TRUE AND auth_user_id IS NULL) THEN RAISE EXCEPTION 'Link every active user to Auth before cutover'; END IF;
 IF EXISTS(SELECT 1 FROM public.material_requests r WHERE request_status IN('PENDING','PARTIALLY_APPROVED') AND NOT EXISTS(SELECT 1 FROM public.approval_tickets t WHERE t.ticket_no=r.ticket_no)) THEN RAISE EXCEPTION 'Resolve legacy pending/partially approved requests before cutover; no automatic backfill'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.approval_assignments WHERE level=1 AND active) OR NOT EXISTS(SELECT 1 FROM public.approval_assignments WHERE level=2 AND active) THEN RAISE EXCEPTION 'Assign both approval levels first'; END IF;
END $$;
-- Retain existing material-request rows and identities; seed above legacy serials.
SELECT setval('public.approval_ticket_number',greatest(1,COALESCE((SELECT max(substring(ticket_no FROM '[0-9]+$')::bigint)+1 FROM public.material_requests WHERE ticket_no ~ '^MR-[0-9]{4}-[0-9]+$'),1)),false);
ALTER TABLE public.material_requests DISABLE TRIGGER trg_material_request_notifications;
-- No unauthenticated application access after verified Auth cutover.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE INSERT,UPDATE,DELETE ON public.material_requests,public.material_issues,public.material_issue_register FROM authenticated;
GRANT SELECT ON public.material_requests,public.material_issues,public.material_issue_register TO authenticated;
ALTER TABLE public.material_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_issue_register ENABLE ROW LEVEL SECURITY;
CREATE POLICY approval_request_read ON public.material_requests FOR SELECT TO authenticated USING(public.approval_actor() IS NOT NULL);
CREATE POLICY approval_issue_read ON public.material_issues FOR SELECT TO authenticated USING(public.approval_actor() IS NOT NULL);
CREATE POLICY approval_register_read ON public.material_issue_register FOR SELECT TO authenticated USING(public.approval_actor() IS NOT NULL);
-- Passwords and account links cannot be selected/changed directly by the browser.
REVOKE ALL ON public.users_master FROM authenticated;
GRANT SELECT(id,full_name,email,role,is_active,created_at,username) ON public.users_master TO authenticated;
ALTER TABLE public.users_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY approval_user_read ON public.users_master FOR SELECT TO authenticated USING(public.approval_actor() IS NOT NULL);
-- User and section permissions are Admin-only writes, protected in the database.
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY approval_permission_read ON public.user_permissions FOR SELECT TO authenticated USING(user_id=public.approval_actor() OR public.approval_is_admin());
CREATE POLICY approval_permission_write ON public.user_permissions FOR ALL TO authenticated USING(public.approval_is_admin()) WITH CHECK(public.approval_is_admin());
ALTER TABLE public.application_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY approval_section_read ON public.application_sections FOR SELECT TO authenticated USING(public.approval_actor() IS NOT NULL);
CREATE POLICY approval_section_write ON public.application_sections FOR ALL TO authenticated USING(public.approval_is_admin()) WITH CHECK(public.approval_is_admin());
-- Do not leave the stock ledger as a second path for forged issues.
ALTER TABLE public.stock_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY approval_ledger_read ON public.stock_ledger FOR SELECT TO authenticated USING(public.approval_actor() IS NOT NULL);
CREATE POLICY approval_ledger_insert ON public.stock_ledger FOR INSERT TO authenticated WITH CHECK(
 transaction_type IN('STOCK_IN','RETURN','OPENING') AND EXISTS(SELECT 1 FROM public.users_master WHERE id=public.approval_actor() AND upper(role) IN('ADMIN','STORE','STOREKEEPER','FM','AFM'))
);
REVOKE UPDATE,DELETE ON public.stock_ledger FROM authenticated;
UPDATE public.approval_settings SET enabled=true WHERE id;
COMMIT;
-- IMPORTANT: existing views' security mode and remaining tables/functions still
-- need a broader security review. This is an approval cutover, not a claim of
-- comprehensive hardening. Never expose a service-role key in the frontend.
