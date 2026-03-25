-- RPC to clone the full test catalog (categories, tests, packages, package-test links)
-- from a source organization into a freshly-provisioned target organization.
-- Called by the provision-organization edge function.

CREATE OR REPLACE FUNCTION public.clone_catalog_to_organization(
  p_source_org_id UUID,
  p_target_org_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec            RECORD;
  v_new_id         UUID;
  v_cat_count      INT := 0;
  v_test_count     INT := 0;
  v_pkg_count      INT := 0;
  v_pkg_test_count INT := 0;
BEGIN
  IF p_source_org_id = p_target_org_id THEN
    RETURN jsonb_build_object('error', 'source and target org must differ');
  END IF;

  -- ── 1. Temporary ID maps ──────────────────────────────────────────────────
  CREATE TEMP TABLE _cat_map  (old_id UUID PRIMARY KEY, new_id UUID NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE _test_map (old_id UUID PRIMARY KEY, new_id UUID NOT NULL) ON COMMIT DROP;
  CREATE TEMP TABLE _pkg_map  (old_id UUID PRIMARY KEY, new_id UUID NOT NULL) ON COMMIT DROP;

  -- ── 2. Clone test_categories ─────────────────────────────────────────────
  FOR v_rec IN
    SELECT id, name, description
    FROM public.test_categories
    WHERE organization_id = p_source_org_id
  LOOP
    v_new_id := gen_random_uuid();
    INSERT INTO _cat_map VALUES (v_rec.id, v_new_id);

    INSERT INTO public.test_categories (id, name, description, created_at, organization_id)
    VALUES (v_new_id, v_rec.name, v_rec.description, now(), p_target_org_id)
    ON CONFLICT DO NOTHING;

    v_cat_count := v_cat_count + 1;
  END LOOP;

  -- ── 3. Clone tests ────────────────────────────────────────────────────────
  FOR v_rec IN
    SELECT id, category_id, name, description, price,
           unit, normal_range_min, normal_range_max, normal_range_text, sample_type,
           test_id, panel_items, is_active
    FROM public.tests
    WHERE organization_id = p_source_org_id
  LOOP
    v_new_id := gen_random_uuid();
    INSERT INTO _test_map VALUES (v_rec.id, v_new_id);

    INSERT INTO public.tests (
      id, category_id, name, description, price,
      unit, normal_range_min, normal_range_max, normal_range_text, sample_type,
      test_id, panel_items, is_active, created_at, organization_id
    )
    VALUES (
      v_new_id,
      (SELECT new_id FROM _cat_map WHERE old_id = v_rec.category_id),
      v_rec.name, v_rec.description, v_rec.price,
      v_rec.unit, v_rec.normal_range_min, v_rec.normal_range_max,
      v_rec.normal_range_text, v_rec.sample_type,
      v_rec.test_id, v_rec.panel_items, v_rec.is_active,
      now(), p_target_org_id
    )
    ON CONFLICT DO NOTHING;

    v_test_count := v_test_count + 1;
  END LOOP;

  -- ── 4. Clone test_packages ────────────────────────────────────────────────
  FOR v_rec IN
    SELECT id, name, description, price, discount_percentage, is_active
    FROM public.test_packages
    WHERE organization_id = p_source_org_id
  LOOP
    v_new_id := gen_random_uuid();
    INSERT INTO _pkg_map VALUES (v_rec.id, v_new_id);

    INSERT INTO public.test_packages (
      id, name, description, price, discount_percentage, is_active,
      lab_id, created_at, updated_at, organization_id
    )
    VALUES (
      v_new_id, v_rec.name, v_rec.description, v_rec.price,
      v_rec.discount_percentage, v_rec.is_active,
      NULL,  -- lab_id left null; org manages its own lab assignments
      now(), now(), p_target_org_id
    )
    ON CONFLICT DO NOTHING;

    v_pkg_count := v_pkg_count + 1;
  END LOOP;

  -- ── 5. Clone test_package_tests ───────────────────────────────────────────
  FOR v_rec IN
    SELECT tpt.package_id, tpt.test_id
    FROM public.test_package_tests tpt
    JOIN public.test_packages tp ON tp.id = tpt.package_id
    WHERE tp.organization_id = p_source_org_id
  LOOP
    INSERT INTO public.test_package_tests (id, package_id, test_id, created_at)
    SELECT
      gen_random_uuid(),
      pm.new_id,
      tm.new_id,
      now()
    FROM _pkg_map pm, _test_map tm
    WHERE pm.old_id = v_rec.package_id
      AND tm.old_id = v_rec.test_id
    ON CONFLICT DO NOTHING;

    v_pkg_test_count := v_pkg_test_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'categories',    v_cat_count,
    'tests',         v_test_count,
    'packages',      v_pkg_count,
    'package_tests', v_pkg_test_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.clone_catalog_to_organization(UUID, UUID) TO service_role;
