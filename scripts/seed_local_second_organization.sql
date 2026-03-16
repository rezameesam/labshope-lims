-- Local-only verification seed.
-- Creates a second organization with its own lab and default report template
-- so tenant isolation can be tested without changing production migrations.

DO $$
DECLARE
  second_org_id UUID;
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
    primary_phone = EXCLUDED.primary_phone
  RETURNING id INTO second_org_id;

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
    second_org_id
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

  UPDATE public.test_templates
  SET is_default = false
  WHERE organization_id = second_org_id;

  UPDATE public.test_templates
  SET
    result_format = 'table',
    include_normal_range = true,
    include_abnormal_flag = true,
    include_notes = false,
    header_template = '<p><strong>Acme Diagnostics</strong></p><p>Patient: {patient_name} ({patient_id})</p><p>Date: {test_date}</p>',
    footer_template = '<p>Processed by {lab_name}</p><p>For support call +91-9900000001</p>',
    is_default = true
  WHERE organization_id = second_org_id
    AND name = 'Acme Standard Report Template';

  IF NOT FOUND THEN
    INSERT INTO public.test_templates (
      organization_id,
      name,
      result_format,
      include_normal_range,
      include_abnormal_flag,
      include_notes,
      header_template,
      footer_template,
      is_default
    )
    VALUES (
      second_org_id,
      'Acme Standard Report Template',
      'table',
      true,
      true,
      false,
      '<p><strong>Acme Diagnostics</strong></p><p>Patient: {patient_name} ({patient_id})</p><p>Date: {test_date}</p>',
      '<p>Processed by {lab_name}</p><p>For support call +91-9900000001</p>',
      true
    );
  END IF;
END $$;
