-- Fix LFT package contents to include only core liver panel tests
WITH pkg AS (
  SELECT id
  FROM public.test_packages
  WHERE name = 'Liver Function Test'
)
DELETE FROM public.test_package_tests
WHERE package_id IN (SELECT id FROM pkg);

WITH pkg AS (
  SELECT id
  FROM public.test_packages
  WHERE name = 'Liver Function Test'
)
INSERT INTO public.test_package_tests (package_id, test_id)
SELECT DISTINCT pkg.id, t.id
FROM pkg
JOIN public.tests t ON (
  -- Bilirubin
  (t.name ILIKE '%bilirubin%' AND t.name ILIKE '%total%')
  OR (t.name ILIKE '%bilirubin%' AND t.name ILIKE '%direct%')
  OR (t.name ILIKE '%bilirubin%' AND t.name ILIKE '%indirect%')
  -- SGOT/AST
  OR (t.name ILIKE '%sgot%' OR t.name ILIKE '%ast%')
  -- SGPT/ALT
  OR (t.name ILIKE '%sgpt%' OR t.name ILIKE '%alt%')
  -- ALP
  OR (t.name ILIKE '%alkaline phosphatase%' OR t.name ILIKE '%alp%')
  -- Total Protein
  OR (t.name ILIKE '%protein%' AND t.name ILIKE '%total%' AND t.name NOT ILIKE '%micro%')
  -- Albumin (exclude CSF/fluid/microalbumin/urine)
  OR (
    t.name ILIKE '%albumin%'
    AND t.name NOT ILIKE '%micro%'
    AND t.name NOT ILIKE '%urine%'
    AND t.name NOT ILIKE '%csf%'
    AND t.name NOT ILIKE '%fluid%'
  )
  -- Globulin (exclude other globulins)
  OR (
    t.name ILIKE '%globulin%'
    AND t.name NOT ILIKE '%thyroglobulin%'
    AND t.name NOT ILIKE '%myoglobulin%'
    AND t.name NOT ILIKE '%immunoglobulin%'
    AND t.name NOT ILIKE '%cryoglobulin%'
    AND t.name NOT ILIKE '%microglobulin%'
    AND t.name NOT ILIKE '%beta%'
  )
);
