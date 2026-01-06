-- Create Liver Function Test (LFT) package and link matching tests
WITH existing_package AS (
  SELECT id
  FROM public.test_packages
  WHERE name = 'Liver Function Test'
),
inserted_package AS (
  INSERT INTO public.test_packages (name, description, price, is_active)
  SELECT 'Liver Function Test', 'Liver function panel', 0, true
  WHERE NOT EXISTS (
    SELECT 1 FROM existing_package
  )
  RETURNING id
),
package_row AS (
  SELECT id FROM existing_package
  UNION ALL
  SELECT id FROM inserted_package
),
matched_tests AS (
  SELECT id
  FROM public.tests
  WHERE
    (name ILIKE '%bilirubin%' AND name ILIKE '%total%')
    OR (name ILIKE '%bilirubin%' AND name ILIKE '%direct%')
    OR (name ILIKE '%bilirubin%' AND name ILIKE '%indirect%')
    OR (name ILIKE '%sgot%' OR name ILIKE '%ast%')
    OR (name ILIKE '%sgpt%' OR name ILIKE '%alt%')
    OR (name ILIKE '%alp%' OR name ILIKE '%alkaline phosphatase%')
    OR (name ILIKE '%protein%' AND name ILIKE '%total%')
    OR (name ILIKE '%albumin%')
    OR (name ILIKE '%globulin%')
),
package_id AS (
  SELECT id FROM package_row LIMIT 1
)
INSERT INTO public.test_package_tests (package_id, test_id)
SELECT package_id.id, matched_tests.id
FROM package_id, matched_tests
WHERE NOT EXISTS (
  SELECT 1
  FROM public.test_package_tests
  WHERE test_package_tests.package_id = package_id.id
    AND test_package_tests.test_id = matched_tests.id
);
