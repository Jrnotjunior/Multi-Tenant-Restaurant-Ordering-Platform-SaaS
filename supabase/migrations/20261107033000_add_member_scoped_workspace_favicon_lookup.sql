CREATE OR REPLACE FUNCTION public.get_workspace_storefront_favicon(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object('faviconPath', s.favicon_path)
  FROM public.tenant_storefronts s
  JOIN public.tenants t ON t.id = s.tenant_id
  WHERE s.tenant_id = p_tenant_id
    AND t.status = 'active'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships m
      WHERE m.tenant_id = s.tenant_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.get_workspace_storefront_favicon(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_storefront_favicon(uuid) TO authenticated;
