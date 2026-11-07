# Approval levels — review draft

Branch: `development-approval-levels`. Production Supabase and `main` have not been changed. The backup branch is untouched. No password-reset feature is included.

## Behaviour

Admin opens **User Management → Data Management — Approval Settings**. Admin can assign any active user, including AFM/CRM, to Level 1 or Level 2 for one department or all departments. A user may hold assignments at both levels but cannot approve both stages of the same ticket. The requester cannot approve their own ticket. Admin has no hidden approval override: Admin also needs an assignment and cannot self-approve.

Initial settings:

- Whole-ticket value including GST: on. If switched off, use the largest extended material-line value, not unit price alone.
- Above INR 3,000: Level 1 then Level 2: on. At exactly INR 3,000, Level 1 suffices. If sequential mode is off, high-value tickets go directly to Level 2.
- Missing/zero-cost hold: off. Tickets display **Cost incomplete**. Missing prices contribute zero and can understate the approval route during testing; this is intentional and must be reviewed before ending the testing phase.

For GST INCLUDED, unit cost is already gross. For GST EXCLUDED, GST is added. No double GST is added. A submission saves prices, GST values, material descriptions, requested quantities, calculated line values, total and applicable rule revision. Later price/threshold changes do not change that ticket's approval route. Check existing material GST labels for correctness before deployment: invoice input uses pre-GST prices. Secure-mode stock entry now synchronizes GST type/rate along with price, but historic master values may have inconsistent labels and are not automatically rewritten.

Approvers can reduce individual approved quantities, retaining the existing partial-approval capability. Level 2 cannot exceed Level 1's quantities. Partial approval never lowers the required approval level. Until final approval, the legacy request rows remain PENDING and cannot be issued. Final approval updates the existing request fields so existing reports continue to work; the new audit view shows both stages.

Rejected requests require a reason. Held requests cannot be approved or issued. Admin must correct all costs/GST values and explicitly recheck a held ticket; this reprices it, routes it against its originally saved threshold/options and records old/new totals. Completed tickets are never repriced.

Editing a wholly pending, unapproved ticket is transactional: its old history is marked withdrawn, and a replacement receives a new ticket number and new snapshot. An edit cannot discard an already completed approval stage. Withdrawal preserves audit history. New stock issues use an atomic database function with approved-quantity, current-stock and unit checks. Already completed historical requests are not rewritten.

## Files

- `supabase/migrations/20261107_approval_workflow.sql`: new schema, Auth link column, protected RPCs, RLS for new tables and issue guard triggers. Workflow remains disabled.
- `supabase/activate_approval_workflow.sql`: **separate cutover**, not part of automatic installation. Revokes unauthenticated table access, protects users/permissions and request/issue writes, disables the old broad notification trigger and enables the new workflow.
- `approval_management.html`, `approval_workflow.html`, `approval-workflow.js`: Admin settings, assignments, approval queue and audit display.
- `secure-auth.js`, `config.js`: opt-in Auth integration. `RVRG_APPROVAL_WORKFLOW_ENABLED` remains **false**.
- `supabase/functions/admin-users/index.ts`: verified Admin user creation, password changes and activation/deactivation. Uses the server-side service-role key; never embed that key in the frontend.

## Staging rollout — do not run against production yet

1. Use an isolated Supabase staging project with the actual schema/functions/views restored. The automated fixture tests model the supplied tables; they do not replace a complete staging restore. Take a recoverable backup of production before any eventual cutover.
2. Apply the schema migration to staging once. It is versioned, intentionally not an indefinitely rerunnable installer. Do not run the activation script yet.
3. Create Supabase Auth accounts for active users using the Dashboard or a trusted server-side Admin API. An Admin can choose their passwords; use at least 12 characters. Do not export passwords, reuse screenshots of them, put them in SQL files or commit them. Preserve each numeric users_master.id; link the Auth UUID in the new auth_user_id column. No automatic match by email or copying plaintext passwords is performed. Correct invalid/missing email addresses first.
4. Deploy the `admin-users` Edge Function to staging with JWT verification enabled. Configure `APP_ORIGIN` to the exact frontend origin (scheme and host, no path/trailing slash). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are server-side runtime credentials. Keep these out of Git and browser config. This function's API was tested with mocks; real Auth and Edge runtime deployment still need staging validation.
5. In a private staging frontend build, set the feature flag true and point config.js at the staging URL/publishable key. Secure login uses email/password; usernames remain display/management fields. The existing production branch remains false and unchanged. Log in as the linked Admin and assign both levels before activating.
6. Resolve legacy PENDING/PARTIALLY_APPROVED tickets before cutover, or review a separate explicit conversion plan. Activation intentionally stops if it finds unresolved legacy tickets. It does not silently grandfather them or erase them. Completed historical rows remain unchanged. Confirm coverage has enough active, distinct approvers for every department, excluding the requester.
7. Apply the activation script in staging and test login/logout, Admin-set passwords, account disablement, stock entry/returns, reports, low/high-value requests, notifications, partial approvals, rejection, held-cost correction, pending edits and issuing. Do not enable RLS alone in production.
8. Review and approve the final staged SQL and application version. Schedule a maintenance window to coordinate the eventual frontend flag and database cutover. Nothing in this branch deploys or applies SQL automatically.

## Authentication and security boundary

The current app's local-storage numeric user ID is insufficient for database enforcement. New RPCs derive identity from `auth.uid()` and an active linked account, regardless of cached browser claims. Password changes remain Admin-managed through the trusted Edge Function. New Auth users' passwords are not stored in users_master. Existing plaintext password columns are retained during this review; removing historical passwords after verified migration is a separate reviewed cleanup. Do not mistake the disabled legacy mode for secure Auth mode.

The activation draft provides approval-related authorization, not the later complete security-hardening stage. Existing views, grants, unrelated SECURITY DEFINER functions, existing material/stock-edit permissions, return operations, access scope and all remaining table policies must be reviewed in staging. Stock and cost editors remain trusted operational users. Do not claim comprehensive Supabase/GitHub security from these scripts.

No blind rollback to the old browser login is provided: after any live approvals, disabling controls could bypass pending levels. Before activation, reverting the feature-off frontend is safe. After activation, use a maintenance window and reviewed rollback/restore plan that preserves newly created tickets and audit events. The original legacy notification trigger is retained but disabled by activation; do not re-enable it while the new workflow is processing tickets.

## Reproducible local tests

Use Node 24 (including the built-in TypeScript stripping API for Edge Function mock tests):

```sh
npm ci --ignore-scripts
npm test
```

PGlite runs real PostgreSQL/PLpgSQL in-process. Tests build a fresh isolated database from `tests/fixtures/approval-schema.sql`, execute the actual migration and activation scripts, set authenticated identities and exercise the RPCs and RLS. No production connection is used. Existing regression tests still run with the feature disabled. There is no production application build step: the frontend remains static HTML/JavaScript. Playwright browser validation also exercised Admin settings and Level 1/Level 2 approvals against the local database with network requests blocked. Mock tests do not establish live email/Auth delivery, Edge deployment, or staging compatibility.

To repeat the browser check with a local Chromium installation:

```sh
CHROMIUM_PATH=/usr/bin/chromium npm run test:approval-browser
```

Screenshots are written to ignored `test-results/` (or `ARTIFACT_DIR`). Set `BOOTSTRAP_CSS` to a locally downloaded copy of the app's pinned Bootstrap 5.3.0 CSS for styled screenshots. All network requests are intercepted; no Supabase endpoint is contacted.
