\set ON_ERROR_STOP 1
insert into auth.users values ('00000000-0000-0000-0000-00000000000a','joe.matthew.iqi@gmail.com',now()),('00000000-0000-0000-0000-00000000000b','stranger@x.com',now()),
  ('00000000-0000-0000-0000-00000000000c','shop@x.com',now()),('00000000-0000-0000-0000-00000000000d','viewer@x.com',now());
insert into public.tenants (id, name, industry_template, plan, email, created_at) values ('11111111-1111-1111-1111-111111111111','Kopi Corner','cafe','free','kopi@x.com', now()-interval '5 days');
insert into public.tenant_modules values ('11111111-1111-1111-1111-111111111111','POS',true,'{}'),('11111111-1111-1111-1111-111111111111','KIDS',false,'{}');
insert into public.memberships values (gen_random_uuid(),'11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000c',null,null,true,now()-interval '5 days');
insert into public.sales (id, tenant_id, receipt_no, status, total, tax_total, sold_at) values (gen_random_uuid(),'11111111-1111-1111-1111-111111111111','R1','completed',25.5,1.5,now()),
  (gen_random_uuid(),'11111111-1111-1111-1111-111111111111','R2','void',99,0,now());
insert into public.children values (gen_random_uuid(),'11111111-1111-1111-1111-111111111111','Adam Child','active');
insert into public.kids_incidents (id, tenant_id, child_id, occurred_at, kind, severity, status) values (gen_random_uuid(),'11111111-1111-1111-1111-111111111111',null,now(),'fall','minor','open');
insert into public.outbound_messages (id, tenant_id, channel, to_address, status, created_at, error) values (gen_random_uuid(),'11111111-1111-1111-1111-111111111111','whatsapp','+60123','failed',now(),'template not approved');
insert into public.payroll_runs (id, tenant_id, year, month, status) values ('55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111',2026,10,'draft');
insert into public.payslips (id, tenant_id, run_id, gross) values (gen_random_uuid(),'11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555555',3000);

do $$
declare j jsonb; n int; v text;
begin
  -- a stranger signs in: refused, nothing granted
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000b', false);
  perform set_config('test.jwt', '{"email":"stranger@x.com"}', false);
  begin perform public.eab_admin_signed_in('t'); raise exception 'FAIL: stranger let in'; exception when insufficient_privilege then null; end;
  assert public.eab_admin_me() is null, 'stranger not admin';
  begin perform public.eab_admin_app_view('biz', 'businesses'); raise exception 'FAIL: stranger view'; exception when insufficient_privilege then null; end;

  -- the Owner (pending email) signs in the first time and becomes Owner
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000a', false);
  perform set_config('test.jwt', '{"email":"Joe.Matthew.Iqi@gmail.com"}', false);
  j := public.eab_admin_signed_in('t'); assert j->>'role' = 'owner', 'owner from pending: ' || j;
  select count(*) into n from public.eab_admin_pending; assert n = 0, 'pending cleared';

  foreach v in array array['businesses','modules','invites','inventory','sales','accounting','crm','outbound','shipping','hr','legal','kids','orders','shopsync','ai',
                           'users','signups','tickets','errors','flags','settings','adminlog','admins'] loop
    j := public.eab_admin_app_view('biz', v, null, null, null, 200, 't');
    assert j ? 'summary' and j ? 'rows', v;
  end loop;
  j := public.eab_admin_app_view('biz', 'sales'); assert (j->'summary'->>'total_rm')::numeric = 25.5 and (j->'summary'->>'sales')::int = 1, 'void sales excluded: ' || j;
  j := public.eab_admin_app_view('biz', 'businesses'); assert j->'rows'->0->>'modules_on' = 'POS' and (j->'rows'->0->>'team')::int = 1, 'businesses: ' || j;
  j := public.eab_admin_app_view('biz', 'kids'); assert (j->'summary'->>'children')::int = 1 and position('Adam' in j::text) = 0, 'no child names ever: ' || j;
  j := public.eab_admin_app_view('biz', 'outbound'); assert (j->'summary'->>'failed')::int = 1 and j->'rows'->0->>'error' = 'template not approved', 'outbound';
  j := public.eab_admin_app_view('biz', 'hr'); assert (j->'rows'->0->>'payslips')::int = 1, 'payslips counted';
  j := public.eab_admin_app_view('biz', 'users'); assert j->'rows'->0->>'email' = 'shop@x.com', 'users';

  -- module switch with reason, logged
  begin perform public.eab_admin_biz_module_set('11111111-1111-1111-1111-111111111111', 'KIDS', true, 'no'); raise exception 'FAIL: short reason'; exception when invalid_parameter_value then null; end;
  perform public.eab_admin_biz_module_set('11111111-1111-1111-1111-111111111111', 'KIDS', true, 'Business asked for kids care');
  select count(*) into n from public.tenant_modules where module = 'KIDS' and enabled; assert n = 1, 'module on';
  perform public.eab_admin_app_settings_set('biz', '{"maintenance_on":true}', 'Upgrade tonight');
  assert (public.eab_app_status('biz')->>'maintenance_on')::boolean, 'status shows maintenance';
  perform public.eab_admin_app_flag_set('biz', 'ai_agents', 'AI agents', true, 'Pilot with cafes');

  -- owner adds a viewer by email before they sign in; they come in as viewer
  begin perform public.eab_admin_set_admin('joe.matthew.iqi@gmail.com', 'viewer', true, null, 'Demote myself'); raise exception 'FAIL: self-demote'; exception when invalid_parameter_value then null; end;
  perform public.eab_admin_set_admin('viewer@x.com', 'viewer', true, null, 'Board member read-only');
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000d', false);
  perform set_config('test.jwt', '{"email":"viewer@x.com"}', false);
  j := public.eab_admin_signed_in('t'); assert j->>'role' = 'viewer', 'viewer joined';
  j := public.eab_admin_app_view('biz', 'users'); assert j->'rows' = '[]'::jsonb, 'viewer: no emails';
  j := public.eab_admin_app_view('biz', 'outbound'); assert j->'rows'->0->>'to_address' is null, 'viewer: no phone numbers';
  begin perform public.eab_admin_app_view('biz', 'adminlog'); raise exception 'FAIL: viewer log'; exception when insufficient_privilege then null; end;
  begin perform public.eab_admin_biz_module_set('11111111-1111-1111-1111-111111111111', 'POS', false, 'viewer tries'); raise exception 'FAIL: viewer switch'; exception when insufficient_privilege then null; end;

  -- log: chain intact, cannot be changed
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000a', false);
  j := public.eab_admin_verify_log('t'); assert (j->>'ok')::boolean and (j->>'checked')::int > 20, 'chain ok: ' || j;
  begin update public.eab_admin_log set reason = 'x' where seq = 1; raise exception 'FAIL: log changed'; exception when insufficient_privilege then null; end;
  begin delete from public.eab_admin_log where seq = 1; raise exception 'FAIL: log deleted'; exception when insufficient_privilege then null; end;
  select count(*) into n from public.eab_admin_log where kind = 'action'; assert n = 4, 'actions logged (module, settings, flag, admin): ' || n;
  raise notice 'ALL BIZ DATABASE TESTS PASSED';
end $$;

-- tamper test: switch the guard trigger off as the database owner, change a row, the check finds it
alter table public.eab_admin_log disable trigger eab_admin_log_lock;
update public.eab_admin_log set reason = 'tampered' where seq = 3;
alter table public.eab_admin_log enable trigger eab_admin_log_lock;
select set_config('test.uid', '00000000-0000-0000-0000-00000000000a', false);
do $$ declare j jsonb := public.eab_admin_verify_log('t'); begin
  assert not (j->>'ok')::boolean and (j->>'first_bad_seq')::int = 3, 'tamper found: ' || j; raise notice 'TAMPER DETECTED AT 3'; end $$;
select has_function_privilege('anon', 'public.eab_admin_app_view(text,text,date,date,text,integer,text)', 'execute') anon_view,
       has_function_privilege('authenticated', 'public.eab_admin__log(text,text,text,text,jsonb,text)', 'execute') internal_log,
       has_table_privilege('authenticated', 'public.eab_admin_log', 'select') direct_read;
