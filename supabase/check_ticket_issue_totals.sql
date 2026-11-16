-- Read-only: run in the MAIN project as postgres and share these result rows.
-- Includes actual issue-register totals, returns and stock movements; changes no data.
SELECT r.id AS request_id,r.ticket_no,m.material_code,m.material_name,
 r.requested_qty,r.approved_qty,r.issued_qty AS request_issued_total,
 coalesce(i.total,0) AS register_issued_total,
 coalesce(ret.total,0) AS returned_total,
 coalesce(l.total,0) AS ledger_issue_total,
 i.issue_records,
 r.issued_qty>least(r.requested_qty,coalesce(r.approved_qty,r.requested_qty)) AS exceeds_approval
FROM public.material_requests r
JOIN public.materials m ON m.id=r.material_id
LEFT JOIN LATERAL (SELECT sum(issued_qty) AS total,jsonb_agg(jsonb_build_object(
 'issue_id',id,'quantity',issued_qty,'issued_at',issued_date) ORDER BY id) AS issue_records
 FROM public.material_issue_register WHERE request_id=r.id) i ON true
LEFT JOIN LATERAL (SELECT sum(rt.returned_qty) AS total FROM public.material_returns rt
 JOIN public.material_issue_register ir ON ir.id=rt.issue_id WHERE ir.request_id=r.id) ret ON true
LEFT JOIN LATERAL (SELECT sum(abs(quantity)) AS total FROM public.stock_ledger
 WHERE request_id=r.id AND transaction_type='ISSUE') l ON true
WHERE r.ticket_no='MR-2026-0363'
ORDER BY r.id;
