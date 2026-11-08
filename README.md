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

## One codebase, six admin apps (AdminBatch010)
`EAB_APP` picks which admin is built. Each is its own Android app, so all install side by side.

| EAB_APP | Admin app | Android package | For |
|---|---|---|---|
| `eab` (default) | Admin EAB | com.jslproperties.admineab | Estate Agent AI Buddy |
| `all` | Admin AI Buddy | com.jslproperties.adminhub | Every app below, with an app switcher |
| `pos` | Admin POS | com.jslproperties.adminpos | AI Buddy POS |
| `mm2h` | Admin MM2H | com.jslproperties.adminmm2h | Malaysia Welcome AI Buddy |
| `odw` | Admin On Da Way | com.jslproperties.adminodw | On Da Way |
| `biz` | Admin Biz | com.jslproperties.adminbiz | AI Buddy Biz |

Sign-in, roles, the allow-list and both tamper-proof logs are shared. AI Buddy Biz has its own database: the admin
signs in to it a second time with Google, and the Biz database's own admin list decides (set `EAB_BIZ_SUPABASE_URL`
and `EAB_BIZ_SUPABASE_ANON_KEY`, or type them on the Biz screen). Database changes: `database/`. Feature lists live in `src/apps.ts`; tiles that
are not working yet say what they need (POS synced to the server; MM2H app data is on the phone only; On Da Way not
linked; AI Buddy Biz has its own database, not linked yet).

## Build and test
```
npm install            # needs internet
npm test               # type check + unit tests + build + browser screen tests (fake database)
EAB_APP=all npm run build   # combined admin; default is eab
npm run build          # dist/ — set EAB_SUPABASE_URL and EAB_SUPABASE_ANON_KEY (public key) in .env first
npm run serve          # http://localhost:5174
```
GitHub Actions builds one APK per admin on every push: Admin EAB in Release `admin-<commit>` (unchanged), the others in
`admin-<app>-<commit>` (e.g. `admin-all-<commit>` for the combined Admin AI Buddy).

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
AdminBatch013 (0.13.0, 9 Nov 2026, Batch 2b): AI Buddy Biz moved INTO the same Supabase project as Estate Agent AI
Buddy (EAB-QA-Test while testing), in its own schema `biz` (Joe, decision D-7N-2). The Biz screens now use Admin EAB's
own connection with schema `biz` (sent as Accept-Profile / Content-Profile); nothing to type. Biz keeps its own admin
list and its own Google sign-in (`<package>://biz-callback`). The build settings `EAB_BIZ_SUPABASE_URL` / `_ANON_KEY`
pointed to the retired Biz project and are no longer used. Database: `database/20261109120000_biz_admin_in_eab_qa_test.sql`
(GENERATED from `20261030130000_biz_admin.sql` by `database/tools/to-biz-schema.mjs`; apply AFTER the Biz tables, which
come from the ai-buddy-biz repo `supabase/eab-qa-test/20261109120000_biz_schema.sql`). Local proof:
`database/tests/run-bizqa.sh <ai-buddy-biz checkout>`. The Biz admin file's status words were also corrected to the real
Biz tables (sales `voided` / `refunded`, children `enrolled`, compliance `not_applicable`).

AdminBatch012 (0.12.0, 9 Nov 2026): ONE admin codebase again. AdminBatch010 "Content & Maps" and AdminBatch011 "Money"
(built on a separate line) were merged into the multi-app line (Joe's choice, 8 Nov). Placement (Joe): Moderation and
Content insight stay in the Estate Agent AI Buddy space; Money is its own company-wide space, "Company Money", shown in
the combined admin and in Admin EAB (not in Admin POS / MM2H / On Da Way / Biz). The database for 010 and 011 had never
been written (both were built against the fake test database only); it was rebuilt from the screens:
`database/20261109000000_admin_batch_012_content_money.sql` (24 functions, 6 tables, a storage rule for listing photos;
undo file in `database/rollback/`; tests `database/tests/b12_00_stubs.sql` + `b12_10_tests.sql`). Applied to EAB-QA-Test
only, 9 Nov 2026, in 6 parts (admin_batch_012_p1 ... p6). Production untouched. From now on Admin EAB database files live
in this repo's `database/` folder (Joe, 8 Nov).

AdminBatch010 "Apps" (multi-app, 31 Oct): one codebase for EAB, AI Buddy POS, MM2H, On Da Way and AI Buddy Biz (see the
table above). Needs `database/20261030120000_admin_batch_010_apps.sql` (EAB database) and `20261030130000_biz_admin.sql`
(Biz database).

AdminBatch009 Merged (0.9.1): one app with both Agent insight and Market. Database order: 008 Reports, then
`20261027000000_admin_batch_009_agents.sql`, then `20261027100000_admin_batch_009_market.sql` (either order works;
no shared function names).

AdminBatch009 "Agent insight": Agent scorecard (Listings 40 + Activity 30 + Compliance 30, lowest first, with the reasons;
score card on each Agent Profile; Viewer sees the spread only), Onboarding funnel (sign-up → opened → Terms → licence →
verified → first listing → first deal; "who is stuck" for Owner / Admin / Compliance), Bulk actions in the Agents list
(up to 50 agents: suspend, re-activate, sign out, tag, or message them as a broadcast for just those agents; one reason,
two steps, batch reference BULK-YYYY-####), Duplicate accounts (same phone number, phone or licence), Phones tab on the
Agent Profile (every phone used; Owner / Admin can remove one, which signs it out — needs the main app MainForAdmin-G).
Needs `20261027000000_admin_batch_009_agents.sql` (main repo branch feature/admin-batch-009-db).

AdminBatch009 "Market": Listings & market — Listing quality score out of 100 with a "needs work" list (what is missing), Days on
market by state / city / type, Asking vs final price (deals linked to a listing), Hot areas (listings and enquiries per
state and city), Stuck deals (Booked before SPA signed with no change for 30 days; 45 / 60 / 90 to choose), Commission
forecast (open deals by month and stage, agents' share, received in the period), Project performance (opens, code
redemptions) and Market News engagement (open rate per post, language and group; best times to post). Totals for Viewers;
lists naming agents for Owner / Admin / Compliance (access log); PDF / Excel for Owner / Compliance. Read-only: needs
`20261027100000_admin_batch_009_market.sql` (main repo branch feature/admin-batch-009-market-db, after AdminBatch008 Reports).
Buyer Demand vs Supply (106) waits for buyer requirements in the main app.

AdminBatch010 "Content & Maps" (0.10.0): Moderation screen (Owner / Admin / Compliance) — moderation cases MOD-YYYY-####
(16, never deleted; open, cleared, confirmed, referred to a complaint), automatic checks (price far from the area, no
title type, no price, no photos after 14 days, same photo or same spot as another agent), photo moderation (57: OK or
Flag; a flag opens a case; a storage rule lets staff open listing PHOTOS only) and duplicate listings (56). Content insight
screen — Listings map (54) and Geography map (28; sign-in places rounded to ~10 km, only areas with 3+ agents), Buyers &
vendors (8; counts only, no contact names or phones), Price trends (55), AI command usage (60; understood or not — the
words are not recorded) and Marketing Studio usage (61). Maps are drawn by the app over OpenStreetMap tiles (internet
needed for the background; dots still show offline). PDF / Excel for Owner / Compliance. Nothing in the main app changes.
Database: rebuilt in AdminBatch012 (`database/20261109000000_admin_batch_012_content_money.sql`).

AdminBatch011 "Money" (0.11.0): Money screen (Owner / Admin / Compliance see it; only the Owner changes it). Billing &
expenses ledger (10; LED-YYYY-####, money paid and received, foreign currency with its rate, "repeat monthly" copy; never
deleted or edited — void with a reason), Google API usage & estimated cost per Google product (2), quota alerts against
monthly / daily limits and the free allowance (40), profit & loss by month (33) and cost per active agent (34), prices and
the US$ → RM rate. Subscription revenue stays blocked until subscriptions exist in the main app. PDF / Excel for Owner /
Compliance. Database: rebuilt in AdminBatch012 (same file). Shown as its own "Company Money" space since AdminBatch012.

AdminBatch008: Reports — Monthly Board report (agents, licences, listings, complaints, PDPA 21-day share, problem reports,
cases, admin actions; compared with the month before; PDF / Excel kept in the Document Vault), Annual audit bundle (Excel
workbook with every log row and fingerprint, tamper check, backup tests, cases with packs, PDPA, complaints, holds,
retention reviews, plus a PDF summary naming the workbook; both vaulted), Custom report builder (8 sources, fixed column
list, filters, grouping with counts / totals / averages, chart, saved reports shared with every admin; Viewers build totals
only, never names; exports Owner / Compliance). Needs `20261026000000_admin_batch_008_reports.sql` (main repo branch feature/admin-batch-008-reports-db; apply AdminBatch007 first).

AdminBatch008: Email & WhatsApp broadcast (service notice to everyone chosen / news & offers only to agents who said yes;
email through Resend, WhatsApp tap-to-send plus the WhatsApp Business sender switched off until Meta keys exist; the list of
who gets it is fixed with a typed reason and kept for good; unsubscribe link in every email), Scheduled Reports (weekly
summary PDF, totals only, kept in the vault for 7 years and emailed to chosen Owner / Compliance admins; "make one now"),
Team Workspaces overview (read only), To-Do & Calendar for admins (each item private or shared; shared changes recorded),
"Check a file" also knows weekly reports, Feature flags page explains tile.<card> and beta.<name>. Needs
`20261025000000_admin_batch_008_comms.sql` and the Edge Functions send-broadcast, email-unsubscribe, weekly-report
(main repo, branch feature/admin-batch-008-db).

AdminBatch007: Compliance core — PDPA requests (reference PDPA-YYYY-####, 21-day answer rule for access / correction,
decision, outcome, every step kept; deletion requests are logged only), Retention (what is older than 7 years, per kind and
per agent; review recorded; nothing is deleted), Legal holds (the database refuses to delete an agent's records while on
hold), Complaint register (CMP-YYYY-####), Licence expiry (dates, warnings at 60 / 30 / 7 days), internal tags and notes on
the Agent Profile, scheduled posts and copying a post; Master Dashboard alerts for licences, PDPA and complaints.
Needs `20261024000000_admin_batch_007_compliance.sql`.

AdminBatch006: News & Announcements (Market News, pushed Projects, Announcements: EN / BM / ZH, picture and PDF upload
to the public folder `eab-feed-media` or a pasted link, audience everyone / groups / invitation code, end date, push alert,
preview, publish / withdraw, order per audience group by drag or typed position), Audience Groups (ranked, with how many
agents match before saving), Invitation Codes (create, disable, who used it, remove access), Push alerts (send waiting
alerts through `send-push`; sent / at least delivered / opened). Support Tickets (status history and internal notes,
screenshot, email the agent). Operations: Maintenance Mode (3 languages, back time), App Release Manager (minimum version,
soft / hard, update link), Feature Flags (per group; the main app reads them with `eab_my_flags()` once it is updated).
Overview: Master Dashboard with red / amber alerts, Top Agents, Live Users Now. Needs MainForAdmin-D, the push counts
migration and `20261023100000_admin_batch_006_ops.sql`.

AdminBatch005: Dashboards — one screen with tabs and a period filter (7 / 30 / 90 days, 12 months, custom): Sign-ups &
Growth, Active Users (daily / weekly / monthly, stickiness), Retention & Churn (7 / 30 / 90 days after joining, at-risk
agents), Inactive Agents (30 / 60 / 90 days), App Versions, Phones & Platforms, Language, Listings Analytics (each status
incl. every Booked stage and Rented - Pending TA Signing; stale = Available with no change for 60 days), Deal Pipeline
(sale lane and rent lane), Feature Usage & User Activity (most used, not used, day x hour heatmap, the events behind each
line). Viewer sees totals and charts only; lists naming agents are Owner / Admin / Compliance and go to the access log.
Dashboards report PDF / Excel (Owner / Compliance). Needs `20261023000000_admin_batch_005_dashboards.sql`.

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
