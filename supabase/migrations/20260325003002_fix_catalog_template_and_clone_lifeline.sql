-- Fix catalog_template_organization_id to point to the actual IRM Clinical Laboratory org,
-- then clone its catalog into Lifeline.

DO $$
DECLARE
  v_irm_org_id UUID;
  v_lifeline_org_id UUID;
  v_result JSONB;
BEGIN
  -- Find IRM Clinical Laboratory by name
  SELECT id INTO v_irm_org_id
  FROM public.organizations
  WHERE lower(display_name) LIKE '%irm%'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_irm_org_id IS NULL THEN
    RAISE EXCEPTION 'IRM org not found';
  END IF;

  -- Update the system setting
  UPDATE public.system_settings
  SET setting_value = v_irm_org_id::text
  WHERE setting_key = 'catalog_template_organization_id';

  RAISE NOTICE 'Updated catalog_template_organization_id to %', v_irm_org_id;

  -- Clone into Lifeline
  SELECT id INTO v_lifeline_org_id
  FROM public.organizations
  WHERE lower(display_name) LIKE '%lifeline%'
     OR lower(display_name) LIKE '%life life%'
     OR lower(slug) LIKE '%lifeline%'
     OR lower(slug) LIKE '%life-life%'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_lifeline_org_id IS NULL THEN
    RAISE EXCEPTION 'Lifeline org not found';
  END IF;

  SELECT public.clone_catalog_to_organization(v_irm_org_id, v_lifeline_org_id)
  INTO v_result;

  RAISE NOTICE 'Catalog cloned to Lifeline (org %): %', v_lifeline_org_id, v_result;
END;
$$;
