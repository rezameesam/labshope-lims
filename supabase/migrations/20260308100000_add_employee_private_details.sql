CREATE TABLE IF NOT EXISTS public.employee_private_details (
  employee_id UUID PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
  address TEXT,
  aadhaar_number TEXT,
  pan_number TEXT,
  photo_path TEXT,
  photo_original_name TEXT,
  photo_content_type TEXT,
  photo_size_bytes INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT employee_private_details_aadhaar_format
    CHECK (aadhaar_number IS NULL OR aadhaar_number ~ '^[0-9]{12}$'),
  CONSTRAINT employee_private_details_pan_format
    CHECK (pan_number IS NULL OR pan_number ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  CONSTRAINT employee_private_details_photo_size_limit
    CHECK (photo_size_bytes IS NULL OR (photo_size_bytes > 0 AND photo_size_bytes < 1048576))
);

ALTER TABLE public.employee_private_details ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_employee_private_details_updated_at ON public.employee_private_details;
CREATE TRIGGER update_employee_private_details_updated_at
BEFORE UPDATE ON public.employee_private_details
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Admins can view all employee private details" ON public.employee_private_details;
CREATE POLICY "Admins can view all employee private details"
ON public.employee_private_details
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Users can view own employee private details" ON public.employee_private_details;
CREATE POLICY "Users can view own employee private details"
ON public.employee_private_details
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = employee_private_details.employee_id
      AND e.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins can manage employee private details" ON public.employee_private_details;
CREATE POLICY "Admins can manage employee private details"
ON public.employee_private_details
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Users can insert own employee private details" ON public.employee_private_details;
CREATE POLICY "Users can insert own employee private details"
ON public.employee_private_details
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = employee_private_details.employee_id
      AND e.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can update own employee private details" ON public.employee_private_details;
CREATE POLICY "Users can update own employee private details"
ON public.employee_private_details
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = employee_private_details.employee_id
      AND e.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = employee_private_details.employee_id
      AND e.user_id = auth.uid()
  )
);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'employee-photos',
  'employee-photos',
  false,
  1048575,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Admins can manage employee photos" ON storage.objects;
CREATE POLICY "Admins can manage employee photos"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'employee-photos'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'employee-photos'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Users can view own employee photos" ON storage.objects;
CREATE POLICY "Users can view own employee photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'employee-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can upload own employee photos" ON storage.objects;
CREATE POLICY "Users can upload own employee photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'employee-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can update own employee photos" ON storage.objects;
CREATE POLICY "Users can update own employee photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'employee-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'employee-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can delete own employee photos" ON storage.objects;
CREATE POLICY "Users can delete own employee photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'employee-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
