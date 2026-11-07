# Approval workflow — local test report

Review branch: `development-approval-levels`.

## Outcomes

72 automated tests passed; 0 failed. All standalone and inline JavaScript syntax checks passed. Existing 44 regression tests remain passing with the workflow disabled.

- 17 PostgreSQL tests execute the actual migration and cutover scripts using PGlite: exact INR 3,000 boundary; whole-ticket/GST valuation; Level 1 then Level 2; partial quantities; final-approval issuing; stock/quantity limits; zero-price warnings and optional holds; explicit held-ticket repricing; Admin settings/assignments; self/wrong-department approval rejection; denied direct writes; immutable snapshots; audit/rejection behaviour; atomic editing; disabled/unlinked accounts; feature-off legacy compatibility and fail-closed cutover prerequisites.
- 5 Auth bridge tests cover opt-in mode, verified profiles and permissions, unlinked-account sign-out, backend password operations and the checked-in disabled feature flag.
- 5 Edge Function mock tests cover invalid JWT/non-Admin/origin rejection, password validation, Admin account creation without storing passwords in users_master, backend password changes and preventing self-disable/demotion.
- The stock-entry regression suite now also confirms secure-mode GST type/rate synchronization for pre-GST invoice prices.

## Browser integration

Chromium interacted with the real new HTML/JavaScript screens connected only to the isolated local PostgreSQL database:

- Initial three switches: on, on, off.
- Admin threshold change saved and verified in SQL, then reset to the default INR 3,000 for the preview.
- Level 1 advanced a high-value ticket to PENDING_L2.
- Level 2 completed it as APPROVED.
- Non-Admin settings access was blocked.
- Disabled feature kept configuration/queue hidden safely.
- No browser page errors; no production requests.

Reproduce with `npm ci --ignore-scripts`, `npm test`, and `CHROMIUM_PATH=/usr/bin/chromium npm run test:approval-browser`. See approval-workflow-review.md for screenshots, optional Bootstrap CSS and staging steps.

## Limits

PGlite is a real embedded PostgreSQL engine, but the test fixture models the supplied database definitions rather than restoring the full Supabase project. Auth identity claims are simulated for database tests. Edge APIs are mocked; no real Auth accounts or Edge Functions were created. Production migrations, account linking, deployed login, notifications/realtime delivery, complete staging compatibility and broader security-hardening remain unverified. No SQL was applied to production, no settings were activated and no changes were merged into main.
