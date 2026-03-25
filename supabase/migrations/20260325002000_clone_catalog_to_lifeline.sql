-- Backfill: clone the default test catalog into the Lifeline organization
-- (provisioned before auto-cloning was added)

DO $$
DECLARE
  v_source_org_id UUID;
  v_target_org_id UUID;
  v_result JSONB;
BEGIN
  -- Source: the catalog template org (IRM Clinic)
  SELECT setting_value::UUID
  INTO v_source_org_id
  FROM public.system_settings
  WHERE setting_key = 'catalog_template_organization_id';

  IF v_source_org_id IS NULL THEN
    RAISE EXCEPTION 'catalog_template_organization_id not set in system_settings';
  END IF;

  -- Target: Lifeline (match by display_name, case-insensitive)
  SELECT id
  INTO v_target_org_id
  FROM public.organizations
  WHERE lower(display_name) LIKE '%lifeline%'
     OR lower(display_name) LIKE '%life life%'
     OR lower(slug) LIKE '%lifeline%'
     OR lower(slug) LIKE '%life-life%'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_target_org_id IS NULL THEN
    RAISE EXCEPTION 'Lifeline organization not found';
  END IF;

  -- Skip if already has tests (don't double-clone)
  IF EXISTS (
    SELECT 1 FROM public.tests WHERE organization_id = v_target_org_id LIMIT 1
  ) THEN
    RAISE NOTICE 'Lifeline already has tests — skipping clone';
    RETURN;
  END IF;

  SELECT public.clone_catalog_to_organization(v_source_org_id, v_target_org_id)
  INTO v_result;

  RAISE NOTICE 'Catalog cloned to Lifeline: %', v_result;
END;
$$;
