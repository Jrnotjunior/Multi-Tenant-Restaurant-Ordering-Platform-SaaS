-- Do not expose empty published categories on a tenant storefront.
-- Category order remains tenant-configured: sort_order, then creation order and id.
BEGIN;

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
    'branchName', b.name,
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id',cat.id,'name',cat.name)
        ORDER BY cat.sort_order,cat.created_at,cat.id)
      FROM (
        SELECT c.id,c.name,c.sort_order,c.created_at
        FROM public.menu_categories c
        WHERE c.tenant_id=v_tenant AND c.is_published=true
          AND EXISTS (
            SELECT 1
            FROM public.menu_items i
            JOIN public.branch_menu_items bmi
              ON bmi.tenant_id=i.tenant_id AND bmi.item_id=i.id AND bmi.branch_id=v_branch
            WHERE i.tenant_id=c.tenant_id AND i.category_id=c.id
              AND i.status='published' AND bmi.is_available=true
          )
        ORDER BY c.sort_order,c.created_at,c.id LIMIT 40
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
      ) ORDER BY mi.category_sort,mi.category_created_at,mi.sort_order,mi.created_at,mi.id)
      FROM (
        SELECT i.id,i.category_id,i.name,i.description,i.price_centavos,
          i.is_popular,i.sort_order,i.created_at,
          c.sort_order AS category_sort,c.created_at AS category_created_at
        FROM public.menu_items i
        JOIN public.menu_categories c ON c.id=i.category_id AND c.tenant_id=i.tenant_id
        JOIN public.branch_menu_items bm ON bm.item_id=i.id
          AND bm.tenant_id=i.tenant_id AND bm.branch_id=v_branch
        WHERE i.tenant_id=v_tenant AND i.status='published'
          AND c.is_published=true AND bm.is_available=true
        ORDER BY c.sort_order,c.created_at,c.id,i.sort_order,i.created_at,i.id
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

REVOKE ALL ON FUNCTION private.get_published_storefront(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_published_storefront(text) TO anon,authenticated;

COMMIT;
