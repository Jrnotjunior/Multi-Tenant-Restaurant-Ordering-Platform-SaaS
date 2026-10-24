-- W2T-020: restore tenant-safe product photo uploads at the reference UI's 5 MB limit.
BEGIN;

-- Match the reference menu editor's 5 MB product image limit.
UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']::text[]
WHERE id = 'menu-images';

-- The previous policy accidentally compared the product name with the object path.
-- Scope uploads to an existing item belonging to the same tenant.
DROP POLICY IF EXISTS w2t_menu_images_owner_insert ON storage.objects;
CREATE POLICY w2t_menu_images_owner_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'menu-images'
  AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
  AND private.is_active_owner(split_part(name, '/', 1)::uuid)
  AND EXISTS (
    SELECT 1
    FROM public.menu_items mi
    WHERE mi.tenant_id = split_part(storage.objects.name, '/', 1)::uuid
      AND mi.id = split_part(storage.objects.name, '/', 2)::uuid
  )
);

COMMIT;
