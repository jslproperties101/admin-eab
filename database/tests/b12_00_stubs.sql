-- Stand-ins for the AdminBatch012 database tests (local PostgreSQL only). Run AFTER tests/00_stubs.sql.
-- Copies of the existing helpers the migration uses (definitions as on EAB-QA-Test, 9 Nov 2026) and the main-app
-- tables it reads, with only the columns it needs.
alter table auth.users add column if not exists raw_user_meta_data jsonb default '{}'::jsonb;
alter table public.eab_records add constraint eab_records_pk primary key (user_id, collection, id);

create table public.eab_files (workspace_id uuid, file_id text, collection text, record_id text, kind text, sha256 text, bytes bigint,
  mime text, name text, storage_path text, status text default 'uploaded', deleted boolean default false, uploaded_by uuid,
  created_at timestamptz default now(), uploaded_at timestamptz default now());
create table public.eab_usage_events (id bigint generated always as identity, user_id uuid, at timestamptz default now(), received_at timestamptz default now(),
  kind text, name text, screen text, ok boolean default true, n integer default 1, value double precision, app_version text, platform text, device text);
create table public.eab_usage_daily (user_id uuid, day date, kind text, name text, screen text, calls bigint, failures bigint, total_value double precision);
create table public.eab_login_log (seq bigint generated always as identity, received_at timestamptz default now(), happened_at timestamptz default now(),
  user_id uuid, event text, device_id text, device text, platform text, app_version text, lat double precision, lng double precision, acc real, detail text);
create sequence public.eab_complaint_seq;
create table public.eab_complaints (id uuid primary key default gen_random_uuid(), ref text, agent_user uuid, details text, status text default 'open',
  created_at timestamptz default now());
create schema storage;
create table storage.objects (bucket_id text, name text);
alter table storage.objects enable row level security;

create function public.eab_admin_name(u auth.users) returns text language sql immutable as $$
  select nullif(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''), '') $$;
create function public.eab_b7_me_email() returns text language sql stable as $$ select email from auth.users where id = auth.uid() $$;
create function public.eab_dash_names() returns boolean language sql stable as $$
  select coalesce(public.eab_admin_role() in ('owner', 'admin', 'compliance'), false) $$;
create function public.eab_dash_today() returns date language sql stable as $$ select (now() at time zone 'Asia/Kuala_Lumpur')::date $$;
create function public.eab_dash_ts(p_day date) returns timestamptz language sql immutable as $$ select (p_day::timestamp at time zone 'Asia/Kuala_Lumpur') $$;
create function public.eab_dash_check_range(p_from date, p_to date) returns void language plpgsql immutable as $$
begin
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 730 then raise exception 'date range must be 1 to 731 days' using errcode = '22023'; end if;
end $$;
create function public.eab_dash_status_key(p_data jsonb) returns text language sql immutable as $$
  select case when coalesce(p_data->>'status', '') = '' then 'none' when p_data->>'status' = 'in_progress' then
    case when p_data->>'bookedStage' in ('pending_loan', 'pending_spa', 'spa_signed', 'other_agent', 'pending_consent') then 'booked_' || (p_data->>'bookedStage') else 'booked' end
    else p_data->>'status' end $$;
create function public.eab_dash_activity(p_from date, p_to date) returns table (user_id uuid, day date) language sql stable as $$
  select e.user_id, (e.at at time zone 'Asia/Kuala_Lumpur')::date from public.eab_usage_events e
   where e.at >= public.eab_dash_ts(p_from) and e.at < public.eab_dash_ts(p_to + 1) and e.user_id is not null and e.kind in ('session', 'screen', 'feature', 'language')
  union select d.user_id, d.day from public.eab_usage_daily d where d.day between p_from and p_to and d.kind in ('session', 'screen', 'feature', 'language') $$;

-- AdminBatch009 Market helpers (copied from 20261027100000_admin_batch_009_market.sql)
-- A number stored as a JSON number or a numeric string; anything else is null.
create or replace function public.eab_mkt_num(p jsonb) returns numeric
language sql immutable set search_path = pg_catalog as $$
  select case jsonb_typeof(p)
    when 'number' then (p #>> '{}')::numeric
    when 'string' then case when btrim(p #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$' then btrim(p #>> '{}')::numeric end
  end
$$;

-- A time stored as milliseconds since 1970 (the main app's created / updated).
create or replace function public.eab_mkt_ms(p jsonb) returns timestamptz
language sql immutable set search_path = pg_catalog as $$
  select case when public.eab_mkt_num(p) > 0 then to_timestamp(public.eab_mkt_num(p) / 1000) end
$$;

-- Listing quality score out of 100 and what is missing. The app has the same rule (src/admin/market.ts).
--   photos 30 (5 or more = 30, 1-4 = 15) · price 15 · title type 10 · tenure 10 · size 10
--   rooms 10 (land and commercial lots get it free) · location 15 (state + city 10, map pin 5)
create or replace function public.eab_mkt_score(d jsonb) returns jsonb
language sql immutable set search_path = public, pg_catalog as $$
  with f as (select
      case when jsonb_typeof(d->'photos') = 'array' then jsonb_array_length(d->'photos') else 0 end photos,
      coalesce(public.eab_mkt_num(d->'askingPrice'), 0) > 0 or coalesce(public.eab_mkt_num(d->'monthlyRent'), 0) > 0 price,
      coalesce(btrim(d->>'titleType'), '') <> '' title,
      coalesce(btrim(d->>'tenure'), '') <> '' tenure,
      coalesce(public.eab_mkt_num(d->'landSqft'), 0) > 0 or coalesce(public.eab_mkt_num(d->'builtUpSqft'), 0) > 0 size,
      coalesce(public.eab_mkt_num(d->'bedrooms'), 0) > 0 or coalesce(public.eab_mkt_num(d->'bathrooms'), 0) > 0
        or coalesce(d->>'type', '') ~* '(land|commercial|industrial|agricultur|factory|warehouse|shop|office)' rooms,
      coalesce(btrim(d->>'state'), '') <> '' and coalesce(btrim(d->>'city'), '') <> '' place,
      public.eab_mkt_num(d->'lat') is not null and public.eab_mkt_num(d->'lng') is not null pin)
  select jsonb_build_object(
    'score', (case when photos >= 5 then 30 when photos >= 1 then 15 else 0 end)
           + (case when price then 15 else 0 end) + (case when title then 10 else 0 end) + (case when tenure then 10 else 0 end)
           + (case when size then 10 else 0 end) + (case when rooms then 10 else 0 end)
           + (case when place then 10 else 0 end) + (case when pin then 5 else 0 end),
    'photos', photos,
    'missing', to_jsonb(array_remove(array[
        case when photos = 0 then 'photos' when photos < 5 then 'more_photos' end,
        case when not price then 'price' end, case when not title then 'title_type' end, case when not tenure then 'tenure' end,
        case when not size then 'size' end, case when not rooms then 'rooms' end,
        case when not place then 'location' end, case when not pin then 'map_pin' end], null)))
  from f
$$;

-- Where a listing is: state and city, "Not set" when empty.
create or replace function public.eab_mkt_state(d jsonb) returns text
language sql immutable set search_path = pg_catalog as $$ select coalesce(nullif(btrim(d->>'state'), ''), 'Not set') $$;
create or replace function public.eab_mkt_city(d jsonb) returns text
language sql immutable set search_path = pg_catalog as $$ select coalesce(nullif(btrim(d->>'city'), ''), 'Not set') $$;

-- Is the listing on the market (not sold, rented or withdrawn)?
create or replace function public.eab_mkt_open(d jsonb) returns boolean
language sql immutable set search_path = pg_catalog as $$
  select coalesce(d->>'status', '') not in ('sold', 'rented', 'rented_pending_ta', 'off_market')
$$;

-- A deal's commission (typed, or price × rate) and the agent's share of it — the same rule as the main app.
create or replace function public.eab_mkt_commission(d jsonb) returns numeric
language sql immutable set search_path = public, pg_catalog as $$
  select round(coalesce(nullif(public.eab_mkt_num(d->'commission'), 0),
                        public.eab_mkt_num(d->'value') * public.eab_mkt_num(d->'commissionPct') / 100, 0), 2)
$$;

-- Malaysia date from an enquiry ('at' is a local "YYYY-MM-DDTHH:MM"; older ones only have 'created').
create or replace function public.eab_mkt_inq_day(d jsonb) returns date
language sql immutable set search_path = public, pg_catalog as $$
  select case when coalesce(d->>'at', '') ~ '^\d{4}-\d{2}-\d{2}' then left(d->>'at', 10)::date
              else (public.eab_mkt_ms(d->'created') at time zone 'Asia/Kuala_Lumpur')::date end
$$;

-- Days between two times, whole days.
create or replace function public.eab_mkt_days(a timestamptz, b timestamptz) returns integer
language sql immutable set search_path = pg_catalog as $$ select floor(extract(epoch from b - a) / 86400)::int $$;

-- Median of a set of numbers (null when empty).
create or replace function public.eab_mkt_median(p numeric[]) returns numeric
language sql immutable set search_path = pg_catalog as $$
  select percentile_cont(0.5) within group (order by x)::numeric from unnest(p) x where x is not null
$$;

