CREATE OR REPLACE FUNCTION private.resolve_public_storefront_domain(p_hostname text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT coalesce((
    SELECT jsonb_build_object(
      'matched', true,
      'restaurantName', CASE WHEN d.status = 'active' AND d.verified_at IS NOT NULL
        AND t.status = 'active' THEN t.name ELSE NULL END,
      'slug', CASE WHEN d.status = 'active' AND d.verified_at IS NOT NULL
        AND t.status = 'active' AND s.status = 'published' THEN t.slug ELSE NULL END
    )
    FROM public.tenant_domains d
    JOIN public.tenants t ON t.id = d.tenant_id
    LEFT JOIN public.tenant_storefronts s ON s.tenant_id = t.id
    WHERE d.hostname = lower(btrim(coalesce(p_hostname, '')))
    LIMIT 1
  ), jsonb_build_object('matched', false, 'slug', NULL, 'restaurantName', NULL));
$function$;
