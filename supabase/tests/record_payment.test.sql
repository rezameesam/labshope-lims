-- Integration test for record_payment and its link to the accounts (run with all migrations applied;
-- everything is rolled back at the end):
--   psql "$DATABASE_URL" -f supabase/tests/record_payment.test.sql
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'cashier@test.local');
insert into organizations (id, slug, display_name) values ('33333333-3333-3333-3333-333333333333', 'payorg', 'Pay Org');
insert into labs (id, lab_code, name, organization_id) values ('cccccccc-0000-0000-0000-000000000001', 'LP', 'Lab P', '33333333-3333-3333-3333-333333333333');
insert into user_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000c1', 'admin') on conflict do nothing;
insert into organization_users (organization_id, user_id, role) values ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-0000000000c1', 'owner');
-- the standard chart of accounts the finance triggers look up by code
insert into accounts (organization_id, code, name, type) values
  ('33333333-3333-3333-3333-333333333333', '1001', 'Cash', 'asset'),
  ('33333333-3333-3333-3333-333333333333', '1003', 'Accounts Receivable', 'asset'),
  ('33333333-3333-3333-3333-333333333333', '4001', 'Test Revenue', 'revenue');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  org uuid := '33333333-3333-3333-3333-333333333333';
  lab uuid := 'cccccccc-0000-0000-0000-000000000001';
  visit uuid := gen_random_uuid();
  p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); p3 uuid := gen_random_uuid();
  r jsonb; n int; bill record;
begin
  r := public.register_visit(jsonb_build_object(
    'visit_id', visit, 'organization_id', org, 'lab_id', lab,
    'patient', jsonb_build_object('new', jsonb_build_object('full_name','Pay Patient','phone','+919800000001')),
    'tests', jsonb_build_array(jsonb_build_object('test_name','CBC','price',300), jsonb_build_object('test_name','LFT','price',450))));
  assert (r->>'total_amount')::numeric = 750, 'bill is 750';

  -- 2. part payment
  r := public.record_payment(jsonb_build_object('payment_id', p1, 'invoice_id', visit, 'organization_id', org, 'amount', 300, 'payment_method', 'upi', 'transaction_id', 'UPI123'));
  assert (r->>'paid_amount')::numeric = 300 and (r->>'balance')::numeric = 450, 'part payment balance';
  assert r->>'payment_status' = 'partial', 'status partial, got ' || (r->>'payment_status');
  assert not (r->>'replayed')::boolean, 'first call is not a replay';
  raise notice 'OK 2 part payment -> partial, balance 450';

  -- 3. the same payment sent again (offline replay) changes nothing
  r := public.record_payment(jsonb_build_object('payment_id', p1, 'invoice_id', visit, 'organization_id', org, 'amount', 300, 'payment_method', 'upi'));
  assert (r->>'replayed')::boolean, 'replay flagged';
  select count(*) into n from payments where invoice_id = visit; assert n = 1, 'still one payment';
  select paid_amount into bill from invoices where id = visit; assert bill.paid_amount = 300, 'paid unchanged by replay';
  raise notice 'OK 3 replay is idempotent';

  -- 4. more than the balance is refused
  begin
    perform public.record_payment(jsonb_build_object('payment_id', p2, 'invoice_id', visit, 'organization_id', org, 'amount', 451));
    raise exception 'overpayment was allowed';
  exception when sqlstate '22023' then null;
  end;
  raise notice 'OK 4 overpayment refused';

  -- 5. the rest settles the bill
  r := public.record_payment(jsonb_build_object('payment_id', p2, 'invoice_id', visit, 'organization_id', org, 'amount', 450));
  assert r->>'payment_status' = 'paid' and (r->>'balance')::numeric = 0, 'paid in full';
  raise notice 'OK 5 final payment -> paid';

  -- 7. bad input
  begin perform public.record_payment(jsonb_build_object('payment_id', p3, 'invoice_id', visit, 'organization_id', org, 'amount', 0)); raise exception 'zero allowed';
  exception when sqlstate '22023' then null; end;
  begin perform public.record_payment(jsonb_build_object('payment_id', p3, 'invoice_id', gen_random_uuid(), 'organization_id', org, 'amount', 10)); raise exception 'unknown bill allowed';
  exception when sqlstate 'P0002' then null; end;
  begin perform public.record_payment(jsonb_build_object('payment_id', p3, 'invoice_id', visit, 'organization_id', org, 'amount', 10, 'payment_method', 'bitcoin')); raise exception 'bad method allowed';
  exception when sqlstate '22023' then null; end;
  raise notice 'OK 7 bad input refused';
end $$;

-- 6. The books: read as the database owner (the cashier can't see journal rows).
reset role;
do $$
declare
  org uuid := '33333333-3333-3333-3333-333333333333';
  dr numeric; cr numeric; code text;
begin
  -- bill: Dr Receivable 750 / Cr Revenue 750; payments: Dr Cash 750 / Cr Receivable 750
  for code, dr, cr in
    select a.code, coalesce(sum(l.debit),0), coalesce(sum(l.credit),0)
      from journal_entry_lines l join accounts a on a.id = l.account_id
     where a.organization_id = org group by a.code order by a.code
  loop
    if code = '1001' then assert dr = 750 and cr = 0, 'cash: Dr 750, got ' || dr || '/' || cr; end if;
    if code = '1003' then assert dr = 750 and cr = 750, 'receivable: Dr 750 and Cr 750, got ' || dr || '/' || cr; end if;
    if code = '4001' then assert dr = 0 and cr = 750, 'revenue: Cr 750, got ' || dr || '/' || cr; end if;
  end loop;
  select coalesce(sum(l.debit),0), coalesce(sum(l.credit),0) into dr, cr from journal_entry_lines l
    join journal_entries e on e.id = l.journal_entry_id where e.organization_id = org;
  assert dr = cr and dr = 1500, 'books balance at 1500: ' || dr || ' vs ' || cr;
  raise notice 'OK 6 bill + payments post to the accounts and the books balance (%)', dr;
end $$;

select 'record_payment: all checks passed' as result;
rollback;
