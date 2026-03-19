INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'organization-branding',
  'organization-branding',
  true,
  2097152,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/svg+xml',
    'image/x-icon',
    'image/vnd.microsoft.icon'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Organization admins can manage branding assets" ON storage.objects;
CREATE POLICY "Organization admins can manage branding assets"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'organization-branding'
  AND public.user_has_organization_access(
    auth.uid(),
    NULLIF((storage.foldername(name))[1], '')::uuid
  )
)
WITH CHECK (
  bucket_id = 'organization-branding'
  AND public.user_has_organization_access(
    auth.uid(),
    NULLIF((storage.foldername(name))[1], '')::uuid
  )
);
