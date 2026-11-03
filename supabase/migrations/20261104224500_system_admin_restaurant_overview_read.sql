-- System Admin overview reads storefront/domain data without weakening tenant RLS.
CREATE OR REPLACE FUNCTION public.system_admin_get_restaurant_overview(p_restaurant_id uuid)
RETURNS TABLE (
  tagline text,
  restaurant_address text,
  store_address text,
  custom_domain text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL
    OR NOT private.privileged_session_verified()
    OR NOT private.is_platform_admin()
    OR NOT EXISTS (
      SELECT 1
      FROM public.platform_admins pa
      WHERE pa.user_id = auth.uid()
        AND pa.is_active = true
        AND pa.access_level IN ('owner','administrator','view_only')
    ) THEN
    RAISE EXCEPTION 'MFA-verified System Administrator session required' USING ERRCODE='42501';
  END IF;

  IF p_restaurant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id = p_restaurant_id
  ) THEN
    RAISE EXCEPTION 'Restaurant not found' USING ERRCODE='P0002';
  END IF;

  RETURN QUERY
  SELECT
    s.tagline,
    s.restaurant_address,
    s.store_address,
    (
      SELECT d.hostname
      FROM public.tenant_domains d
      WHERE d.tenant_id = p_restaurant_id
        AND d.kind = 'custom'
        AND d.status = 'active'
      ORDER BY d.created_at DESC
      LIMIT 1
    )
  FROM (SELECT p_restaurant_id AS tenant_id) selected
  LEFT JOIN public.tenant_storefronts s ON s.tenant_id = selected.tenant_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.system_admin_get_restaurant_overview(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.system_admin_get_restaurant_overview(uuid) TO authenticated;
