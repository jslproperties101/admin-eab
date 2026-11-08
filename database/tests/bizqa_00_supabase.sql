-- Batch 2b local test: a stand-in for the EAB-QA-Test project (Supabase pieces + some of Estate Agent AI Buddy's OWN
-- objects with the same names Biz uses), so the Biz schema file can be proved to install BESIDE them without touching
-- them. Structure only; local tests only.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
create schema extensions;
create extension pgcrypto schema extensions;
create extension "uuid-ossp" schema extensions;
create extension pg_trgm schema public;
grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, phone text,
  raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}', last_sign_in_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('test.jwt', true), ''), '{}')::jsonb $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('test.role', true), ''), 'authenticated') $$;
create function auth.email() returns text language sql stable as $$ select auth.jwt()->>'email' $$;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text not null, owner uuid, public boolean default false,
  created_at timestamptz default now(), updated_at timestamptz default now(), file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
  name text, owner uuid, created_at timestamptz default now(), updated_at timestamptz default now(), metadata jsonb);
alter table storage.objects enable row level security;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare _parts text[]; begin select string_to_array(name, '/') into _parts; return _parts[1 : array_length(_parts, 1) - 1]; end $$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------- Estate Agent AI Buddy's own objects (public)
-- Same names as tables / functions the Biz admin file creates in biz. They must be untouched after the Biz install.
create table public.eab_admins (user_id uuid primary key, email text, role text, active boolean default true, expires_at timestamptz);
insert into public.eab_admins values ('00000000-0000-0000-0000-0000000000ee', 'eab-owner@x.com', 'owner', true, null);
create table public.eab_app_settings (app text primary key check (app in ('eab', 'pos', 'mm2h', 'odw')), maintenance_on boolean default false);
insert into public.eab_app_settings values ('eab', false);
create table public.eab_admin_log (seq bigint generated always as identity primary key, name text);
insert into public.eab_admin_log (name) values ('eab row 1');
create function public.eab_admin_role() returns text language sql stable as $$ select 'eab-public-version' $$;
create function public.eab_app_status(p_app text) returns jsonb language sql stable as $$ select '{"from":"eab public"}'::jsonb $$;
-- an EAB table with a Biz-like name, and an EAB storage rule that reads its own folder names
create table public.tenants (eab_marker text);
insert into public.tenants values ('eab, not biz');
insert into storage.buckets (id, name) values ('eab-files', 'eab-files');
create policy "eab file object read" on storage.objects for select to authenticated using (bucket_id = 'eab-files');
insert into storage.objects (bucket_id, name) values ('eab-files', 'workspace-abc/listing D1001/photo1.jpg'),
  ('eab-files', 'not-an-id/x.jpg');
-- fingerprint of everything EAB has in public, to compare after the Biz install
create table public._before as
  select 'fn' k, p.oid::regprocedure::text v, md5(pg_get_functiondef(p.oid)) h from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
  union all select 'rel', c.relname, md5(coalesce((select string_agg(attname || ':' || atttypid::regtype::text, ',' order by attnum) from pg_attribute where attrelid = c.oid and attnum > 0), ''))
    from pg_class c where c.relnamespace = 'public'::regnamespace;
