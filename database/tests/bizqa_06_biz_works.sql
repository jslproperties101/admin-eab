-- Batch 2b: the Biz app's own path works in schema biz, called the way the Data API calls it
-- (role authenticated, search_path = biz, public, extensions — what "Accept-Profile: biz" gives).
\set ON_ERROR_STOP 1
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000c1', 'shop@x.com', now()), ('00000000-0000-0000-0000-0000000000c2', 'other@x.com', now());
set role authenticated;
set search_path = biz, public, extensions;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000c1', false);
do $$
declare tid uuid; oid uuid; pid uuid; vid uuid; s record; n int;
begin
  tid := create_tenant('Kopi Corner', 'cafe', 'MY');
  select id into oid from outlets where tenant_id = tid;
  assert oid is not null, 'outlet made';
  insert into products (tenant_id, name) values (tid, 'Kopi O') returning id into pid;
  insert into product_variants (tenant_id, product_id, sku, price, track_stock) values (tid, pid, 'KOPI-O', 3.50, false) returning id into vid;
  select * into s from complete_sale(jsonb_build_object('outlet_id', oid, 'client_sale_id', gen_random_uuid(),
    'lines', jsonb_build_array(jsonb_build_object('variant_id', vid, 'qty', 2)),
    'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 10))));
  assert s.subtotal = 7.00 and s.total >= 7.00 and s.receipt_no is not null, 'sale total ' || s.total;
  select count(*) into n from sales where tenant_id = tid; assert n = 1, 'owner sees the sale';
  perform set_config('biz.t', tid::text, false);
  raise notice 'BIZ SALE OK: receipt % total %', s.receipt_no, s.total;
end $$;
-- another signed-in user sees nothing of that business
select set_config('test.uid', '00000000-0000-0000-0000-0000000000c2', false);
do $$ declare n int; begin
  select count(*) into n from tenants; assert n = 0, 'stranger sees tenants: ' || n;
  select count(*) into n from sales; assert n = 0, 'stranger sees sales: ' || n;
  raise notice 'BIZ ROW SECURITY OK';
end $$;
reset role;
-- signed-out (anon) cannot read business data
set role anon;
do $$ declare n int; begin
  select count(*) into n from biz.tenants; assert n = 0, 'anon sees tenants';
  raise notice 'BIZ ANON OK';
exception when insufficient_privilege then raise notice 'BIZ ANON OK (no access)';
end $$;
reset role;
reset search_path;
-- unqualified names in the EAB session still mean EAB's objects
do $$ declare t text; begin select eab_marker into t from tenants; assert t = 'eab, not biz'; raise notice 'EAB NAMES STILL RESOLVE TO PUBLIC'; end $$;
