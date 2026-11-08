-- Batch 2b: the Biz admin functions (AdminBatch010 Biz file, converted to schema biz) on the REAL Biz tables in the
-- EAB-QA-Test stand-in. Same checks as biz_10_tests.sql, with seed rows that satisfy the real table rules.
\set ON_ERROR_STOP 1
insert into auth.users (id, email, email_confirmed_at, last_sign_in_at) values
  ('00000000-0000-0000-0000-00000000000a','joe.matthew.iqi@gmail.com',now(),now()),('00000000-0000-0000-0000-00000000000b','stranger@x.com',now(),now()),
  ('00000000-0000-0000-0000-00000000000c','shop@x.com',now(),now()),('00000000-0000-0000-0000-00000000000d','viewer@x.com',now(),now());
insert into biz.tenants (id, name, industry_template, plan, email, created_at) values ('11111111-1111-1111-1111-111111111111','Kopi Corner','cafe','free','kopi@x.com', now()-interval '5 days');
insert into biz.outlets (id, tenant_id, name) values ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','Main');
insert into biz.tenant_modules (tenant_id, module, enabled) values ('11111111-1111-1111-1111-111111111111','POS',true),('11111111-1111-1111-1111-111111111111','KIDS',false);
insert into biz.memberships (tenant_id, user_id, role_id, created_at) select '11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000c', id, now()-interval '5 days'
  from biz.roles where tenant_id is null and name = 'Owner';
select set_config('test.uid', '00000000-0000-0000-0000-00000000000c', false);
insert into biz.sales (tenant_id, outlet_id, client_sale_id, receipt_no, status, subtotal, total, tax_total, currency, sold_at) values
  ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',gen_random_uuid(),'R1','completed',24,25.5,1.5,'MYR',now()),
  ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',gen_random_uuid(),'R2','voided',99,99,0,'MYR',now());
insert into biz.children (id, tenant_id, full_name, dob, status) values ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','Adam Child','2022-01-01','enrolled');
insert into biz.kids_incidents (tenant_id, child_id, occurred_at, kind, severity, description, status) values
  ('11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333',now(),'injury','low','Grazed knee in the garden','open');
insert into biz.outbound_messages (tenant_id, channel, to_address, body, status, created_at, error) values
  ('11111111-1111-1111-1111-111111111111','whatsapp','+60123','Hello','failed',now(),'template not approved');
insert into biz.employees (id, tenant_id, full_name) values ('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','Siti Staff');
insert into biz.payroll_runs (id, tenant_id, year, month, status) values ('55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111',2026,10,'draft');
insert into biz.payslips (tenant_id, run_id, employee_id, gross) values ('11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555555','44444444-4444-4444-4444-444444444444',3000);

do $$
declare j jsonb; n int; v text;
begin
  -- a stranger signs in: refused, nothing granted
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000b', false);
  perform set_config('test.jwt', '{"email":"stranger@x.com"}', false);
  begin perform biz.eab_admin_signed_in('t'); raise exception 'FAIL: stranger let in'; exception when insufficient_privilege then null; end;
  assert biz.eab_admin_me() is null, 'stranger not admin';
  begin perform biz.eab_admin_app_view('biz', 'businesses'); raise exception 'FAIL: stranger view'; exception when insufficient_privilege then null; end;

  -- the Owner (pending email) signs in the first time and becomes Owner
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000a', false);
  perform set_config('test.jwt', '{"email":"Joe.Matthew.Iqi@gmail.com"}', false);
  j := biz.eab_admin_signed_in('t'); assert j->>'role' = 'owner', 'owner from pending: ' || j::text;
  select count(*) into n from biz.eab_admin_pending; assert n = 0, 'pending cleared';

  foreach v in array array['businesses','modules','invites','inventory','sales','accounting','crm','outbound','shipping','hr','legal','kids','orders','shopsync','ai',
                           'users','signups','tickets','errors','flags','settings','adminlog','admins'] loop
    j := biz.eab_admin_app_view('biz', v, null, null, null, 200, 't');
    assert j ? 'summary' and j ? 'rows', v;
  end loop;
  j := biz.eab_admin_app_view('biz', 'sales'); assert (j->'summary'->>'total_rm')::numeric = 25.5 and (j->'summary'->>'sales')::int = 1, 'void sales excluded: ' || j::text;
  j := biz.eab_admin_app_view('biz', 'businesses'); assert position('POS' in j->'rows'->0->>'modules_on') > 0 and position('KIDS' in j->'rows'->0->>'modules_on') = 0 and (j->'rows'->0->>'team')::int = 1, 'businesses: ' || j::text;
  j := biz.eab_admin_app_view('biz', 'kids'); assert (j->'summary'->>'children')::int = 1 and position('Adam' in j::text) = 0, 'no child names ever: ' || j::text;
  j := biz.eab_admin_app_view('biz', 'outbound'); assert (j->'summary'->>'failed')::int = 1 and j->'rows'->0->>'error' = 'template not approved', 'outbound';
  j := biz.eab_admin_app_view('biz', 'hr'); assert (j->'rows'->0->>'payslips')::int = 1, 'payslips counted';
  j := biz.eab_admin_app_view('biz', 'users'); assert j->'rows'->0->>'email' = 'shop@x.com', 'users';

  -- module switch with reason, logged
  begin perform biz.eab_admin_biz_module_set('11111111-1111-1111-1111-111111111111', 'KIDS', true, 'no'); raise exception 'FAIL: short reason'; exception when invalid_parameter_value then null; end;
  perform biz.eab_admin_biz_module_set('11111111-1111-1111-1111-111111111111', 'KIDS', true, 'Business asked for kids care');
  select count(*) into n from biz.tenant_modules where module = 'KIDS' and enabled; assert n = 1, 'module on';
  perform biz.eab_admin_app_settings_set('biz', '{"maintenance_on":true}', 'Upgrade tonight');
  assert (biz.eab_app_status('biz')->>'maintenance_on')::boolean, 'status shows maintenance';
  perform biz.eab_admin_app_flag_set('biz', 'ai_agents', 'AI agents', true, 'Pilot with cafes');

  -- owner adds a viewer by email before they sign in; they come in as viewer
  begin perform biz.eab_admin_set_admin('joe.matthew.iqi@gmail.com', 'viewer', true, null, 'Demote myself'); raise exception 'FAIL: self-demote'; exception when invalid_parameter_value then null; end;
  perform biz.eab_admin_set_admin('viewer@x.com', 'viewer', true, null, 'Board member read-only');
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000d', false);
  perform set_config('test.jwt', '{"email":"viewer@x.com"}', false);
  j := biz.eab_admin_signed_in('t'); assert j->>'role' = 'viewer', 'viewer joined';
  j := biz.eab_admin_app_view('biz', 'users'); assert j->'rows' = '[]'::jsonb, 'viewer: no emails';
  j := biz.eab_admin_app_view('biz', 'outbound'); assert j->'rows'->0->>'to_address' is null, 'viewer: no phone numbers';
  begin perform biz.eab_admin_app_view('biz', 'adminlog'); raise exception 'FAIL: viewer log'; exception when insufficient_privilege then null; end;
  begin perform biz.eab_admin_biz_module_set('11111111-1111-1111-1111-111111111111', 'POS', false, 'viewer tries'); raise exception 'FAIL: viewer switch'; exception when insufficient_privilege then null; end;

  -- log: chain intact, cannot be changed
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000000a', false);
  j := biz.eab_admin_verify_log('t'); assert (j->>'ok')::boolean and (j->>'checked')::int > 20, 'chain ok: ' || j::text;
  begin update biz.eab_admin_log set reason = 'x' where seq = 1; raise exception 'FAIL: log changed'; exception when insufficient_privilege then null; end;
  begin delete from biz.eab_admin_log where seq = 1; raise exception 'FAIL: log deleted'; exception when insufficient_privilege then null; end;
  select count(*) into n from biz.eab_admin_log where kind = 'action'; assert n = 4, 'actions logged (module, settings, flag, admin): ' || n;
  -- Estate Agent AI Buddy's own admin objects in public are separate and untouched
  assert public.eab_admin_role() = 'eab-public-version', 'EAB admin role function untouched';
  select count(*) into n from public.eab_admins; assert n = 1, 'EAB admins untouched: ' || n;
  select count(*) into n from public.eab_admin_log; assert n = 1, 'EAB log untouched: ' || n;
  assert public.eab_app_status('biz') = '{"from":"eab public"}'::jsonb, 'EAB app status untouched';
  raise notice 'ALL BIZ ADMIN TESTS PASSED (schema biz, beside EAB)';
end $$;

-- tamper test: switch the guard trigger off as the database owner, change a row, the check finds it
alter table biz.eab_admin_log disable trigger eab_admin_log_lock;
update biz.eab_admin_log set reason = 'tampered' where seq = 3;
alter table biz.eab_admin_log enable trigger eab_admin_log_lock;
select set_config('test.uid', '00000000-0000-0000-0000-00000000000a', false);
do $$ declare j jsonb := biz.eab_admin_verify_log('t'); begin
  assert not (j->>'ok')::boolean and (j->>'first_bad_seq')::int = 3, 'tamper found: ' || j::text; raise notice 'TAMPER DETECTED AT 3'; end $$;
select has_function_privilege('anon', 'biz.eab_admin_app_view(text,text,date,date,text,integer,text)', 'execute') anon_view,
       has_function_privilege('authenticated', 'biz.eab_admin__log(text,text,text,text,jsonb,text)', 'execute') internal_log,
       has_table_privilege('authenticated', 'biz.eab_admin_log', 'select') direct_read;
