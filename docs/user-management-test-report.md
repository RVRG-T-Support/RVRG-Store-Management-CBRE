# User management and profile photos — 13 November 2026

Prepared against main af0fd46. Tests used simulated accounts and local PostgreSQL;
no production users, passwords or database schema were changed during testing.

## Behavior

- The missing password-toggle function is implemented, with accessible show/hide
  labels and pressed state. Editing or clearing the form masks the field again.
  Existing passwords are not loaded into the form; leaving the field blank keeps
  the password unchanged, and entering a new password replaces it.
- Existing usernames can be edited. Blank or duplicate usernames are rejected;
  keeping the user's own current username is allowed. The database's existing
  username uniqueness constraint remains in force.
- Executive and Supervisor are included in role selection and filtering.
  Navigation and page checks use the admin's section assignments for these roles;
  neither role gains User Management access. Users without Dashboard access are
  directed to their first assigned page. The staged Auth admin endpoint accepts
  the new titles, but this change does not deploy or enable the paused Auth flow.
- A button beside the header name opens a profile-photo dialog. The logged-in
  user can preview, save, replace or remove a photo. JPEG, PNG and WebP uploads
  up to 5 MB are center-cropped and resized to a 256px JPEG, limited to 100,000
  characters in the database. Header loading requests only that user's photo.
  Photos are stored in users_master rather than browser-only storage.
- Account-switch checks prevent stale loads or in-flight saves from displaying
  another account's image. Existing table privileges and login are unchanged;
  the broader authentication/security migration remains a separate task.

## Validation

- `npm test`: 119 passed, 0 failed.
- `BOOTSTRAP_CSS=/tmp/rvrg-bootstrap.css ARTIFACT_DIR=/workspace/artifacts npm run test:users-browser` passed.
- Browser coverage: show/hide, editable username, duplicate rejection, blank
  password preservation, Executive update, Supervisor option, assigned navigation,
  photo compression/save/reload/remove and account isolation.
- Photo dialog centered at 1440, 1024 and 768px viewport widths. Chromium tested;
  native iPad Safari was not available.
- Local SQL: additive photo-column migration and repeat execution preserve user
  fields/photos, keep separate users' photos isolated and reject external URLs
  or SVG data. Existing role and username fields are retained.
- No production requests were made by the browser test.

## Deployment

Run `supabase/migrations/20261113180000_profile_photo.sql` in the main project's
SQL Editor as postgres. The final `profile_photo_installed` value must be true.
It only adds a nullable column and does not update existing user records. Deploy
the app revision after the migration. Missing photo schema is handled with a setup
message rather than a failed header render. No Storage bucket is needed.
