-- Minimal stand-in for the Supabase + Admin EAB pieces the AdminBatch010 migration uses (local tests only).
create extension if not exists pgcrypto;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

create table public.eab_workspaces (id uuid primary key, name text, created_by uuid, created_at timestamptz default now());
create table public.eab_members (workspace_id uuid, user_id uuid, email text, role text, active boolean default true, created_at timestamptz default now());
create table public.eab_records (user_id uuid, collection text, id text, data jsonb, deleted boolean default false, updated bigint,
  workspace_id uuid, assigned_to uuid, rev bigint, seq bigint, op_id text, written_by uuid, written_at timestamptz default now());
create table public.eab_admins (user_id uuid primary key, email text, role text, active boolean default true, expires_at timestamptz);
create table public.eab_admin_actions (seq bigserial, action text, target_ref text, reason text, before jsonb, after jsonb, admin_user uuid);
create table public.eab_admin_access (seq bigserial, kind text, target_ref text, detail jsonb, admin_user uuid);

create function public.eab_admin_role() returns text language sql stable as $$
  select role from public.eab_admins where user_id = auth.uid() and active and (expires_at is null or expires_at > now()) $$;
create function public.eab_admin_guard(p_roles text[]) returns text language plpgsql stable as $$
declare r text := public.eab_admin_role();
begin
  if r is null or not (r = any (p_roles)) then raise exception 'not allowed' using errcode = '42501'; end if;
  return r;
end $$;
create function public.eab_admin_write_access(p_kind text, p_target uuid, p_ref text, p_detail jsonb, p_device text) returns void
  language sql as $$ insert into public.eab_admin_access (kind, target_ref, detail, admin_user) values (p_kind, p_ref, p_detail, auth.uid()) $$;
create function public.eab_admin_write_action(p_action text, p_target uuid, p_ref text, p_reason text, p_before jsonb, p_after jsonb, p_device text) returns void
  language sql as $$ insert into public.eab_admin_actions (action, target_ref, reason, before, after, admin_user) values (p_action, p_ref, p_reason, p_before, p_after, auth.uid()) $$;

create table public.odw_profiles (id uuid primary key, full_name text, phone text, agency text, ren_no text, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.odw_vendors (id uuid primary key, agent_id uuid, name text, phone text, email text, notes text, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.odw_properties (id uuid primary key, agent_id uuid, vendor_id uuid, title text, address text, property_type text, asking_price numeric, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.odw_sales (id uuid primary key, agent_id uuid, property_id uuid, vendor_id uuid, buyer_name text, sale_price numeric, status text, share_token text, share_enabled boolean, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.odw_sale_updates (id uuid primary key, sale_id uuid, stage_id uuid, author_id uuid, note text, vendor_visible boolean, created_at timestamptz default now());
create table public.odw_nudges (id uuid primary key, sale_id uuid, message text, created_at timestamptz default now(), seen_at timestamptz);
create table public.odw_parties (id uuid primary key, sale_id uuid, kind text, name text, company text, phone text, email text, status text, follow_up_on date, notes text, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.odw_ai_questions (id uuid primary key, user_id uuid, question text, answer text, created_at timestamptz default now());
create view public.odw_sales_overview as select s.id, s.status, s.buyer_name, s.sale_price, s.share_enabled, s.created_at, s.updated_at, s.property_id,
  p.title as property_title, p.address as property_address, s.vendor_id, v.name as vendor_name, 40 as percent, 'Loan approval'::text as next_stage,
  'loan'::text as next_stage_key, s.updated_at as last_update_at
  from public.odw_sales s left join public.odw_properties p on p.id = s.property_id left join public.odw_vendors v on v.id = s.vendor_id;
create view public.odw_attention as select 'overdue'::text as kind, s.id as sale_id, p.title as property_title, 'Loan approval late'::text as what,
  'loan'::text as stage_key, current_date - 3 as due, s.updated_at as at from public.odw_sales s left join public.odw_properties p on p.id = s.property_id;
