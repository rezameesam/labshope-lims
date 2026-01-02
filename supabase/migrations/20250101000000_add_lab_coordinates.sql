-- Add latitude and longitude columns to labs table for accurate map display
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'labs'
  ) THEN
    ALTER TABLE public.labs
      ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
      ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);

    -- Add comment for documentation
    COMMENT ON COLUMN public.labs.latitude IS 'Latitude coordinate for map display (e.g., 34.0151 for Budgam)';
    COMMENT ON COLUMN public.labs.longitude IS 'Longitude coordinate for map display (e.g., 74.7719 for Budgam)';
  END IF;
END $$;
