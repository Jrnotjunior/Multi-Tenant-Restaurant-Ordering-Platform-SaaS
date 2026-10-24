-- W2T-021: expose only the favicon path for a published storefront.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_public_storefront_favicon(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT jsonb_build_object('faviconPath', s.favicon_path)
  FROM public.tenants t
  JOIN public.tenant_storefronts s ON s.tenant_id = t.id
  JOIN public.branches b ON b.tenant_id = t.id AND b.id = s.default_branch_id
  WHERE t.slug = p_slug
    AND t.status = 'active'
    AND s.status = 'published'
    AND b.is_active = true
    AND p_slug IS NOT NULL
    AND length(p_slug) BETWEEN 3 AND 64
    AND p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  LIMIT 1;
$fn$;

REVOKE ALL ON FUNCTION public.get_public_storefront_favicon(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_storefront_favicon(text) TO anon, authenticated;

COMMIT;
