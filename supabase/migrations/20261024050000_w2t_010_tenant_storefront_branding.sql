-- Tenant-managed storefront identity and typography. Defaults remain neutral and safe.
BEGIN;

ALTER TABLE public.tenant_storefronts
  ADD COLUMN IF NOT EXISTS logo_path text,
  ADD COLUMN IF NOT EXISTS font_family text NOT NULL DEFAULT 'modern';

ALTER TABLE public.tenant_storefronts
  ADD CONSTRAINT tenant_storefront_logo_path_scoped CHECK (
    logo_path IS NULL OR (
      logo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
      AND split_part(logo_path,'/',1)=tenant_id::text
    )
  ),
  ADD CONSTRAINT tenant_storefront_font_family_allowed
    CHECK (font_family IN ('modern','rounded','classic'));

-- Logos are public storefront assets, never private/customer documents.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('storefront-logos','storefront-logos',true,2097152,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT(id) DO NOTHING;

CREATE POLICY w2t_storefront_logos_owner_insert ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id='storefront-logos' AND
  CASE WHEN name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$' THEN
    private.is_active_owner(split_part(name,'/',1)::uuid)
    AND EXISTS (SELECT 1 FROM public.tenant_storefronts s
      WHERE s.tenant_id=split_part(name,'/',1)::uuid)
  ELSE false END
);

REVOKE ALL ON FUNCTION private.get_published_storefront(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_published_storefront(text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.get_published_storefront(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_tenant uuid;
DECLARE v_branch uuid;
DECLARE v_result jsonb;
BEGIN
  IF p_slug IS NULL OR length(p_slug) NOT BETWEEN 3 AND 64
     OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RETURN NULL;
  END IF;

  SELECT t.id,s.default_branch_id
    INTO v_tenant,v_branch
  FROM public.tenants t
  JOIN public.tenant_storefronts s ON s.tenant_id=t.id
  JOIN public.branches b ON b.id=s.default_branch_id AND b.tenant_id=t.id
  WHERE t.slug=p_slug AND t.status='active'
    AND s.status='published' AND b.is_active=true;

  IF v_tenant IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'slug', t.slug,
    'name', s.display_name,
    'tagline', s.tagline,
    'heroHeading', s.hero_heading,
    'heroEmphasis', s.hero_emphasis,
    'primaryColor', s.primary_color,
    'logoPath', s.logo_path,
    'fontFamily', s.font_family,
    'branchName', b.name,
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id',cat.id,'name',cat.name)
        ORDER BY cat.sort_order,cat.name,cat.id)
      FROM (
        SELECT c.id,c.name,c.sort_order FROM public.menu_categories c
        WHERE c.tenant_id=v_tenant AND c.is_published=true
        ORDER BY c.sort_order,c.name,c.id LIMIT 40
      ) cat
    ),'[]'::jsonb),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',mi.id,
        'categoryId',mi.category_id,
        'name',mi.name,
        'description',mi.description,
        'priceCentavos',coalesce(bmi.price_override_centavos,mi.price_centavos),
        'popular',mi.is_popular
      ) ORDER BY mi.category_sort,mi.sort_order,mi.name,mi.id)
      FROM (
        SELECT i.id,i.category_id,i.name,i.description,i.price_centavos,
          i.is_popular,i.sort_order,c.sort_order AS category_sort
        FROM public.menu_items i
        JOIN public.menu_categories c ON c.id=i.category_id AND c.tenant_id=i.tenant_id
        JOIN public.branch_menu_items bm ON bm.item_id=i.id
          AND bm.tenant_id=i.tenant_id AND bm.branch_id=v_branch
        WHERE i.tenant_id=v_tenant AND i.status='published'
          AND c.is_published=true AND bm.is_available=true
        ORDER BY c.sort_order,i.sort_order,i.name,i.id
        LIMIT 200
      ) mi
      JOIN public.branch_menu_items bmi ON bmi.tenant_id=v_tenant
        AND bmi.branch_id=v_branch AND bmi.item_id=mi.id
    ),'[]'::jsonb)
  ) INTO v_result
  FROM public.tenants t
  JOIN public.tenant_storefronts s ON s.tenant_id=t.id
  JOIN public.branches b ON b.tenant_id=t.id AND b.id=v_branch
  WHERE t.id=v_tenant;

  RETURN v_result;
END;
$fn$;
GRANT EXECUTE ON FUNCTION private.get_published_storefront(text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_published_storefront(text) TO anon,authenticated;

COMMIT;
