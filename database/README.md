# Admin EAB database changes (AdminBatch010 onwards)

| File | Project | What it adds |
|---|---|---|
| `20261030120000_admin_batch_010_apps.sql` | Estate Agent AI Buddy (EAB-QA-Test while testing) | Admin views for AI Buddy POS, On Da Way and MM2H; MM2H family sharing tables; per-app maintenance, release, banner, flags, tickets, errors |
| `20261109000000_admin_batch_012_content_money.sql` | Estate Agent AI Buddy (EAB-QA-Test while testing) | AdminBatch012: moderation cases, photo review, duplicate listings, content insight, money ledger, Google usage and prices, profit & loss; storage rule letting Owner / Admin / Compliance open listing photos only. Undo: `rollback/` |
| `20261109120000_biz_admin_in_eab_qa_test.sql` | AI Buddy Biz in EAB-QA-Test, schema `biz` (AdminBatch013) | GENERATED from the next file by `tools/to-biz-schema.mjs` (`public.` → `biz.`). Apply after the Biz tables (ai-buddy-biz `supabase/eab-qa-test/`). Test: `tests/run-bizqa.sh` |
| `20261030130000_biz_admin.sql` | AI Buddy Biz (stand-alone project; source of the file above) | Its own admin allow-list (Owner seeded as pending), hash-chained admin log, views for every Biz module, module switch, settings |

Additive only. Every admin read checks the role and is access-logged; every change needs a reason and is action-logged.
Viewers get totals only. Children's names (Biz Kids Care) are never shown. MM2H passport numbers, dates of birth and
documents are never sent by the app.

Tests (local PostgreSQL 16 with stand-ins for Supabase auth and the existing tables):
`tests/00_stubs.sql` + migration + `tests/10_tests.sql`, and `tests/biz_00_stubs.sql` + Biz migration + `tests/biz_10_tests.sql`.
AdminBatch012: `tests/00_stubs.sql` + `tests/b12_00_stubs.sql` + `20261109000000_admin_batch_012_content_money.sql` + `tests/b12_10_tests.sql`
(prints "TEST RESULT: 113 passed, 0 failed"). Applied to EAB-QA-Test on 9 Nov 2026 in 6 parts; never on production without Joe's yes.
