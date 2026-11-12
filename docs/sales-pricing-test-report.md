# Separate sales pricing — 12 November 2026

Prepared against main at 88ab7be. Production Supabase was not accessed or modified.
Schema review used the table, constraint and trigger exports supplied by the user.

Stock entry now accepts a purchase rate and a separate sales rate per unit before
GST. Sales defaults to purchase; an explicit override survives subsequent purchase
edits, and clearing it restores automatic matching. The invoice GST percentage
applies to the sales rate. Purchase invoice totals, Material Master purchase cost
and stock valuation continue to use purchase rates. Excel imports accept optional
Sales Price and GST % columns; existing templates still work.

`material_sales_prices` stores the current sales rate and GST. Each new
`stock_entry_details` row stores its separate sales rate. Insert triggers default
omitted sales rates to purchase and synchronize the current sales rate. The SQL
seeds existing materials from their latest invoice (or master cost when no invoice
exists), preserving existing overrides on reruns. It does not rewrite historical
purchase details or completed issues. Existing details have a null sales snapshot.
Existing issues continue to retain their original saved rates.

Requests, approval displays, issue entry and report suggestions now show the sales
rate including GST. New issues save that gross rate in the existing issue register
so consumption and returns use the original issued rate. Request/approval report
values use the current sales rate; they are estimates, not historical billing
snapshots. This release does not activate or modify the paused secure approval
workflow.

## Verification

- `npm test`: 100 passed, 0 failed.
- Browser test: `BOOTSTRAP_CSS=/tmp/rvrg-bootstrap.css ARTIFACT_DIR=/workspace/artifacts npm run test:sales-browser`.
- Browser checks: default, override, clear-to-default, purchase edits, GST preview,
  purchase totals, sales confirmation and persisted separate prices.
- Example: quantity 2, purchase 100, sales 120, GST 18% produces purchase total
  236, gross sales per unit 141.60 and gross sales value 283.20.
- Layout checks at 1440, 1024 and 768 pixels; no page overflow. Chromium tested;
  native iPad Safari was not available for this test.
- Local PostgreSQL (PGlite): migration, repeat application, history preservation,
  sales default/override, negative-price rejection, public read and denied direct
  public writes to the new sales table.
- Issue-flow test: an issue saves 141.60 per unit and 283.20 total rather than the
  100 purchase rate. Request/approval reports use the sales rate.
- Missing migration fails before creating any part of a stock entry. Unconfirmed
  saved sales prices prevent stock movement and display a partial-save warning.
- Browser tests used simulated data and made zero production requests.

## Deployment order

1. Run `supabase/migrations/20261112_sales_pricing.sql` in Supabase SQL Editor as
   postgres, first against a representative staging schema. The final result must
   show both installation checks true. An empty staging project needs the existing
   base tables first.
2. Deploy this app revision only after the migration succeeds. Existing app code
   remains compatible with the additive migration, so the database step comes first.
3. Check a test invoice, request, issue and return in the target environment.

The new pricing table permits SELECT for the existing anon/authenticated API roles.
Direct writes to it are denied; stock-entry triggers synchronize rates. Existing
login, table policies and privileges are unchanged. The wider authentication and
security upgrade remains a separate, paused task.
