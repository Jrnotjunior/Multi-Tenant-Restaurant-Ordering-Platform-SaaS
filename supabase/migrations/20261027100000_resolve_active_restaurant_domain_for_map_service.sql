-- Resolve only active, verified tenant domains for the central map service.
-- The RPC returns only an opaque tenant ID; tenant/domain metadata stays private.
BEGIN;

CREATE OR REPLACE FUNCTION public.resolve_restaurant_by_domain(p_hostname text)
RETURNS TABLE (id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT t.id
  FROM public.tenant_domains AS d
  JOIN public.tenants AS t ON t.id = d.tenant_id
  WHERE d.hostname = lower(btrim(p_hostname))
    AND d.status = 'active'
    AND d.verified_at IS NOT NULL
    AND d.activated_at IS NOT NULL
    AND t.status = 'active'
  LIMIT 2;
$function$;

REVOKE ALL ON FUNCTION public.resolve_restaurant_by_domain(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_restaurant_by_domain(text) TO anon, authenticated;

COMMENT ON FUNCTION public.resolve_restaurant_by_domain(text) IS
  'Public map-service gate: returns an active tenant ID only for an exact, verified, active hostname. Does not expose domain or tenant metadata.';

COMMIT;
