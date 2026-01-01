-- Update IRM Clinical Laboratory coordinates
-- Coordinates from: https://www.google.com/maps/place/IRM+Clinical+Laboratory/@34.0166941,74.7182231,17z/
-- Latitude: 34.0166941
-- Longitude: 74.7182231

UPDATE public.labs
SET 
  latitude = 34.0166941,
  longitude = 74.7182231
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

