// Batch 2b (9 Nov 2026): AI Buddy Biz now lives in the EAB-QA-Test project, schema "biz" (Joe, D-7N-2).
// Converts a SQL file written for the stand-alone Biz project (schema "public") to the biz schema, with the same rules
// as ai-buddy-biz/supabase/eab-qa-test/make.mjs:  "public." -> "biz.",  "search_path = public" -> "search_path = biz, public".
//   node database/tools/to-biz-schema.mjs <in.sql> <out.sql> [--check]
import { readFileSync, writeFileSync } from 'node:fs';
const [inp, out] = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!inp || !out) { console.error('usage: node to-biz-schema.mjs <in.sql> <out.sql> [--check]'); process.exit(2); }
const src = readFileSync(inp, 'utf8');
if (/\bschema\s+public\b|'public'|"public"/i.test(src)) throw new Error(`${inp} names the public schema in a way this script does not convert`);
const text = `-- GENERATED from ${inp.split('/').pop()} by database/tools/to-biz-schema.mjs — do not edit by hand.\n`
  + `-- AI Buddy Biz in EAB-QA-Test, schema "biz" (Batch 2b). Apply AFTER ai-buddy-biz/supabase/eab-qa-test/20261109120000_biz_schema.sql.\n`
  + `set search_path = biz, public, extensions;\n\n`
  + src.replace(/\bpublic\./gi, 'biz.').replace(/search_path\s*=\s*public\b/gi, 'search_path = biz, public');
if (process.argv.includes('--check')) {
  let now = ''; try { now = readFileSync(out, 'utf8'); } catch { /* missing */ }
  if (now !== text) { console.error(`${out} is out of date`); process.exit(1); }
  console.log('up to date');
} else { writeFileSync(out, text); console.log(`wrote ${out}`); }
