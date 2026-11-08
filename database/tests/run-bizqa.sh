#!/bin/bash
# Batch 2b local test: AI Buddy Biz in schema "biz" beside Estate Agent AI Buddy (stand-in for EAB-QA-Test).
# Needs a local PostgreSQL 15+ and a checkout of jslproperties101/ai-buddy-biz.
#   database/tests/run-bizqa.sh /path/to/ai-buddy-biz      (run as a user that can create databases)
set -euo pipefail
BIZ="${1:?path to the ai-buddy-biz checkout}"
cd "$(dirname "$0")/.."
node tools/to-biz-schema.mjs 20261030130000_biz_admin.sql 20261109120000_biz_admin_in_eab_qa_test.sql --check
node "$BIZ/supabase/eab-qa-test/make.mjs" --check
DB=bizqa_$$
dropdb --if-exists "$DB" 2>/dev/null; createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" \
  -f tests/bizqa_00_supabase.sql \
  -f "$BIZ/supabase/eab-qa-test/20261109120000_biz_schema.sql" \
  -f tests/bizqa_05_beside_eab.sql \
  -f 20261109120000_biz_admin_in_eab_qa_test.sql \
  -f 20261109120000_biz_admin_in_eab_qa_test.sql \
  -f tests/bizqa_10_admin_tests.sql \
  -f tests/bizqa_06_biz_works.sql \
  -f tests/bizqa_05_beside_eab.sql 2>&1 | grep -E "NOTICE:  [A-Z]|ERROR|installed in schema|^ *[tf] *\| *[tf]"
