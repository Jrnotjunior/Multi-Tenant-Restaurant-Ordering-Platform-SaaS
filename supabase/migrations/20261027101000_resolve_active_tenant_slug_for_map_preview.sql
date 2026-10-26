-- Allow the explicitly scoped GitHub Pages preview to verify a tenant
-- without querying a legacy restaurants table or exposing tenant metadata.
BEGIN;

CREATE OR REPLACE FUNCTION public.resolve_restaurant_by_slug(p_slug text)
RETURNS TABLE (id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT t.id
  FROM public.tenants AS t
  WHERE t.slug = lower(btrim(p_slug))
    AND t.status = 'active'
  LIMIT 2;
$function$;

REVOKE ALL ON FUNCTION public.resolve_restaurant_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_restaurant_by_slug(text) TO anon, authenticated;

COMMENT ON FUNCTION public.resolve_restaurant_by_slug(text) IS
  'Public preview-only map gate: returns an opaque tenant ID for an active tenant slug without exposing tenant metadata.';

COMMIT;
