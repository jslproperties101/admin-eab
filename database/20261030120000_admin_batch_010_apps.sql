-- AdminBatch010: admin for AI Buddy POS, On Da Way and Malaysia Welcome AI Buddy (MM2H) in the EAB database.
-- Additive only: new tables and functions; no existing table or function is changed.
-- Every admin read goes through eab_admin_app_view, which checks the role (eab_admin_guard) and writes the access log
-- (eab_admin_write_access). Every admin change needs a reason and is written to the hash-chained action log
-- (eab_admin_write_action). Lists that name people are for Owner / Admin / Compliance only; a Viewer gets totals.
-- Regulators get nothing here (their access is limited to the agents in their case).

-- ---------------------------------------------------------------------------------------------------------- tables

-- Per-app settings the apps read at start-up (maintenance, minimum version, announcement banner).
create table if not exists public.eab_app_settings (
  app text primary key check (app in ('pos', 'odw', 'mm2h')),
  maintenance_on boolean not null default false,
  maintenance_message text,
  min_version text,
  update_url text,
  announcement text,
  announcement_until timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.eab_app_settings (app) values ('pos'), ('odw'), ('mm2h') on conflict do nothing;

create table if not exists public.eab_app_flags (
  app text not null check (app in ('pos', 'odw', 'mm2h')),
  key text not null check (key ~ '^[a-z0-9_.-]{2,60}$'),
  label text not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (app, key)
);

create table if not exists public.eab_app_tickets (
  id uuid primary key default gen_random_uuid(),
  app text not null check (app in ('pos', 'odw', 'mm2h')),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text not null check (length(subject) between 1 and 200),
  body text check (length(body) <= 5000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists eab_app_tickets_app_idx on public.eab_app_tickets (app, created_at desc);

create table if not exists public.eab_app_errors (
  id bigint generated always as identity primary key,
  app text not null check (app in ('pos', 'odw', 'mm2h')),
  user_id uuid,
  at timestamptz not null default now(),
  message text not null,
  screen text,
  app_version text,
  platform text
);
create index if not exists eab_app_errors_app_idx on public.eab_app_errors (app, at desc);

-- MM2H family data, sent by the Malaysia Welcome app once the family signs in and agrees. Passport scans and other
-- document files stay on the phone; only the facts below reach the server.
create table if not exists public.mm2h_families (
  user_id uuid primary key references auth.users (id) on delete cascade,
  family_name text,
  nationality text,
  city text,
  phone text,
  email text,
  arrival_date date,
  consent_at timestamptz not null,
  app_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.mm2h_members (
  user_id uuid not null references public.mm2h_families (user_id) on delete cascade,
  id text not null,
  name text,
  relation text,
  pass_type text,
  pass_expiry date,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table if not exists public.mm2h_applications (
  user_id uuid not null references public.mm2h_families (user_id) on delete cascade,
  id text not null,
  stage text,
  submitted_on date,
  approved_on date,
  notes text,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table if not exists public.mm2h_doc_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.mm2h_families (user_id) on delete cascade,
  kind text not null check (kind in ('copy', 'delete')),
  status text not null default 'open' check (status in ('open', 'done', 'refused')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Content the families see (news sources, hotspots, coupons, directory, guides, lists, AI knowledge, rules).
create table if not exists public.mm2h_content (
  kind text not null check (kind in ('news_source', 'hotspot', 'coupon', 'service', 'guide', 'school', 'healthcare',
    'housing', 'knowledge', 'rule', 'integration')),
  id uuid not null default gen_random_uuid(),
  title text not null check (length(title) between 1 and 200),
  body text check (length(body) <= 10000),
  url text check (url is null or url ~ '^https://'),
  area text,
  phone text,
  valid_until date,
  status text,
  published boolean not null default false,
  sort integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (kind, id)
);

alter table public.eab_app_settings enable row level security;
alter table public.eab_app_flags enable row level security;
alter table public.eab_app_tickets enable row level security;
alter table public.eab_app_errors enable row level security;
alter table public.mm2h_families enable row level security;
alter table public.mm2h_members enable row level security;
alter table public.mm2h_applications enable row level security;
alter table public.mm2h_doc_requests enable row level security;
alter table public.mm2h_content enable row level security;
-- No policies: nothing is read or written directly; only through the functions below.
revoke all on public.eab_app_settings, public.eab_app_flags, public.eab_app_tickets, public.eab_app_errors,
  public.mm2h_families, public.mm2h_members, public.mm2h_applications, public.mm2h_doc_requests, public.mm2h_content
  from anon, authenticated;

-- ------------------------------------------------------------------------------------------- functions for the apps

/** Read at start-up by POS, On Da Way and MM2H: maintenance, minimum version, announcement and switched-on flags. */
create or replace function public.eab_app_status(p_app text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'maintenance_on', s.maintenance_on, 'maintenance_message', s.maintenance_message,
    'min_version', s.min_version, 'update_url', s.update_url,
    'announcement', case when s.announcement_until is null or s.announcement_until > now() then s.announcement end,
    'flags', coalesce((select jsonb_object_agg(f.key, f.enabled) from public.eab_app_flags f where f.app = s.app), '{}'::jsonb))
  from public.eab_app_settings s where s.app = p_app
$$;

create or replace function public.eab_app_ticket(p_app text, p_subject text, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if (select count(*) from public.eab_app_tickets where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'too many tickets' using errcode = '54000';
  end if;
  insert into public.eab_app_tickets (app, user_id, subject, body) values (p_app, auth.uid(), left(p_subject, 200), left(p_body, 5000))
  returning id into v;
  return v;
end $$;

/** Up to 50 error reports at a time: [{message, screen, app_version, platform, at}]. */
create or replace function public.eab_app_report_errors(p_app text, p_events jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 50 then raise exception 'bad events' using errcode = '22023'; end if;
  insert into public.eab_app_errors (app, user_id, at, message, screen, app_version, platform)
  select p_app, auth.uid(), least(coalesce((e->>'at')::timestamptz, now()), now()), left(e->>'message', 1000),
         left(e->>'screen', 100), left(e->>'app_version', 30), left(e->>'platform', 30)
  from jsonb_array_elements(p_events) e where coalesce(e->>'message', '') <> '';
  get diagnostics n = row_count;
  return n;
end $$;

/** MM2H: the signed-in family sends its own facts (replaces what was there). Needs consent = true. */
create or replace function public.mm2h_sync(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if coalesce((p->>'consent')::boolean, false) is not true then raise exception 'consent needed' using errcode = '42501'; end if;
  insert into public.mm2h_families as f (user_id, family_name, nationality, city, phone, email, arrival_date, consent_at, app_version, updated_at)
  values (u, left(p->'family'->>'family_name', 120), left(p->'family'->>'nationality', 60), left(p->'family'->>'city', 80),
          left(p->'family'->>'phone', 30), left(p->'family'->>'email', 200), nullif(p->'family'->>'arrival_date', '')::date,
          now(), left(p->>'app_version', 30), now())
  on conflict (user_id) do update set family_name = excluded.family_name, nationality = excluded.nationality, city = excluded.city,
    phone = excluded.phone, email = excluded.email, arrival_date = excluded.arrival_date, app_version = excluded.app_version, updated_at = now();
  delete from public.mm2h_members where user_id = u;
  insert into public.mm2h_members (user_id, id, name, relation, pass_type, pass_expiry)
  select u, left(m->>'id', 60), left(m->>'name', 120), left(m->>'relation', 40), left(m->>'pass_type', 60), nullif(m->>'pass_expiry', '')::date
  from jsonb_array_elements(coalesce(p->'members', '[]'::jsonb)) m where coalesce(m->>'id', '') <> '' limit 30;
  delete from public.mm2h_applications where user_id = u;
  insert into public.mm2h_applications (user_id, id, stage, submitted_on, approved_on, notes)
  select u, left(a->>'id', 60), left(a->>'stage', 60), nullif(a->>'submitted_on', '')::date, nullif(a->>'approved_on', '')::date, left(a->>'notes', 2000)
  from jsonb_array_elements(coalesce(p->'applications', '[]'::jsonb)) a where coalesce(a->>'id', '') <> '' limit 30;
  return jsonb_build_object('ok', true, 'at', now());
end $$;

/** MM2H: the family withdraws consent → everything about them on the server is removed. */
create or replace function public.mm2h_forget_me()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  delete from public.mm2h_families where user_id = auth.uid();
end $$;

create or replace function public.mm2h_request(p_kind text, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if auth.uid() is null or not exists (select 1 from public.mm2h_families where user_id = auth.uid()) then
    raise exception 'sync first' using errcode = '42501';
  end if;
  insert into public.mm2h_doc_requests (user_id, kind, note) values (auth.uid(), p_kind, left(p_note, 2000)) returning id into v;
  return v;
end $$;

/** MM2H: published content for the app (no sign-in needed; it is public information). */
create or replace function public.mm2h_content_list()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'id', id, 'title', title, 'body', body, 'url', url, 'area', area,
    'phone', phone, 'valid_until', valid_until, 'status', status) order by kind, sort, title), '[]'::jsonb)
  from public.mm2h_content where published and (valid_until is null or valid_until >= current_date)
$$;

-- ----------------------------------------------------------------------------------------------- admin: read views

create or replace function public.eab_admin_app_view(p_app text, p_view text, p_from date default null, p_to date default null,
  p_q text default null, p_limit integer default 200, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r text := public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  named boolean := r in ('owner', 'admin', 'compliance');
  f date := coalesce(p_from, current_date - 30);
  t date := coalesce(p_to, current_date);
  q text := nullif(trim(coalesce(p_q, '')), '');
  lim integer := least(greatest(coalesce(p_limit, 200), 1), 1000);
  summary jsonb := '{}'::jsonb;
  rows jsonb;
begin
  if p_app not in ('pos', 'odw', 'mm2h') then raise exception 'unknown app' using errcode = 'P0002'; end if;
  if t < f then raise exception 'the end date is before the start date' using errcode = '22023'; end if;

  -- ======================================================================== POS (records synced in eab_records)
  if p_app = 'pos' then
    if p_view = 'businesses' then
      select jsonb_build_object('businesses', count(distinct workspace_id), 'records', count(*)) into summary
        from public.eab_records where collection like 'acct%' and not deleted;
      select jsonb_agg(x) into rows from (
        select w.name as business, w.created_at::date as since,
               count(*) filter (where e.collection = 'acctSales') as sales,
               count(*) filter (where e.collection = 'acctInvoices') as invoices,
               count(*) filter (where e.collection = 'acctJournals') as journals,
               count(*) filter (where e.collection = 'acctEinvoices') as einvoices,
               count(*) filter (where e.collection = 'acctStaff') as staff,
               max(e.written_at) as last_change
        from public.eab_records e join public.eab_workspaces w on w.id = e.workspace_id
        where e.collection like 'acct%' and not e.deleted and (q is null or w.name ilike '%' || q || '%')
        group by w.id, w.name, w.created_at order by max(e.written_at) desc nulls last limit lim) x;
    elsif p_view in ('sales', 'journals', 'invoices', 'einvoices', 'customers', 'attendance', 'payroll', 'tax') then
      declare coll text := case p_view when 'sales' then 'acctSales' when 'journals' then 'acctJournals' when 'invoices' then 'acctInvoices'
        when 'einvoices' then 'acctEinvoices' when 'customers' then 'acctLeads' when 'attendance' then 'acctAttendance'
        when 'payroll' then 'acctPayruns' else 'acctProfile' end;
      begin
        with d as (
          select w.name as business, e.data, e.written_at
          from public.eab_records e join public.eab_workspaces w on w.id = e.workspace_id
          where e.collection = coll and not e.deleted
            and (p_view in ('tax', 'customers') or coalesce(nullif(e.data->>'date', ''), nullif(e.data->>'month', '') || '-01')::date between f and t)
            and (q is null or w.name ilike '%' || q || '%' or e.data::text ilike '%' || q || '%'))
        select jsonb_build_object('records', count(*),
            'total_rm', case p_view when 'sales' then round(sum((data->>'total')::numeric), 2)
              when 'invoices' then round(sum((select sum((l->>'qty')::numeric * (l->>'price')::numeric * (1 + coalesce((l->>'taxPct')::numeric, 0) / 100)) from jsonb_array_elements(data->'lines') l)), 2)
              when 'customers' then round(sum((data->>'value')::numeric), 2) end,
            'by_status', (select jsonb_object_agg(s, n) from (select coalesce(data->>'status', data->>'stage', data->>'method', '—') s, count(*) n from d group by 1) z)),
          (select jsonb_agg(x) from (
            select business,
              case when not named and p_view in ('customers', 'attendance', 'payroll', 'einvoices', 'invoices', 'sales') then null else
              case p_view
                when 'sales' then jsonb_build_object('no', data->>'no', 'date', data->>'date', 'method', data->>'method', 'total', data->'total', 'e_invoice', data->>'einvId')
                when 'journals' then jsonb_build_object('no', data->>'no', 'date', data->>'date', 'memo', data->>'memo', 'source', data->>'source', 'status', data->>'status',
                  'debit', (select sum((l->>'dr')::numeric) from jsonb_array_elements(data->'lines') l))
                when 'invoices' then jsonb_build_object('no', data->>'no', 'date', data->>'date', 'due', data->>'due', 'buyer', data->'buyer'->>'name', 'status', data->>'status')
                when 'einvoices' then jsonb_build_object('ref', data->>'refNo', 'date', data->>'date', 'kind', data->>'kind', 'buyer', data->'buyer'->>'name',
                  'status', data->>'status', 'environment', coalesce(data->>'env', 'not sent'), 'errors', data->'errors')
                when 'customers' then jsonb_build_object('name', data->>'name', 'interest', data->>'interest', 'stage', data->>'stage', 'value', data->'value', 'next', data->>'next')
                when 'attendance' then jsonb_build_object('staff', data->>'staffId', 'date', data->>'date', 'in', data->>'in', 'out', data->>'out')
                when 'payroll' then jsonb_build_object('month', data->>'month', 'payslips', jsonb_array_length(coalesce(data->'slips', '[]'::jsonb)),
                  'gross', (select sum((s->>'gross')::numeric) from jsonb_array_elements(data->'slips') s), 'journal', data->>'journalNo')
                else jsonb_build_object('company', data->'party'->>'name', 'tin', data->'party'->>'tin', 'sst', data->'party'->>'sst', 'msic', data->>'msic', 'activity', data->>'msicDesc')
              end end as record, written_at as changed
            from d order by written_at desc nulls last limit lim) x)
          into summary, rows from d;
        if not named and p_view in ('customers', 'attendance', 'payroll', 'einvoices', 'invoices', 'sales') then rows := null; end if;
      end;
    elsif p_view = 'pnl' then
      -- Income (4xxx) and expenses (5xxx, 6xxx) from posted journals, per business, in the period.
      with l as (
        select w.name as business, left(li->>'acc', 1) as grp, (li->>'dr')::numeric dr, (li->>'cr')::numeric cr
        from public.eab_records e join public.eab_workspaces w on w.id = e.workspace_id
        cross join jsonb_array_elements(e.data->'lines') li
        where e.collection = 'acctJournals' and not e.deleted and e.data->>'status' = 'posted'
          and (e.data->>'date')::date between f and t and (q is null or w.name ilike '%' || q || '%'))
      select jsonb_build_object('income_rm', round(coalesce(sum(cr - dr) filter (where grp = '4'), 0), 2),
               'expenses_rm', round(coalesce(sum(dr - cr) filter (where grp in ('5', '6')), 0), 2),
               'profit_rm', round(coalesce(sum(cr - dr) filter (where grp = '4'), 0) - coalesce(sum(dr - cr) filter (where grp in ('5', '6')), 0), 2)),
             (select jsonb_agg(x) from (select business, round(sum(cr - dr) filter (where grp = '4'), 2) income,
                round(sum(dr - cr) filter (where grp in ('5', '6')), 2) expenses,
                round(coalesce(sum(cr - dr) filter (where grp = '4'), 0) - coalesce(sum(dr - cr) filter (where grp in ('5', '6')), 0), 2) profit
                from l group by business order by 4 desc nulls last limit lim) x)
        into summary, rows from l;
    else
      rows := public.eab_admin__app_ops('pos', p_view, f, t, q, lim, named, summary);
      summary := rows->'summary'; rows := rows->'rows';
    end if;

  -- ======================================================================== On Da Way (odw_* tables, read-only)
  elsif p_app = 'odw' then
    if p_view = 'agents' then
      select jsonb_build_object('agents', count(*), 'new_in_period', count(*) filter (where created_at::date between f and t)) into summary from public.odw_profiles;
      if named then select jsonb_agg(x) into rows from (
        select p.full_name as name, p.agency, p.ren_no, p.phone, p.created_at::date as joined,
               (select count(*) from public.odw_sales s where s.agent_id = p.id) as sales
        from public.odw_profiles p where q is null or p.full_name ilike '%' || q || '%' or p.agency ilike '%' || q || '%'
        order by p.created_at desc limit lim) x; end if;
    elsif p_view = 'sales' then
      select jsonb_build_object('sales', count(*), 'value_rm', round(sum(sale_price), 2), 'average_progress_pct', round(avg(percent)),
        'by_status', (select jsonb_object_agg(status, n) from (select coalesce(status, '—') status, count(*) n from public.odw_sales_overview group by 1) z))
        into summary from public.odw_sales_overview;
      select jsonb_agg(x) into rows from (
        select property_title as property, case when named then vendor_name end as vendor, case when named then buyer_name end as buyer,
               sale_price, status, percent as progress_pct, next_stage, last_update_at::date as last_update, share_enabled as vendor_link_on
        from public.odw_sales_overview where q is null or property_title ilike '%' || q || '%' or (named and vendor_name ilike '%' || q || '%')
        order by last_update_at desc nulls last limit lim) x;
    elsif p_view = 'overdue' then
      select jsonb_build_object('items', count(*)) into summary from public.odw_attention;
      select jsonb_agg(x) into rows from (select kind, property_title as property, what, stage_key as stage, due, at::date as since
        from public.odw_attention order by due nulls last limit lim) x;
    elsif p_view = 'vendors' then
      select jsonb_build_object('vendors', count(*), 'properties', (select count(*) from public.odw_properties)) into summary from public.odw_vendors;
      if named then select jsonb_agg(x) into rows from (
        select v.name, v.phone, v.email, (select count(*) from public.odw_properties p where p.vendor_id = v.id) as properties, v.created_at::date as added
        from public.odw_vendors v where q is null or v.name ilike '%' || q || '%' order by v.created_at desc limit lim) x; end if;
    elsif p_view = 'parties' then
      select jsonb_build_object('parties', count(*), 'follow_up_due', count(*) filter (where follow_up_on <= current_date and status is distinct from 'done')) into summary from public.odw_parties;
      if named then select jsonb_agg(x) into rows from (
        select kind, name, company, phone, status, follow_up_on from public.odw_parties
        where q is null or name ilike '%' || q || '%' or company ilike '%' || q || '%' order by follow_up_on nulls last limit lim) x; end if;
    elsif p_view = 'updates' then
      select jsonb_build_object('updates', count(*), 'shown_to_vendor', count(*) filter (where vendor_visible), 'nudges', (select count(*) from public.odw_nudges where created_at::date between f and t))
        into summary from public.odw_sale_updates where created_at::date between f and t;
      if named then select jsonb_agg(x) into rows from (
        select u.created_at::date as date, pr.title as property, u.note, u.vendor_visible from public.odw_sale_updates u
        left join public.odw_sales s on s.id = u.sale_id left join public.odw_properties pr on pr.id = s.property_id
        where u.created_at::date between f and t order by u.created_at desc limit lim) x; end if;
    elsif p_view = 'ai' then
      select jsonb_build_object('questions', count(*)) into summary from public.odw_ai_questions where created_at::date between f and t;
      if named then select jsonb_agg(x) into rows from (select created_at::date as date, question, answer from public.odw_ai_questions
        where created_at::date between f and t and (q is null or question ilike '%' || q || '%') order by created_at desc limit lim) x; end if;
    else
      rows := public.eab_admin__app_ops('odw', p_view, f, t, q, lim, named, summary);
      summary := rows->'summary'; rows := rows->'rows';
    end if;

  -- ======================================================================== MM2H (synced family data + content)
  else
    if p_view = 'families' then
      select jsonb_build_object('families', count(*), 'members', (select count(*) from public.mm2h_members), 'new_in_period', count(*) filter (where created_at::date between f and t)) into summary from public.mm2h_families;
      if named then select jsonb_agg(x) into rows from (
        select family_name, nationality, city, phone, email, arrival_date, (select count(*) from public.mm2h_members m where m.user_id = fa.user_id) as members,
               updated_at::date as last_sync from public.mm2h_families fa
        where q is null or family_name ilike '%' || q || '%' or email ilike '%' || q || '%' order by updated_at desc limit lim) x; end if;
    elsif p_view = 'applications' then
      select jsonb_build_object('applications', count(*), 'by_stage', (select jsonb_object_agg(coalesce(stage, '—'), n) from (select stage, count(*) n from public.mm2h_applications group by 1) z)) into summary from public.mm2h_applications;
      if named then select jsonb_agg(x) into rows from (
        select fa.family_name, a.stage, a.submitted_on, a.approved_on, a.notes, a.updated_at::date as updated
        from public.mm2h_applications a join public.mm2h_families fa using (user_id)
        where q is null or fa.family_name ilike '%' || q || '%' order by a.updated_at desc limit lim) x; end if;
    elsif p_view = 'renewals' then
      select jsonb_build_object('due_in_90_days', count(*) filter (where pass_expiry between current_date and current_date + 90),
        'expired', count(*) filter (where pass_expiry < current_date)) into summary from public.mm2h_members;
      if named then select jsonb_agg(x) into rows from (
        select fa.family_name, m.name, m.relation, m.pass_type, m.pass_expiry, m.pass_expiry - current_date as days_left
        from public.mm2h_members m join public.mm2h_families fa using (user_id)
        where m.pass_expiry is not null and m.pass_expiry <= current_date + 180 order by m.pass_expiry limit lim) x; end if;
    elsif p_view = 'requests' then
      select jsonb_build_object('open', count(*) filter (where status = 'open'), 'total', count(*)) into summary from public.mm2h_doc_requests;
      if named then select jsonb_agg(x) into rows from (
        select d.id, fa.family_name, d.kind, d.status, d.note, d.created_at::date as asked
        from public.mm2h_doc_requests d join public.mm2h_families fa using (user_id) order by (d.status = 'open') desc, d.created_at desc limit lim) x; end if;
    elsif p_view like 'content:%' then
      select jsonb_build_object('items', count(*), 'published', count(*) filter (where published)) into summary from public.mm2h_content where kind = substr(p_view, 9);
      select jsonb_agg(x) into rows from (select id, title, area, url, phone, valid_until, status, published, sort, body, updated_at::date as updated
        from public.mm2h_content where kind = substr(p_view, 9) and (q is null or title ilike '%' || q || '%') order by sort, title limit lim) x;
    else
      rows := public.eab_admin__app_ops('mm2h', p_view, f, t, q, lim, named, summary);
      summary := rows->'summary'; rows := rows->'rows';
    end if;
  end if;

  perform public.eab_admin_write_access('app_view', null, p_app || ':' || p_view,
    jsonb_build_object('from', f, 'to', t, 'q', q, 'names', named), p_device);
  return jsonb_build_object('summary', coalesce(summary, '{}'::jsonb), 'rows', coalesce(rows, '[]'::jsonb), 'names_hidden', not named,
    'from', f, 'to', t);
end $$;

/** Operations views shared by the three apps: users, sign-ups, tickets, flags, settings, errors. Internal helper. */
create or replace function public.eab_admin__app_ops(p_app text, p_view text, f date, t date, q text, lim integer, named boolean, unused jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s jsonb; r jsonb;
begin
  if p_view in ('users', 'signups') then
    -- Who uses the app: POS = members of a workspace with POS records; On Da Way = profiles; MM2H = synced families.
    with u as (
      select distinct m.user_id, min(e.written_at) over (partition by m.user_id) as first_at, max(e.written_at) over (partition by m.user_id) as last_at
        from public.eab_records e join public.eab_members m on m.workspace_id = e.workspace_id and m.active
        where p_app = 'pos' and e.collection like 'acct%'
      union all select id, created_at, updated_at from public.odw_profiles where p_app = 'odw'
      union all select user_id, created_at, updated_at from public.mm2h_families where p_app = 'mm2h')
    select jsonb_build_object('users', count(distinct u.user_id),
             'new_in_period', count(distinct u.user_id) filter (where u.first_at::date between f and t),
             'active_in_period', count(distinct u.user_id) filter (where u.last_at::date between f and t)),
           case when named then (select jsonb_agg(x) from (
             select a.email, min(u2.first_at)::date as first_use, max(u2.last_at)::date as last_activity
             from u u2 join auth.users a on a.id = u2.user_id
             where (p_view = 'users' or u2.first_at::date between f and t) and (q is null or a.email ilike '%' || q || '%')
             group by a.email order by max(u2.last_at) desc nulls last limit lim) x) end
      into s, r from u;
    if p_view = 'signups' then
      with u as (select first_at from (
          select min(e.written_at) first_at from public.eab_records e join public.eab_members m on m.workspace_id = e.workspace_id
            where p_app = 'pos' and e.collection like 'acct%' group by m.user_id
          union all select created_at from public.odw_profiles where p_app = 'odw'
          union all select created_at from public.mm2h_families where p_app = 'mm2h') z where first_at::date between f and t)
      select s || jsonb_build_object('by_day', coalesce((select jsonb_object_agg(d, n) from (select first_at::date d, count(*) n from u group by 1 order by 1) z), '{}'::jsonb)) into s;
    end if;
  elsif p_view = 'tickets' then
    select jsonb_build_object('open', count(*) filter (where status = 'open'), 'in_progress', count(*) filter (where status = 'in_progress'), 'total', count(*))
      into s from public.eab_app_tickets where app = p_app;
    select jsonb_agg(x) into r from (select k.id, k.created_at::date as date, case when named then a.email end as from_user, k.subject,
        case when named then k.body end as details, k.status
      from public.eab_app_tickets k left join auth.users a on a.id = k.user_id
      where k.app = p_app and (q is null or k.subject ilike '%' || q || '%') order by (k.status = 'closed'), k.created_at desc limit lim) x;
  elsif p_view = 'errors' then
    select jsonb_build_object('errors', count(*), 'users_affected', count(distinct user_id)) into s
      from public.eab_app_errors where app = p_app and at::date between f and t;
    select jsonb_agg(x) into r from (select message, count(*) as times, count(distinct user_id) as users, max(at) as last_seen,
        string_agg(distinct app_version, ', ') as versions
      from public.eab_app_errors where app = p_app and at::date between f and t and (q is null or message ilike '%' || q || '%')
      group by message order by count(*) desc limit lim) x;
  elsif p_view = 'flags' then
    select jsonb_build_object('flags', count(*), 'on', count(*) filter (where enabled)) into s from public.eab_app_flags where app = p_app;
    select jsonb_agg(x) into r from (select key, label, enabled, updated_at from public.eab_app_flags where app = p_app order by key) x;
  elsif p_view = 'settings' then
    select to_jsonb(st) - 'app' - 'updated_by' into s from public.eab_app_settings st where app = p_app;
    r := '[]'::jsonb;
  else
    raise exception 'unknown view' using errcode = 'P0002';
  end if;
  return jsonb_build_object('summary', coalesce(s, '{}'::jsonb), 'rows', coalesce(r, '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------------------------- admin: changes

/** Maintenance, minimum version, update link, announcement. Owner / Admin, with a reason (action log). */
create or replace function public.eab_admin_app_settings_set(p_app text, p_patch jsonb, p_reason text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare before jsonb; after jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'a reason is needed' using errcode = '22023'; end if;
  if p_patch->>'update_url' is not null and p_patch->>'update_url' <> '' and p_patch->>'update_url' !~ '^https://' then
    raise exception 'the update link must start with https://' using errcode = '22023';
  end if;
  select to_jsonb(s) into before from public.eab_app_settings s where app = p_app for update;
  if before is null then raise exception 'unknown app' using errcode = 'P0002'; end if;
  update public.eab_app_settings set
    maintenance_on = coalesce((p_patch->>'maintenance_on')::boolean, maintenance_on),
    maintenance_message = case when p_patch ? 'maintenance_message' then left(nullif(p_patch->>'maintenance_message', ''), 500) else maintenance_message end,
    min_version = case when p_patch ? 'min_version' then left(nullif(p_patch->>'min_version', ''), 30) else min_version end,
    update_url = case when p_patch ? 'update_url' then nullif(p_patch->>'update_url', '') else update_url end,
    announcement = case when p_patch ? 'announcement' then left(nullif(p_patch->>'announcement', ''), 500) else announcement end,
    announcement_until = case when p_patch ? 'announcement_until' then nullif(p_patch->>'announcement_until', '')::timestamptz else announcement_until end,
    updated_at = now(), updated_by = auth.uid()
  where app = p_app returning to_jsonb(eab_app_settings.*) into after;
  perform public.eab_admin_write_action('app_settings', null, p_app, p_reason, before, after, p_device);
  return after - 'updated_by';
end $$;

create or replace function public.eab_admin_app_flag_set(p_app text, p_key text, p_label text, p_enabled boolean, p_reason text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare before jsonb; after jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'a reason is needed' using errcode = '22023'; end if;
  select to_jsonb(x) into before from public.eab_app_flags x where app = p_app and key = p_key;
  insert into public.eab_app_flags as fl (app, key, label, enabled, updated_at, updated_by)
  values (p_app, lower(p_key), coalesce(nullif(trim(p_label), ''), p_key), p_enabled, now(), auth.uid())
  on conflict (app, key) do update set label = coalesce(nullif(trim(p_label), ''), fl.label), enabled = excluded.enabled, updated_at = now(), updated_by = auth.uid()
  returning to_jsonb(fl.*) into after;
  perform public.eab_admin_write_action('app_flag', null, p_app || ':' || p_key, p_reason, before, after, p_device);
  return after - 'updated_by';
end $$;

create or replace function public.eab_admin_app_ticket_set(p_id uuid, p_status text, p_reason text, p_device text default null)
returns void language plpgsql security definer set search_path = public as $$
declare before jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  if p_status not in ('open', 'in_progress', 'closed') then raise exception 'bad status' using errcode = '22023'; end if;
  select jsonb_build_object('status', status, 'app', app) into before from public.eab_app_tickets where id = p_id for update;
  if before is null then raise exception 'ticket not found' using errcode = 'P0002'; end if;
  update public.eab_app_tickets set status = p_status, updated_at = now() where id = p_id;
  perform public.eab_admin_write_action('app_ticket', null, p_id::text, coalesce(nullif(trim(p_reason), ''), 'status changed'), before,
    jsonb_build_object('status', p_status), p_device);
end $$;

create or replace function public.eab_admin_mm2h_request_set(p_id uuid, p_status text, p_reason text, p_device text default null)
returns void language plpgsql security definer set search_path = public as $$
declare before jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'compliance']);
  if p_status not in ('open', 'done', 'refused') then raise exception 'bad status' using errcode = '22023'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'a reason is needed' using errcode = '22023'; end if;
  select jsonb_build_object('status', status, 'kind', kind) into before from public.mm2h_doc_requests where id = p_id for update;
  if before is null then raise exception 'request not found' using errcode = 'P0002'; end if;
  update public.mm2h_doc_requests set status = p_status, updated_at = now() where id = p_id;
  perform public.eab_admin_write_action('mm2h_request', null, p_id::text, p_reason, before, jsonb_build_object('status', p_status), p_device);
end $$;

/** Add or change one content item (p_id null = new). Owner / Admin, with a reason. */
create or replace function public.eab_admin_mm2h_content_save(p_kind text, p_id uuid, p_item jsonb, p_reason text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare before jsonb; after jsonb; v uuid := coalesce(p_id, gen_random_uuid());
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'a reason is needed' using errcode = '22023'; end if;
  if coalesce(p_item->>'url', '') <> '' and p_item->>'url' !~ '^https://' then raise exception 'links must start with https://' using errcode = '22023'; end if;
  select to_jsonb(c) into before from public.mm2h_content c where kind = p_kind and id = v for update;
  insert into public.mm2h_content as c (kind, id, title, body, url, area, phone, valid_until, status, published, sort, updated_at, updated_by)
  values (p_kind, v, trim(p_item->>'title'), nullif(p_item->>'body', ''), nullif(p_item->>'url', ''), nullif(p_item->>'area', ''),
          nullif(p_item->>'phone', ''), nullif(p_item->>'valid_until', '')::date, nullif(p_item->>'status', ''),
          coalesce((p_item->>'published')::boolean, false), coalesce((p_item->>'sort')::integer, 0), now(), auth.uid())
  on conflict (kind, id) do update set title = excluded.title, body = excluded.body, url = excluded.url, area = excluded.area,
    phone = excluded.phone, valid_until = excluded.valid_until, status = excluded.status, published = excluded.published,
    sort = excluded.sort, updated_at = now(), updated_by = auth.uid()
  returning to_jsonb(c.*) into after;
  perform public.eab_admin_write_action(case when before is null then 'mm2h_content_add' else 'mm2h_content_edit' end, null,
    p_kind || ':' || v, p_reason, before, after, p_device);
  return after - 'updated_by';
end $$;

create or replace function public.eab_admin_mm2h_content_delete(p_kind text, p_id uuid, p_reason text, p_device text default null)
returns void language plpgsql security definer set search_path = public as $$
declare before jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'a reason is needed' using errcode = '22023'; end if;
  delete from public.mm2h_content c where kind = p_kind and id = p_id returning to_jsonb(c.*) into before;
  if before is null then raise exception 'item not found' using errcode = 'P0002'; end if;
  perform public.eab_admin_write_action('mm2h_content_delete', null, p_kind || ':' || p_id, p_reason, before, null, p_device);
end $$;

-- ------------------------------------------------------------------------------------------------- permissions
revoke all on function public.eab_app_status(text), public.eab_app_ticket(text, text, text), public.eab_app_report_errors(text, jsonb),
  public.mm2h_sync(jsonb), public.mm2h_forget_me(), public.mm2h_request(text, text), public.mm2h_content_list(),
  public.eab_admin_app_view(text, text, date, date, text, integer, text),
  public.eab_admin__app_ops(text, text, date, date, text, integer, boolean, jsonb),
  public.eab_admin_app_settings_set(text, jsonb, text, text), public.eab_admin_app_flag_set(text, text, text, boolean, text, text),
  public.eab_admin_app_ticket_set(uuid, text, text, text), public.eab_admin_mm2h_request_set(uuid, text, text, text),
  public.eab_admin_mm2h_content_save(text, uuid, jsonb, text, text), public.eab_admin_mm2h_content_delete(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.eab_app_status(text), public.mm2h_content_list() to anon, authenticated;
grant execute on function public.eab_app_ticket(text, text, text), public.eab_app_report_errors(text, jsonb),
  public.mm2h_sync(jsonb), public.mm2h_forget_me(), public.mm2h_request(text, text),
  public.eab_admin_app_view(text, text, date, date, text, integer, text),
  public.eab_admin_app_settings_set(text, jsonb, text, text), public.eab_admin_app_flag_set(text, text, text, boolean, text, text),
  public.eab_admin_app_ticket_set(uuid, text, text, text), public.eab_admin_mm2h_request_set(uuid, text, text, text),
  public.eab_admin_mm2h_content_save(text, uuid, jsonb, text, text), public.eab_admin_mm2h_content_delete(text, uuid, text, text)
  to authenticated;
-- eab_admin__app_ops is internal (called only from eab_admin_app_view, which runs as the owner).
