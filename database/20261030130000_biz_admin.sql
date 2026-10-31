-- AdminBatch010 — AI Buddy Biz project: the admin side (allow-list, tamper-evident log, read views, settings).
-- Additive only: new eab_* tables and functions. No existing Biz table is changed, except tenant_modules rows when an
-- Owner / Admin switches a module for a business (with a reason, logged).
-- Same function names as the Admin EAB database, so the admin app talks to both the same way.

-- ------------------------------------------------------------------------------------------- allow-list and log
create table if not exists public.eab_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'admin', 'compliance', 'viewer')),
  active boolean not null default true,
  expires_at timestamptz,
  added_at timestamptz not null default now(),
  added_by uuid
);
-- Google accounts allowed in before they have signed in to this project once. On their first admin sign-in they
-- move to eab_admins. Seeded with the Owner.
create table if not exists public.eab_admin_pending (
  email text primary key check (email = lower(email)),
  role text not null check (role in ('owner', 'admin', 'compliance', 'viewer')),
  added_at timestamptz not null default now(),
  added_by uuid
);
insert into public.eab_admin_pending (email, role) values ('joe.matthew.iqi@gmail.com', 'owner') on conflict do nothing;

-- One hash-chained log for admin actions and admin access. Nobody can change or delete a row (no grants; trigger).
create table if not exists public.eab_admin_log (
  seq bigint generated always as identity primary key,
  at timestamptz not null default now(),
  admin_user uuid,
  admin_email text,
  admin_role text,
  kind text not null check (kind in ('action', 'access')),
  name text not null,
  target_ref text,
  reason text,
  detail jsonb,
  device text,
  prev_hash text not null,
  hash text not null
);
create or replace function public.eab_admin_log_no_change() returns trigger language plpgsql as $$
begin raise exception 'the admin log cannot be changed' using errcode = '42501'; end $$;
create or replace trigger eab_admin_log_lock before update or delete on public.eab_admin_log for each row execute function public.eab_admin_log_no_change();

create table if not exists public.eab_app_settings (
  app text primary key check (app = 'biz'),
  maintenance_on boolean not null default false,
  maintenance_message text,
  min_version text,
  update_url text,
  announcement text,
  announcement_until timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.eab_app_settings (app) values ('biz') on conflict do nothing;
create table if not exists public.eab_app_flags (
  app text not null check (app = 'biz'),
  key text not null check (key ~ '^[a-z0-9_.-]{2,60}$'),
  label text not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (app, key)
);
create table if not exists public.eab_app_tickets (
  id uuid primary key default gen_random_uuid(),
  app text not null check (app = 'biz'),
  user_id uuid not null references auth.users (id) on delete cascade,
  tenant_id uuid,
  subject text not null check (length(subject) between 1 and 200),
  body text check (length(body) <= 5000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.eab_app_errors (
  id bigint generated always as identity primary key,
  app text not null check (app = 'biz'),
  user_id uuid,
  at timestamptz not null default now(),
  message text not null,
  screen text,
  app_version text,
  platform text
);

alter table public.eab_admins enable row level security;
alter table public.eab_admin_pending enable row level security;
alter table public.eab_admin_log enable row level security;
alter table public.eab_app_settings enable row level security;
alter table public.eab_app_flags enable row level security;
alter table public.eab_app_tickets enable row level security;
alter table public.eab_app_errors enable row level security;
revoke all on public.eab_admins, public.eab_admin_pending, public.eab_admin_log, public.eab_app_settings, public.eab_app_flags,
  public.eab_app_tickets, public.eab_app_errors from anon, authenticated;

-- ------------------------------------------------------------------------------------------------- core helpers
create or replace function public.eab_admin_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.eab_admins where user_id = auth.uid() and active and (expires_at is null or expires_at > now())
$$;

create or replace function public.eab_admin_guard(p_roles text[])
returns text language plpgsql stable security definer set search_path = public as $$
declare r text := public.eab_admin_role();
begin
  if r is null or not (r = any (p_roles)) then raise exception 'not allowed' using errcode = '42501'; end if;
  return r;
end $$;

create or replace function public.eab_admin__log(p_kind text, p_name text, p_ref text, p_reason text, p_detail jsonb, p_device text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare prev text; e text; r text;
begin
  perform pg_advisory_xact_lock(hashtext('eab_admin_log'));
  select hash into prev from public.eab_admin_log order by seq desc limit 1;
  prev := coalesce(prev, 'genesis');
  select email, role into e, r from public.eab_admins where user_id = auth.uid();
  insert into public.eab_admin_log (admin_user, admin_email, admin_role, kind, name, target_ref, reason, detail, device, prev_hash, hash)
  values (auth.uid(), e, r, p_kind, p_name, p_ref, p_reason, p_detail, left(p_device, 120), prev,
    encode(digest(prev || '|' || coalesce(auth.uid()::text, '') || '|' || p_kind || '|' || p_name || '|' || coalesce(p_ref, '') || '|' ||
      coalesce(p_reason, '') || '|' || coalesce(p_detail::text, ''), 'sha256'), 'hex'));
end $$;

create or replace function public.eab_admin_write_access(p_kind text, p_target uuid, p_ref text, p_detail jsonb, p_device text)
returns void language sql security definer set search_path = public as $$
  select public.eab_admin__log('access', p_kind, coalesce(p_ref, p_target::text), null, p_detail, p_device)
$$;
create or replace function public.eab_admin_write_action(p_action text, p_target uuid, p_ref text, p_reason text, p_before jsonb, p_after jsonb, p_device text)
returns void language sql security definer set search_path = public as $$
  select public.eab_admin__log('action', p_action, coalesce(p_ref, p_target::text), p_reason, jsonb_build_object('before', p_before, 'after', p_after), p_device)
$$;

/** Who is signed in (null = not an admin). */
create or replace function public.eab_admin_me()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('user_id', user_id, 'email', email, 'role', role, 'expires_at', expires_at)
  from public.eab_admins where user_id = auth.uid() and active and (expires_at is null or expires_at > now())
$$;

/** Called after Google sign-in: a pending email becomes an admin; then the sign-in is logged. Others: not allowed. */
create or replace function public.eab_admin_signed_in(p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare em text := lower(coalesce(auth.jwt()->>'email', '')); p record; me jsonb;
begin
  if auth.uid() is null then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into p from public.eab_admin_pending where email = em;
  if found and coalesce((auth.jwt()->'user_metadata'->>'email_verified')::boolean, (auth.jwt()->>'email_verified')::boolean, true) then
    insert into public.eab_admins (user_id, email, role, added_by) values (auth.uid(), em, p.role, p.added_by)
    on conflict (user_id) do nothing;
    delete from public.eab_admin_pending where email = em;
  end if;
  me := public.eab_admin_me();
  if me is null then raise exception 'not allowed' using errcode = '42501'; end if;
  perform public.eab_admin__log('access', 'sign_in', null, null, null, p_device);
  return me;
end $$;

/** Owner: add, change or switch off a Biz admin by Google email (works before they have signed in). */
create or replace function public.eab_admin_set_admin(p_email text, p_role text, p_active boolean, p_expires_at timestamptz, p_reason text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare em text := lower(trim(p_email)); u uuid; before jsonb;
begin
  perform public.eab_admin_guard(array['owner']);
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'a reason is needed' using errcode = '22023'; end if;
  if p_role not in ('owner', 'admin', 'compliance', 'viewer') then raise exception 'bad role' using errcode = '22023'; end if;
  select id into u from auth.users where lower(email) = em;
  if u = auth.uid() and (not p_active or p_role <> 'owner') then raise exception 'you cannot remove your own Owner access' using errcode = '22023'; end if;
  if u is null then
    insert into public.eab_admin_pending (email, role, added_by) values (em, p_role, auth.uid())
    on conflict (email) do update set role = excluded.role, added_by = auth.uid(), added_at = now();
  else
    select to_jsonb(a) into before from public.eab_admins a where user_id = u;
    insert into public.eab_admins (user_id, email, role, active, expires_at, added_by) values (u, em, p_role, p_active, p_expires_at, auth.uid())
    on conflict (user_id) do update set role = excluded.role, active = excluded.active, expires_at = excluded.expires_at;
  end if;
  perform public.eab_admin_write_action('admin_set', u, em, p_reason, before,
    jsonb_build_object('role', p_role, 'active', p_active, 'expires_at', p_expires_at, 'pending', u is null), p_device);
  return jsonb_build_object('email', em, 'role', p_role, 'active', p_active, 'pending', u is null);
end $$;

/** Re-computes the hash chain. */
create or replace function public.eab_admin_verify_log(p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare prev text := 'genesis'; x record; n integer := 0; bad bigint;
begin
  perform public.eab_admin_guard(array['owner', 'compliance']);
  for x in select * from public.eab_admin_log order by seq loop
    if x.prev_hash <> prev or x.hash <> encode(digest(prev || '|' || coalesce(x.admin_user::text, '') || '|' || x.kind || '|' || x.name || '|' ||
       coalesce(x.target_ref, '') || '|' || coalesce(x.reason, '') || '|' || coalesce(x.detail::text, ''), 'sha256'), 'hex') then
      bad := x.seq; exit;
    end if;
    prev := x.hash; n := n + 1;
  end loop;
  perform public.eab_admin__log('access', 'verify_log', null, null, jsonb_build_object('ok', bad is null), p_device);
  return jsonb_build_object('ok', bad is null, 'checked', n, 'first_bad_seq', bad);
end $$;

-- ----------------------------------------------------------------------------------------- for the Biz app itself
create or replace function public.eab_app_status(p_app text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('maintenance_on', s.maintenance_on, 'maintenance_message', s.maintenance_message,
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
  insert into public.eab_app_tickets (app, user_id, tenant_id, subject, body)
  values (p_app, auth.uid(), (select tenant_id from public.memberships where user_id = auth.uid() and active order by created_at limit 1),
          left(p_subject, 200), left(p_body, 5000))
  returning id into v;
  return v;
end $$;
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

-- ------------------------------------------------------------------------------------------------ admin: views
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
  summary jsonb;
  rows jsonb;
begin
  if p_app <> 'biz' then raise exception 'unknown app' using errcode = 'P0002'; end if;
  if t < f then raise exception 'the end date is before the start date' using errcode = '22023'; end if;

  if p_view = 'businesses' then
    select jsonb_build_object('businesses', count(*), 'new_in_period', count(*) filter (where created_at::date between f and t),
      'by_template', (select jsonb_object_agg(coalesce(industry_template, '—'), n) from (select industry_template, count(*) n from public.tenants group by 1) z))
      into summary from public.tenants;
    select jsonb_agg(x) into rows from (
      select tn.id, tn.name, tn.industry_template as template, tn.plan, tn.country_code as country, tn.created_at::date as since,
             (select count(*) from public.memberships m where m.tenant_id = tn.id and m.active) as team,
             (select count(*) from public.outlets o where o.tenant_id = tn.id) as outlets,
             (select string_agg(module, ', ' order by module) from public.tenant_modules tm where tm.tenant_id = tn.id and tm.enabled) as modules_on,
             case when named then tn.email end as email, tn.einvoice_enabled as e_invoice
      from public.tenants tn where q is null or tn.name ilike '%' || q || '%' order by tn.created_at desc limit lim) x;
  elsif p_view = 'modules' then
    select jsonb_build_object('switched_on', count(*) filter (where enabled), 'switched_off', count(*) filter (where not enabled),
      'by_module', (select jsonb_object_agg(module, n) from (select module, count(*) filter (where enabled) n from public.tenant_modules group by 1) z))
      into summary from public.tenant_modules;
    select jsonb_agg(x) into rows from (
      select tm.tenant_id, tn.name as business, tm.module, tm.enabled from public.tenant_modules tm join public.tenants tn on tn.id = tm.tenant_id
      where q is null or tn.name ilike '%' || q || '%' or tm.module ilike q order by tn.name, tm.module limit lim) x;
  elsif p_view = 'invites' then
    select jsonb_build_object('open', count(*) filter (where accepted_at is null), 'accepted', count(*) filter (where accepted_at is not null)) into summary from public.invites;
    select jsonb_agg(x) into rows from (
      select tn.name as business, case when named then i.email end as email, ro.name as role, i.created_at::date as sent, i.accepted_at::date as accepted
      from public.invites i join public.tenants tn on tn.id = i.tenant_id left join public.roles ro on ro.id = i.role_id
      order by i.created_at desc limit lim) x;
  elsif p_view = 'inventory' then
    select jsonb_build_object('products', (select count(*) from public.products), 'active', (select count(*) from public.products where active),
      'below_reorder', (select count(*) from public.stock_levels where reorder_point is not null and qty <= reorder_point),
      'stock_moves_in_period', (select count(*) from public.stock_movements sm where sm.at::date between f and t)) into summary;
    select jsonb_agg(x) into rows from (
      select tn.name as business, p.name as product, p.kind, p.active, p.sold_out,
             (select sum(sl.qty) from public.stock_levels sl join public.product_variants pv on pv.id = sl.variant_id where pv.product_id = p.id) as stock
      from public.products p join public.tenants tn on tn.id = p.tenant_id
      where q is null or p.name ilike '%' || q || '%' or tn.name ilike '%' || q || '%' order by tn.name, p.name limit lim) x;
  elsif p_view = 'sales' then
    select jsonb_build_object('sales', count(*), 'total_rm', round(coalesce(sum(total), 0), 2), 'tax_rm', round(coalesce(sum(tax_total), 0), 2),
      'shifts_open', (select count(*) from public.shifts where closed_at is null)) into summary
      from public.sales where sold_at::date between f and t and coalesce(status, '') <> 'void';
    select jsonb_agg(x) into rows from (
      select tn.name as business, s.receipt_no, s.sold_at, s.status, s.total, s.tax_total
      from public.sales s join public.tenants tn on tn.id = s.tenant_id
      where s.sold_at::date between f and t and (q is null or tn.name ilike '%' || q || '%' or s.receipt_no ilike '%' || q || '%')
      order by s.sold_at desc limit lim) x;
  elsif p_view = 'accounting' then
    select jsonb_build_object('invoices', count(*), 'invoiced_rm', round(coalesce(sum(total), 0), 2), 'unpaid_rm', round(coalesce(sum(total - amount_paid), 0), 2),
      'e_invoice', (select jsonb_object_agg(coalesce(einvoice_status, 'not sent'), n) from (select einvoice_status, count(*) n from public.invoices
        where issue_date between f and t group by 1) z),
      'journal_entries', (select count(*) from public.journal_entries where entry_date between f and t)) into summary
      from public.invoices where issue_date between f and t;
    select jsonb_agg(x) into rows from (
      select tn.name as business, i.number, i.issue_date, i.due_date, i.status, i.total, i.amount_paid, coalesce(i.einvoice_status, 'not sent') as e_invoice,
             i.einvoice_error
      from public.invoices i join public.tenants tn on tn.id = i.tenant_id
      where i.issue_date between f and t and (q is null or tn.name ilike '%' || q || '%' or i.number ilike '%' || q || '%')
      order by i.issue_date desc limit lim) x;
  elsif p_view = 'crm' then
    select jsonb_build_object('deals', count(*), 'open_value_rm', round(coalesce(sum(value) filter (where status = 'open'), 0), 2),
      'won', count(*) filter (where status = 'won'), 'lost', count(*) filter (where status = 'lost'),
      'leads_captured', (select count(*) from public.lead_capture_log where at::date between f and t),
      'campaigns', (select count(*) from public.campaigns where created_at::date between f and t)) into summary from public.deals;
    select jsonb_agg(x) into rows from (
      select tn.name as business, d.title, d.status, d.value, d.source, d.score, d.expected_close, d.created_at::date as created
      from public.deals d join public.tenants tn on tn.id = d.tenant_id
      where q is null or tn.name ilike '%' || q || '%' or d.title ilike '%' || q || '%' order by d.created_at desc limit lim) x;
  elsif p_view = 'outbound' then
    select jsonb_build_object('queued', count(*) filter (where status in ('queued', 'pending')), 'sent', count(*) filter (where status = 'sent'),
      'failed', count(*) filter (where status = 'failed'),
      'by_channel', (select jsonb_object_agg(coalesce(channel, '—'), n) from (select channel, count(*) n from public.outbound_messages where created_at::date between f and t group by 1) z))
      into summary from public.outbound_messages where created_at::date between f and t;
    select jsonb_agg(x) into rows from (
      select tn.name as business, o.channel, case when named then o.to_address end as to_address, o.subject, o.status, o.attempts, o.error, o.created_at, o.sent_at
      from public.outbound_messages o join public.tenants tn on tn.id = o.tenant_id
      where o.created_at::date between f and t and (q is null or tn.name ilike '%' || q || '%' or o.status = q)
      order by (o.status = 'failed') desc, o.created_at desc limit lim) x;
  elsif p_view = 'shipping' then
    select jsonb_build_object('shipments', count(*), 'by_status', (select jsonb_object_agg(coalesce(status, '—'), n) from (select status, count(*) n from public.shipments group by 1) z),
      'customs_held', count(*) filter (where customs_status in ('held', 'hold', 'inspection')), 'dangerous_goods', count(*) filter (where dangerous_goods)) into summary
      from public.shipments;
    select jsonb_agg(x) into rows from (
      select tn.name as business, s.ref, s.mode, s.direction, s.status, s.customs_status, s.etd, s.eta, s.dangerous_goods
      from public.shipments s join public.tenants tn on tn.id = s.tenant_id
      where q is null or s.ref ilike '%' || q || '%' or tn.name ilike '%' || q || '%' order by s.created_at desc limit lim) x;
  elsif p_view = 'hr' then
    select jsonb_build_object('employees', (select count(*) from public.employees where coalesce(status, 'active') = 'active'),
      'payroll_runs', count(*), 'by_status', (select jsonb_object_agg(coalesce(status, '—'), n) from (select status, count(*) n from public.payroll_runs group by 1) z),
      'leave_pending', (select count(*) from public.leave_requests where status = 'pending'),
      'claims_pending', (select count(*) from public.claims where status = 'pending')) into summary from public.payroll_runs;
    select jsonb_agg(x) into rows from (
      select tn.name as business, pr.year, pr.month, pr.status, pr.pay_date, pr.approved_at::date as approved, pr.paid_at::date as paid,
             (select count(*) from public.payslips ps where ps.run_id = pr.id) as payslips
      from public.payroll_runs pr join public.tenants tn on tn.id = pr.tenant_id
      where q is null or tn.name ilike '%' || q || '%' order by pr.year desc, pr.month desc limit lim) x;
  elsif p_view = 'legal' then
    select jsonb_build_object('contracts', count(*), 'awaiting_signature', count(*) filter (where sent_at is not null and signed_at is null),
      'ending_in_60_days', count(*) filter (where end_date between current_date and current_date + 60),
      'compliance_overdue', (select count(*) from public.compliance_items where status <> 'done' and due_date < current_date)) into summary from public.contracts;
    select jsonb_agg(x) into rows from (
      select tn.name as business, 'compliance' as kind, c.title, c.authority as detail, c.due_date as date, c.status
        from public.compliance_items c join public.tenants tn on tn.id = c.tenant_id
        where c.status <> 'done' and (q is null or c.title ilike '%' || q || '%')
      union all
      select tn.name, 'contract', k.title, k.number, k.end_date, k.status
        from public.contracts k join public.tenants tn on tn.id = k.tenant_id where q is null or k.title ilike '%' || q || '%'
      order by 5 nulls last limit lim) x;
  elsif p_view = 'kids' then
    -- Children's names are never shown in the admin app; counts and incident facts only.
    select jsonb_build_object('children', (select count(*) from public.children where coalesce(status, 'active') = 'active'),
      'incidents', count(*), 'serious', count(*) filter (where severity in ('serious', 'major', 'high')),
      'parent_not_told', count(*) filter (where parent_notified_at is null), 'open', count(*) filter (where coalesce(status, 'open') <> 'closed'),
      'medicine_given', (select count(*) from public.kids_med_given where given_at::date between f and t)) into summary
      from public.kids_incidents where occurred_at::date between f and t;
    select jsonb_agg(x) into rows from (
      select tn.name as business, i.occurred_at, i.kind, i.severity, i.location, i.status, i.parent_notified_at is not null as parent_told,
             i.guardian_ack_at is not null as parent_acknowledged
      from public.kids_incidents i join public.tenants tn on tn.id = i.tenant_id
      where i.occurred_at::date between f and t order by i.occurred_at desc limit lim) x;
  elsif p_view = 'orders' then
    select jsonb_build_object('orders', count(*), 'value_rm', round(coalesce(sum(items_total), 0), 2), 'cancelled', count(*) filter (where cancelled_at is not null),
      'by_channel', (select jsonb_object_agg(coalesce(channel, '—'), n) from (select channel, count(*) n from public.orders where created_at::date between f and t group by 1) z),
      'bookings', (select count(*) from public.bookings b where b.created_at::date between f and t)) into summary
      from public.orders where created_at::date between f and t;
    select jsonb_agg(x) into rows from (
      select tn.name as business, o.order_no, o.channel, o.fulfilment, o.status, o.items_total, o.created_at, o.cancel_reason
      from public.orders o join public.tenants tn on tn.id = o.tenant_id
      where o.created_at::date between f and t and (q is null or o.order_no ilike '%' || q || '%' or tn.name ilike '%' || q || '%')
      order by o.created_at desc limit lim) x;
  elsif p_view = 'shopsync' then
    select jsonb_build_object('channels', count(*), 'enabled', count(*) filter (where enabled), 'with_errors', count(*) filter (where last_error is not null)) into summary from public.shop_channels;
    select jsonb_agg(x) into rows from (
      select tn.name as business, c.provider, c.enabled, c.import_orders, c.push_stock, c.last_sync_at, c.last_error
      from public.shop_channels c join public.tenants tn on tn.id = c.tenant_id order by (c.last_error is not null) desc, tn.name limit lim) x;
  elsif p_view = 'ai' then
    select jsonb_build_object('suggestions', count(*), 'approved', count(*) filter (where status in ('approved', 'done')),
      'rejected', count(*) filter (where status = 'rejected'), 'failed', count(*) filter (where error is not null),
      'ai_cost_usd', (select round(coalesce(sum(cost_usd), 0), 4) from public.ai_usage where at::date between f and t)) into summary
      from public.ai_suggestions where created_at::date between f and t;
    select jsonb_agg(x) into rows from (
      select tn.name as business, s.agent, s.kind, s.title, s.status, s.created_at, s.decided_at, s.error
      from public.ai_suggestions s join public.tenants tn on tn.id = s.tenant_id
      where s.created_at::date between f and t order by s.created_at desc limit lim) x;
  elsif p_view in ('users', 'signups') then
    select jsonb_build_object('users', count(distinct m.user_id), 'new_in_period', count(distinct m.user_id) filter (where m.created_at::date between f and t)) into summary
      from public.memberships m where m.active;
    if named then select jsonb_agg(x) into rows from (
      select a.email, tn.name as business, ro.name as role, m.created_at::date as joined, a.last_sign_in_at::date as last_sign_in
      from public.memberships m join auth.users a on a.id = m.user_id join public.tenants tn on tn.id = m.tenant_id left join public.roles ro on ro.id = m.role_id
      where m.active and (p_view = 'users' or m.created_at::date between f and t) and (q is null or a.email ilike '%' || q || '%' or tn.name ilike '%' || q || '%')
      order by m.created_at desc limit lim) x; end if;
  elsif p_view = 'tickets' then
    select jsonb_build_object('open', count(*) filter (where status = 'open'), 'total', count(*)) into summary from public.eab_app_tickets;
    select jsonb_agg(x) into rows from (select k.id, k.created_at::date as date, case when named then a.email end as from_user, k.subject,
        case when named then k.body end as details, k.status
      from public.eab_app_tickets k left join auth.users a on a.id = k.user_id order by (k.status = 'closed'), k.created_at desc limit lim) x;
  elsif p_view = 'errors' then
    select jsonb_build_object('errors', count(*), 'users_affected', count(distinct user_id)) into summary from public.eab_app_errors where at::date between f and t;
    select jsonb_agg(x) into rows from (select message, count(*) as times, count(distinct user_id) as users, max(at) as last_seen
      from public.eab_app_errors where at::date between f and t group by message order by count(*) desc limit lim) x;
  elsif p_view = 'flags' then
    select jsonb_build_object('flags', count(*), 'on', count(*) filter (where enabled)) into summary from public.eab_app_flags;
    select jsonb_agg(x) into rows from (select key, label, enabled, updated_at from public.eab_app_flags order by key) x;
  elsif p_view = 'settings' then
    select to_jsonb(st) - 'app' - 'updated_by' into summary from public.eab_app_settings st where app = 'biz';
  elsif p_view = 'adminlog' then
    perform public.eab_admin_guard(array['owner', 'compliance']);
    select jsonb_build_object('entries', count(*)) into summary from public.eab_admin_log;
    select jsonb_agg(x) into rows from (select seq, at, admin_email, admin_role, kind, name, target_ref, reason from public.eab_admin_log
      order by seq desc limit lim) x;
  elsif p_view = 'admins' then
    perform public.eab_admin_guard(array['owner']);
    select jsonb_build_object('admins', count(*), 'waiting_first_sign_in', (select count(*) from public.eab_admin_pending)) into summary from public.eab_admins;
    select jsonb_agg(x) into rows from (
      select email, role, active, expires_at, added_at::date as added, false as waiting from public.eab_admins
      union all select email, role, true, null, added_at::date, true from public.eab_admin_pending order by 1) x;
  else
    raise exception 'unknown view' using errcode = 'P0002';
  end if;

  perform public.eab_admin_write_access('app_view', null, 'biz:' || p_view, jsonb_build_object('from', f, 'to', t, 'q', q, 'names', named), p_device);
  return jsonb_build_object('summary', coalesce(summary, '{}'::jsonb), 'rows', coalesce(rows, '[]'::jsonb), 'names_hidden', not named, 'from', f, 'to', t);
end $$;

-- ---------------------------------------------------------------------------------------------- admin: changes
create or replace function public.eab_admin_app_settings_set(p_app text, p_patch jsonb, p_reason text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare before jsonb; after jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'a reason is needed' using errcode = '22023'; end if;
  if coalesce(p_patch->>'update_url', '') <> '' and p_patch->>'update_url' !~ '^https://' then
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
  select jsonb_build_object('status', status) into before from public.eab_app_tickets where id = p_id for update;
  if before is null then raise exception 'ticket not found' using errcode = 'P0002'; end if;
  update public.eab_app_tickets set status = p_status, updated_at = now() where id = p_id;
  perform public.eab_admin_write_action('app_ticket', null, p_id::text, coalesce(nullif(trim(p_reason), ''), 'status changed'), before, jsonb_build_object('status', p_status), p_device);
end $$;

/** Switch one module on or off for one business. Owner / Admin, with a reason. */
create or replace function public.eab_admin_biz_module_set(p_tenant uuid, p_module text, p_enabled boolean, p_reason text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare before jsonb; after jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin']);
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'a reason is needed' using errcode = '22023'; end if;
  if not exists (select 1 from public.tenants where id = p_tenant) then raise exception 'business not found' using errcode = 'P0002'; end if;
  if p_module !~ '^[A-Z]{2,10}$' then raise exception 'bad module' using errcode = '22023'; end if;
  select to_jsonb(tm) into before from public.tenant_modules tm where tenant_id = p_tenant and module = p_module for update;
  insert into public.tenant_modules as tm (tenant_id, module, enabled, settings) values (p_tenant, p_module, p_enabled, '{}'::jsonb)
  on conflict (tenant_id, module) do update set enabled = excluded.enabled
  returning to_jsonb(tm.*) into after;
  perform public.eab_admin_write_action('biz_module', p_tenant, p_module, p_reason, before, after, p_device);
  return after;
end $$;

-- ------------------------------------------------------------------------------------------------ permissions
revoke all on function public.eab_admin_role(), public.eab_admin_guard(text[]),
  public.eab_admin__log(text, text, text, text, jsonb, text), public.eab_admin_write_access(text, uuid, text, jsonb, text),
  public.eab_admin_write_action(text, uuid, text, text, jsonb, jsonb, text), public.eab_admin_me(), public.eab_admin_signed_in(text),
  public.eab_admin_set_admin(text, text, boolean, timestamptz, text, text), public.eab_admin_verify_log(text),
  public.eab_app_status(text), public.eab_app_ticket(text, text, text), public.eab_app_report_errors(text, jsonb),
  public.eab_admin_app_view(text, text, date, date, text, integer, text), public.eab_admin_app_settings_set(text, jsonb, text, text),
  public.eab_admin_app_flag_set(text, text, text, boolean, text, text), public.eab_admin_app_ticket_set(uuid, text, text, text),
  public.eab_admin_biz_module_set(uuid, text, boolean, text, text), public.eab_admin_log_no_change()
  from public, anon, authenticated;
grant execute on function public.eab_app_status(text) to anon, authenticated;
grant execute on function public.eab_admin_me(), public.eab_admin_signed_in(text), public.eab_admin_set_admin(text, text, boolean, timestamptz, text, text),
  public.eab_admin_verify_log(text), public.eab_app_ticket(text, text, text), public.eab_app_report_errors(text, jsonb),
  public.eab_admin_app_view(text, text, date, date, text, integer, text), public.eab_admin_app_settings_set(text, jsonb, text, text),
  public.eab_admin_app_flag_set(text, text, text, boolean, text, text), public.eab_admin_app_ticket_set(uuid, text, text, text),
  public.eab_admin_biz_module_set(uuid, text, boolean, text, text)
  to authenticated;
