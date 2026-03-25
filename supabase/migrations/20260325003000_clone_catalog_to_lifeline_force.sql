-- Backfill: clone default test catalog into Lifeline (tests were cleared manually)

DO $$
DECLARE
  v_source_org_id UUID;
  v_target_org_id UUID;
  v_result JSONB;
BEGIN
  SELECT setting_value::UUID
  INTO v_source_org_id
  FROM public.system_settings
  WHERE setting_key = 'catalog_template_organization_id';

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

  SELECT public.clone_catalog_to_organization(v_source_org_id, v_target_org_id)
  INTO v_result;

  RAISE NOTICE 'Catalog cloned to Lifeline (org %): %', v_target_org_id, v_result;
END;
$$;
