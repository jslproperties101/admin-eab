-- AdminBatch012: the database behind AdminBatch010 "Content & Maps" and AdminBatch011 "Money" (Estate Agent AI Buddy
-- database; EAB-QA-Test while testing). The two app batches were built against a fake database only; their SQL was never
-- written to any branch. This file rebuilds it from what the screens call (src/api/admin.ts) and the rules in the README.
-- Joe, 9 Nov 2026: rebuild, keep database files in admin-eab/database, apply to the TEST project only.
--
-- Needs, already on the database: admin foundation (eab_admin_guard, eab_admin_write_access / _action), AdminBatch005
-- (eab_dash_*), AdminBatch007 (eab_complaints, eab_b7_me_email), AdminBatch009 Market (eab_mkt_*), main app eab_files.
-- Additive only: new tables, new functions and one new storage read rule. Nothing existing is changed.
--
-- In plain words:
--   * Moderation cases MOD-YYYY-#### and the ledger LED-YYYY-#### are never deleted. A case is closed with a reason; a
--     ledger entry is voided with a reason. The database refuses deletes and refuses edits other than those.
--   * Owner / Admin / Compliance see names; a Viewer sees totals, charts and anonymous map dots only; a Regulator none.
--     Every list that names agents is written to the admin access log; every change to the action log with its reason.
--   * Money: Owner / Admin / Compliance can look; only the Owner can add, void, copy monthly bills or change prices.
--   * Listing photos: a new storage rule lets Owner / Admin / Compliance open LISTING PHOTOS only (not documents).
--   * Google costs are ESTIMATES from the calls the app reports, using the prices the Owner types in. Google's bill wins.

do $chk$
begin
  if to_regprocedure('public.eab_admin_guard(text[])') is null
     or to_regprocedure('public.eab_admin_write_access(text, uuid, text, jsonb, text)') is null
     or to_regprocedure('public.eab_dash_names()') is null or to_regprocedure('public.eab_dash_activity(date, date)') is null
     or to_regprocedure('public.eab_mkt_score(jsonb)') is null or to_regprocedure('public.eab_b7_me_email()') is null
     or to_regclass('public.eab_complaints') is null or to_regclass('public.eab_files') is null
     or to_regclass('public.eab_usage_events') is null or to_regclass('public.eab_login_log') is null then
    raise exception 'apply the admin foundation, AdminBatch005, 007, 009 Market and the main-app file and usage tables first';
  end if;
end $chk$;

-- =====================================================================================================================
-- PART 1 — tables
-- =====================================================================================================================
create sequence if not exists public.eab_mod_seq;
create sequence if not exists public.eab_ledger_seq;

-- 16 Moderation cases. agent_user has no foreign key on purpose: a case outlives the account (7-year rule).
create table if not exists public.eab_mod_cases (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  kind text not null check (kind in ('listing', 'photo')),
  agent_user uuid,
  workspace_id uuid,
  record_id text check (record_id is null or length(record_id) <= 100),
  listing_ref text check (listing_ref is null or length(listing_ref) <= 60),
  file_sha text check (file_sha is null or file_sha ~ '^[0-9a-f]{64}$'),
  reason text not null check (reason in ('price_far', 'no_title_type', 'no_price', 'no_photos', 'same_photo', 'same_spot',
    'same_address', 'wrong_photo', 'offensive_photo', 'misleading', 'other')),
  source text not null default 'admin' check (source in ('admin', 'suspect', 'photo_review')),
  details text not null check (length(btrim(details)) between 5 and 2000),
  status text not null default 'open' check (status in ('open', 'cleared', 'confirmed', 'referred')),
  outcome text check (outcome is null or length(outcome) <= 2000),
  complaint_id uuid references public.eab_complaints (id),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint eab_mod_referred_needs_complaint check (status <> 'referred' or complaint_id is not null),
  constraint eab_mod_photo_needs_file check (kind <> 'photo' or file_sha is not null)
);
create index if not exists eab_mod_cases_status_idx on public.eab_mod_cases (status, created_at desc);
create index if not exists eab_mod_cases_agent_idx on public.eab_mod_cases (agent_user);
create index if not exists eab_mod_cases_record_idx on public.eab_mod_cases (record_id, reason) where status = 'open';

create table if not exists public.eab_mod_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.eab_mod_cases (id),
  kind text not null check (kind in ('created', 'status', 'updated', 'note')),
  body text check (body is null or length(body) <= 2000),
  from_status text,
  to_status text,
  by_user uuid,
  by_email text,
  at timestamptz not null default now()
);
create index if not exists eab_mod_events_case_idx on public.eab_mod_events (case_id, id);

-- 57 Photo review: one decision per photo (workspace + file fingerprint). A new review replaces it; the action log
-- keeps every decision.
create table if not exists public.eab_photo_reviews (
  workspace_id uuid not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  decision text not null check (decision in ('ok', 'flagged')),
  reason text check (reason is null or length(reason) <= 2000),
  case_id uuid references public.eab_mod_cases (id),
  reviewed_by uuid,
  reviewed_by_email text,
  reviewed_at timestamptz not null default now(),
  primary key (workspace_id, sha256),
  constraint eab_photo_flag_needs_reason check (decision <> 'flagged' or length(btrim(coalesce(reason, ''))) >= 5)
);

-- 10 Billing & expenses ledger.
create table if not exists public.eab_ledger (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  kind text not null check (kind in ('expense', 'income')),
  category text not null,
  payee text not null check (length(btrim(payee)) between 1 and 200),
  description text check (description is null or length(description) <= 2000),
  amount numeric(14, 2) not null check (amount > 0 and amount < 100000000),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  fx_to_myr numeric(14, 6) not null check (fx_to_myr > 0),
  amount_myr numeric(14, 2) not null check (amount_myr >= 0),
  paid_on date not null,
  period_month date not null check (extract(day from period_month) = 1),
  recurring boolean not null default false,
  invoice_ref text check (invoice_ref is null or length(invoice_ref) <= 100),
  repeat_of uuid references public.eab_ledger (id),
  created_by uuid,
  created_by_email text,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text check (void_reason is null or length(btrim(void_reason)) between 5 and 2000),
  voided_by uuid,
  voided_by_email text,
  constraint eab_ledger_category_fits check (
    (kind = 'expense' and category in ('supabase', 'aws', 'google', 'app_stores', 'domain_hosting', 'email_messaging',
      'software', 'legal_compliance', 'marketing', 'staff', 'other_expense'))
    or (kind = 'income' and category in ('developer_partner', 'advertising', 'other_income'))),
  constraint eab_ledger_myr_rate check (currency <> 'MYR' or fx_to_myr = 1),
  constraint eab_ledger_void_complete check ((voided_at is null) = (void_reason is null))
);
create index if not exists eab_ledger_period_idx on public.eab_ledger (period_month);
create index if not exists eab_ledger_paid_idx on public.eab_ledger (paid_on);
-- A monthly bill is copied into a month once only.
create unique index if not exists eab_ledger_repeat_once on public.eab_ledger (repeat_of, period_month) where repeat_of is not null;

-- Money settings (one row) and Google products with prices and limits (typed by the Owner).
create table if not exists public.eab_money_settings (
  id boolean primary key default true check (id),
  usd_myr numeric(10, 4) check (usd_myr is null or usd_myr > 0),
  monthly_budget_myr numeric(14, 2) check (monthly_budget_myr is null or monthly_budget_myr >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.eab_money_settings (id) values (true) on conflict do nothing;

create table if not exists public.eab_api_skus (
  sku text primary key check (sku ~ '^[a-z0-9_]{2,40}$'),
  label text not null,
  names text[] not null,
  price_per_1000 numeric(10, 4) check (price_per_1000 is null or price_per_1000 >= 0),
  free_per_month integer check (free_per_month is null or free_per_month >= 0),
  monthly_limit integer check (monthly_limit is null or monthly_limit > 0),
  daily_limit integer check (daily_limit is null or daily_limit > 0),
  alert_pct integer not null default 80 check (alert_pct between 1 and 100),
  sort integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
-- Starting prices are the figures in Joe's cost notes (Master Handover file 10, 20 Oct 2026, "verify before relying on
-- them"). The Owner can change every number in Money > Prices; nothing here is a quote from Google.
insert into public.eab_api_skus (sku, label, names, price_per_1000, free_per_month, sort) values
  ('dynamic_maps', 'Dynamic Maps (each map shown)', array['maps.map'], 7, 10000, 1),
  ('geocoding', 'Geocoding (address ↔ map pin)', array['geocoding.reverse', 'geocoding.forward'], 5, 10000, 2),
  ('roads', 'Roads: snap to road', array['roads.snap'], 10, 5000, 3),
  ('places_autocomplete', 'Places Autocomplete', array['places.autocomplete'], null, null, 4),
  ('places_details', 'Places Details', array['places.details'], null, null, 5),
  ('routes', 'Directions and routes', array['directions.route', 'routes.compute'], null, null, 6),
  ('maps_script', 'Maps script loads (not billed on their own)', array['maps.load'], 0, null, 7)
on conflict (sku) do nothing;

-- Only the functions below read or change these tables. No direct access for app users.
alter table public.eab_mod_cases enable row level security;
alter table public.eab_mod_events enable row level security;
alter table public.eab_photo_reviews enable row level security;
alter table public.eab_ledger enable row level security;
alter table public.eab_money_settings enable row level security;
alter table public.eab_api_skus enable row level security;
revoke all on public.eab_mod_cases, public.eab_mod_events, public.eab_photo_reviews, public.eab_ledger,
  public.eab_money_settings, public.eab_api_skus from public, anon, authenticated;
revoke all on sequence public.eab_mod_seq, public.eab_ledger_seq from public, anon, authenticated;

-- Never deleted. Cases: only status, outcome, complaint and updated_at may change. Events: never changed.
-- Ledger: only the void columns may be filled in, once.
create or replace function public.eab_b12_protect() returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if tg_op = 'DELETE' then
    raise exception '% rows are never deleted (7-year record)', tg_table_name using errcode = '42501';
  end if;
  if tg_table_name = 'eab_mod_events' then
    raise exception 'moderation history is never changed' using errcode = '42501';
  elsif tg_table_name = 'eab_mod_cases' then
    if (to_jsonb(new) - array['status', 'outcome', 'complaint_id', 'updated_at']) is distinct from
       (to_jsonb(old) - array['status', 'outcome', 'complaint_id', 'updated_at']) then
      raise exception 'only the status, outcome and complaint of a case can change' using errcode = '42501';
    end if;
  elsif tg_table_name = 'eab_ledger' then
    if old.voided_at is not null or new.voided_at is null
       or (to_jsonb(new) - array['voided_at', 'void_reason', 'voided_by', 'voided_by_email']) is distinct from
          (to_jsonb(old) - array['voided_at', 'void_reason', 'voided_by', 'voided_by_email']) then
      raise exception 'a ledger entry is never edited; void it with a reason and add a new one' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists eab_mod_cases_protect on public.eab_mod_cases;
create trigger eab_mod_cases_protect before update or delete on public.eab_mod_cases for each row execute function public.eab_b12_protect();
drop trigger if exists eab_mod_events_protect on public.eab_mod_events;
create trigger eab_mod_events_protect before update or delete on public.eab_mod_events for each row execute function public.eab_b12_protect();
drop trigger if exists eab_ledger_protect on public.eab_ledger;
create trigger eab_ledger_protect before update or delete on public.eab_ledger for each row execute function public.eab_b12_protect();

-- =====================================================================================================================
-- PART 2 — internal helpers (not callable by apps)
-- =====================================================================================================================
-- Reason / note text: 5 to 2000 characters after trimming (the same rule as the app's confirm box).
create or replace function public.eab_b12_reason(p text, p_what text default 'a reason') returns text
language plpgsql immutable set search_path = pg_catalog as $$
begin
  if length(btrim(coalesce(p, ''))) < 5 then raise exception '% is required (at least 5 characters)', p_what using errcode = '22023'; end if;
  if length(p) > 2000 then raise exception '% is too long (2000 characters at most)', p_what using errcode = '22023'; end if;
  return btrim(p);
end $$;

-- 'sale' or 'rent' for a listing (sale_or_rent counts as sale; its rent is still kept).
create or replace function public.eab_c10_side(d jsonb) returns text
language sql immutable set search_path = pg_catalog as $$ select case when d->>'purpose' = 'rent' then 'rent' else 'sale' end $$;

-- Asking price (sale) or monthly rent (rent).
create or replace function public.eab_c10_price(d jsonb) returns numeric
language sql immutable set search_path = public, pg_catalog as $$
  select nullif(case when public.eab_c10_side(d) = 'rent' then public.eab_mkt_num(d->'monthlyRent')
                     else public.eab_mkt_num(d->'askingPrice') end, 0)
$$;

-- RM per sq ft for a sale listing (built-up area, or land area when there is no built-up area).
create or replace function public.eab_c10_ppsf(d jsonb) returns numeric
language sql immutable set search_path = public, pg_catalog as $$
  select case when public.eab_c10_side(d) = 'sale' then
    round(public.eab_mkt_num(d->'askingPrice')
          / nullif(coalesce(nullif(public.eab_mkt_num(d->'builtUpSqft'), 0), nullif(public.eab_mkt_num(d->'landSqft'), 0)), 0), 2) end
$$;

-- Number of photos on a listing.
create or replace function public.eab_c10_photo_count(d jsonb) returns integer
language sql immutable set search_path = pg_catalog as $$
  select case when jsonb_typeof(d->'photos') = 'array' then jsonb_array_length(d->'photos') else 0 end
$$;

-- Money in words for check details, e.g. "RM 1,500.00".
create or replace function public.eab_c10_rm(p numeric) returns text
language sql immutable set search_path = pg_catalog as $$ select 'RM ' || to_char(p, 'FM999,999,999,990.00') $$;

-- A listing as the moderation screens show it: no owner, vendor, address or commission details.
create or replace function public.eab_c10_listing(p_user uuid, p_id text, d jsonb, p_updated bigint) returns jsonb
language sql stable security definer set search_path = public, auth, pg_catalog as $$
  select jsonb_build_object('user_id', p_user, 'email', u.email, 'name', public.eab_admin_name(u), 'id', p_id,
    'ref', coalesce(d->>'ref', d->>'refNo'), 'headline', nullif(btrim(d->>'headline'), ''), 'type', nullif(btrim(d->>'type'), ''),
    'state', nullif(btrim(d->>'state'), ''), 'city', nullif(btrim(d->>'city'), ''), 'status', public.eab_dash_status_key(d),
    'asking', public.eab_mkt_num(d->'askingPrice'), 'rent', public.eab_mkt_num(d->'monthlyRent'),
    'photos', public.eab_c10_photo_count(d), 'updated_at', to_timestamp(p_updated / 1000.0))
  from (select 1) one left join auth.users u on u.id = p_user
$$;

-- Open (on the market) listings of every agent, with what the checks need.
create or replace function public.eab_c10_open_listings()
returns table (user_id uuid, workspace_id uuid, id text, data jsonb, updated bigint, created timestamptz,
               city_key text, type_key text, ppsf numeric, spot text, address text)
language sql stable security definer set search_path = public, pg_catalog as $$
  select r.user_id, r.workspace_id, r.id, r.data, r.updated, public.eab_mkt_ms(r.data->'created'),
    lower(btrim(coalesce(r.data->>'city', ''))), lower(btrim(coalesce(r.data->>'type', ''))), public.eab_c10_ppsf(r.data),
    case when public.eab_mkt_num(r.data->'lat') between -90 and 90 and public.eab_mkt_num(r.data->'lng') between -180 and 180
         then round(public.eab_mkt_num(r.data->'lat'), 4)::text || ',' || round(public.eab_mkt_num(r.data->'lng'), 4)::text end,
    case when nullif(btrim(r.data->>'unitNo'), '') is not null and nullif(btrim(r.data->>'street'), '') is not null
         then lower(btrim(r.data->>'unitNo')) || ' | ' || lower(regexp_replace(btrim(r.data->>'street'), '\s+', ' ', 'g'))
              || ' | ' || lower(btrim(coalesce(r.data->>'city', ''))) end
  from public.eab_records r
  where r.collection = 'properties' and not r.deleted and public.eab_mkt_open(r.data)
$$;

-- Listing photos in the agents' cloud folder (eab-files), with the listing they belong to.
create or replace function public.eab_c10_listing_photos()
returns table (workspace_id uuid, sha256 text, path text, mime text, bytes bigint, uploaded_at timestamptz,
               user_id uuid, record_id text, data jsonb, updated bigint)
language sql stable security definer set search_path = public, pg_catalog as $$
  select distinct on (f.workspace_id, f.sha256, r.id) f.workspace_id, f.sha256, f.workspace_id::text || '/' || f.sha256, f.mime,
         f.bytes, f.uploaded_at, r.user_id, r.id, r.data, r.updated
  from public.eab_files f
  join public.eab_records r on r.collection = 'properties' and r.id = f.record_id and r.workspace_id = f.workspace_id and not r.deleted
  where f.collection = 'properties' and f.kind = 'photo' and not f.deleted and f.status = 'uploaded' and f.sha256 ~ '^[0-9a-f]{64}$'
  order by f.workspace_id, f.sha256, r.id, f.uploaded_at desc nulls last
$$;

-- The automatic checks: one row per (listing, reason) with the detail in words.
--   price_far     sale price per sq ft is under 40% or over 250% of the median of 3+ other open listings in the same
--                 city and type
--   no_title_type no title type    · no_price  no price and no rent    · no_photos  no photos 14 days after listing
--   same_photo    a photo is also in a listing of another agent     · same_spot  same map spot (about 10 m) as another
--   agent's listing   · same_address  same unit number, street and city as another agent's listing
create or replace function public.eab_c10_checks()
returns table (user_id uuid, id text, data jsonb, updated bigint, reason text, detail text)
language sql stable security definer set search_path = public, pg_catalog as $$
  with l as materialized (select * from public.eab_c10_open_listings()),
  cmp as (select a.id, a.user_id, a.ppsf, a.city_key, a.type_key,
                 (select public.eab_mkt_median(array_agg(b.ppsf)) from l b
                   where b.id <> a.id and b.city_key = a.city_key and b.type_key = a.type_key and b.ppsf > 0) med,
                 (select count(*) from l b where b.id <> a.id and b.city_key = a.city_key and b.type_key = a.type_key and b.ppsf > 0) n
            from l a where a.ppsf > 0 and a.city_key <> '' and a.type_key <> ''),
  ph as materialized (select p.sha256, p.user_id, p.record_id from public.eab_c10_listing_photos() p),
  shared_photo as (select distinct p.record_id, p.user_id from ph p
                    where exists (select 1 from ph q where q.sha256 = p.sha256 and q.user_id <> p.user_id))
  select l.user_id, l.id, l.data, l.updated, 'price_far', public.eab_c10_rm(c.ppsf) || ' per sq ft; others in '
         || coalesce(nullif(btrim(l.data->>'city'), ''), '?') || ' (' || coalesce(nullif(btrim(l.data->>'type'), ''), '?') || '): median '
         || public.eab_c10_rm(round(c.med, 2))
    from l join cmp c on c.id = l.id and c.user_id = l.user_id
   where c.n >= 3 and c.med > 0 and (c.ppsf > c.med * 2.5 or c.ppsf < c.med * 0.4)
  union all
  select l.user_id, l.id, l.data, l.updated, 'no_title_type', 'no title type' from l where coalesce(btrim(l.data->>'titleType'), '') = ''
  union all
  select l.user_id, l.id, l.data, l.updated, 'no_price', 'no price and no rent' from l where public.eab_c10_price(l.data) is null
    and coalesce(public.eab_mkt_num(l.data->'askingPrice'), 0) = 0 and coalesce(public.eab_mkt_num(l.data->'monthlyRent'), 0) = 0
  union all
  select l.user_id, l.id, l.data, l.updated, 'no_photos', 'no photos, listed ' || (now()::date - l.created::date) || ' days ago'
    from l where public.eab_c10_photo_count(l.data) = 0 and l.created < now() - interval '14 days'
  union all
  select l.user_id, l.id, l.data, l.updated, 'same_photo', 'a photo is also in a listing of another agent'
    from l join shared_photo s on s.record_id = l.id and s.user_id = l.user_id
  union all
  select l.user_id, l.id, l.data, l.updated, 'same_spot', 'same map spot as a listing of another agent'
    from l where l.spot is not null and exists (select 1 from l o where o.spot = l.spot and o.user_id <> l.user_id)
  union all
  select l.user_id, l.id, l.data, l.updated, 'same_address', 'same unit address as a listing of another agent'
    from l where l.address is not null and exists (select 1 from l o where o.address = l.address and o.user_id <> l.user_id)
$$;

-- A case as JSON. Full: with details, the listing, the agent's other cases and the history.
create or replace function public.eab_c10_case_json(p_id uuid, p_full boolean) returns jsonb
language sql stable security definer set search_path = public, auth, pg_catalog as $$
  select jsonb_build_object('id', c.id, 'ref', c.ref, 'kind', c.kind, 'agent_user', c.agent_user, 'workspace_id', c.workspace_id,
      'record_id', c.record_id, 'listing_ref', c.listing_ref, 'file_sha', c.file_sha, 'reason', c.reason, 'source', c.source,
      'summary', left(c.details, 160), 'status', c.status, 'outcome', c.outcome, 'complaint_id', c.complaint_id,
      'complaint_ref', (select k.ref from public.eab_complaints k where k.id = c.complaint_id),
      'created_at', c.created_at, 'updated_at', c.updated_at, 'agent_email', u.email, 'agent_name', public.eab_admin_name(u))
    || case when p_full then jsonb_build_object(
      'details', c.details,
      'listing', (select public.eab_c10_listing(r.user_id, r.id, r.data, r.updated) from public.eab_records r
                   where r.collection = 'properties' and r.id = c.record_id and r.user_id = c.agent_user limit 1),
      'agent_cases', (select count(*) from public.eab_mod_cases x where x.agent_user = c.agent_user),
      'history', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'body', e.body, 'from_status', e.from_status,
                    'to_status', e.to_status, 'by_email', e.by_email, 'at', e.at) order by e.id), '[]'::jsonb)
                    from public.eab_mod_events e where e.case_id = c.id)) else '{}'::jsonb end
  from public.eab_mod_cases c left join auth.users u on u.id = c.agent_user
  where c.id = p_id
$$;

-- Make a case (used by "open a case" and by photo review). Checks, writes the first history line and the action log.
create or replace function public.eab_c10_case_new(p jsonb, p_device text) returns uuid
language plpgsql security definer set search_path = public, auth, pg_catalog as $$
declare c public.eab_mod_cases; rec public.eab_records; agent uuid; k text := coalesce(nullif(p->>'kind', ''), 'listing');
begin
  begin agent := nullif(p->>'agent_user', '')::uuid; exception when invalid_text_representation then agent := null; end;
  if agent is null or not exists (select 1 from auth.users where id = agent) then raise exception 'agent not found' using errcode = '22023'; end if;
  if k not in ('listing', 'photo') then raise exception 'kind must be listing or photo' using errcode = '22023'; end if;
  -- check everything BEFORE a reference number is taken, so the MOD numbers have no gaps
  if coalesce(p->>'reason', '') not in ('price_far', 'no_title_type', 'no_price', 'no_photos', 'same_photo', 'same_spot', 'same_address',
       'wrong_photo', 'offensive_photo', 'misleading', 'other') then raise exception 'unknown reason' using errcode = '22023'; end if;
  if coalesce(nullif(p->>'source', ''), 'admin') not in ('admin', 'suspect', 'photo_review') then raise exception 'unknown source' using errcode = '22023'; end if;
  if k = 'photo' and coalesce(p->>'file_sha', '') !~ '^[0-9a-f]{64}$' then raise exception 'a photo case needs the photo' using errcode = '22023'; end if;
  perform public.eab_b12_reason(p->>'details', 'what is wrong');
  if nullif(p->>'record_id', '') is not null then
    select * into rec from public.eab_records r where r.collection = 'properties' and r.id = p->>'record_id' and r.user_id = agent limit 1;
    if not found then raise exception 'that listing is not one of this agent''s listings' using errcode = '22023'; end if;
  elsif k = 'listing' then
    raise exception 'choose the listing' using errcode = '22023';
  end if;
  insert into public.eab_mod_cases (ref, kind, agent_user, workspace_id, record_id, listing_ref, file_sha, reason, source, details, created_by)
  values ('MOD-' || to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY') || '-' || lpad(nextval('public.eab_mod_seq')::text, 4, '0'),
          k, agent, coalesce(nullif(p->>'workspace_id', '')::uuid, rec.workspace_id), rec.id,
          coalesce(rec.data->>'ref', rec.data->>'refNo'), nullif(p->>'file_sha', ''), p->>'reason', coalesce(nullif(p->>'source', ''), 'admin'),
          public.eab_b12_reason(p->>'details', 'what is wrong'), auth.uid())
  returning * into c;
  insert into public.eab_mod_events (case_id, kind, to_status, by_user, by_email) values (c.id, 'created', 'open', auth.uid(), public.eab_b7_me_email());
  perform public.eab_admin_write_action('mod_case_created', c.agent_user, c.ref, c.details, null, to_jsonb(c), p_device);
  return c.id;
exception when check_violation then
  raise exception 'case not saved: %', sqlerrm using errcode = '22023';
end $$;

-- =====================================================================================================================
-- PART 3 — Moderation (16 cases, automatic checks), Photo moderation (57), Duplicate listings (56). Staff only.
-- =====================================================================================================================
create or replace function public.eab_admin_mod_cases(p_status text default null, p_agent uuid default null, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  if p_status is not null and p_status not in ('open', 'closed', 'cleared', 'confirmed', 'referred') then
    raise exception 'unknown status' using errcode = '22023';
  end if;
  select jsonb_build_object(
    'counts', coalesce((select jsonb_object_agg(s, n) from (select status s, count(*) n from public.eab_mod_cases
                         where p_agent is null or agent_user = p_agent group by 1) x), '{}'::jsonb),
    'by_reason', coalesce((select jsonb_object_agg(r, n) from (select reason r, count(*) n from public.eab_mod_cases
                         where status = 'open' and (p_agent is null or agent_user = p_agent) group by 1) x), '{}'::jsonb),
    'cases', coalesce((select jsonb_agg(public.eab_c10_case_json(c.id, false) order by c.created_at desc)
                         from (select id, created_at from public.eab_mod_cases
                                where (p_agent is null or agent_user = p_agent)
                                  and (p_status is null or status = p_status or (p_status = 'closed' and status <> 'open'))
                                order by created_at desc limit 1000) c), '[]'::jsonb))
  into out;
  perform public.eab_admin_write_access('search', p_agent, 'moderation cases' || coalesce(' (' || p_status || ')', ''),
            jsonb_build_object('results', jsonb_array_length(out->'cases')), p_device);
  return out;
end $$;

create or replace function public.eab_admin_mod_get(p_id uuid, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  out := public.eab_c10_case_json(p_id, true);
  if out is null then raise exception 'case not found' using errcode = 'P0002'; end if;
  perform public.eab_admin_write_access('view_records', (out->>'agent_user')::uuid, out->>'ref', jsonb_build_object('case', p_id), p_device);
  return out;
end $$;

create or replace function public.eab_admin_mod_create(p jsonb, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare cid uuid;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  if coalesce(p->>'source', 'admin') = 'photo_review' then raise exception 'photo cases are opened from photo review' using errcode = '22023'; end if;
  cid := public.eab_c10_case_new(p, p_device);   -- separate statement, so the read below sees the new case
  return public.eab_c10_case_json(cid, true);
end $$;

-- Change status / outcome / complaint. Every change needs a note (the reason), kept in the history and the action log.
-- Referred needs an existing complaint (AdminBatch007). A closed case can be opened again, with a reason.
create or replace function public.eab_admin_mod_update(p_id uuid, p jsonb, p_note text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare c public.eab_mod_cases; n public.eab_mod_cases; note text;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  note := public.eab_b12_reason(p_note);
  select * into c from public.eab_mod_cases where id = p_id for update;
  if not found then raise exception 'case not found' using errcode = 'P0002'; end if;
  n := c;
  if p ? 'status' then
    if p->>'status' not in ('open', 'cleared', 'confirmed', 'referred') then raise exception 'unknown status' using errcode = '22023'; end if;
    n.status := p->>'status';
  end if;
  if p ? 'outcome' then n.outcome := nullif(btrim(p->>'outcome'), ''); end if;
  if p ? 'complaint_id' then
    n.complaint_id := nullif(p->>'complaint_id', '')::uuid;
    if n.complaint_id is not null and not exists (select 1 from public.eab_complaints where id = n.complaint_id) then
      raise exception 'complaint not found' using errcode = '22023';
    end if;
  end if;
  if n.status = 'referred' and n.complaint_id is null then
    raise exception 'choose the complaint this case is referred to' using errcode = '22023';
  end if;
  if n.status = c.status and n.outcome is not distinct from c.outcome and n.complaint_id is not distinct from c.complaint_id then
    raise exception 'nothing to change' using errcode = '22023';
  end if;
  update public.eab_mod_cases set status = n.status, outcome = n.outcome, complaint_id = n.complaint_id, updated_at = now()
   where id = p_id returning * into n;
  insert into public.eab_mod_events (case_id, kind, body, from_status, to_status, by_user, by_email)
  values (p_id, case when n.status <> c.status then 'status' else 'updated' end, note,
          case when n.status <> c.status then c.status end, case when n.status <> c.status then n.status end,
          auth.uid(), public.eab_b7_me_email());
  perform public.eab_admin_write_action('mod_case_updated', n.agent_user, n.ref, note,
            jsonb_build_object('status', c.status, 'outcome', c.outcome, 'complaint_id', c.complaint_id),
            jsonb_build_object('status', n.status, 'outcome', n.outcome, 'complaint_id', n.complaint_id), p_device);
  return public.eab_c10_case_json(p_id, true);
end $$;

create or replace function public.eab_admin_mod_note(p_id uuid, p_note text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare c public.eab_mod_cases; note text;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  note := public.eab_b12_reason(p_note, 'the note');
  select * into c from public.eab_mod_cases where id = p_id;
  if not found then raise exception 'case not found' using errcode = 'P0002'; end if;
  insert into public.eab_mod_events (case_id, kind, body, by_user, by_email) values (p_id, 'note', note, auth.uid(), public.eab_b7_me_email());
  perform public.eab_admin_write_action('mod_case_note', c.agent_user, c.ref, note, null, null, p_device);
  return public.eab_c10_case_json(p_id, true);
end $$;

-- Automatic checks: listings that may need a look (nothing is decided automatically; staff open a case).
create or replace function public.eab_admin_mod_suspects(p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  with ch as (select * from public.eab_c10_checks()),
  per as (select ch.user_id, ch.id, (array_agg(ch.data))[1] data, max(ch.updated) updated,
                 jsonb_agg(jsonb_build_object('reason', ch.reason, 'detail', ch.detail,
                   'case_ref', (select m.ref from public.eab_mod_cases m where m.record_id = ch.id and m.agent_user = ch.user_id
                                  and m.reason = ch.reason and m.status = 'open' order by m.created_at desc limit 1)) order by ch.reason) reasons,
                 count(*) n
            from ch group by ch.user_id, ch.id)
  select jsonb_build_object(
    'checked', (select count(*) from public.eab_c10_open_listings()),
    'counts', coalesce((select jsonb_object_agg(x.reason, x.n) from (select reason, count(*) n from ch group by 1) x), '{}'::jsonb),
    'listings', coalesce((select jsonb_agg(public.eab_c10_listing(p.user_id, p.id, p.data, p.updated) || jsonb_build_object('reasons', p.reasons)
                           order by p.n desc, p.updated desc)
                           from (select * from per order by per.n desc, per.updated desc limit 500) p), '[]'::jsonb))
  into out;
  perform public.eab_admin_write_access('search', null, 'moderation: automatic checks',
            jsonb_build_object('results', jsonb_array_length(out->'listings')), p_device);
  return out;
end $$;

create or replace function public.eab_admin_photo_queue(p_status text default 'unreviewed', p_limit integer default 120, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare st text := coalesce(p_status, 'unreviewed'); out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  if st not in ('unreviewed', 'flagged', 'ok', 'all') then raise exception 'unknown status' using errcode = '22023'; end if;
  with lp as materialized (select * from public.eab_c10_listing_photos()),
  p as (select distinct on (lp.workspace_id, lp.sha256) lp.* from lp order by lp.workspace_id, lp.sha256, lp.updated desc),
  allp as (select p.*, v.decision, v.reason, v.reviewed_at, v.reviewed_by_email, (select m.ref from public.eab_mod_cases m where m.id = v.case_id) case_ref,
                  (select count(distinct q.user_id) from lp q where q.sha256 = p.sha256 and q.user_id <> p.user_id) other_agents
             from p left join public.eab_photo_reviews v on v.workspace_id = p.workspace_id and v.sha256 = p.sha256)
  select jsonb_build_object(
    'counts', jsonb_build_object('all', (select count(*) from allp), 'unreviewed', (select count(*) from allp where decision is null),
               'ok', (select count(*) from allp where decision = 'ok'), 'flagged', (select count(*) from allp where decision = 'flagged'),
               'shared', (select count(*) from allp where other_agents > 0)),
    'status', st,
    'photos', coalesce((select jsonb_agg(jsonb_build_object('workspace_id', a.workspace_id, 'sha256', a.sha256, 'path', a.path, 'mime', a.mime,
                 'bytes', a.bytes, 'uploaded_at', a.uploaded_at, 'decision', a.decision, 'reason', a.reason, 'reviewed_at', a.reviewed_at,
                 'reviewed_by', a.reviewed_by_email, 'case_ref', a.case_ref, 'other_agents', a.other_agents,
                 'listing', public.eab_c10_listing(a.user_id, a.record_id, a.data, a.updated))
               order by a.other_agents desc, a.uploaded_at desc nulls last)
               from (select * from allp where st = 'all' or (st = 'unreviewed' and decision is null) or decision = st
                      order by other_agents desc, uploaded_at desc nulls last
                      limit least(greatest(coalesce(p_limit, 120), 1), 500)) a), '[]'::jsonb))
  into out;
  perform public.eab_admin_write_access('search', null, 'photo moderation (' || st || ')',
            jsonb_build_object('results', jsonb_array_length(out->'photos')), p_device);
  return out;
end $$;

-- OK or Flag one photo. Flag needs what is wrong (5+ characters) and opens a photo case.
create or replace function public.eab_admin_photo_review(p_workspace uuid, p_sha text, p_decision text, p_reason text default null,
  p_case_reason text default null, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare ph record; cid uuid; ref text; before jsonb; why text;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  if p_decision not in ('ok', 'flagged') then raise exception 'decision must be ok or flagged' using errcode = '22023'; end if;
  select * into ph from public.eab_c10_listing_photos() lp where lp.workspace_id = p_workspace and lp.sha256 = p_sha
   order by lp.updated desc limit 1;
  if not found then raise exception 'photo not found' using errcode = 'P0002'; end if;
  select to_jsonb(v) into before from public.eab_photo_reviews v where v.workspace_id = p_workspace and v.sha256 = p_sha;
  if p_decision = 'flagged' then
    why := public.eab_b12_reason(p_reason, 'what is wrong with the photo');
    if coalesce(p_case_reason, 'wrong_photo') not in ('wrong_photo', 'offensive_photo', 'same_photo', 'misleading', 'other') then
      raise exception 'unknown photo reason' using errcode = '22023';
    end if;
    cid := public.eab_c10_case_new(jsonb_build_object('kind', 'photo', 'agent_user', ph.user_id, 'record_id', ph.record_id,
             'workspace_id', p_workspace, 'file_sha', p_sha, 'reason', coalesce(p_case_reason, 'wrong_photo'), 'source', 'photo_review',
             'details', why), p_device);
    select m.ref into ref from public.eab_mod_cases m where m.id = cid;
  end if;
  insert into public.eab_photo_reviews (workspace_id, sha256, decision, reason, case_id, reviewed_by, reviewed_by_email, reviewed_at)
  values (p_workspace, p_sha, p_decision, case when p_decision = 'flagged' then why else nullif(btrim(p_reason), '') end, cid,
          auth.uid(), public.eab_b7_me_email(), now())
  on conflict (workspace_id, sha256) do update set decision = excluded.decision, reason = excluded.reason, case_id = excluded.case_id,
    reviewed_by = excluded.reviewed_by, reviewed_by_email = excluded.reviewed_by_email, reviewed_at = excluded.reviewed_at;
  perform public.eab_admin_write_action('photo_review', ph.user_id, coalesce(ref, p_sha), coalesce(why, 'photo OK'), before,
            jsonb_build_object('decision', p_decision, 'case_ref', ref, 'listing', ph.record_id), p_device);
  return jsonb_build_object('decision', p_decision, 'case_ref', ref);
end $$;

create or replace function public.eab_admin_dup_listings(p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  with l as materialized (select * from public.eab_c10_open_listings()),
  ph as materialized (select distinct p.sha256, p.user_id, p.record_id from public.eab_c10_listing_photos() p
          join l on l.id = p.record_id and l.user_id = p.user_id),
  g as (select 'photo' kind, ph.sha256 k, ph.user_id, ph.record_id id from ph
         where (select count(distinct q.user_id) from ph q where q.sha256 = ph.sha256) > 1
        union select 'address', l.address, l.user_id, l.id from l
         where l.address is not null and (select count(distinct o.user_id) from l o where o.address = l.address) > 1
        union select 'spot', l.spot, l.user_id, l.id from l
         where l.spot is not null and (select count(distinct o.user_id) from l o where o.spot = l.spot) > 1),
  grp as (select g.kind, g.k, count(distinct g.user_id) agents,
                 jsonb_agg(public.eab_c10_listing(l.user_id, l.id, l.data, l.updated) order by l.updated desc) listings
            from g join l on l.id = g.id and l.user_id = g.user_id group by g.kind, g.k)
  select jsonb_build_object(
    'counts', jsonb_build_object('photo', (select count(*) from grp where kind = 'photo'), 'address', (select count(*) from grp where kind = 'address'),
               'spot', (select count(*) from grp where kind = 'spot')),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('kind', grp.kind, 'key', case when grp.kind = 'photo' then left(grp.k, 12) else grp.k end,
               'agents', grp.agents, 'listings', grp.listings) order by grp.agents desc, grp.kind, grp.k)
               from (select * from grp order by agents desc, kind, k limit 300) grp), '[]'::jsonb))
  into out;
  perform public.eab_admin_write_access('search', null, 'moderation: duplicate listings',
            jsonb_build_object('results', jsonb_array_length(out->'groups')), p_device);
  return out;
end $$;

-- =====================================================================================================================
-- PART 4 — Content insight (54 map, 28 geography, 8 buyers & vendors, 55 price trends, 60 AI, 61 Studio)
--   Owner / Admin / Compliance / Viewer. Names and lists only for the first three, written to the access log.
-- =====================================================================================================================
create or replace function public.eab_admin_map_listings(p_scope text default 'open', p_state text default null, p_type text default null,
  p_side text default null, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare names boolean; sc text := coalesce(p_scope, 'open'); out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  if sc not in ('open', 'all') then raise exception 'scope must be open or all' using errcode = '22023'; end if;
  if p_side is not null and p_side not in ('sale', 'rent') then raise exception 'side must be sale or rent' using errcode = '22023'; end if;
  names := public.eab_dash_names();
  with base as (select r.user_id, r.id, r.data from public.eab_records r
                 where r.collection = 'properties' and not r.deleted and (sc = 'all' or public.eab_mkt_open(r.data))),
  f as (select b.*, public.eab_mkt_num(b.data->'lat') lat, public.eab_mkt_num(b.data->'lng') lng from base b
         where (p_state is null or public.eab_mkt_state(b.data) = p_state)
           and (p_type is null or coalesce(nullif(btrim(b.data->>'type'), ''), 'Not set') = p_type)
           and (p_side is null or public.eab_c10_side(b.data) = p_side)),
  pin as (select * from f where f.lat between -90 and 90 and f.lng between -180 and 180 and not (f.lat = 0 and f.lng = 0))
  select jsonb_build_object('scope', sc, 'listings', (select count(*) from f), 'with_pin', (select count(*) from pin), 'names_hidden', not names,
    'states', (select coalesce(jsonb_agg(distinct public.eab_mkt_state(b.data)), '[]'::jsonb) from base b),
    'types', (select coalesce(jsonb_agg(distinct coalesce(nullif(btrim(b.data->>'type'), ''), 'Not set')), '[]'::jsonb) from base b),
    'points', coalesce((select jsonb_agg(jsonb_build_object('lat', round(p.lat::numeric, 6), 'lng', round(p.lng::numeric, 6),
                 'status', public.eab_dash_status_key(p.data), 'type', nullif(btrim(p.data->>'type'), ''), 'side', public.eab_c10_side(p.data),
                 'price', public.eab_c10_price(p.data), 'state', nullif(btrim(p.data->>'state'), ''), 'city', nullif(btrim(p.data->>'city'), ''))
               || case when names then jsonb_build_object('id', p.id, 'ref', coalesce(p.data->>'ref', p.data->>'refNo'),
                    'headline', nullif(btrim(p.data->>'headline'), ''), 'user_id', p.user_id, 'email', u.email, 'name', public.eab_admin_name(u))
                  else '{}'::jsonb end)
               from (select * from pin limit 5000) p left join auth.users u on u.id = p.user_id), '[]'::jsonb))
  into out;
  if names then
    perform public.eab_admin_write_access('search', null, 'content: listings map', jsonb_build_object('results', out->'with_pin'), p_device);
  end if;
  return out;
end $$;

-- Where agents are. From their listings (most used state / city / country) and their last sign-in place rounded to about
-- 11 km; a map cell is shown only with 3 or more agents in it. Counts only, no names.
create or replace function public.eab_admin_geo_agents()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  return (
    with ag as (select distinct m.user_id from public.eab_members m where m.active and m.user_id is not null),
    lst as (select r.user_id, coalesce(nullif(btrim(r.data->>'country'), ''), 'Malaysia') country, public.eab_mkt_state(r.data) st,
                   public.eab_mkt_city(r.data) ci
              from public.eab_records r where r.collection = 'properties' and not r.deleted),
    top as (select ag.user_id,
                   (select l.country from lst l where l.user_id = ag.user_id group by 1 order by count(*) desc, 1 limit 1) country,
                   (select l.st from lst l where l.user_id = ag.user_id group by 1 order by count(*) desc, 1 limit 1) st,
                   (select l.ci from lst l where l.user_id = ag.user_id and l.st = (select l2.st from lst l2 where l2.user_id = ag.user_id
                      group by 1 order by count(*) desc, 1 limit 1) group by 1 order by count(*) desc, 1 limit 1) ci
              from ag),
    place as (select distinct on (g.user_id) g.user_id, round(g.lat::numeric, 1) la, round(g.lng::numeric, 1) lo
                from public.eab_login_log g join ag on ag.user_id = g.user_id
               where g.lat between -90 and 90 and g.lng between -180 and 180 and not (g.lat = 0 and g.lng = 0)
               order by g.user_id, g.happened_at desc nulls last, g.seq desc),
    cells as (select la, lo, count(*) n from place group by 1, 2)
    select jsonb_build_object('agents', (select count(*) from ag), 'with_listings', (select count(*) from top where st is not null),
      'with_place', (select count(*) from place),
      'by_country', (select coalesce(jsonb_agg(jsonb_build_object('country', x.k, 'agents', x.n) order by x.n desc, x.k), '[]'::jsonb)
                       from (select coalesce(country, 'No listings yet') k, count(*) n from top group by 1) x),
      'by_state', (select coalesce(jsonb_agg(jsonb_build_object('state', x.k, 'agents', x.n) order by x.n desc, x.k), '[]'::jsonb)
                       from (select coalesce(st, 'No listings yet') k, count(*) n from top group by 1) x),
      'by_city', (select coalesce(jsonb_agg(jsonb_build_object('state', x.s, 'city', x.c, 'agents', x.n) order by x.n desc, x.s, x.c), '[]'::jsonb)
                       from (select st s, ci c, count(*) n from top where st is not null group by 1, 2) x),
      'cells', (select coalesce(jsonb_agg(jsonb_build_object('lat', la, 'lng', lo, 'agents', n) order by n desc), '[]'::jsonb) from cells where n >= 3),
      'cells_hidden', (select count(*) from cells where n < 3)));
end $$;

create or replace function public.eab_admin_contacts_stats(p_from date default null, p_to date default null, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare names boolean; today date := public.eab_dash_today(); f date := coalesce(p_from, today - 29); t date := coalesce(p_to, today); out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  perform public.eab_dash_check_range(f, t);
  names := public.eab_dash_names();
  with c as (select r.user_id, r.id, r.data, (public.eab_mkt_ms(r.data->'created') at time zone 'Asia/Kuala_Lumpur')::date made,
                    case when jsonb_typeof(r.data->'roles') = 'array' and jsonb_array_length(r.data->'roles') > 0
                         then array(select jsonb_array_elements_text(r.data->'roles')) else array['other'] end roles
               from public.eab_records r where r.collection = 'contacts' and not r.deleted),
  ro as (select c.user_id, c.id, c.made, x.role from c, unnest(c.roles) x(role)),
  vendors as (select c.* from c where 'vendor' = any (c.roles)),
  buyers as (select c.* from c where 'buyer' = any (c.roles)),
  props as (select r.user_id, r.data->>'vendorId' vid from public.eab_records r where r.collection = 'properties' and not r.deleted),
  deals as (select r.user_id, r.data->>'contactId' cid from public.eab_records r where r.collection = 'deals' and not r.deleted),
  inq as (select r.user_id, r.data, public.eab_mkt_inq_day(r.data) d from public.eab_records r where r.collection = 'inquiries' and not r.deleted),
  inqp as (select * from inq where inq.d between f and t)
  select jsonb_build_object('from', f, 'to', t, 'contacts', (select count(*) from c),
    'new_in_period', (select count(*) from c where c.made between f and t),
    'by_role', (select coalesce(jsonb_agg(jsonb_build_object('role', x.role, 'contacts', x.n, 'new', x.nw) order by x.n desc, x.role), '[]'::jsonb)
                  from (select role, count(*) n, count(*) filter (where made between f and t) nw from ro group by 1) x),
    'vendor_status', coalesce((select jsonb_object_agg(x.k, x.n) from (select coalesce(nullif(v.data->>'vendorStatus', ''), 'not_set') k, count(*) n
                  from vendors v group by 1) x), '{}'::jsonb),
    'vendors', (select count(*) from vendors),
    'vendors_with_listing', (select count(*) from vendors v where exists (select 1 from props p where p.user_id = v.user_id and p.vid = v.id)),
    'buyers', (select count(*) from buyers),
    'in_a_deal', (select count(*) from buyers b where exists (select 1 from deals d where d.user_id = b.user_id and d.cid = b.id)),
    'by_month', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(x.m, 'YYYY-MM'), 'buyers', x.b, 'vendors', x.v, 'others', x.o) order by x.m), '[]'::jsonb)
                  from (select date_trunc('month', c.made)::date m, count(*) filter (where 'buyer' = any (c.roles)) b,
                               count(*) filter (where 'vendor' = any (c.roles) and not 'buyer' = any (c.roles)) v,
                               count(*) filter (where not ('buyer' = any (c.roles) or 'vendor' = any (c.roles))) o
                          from c where c.made between f and t group by 1) x),
    'enquiries', (select count(*) from inqp),
    'enquiries_by_channel', (select coalesce(jsonb_agg(jsonb_build_object('channel', x.k, 'enquiries', x.n) order by x.n desc, x.k), '[]'::jsonb)
                  from (select coalesce(nullif(inqp.data->>'channel', ''), 'not_set') k, count(*) n from inqp group by 1) x),
    'enquiries_with_contact', (select count(*) from inqp where coalesce(inqp.data->>'contactId', '') <> ''),
    'agents_with_buyers', (select count(distinct user_id) from buyers),
    'names_hidden', not names,
    'agents', case when names then (select coalesce(jsonb_agg(jsonb_build_object('user_id', a.user_id, 'email', u.email, 'name', public.eab_admin_name(u),
                   'contacts', a.n, 'buyers', a.b, 'vendors', a.v, 'new', a.nw,
                   'enquiries', (select count(*) from inqp where inqp.user_id = a.user_id)) order by a.n desc), '[]'::jsonb)
                from (select c.user_id, count(*) n, count(*) filter (where 'buyer' = any (c.roles)) b, count(*) filter (where 'vendor' = any (c.roles)) v,
                             count(*) filter (where c.made between f and t) nw from c group by 1 order by 2 desc limit 500) a
                left join auth.users u on u.id = a.user_id) end)
  into out;
  if names then
    perform public.eab_admin_write_access('search', null, 'content: buyers & vendors per agent', jsonb_build_object('results', jsonb_array_length(out->'agents')), p_device);
  end if;
  return out;
end $$;

-- Asking prices of listings made in the last N months (the app keeps no price history and no final price).
create or replace function public.eab_admin_price_trends(p_months integer default 12, p_state text default null, p_city text default null,
  p_type text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m integer := coalesce(p_months, 12); since date; recent date;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  if m < 1 or m > 36 then raise exception 'months must be 1 to 36' using errcode = '22023'; end if;
  since := (date_trunc('month', public.eab_dash_today()) - make_interval(months => m - 1))::date;
  recent := (date_trunc('month', public.eab_dash_today()) - interval '2 months')::date;
  return (
    with allp as (select r.data, public.eab_mkt_ms(r.data->'created') c from public.eab_records r where r.collection = 'properties' and not r.deleted),
    flt as (select * from allp a where (p_state is null or public.eab_mkt_state(a.data) = p_state)
              and (p_city is null or public.eab_mkt_city(a.data) = p_city)
              and (p_type is null or coalesce(nullif(btrim(a.data->>'type'), ''), 'Not set') = p_type)),
    l as (select flt.data, (flt.c at time zone 'Asia/Kuala_Lumpur')::date d, to_char(flt.c at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM') mo,
                 public.eab_c10_side(flt.data) side,
                 public.eab_mkt_num(flt.data->'askingPrice') price, public.eab_c10_ppsf(flt.data) ppsf, public.eab_mkt_num(flt.data->'monthlyRent') rent
            from flt where flt.c is not null and (flt.c at time zone 'Asia/Kuala_Lumpur')::date >= since),
    s as (select * from l where side = 'sale' and price > 0), rt as (select * from l where side = 'rent' and rent > 0)
    select jsonb_build_object('months', m, 'since', since, 'listings', (select count(*) from l), 'no_date', (select count(*) from flt where flt.c is null),
      'states', (select coalesce(jsonb_agg(distinct public.eab_mkt_state(a.data)), '[]'::jsonb) from allp a),
      'cities', (select coalesce(jsonb_agg(jsonb_build_object('state', x.s, 'city', x.c) order by x.s, x.c), '[]'::jsonb)
                   from (select distinct public.eab_mkt_state(a.data) s, public.eab_mkt_city(a.data) c from allp a) x),
      'types', (select coalesce(jsonb_agg(distinct coalesce(nullif(btrim(a.data->>'type'), ''), 'Not set')), '[]'::jsonb) from allp a),
      'sale', jsonb_build_object('listings', (select count(*) from s), 'median_price', (select round(public.eab_mkt_median(array_agg(price))) from s),
                'median_ppsf', (select round(public.eab_mkt_median(array_agg(ppsf)), 2) from s)),
      'rent', jsonb_build_object('listings', (select count(*) from rt), 'median_rent', (select round(public.eab_mkt_median(array_agg(rent))) from rt)),
      'by_month', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(g.m, 'YYYY-MM'),
                     'sale_listings', (select count(*) from s where s.mo = to_char(g.m, 'YYYY-MM')),
                     'median_price', (select round(public.eab_mkt_median(array_agg(s.price))) from s where s.mo = to_char(g.m, 'YYYY-MM')),
                     'median_ppsf', (select round(public.eab_mkt_median(array_agg(s.ppsf)), 2) from s where s.mo = to_char(g.m, 'YYYY-MM')),
                     'rent_listings', (select count(*) from rt where rt.mo = to_char(g.m, 'YYYY-MM')),
                     'median_rent', (select round(public.eab_mkt_median(array_agg(rt.rent))) from rt where rt.mo = to_char(g.m, 'YYYY-MM'))) order by g.m), '[]'::jsonb)
                   from generate_series(since::timestamp, date_trunc('month', public.eab_dash_today()::timestamp), interval '1 month') g(m)),
      'by_area', (select coalesce(jsonb_agg(jsonb_build_object('state', x.st, 'city', x.ci, 'listings', x.n, 'median_price', x.mp, 'median_ppsf', x.mf,
                     'recent_ppsf', x.rf, 'before_ppsf', x.bf, 'change_pct', case when x.bf > 0 and x.rf is not null then round(100 * (x.rf - x.bf) / x.bf, 1) end)
                     order by x.n desc, x.st, x.ci), '[]'::jsonb)
                   from (select public.eab_mkt_state(s.data) st, public.eab_mkt_city(s.data) ci, count(*) n, round(public.eab_mkt_median(array_agg(s.price))) mp,
                                round(public.eab_mkt_median(array_agg(s.ppsf)), 2) mf,
                                round(public.eab_mkt_median(array_agg(s.ppsf) filter (where s.d >= recent)), 2) rf,
                                round(public.eab_mkt_median(array_agg(s.ppsf) filter (where s.d < recent)), 2) bf
                           from s group by 1, 2) x),
      'by_type', (select coalesce(jsonb_agg(jsonb_build_object('type', x.k, 'listings', x.n, 'median_price', x.mp, 'median_ppsf', x.mf, 'median_rent', x.mr)
                     order by x.n desc, x.k), '[]'::jsonb)
                   from (select coalesce(nullif(btrim(l.data->>'type'), ''), 'Not set') k, count(*) n,
                                round(public.eab_mkt_median(array_agg(l.price) filter (where l.side = 'sale' and l.price > 0))) mp,
                                round(public.eab_mkt_median(array_agg(l.ppsf) filter (where l.side = 'sale')), 2) mf,
                                round(public.eab_mkt_median(array_agg(l.rent) filter (where l.side = 'rent' and l.rent > 0))) mr
                           from l group by 1) x)));
end $$;

-- AI command use (voice / typed assistant). The words are never recorded; only understood or not.
create or replace function public.eab_admin_ai_usage(p_from date default null, p_to date default null, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare names boolean; today date := public.eab_dash_today(); f date := coalesce(p_from, today - 29); t date := coalesce(p_to, today); out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  perform public.eab_dash_check_range(f, t);
  names := public.eab_dash_names();
  with e as (select e.* from public.eab_usage_events e where e.at >= public.eab_dash_ts(f) and e.at < public.eab_dash_ts(t + 1) and e.user_id is not null),
  cmd as (select e.*, (e.at at time zone 'Asia/Kuala_Lumpur') loc from e where e.kind = 'command'),
  scr as (select * from e where e.kind = 'screen' and e.name = 'voice'),
  lang as (select distinct on (x.user_id) x.user_id, replace(x.name, 'lang.', '') lang from public.eab_usage_events x
            where x.kind = 'language' and x.at < public.eab_dash_ts(t + 1) order by x.user_id, x.at desc)
  select jsonb_build_object('from', f, 'to', t, 'commands', (select count(*) from cmd), 'understood', (select count(*) from cmd where ok),
    'not_understood', (select count(*) from cmd where not ok),
    'success_pct', (select round(100.0 * count(*) filter (where ok) / nullif(count(*), 0), 1) from cmd),
    'agents', (select count(distinct user_id) from cmd), 'screen_opens', (select count(*) from scr), 'screen_agents', (select count(distinct user_id) from scr),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', x.d, 'understood', x.u, 'not_understood', x.nu) order by x.d), '[]'::jsonb)
                 from (select loc::date d, count(*) filter (where ok) u, count(*) filter (where not ok) nu from cmd group by 1) x),
    'by_version', (select coalesce(jsonb_agg(jsonb_build_object('version', x.v, 'commands', x.n, 'not_understood', x.nu,
                     'success_pct', round(100.0 * (x.n - x.nu) / nullif(x.n, 0), 1)) order by x.n desc, x.v), '[]'::jsonb)
                 from (select coalesce(nullif(app_version, ''), 'unknown') v, count(*) n, count(*) filter (where not ok) nu from cmd group by 1) x),
    'by_language', (select coalesce(jsonb_agg(jsonb_build_object('language', x.l, 'commands', x.n, 'not_understood', x.nu,
                     'success_pct', round(100.0 * (x.n - x.nu) / nullif(x.n, 0), 1)) order by x.n desc, x.l), '[]'::jsonb)
                 from (select coalesce(lang.lang, 'unknown') l, count(*) n, count(*) filter (where not cmd.ok) nu
                         from cmd left join lang on lang.user_id = cmd.user_id group by 1) x),
    'heatmap', (select coalesce(jsonb_agg(jsonb_build_object('dow', x.dw, 'hour', x.h, 'events', x.n) order by x.dw, x.h), '[]'::jsonb)
                 from (select extract(isodow from loc)::int dw, extract(hour from loc)::int h, count(*) n from cmd group by 1, 2) x),
    'names_hidden', not names,
    'list', case when names then (select coalesce(jsonb_agg(jsonb_build_object('user_id', a.user_id, 'email', u.email, 'name', public.eab_admin_name(u),
                 'commands', a.n, 'not_understood', a.nu, 'success_pct', round(100.0 * (a.n - a.nu) / nullif(a.n, 0), 1), 'last_at', a.last_at)
                 order by a.n desc), '[]'::jsonb)
               from (select user_id, count(*) n, count(*) filter (where not ok) nu, max(at) last_at from cmd group by 1 order by 2 desc limit 500) a
               left join auth.users u on u.id = a.user_id) end)
  into out;
  if names then
    perform public.eab_admin_write_access('search', null, 'content: AI command use per agent', jsonb_build_object('results', jsonb_array_length(out->'list')), p_device);
  end if;
  return out;
end $$;

-- Marketing Studio: screen opens and posters created, saved and shared.
create or replace function public.eab_admin_studio_usage(p_from date default null, p_to date default null, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare names boolean; today date := public.eab_dash_today(); f date := coalesce(p_from, today - 29); t date := coalesce(p_to, today); out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance', 'viewer']);
  perform public.eab_dash_check_range(f, t);
  names := public.eab_dash_names();
  with e as (select e.user_id, e.at, (e.at at time zone 'Asia/Kuala_Lumpur')::date d,
                    case when e.kind = 'screen' and e.name = 'marketing-studio' then 'opened'
                         when e.kind = 'marketing' and e.name = 'poster.created' then 'created'
                         when e.kind = 'marketing' and e.name = 'poster.saved' then 'saved'
                         when e.kind = 'marketing' and e.name = 'poster.shared' then 'shared' end w
               from public.eab_usage_events e
              where e.at >= public.eab_dash_ts(f) and e.at < public.eab_dash_ts(t + 1) and e.user_id is not null
                and ((e.kind = 'screen' and e.name = 'marketing-studio') or (e.kind = 'marketing' and e.name in ('poster.created', 'poster.saved', 'poster.shared'))))
  select jsonb_build_object('from', f, 'to', t,
    'opened', (select count(*) from e where w = 'opened'), 'created', (select count(*) from e where w = 'created'),
    'saved', (select count(*) from e where w = 'saved'), 'shared', (select count(*) from e where w = 'shared'),
    'agents', (select count(distinct user_id) from e), 'makers', (select count(distinct user_id) from e where w = 'created'),
    'share_pct', (select round(100.0 * count(*) filter (where w = 'shared') / nullif(count(*) filter (where w = 'created'), 0), 1) from e),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', x.d, 'created', x.c, 'saved', x.s, 'shared', x.sh) order by x.d), '[]'::jsonb)
                 from (select d, count(*) filter (where w = 'created') c, count(*) filter (where w = 'saved') s, count(*) filter (where w = 'shared') sh
                         from e group by 1 having count(*) filter (where w <> 'opened') > 0) x),
    'names_hidden', not names,
    'list', case when names then (select coalesce(jsonb_agg(jsonb_build_object('user_id', a.user_id, 'email', u.email, 'name', public.eab_admin_name(u),
                 'opened', a.o, 'created', a.c, 'saved', a.s, 'shared', a.sh, 'last_at', a.last_at) order by a.c desc, a.o desc), '[]'::jsonb)
               from (select user_id, count(*) filter (where w = 'opened') o, count(*) filter (where w = 'created') c, count(*) filter (where w = 'saved') s,
                            count(*) filter (where w = 'shared') sh, max(at) last_at from e group by 1 order by 3 desc, 2 desc limit 500) a
               left join auth.users u on u.id = a.user_id) end)
  into out;
  if names then
    perform public.eab_admin_write_access('search', null, 'content: Marketing Studio use per agent', jsonb_build_object('results', jsonb_array_length(out->'list')), p_device);
  end if;
  return out;
end $$;

-- =====================================================================================================================
-- PART 5 — Money (10 ledger, 2 Google usage & cost, 40 quota alerts, 33 profit & loss, 34 cost per user, prices)
--   See: Owner / Admin / Compliance. Change: Owner only.
-- =====================================================================================================================
create or replace function public.eab_m11_entry(e public.eab_ledger) returns jsonb
language sql stable security definer set search_path = public, pg_catalog as $$
  select jsonb_build_object('id', e.id, 'ref', e.ref, 'kind', e.kind, 'category', e.category, 'payee', e.payee, 'description', e.description,
    'amount', e.amount, 'currency', e.currency, 'fx_to_myr', e.fx_to_myr, 'amount_myr', e.amount_myr, 'paid_on', e.paid_on,
    'period_month', e.period_month, 'recurring', e.recurring, 'invoice_ref', e.invoice_ref, 'repeat_of', e.repeat_of,
    'repeat_ref', (select o.ref from public.eab_ledger o where o.id = e.repeat_of), 'voided_at', e.voided_at, 'void_reason', e.void_reason,
    'voided_by_email', e.voided_by_email, 'created_by_email', e.created_by_email, 'created_at', e.created_at)
$$;

create or replace function public.eab_m11_settings() returns jsonb
language sql stable security definer set search_path = public, pg_catalog as $$
  select jsonb_build_object(
    'settings', (select jsonb_build_object('usd_myr', s.usd_myr, 'monthly_budget_myr', s.monthly_budget_myr, 'updated_at', s.updated_at)
                   from public.eab_money_settings s where s.id),
    'skus', (select coalesce(jsonb_agg(jsonb_build_object('sku', k.sku, 'label', k.label, 'names', to_jsonb(k.names), 'price_per_1000', k.price_per_1000,
               'free_per_month', k.free_per_month, 'monthly_limit', k.monthly_limit, 'daily_limit', k.daily_limit, 'alert_pct', k.alert_pct,
               'updated_at', k.updated_at) order by k.sort, k.sku), '[]'::jsonb) from public.eab_api_skus k))
$$;

-- Estimated US$ for a number of calls in one month (free allowance taken off first). Null when no price is set.
create or replace function public.eab_m11_cost(p_calls numeric, p_price numeric, p_free integer) returns numeric
language sql immutable set search_path = pg_catalog as $$
  select case when p_price is null then null else round(greatest(0, p_calls - coalesce(p_free, 0)) * p_price / 1000, 2) end
$$;

-- Google calls reported by the app, per day, name and product (unknown names have no product).
create or replace function public.eab_m11_calls(p_since date)
returns table (day date, name text, sku text, user_id uuid, calls bigint, failures bigint)
language sql stable security definer set search_path = public, pg_catalog as $$
  select (e.at at time zone 'Asia/Kuala_Lumpur')::date, e.name, (select k.sku from public.eab_api_skus k where e.name = any (k.names) order by k.sort limit 1),
         e.user_id, sum(greatest(coalesce(e.n, 1), 1))::bigint, sum(case when e.ok then 0 else greatest(coalesce(e.n, 1), 1) end)::bigint
    from public.eab_usage_events e
   where e.kind = 'google' and e.at >= public.eab_dash_ts(p_since)
   group by 1, 2, 3, 4
$$;

create or replace function public.eab_admin_ledger(p_from date default null, p_to date default null, p_kind text default null,
  p_voided boolean default false, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare today date := public.eab_dash_today(); f date := coalesce(p_from, date_trunc('month', today)::date); t date := coalesce(p_to, today); out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  perform public.eab_dash_check_range(f, t);
  if p_kind is not null and p_kind not in ('expense', 'income') then raise exception 'kind must be expense or income' using errcode = '22023'; end if;
  with p as (select * from public.eab_ledger e where e.paid_on between f and t),
  live as (select * from p where p.voided_at is null)
  select jsonb_build_object('from', f, 'to', t,
    'expenses_myr', (select coalesce(sum(amount_myr), 0) from live where kind = 'expense'),
    'income_myr', (select coalesce(sum(amount_myr), 0) from live where kind = 'income'),
    'voided', (select count(*) from p where voided_at is not null),
    'by_category', (select coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'category', x.category, 'entries', x.n, 'amount_myr', x.a)
                     order by x.kind, x.a desc), '[]'::jsonb)
                     from (select kind, category, count(*) n, sum(amount_myr) a from live group by 1, 2) x),
    'entries', (select coalesce(jsonb_agg(public.eab_m11_entry(e) order by e.paid_on desc, e.created_at desc), '[]'::jsonb)
                  from (select * from p where (p_kind is null or p.kind = p_kind) and (coalesce(p_voided, false) or p.voided_at is null)
                         order by p.paid_on desc, p.created_at desc limit 2000) e))
  into out;
  perform public.eab_admin_write_access('search', null, 'money: ledger ' || f || ' to ' || t,
            jsonb_build_object('results', jsonb_array_length(out->'entries')), p_device);
  return out;
end $$;

create or replace function public.eab_admin_ledger_add(p jsonb, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.eab_ledger; cur text := upper(btrim(coalesce(p->>'currency', 'MYR'))); fx numeric; amt numeric; paid date; pm date;
begin
  perform public.eab_admin_guard(array['owner']);
  begin
    amt := round((p->>'amount')::numeric, 2);
    fx := case when cur = 'MYR' then 1 else nullif(p->>'fx_to_myr', '')::numeric end;
    paid := (p->>'paid_on')::date;
    pm := date_trunc('month', coalesce(nullif(p->>'period_month', '')::date, paid))::date;
  exception when others then
    raise exception 'amount, rate and dates must be numbers and dates' using errcode = '22023';
  end;
  if amt is null or amt <= 0 then raise exception 'the amount must be more than 0' using errcode = '22023'; end if;
  if cur !~ '^[A-Z]{3}$' then raise exception 'choose a currency' using errcode = '22023'; end if;
  if fx is null or fx <= 0 then raise exception 'write the rate: how many RM for 1 %', cur using errcode = '22023'; end if;
  if paid is null then raise exception 'choose the date paid' using errcode = '22023'; end if;
  if paid > public.eab_dash_today() + 31 then raise exception 'the date paid can be at most a month ahead' using errcode = '22023'; end if;
  -- every check BEFORE a reference number is taken, so the LED numbers have no gaps
  if amt >= 100000000 then raise exception 'the amount is too big' using errcode = '22023'; end if;
  if not ((p->>'kind' = 'expense' and p->>'category' in ('supabase', 'aws', 'google', 'app_stores', 'domain_hosting', 'email_messaging',
             'software', 'legal_compliance', 'marketing', 'staff', 'other_expense'))
       or (p->>'kind' = 'income' and p->>'category' in ('developer_partner', 'advertising', 'other_income'))) then
    raise exception 'choose a category that fits expense or income' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p->>'payee', ''))) not between 1 and 200 then raise exception 'write who was paid (or who paid)' using errcode = '22023'; end if;
  if length(coalesce(p->>'description', '')) > 2000 or length(coalesce(p->>'invoice_ref', '')) > 100 then
    raise exception 'the description or invoice number is too long' using errcode = '22023';
  end if;
  begin
    insert into public.eab_ledger (ref, kind, category, payee, description, amount, currency, fx_to_myr, amount_myr, paid_on, period_month,
                                   recurring, invoice_ref, created_by, created_by_email)
    values ('LED-' || to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY') || '-' || lpad(nextval('public.eab_ledger_seq')::text, 4, '0'),
            p->>'kind', p->>'category', btrim(coalesce(p->>'payee', '')), nullif(btrim(p->>'description'), ''), amt, cur, fx, round(amt * fx, 2),
            paid, pm, coalesce((p->>'recurring')::boolean, false), nullif(btrim(p->>'invoice_ref'), ''), auth.uid(), public.eab_b7_me_email())
    returning * into e;
  exception when check_violation then
    raise exception 'entry not saved: check the kind, category, who was paid and the amount (%)', sqlerrm using errcode = '22023';
  end;
  perform public.eab_admin_write_action('ledger_added', null, e.ref, e.kind || ' ' || e.category || ' ' || e.currency || ' ' || e.amount, null,
            public.eab_m11_entry(e), p_device);
  return public.eab_m11_entry(e);
end $$;

create or replace function public.eab_admin_ledger_void(p_id uuid, p_reason text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.eab_ledger; why text;
begin
  perform public.eab_admin_guard(array['owner']);
  why := public.eab_b12_reason(p_reason);
  select * into e from public.eab_ledger where id = p_id for update;
  if not found then raise exception 'entry not found' using errcode = 'P0002'; end if;
  if e.voided_at is not null then raise exception 'this entry is already void' using errcode = '22023'; end if;
  update public.eab_ledger set voided_at = now(), void_reason = why, voided_by = auth.uid(), voided_by_email = public.eab_b7_me_email()
   where id = p_id returning * into e;
  perform public.eab_admin_write_action('ledger_voided', null, e.ref, why, null, public.eab_m11_entry(e), p_device);
  return public.eab_m11_entry(e);
end $$;

-- Copy last month's monthly bills (recurring, not void) into a month; each bill once only.
create or replace function public.eab_admin_ledger_repeat(p_month date, p_reason text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m date := date_trunc('month', p_month)::date; prev date; why text; n integer := 0; e record; last_day integer;
begin
  perform public.eab_admin_guard(array['owner']);
  why := public.eab_b12_reason(p_reason);
  if p_month is null or m > date_trunc('month', public.eab_dash_today())::date + interval '1 month' then
    raise exception 'choose this month or next month at most' using errcode = '22023';
  end if;
  prev := (m - interval '1 month')::date;
  last_day := extract(day from (m + interval '1 month - 1 day'))::int;
  for e in select * from public.eab_ledger o where o.recurring and o.voided_at is null and o.period_month = prev
             and not exists (select 1 from public.eab_ledger c where c.repeat_of = o.id and c.period_month = m and c.voided_at is null)
           order by o.paid_on, o.created_at loop
    insert into public.eab_ledger (ref, kind, category, payee, description, amount, currency, fx_to_myr, amount_myr, paid_on, period_month,
                                   recurring, invoice_ref, repeat_of, created_by, created_by_email)
    values ('LED-' || to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY') || '-' || lpad(nextval('public.eab_ledger_seq')::text, 4, '0'),
            e.kind, e.category, e.payee, e.description, e.amount, e.currency, e.fx_to_myr, e.amount_myr,
            make_date(extract(year from m)::int, extract(month from m)::int, least(extract(day from e.paid_on)::int, last_day)), m,
            true, null, e.id, auth.uid(), public.eab_b7_me_email())
    on conflict do nothing;
    if found then n := n + 1; end if;
  end loop;
  perform public.eab_admin_write_action('ledger_repeated', null, to_char(m, 'YYYY-MM'), why, null, jsonb_build_object('copied', n), p_device);
  return jsonb_build_object('month', m, 'copied', n);
end $$;

create or replace function public.eab_admin_money_settings()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  return public.eab_m11_settings();
end $$;

-- p: usd_myr and/or monthly_budget_myr ('' or null clears it).
create or replace function public.eab_admin_money_settings_set(p jsonb, p_reason text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare why text; before jsonb; r numeric; b numeric;
begin
  perform public.eab_admin_guard(array['owner']);
  why := public.eab_b12_reason(p_reason);
  select to_jsonb(s) into before from public.eab_money_settings s where s.id;
  begin
    r := case when p ? 'usd_myr' then nullif(p->>'usd_myr', '')::numeric else (before->>'usd_myr')::numeric end;
    b := case when p ? 'monthly_budget_myr' then nullif(p->>'monthly_budget_myr', '')::numeric else (before->>'monthly_budget_myr')::numeric end;
  exception when others then raise exception 'the rate and budget must be numbers' using errcode = '22023';
  end;
  if r is not null and (r <= 0 or r > 1000) then raise exception 'the US$ rate must be more than 0' using errcode = '22023'; end if;
  if b is not null and b < 0 then raise exception 'the budget cannot be below 0' using errcode = '22023'; end if;
  update public.eab_money_settings set usd_myr = r, monthly_budget_myr = b, updated_at = now(), updated_by = auth.uid() where id;
  perform public.eab_admin_write_action('money_settings', null, 'money settings', why, before,
            jsonb_build_object('usd_myr', r, 'monthly_budget_myr', b), p_device);
  return public.eab_m11_settings();
end $$;

-- p: any of price_per_1000, free_per_month, monthly_limit, daily_limit, alert_pct ('' clears; alert_pct '' = 80).
create or replace function public.eab_admin_api_sku_set(p_sku text, p jsonb, p_reason text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare why text; k public.eab_api_skus; n public.eab_api_skus;
begin
  perform public.eab_admin_guard(array['owner']);
  why := public.eab_b12_reason(p_reason);
  select * into k from public.eab_api_skus where sku = p_sku for update;
  if not found then raise exception 'unknown Google product' using errcode = 'P0002'; end if;
  n := k;
  begin
    if p ? 'price_per_1000' then n.price_per_1000 := nullif(p->>'price_per_1000', '')::numeric; end if;
    if p ? 'free_per_month' then n.free_per_month := nullif(p->>'free_per_month', '')::numeric::integer; end if;
    if p ? 'monthly_limit' then n.monthly_limit := nullif(p->>'monthly_limit', '')::numeric::integer; end if;
    if p ? 'daily_limit' then n.daily_limit := nullif(p->>'daily_limit', '')::numeric::integer; end if;
    if p ? 'alert_pct' then n.alert_pct := coalesce(nullif(p->>'alert_pct', '')::numeric::integer, 80); end if;
  exception when others then raise exception 'prices and limits must be numbers' using errcode = '22023';
  end;
  begin
    update public.eab_api_skus set price_per_1000 = n.price_per_1000, free_per_month = n.free_per_month, monthly_limit = n.monthly_limit,
      daily_limit = n.daily_limit, alert_pct = n.alert_pct, updated_at = now(), updated_by = auth.uid() where sku = p_sku;
  exception when check_violation then raise exception 'price and limits cannot be below 0; the warning is 1 to 100%%' using errcode = '22023';
  end;
  perform public.eab_admin_write_action('api_sku_set', null, p_sku, why, to_jsonb(k), (select to_jsonb(x) from public.eab_api_skus x where x.sku = p_sku), p_device);
  return public.eab_m11_settings();
end $$;

-- Google calls, estimated cost this month and the warnings. "Today" and "this month" are Malaysia time.
create or replace function public.eab_admin_api_usage(p_months integer default 6, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare m integer := coalesce(p_months, 6); today date := public.eab_dash_today(); since date; this date := date_trunc('month', today)::date;
  dim integer; passed integer; rate numeric; out jsonb;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  if m < 1 or m > 24 then raise exception 'months must be 1 to 24' using errcode = '22023'; end if;
  since := (this - make_interval(months => m - 1))::date;
  dim := extract(day from (this + interval '1 month - 1 day'))::int;
  passed := extract(day from today)::int;
  select usd_myr into rate from public.eab_money_settings where id;
  with c as (select * from public.eab_m11_calls(least(since, today - 31))),
  cm as (select * from c where c.day >= since),
  k as (select * from public.eab_api_skus),
  prod as (select k.*, coalesce((select sum(c.calls) from c where c.sku = k.sku and c.day >= this), 0) mc,
                  coalesce((select sum(c.calls) from c where c.sku = k.sku and c.day = today), 0) tc from k),
  pr as (select prod.*, round(prod.mc::numeric * dim / greatest(passed, 1))::bigint proj from prod),
  lv as (select pr.*,
           array_remove(array[
             case when pr.daily_limit is not null and pr.tc >= pr.daily_limit then 'daily limit reached today' end,
             case when pr.monthly_limit is not null and pr.mc >= pr.monthly_limit then 'monthly limit reached'
                  when pr.monthly_limit is not null and pr.proj >= pr.monthly_limit * pr.alert_pct / 100.0 then 'on course for ' || pr.alert_pct || '% of the monthly limit' end,
             case when pr.price_per_1000 > 0 and pr.free_per_month > 0 and pr.proj >= pr.free_per_month * pr.alert_pct / 100.0
                  then 'on course to use ' || pr.alert_pct || '% of the free allowance' end], null) reasons,
           case when (pr.daily_limit is not null and pr.tc >= pr.daily_limit) or (pr.monthly_limit is not null and pr.mc >= pr.monthly_limit) then 'red'
                when (pr.monthly_limit is not null and pr.proj >= pr.monthly_limit * pr.alert_pct / 100.0)
                  or (pr.price_per_1000 > 0 and pr.free_per_month > 0 and pr.proj >= pr.free_per_month * pr.alert_pct / 100.0) then 'amber'
                else 'ok' end lvl,
           public.eab_m11_cost(pr.mc, pr.price_per_1000, pr.free_per_month) musd, public.eab_m11_cost(pr.proj, pr.price_per_1000, pr.free_per_month) pusd
         from pr),
  mon as (select date_trunc('month', cm.day)::date mo, cm.sku, sum(cm.calls) calls, sum(cm.failures) fails from cm group by 1, 2),
  mon_cost as (select mon.mo, sum(mon.calls) calls, sum(mon.fails) fails,
                      case when bool_or(k.price_per_1000 is not null) then sum(coalesce(public.eab_m11_cost(mon.calls, k.price_per_1000, k.free_per_month), 0)) end usd
                 from mon left join k on k.sku = mon.sku group by 1)
  select jsonb_build_object('months', m, 'since', since, 'this_month', this, 'days_in_month', dim, 'days_passed', passed, 'usd_myr', rate,
    'products', (select coalesce(jsonb_agg(jsonb_build_object('sku', lv.sku, 'label', lv.label, 'names', to_jsonb(lv.names), 'price_per_1000', lv.price_per_1000,
                   'free_per_month', lv.free_per_month, 'monthly_limit', lv.monthly_limit, 'daily_limit', lv.daily_limit, 'alert_pct', lv.alert_pct,
                   'month_calls', lv.mc, 'today_calls', lv.tc, 'projected', lv.proj, 'level', lv.lvl, 'reasons', to_jsonb(lv.reasons),
                   'month_usd', lv.musd, 'projected_usd', lv.pusd, 'month_myr', round(lv.musd * rate, 2), 'projected_myr', round(lv.pusd * rate, 2))
                   order by case lv.lvl when 'red' then 0 when 'amber' then 1 else 2 end, lv.mc desc, lv.sort), '[]'::jsonb) from lv),
    'alerts', (select count(*) from lv where lvl <> 'ok'),
    'month_usd', (select sum(musd) from lv), 'projected_usd', (select sum(pusd) from lv),
    'month_myr', (select round(sum(musd) * rate, 2) from lv), 'projected_myr', (select round(sum(pusd) * rate, 2) from lv),
    'unpriced_calls', (select coalesce(sum(c.calls), 0) from c left join k on k.sku = c.sku where c.day >= this and k.price_per_1000 is null),
    'by_month', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(g.mo, 'YYYY-MM'), 'calls', coalesce(x.calls, 0), 'failures', coalesce(x.fails, 0),
                   'usd', x.usd, 'myr', round(x.usd * rate, 2)) order by g.mo), '[]'::jsonb)
                   from generate_series(since::timestamp, this::timestamp, interval '1 month') g(mo) left join mon_cost x on x.mo = g.mo::date),
    'by_month_sku', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(mon.mo, 'YYYY-MM'), 'sku', coalesce(mon.sku, 'other'),
                   'calls', mon.calls, 'failures', mon.fails) order by mon.mo, mon.sku), '[]'::jsonb) from mon),
    'by_name', (select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'sku', coalesce(x.sku, 'other'), 'calls', x.calls, 'failures', x.fails, 'agents', x.agents)
                   order by x.calls desc, x.name), '[]'::jsonb)
                   from (select name, sku, sum(calls) calls, sum(failures) fails, count(distinct user_id) agents from cm group by 1, 2) x),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', x.day, 'calls', x.calls) order by x.day), '[]'::jsonb)
                   from (select day, sum(calls) calls from c where c.day > today - 31 group by 1) x),
    'top_agents', (select coalesce(jsonb_agg(jsonb_build_object('user_id', a.user_id, 'email', u.email, 'name', public.eab_admin_name(u), 'calls', a.calls)
                   order by a.calls desc), '[]'::jsonb)
                   from (select user_id, sum(calls) calls from c where c.day >= this and c.user_id is not null group by 1 order by 2 desc limit 10) a
                   left join auth.users u on u.id = a.user_id))
  into out;
  perform public.eab_admin_write_access('search', null, 'money: Google API usage (agents with most calls)',
            jsonb_build_object('results', jsonb_array_length(out->'top_agents')), p_device);
  return out;
end $$;

-- Profit & loss per month (ledger, not void, by the month it is for) and cost per active agent (active = used the app that
-- month, the AdminBatch005 rule). Google cost is the estimate from the calls; "billed" = a Google expense is in the ledger.
create or replace function public.eab_admin_money_summary(p_months integer default 12)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m integer := coalesce(p_months, 12); this date := date_trunc('month', public.eab_dash_today())::date; since date; rate numeric; budget numeric;
begin
  perform public.eab_admin_guard(array['owner', 'admin', 'compliance']);
  if m < 1 or m > 36 then raise exception 'months must be 1 to 36' using errcode = '22023'; end if;
  since := (this - make_interval(months => m - 1))::date;
  select usd_myr, monthly_budget_myr into rate, budget from public.eab_money_settings where id;
  return (
    with mons as (select g::date mo from generate_series(since::timestamp, this::timestamp, interval '1 month') g),
    live as (select * from public.eab_ledger e where e.voided_at is null and e.period_month between since and this),
    act as (select date_trunc('month', a.day)::date mo, count(distinct a.user_id) n
              from public.eab_dash_activity(since, public.eab_dash_today()) a group by 1),
    gc as (select date_trunc('month', c.day)::date mo, c.sku, sum(c.calls) calls from public.eab_m11_calls(since) c group by 1, 2),
    gm as (select gc.mo, case when bool_or(k.price_per_1000 is not null) then sum(coalesce(public.eab_m11_cost(gc.calls, k.price_per_1000, k.free_per_month), 0)) end usd
             from gc left join public.eab_api_skus k on k.sku = gc.sku group by 1),
    per as (select mons.mo,
                   coalesce((select sum(amount_myr) from live where live.period_month = mons.mo and kind = 'income'), 0) inc,
                   coalesce((select sum(amount_myr) from live where live.period_month = mons.mo and kind = 'expense'), 0) exp,
                   coalesce((select n from act where act.mo = mons.mo), 0) active,
                   (select usd from gm where gm.mo = mons.mo) gusd,
                   exists (select 1 from live where live.period_month = mons.mo and live.category = 'google') billed
              from mons),
    rows as (select per.*, inc - exp net, case when active > 0 then round(exp / active, 2) end cpa,
                    budget is not null and exp > budget over_b from per)
    select jsonb_build_object('months', m, 'since', since, 'usd_myr', rate, 'monthly_budget_myr', budget,
      'income', (select sum(inc) from rows), 'expenses', (select sum(exp) from rows), 'net', (select sum(net) from rows),
      'this_month', (select jsonb_build_object('income', inc, 'expenses', exp, 'net', net, 'active', active, 'cost_per_active', cpa, 'over_budget', over_b)
                       from rows where rows.mo = this),
      'by_month', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(mo, 'YYYY-MM'), 'income', inc, 'expenses', exp, 'net', net, 'active', active,
                     'cost_per_active', cpa, 'google_usd', gusd, 'google_myr', round(gusd * rate, 2), 'google_billed', billed, 'over_budget', over_b) order by mo), '[]'::jsonb)
                     from rows),
      'by_category', (select coalesce(jsonb_agg(jsonb_build_object('kind', x.kind, 'category', x.category, 'amount_myr', x.a,
                     'per_active', round(x.a / nullif((select sum(active) from rows), 0), 2)) order by x.kind, x.a desc), '[]'::jsonb)
                     from (select kind, category, sum(amount_myr) a from live group by 1, 2) x),
      'average_active', (select round(avg(active), 1) from rows where active > 0),
      'cost_per_active_avg', (select round(sum(exp) / nullif(sum(active), 0), 2) from rows)));
end $$;

-- =====================================================================================================================
-- PART 6 — storage rule: staff open LISTING PHOTOS in eab-files (not documents, not other folders)
-- =====================================================================================================================
create or replace function public.eab_admin_photo_can_read(p_name text) returns boolean
language sql stable security definer set search_path = public, pg_catalog as $$
  select coalesce(public.eab_admin_role() in ('owner', 'admin', 'compliance'), false)
     and coalesce(p_name, '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{64}$'
     and exists (select 1 from public.eab_files f
                  where f.workspace_id::text = split_part(p_name, '/', 1) and f.sha256 = split_part(p_name, '/', 2)
                    and f.collection = 'properties' and f.kind = 'photo' and not f.deleted)
$$;
drop policy if exists "eab admin read listing photos" on storage.objects;
create policy "eab admin read listing photos" on storage.objects for select to authenticated
  using (bucket_id = 'eab-files' and public.eab_admin_photo_can_read(name));

-- =====================================================================================================================
-- PART 7 — permissions
-- =====================================================================================================================
revoke all on function public.eab_b12_protect(), public.eab_b12_reason(text, text), public.eab_c10_side(jsonb), public.eab_c10_price(jsonb),
  public.eab_c10_ppsf(jsonb), public.eab_c10_photo_count(jsonb), public.eab_c10_rm(numeric), public.eab_c10_listing(uuid, text, jsonb, bigint),
  public.eab_c10_open_listings(), public.eab_c10_listing_photos(), public.eab_c10_checks(), public.eab_c10_case_json(uuid, boolean),
  public.eab_c10_case_new(jsonb, text), public.eab_m11_entry(public.eab_ledger), public.eab_m11_settings(), public.eab_m11_cost(numeric, numeric, integer),
  public.eab_m11_calls(date)
  from public, anon, authenticated;
revoke all on function public.eab_admin_mod_cases(text, uuid, text), public.eab_admin_mod_get(uuid, text), public.eab_admin_mod_create(jsonb, text),
  public.eab_admin_mod_update(uuid, jsonb, text, text), public.eab_admin_mod_note(uuid, text, text), public.eab_admin_mod_suspects(text),
  public.eab_admin_photo_queue(text, integer, text), public.eab_admin_photo_review(uuid, text, text, text, text, text), public.eab_admin_dup_listings(text),
  public.eab_admin_map_listings(text, text, text, text, text), public.eab_admin_geo_agents(), public.eab_admin_contacts_stats(date, date, text),
  public.eab_admin_price_trends(integer, text, text, text), public.eab_admin_ai_usage(date, date, text), public.eab_admin_studio_usage(date, date, text),
  public.eab_admin_ledger(date, date, text, boolean, text), public.eab_admin_ledger_add(jsonb, text), public.eab_admin_ledger_void(uuid, text, text),
  public.eab_admin_ledger_repeat(date, text, text), public.eab_admin_money_settings(), public.eab_admin_money_settings_set(jsonb, text, text),
  public.eab_admin_api_sku_set(text, jsonb, text, text), public.eab_admin_api_usage(integer, text), public.eab_admin_money_summary(integer),
  public.eab_admin_photo_can_read(text)
  from public, anon;
grant execute on function public.eab_admin_mod_cases(text, uuid, text), public.eab_admin_mod_get(uuid, text), public.eab_admin_mod_create(jsonb, text),
  public.eab_admin_mod_update(uuid, jsonb, text, text), public.eab_admin_mod_note(uuid, text, text), public.eab_admin_mod_suspects(text),
  public.eab_admin_photo_queue(text, integer, text), public.eab_admin_photo_review(uuid, text, text, text, text, text), public.eab_admin_dup_listings(text),
  public.eab_admin_map_listings(text, text, text, text, text), public.eab_admin_geo_agents(), public.eab_admin_contacts_stats(date, date, text),
  public.eab_admin_price_trends(integer, text, text, text), public.eab_admin_ai_usage(date, date, text), public.eab_admin_studio_usage(date, date, text),
  public.eab_admin_ledger(date, date, text, boolean, text), public.eab_admin_ledger_add(jsonb, text), public.eab_admin_ledger_void(uuid, text, text),
  public.eab_admin_ledger_repeat(date, text, text), public.eab_admin_money_settings(), public.eab_admin_money_settings_set(jsonb, text, text),
  public.eab_admin_api_sku_set(text, jsonb, text, text), public.eab_admin_api_usage(integer, text), public.eab_admin_money_summary(integer),
  public.eab_admin_photo_can_read(text)
  to authenticated;
