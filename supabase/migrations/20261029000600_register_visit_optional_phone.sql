-- register_visit: a patient may have no phone number, or deliberately share one.
--
-- Not everyone has a phone, and family members often share one number. The website lets staff continue past its
-- "phone number already registered" warning; this lets the desktop app do the same through register_visit:
--   patient.new.no_phone = true               register without a phone (stored empty, and never matched on phone)
--   patient.new.allow_duplicate_phone = true  create a new patient even if the phone is already registered
-- Without either flag nothing changes: phone is required and an existing patient with the same phone is reused.
--
-- Replaces ~7 sequential client round trips and makes the whole visit atomic.
-- It is idempotent on p_payload->>'visit_id' (used as the invoice id), so a
-- retry or an offline replay can never create a duplicate visit.
--
-- SECURITY INVOKER on purpose: row level security applies exactly as it does
-- for the direct inserts the app made before, so no new privileges are granted.
--
-- Payload (jsonb):
--   visit_id, organization_id            uuid, required
--   lab_id, collection_center_id         uuid
--   test_date (date), notes, collected_at (timestamptz)
--   patient: { id }                      existing patient (uuid)
--            { new: { id?, patient_code?, full_name, phone, gender?,
--                     date_of_birth?, phone_variants?: text[],
--                     no_phone?: bool, allow_duplicate_phone?: bool } }
--   tests:   [ { id?, test_name, price, in_package? } ]   (id: client-chosen patient_tests id)
--   package: { id, name, price }         optional
--   referral:{ doctor_id, custom_name? } optional

create or replace function public.register_visit(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid := nullif(p_payload->>'organization_id', '')::uuid;
  v_visit uuid := nullif(p_payload->>'visit_id', '')::uuid;
  v_lab uuid := nullif(p_payload->>'lab_id', '')::uuid;
  v_cc uuid := nullif(p_payload->>'collection_center_id', '')::uuid;
  v_test_date date := coalesce(nullif(p_payload->>'test_date', '')::date, current_date);
  v_notes text := nullif(p_payload->>'notes', '');
  v_collected_at timestamptz := coalesce(nullif(p_payload->>'collected_at', '')::timestamptz, now());
  v_patient jsonb := p_payload->'patient';
  v_new jsonb := p_payload->'patient'->'new';
  v_package jsonb := p_payload->'package';
  v_referral jsonb := p_payload->'referral';
  v_tests jsonb := coalesce(p_payload->'tests', '[]'::jsonb);

  v_existing_invoice record;
  v_patient_uuid uuid;
  v_patient_code text;
  v_patient_created boolean := false;
  v_patient_matched boolean := false;

  v_has_package boolean := false;
  v_package_group uuid := gen_random_uuid();
  v_test jsonb;
  v_test_id uuid;
  v_test_ids uuid[] := '{}';
  v_price numeric;
  v_total numeric := 0;
  v_idx integer := 0;
  v_attempt integer;
  v_invoice_number text;
  v_doctor_commission numeric;
  v_commission numeric := 0;
  v_skip_dedupe boolean := false;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if v_org is null or v_visit is null then
    raise exception 'organization_id and visit_id are required' using errcode = '22023';
  end if;
  if jsonb_typeof(v_tests) <> 'array' or jsonb_array_length(v_tests) = 0 then
    raise exception 'At least one test is required' using errcode = '22023';
  end if;
  if v_patient is null or jsonb_typeof(v_patient) <> 'object' then
    raise exception 'patient is required' using errcode = '22023';
  end if;

  -- Idempotent replay: the visit already exists, return what was created.
  select id, invoice_number, patient_id, total_amount, organization_id
    into v_existing_invoice
    from public.invoices
   where id = v_visit;
  if found then
    if v_existing_invoice.organization_id is distinct from v_org then
      raise exception 'visit_id already used' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'visit_id', v_visit,
      'invoice_id', v_existing_invoice.id,
      'invoice_number', v_existing_invoice.invoice_number,
      'patient_uuid', v_existing_invoice.patient_id,
      'total_amount', v_existing_invoice.total_amount,
      'patient_created', false,
      'patient_matched', false,
      'replayed', true
    );
  end if;

  -- ── patient ───────────────────────────────────────────────────────────────
  if v_new is null then
    v_patient_uuid := nullif(v_patient->>'id', '')::uuid;
    if v_patient_uuid is null then
      raise exception 'patient.id or patient.new is required' using errcode = '22023';
    end if;
    select patient_id into v_patient_code
      from public.patients
     where id = v_patient_uuid and organization_id = v_org;
    if not found then
      raise exception 'Patient not found' using errcode = 'P0002';
    end if;
  else
    if coalesce(btrim(v_new->>'full_name'), '') = '' then
      raise exception 'Patient name is required' using errcode = '22023';
    end if;
    if coalesce(btrim(v_new->>'phone'), '') = ''
       and not coalesce((v_new->>'no_phone')::boolean, false) then
      raise exception 'Patient phone is required' using errcode = '22023';
    end if;

    -- A patient may have no phone, or may deliberately share one (family members): then skip the phone match.
    v_skip_dedupe := coalesce((v_new->>'allow_duplicate_phone')::boolean, false)
                     or coalesce(btrim(v_new->>'phone'), '') = '';

    -- Same phone already registered in this organization: reuse that patient.
    select id, patient_id into v_patient_uuid, v_patient_code
      from public.patients
     where organization_id = v_org
       and is_active
       and not v_skip_dedupe
       and phone = any (
         array(
           select jsonb_array_elements_text(
             coalesce(v_new->'phone_variants', jsonb_build_array(v_new->>'phone'))
           )
         )
       )
     order by created_at
     limit 1;

    if found then
      v_patient_matched := true;
    else
      v_patient_uuid := coalesce(nullif(v_new->>'id', '')::uuid, gen_random_uuid());

      -- The client may have created this patient already (partial replay).
      select patient_id into v_patient_code
        from public.patients
       where id = v_patient_uuid and organization_id = v_org;

      if not found then
        v_patient_code := nullif(btrim(v_new->>'patient_code'), '');
        for v_attempt in 1..10 loop
          if v_patient_code is null
             or exists (
               select 1 from public.patients
                where organization_id = v_org and patient_id = v_patient_code
             ) then
            -- 4 random digits first; widen to 6 once a lab has used up many codes.
            v_patient_code := 'PAT' || to_char(current_date, 'YY') ||
              case when v_attempt <= 4
                then lpad((floor(random() * 9000) + 1000)::int::text, 4, '0')
                else lpad((floor(random() * 900000) + 100000)::int::text, 6, '0')
              end;
          end if;

          begin
            insert into public.patients (
              id, patient_id, full_name, phone, gender, date_of_birth,
              password_reset_required, organization_id, lab_id,
              collection_center_id, created_by
            ) values (
              v_patient_uuid, v_patient_code, btrim(v_new->>'full_name'),
              btrim(coalesce(v_new->>'phone', '')), nullif(v_new->>'gender', ''),
              nullif(v_new->>'date_of_birth', '')::date, false, v_org, v_lab,
              v_cc, v_user
            );
            v_patient_created := true;
            exit;
          exception when unique_violation then
            v_patient_code := null; -- collided with another code: pick a new one
          end;
        end loop;

        if not v_patient_created then
          raise exception 'Could not allocate a patient id, please retry' using errcode = '40001';
        end if;
      end if;
    end if;
  end if;

  -- ── package ───────────────────────────────────────────────────────────────
  v_has_package := v_package is not null
    and jsonb_typeof(v_package) = 'object'
    and exists (
      select 1 from jsonb_array_elements(v_tests) t
       where coalesce((t->>'in_package')::boolean, false)
    );

  -- ── ordered tests ─────────────────────────────────────────────────────────
  for v_test in select value from jsonb_array_elements(v_tests) loop
    if coalesce(btrim(v_test->>'test_name'), '') = '' then
      raise exception 'Every test needs a test_name' using errcode = '22023';
    end if;

    insert into public.patient_tests (
      id, patient_id, organization_id, test_name, test_date, notes, status,
      created_by, collected_by, collected_at, lab_id, collection_center_id,
      test_package_id, test_package_name, test_package_group_id
    ) values (
      coalesce(nullif(v_test->>'id', '')::uuid, gen_random_uuid()),
      v_patient_uuid, v_org, btrim(v_test->>'test_name'), v_test_date, v_notes,
      'pending', v_user, v_user, v_collected_at, v_lab, v_cc,
      case when v_has_package then (v_package->>'id')::uuid end,
      case when v_has_package then v_package->>'name' end,
      case when v_has_package then v_package_group end
    )
    returning id into v_test_id;

    v_test_ids := v_test_ids || v_test_id;

    v_price := case
      when v_has_package and coalesce((v_test->>'in_package')::boolean, false) then 0
      else greatest(coalesce((v_test->>'price')::numeric, 0), 0)
    end;
    v_total := v_total + v_price;
  end loop;

  if v_has_package then
    v_total := v_total + greatest(coalesce((v_package->>'price')::numeric, 0), 0);
  end if;

  -- ── invoice ───────────────────────────────────────────────────────────────
  v_invoice_number := public.generate_invoice_number(v_org);

  insert into public.invoices (
    id, invoice_number, patient_id, organization_id, lab_id,
    collection_center_id, total_amount, final_amount, created_by, notes
  ) values (
    v_visit, v_invoice_number, v_patient_uuid, v_org, v_lab, v_cc,
    v_total, v_total, v_user,
    'Auto-generated for ' || jsonb_array_length(v_tests) || ' test(s)'
  );

  v_idx := 0;
  for v_test in select value from jsonb_array_elements(v_tests) loop
    v_idx := v_idx + 1;
    v_price := case
      when v_has_package and coalesce((v_test->>'in_package')::boolean, false) then 0
      else greatest(coalesce((v_test->>'price')::numeric, 0), 0)
    end;
    insert into public.invoice_items (
      invoice_id, organization_id, test_name, unit_price, quantity, amount,
      patient_test_id
    ) values (
      v_visit, v_org, btrim(v_test->>'test_name'), v_price, 1, v_price,
      v_test_ids[v_idx]
    );
  end loop;

  if v_has_package then
    insert into public.invoice_items (
      invoice_id, organization_id, test_name, unit_price, quantity, amount,
      patient_test_id
    ) values (
      v_visit, v_org, (v_package->>'name') || ' (Package)',
      greatest(coalesce((v_package->>'price')::numeric, 0), 0), 1,
      greatest(coalesce((v_package->>'price')::numeric, 0), 0), null
    );
  end if;

  -- ── doctor referral ───────────────────────────────────────────────────────
  if v_referral is not null
     and jsonb_typeof(v_referral) = 'object'
     and nullif(v_referral->>'doctor_id', '') is not null then
    select commission_percentage into v_doctor_commission
      from public.doctors
     where id = (v_referral->>'doctor_id')::uuid and organization_id = v_org;

    if found then
      v_commission := case
        when coalesce(v_doctor_commission, 0) > 0 then v_total * v_doctor_commission / 100
        else 0
      end;
      insert into public.doctor_referrals (
        doctor_id, patient_id, organization_id, invoice_id, invoice_number,
        invoice_amount, commission_amount, notes
      ) values (
        (v_referral->>'doctor_id')::uuid, v_patient_uuid, v_org, v_visit,
        v_invoice_number, v_total, v_commission,
        nullif(v_referral->>'custom_name', '')
      );
    end if;
  end if;

  return jsonb_build_object(
    'visit_id', v_visit,
    'invoice_id', v_visit,
    'invoice_number', v_invoice_number,
    'patient_uuid', v_patient_uuid,
    'patient_code', v_patient_code,
    'total_amount', v_total,
    'patient_created', v_patient_created,
    'patient_matched', v_patient_matched,
    'replayed', false
  );
end;
$$;

revoke all on function public.register_visit(jsonb) from public, anon;
grant execute on function public.register_visit(jsonb) to authenticated;

comment on function public.register_visit(jsonb) is
  'Atomically registers a visit (patient, tests, invoice, items, referral). Idempotent on visit_id.';
