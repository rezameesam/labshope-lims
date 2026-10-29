-- Integration test for register_visit (run against a local database that has all
-- migrations applied; everything is rolled back at the end):
--   psql "$DATABASE_URL" -f supabase/tests/register_visit.test.sql
\set ON_ERROR_STOP on
begin;

-- fixtures (as superuser)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'nobody@test.local');
insert into organizations (id, slug, display_name) values
  ('11111111-1111-1111-1111-111111111111', 'orga', 'Org A'),
  ('22222222-2222-2222-2222-222222222222', 'orgb', 'Org B');
insert into labs (id, lab_code, name, organization_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'LA', 'Lab A', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'LB', 'Lab B', '22222222-2222-2222-2222-222222222222');
insert into user_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000a1', 'admin') on conflict do nothing;
insert into organization_users (organization_id, user_id, role)
  values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000a1', 'owner');
insert into doctors (id, name, commission_percentage, organization_id) values
  ('dddddddd-0000-0000-0000-000000000001', 'Dr Ten Percent', 10, '11111111-1111-1111-1111-111111111111');
insert into test_packages (id, name, price, organization_id)
  values ('eeeeeeee-0000-0000-0000-000000000001', 'Basic Pkg', 500, '11111111-1111-1111-1111-111111111111');

create or replace function pg_temp.visit(p jsonb) returns jsonb language sql as $$ select public.register_visit(p) $$;

-- act as the admin
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  org uuid := '11111111-1111-1111-1111-111111111111';
  lab uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  r jsonb; r2 jsonb; r3 jsonb; r4 jsonb;
  v1 uuid := gen_random_uuid(); v2 uuid := gen_random_uuid(); v3 uuid := gen_random_uuid(); v4 uuid := gen_random_uuid();
  n int; total numeric; comm numeric; code1 text;
begin
  -- 1. new patient, two tests, doctor referral
  r := public.register_visit(jsonb_build_object(
    'visit_id', v1, 'organization_id', org, 'lab_id', lab, 'test_date', '2026-10-29',
    'patient', jsonb_build_object('new', jsonb_build_object('full_name','Asha Rao','phone','+919876543210','gender','female','phone_variants', jsonb_build_array('+919876543210','9876543210'))),
    'tests', jsonb_build_array(jsonb_build_object('test_name','CBC','price',300), jsonb_build_object('test_name','LFT','price',450)),
    'referral', jsonb_build_object('doctor_id','dddddddd-0000-0000-0000-000000000001')));
  assert (r->>'total_amount')::numeric = 750, 'total should be 750, got ' || (r->>'total_amount');
  assert (r->>'patient_created')::boolean, 'patient should be created';
  assert r->>'invoice_number' like 'INV26%', 'invoice number format: ' || (r->>'invoice_number');
  code1 := r->>'patient_code';
  select count(*) into n from patient_tests where patient_id = (r->>'patient_uuid')::uuid; assert n = 2, 'two tests';
  select count(*) into n from invoice_items where invoice_id = v1; assert n = 2, 'two items';
  select commission_amount into comm from doctor_referrals where invoice_id = v1; assert comm = 75, 'commission 10% of 750 = 75, got ' || coalesce(comm::text,'null');
  raise notice 'OK 1 new patient + tests + invoice + referral (%)', r->>'invoice_number';

  -- 2. idempotent replay
  r2 := public.register_visit(jsonb_build_object(
    'visit_id', v1, 'organization_id', org, 'lab_id', lab,
    'patient', jsonb_build_object('new', jsonb_build_object('full_name','Asha Rao','phone','+919876543210')),
    'tests', jsonb_build_array(jsonb_build_object('test_name','CBC','price',300))));
  assert (r2->>'replayed')::boolean, 'replay flagged';
  assert r2->>'invoice_number' = r->>'invoice_number', 'same invoice number on replay';
  select count(*) into n from invoices where organization_id = org; assert n = 1, 'still one invoice';
  select count(*) into n from patient_tests where organization_id = org; assert n = 2, 'no duplicate tests';
  raise notice 'OK 2 replay is idempotent';

  -- 3. same phone, new visit: reuse patient, new sequential invoice number
  r3 := public.register_visit(jsonb_build_object(
    'visit_id', v2, 'organization_id', org, 'lab_id', lab,
    'patient', jsonb_build_object('new', jsonb_build_object('full_name','Asha R','phone','9876543210','phone_variants', jsonb_build_array('9876543210','+919876543210'))),
    'tests', jsonb_build_array(jsonb_build_object('test_name','TSH','price',200))));
  assert (r3->>'patient_matched')::boolean and not (r3->>'patient_created')::boolean, 'matched existing patient';
  assert r3->>'patient_uuid' = r->>'patient_uuid', 'same patient reused';
  assert r3->>'invoice_number' <> r->>'invoice_number', 'new invoice number';
  select count(*) into n from patients where organization_id = org; assert n = 1, 'still one patient';
  raise notice 'OK 3 phone dedupe reuses patient (%, %)', r->>'invoice_number', r3->>'invoice_number';

  -- 4. package: package tests free, package price charged once
  r4 := public.register_visit(jsonb_build_object(
    'visit_id', v3, 'organization_id', org, 'lab_id', lab,
    'patient', jsonb_build_object('id', r->>'patient_uuid'),
    'package', jsonb_build_object('id','eeeeeeee-0000-0000-0000-000000000001','name','Basic Pkg','price',500),
    'tests', jsonb_build_array(jsonb_build_object('test_name','CBC','price',300,'in_package',true), jsonb_build_object('test_name','Vit D','price',900))));
  assert (r4->>'total_amount')::numeric = 1400, 'package total 500 + 900 = 1400, got ' || (r4->>'total_amount');
  select count(*) into n from invoice_items where invoice_id = v3; assert n = 3, 'two tests + package row';
  select count(*) into n from patient_tests where test_package_id is not null and patient_id = (r->>'patient_uuid')::uuid and test_name in ('CBC','Vit D');
  assert n >= 2, 'package fields set';
  raise notice 'OK 4 package pricing';

  -- 5. patient code collision is resolved instead of failing
  r := public.register_visit(jsonb_build_object(
    'visit_id', v4, 'organization_id', org, 'lab_id', lab,
    'patient', jsonb_build_object('new', jsonb_build_object('full_name','Ravi K','phone','9000000001','patient_code', code1)),
    'tests', jsonb_build_array(jsonb_build_object('test_name','CBC','price',1))));
  assert r->>'patient_code' <> code1, 'collided code replaced';
  raise notice 'OK 5 patient code collision handled (% -> %)', code1, r->>'patient_code';

  -- 6. validation
  begin perform public.register_visit(jsonb_build_object('visit_id', gen_random_uuid(), 'organization_id', org, 'lab_id', lab, 'patient', jsonb_build_object('new', jsonb_build_object('full_name','X','phone','1')), 'tests', '[]'::jsonb));
    raise exception 'expected failure'; exception when sqlstate '22023' then raise notice 'OK 6a empty tests rejected'; end;
  begin perform public.register_visit(jsonb_build_object('visit_id', gen_random_uuid(), 'organization_id', org, 'lab_id', lab, 'patient', jsonb_build_object('id', gen_random_uuid()), 'tests', jsonb_build_array(jsonb_build_object('test_name','A','price',1))));
    raise exception 'expected failure'; exception when sqlstate 'P0002' then raise notice 'OK 6b unknown patient rejected'; end;

  -- 6c. the client may choose each test's id (the desktop app needs it to enter results offline)
  declare cid1 uuid := gen_random_uuid(); cid2 uuid := gen_random_uuid(); vv uuid := gen_random_uuid(); got int;
  begin
    r := public.register_visit(jsonb_build_object(
      'visit_id', vv, 'organization_id', org, 'lab_id', lab,
      'patient', jsonb_build_object('id', (select patient_uuid from (select (r3->>'patient_uuid')::uuid as patient_uuid) q)),
      'tests', jsonb_build_array(jsonb_build_object('id', cid1, 'test_name','Glucose','price',100), jsonb_build_object('id', cid2, 'test_name','Urea','price',120), jsonb_build_object('test_name','NoId','price',50))));
    select count(*) into got from patient_tests where id in (cid1, cid2); assert got = 2, 'client test ids are used, got ' || got;
    select count(*) into got from patient_tests where test_name = 'NoId' and id not in (cid1, cid2); assert got = 1, 'a test without an id still gets one';
    r := public.register_visit(jsonb_build_object('visit_id', vv, 'organization_id', org, 'patient', jsonb_build_object('id', r3->>'patient_uuid'), 'tests', jsonb_build_array(jsonb_build_object('id', cid1, 'test_name','Glucose','price',100))));
    assert (r->>'replayed')::boolean, 'replay flagged';
    select count(*) into got from patient_tests where test_name in ('Glucose','Urea','NoId'); assert got = 3, 'replay adds no tests';
    raise notice 'OK 6c client-chosen test ids';
  end;

  -- 7. atomic: a failure after the patient insert leaves nothing behind
  begin
    perform public.register_visit(jsonb_build_object('visit_id', gen_random_uuid(), 'organization_id', org, 'lab_id', lab,
      'patient', jsonb_build_object('new', jsonb_build_object('full_name','Atomic','phone','9111111111')),
      'tests', jsonb_build_array(jsonb_build_object('test_name','A','price',1), jsonb_build_object('price',2))));
    raise exception 'expected failure';
  exception when sqlstate '22023' then null; end;
  select count(*) into n from patients where full_name = 'Atomic'; assert n = 0, 'rolled back atomically';
  raise notice 'OK 7 failure leaves no partial data';
end $$;

-- 8. a user with no roles cannot register visits, and is blocked by RLS
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.register_visit(jsonb_build_object('visit_id', gen_random_uuid(), 'organization_id', '11111111-1111-1111-1111-111111111111', 'lab_id', 'aaaaaaaa-0000-0000-0000-000000000001',
      'patient', jsonb_build_object('new', jsonb_build_object('full_name','Mallory','phone','9222222222')),
      'tests', jsonb_build_array(jsonb_build_object('test_name','A','price',1))));
    raise exception 'RLS should have blocked this';
  exception when insufficient_privilege then raise notice 'OK 8 unauthorized user blocked by RLS';
  end;
end $$;

-- 9. not authenticated
select set_config('request.jwt.claims', '', true);
do $$
begin
  begin
    perform public.register_visit('{}'::jsonb);
    raise exception 'should require auth';
  exception when sqlstate '28000' then raise notice 'OK 9 anonymous rejected';
  end;
end $$;

rollback;
