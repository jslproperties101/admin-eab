# AdminBatch010 database changes

| File | Project | What it adds |
|---|---|---|
| `20261030120000_admin_batch_010_apps.sql` | Estate Agent AI Buddy (EAB-QA-Test while testing) | Admin views for AI Buddy POS, On Da Way and MM2H; MM2H family sharing tables; per-app maintenance, release, banner, flags, tickets, errors |
| `20261030130000_biz_admin.sql` | AI Buddy Biz | Its own admin allow-list (Owner seeded as pending), hash-chained admin log, views for every Biz module, module switch, settings |

Additive only. Every admin read checks the role and is access-logged; every change needs a reason and is action-logged.
Viewers get totals only. Children's names (Biz Kids Care) are never shown. MM2H passport numbers, dates of birth and
documents are never sent by the app.

Tests (local PostgreSQL 16 with stand-ins for Supabase auth and the existing tables):
`tests/00_stubs.sql` + migration + `tests/10_tests.sql`, and `tests/biz_00_stubs.sql` + Biz migration + `tests/biz_10_tests.sql`.
