-- Diagnostic: show test/category counts per org to find where the catalog actually lives
DO $$
DECLARE
  v_rec RECORD;
BEGIN
  RAISE NOTICE '=== test_categories per org ===';
  FOR v_rec IN
    SELECT o.display_name, o.id, count(tc.id) AS cat_count
    FROM public.organizations o
    LEFT JOIN public.test_categories tc ON tc.organization_id = o.id
    GROUP BY o.id, o.display_name
    ORDER BY cat_count DESC
    LIMIT 10
  LOOP
    RAISE NOTICE 'org=% id=% categories=%', v_rec.display_name, v_rec.id, v_rec.cat_count;
  END LOOP;

  RAISE NOTICE '=== tests with NULL organization_id ===';
  RAISE NOTICE 'count=%', (SELECT count(*) FROM public.tests WHERE organization_id IS NULL);

  RAISE NOTICE '=== test_categories with NULL organization_id ===';
  RAISE NOTICE 'count=%', (SELECT count(*) FROM public.test_categories WHERE organization_id IS NULL);
END;
$$;
