CREATE OR REPLACE FUNCTION public.get_public_storefront_favicon(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object('faviconPath', s.favicon_path)
  FROM public.tenants AS t
  JOIN public.tenant_storefronts AS s
    ON s.tenant_id = t.id
  WHERE t.slug = p_slug
    AND t.status = 'active'
    AND s.status = 'published'
    AND p_slug IS NOT NULL
    AND length(p_slug) BETWEEN 3 AND 64
    AND p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  LIMIT 1;
$function$;

COMMENT ON FUNCTION public.get_public_storefront_favicon(text) IS
  'Returns published tenant storefront favicon metadata independently of branch activation. Public branding remains available while branch ordering is inactive.';
