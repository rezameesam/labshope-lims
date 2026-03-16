-- Local-only verification seed for inventory/referral tenant isolation.
-- Safe to rerun after `supabase db reset`.

DO $$
DECLARE
  irm_org_id UUID;
  acme_org_id UUID;
  irm_lab_id UUID;
  acme_lab_id UUID;
  irm_patient_id UUID;
  acme_patient_id UUID;
  irm_test_row_id UUID;
  acme_test_row_id UUID;
  irm_invoice_id UUID;
  acme_invoice_id UUID;
  irm_category_id UUID;
  acme_category_id UUID;
  irm_item_id UUID;
  acme_item_id UUID;
  irm_doctor_id UUID;
  acme_doctor_id UUID;
BEGIN
  INSERT INTO public.organizations (
    slug,
    display_name,
    legal_name,
    status,
    primary_email,
    primary_phone
  )
  VALUES (
    'acme-diagnostics',
    'Acme Diagnostics',
    'Acme Diagnostics Private Limited',
    'active',
    'hello@acmediagnostics.test',
    '+91-9900000001'
  )
  ON CONFLICT (slug) DO UPDATE
  SET
    display_name = EXCLUDED.display_name,
    legal_name = EXCLUDED.legal_name,
    status = EXCLUDED.status,
    primary_email = EXCLUDED.primary_email,
    primary_phone = EXCLUDED.primary_phone;

  SELECT id INTO irm_org_id
  FROM public.organizations
  WHERE slug = 'irmclinic'
  LIMIT 1;

  SELECT id INTO acme_org_id
  FROM public.organizations
  WHERE slug = 'acme-diagnostics'
  LIMIT 1;

  INSERT INTO public.labs (
    lab_code,
    name,
    type,
    address,
    city,
    state,
    pincode,
    phone,
    email,
    is_active,
    organization_id
  )
  VALUES (
    'ACME001',
    'Acme Main Lab',
    'main',
    '42 Market Road',
    'Srinagar',
    'Jammu and Kashmir',
    '190001',
    '+91-9900000001',
    'lab@acmediagnostics.test',
    true,
    acme_org_id
  )
  ON CONFLICT (organization_id, lab_code) DO UPDATE
  SET
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    address = EXCLUDED.address,
    city = EXCLUDED.city,
    state = EXCLUDED.state,
    pincode = EXCLUDED.pincode,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    is_active = EXCLUDED.is_active,
    organization_id = EXCLUDED.organization_id;

  SELECT id INTO irm_lab_id
  FROM public.labs
  WHERE lab_code = 'LAB001'
    AND organization_id = irm_org_id
  LIMIT 1;

  SELECT id INTO acme_lab_id
  FROM public.labs
  WHERE lab_code = 'ACME001'
    AND organization_id = acme_org_id
  LIMIT 1;

  DELETE FROM public.doctor_referrals
  WHERE invoice_number IN ('INV-IRM-LOCAL-001', 'INV-ACME-LOCAL-001');

  DELETE FROM public.equipment_maintenance
  WHERE notes IN ('local-seed-irm-maintenance', 'local-seed-acme-maintenance');

  DELETE FROM public.inventory_usage
  WHERE notes IN ('local-seed-irm-usage', 'local-seed-acme-usage');

  DELETE FROM public.inventory_purchases
  WHERE invoice_number IN ('PUR-IRM-LOCAL-001', 'PUR-ACME-LOCAL-001');

  DELETE FROM public.invoice_items
  WHERE test_name IN ('IRM CBC', 'ACME CBC');

  DELETE FROM public.invoices
  WHERE invoice_number IN ('INV-IRM-LOCAL-001', 'INV-ACME-LOCAL-001');

  DELETE FROM public.patient_tests
  WHERE test_name IN ('IRM CBC', 'ACME CBC');

  DELETE FROM public.doctors
  WHERE name IN ('Dr. IRM Local', 'Dr. Acme Local');

  DELETE FROM public.inventory_items
  WHERE sku IN ('IRM-LOCAL-SKU', 'ACME-LOCAL-SKU');

  DELETE FROM public.inventory_categories
  WHERE name IN ('IRM Local Reagents', 'Acme Local Reagents');

  DELETE FROM public.patients
  WHERE patient_id IN ('PATIRMLOCAL001', 'PATACMELOCAL001');

  INSERT INTO public.patients (
    patient_id,
    full_name,
    phone,
    email,
    gender,
    is_active,
    lab_id,
    organization_id
  )
  VALUES (
    'PATIRMLOCAL001',
    'IRM Local Patient',
    '+919111111111',
    'irm.patient.local@test.invalid',
    'male',
    true,
    irm_lab_id,
    irm_org_id
  )
  RETURNING id INTO irm_patient_id;

  IF irm_patient_id IS NULL THEN
    SELECT id INTO irm_patient_id
    FROM public.patients
    WHERE patient_id = 'PATIRMLOCAL001'
    LIMIT 1;
  END IF;

  INSERT INTO public.patients (
    patient_id,
    full_name,
    phone,
    email,
    gender,
    is_active,
    lab_id,
    organization_id
  )
  VALUES (
    'PATACMELOCAL001',
    'Acme Local Patient',
    '+919222222222',
    'acme.patient.local@test.invalid',
    'female',
    true,
    acme_lab_id,
    acme_org_id
  )
  RETURNING id INTO acme_patient_id;

  IF acme_patient_id IS NULL THEN
    SELECT id INTO acme_patient_id
    FROM public.patients
    WHERE patient_id = 'PATACMELOCAL001'
    LIMIT 1;
  END IF;

  INSERT INTO public.patient_tests (
    patient_id,
    test_name,
    test_date,
    status,
    lab_id,
    organization_id,
    notes
  )
  VALUES (
    irm_patient_id,
    'IRM CBC',
    CURRENT_DATE,
    'completed',
    irm_lab_id,
    irm_org_id,
    'local-seed-irm-test'
  )
  RETURNING id INTO irm_test_row_id;

  INSERT INTO public.patient_tests (
    patient_id,
    test_name,
    test_date,
    status,
    lab_id,
    organization_id,
    notes
  )
  VALUES (
    acme_patient_id,
    'ACME CBC',
    CURRENT_DATE,
    'completed',
    acme_lab_id,
    acme_org_id,
    'local-seed-acme-test'
  )
  RETURNING id INTO acme_test_row_id;

  INSERT INTO public.invoices (
    invoice_number,
    patient_id,
    lab_id,
    organization_id,
    total_amount,
    final_amount,
    paid_amount,
    payment_status,
    notes
  )
  VALUES (
    'INV-IRM-LOCAL-001',
    irm_patient_id,
    irm_lab_id,
    irm_org_id,
    500,
    500,
    300,
    'partial',
    'local-seed-irm-invoice'
  )
  RETURNING id INTO irm_invoice_id;

  INSERT INTO public.invoices (
    invoice_number,
    patient_id,
    lab_id,
    organization_id,
    total_amount,
    final_amount,
    paid_amount,
    payment_status,
    notes
  )
  VALUES (
    'INV-ACME-LOCAL-001',
    acme_patient_id,
    acme_lab_id,
    acme_org_id,
    650,
    650,
    650,
    'paid',
    'local-seed-acme-invoice'
  )
  RETURNING id INTO acme_invoice_id;

  INSERT INTO public.invoice_items (
    invoice_id,
    patient_test_id,
    test_name,
    unit_price,
    amount
  )
  VALUES
    (irm_invoice_id, irm_test_row_id, 'IRM CBC', 500, 500),
    (acme_invoice_id, acme_test_row_id, 'ACME CBC', 650, 650);

  INSERT INTO public.inventory_categories (
    name,
    type,
    description,
    organization_id
  )
  VALUES (
    'IRM Local Reagents',
    'supply',
    'local-seed-irm-category',
    irm_org_id
  )
  RETURNING id INTO irm_category_id;

  INSERT INTO public.inventory_categories (
    name,
    type,
    description,
    organization_id
  )
  VALUES (
    'Acme Local Reagents',
    'supply',
    'local-seed-acme-category',
    acme_org_id
  )
  RETURNING id INTO acme_category_id;

  INSERT INTO public.inventory_items (
    category_id,
    name,
    description,
    type,
    sku,
    unit,
    current_stock,
    min_stock_level,
    unit_price,
    supplier,
    is_active,
    lab_id,
    organization_id
  )
  VALUES (
    irm_category_id,
    'IRM Local Reagent',
    'local-seed-irm-item',
    'supply',
    'IRM-LOCAL-SKU',
    'box',
    25,
    5,
    120,
    'IRM Supplier',
    true,
    irm_lab_id,
    irm_org_id
  )
  RETURNING id INTO irm_item_id;

  INSERT INTO public.inventory_items (
    category_id,
    name,
    description,
    type,
    sku,
    unit,
    current_stock,
    min_stock_level,
    unit_price,
    supplier,
    is_active,
    lab_id,
    organization_id
  )
  VALUES (
    acme_category_id,
    'Acme Local Reagent',
    'local-seed-acme-item',
    'supply',
    'ACME-LOCAL-SKU',
    'box',
    30,
    6,
    140,
    'Acme Supplier',
    true,
    acme_lab_id,
    acme_org_id
  )
  RETURNING id INTO acme_item_id;

  INSERT INTO public.inventory_purchases (
    item_id,
    quantity,
    unit_cost,
    total_cost,
    supplier,
    invoice_number,
    purchase_date,
    notes,
    organization_id
  )
  VALUES
    (irm_item_id, 10, 100, 1000, 'IRM Supplier', 'PUR-IRM-LOCAL-001', CURRENT_DATE, 'local-seed-irm-purchase', irm_org_id),
    (acme_item_id, 12, 110, 1320, 'Acme Supplier', 'PUR-ACME-LOCAL-001', CURRENT_DATE, 'local-seed-acme-purchase', acme_org_id);

  INSERT INTO public.inventory_usage (
    item_id,
    patient_test_id,
    quantity,
    unit_cost,
    total_cost,
    usage_date,
    notes,
    organization_id
  )
  VALUES
    (irm_item_id, irm_test_row_id, 2, 120, 240, CURRENT_DATE, 'local-seed-irm-usage', irm_org_id),
    (acme_item_id, acme_test_row_id, 1, 140, 140, CURRENT_DATE, 'local-seed-acme-usage', acme_org_id);

  INSERT INTO public.equipment_maintenance (
    item_id,
    maintenance_type,
    scheduled_date,
    cost,
    vendor,
    notes,
    status,
    organization_id
  )
  VALUES
    (irm_item_id, 'calibration', CURRENT_DATE, 500, 'IRM Service Co', 'local-seed-irm-maintenance', 'scheduled', irm_org_id),
    (acme_item_id, 'inspection', CURRENT_DATE, 700, 'Acme Service Co', 'local-seed-acme-maintenance', 'scheduled', acme_org_id);

  INSERT INTO public.doctors (
    name,
    specialization,
    phone,
    email,
    commission_percentage,
    is_active,
    notes,
    lab_id,
    organization_id
  )
  VALUES (
    'Dr. IRM Local',
    'Pathology',
    '+919333333333',
    'dr.irm.local@test.invalid',
    10,
    true,
    'local-seed-irm-doctor',
    irm_lab_id,
    irm_org_id
  )
  RETURNING id INTO irm_doctor_id;

  INSERT INTO public.doctors (
    name,
    specialization,
    phone,
    email,
    commission_percentage,
    is_active,
    notes,
    lab_id,
    organization_id
  )
  VALUES (
    'Dr. Acme Local',
    'General Medicine',
    '+919444444444',
    'dr.acme.local@test.invalid',
    12,
    true,
    'local-seed-acme-doctor',
    acme_lab_id,
    acme_org_id
  )
  RETURNING id INTO acme_doctor_id;

  INSERT INTO public.doctor_referrals (
    doctor_id,
    patient_id,
    invoice_id,
    invoice_number,
    invoice_amount,
    commission_amount,
    commission_paid,
    referral_date,
    notes,
    organization_id
  )
  VALUES
    (irm_doctor_id, irm_patient_id, irm_invoice_id, 'INV-IRM-LOCAL-001', 500, 50, false, CURRENT_DATE, 'local-seed-irm-referral', irm_org_id),
    (acme_doctor_id, acme_patient_id, acme_invoice_id, 'INV-ACME-LOCAL-001', 650, 78, false, CURRENT_DATE, 'local-seed-acme-referral', acme_org_id);
END $$;
