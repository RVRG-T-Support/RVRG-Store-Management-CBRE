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


## New-material GST correction

New materials created after installation have no invoice sales row yet. Their
default sales rate now applies the Material Master GST type and percentage.
Material, request, approval, issue and report lookups carry those GST fields.
The Material Master list shows purchase cost including GST and the separate base
price. Stock entry seeds a blank purchase rate and GST percentage from the master;
an inclusive master rate is converted to the pre-GST input to prevent double tax.
Saving a receipt synchronizes both purchase rate and GST metadata to the master.
An explicit invoice sales-price override continues to take precedence.

Regression example: base 68, excluded GST 18%, quantity 1 => total 80.24.
Included master price 80.24 => pre-GST stock-entry rate 68 and total 80.24.
No new migration or historical-data rewrite is required. The expanded automated
suite has 102 tests, with browser coverage for both exact GST cases.


## Independent sales GST choice

Stock-entry sales prices now have an Inclusive/Exclusive selector, defaulting to
Inclusive. A manually entered 100 stays 100 in inclusive mode and becomes 118 in
exclusive mode with 18% invoice GST. Unedited automatic sales pricing preserves
the purchase gross amount: a 68 purchase with 18% GST defaults to an inclusive
sales amount of 80.24, or a base amount of 68 when changed to Exclusive.

The additive `20261112170000_sales_gst_option.sql` migration adds a nullable
`sales_gst_type` snapshot to stock-entry details. New app entries explicitly save
the chosen type; old app entries keep the prior purchase-GST interpretation when
the column is omitted. The sales-price synchronization trigger uses the separate
sales choice. No old price, invoice or issue rows are rewritten. Run this migration
after the existing sales-pricing migration and before deploying the new app.

104 automated tests passed. Browser checks covered default Inclusive mode,
manual 100 inclusive => 100, changing to Exclusive => 118, separate saved purchase
and sales types, invoice totals, and layouts at 1440/1024/768 pixels. Local database
checks covered both types, old-app compatibility and repeat migration execution.
The app checks for the new column before writing any invoice data.


## Stock-entry order and Excel redesign — 13 November 2026

The purchase columns now precede sales: Department & Material, Quantity, Unit,
Purchased Amount per unit, Purchased GST, Purchase Total, Sales Amount per unit,
Action (with the existing row number retained). Summary values align under the
purchase-total column. Reduced page padding gives more space to the table.

The workbook has Department, Material Code, Material Name, Quantity, Unit,
Purchased Amount, Purchased GST %, Purchased GST Amount, Purchase Total,
Sales Amount, Sales GST Type. Every column has an explicit width; the styled
header wraps, reference columns have alternating shading and input columns are
yellow. Purchase GST and total formulas are provided for review. An Instructions
sheet explains the per-unit rates, optional sales override and GST choices.
The page uses pinned xlsx-js-style 1.2.0 for writing these Excel styles.

Uploads accept both the redesigned headings and the old Unit Price/GST %/Sales
Price headings. Untouched catalogue rows are skipped; entered values are
validated and invoice totals are recalculated instead of trusting spreadsheet
formula results. No database migration is required.

Validation: 108 automated tests passed. Browser checks verified actual column
positions, purchase/sales calculations, desktop/tablet layouts, a styled Excel
file download and upload of that edited workbook. The template was roundtripped
through the real Excel library to check widths, styles, formulas, filters and
instructions. No production records were created by testing.
