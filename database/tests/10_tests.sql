-- AdminBatch010 database tests. Each block raises an exception on failure.
\set ON_ERROR_STOP 1
insert into auth.users values ('00000000-0000-0000-0000-00000000000a','owner@x.com'),('00000000-0000-0000-0000-00000000000b','viewer@x.com'),
  ('00000000-0000-0000-0000-00000000000c','agent@x.com'),('00000000-0000-0000-0000-00000000000d','family@x.com'),('00000000-0000-0000-0000-00000000000e','reg@x.com');
insert into public.eab_admins values ('00000000-0000-0000-0000-00000000000a','owner@x.com','owner',true,null),
  ('00000000-0000-0000-0000-00000000000b','viewer@x.com','viewer',true,null),('00000000-0000-0000-0000-00000000000e','reg@x.com','regulator',true,null);
insert into public.eab_workspaces values ('11111111-1111-1111-1111-111111111111','Siti Realty','00000000-0000-0000-0000-00000000000c',now()-interval '20 days');
insert into public.eab_members values ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000c','agent@x.com','owner',true);
insert into public.eab_records (user_id, collection, id, data, workspace_id, written_at) values
 ('00000000-0000-0000-0000-00000000000c','acctJournals','j1', jsonb_build_object('no','JV-1','date',current_date-2,'memo','Fee','source','invoice','status','posted',
    'lines', '[{"acc":"1010","dr":2376,"cr":0},{"acc":"4000","dr":0,"cr":2200},{"acc":"2200","dr":0,"cr":176}]'::jsonb),'11111111-1111-1111-1111-111111111111', now()-interval '2 days'),
 ('00000000-0000-0000-0000-00000000000c','acctJournals','j2', jsonb_build_object('no','JV-2','date',current_date-1,'memo','Rent','source','manual','status','posted',
    'lines', '[{"acc":"6100","dr":1000,"cr":0},{"acc":"1010","dr":0,"cr":1000}]'::jsonb),'11111111-1111-1111-1111-111111111111', now()-interval '1 day'),
 ('00000000-0000-0000-0000-00000000000c','acctJournals','j3', jsonb_build_object('no','JV-3','date',current_date-1,'status','reversed',
    'lines', '[{"acc":"4000","dr":0,"cr":99999}]'::jsonb),'11111111-1111-1111-1111-111111111111', now()-interval '1 day'),
 ('00000000-0000-0000-0000-00000000000c','acctSales','s1', jsonb_build_object('no','R-1','date',current_date,'method','cash','total',54),'11111111-1111-1111-1111-111111111111', now()),
 ('00000000-0000-0000-0000-00000000000c','acctLeads','l1', jsonb_build_object('name','Ali','interest','Condo','stage','viewing','value',500000),'11111111-1111-1111-1111-111111111111', now()),
 ('00000000-0000-0000-0000-00000000000c','acctPayruns','p1', jsonb_build_object('month',to_char(current_date,'YYYY-MM'),'journalNo','JV-9','slips','[{"gross":3000},{"gross":2500}]'::jsonb),'11111111-1111-1111-1111-111111111111', now()),
 ('00000000-0000-0000-0000-00000000000c','acctEinvoices','e1', jsonb_build_object('refNo','INV-1','date',current_date,'kind','invoice','status','ready','buyer','{"name":"Nurul"}'::jsonb),'11111111-1111-1111-1111-111111111111', now()),
 ('00000000-0000-0000-0000-00000000000c','acctProfile','company', jsonb_build_object('party','{"name":"Siti Realty Sdn Bhd","tin":"C123"}'::jsonb,'msic','68200'),'11111111-1111-1111-1111-111111111111', now()),
 ('00000000-0000-0000-0000-00000000000c','properties','x', '{"ref":"P1"}','11111111-1111-1111-1111-111111111111', now());
insert into public.odw_profiles values ('00000000-0000-0000-0000-00000000000c','Siti','012','Siti Realty','REN 1',now()-interval '3 days',now());
insert into public.odw_vendors values ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-00000000000c','Mr Tan','013','tan@x.com',null,now(),now());
insert into public.odw_properties values ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-00000000000c','22222222-2222-2222-2222-222222222222','Terrace Kajang','Jln 1','Terrace',600000,now(),now());
insert into public.odw_sales values ('44444444-4444-4444-4444-444444444444','00000000-0000-0000-0000-00000000000c','33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','Puan Aina',580000,'in_progress','tok',true,now(),now());
insert into public.odw_sale_updates values (gen_random_uuid(),'44444444-4444-4444-4444-444444444444',null,'00000000-0000-0000-0000-00000000000c','Loan submitted',true,now());
insert into public.odw_parties values (gen_random_uuid(),'44444444-4444-4444-4444-444444444444','lawyer','Lee & Co','Lee & Co','03',null,'waiting',current_date-1,null,now(),now());
insert into public.odw_ai_questions values (gen_random_uuid(),'00000000-0000-0000-0000-00000000000c','What is SPA?','Sale and purchase agreement',now());

do $$
declare j jsonb; n int; v2 text;
begin
  -- the app itself
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000d', false);
  begin perform public.mm2h_sync('{"consent":false}'); raise exception 'FAIL: sync without consent'; exception when insufficient_privilege then null; end;
  j := public.mm2h_sync(jsonb_build_object('consent', true, 'app_version', '1.2.0',
    'family', jsonb_build_object('family_name','Smith family','nationality','UK','city','Penang','email','family@x.com','arrival_date','2026-09-01'),
    'members', jsonb_build_array(jsonb_build_object('id','m1','name','John','relation','principal','pass_type','MM2H Silver','pass_expiry', (current_date+40)::text),
                                 jsonb_build_object('id','m2','name','Jane','relation','spouse','pass_type','Dependant','pass_expiry', (current_date-5)::text)),
    'applications', jsonb_build_array(jsonb_build_object('id','a1','stage','Approval in principle','submitted_on','2026-08-01'))));
  assert (j->>'ok')::boolean, 'sync ok';
  j := public.mm2h_sync(jsonb_build_object('consent', true, 'family', jsonb_build_object('family_name','Smith family','city','Penang'),
    'members', jsonb_build_array(jsonb_build_object('id','m1','name','John','pass_expiry', (current_date+40)::text),
                                 jsonb_build_object('id','m2','name','Jane','pass_expiry', (current_date-5)::text)),
    'applications', jsonb_build_array(jsonb_build_object('id','a1','stage','Approved'))));
  select count(*) into n from public.mm2h_members; assert n = 2, 'resync replaces members, no duplicates: ' || n;
  perform public.mm2h_request('copy', 'Please send my data');
  perform public.eab_app_ticket('mm2h', 'App crashes on Documents', 'Details');
  n := public.eab_app_report_errors('mm2h', '[{"message":"TypeError x","screen":"docs","app_version":"1.2.0"},{"message":""}]');
  assert n = 1, 'empty error message skipped';
  -- a non-admin cannot read admin views or change settings
  begin perform public.eab_admin_app_view('pos', 'businesses'); raise exception 'FAIL: family read admin view'; exception when insufficient_privilege then null; end;
  begin perform public.eab_admin_app_settings_set('pos', '{"maintenance_on":true}', 'testing it'); raise exception 'FAIL: family changed settings'; exception when insufficient_privilege then null; end;

  -- regulator: nothing here
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000e', false);
  begin perform public.eab_admin_app_view('odw', 'sales'); raise exception 'FAIL: regulator read'; exception when insufficient_privilege then null; end;

  -- owner: every view of every app works and is access-logged
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000a', false);
  declare v text; a text;
  begin
    foreach a in array array['pos','odw','mm2h'] loop
      foreach v in array (case a
        when 'pos' then array['businesses','sales','journals','invoices','einvoices','customers','attendance','payroll','tax','pnl','users','signups','tickets','errors','flags','settings']
        when 'odw' then array['agents','sales','overdue','vendors','parties','updates','ai','users','signups','tickets','errors','flags','settings']
        else array['families','applications','renewals','requests','content:hotspot','content:coupon','users','signups','tickets','errors','flags','settings'] end) loop
        j := public.eab_admin_app_view(a, v, null, null, null, 200, 'test');
        assert j ? 'summary' and j ? 'rows' and (j->>'names_hidden')::boolean = false, a || ':' || v;
      end loop;
    end loop;
  end;
  select count(*) into n from public.eab_admin_access where kind = 'app_view'; assert n = 41, 'every view logged: ' || n;

  j := public.eab_admin_app_view('pos', 'pnl');
  assert (j->'summary'->>'income_rm')::numeric = 2200, 'income 2200 (reversed ignored): ' || (j->'summary');
  assert (j->'summary'->>'expenses_rm')::numeric = 1000, 'expenses 1000';
  assert (j->'summary'->>'profit_rm')::numeric = 1200, 'profit 1200';
  j := public.eab_admin_app_view('pos', 'businesses'); assert (j->'rows'->0->>'business') = 'Siti Realty' and (j->'rows'->0->>'journals')::int = 3, 'businesses: ' || j;
  j := public.eab_admin_app_view('pos', 'sales'); assert (j->'summary'->>'total_rm')::numeric = 54, 'sales total';
  j := public.eab_admin_app_view('pos', 'payroll'); assert (j->'rows'->0->'record'->>'gross')::numeric = 5500, 'payroll gross';
  j := public.eab_admin_app_view('pos', 'customers'); assert (j->'rows'->0->'record'->>'name') = 'Ali', 'customers listed';
  j := public.eab_admin_app_view('pos', 'users'); assert (j->'summary'->>'users')::int = 1 and (j->'rows'->0->>'email') = 'agent@x.com', 'pos users: ' || j;
  j := public.eab_admin_app_view('odw', 'sales'); assert (j->'rows'->0->>'vendor') = 'Mr Tan' and (j->'summary'->>'value_rm')::numeric = 580000, 'odw sales';
  j := public.eab_admin_app_view('odw', 'overdue'); assert (j->'summary'->>'items')::int = 1, 'odw overdue';
  j := public.eab_admin_app_view('mm2h', 'renewals'); assert (j->'summary'->>'due_in_90_days')::int = 1 and (j->'summary'->>'expired')::int = 1, 'renewals: ' || j;
  j := public.eab_admin_app_view('mm2h', 'applications'); assert (j->'rows'->0->>'stage') = 'Approved', 'applications';
  j := public.eab_admin_app_view('mm2h', 'families', null, null, 'smith'); assert jsonb_array_length(j->'rows') = 1, 'search families';
  j := public.eab_admin_app_view('mm2h', 'families', null, null, 'nobody'); assert jsonb_array_length(j->'rows') = 0, 'search none';
  j := public.eab_admin_app_view('mm2h', 'errors'); assert (j->'rows'->0->>'times')::int = 1, 'errors grouped';
  begin perform public.eab_admin_app_view('pos', 'nonsense'); raise exception 'FAIL: unknown view'; exception when no_data_found then null; end;
  begin perform public.eab_admin_app_view('biz', 'sales'); raise exception 'FAIL: unknown app'; exception when no_data_found then null; end;
  begin perform public.eab_admin_app_view('pos', 'sales', current_date, current_date - 5); raise exception 'FAIL: dates'; exception when invalid_parameter_value then null; end;

  -- owner changes: reasons required, logged, apps see them
  begin perform public.eab_admin_app_settings_set('pos', '{"maintenance_on":true}', 'no'); raise exception 'FAIL: short reason'; exception when invalid_parameter_value then null; end;
  begin perform public.eab_admin_app_settings_set('pos', '{"update_url":"http://bad"}', 'testing link'); raise exception 'FAIL: http link'; exception when invalid_parameter_value then null; end;
  perform public.eab_admin_app_settings_set('pos', '{"maintenance_on":true,"maintenance_message":"Back at 6pm","announcement":"New tax rates"}', 'Monthly maintenance');
  perform public.eab_admin_app_flag_set('pos', 'myinvois_live', 'MyInvois live mode', false, 'Keep sandbox for now');
  perform public.eab_admin_app_flag_set('pos', 'myinvois_live', null, true, 'Turn on for test');
  j := public.eab_app_status('pos');
  assert (j->>'maintenance_on')::boolean and j->>'announcement' = 'New tax rates' and (j->'flags'->>'myinvois_live')::boolean, 'status: ' || j;
  assert (public.eab_app_status('odw')->>'maintenance_on')::boolean = false, 'other apps untouched';
  select id into strict j from (select to_jsonb(id) id from public.eab_app_tickets limit 1) z;
  perform public.eab_admin_app_ticket_set((j #>> '{}')::uuid, 'closed', 'Fixed in 1.2.1');
  select (id)::text into strict v2 from public.mm2h_doc_requests limit 1;
  perform public.eab_admin_mm2h_request_set(v2::uuid, 'done', 'Sent copy by email');
  j := public.eab_admin_mm2h_content_save('hotspot', null, '{"title":"Batu Ferringhi beach","area":"Penang","published":true,"url":"https://example.com"}', 'Add Penang hotspot');
  perform public.eab_admin_mm2h_content_save('coupon', null, '{"title":"Old coupon","valid_until":"2020-01-01","published":true}', 'Expired coupon test');
  assert jsonb_array_length(public.mm2h_content_list()) = 1, 'expired coupon hidden from families';
  perform public.eab_admin_mm2h_content_save('hotspot', (j->>'id')::uuid, '{"title":"Batu Ferringhi","published":false}', 'Unpublish for edits');
  assert jsonb_array_length(public.mm2h_content_list()) = 0, 'unpublished hidden';
  perform public.eab_admin_mm2h_content_delete('hotspot', (j->>'id')::uuid, 'Duplicate entry');
  select count(*) into n from public.eab_admin_actions; assert n = 9, 'every change in the action log: ' || n;
  select count(*) into n from public.eab_admin_actions where coalesce(length(reason), 0) < 5; assert n = 0, 'all with reasons';

  -- viewer: totals yes, names no, no changes
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000b', false);
  j := public.eab_admin_app_view('odw', 'sales'); assert (j->>'names_hidden')::boolean and j->'rows'->0->>'vendor' is null and j->'rows'->0->>'property' is not null, 'viewer odw: ' || j;
  j := public.eab_admin_app_view('mm2h', 'families'); assert jsonb_array_length(j->'rows') = 0 and (j->'summary'->>'families')::int = 1, 'viewer families';
  j := public.eab_admin_app_view('pos', 'customers'); assert jsonb_array_length(j->'rows') = 0, 'viewer pos customers hidden';
  j := public.eab_admin_app_view('pos', 'pnl'); assert (j->'summary'->>'profit_rm')::numeric = 1200, 'viewer sees totals';
  j := public.eab_admin_app_view('pos', 'users'); assert j->'rows' = '[]'::jsonb, 'viewer: no user emails';
  j := public.eab_admin_app_view('pos', 'tickets'); assert j->'rows'->0->>'from_user' is null, 'viewer: ticket sender hidden';
  begin perform public.eab_admin_app_flag_set('pos', 'x1', 'x', true, 'viewer tries'); raise exception 'FAIL: viewer flag'; exception when insufficient_privilege then null; end;
  begin perform public.eab_admin_mm2h_content_save('hotspot', null, '{"title":"x"}', 'viewer tries'); raise exception 'FAIL: viewer content'; exception when insufficient_privilege then null; end;

  -- family withdraws consent: all their server data removed
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000d', false);
  perform public.mm2h_forget_me();
  select (select count(*) from public.mm2h_families) + (select count(*) from public.mm2h_members) + (select count(*) from public.mm2h_applications)
    + (select count(*) from public.mm2h_doc_requests) into n;
  assert n = 0, 'forget me removes everything: ' || n;
  raise notice 'ALL DATABASE TESTS PASSED';
end $$;

-- permissions: anon may only read status and published content
select has_function_privilege('anon', 'public.eab_app_status(text)', 'execute') as anon_status,
       has_function_privilege('anon', 'public.mm2h_sync(jsonb)', 'execute') as anon_sync,
       has_function_privilege('authenticated', 'public.eab_admin__app_ops(text,text,date,date,text,integer,boolean,jsonb)', 'execute') as internal_ops,
       has_table_privilege('authenticated', 'public.mm2h_families', 'select') as direct_table_read;
