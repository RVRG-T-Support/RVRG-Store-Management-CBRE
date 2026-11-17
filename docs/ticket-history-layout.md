Request, approval and issue ticket histories
===========================================

Histories now display one bordered card per MR, with complaint number, raised date, department/technician, location and material count in its header. Individual materials appear beneath it with complete wrapping descriptions, requested/approved/issued quantities and their own statuses. Approval history includes each material's approval date. The Issue Desk uses the same light teal headers/borders and alternating rows, with stock, sales rate, remaining approval and the existing per-material issue controls.

Paging counts complete tickets (10/20/50) rather than material lines. Eligible MR numbers are selected using each view's status filter; approval and issued history then fetch all lines for those selected tickets so mixed-status materials remain together. The metadata and detail queries both use bounded batches. Stable ticket order and per-ticket material order prevent split or duplicated MR headings across page boundaries. Search still matches Complaint/MR number before paging. A visible ticket-specific horizontal slider appears when the material columns do not fit.

The Material Request form is full-width above its history. Its fields use a grid, with full-width material selection rows beneath them and remarks/submit below. The former narrow side-by-side history, fixed-height material rows and ellipses are removed. Pending request Edit/Delete actions keep their existing handlers and server-side checks. A pending line without approval no longer displays its requested quantity as though it were approved.

Shared presentation is in ticket-layout.css and ticket-view.js; stock movements, quantity-limit RPCs, pricing, approvals and data records are unchanged. No Supabase SQL is required. The live data for MR-2026-0478 was not queried from this workspace; its presentation was reproduced with long-name, six-material and mixed-status fixtures.

Validation: npm test passed. Chromium tests passed for all four record pages, over 1,000 seeded lines, whole-ticket pagination, complete mixed-status tickets, long names, form-above-history geometry, edit/delete and approve/reject callback targets, one-unit issue controls, manual litre fractions, and horizontal sliders. Previews use test data.

Material entry refinement
-------------------------

Material cards now use the full form width, one per row. Search and requested quantity share a row; the material code/name appear once in a clear heading, with category/brand/type/size/specification/unit grouped below and separate stock and GST-inclusive sales summaries. Redundant code/name detail labels and the former two-column card arrangement are removed. Search suggestions, selection/clearing, quantity settings, out-of-stock and duplicate checks are preserved. Browser checks cover full-width/compact cards and changing/reselecting a material with quantity focus and state retained.
