-- Batch 2b: the Biz install left Estate Agent AI Buddy's public objects exactly as they were, and EAB file reads still work.
\set ON_ERROR_STOP 1
do $$
declare n int; t text;
begin
  select count(*) into n from (
    select 'fn' k, p.oid::regprocedure::text v, md5(pg_get_functiondef(p.oid)) h from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
    union all select 'rel', c.relname, md5(coalesce((select string_agg(attname || ':' || atttypid::regtype::text, ',' order by attnum) from pg_attribute where attrelid = c.oid and attnum > 0), ''))
      from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname <> '_before'
    except select * from public._before) x;
  assert n = 0, 'public changed or grew by ' || n || ' objects';
  select count(*) into n from (select * from public._before where v <> '_before' except
    (select 'fn', p.oid::regprocedure::text, md5(pg_get_functiondef(p.oid)) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
     union all select 'rel', c.relname, md5(coalesce((select string_agg(attname || ':' || atttypid::regtype::text, ',' order by attnum) from pg_attribute where attrelid = c.oid and attnum > 0), ''))
       from pg_class c where c.relnamespace = 'public'::regnamespace)) x;
  assert n = 0, 'public lost ' || n || ' objects';
  select eab_marker into t from public.tenants; assert t = 'eab, not biz', 'EAB tenants row';
  assert public.eab_admin_role() = 'eab-public-version', 'EAB function untouched';
  select count(*) into n from public.eab_admins; assert n = 1, 'EAB admins untouched';
  assert to_regclass('biz.tenants') is not null and to_regclass('biz.sales') is not null, 'biz tables exist';
  raise notice 'BESIDE EAB: public unchanged (% objects compared)', (select count(*) from public._before);
end $$;
-- an EAB user reads EAB files whose folder names are not ids: the kids photo rules must not break it
set role authenticated;
select set_config('test.uid', gen_random_uuid()::text, false);
do $$ declare n int; begin
  select count(*) into n from storage.objects where bucket_id = 'eab-files'; assert n = 2, 'EAB files readable: ' || n;
  select count(*) into n from storage.objects; assert n = 2, 'whole-table read works: ' || n;
  raise notice 'EAB FILE READS OK WITH KIDS RULES PRESENT';
end $$;
reset role;
