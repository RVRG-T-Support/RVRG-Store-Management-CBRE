Material issue limits and record browsing
========================================

The legacy Issue Desk validated stock availability but did not reject a quantity above the remaining approval. It also calculated completion using requested quantity or exhausted stock, and excluded partially approved/partially issued requests from its queue.

The Issue Desk now shows Requested and Approved separately, caps input by remaining approval and stock, rejects excessive quantities before confirmation, includes partial requests, and prevents double taps. Completion uses approved quantity; exhausted stock leaves any unfulfilled approved quantity pending. The server operation snapshots the current gross sales rate and saves the issue register, stock movement, and request total in one transaction. UUID retries return the saved result without another stock deduction. Existing issue-history values above approval remain visible with a red review warning.

Deployment
----------

Run `supabase/migrations/20261116_issue_quantity_guard.sql` as postgres in the MAIN Supabase project. The new frontend requires this RPC for issuing; a missing installation displays an Admin setup message instead of falling back to separate writes. The migration adds retry columns/indexes and quantity guards; it does not rewrite existing rows, change prices/stock, enable Auth/RLS, or activate amount-based approval.

This is compatible with the current legacy login. It uses caller table permissions (SECURITY INVOKER), and accepts a legacy actor ID. It does not replace the paused Auth migration or solve legacy identity spoofing. A verified Auth session must match `app_user_id()` when present; a future Auth cutover must adapt remaining grants and use verified identity throughout. Both raw issue-register inserts and request issued-total updates receive database quantity checks. Historical discrepancies between the request total and actual register total block additional checked issues until reconciled.

Run the read-only `supabase/check_ticket_issue_totals.sql` against MAIN to investigate MR-2026-0363. It compares requested/approved quantities, stored issued total, register entries, returns, and ISSUE ledger quantity. Do not rewrite 11 to 1 or add stock before confirming which records are wrong and what was physically issued. The development workspace cannot reach the live Supabase host (network proxy returns 403), so this ticket has not been queried or corrected remotely.

Browsing
--------

Raise Request, Approvals, Issue Materials and Returns now have Complaint/MR search and 10/20/50 page sizes, default 10, with Previous/Next and totals. Each queue/history table can be searched independently. Search applies before pagination, supports partial/case-insensitive matches and the `MR:` prefix, and searches historical records rather than just the displayed page. Raise Request and pending approval paginate complete tickets; their page sizes explicitly count tickets. Other tables paginate material/issue/return records. Return search resolves complaint numbers to their MR tickets for both issued records and return history. Recent returns now load automatically.

Full detail queries for ordinary tables use counted server ranges. Grouped ticket tables fetch bounded batches of lightweight ticket metadata, then fetch full details only for the selected tickets, including all their material lines. All batch queries use a stable ID tie-breaker; old search responses cannot overwrite newer results. This avoids the old 20/50-row hard limits and the default 1,000-row response truncation.

Validation
----------

- `npm test`: repository regression suite passed.
- `node --test tests/issue_quantity_db.test.cjs tests/issue_sales.test.cjs`: locally tested SQL installation/reinstallation, approval caps, cumulative/raw-write guards, partial/completed status, duplicate UUIDs, double taps, lost responses, sales GST snapshots, denied section access, mismatched totals, and atomic rollback after a ledger failure.
- `BOOTSTRAP_CSS=/path/to/bootstrap.css node tests/browser/record-browser.cjs`: local Chromium with mocked backend across all four pages, over 1,000 seeded material lines, Complaint/MR search, whole tickets, 10/20/50, Previous/Next, clear/no-match behavior.

No live data was modified and no production database migration was executed from this workspace. Real simultaneous sessions and Supabase deployment still require live validation after the SQL installation.

Confirmed typing-error correction
--------------------------------

The supplied MAIN audit showed request1022 / PLB-179 / issue630 had approved1, requested1, and issued11 consistently in request, register and ledger. The user subsequently confirmed only1 was physically issued;11 was a storekeeper typing error.

`supabase/repairs/20261116_MR-2026-0363.sql` is a manual MAIN-only repair, not an automatic migration. It locks and validates the exact request, material code, issue and original ledger link; refuses changed records, returns, extra issue records, legacy issues or missing historical rates; then changes all three issued quantities to1 and recalculates total cost using the unchanged saved unit rate. Correcting the original deduction increases stock by10 and corrects issue-based consumption without creating a fictitious return. Original dates are preserved. Old rows are saved as JSON in an owner-only RLS-protected correction log. A repeated run restores no additional stock. Any validation failure rolls back the transaction.

`node --test tests/issue_correction.test.cjs tests/issue_quantity_db.test.cjs` passed with the installed quantity guards, including exact stock/consumption/amount corrections, preserved dates and other requests, repeat safety, audit privacy and rollback on unexpected records. Live execution still belongs to the user via MAIN SQL Editor as postgres; the assistant has not applied it to production.

One-unit controls and remaining approvals
----------------------------------------

The earlier screenshot of MR-2026-0421 showed 2 approved and 1 already issued. A new entry of2 therefore exceeds its remaining approval of1. The updated queue displays issued and remaining quantities beneath approval, and explains the available limit beside an invalid input; its submit check uses fresh request data. No historical issued quantity for this ticket is reset or increased.

Quantity +/- buttons and keyboard arrows now move by exactly1. Custom buttons replace native spinners so the litre input can use `step=any` and accept manually typed fractions such as0.5 without browser step-mismatch errors. All non-litre units require whole numbers. Litre aliases L/LTR/LTRS/LITER/LITERS/LITRE/LITRES are matched without case, whitespace or dots, and fractions support at most2 decimal places. The button range never exceeds remaining approval or available stock.

For an existing MAIN installation, run `supabase/migrations/20261116_issue_quantity_units.sql` as postgres. It updates the existing issue RPC and register guard to enforce the same litre-only policy, preserving quantity caps, transactional stock updates, retries and original prices. It rewrites no historical rows or stock. New installations use the revised full issue-quantity migration and can safely rerun the incremental unit update.

Targeted SQL/client tests and local Chromium tests passed for one-unit buttons and arrows, manually typed0.5litres (including native validity), fractional count/KG/metre rejection, displayed remaining approval, and excess quantity rejection. Live access to the production ticket is unavailable from this workspace; its current values are displayed and rechecked by the running application.
