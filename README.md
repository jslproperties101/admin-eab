# Admin EAB

Compliance and administration app for **Estate Agent AI Buddy** (JSL). Separate app, separate repo, separate Android
package (`com.jslproperties.admineab`), but it reads the **same Supabase database** as the main app
(`jslproperties101/estate-agent-buddy`). Core purpose: a complete, tamper-evident audit trail of who did what, kept 7 years,
exportable to PDF and Excel for Jabatan Penilaian (JPPH) and the police.

Works on phone, tablet, laptop and desktop: the same build is the web version and goes inside the Android APK.

## Security model
- Sign-in is Google (Supabase Auth, PKCE). Signing in is not enough: the database allow-list `eab_admins` decides who
  gets in. Anyone else is signed out at once.
- The app holds only the **public** key. It never has the service-role key; the build and the connection screen refuse one.
- Every read and write goes through `eab_admin_*` database functions that check the role first and log the access.
  Hiding a button in the app is only a convenience; the database is the protection.
- Roles: **Owner** (everything), **Admin** (daily operations), **Compliance** (records, exports, logs), **Viewer**
  (dashboards only), **Regulator** (temporary, read-only, limited to named agents, with an expiry).
- Two hash-chained logs that nobody can change or delete: admin actions and admin access (who viewed, searched or exported
  what). "Check log integrity" re-computes the chain.
- Signs out after 15 minutes without use. Risky actions need a typed reason and a second confirmation.
- Android: screens are kept out of screenshots and the recent-apps preview.

The database side lives in the main repo: `supabase/migrations/20261021000000_admin_eab_foundation.sql`
(tests: `supabase/tests/admin_eab_foundation_test.sql`).

## Build and test
```
npm install            # needs internet
npm test               # type check + unit tests + build + browser screen tests (fake database)
npm run build          # dist/ — set EAB_SUPABASE_URL and EAB_SUPABASE_ANON_KEY (public key) in .env first
npm run serve          # http://localhost:5174
```
The Android APK is built by GitHub Actions on every push and attached to a GitHub Release `admin-<commit>`.

## First owner
Run once in the Supabase SQL editor (the person must have signed in with Google once):
```sql
insert into public.eab_admins (user_id, email, role)
  select id, email, 'owner' from auth.users where lower(email) = lower('YOUR-EMAIL@gmail.com');
```
Further admins are added in the app (Admins & Roles), which records each change with a reason.

## Google sign-in return addresses
In Supabase → Authentication → URL Configuration → Redirect URLs, add:
- `com.jslproperties.admineab://auth-callback` (Android app)
- the web address the Admin EAB web version is opened from (e.g. `http://localhost:5174/` for local testing)

## Status
AdminBatch004: System Health — Database Health (sizes, connections, cache hit rate, slow queries, tables), Storage
Forecast (used vs free boxes for the database and stored files; full-by date from a daily reading and upload dates),
Backup Status (Supabase and AWS boxes; plan limits and AWS state set by Owner/Admin with a reason), Backup Restore Test
log (kept for good, cannot be changed or deleted), Sync per day and per agent, Push delivery (sent / delivered / opened),
App Performance (start time by version, opens per day, versions in use), Problems (agents' problem reports and recorded
failures), and a System Health report (PDF / Excel, reference number) for Owner/Compliance. Uptime needs an outside
monitor; crash-free rate needs crash reporting in the main app. Needs `20261022000000_admin_batch_004_health.sql`.

AdminBatch003: Regulator Request case files (JPPH / police / court / board / PDPA), agents per case with periods,
Owner-only temporary regulator access per case (max 90 days, ends at once on revoke), case packs (PDF / Excel) with a
cover page, reference number and content fingerprint, the Document Vault (private bucket `eab-vault`; files can never be
changed or deleted; downloads re-check the fingerprint) and "Check a file". Every agent-profile export is vaulted too.
Needs `20261021130000_admin_batch_003_cases.sql` in the database.

AdminBatch002: Agents list (overview, login security, not active, licence), account status actions (suspend / ban / close /
re-activate, force sign-out) with reason + confirmation, licence verification, sign-in history and Terms tabs, System
Settings (company name, support email, address), exports include sign-ins, Terms and the company name. Needs
MainForAdmin-B + `20261021120000_admin_batch_002_reads.sql` in the database.

AdminBatch001: shell, Google sign-in with allow-list and roles, idle sign-out, sectioned home with every planned feature,
global search, Agent Profile Viewer (all records including deleted, full change history), PDF/Excel export with reference
numbers, Master Audit Log, access log, integrity check, Admins & Roles. Requirements: Dropbox `/Admin EAB/`.
