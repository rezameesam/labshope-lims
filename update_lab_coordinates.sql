-- Update Lab Coordinates
-- Replace the latitude and longitude values below with your actual lab coordinates
-- 
-- To get coordinates:
-- 1. Go to https://www.google.com/maps
-- 2. Search for your lab address
-- 3. Right-click on the exact location
-- 4. Copy the coordinates (e.g., 34.0151, 74.7719)
--
-- Then update the values below and run this SQL in Supabase SQL Editor

-- Update main lab with coordinates
UPDATE public.labs
SET 
  latitude = 34.0151,  -- REPLACE with your actual latitude
  longitude = 74.7719   -- REPLACE with your actual longitude
WHERE type = 'main' AND is_active = true
LIMIT 1;

-- Verify the update
SELECT 
  name,
  address,
  city,
  state,
  latitude,
  longitude
FROM public.labs
WHERE type = 'main' AND is_active = true;

