-- AdminBatch012 database tests (Content & Maps + Money). Run: 00_stubs.sql, b12_00_stubs.sql, the migration, this file.
-- Each check raises an exception on failure; the last line prints the number of checks passed.
\set ON_ERROR_STOP 1
-- people: a owner · f admin · g compliance · b viewer · e regulator · c Siti (agent) · h Ali (agent) · i, j more agents
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@x.com', '{}'), ('00000000-0000-0000-0000-00000000000f', 'admin@x.com', '{}'),
  ('00000000-0000-0000-0000-000000000010', 'comp@x.com', '{}'), ('00000000-0000-0000-0000-00000000000b', 'viewer@x.com', '{}'),
  ('00000000-0000-0000-0000-00000000000e', 'reg@x.com', '{}'), ('00000000-0000-0000-0000-00000000000c', 'siti@x.com', '{"full_name":"Siti Agent"}'),
  ('00000000-0000-0000-0000-000000000011', 'ali@x.com', '{"full_name":"Ali"}'), ('00000000-0000-0000-0000-000000000012', 'i@x.com', '{}'),
  ('00000000-0000-0000-0000-000000000013', 'j@x.com', '{}');
insert into public.eab_admins values ('00000000-0000-0000-0000-00000000000a', 'owner@x.com', 'owner', true, null),
  ('00000000-0000-0000-0000-00000000000f', 'admin@x.com', 'admin', true, null), ('00000000-0000-0000-0000-000000000010', 'comp@x.com', 'compliance', true, null),
  ('00000000-0000-0000-0000-00000000000b', 'viewer@x.com', 'viewer', true, null), ('00000000-0000-0000-0000-00000000000e', 'reg@x.com', 'regulator', true, null);
insert into public.eab_members (workspace_id, user_id, email, role, active) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000c', 'siti@x.com', 'owner', true),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000011', 'ali@x.com', 'owner', true),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000012', 'i@x.com', 'owner', true),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000013', 'j@x.com', 'owner', true);

-- listings (W1 = Siti, W2 = Ali). Times in ms like the app.
create temp table ms as select (extract(epoch from now()) * 1000)::bigint now_ms;
insert into public.eab_records (user_id, collection, id, data, workspace_id, updated)
select u, 'properties', id, d || jsonb_build_object('created', (select now_ms from ms) - age_days * 86400000::bigint), w, (select now_ms from ms)
from (values
  ('00000000-0000-0000-0000-00000000000c'::uuid, 'p1', '11111111-1111-1111-1111-111111111111'::uuid, 20,
   '{"ref":"P1001","headline":"Terrace in Kajang","type":"Terrace house","state":"Selangor","city":"Kajang","status":"available","purpose":"sale",
     "askingPrice":1500000,"builtUpSqft":1000,"titleType":"Individual","tenure":"freehold","lat":3.0,"lng":101.79,"unitNo":"12","street":"Jalan  Ujian",
     "photos":[{"fileId":"fA"},{"fileId":"fB"}],"vendorId":"v1","country":"Malaysia"}'::jsonb),
  ('00000000-0000-0000-0000-000000000011', 'q1', '22222222-2222-2222-2222-222222222222', 10,
   '{"ref":"Q2001","type":"Terrace house","state":"Selangor","city":"Kajang","status":"available","purpose":"sale","askingPrice":300000,"builtUpSqft":1000,
     "titleType":"Individual","lat":3.00001,"lng":101.79002,"unitNo":"12","street":"jalan ujian","photos":[{"fileId":"fA2"}]}'),
  ('00000000-0000-0000-0000-000000000011', 'q2', '22222222-2222-2222-2222-222222222222', 30,
   '{"ref":"Q2002","type":"Terrace house","state":"Selangor","city":"Kajang","status":"available","purpose":"sale","askingPrice":310000,"builtUpSqft":1000,"photos":[]}'),
  ('00000000-0000-0000-0000-000000000011', 'q3', '22222222-2222-2222-2222-222222222222', 5,
   '{"ref":"Q2003","type":"Terrace house","state":"Selangor","city":"Kajang","status":"available","purpose":"sale","askingPrice":290000,"builtUpSqft":1000,
     "titleType":"Strata","photos":[{"fileId":"x"}]}'),
  ('00000000-0000-0000-0000-00000000000c', 'p3', '11111111-1111-1111-1111-111111111111', 3,
   '{"ref":"P1003","type":"Condominium","state":"Johor","city":"Johor Bahru","status":"available","purpose":"rent","monthlyRent":2500,"titleType":"Strata",
     "lat":1.49,"lng":103.74,"photos":[{"fileId":"y"}],"country":"Malaysia"}'),
  ('00000000-0000-0000-0000-00000000000c', 'p4', '11111111-1111-1111-1111-111111111111', 2,
   '{"ref":"P1004","type":"Land","state":"Selangor","city":"Kajang","status":"available","purpose":"sale","titleType":"Individual","photos":[{"fileId":"z"}]}'),
  ('00000000-0000-0000-0000-00000000000c', 'p5', '11111111-1111-1111-1111-111111111111', 60,
   '{"ref":"P1005","type":"Terrace house","state":"Selangor","city":"Kajang","status":"sold","purpose":"sale","askingPrice":9,"photos":[]}')
) v(u, id, w, age_days, d);
-- photos: sha A is in Siti's p1 AND Ali's q1 (same photo, two agents); B only Siti's; D is a document (never a photo)
insert into public.eab_files (workspace_id, file_id, collection, record_id, kind, sha256, bytes, mime) values
  ('11111111-1111-1111-1111-111111111111', 'fA', 'properties', 'p1', 'photo', repeat('a', 64), 1000, 'image/jpeg'),
  ('11111111-1111-1111-1111-111111111111', 'fB', 'properties', 'p1', 'photo', repeat('b', 64), 2000, 'image/jpeg'),
  ('22222222-2222-2222-2222-222222222222', 'fA2', 'properties', 'q1', 'photo', repeat('a', 64), 1000, 'image/jpeg'),
  ('11111111-1111-1111-1111-111111111111', 'fD', 'properties', 'p1', 'document', repeat('d', 64), 9000, 'application/pdf'),
  ('11111111-1111-1111-1111-111111111111', 'fX', 'properties', 'p1', 'photo', repeat('e', 64), 10, 'image/jpeg');
update public.eab_files set deleted = true where file_id = 'fX';
-- contacts, deals, enquiries (Siti)
insert into public.eab_records (user_id, collection, id, data, workspace_id, updated) values
  ('00000000-0000-0000-0000-00000000000c', 'contacts', 'v1', jsonb_build_object('roles', '["vendor"]'::jsonb, 'vendorStatus', 'pending_info', 'created', (select now_ms from ms)), '11111111-1111-1111-1111-111111111111', 1),
  ('00000000-0000-0000-0000-00000000000c', 'contacts', 'v2', jsonb_build_object('roles', '["vendor"]'::jsonb, 'created', (select now_ms from ms) - 400 * 86400000::bigint), '11111111-1111-1111-1111-111111111111', 1),
  ('00000000-0000-0000-0000-00000000000c', 'contacts', 'b1', jsonb_build_object('roles', '["buyer"]'::jsonb, 'created', (select now_ms from ms)), '11111111-1111-1111-1111-111111111111', 1),
  ('00000000-0000-0000-0000-00000000000c', 'contacts', 'o1', jsonb_build_object('created', (select now_ms from ms)), '11111111-1111-1111-1111-111111111111', 1),
  ('00000000-0000-0000-0000-00000000000c', 'deals', 'd1', '{"contactId":"b1","value":500000}', '11111111-1111-1111-1111-111111111111', 1),
  ('00000000-0000-0000-0000-00000000000c', 'inquiries', 'i1', jsonb_build_object('channel', 'whatsapp', 'contactId', 'b1', 'at', to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD"T"HH24:MI')), '11111111-1111-1111-1111-111111111111', 1),
  ('00000000-0000-0000-0000-00000000000c', 'inquiries', 'i2', jsonb_build_object('at', to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM-DD"T"HH24:MI')), '11111111-1111-1111-1111-111111111111', 1);
-- usage: AI commands (3 understood, 1 not), voice screen, language, Studio, Google calls, sessions
insert into public.eab_usage_events (user_id, at, kind, name, ok, app_version) values
  ('00000000-0000-0000-0000-00000000000c', now() - interval '1 hour', 'command', 'command.assistant', true, '2.2.0'),
  ('00000000-0000-0000-0000-00000000000c', now() - interval '1 hour', 'command', 'command.assistant', true, '2.2.0'),
  ('00000000-0000-0000-0000-00000000000c', now() - interval '1 hour', 'command', 'command.assistant', false, '2.2.0'),
  ('00000000-0000-0000-0000-000000000011', now() - interval '1 hour', 'command', 'command.assistant', true, '2.1.0'),
  ('00000000-0000-0000-0000-00000000000c', now() - interval '2 hours', 'screen', 'voice', true, '2.2.0'),
  ('00000000-0000-0000-0000-00000000000c', now() - interval '3 days', 'language', 'lang.bm', true, '2.2.0'),
  ('00000000-0000-0000-0000-00000000000c', now() - interval '1 hour', 'screen', 'marketing-studio', true, null),
  ('00000000-0000-0000-0000-000000000011', now() - interval '1 hour', 'screen', 'marketing-studio', true, null),
  ('00000000-0000-0000-0000-00000000000c', now() - interval '1 hour', 'marketing', 'poster.created', true, null),
  ('00000000-0000-0000-0000-00000000000c', now() - interval '1 hour', 'marketing', 'poster.created', true, null),
  ('00000000-0000-0000-0000-00000000000c', now() - interval '1 hour', 'marketing', 'poster.shared', true, null),
  ('00000000-0000-0000-0000-00000000000c', now() - interval '1 minute', 'session', 'session.start', true, null),
  ('00000000-0000-0000-0000-000000000011', now() - interval '1 minute', 'session', 'session.start', true, null);
insert into public.eab_usage_events (user_id, at, kind, name, ok)
select '00000000-0000-0000-0000-00000000000c', now() - interval '1 minute', 'google', 'maps.map', true from generate_series(1, 6);
insert into public.eab_usage_events (user_id, at, kind, name, ok) values
  ('00000000-0000-0000-0000-000000000011', now() - interval '1 minute', 'google', 'geocoding.reverse', false),
  ('00000000-0000-0000-0000-000000000011', now() - interval '1 minute', 'google', 'places.autocomplete', true),
  ('00000000-0000-0000-0000-000000000011', now() - interval '1 minute', 'google', 'something.new', true);
-- sign-in places: 3 agents near Kajang (one cell), 1 in Johor (hidden: fewer than 3)
insert into public.eab_login_log (user_id, event, lat, lng) values
  ('00000000-0000-0000-0000-00000000000c', 'sign_in', 3.01, 101.78), ('00000000-0000-0000-0000-000000000011', 'sign_in', 3.02, 101.79),
  ('00000000-0000-0000-0000-000000000012', 'sign_in', 2.99, 101.81), ('00000000-0000-0000-0000-000000000013', 'sign_in', 1.49, 103.74);
insert into public.eab_complaints (id, ref, agent_user, details) values ('55555555-5555-5555-5555-555555555555', 'CMP-2026-0001', '00000000-0000-0000-0000-00000000000c', 'misleading ad');

create temp table t_pass (n int);
insert into t_pass values (0);
create function pg_temp.ok(c boolean, msg text) returns void language plpgsql as $$
begin
  if c is not true then raise exception 'FAIL: %', msg; end if;
  update t_pass set n = n + 1;
end $$;
create function pg_temp.as_user(u text) returns void language sql as $$ select set_config('test.uid', u, false) $$;
create function pg_temp.denied(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when insufficient_privilege then return true; end $$;
create function pg_temp.bad(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when sqlstate '22023' then return true; end $$;

do $$
declare j jsonb; k jsonb; n int; cid uuid; ref text; lid uuid; this date := date_trunc('month', (now() at time zone 'Asia/Kuala_Lumpur')::date)::date;
  a0 int;
begin
  -- ============================================================ roles
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000b');  -- viewer
  perform pg_temp.ok(pg_temp.denied('select public.eab_admin_mod_cases()'), 'viewer: no moderation');
  perform pg_temp.ok(pg_temp.denied('select public.eab_admin_photo_queue()'), 'viewer: no photos');
  perform pg_temp.ok(pg_temp.denied('select public.eab_admin_ledger()'), 'viewer: no money');
  perform pg_temp.ok(pg_temp.denied('select public.eab_admin_money_summary()'), 'viewer: no profit & loss');
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000e');  -- regulator
  perform pg_temp.ok(pg_temp.denied('select public.eab_admin_map_listings()'), 'regulator: no content insight');
  perform pg_temp.ok(pg_temp.denied('select public.eab_admin_geo_agents()'), 'regulator: no geography');
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000c');  -- an agent (not an admin)
  perform pg_temp.ok(pg_temp.denied('select public.eab_admin_ai_usage()'), 'agent: no admin functions');

  -- ============================================================ automatic checks
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000010');  -- compliance
  select count(*) into a0 from public.eab_admin_access;
  j := public.eab_admin_mod_suspects('dev1');
  perform pg_temp.ok((j->>'checked')::int = 6, 'checked = 6 open listings (sold p5 left out): ' || (j->>'checked'));
  perform pg_temp.ok((j->'counts'->>'price_far')::int = 1, 'one price far from the area: ' || coalesce(j->'counts'->>'price_far', 'none'));
  perform pg_temp.ok((j->'counts'->>'same_photo')::int = 2, 'same photo on 2 listings of 2 agents');
  perform pg_temp.ok((j->'counts'->>'same_spot')::int = 2, 'same spot (within ~10 m) on 2 listings');
  perform pg_temp.ok((j->'counts'->>'same_address')::int = 2, 'same unit address (spaces and case ignored)');
  perform pg_temp.ok((j->'counts'->>'no_title_type')::int = 1, 'q2 has no title type');
  perform pg_temp.ok((j->'counts'->>'no_photos')::int = 1, 'q2 has no photos after 30 days');
  perform pg_temp.ok((j->'counts'->>'no_price')::int = 1, 'p4 has no price; p3 has a rent so it is fine');
  select r into k from jsonb_array_elements(j->'listings') l, jsonb_array_elements(l->'reasons') r where l->>'id' = 'p1' and r->>'reason' = 'price_far';
  perform pg_temp.ok(k->>'detail' = 'RM 1,500.00 per sq ft; others in Kajang (Terrace house): median RM 300.00', 'price detail: ' || (k->>'detail'));
  select l into k from jsonb_array_elements(j->'listings') l where l->>'id' = 'p1';
  perform pg_temp.ok(k->>'name' = 'Siti Agent' and k->>'ref' = 'P1001' and (k->>'photos')::int = 2 and not (k ? 'vendorId') and not (k ? 'street'),
    'listing shows agent and ref, never vendor or address');
  perform pg_temp.ok((select count(*) from public.eab_admin_access) = a0 + 1, 'checks list written to the access log');

  -- ============================================================ moderation cases
  perform pg_temp.ok(pg_temp.bad($q$select public.eab_admin_mod_create('{"agent_user":"00000000-0000-0000-0000-00000000000c","record_id":"p1","reason":"price_far","details":"abc"}')$q$),
    'a case needs 5+ characters saying what is wrong');
  perform pg_temp.ok(pg_temp.bad($q$select public.eab_admin_mod_create('{"agent_user":"00000000-0000-0000-0000-00000000000c","record_id":"q1","reason":"price_far","details":"Price far too high"}')$q$),
    'the listing must be this agent''s');
  perform pg_temp.ok(pg_temp.bad($q$select public.eab_admin_mod_create('{"agent_user":"00000000-0000-0000-0000-00000000000c","record_id":"p1","reason":"rude","details":"Price far too high"}')$q$),
    'unknown reason refused');
  j := public.eab_admin_mod_create('{"agent_user":"00000000-0000-0000-0000-00000000000c","record_id":"p1","reason":"price_far","source":"suspect","details":"Price far too high for Kajang"}', 'dev1');
  cid := (j->>'id')::uuid; ref := j->>'ref';
  perform pg_temp.ok(ref = 'MOD-' || to_char(now() at time zone 'Asia/Kuala_Lumpur', 'YYYY') || '-0001', 'case reference ' || ref);
  perform pg_temp.ok(j->>'status' = 'open' and j->>'listing_ref' = 'P1001' and jsonb_array_length(j->'history') = 1 and (j->>'agent_cases')::int = 1, 'new case open with history');
  perform pg_temp.ok(exists (select 1 from public.eab_admin_actions where action = 'mod_case_created' and target_ref = ref), 'case in the action log');
  j := public.eab_admin_mod_suspects();
  select r into k from jsonb_array_elements(j->'listings') l, jsonb_array_elements(l->'reasons') r where l->>'id' = 'p1' and r->>'reason' = 'price_far';
  perform pg_temp.ok(k->>'case_ref' = ref, 'the check now shows its open case');
  perform pg_temp.ok(pg_temp.bad(format('select public.eab_admin_mod_update(%L, %L, null)', cid, '{"status":"cleared"}')), 'a change needs a reason');
  perform pg_temp.ok(pg_temp.bad(format('select public.eab_admin_mod_update(%L, %L, %L)', cid, '{"status":"referred"}', 'Send to complaints')), 'referred needs a complaint');
  perform pg_temp.ok(pg_temp.bad(format('select public.eab_admin_mod_update(%L, %L, %L)', cid, '{"status":"referred","complaint_id":"66666666-6666-6666-6666-666666666666"}', 'Send to complaints')),
    'the complaint must exist');
  j := public.eab_admin_mod_update(cid, '{"status":"referred","complaint_id":"55555555-5555-5555-5555-555555555555"}', 'Buyer complained about this ad', 'dev1');
  perform pg_temp.ok(j->>'status' = 'referred' and j->>'complaint_ref' = 'CMP-2026-0001', 'referred to complaint CMP-2026-0001');
  perform pg_temp.ok((select e.from_status = 'open' and e.to_status = 'referred' and e.body = 'Buyer complained about this ad' and e.by_email = 'comp@x.com'
                        from public.eab_mod_events e where e.case_id = cid order by e.id desc limit 1), 'status change kept with reason and who');
  j := public.eab_admin_mod_note(cid, 'Called the agent, will fix', 'dev1');
  perform pg_temp.ok(jsonb_array_length(j->'history') = 3, 'note added to the history');
  perform pg_temp.ok(pg_temp.denied(format('delete from public.eab_mod_cases where id = %L', cid)), 'a case is never deleted');
  perform pg_temp.ok(pg_temp.denied(format('update public.eab_mod_cases set details = %L where id = %L', 'changed text', cid)), 'case details never changed');
  perform pg_temp.ok(pg_temp.denied('update public.eab_mod_events set body = ''x'''), 'history never changed');
  j := public.eab_admin_mod_cases('closed', null, 'dev1');
  perform pg_temp.ok(jsonb_array_length(j->'cases') = 1 and (j->'counts'->>'referred')::int = 1 and not ((j->'cases'->0) ? 'details'), 'closed list, no details in the list');
  j := public.eab_admin_mod_get(cid, 'dev1');
  perform pg_temp.ok(j->>'details' = 'Price far too high for Kajang' and j->'listing'->>'id' = 'p1', 'one case with details and listing');
  perform pg_temp.ok(exists (select 1 from public.eab_admin_access where kind = 'view_records' and target_ref = ref), 'opening a case is access-logged');

  -- ============================================================ photo moderation
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000f');  -- admin
  j := public.eab_admin_photo_queue('unreviewed', 120, 'dev2');
  perform pg_temp.ok((j->'counts'->>'all')::int = 3, 'three listing photos (document and deleted photo left out): ' || (j->'counts'->>'all'));
  perform pg_temp.ok((j->'counts'->>'shared')::int = 2, 'photo A is shared by two agents');
  perform pg_temp.ok((j->'photos'->0->>'other_agents')::int = 1 and j->'photos'->0->>'path' ~ '^[0-9a-f-]{36}/a{64}$', 'shared photo first, with its path');
  perform pg_temp.ok(pg_temp.bad($q$select public.eab_admin_photo_review('11111111-1111-1111-1111-111111111111', repeat('a', 64), 'flagged', 'bad')$q$),
    'a flag needs 5+ characters');
  perform pg_temp.ok(pg_temp.bad($q$select public.eab_admin_photo_review('11111111-1111-1111-1111-111111111111', repeat('a', 64), 'maybe')$q$), 'unknown decision');
  j := public.eab_admin_photo_review('11111111-1111-1111-1111-111111111111', repeat('a', 64), 'flagged', 'Photo of another house', 'same_photo', 'dev2');
  perform pg_temp.ok(j->>'decision' = 'flagged' and j->>'case_ref' like 'MOD-%-0002', 'flag opens photo case ' || coalesce(j->>'case_ref', 'none'));
  perform pg_temp.ok((select kind = 'photo' and source = 'photo_review' and file_sha = repeat('a', 64) from public.eab_mod_cases m where m.ref = j->>'case_ref'), 'photo case filled in');
  j := public.eab_admin_photo_review('11111111-1111-1111-1111-111111111111', repeat('b', 64), 'ok', null, null, 'dev2');
  perform pg_temp.ok(j->>'case_ref' is null, 'OK makes no case');
  j := public.eab_admin_photo_queue('flagged', 120, 'dev2');
  perform pg_temp.ok((j->'counts'->>'unreviewed')::int = 1 and (j->'counts'->>'ok')::int = 1 and jsonb_array_length(j->'photos') = 1
    and j->'photos'->0->>'reviewed_by' = 'admin@x.com', 'counts after review; who reviewed');
  begin perform public.eab_admin_photo_review('11111111-1111-1111-1111-111111111111', repeat('d', 64), 'ok'); perform pg_temp.ok(false, 'a document is not a photo');
  exception when no_data_found then perform pg_temp.ok(true, 'a document cannot be reviewed as a photo'); end;

  -- storage rule: staff open listing photos only
  perform pg_temp.ok(public.eab_admin_photo_can_read('11111111-1111-1111-1111-111111111111/' || repeat('b', 64)), 'admin opens a listing photo');
  perform pg_temp.ok(not public.eab_admin_photo_can_read('11111111-1111-1111-1111-111111111111/' || repeat('d', 64)), 'admin cannot open a document');
  perform pg_temp.ok(not public.eab_admin_photo_can_read('11111111-1111-1111-1111-111111111111/' || repeat('e', 64)), 'admin cannot open a deleted photo');
  perform pg_temp.ok(not public.eab_admin_photo_can_read('../11111111-1111-1111-1111-111111111111/' || repeat('b', 64)), 'odd paths refused');
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
  perform pg_temp.ok(not public.eab_admin_photo_can_read('11111111-1111-1111-1111-111111111111/' || repeat('b', 64)), 'viewer cannot open photos');
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
  perform pg_temp.ok(not public.eab_admin_photo_can_read('22222222-2222-2222-2222-222222222222/' || repeat('a', 64)), 'an agent gets nothing from the admin rule');

  -- ============================================================ duplicates
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000a');  -- owner
  j := public.eab_admin_dup_listings('dev3');
  perform pg_temp.ok((j->'counts'->>'photo')::int = 1 and (j->'counts'->>'address')::int = 1 and (j->'counts'->>'spot')::int = 1,
    'one group each: ' || (j->>'counts'));
  select g into k from jsonb_array_elements(j->'groups') g where g->>'kind' = 'address';
  perform pg_temp.ok(k->>'key' = '12 | jalan ujian | kajang' and (k->>'agents')::int = 2 and jsonb_array_length(k->'listings') = 2, 'address group ' || (k->>'key'));

  -- ============================================================ content insight
  select count(*) into a0 from public.eab_admin_access;
  j := public.eab_admin_map_listings('open', null, null, null, 'dev3');
  perform pg_temp.ok((j->>'listings')::int = 6 and (j->>'with_pin')::int = 3 and not (j->>'names_hidden')::boolean, 'owner map: 6 open, 3 with a pin');
  perform pg_temp.ok((select bool_and(p ? 'email') from jsonb_array_elements(j->'points') p), 'owner sees who');
  perform pg_temp.ok((select count(*) from public.eab_admin_access) = a0 + 1, 'named map access-logged');
  j := public.eab_admin_map_listings('all', null, null, 'rent');
  perform pg_temp.ok((j->>'with_pin')::int = 1 and j->'points'->0->>'side' = 'rent' and (j->'points'->0->>'price')::numeric = 2500, 'rent filter');
  perform pg_temp.ok(pg_temp.bad($q$select public.eab_admin_map_listings('some')$q$), 'unknown scope refused');
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000b');  -- viewer
  select count(*) into a0 from public.eab_admin_access;
  j := public.eab_admin_map_listings();
  perform pg_temp.ok((j->>'names_hidden')::boolean and (select bool_and(not (p ? 'email') and not (p ? 'id') and not (p ? 'name')) from jsonb_array_elements(j->'points') p),
    'viewer: anonymous dots only');
  perform pg_temp.ok((select count(*) from public.eab_admin_access) = a0, 'viewer map not access-logged (no names)');
  j := public.eab_admin_geo_agents();
  perform pg_temp.ok((j->>'agents')::int = 4 and (j->>'with_listings')::int = 2 and (j->>'with_place')::int = 4, 'geo counts ' || j::text);
  perform pg_temp.ok(jsonb_array_length(j->'cells') = 1 and (j->'cells'->0->>'agents')::int = 3 and (j->>'cells_hidden')::int = 1, 'map cell only with 3+ agents');
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(j->'by_state') s where s->>'state' = 'No listings yet' and (s->>'agents')::int = 2), 'agents with no listings');
  j := public.eab_admin_contacts_stats(current_date - 29, current_date + 1, 'dev4');
  perform pg_temp.ok((j->>'contacts')::int = 4 and (j->>'new_in_period')::int = 3 and (j->>'vendors')::int = 2 and (j->>'vendors_with_listing')::int = 1
    and (j->>'buyers')::int = 1 and (j->>'in_a_deal')::int = 1, 'contact counts ' || j::text);
  perform pg_temp.ok((j->'vendor_status'->>'pending_info')::int = 1 and (j->'vendor_status'->>'not_set')::int = 1, 'vendor status');
  perform pg_temp.ok((j->>'enquiries')::int = 2 and (j->>'enquiries_with_contact')::int = 1 and j->'agents' = 'null'::jsonb, 'enquiries; viewer: no agent list');
  perform pg_temp.ok(pg_temp.bad($q$select public.eab_admin_contacts_stats(current_date, current_date - 1)$q$), 'bad date range refused');
  j := public.eab_admin_price_trends(12, null, null, null);
  perform pg_temp.ok((j->'sale'->>'listings')::int = 5 and (j->'sale'->>'median_price')::numeric = 300000 and (j->'rent'->>'median_rent')::numeric = 2500,
    'price trends: sales ' || (j->>'sale') || ' rent ' || (j->>'rent'));
  perform pg_temp.ok(jsonb_array_length(j->'by_month') = 12 and (j->>'no_date')::int = 0, 'twelve months');
  j := public.eab_admin_price_trends(12, 'Selangor', 'Kajang', 'Terrace house');
  perform pg_temp.ok((j->'sale'->>'median_ppsf')::numeric = 305, 'filtered median price per sq ft: ' || (j->'sale'->>'median_ppsf'));
  perform pg_temp.ok(pg_temp.bad('select public.eab_admin_price_trends(0)'), 'months 1 to 36');
  j := public.eab_admin_ai_usage(current_date - 7, current_date + 1);
  perform pg_temp.ok((j->>'commands')::int = 4 and (j->>'understood')::int = 3 and (j->>'success_pct')::numeric = 75 and (j->>'screen_opens')::int = 1
    and j->'list' = 'null'::jsonb, 'AI: 3 of 4 understood; viewer gets no list');
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(j->'by_language') l where l->>'language' = 'bm' and (l->>'commands')::int = 3), 'AI by language');
  j := public.eab_admin_studio_usage(current_date - 7, current_date + 1);
  perform pg_temp.ok((j->>'opened')::int = 2 and (j->>'created')::int = 2 and (j->>'shared')::int = 1 and (j->>'share_pct')::numeric = 50
    and (j->>'makers')::int = 1, 'Studio counts ' || j::text);
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
  j := public.eab_admin_ai_usage(current_date - 7, current_date + 1, 'dev5');
  perform pg_temp.ok(jsonb_array_length(j->'list') = 2 and j->'list'->0->>'name' = 'Siti Agent', 'owner: AI list with names');

  -- ============================================================ money
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000f');  -- admin: may look, not change
  perform pg_temp.ok(public.eab_admin_ledger() ? 'entries', 'admin reads the ledger');
  perform pg_temp.ok(pg_temp.denied($q$select public.eab_admin_ledger_add('{"kind":"expense","category":"supabase","payee":"Supabase","amount":25,"currency":"MYR","paid_on":"2026-11-01"}')$q$),
    'admin cannot add');
  perform pg_temp.ok(pg_temp.denied($q$select public.eab_admin_money_settings_set('{"usd_myr":4.5}', 'set the rate')$q$), 'admin cannot change settings');
  perform pg_temp.as_user('00000000-0000-0000-0000-00000000000a');  -- owner
  perform pg_temp.ok(pg_temp.bad(format('select public.eab_admin_ledger_add(%L)', jsonb_build_object('kind','expense','category','supabase','payee','Supabase','amount',25,'currency','USD','paid_on',current_date))),
    'foreign money needs a rate');
  perform pg_temp.ok(pg_temp.bad(format('select public.eab_admin_ledger_add(%L)', jsonb_build_object('kind','income','category','supabase','payee','X','amount',25,'currency','MYR','paid_on',current_date))),
    'category must fit the kind');
  perform pg_temp.ok(pg_temp.bad(format('select public.eab_admin_ledger_add(%L)', jsonb_build_object('kind','expense','category','aws','payee','AWS','amount',0,'currency','MYR','paid_on',current_date))),
    'amount must be more than 0');
  perform pg_temp.ok(pg_temp.bad(format('select public.eab_admin_ledger_add(%L)', jsonb_build_object('kind','expense','category','aws','payee','AWS','amount',5,'currency','MYR','paid_on',current_date + 60))),
    'at most a month ahead');
  j := public.eab_admin_ledger_add(jsonb_build_object('kind','expense','category','supabase','payee','Supabase Inc','amount',25,'currency','USD','fx_to_myr',4.5,
         'paid_on', this - 25, 'recurring', true), 'dev6');
  perform pg_temp.ok((j->>'amount_myr')::numeric = 112.50 and j->>'ref' like 'LED-%-0001' and j->>'period_month' = (this - interval '1 month')::date::text
    and j->>'created_by_email' = 'owner@x.com', 'US$25 at 4.5 = RM 112.50 for last month ' || j::text);
  lid := (j->>'id')::uuid;
  j := public.eab_admin_ledger_add(jsonb_build_object('kind','income','category','advertising','payee','Developer X','amount',1000,'currency','MYR','paid_on', this), 'dev6');
  perform pg_temp.ok((j->>'fx_to_myr')::numeric = 1 and (j->>'amount_myr')::numeric = 1000, 'RM entry rate 1');
  perform pg_temp.ok(pg_temp.denied(format('delete from public.eab_ledger where id = %L', lid)), 'ledger entry never deleted');
  perform pg_temp.ok(pg_temp.denied(format('update public.eab_ledger set amount = 1 where id = %L', lid)), 'ledger entry never edited');
  j := public.eab_admin_ledger_repeat(this, 'Copy the monthly bills', 'dev6');
  perform pg_temp.ok((j->>'copied')::int = 1, 'monthly bill copied into this month');
  j := public.eab_admin_ledger_repeat(this, 'Copy the monthly bills', 'dev6');
  perform pg_temp.ok((j->>'copied')::int = 0, 'copied once only');
  perform pg_temp.ok((select repeat_of = lid and period_month = this and amount_myr = 112.50 from public.eab_ledger where repeat_of is not null), 'copy points to the original');
  perform pg_temp.ok(pg_temp.bad(format('select public.eab_admin_ledger_void(%L, %L)', lid, 'no')), 'void needs a reason');
  j := public.eab_admin_ledger_void(lid, 'Entered twice by mistake', 'dev6');
  perform pg_temp.ok(j->>'void_reason' = 'Entered twice by mistake' and j->>'voided_by_email' = 'owner@x.com', 'voided with reason');
  perform pg_temp.ok(pg_temp.bad(format('select public.eab_admin_ledger_void(%L, %L)', lid, 'Entered twice by mistake')), 'void once only');
  j := public.eab_admin_ledger(this - 40, (now() at time zone 'Asia/Kuala_Lumpur')::date, null, false, 'dev6');
  perform pg_temp.ok((j->>'voided')::int = 1 and jsonb_array_length(j->'entries') = 2 and (j->>'expenses_myr')::numeric = 112.50 and (j->>'income_myr')::numeric = 1000,
    'ledger totals leave out the void entry ' || j::text);
  j := public.eab_admin_ledger(this - 40, (now() at time zone 'Asia/Kuala_Lumpur')::date, null, true);
  perform pg_temp.ok(jsonb_array_length(j->'entries') = 3, 'void entries shown when asked');
  perform pg_temp.ok(exists (select 1 from public.eab_admin_actions where action = 'ledger_voided' and reason = 'Entered twice by mistake'), 'void in the action log');

  perform pg_temp.ok(pg_temp.bad($q$select public.eab_admin_money_settings_set('{"usd_myr":-1}', 'Set the rate today')$q$), 'rate must be more than 0');
  j := public.eab_admin_money_settings_set('{"usd_myr":4.5,"monthly_budget_myr":100}', 'Rate from the bank today', 'dev6');
  perform pg_temp.ok((j->'settings'->>'usd_myr')::numeric = 4.5 and jsonb_array_length(j->'skus') = 7, 'rate saved; seven Google products');
  j := public.eab_admin_api_sku_set('dynamic_maps', '{"monthly_limit":5,"alert_pct":""}', 'Test a small limit', 'dev6');
  perform pg_temp.ok((select (s->>'monthly_limit')::int = 5 and (s->>'alert_pct')::int = 80 from jsonb_array_elements(j->'skus') s where s->>'sku' = 'dynamic_maps'),
    'limit saved; empty warning = 80%');
  perform pg_temp.ok(pg_temp.bad($q$select public.eab_admin_api_sku_set('dynamic_maps', '{"alert_pct":500}', 'Wrong warning level')$q$), 'warning 1 to 100%');
  begin perform public.eab_admin_api_sku_set('nope', '{}', 'Unknown product here'); perform pg_temp.ok(false, 'unknown product');
  exception when no_data_found then perform pg_temp.ok(true, 'unknown product refused'); end;
  j := public.eab_admin_api_usage(6, 'dev6');
  select p into k from jsonb_array_elements(j->'products') p where p->>'sku' = 'dynamic_maps';
  perform pg_temp.ok((k->>'month_calls')::int = 6 and k->>'level' = 'red' and k->'reasons' ? 'monthly limit reached', 'over the limit = red ' || k::text);
  perform pg_temp.ok(j->'products'->0->>'sku' = 'dynamic_maps' and (j->>'alerts')::int >= 1, 'red first; alerts counted');
  perform pg_temp.ok((k->>'month_usd')::numeric = 0, 'inside the free allowance: US$0');
  perform pg_temp.ok((j->>'unpriced_calls')::int = 2, 'places (no price) and an unknown name are unpriced: ' || (j->>'unpriced_calls'));
  perform pg_temp.ok(exists (select 1 from jsonb_array_elements(j->'by_name') x where x->>'name' = 'something.new' and x->>'sku' = 'other'), 'unknown name shown as other');
  perform pg_temp.ok((select (x->>'failures')::int = 1 from jsonb_array_elements(j->'by_name') x where x->>'name' = 'geocoding.reverse'), 'failures counted');
  perform pg_temp.ok(j->'top_agents'->0->>'name' = 'Siti Agent' and (j->'top_agents'->0->>'calls')::int = 6, 'agent with most calls');
  perform pg_temp.ok(jsonb_array_length(j->'by_month') = 6, 'six months');
  j := public.eab_admin_money_summary(12);
  perform pg_temp.ok((j->'this_month'->>'expenses')::numeric = 112.50 and (j->'this_month'->>'income')::numeric = 1000 and (j->'this_month'->>'active')::int = 2
    and (j->'this_month'->>'cost_per_active')::numeric = 56.25 and (j->'this_month'->>'over_budget')::boolean, 'this month P&L ' || (j->>'this_month'));
  perform pg_temp.ok(jsonb_array_length(j->'by_month') = 12 and (j->>'monthly_budget_myr')::numeric = 100, 'twelve months with budget');
  perform pg_temp.ok((select (m->>'expenses')::numeric = 0 from jsonb_array_elements(j->'by_month') m where m->>'month' = to_char(this - interval '1 month', 'YYYY-MM')),
    'void entry not counted last month');

  raise notice 'TEST RESULT: % passed, 0 failed', (select t.n from t_pass t);
end $$;

-- permissions: no direct table access; internal helpers closed; admin functions closed to signed-out users
select has_table_privilege('authenticated', 'public.eab_ledger', 'select') as ledger_direct,
       has_table_privilege('authenticated', 'public.eab_mod_cases', 'select') as cases_direct,
       has_function_privilege('authenticated', 'public.eab_c10_case_new(jsonb,text)', 'execute') as internal_new_case,
       has_function_privilege('authenticated', 'public.eab_m11_calls(date)', 'execute') as internal_calls,
       has_function_privilege('anon', 'public.eab_admin_ledger(date,date,text,boolean,text)', 'execute') as anon_ledger,
       has_function_privilege('authenticated', 'public.eab_admin_ledger(date,date,text,boolean,text)', 'execute') as signed_in_ledger,
       (select count(*) from pg_policies where schemaname = 'storage' and policyname = 'eab admin read listing photos') as photo_rule;
