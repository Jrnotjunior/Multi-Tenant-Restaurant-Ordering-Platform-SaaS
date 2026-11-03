-- Correct the System Admin restaurant-owner lookup result types.
-- auth.users.email is varchar; the RPC contract requires text.

CREATE OR REPLACE FUNCTION public.system_admin_get_restaurant_owner(p_restaurant_id uuid)
RETURNS TABLE(user_id uuid, email text, full_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT private.is_platform_admin() OR NOT EXISTS (
    SELECT 1 FROM public.platform_admins pa
    WHERE pa.user_id = (SELECT auth.uid())
      AND pa.is_active = true
      AND pa.access_level IN ('owner','administrator','view_only')
  ) THEN
    RAISE EXCEPTION 'Verified System Administrator access required' USING ERRCODE='42501';
  END IF;

  IF p_restaurant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id = p_restaurant_id
  ) THEN
    RAISE EXCEPTION 'Restaurant not found' USING ERRCODE='P0002';
  END IF;

  RETURN QUERY
  SELECT
    m.user_id::uuid,
    COALESCE(u.email::text, '')::text,
    COALESCE(
      NULLIF(BTRIM(u.raw_user_meta_data->>'full_name'),''),
      NULLIF(BTRIM(u.raw_user_meta_data->>'name'),''),
      NULLIF(BTRIM(CONCAT_WS(' ', u.raw_user_meta_data->>'first_name', u.raw_user_meta_data->>'last_name')),''),
      u.email::text,
      ''
    )::text
  FROM public.tenant_memberships m
  JOIN auth.users u ON u.id = m.user_id
  WHERE m.tenant_id = p_restaurant_id
    AND m.role = 'restaurant_owner'
    AND m.status = 'active'
  ORDER BY m.created_at
  LIMIT 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.system_admin_get_restaurant_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.system_admin_get_restaurant_owner(uuid) TO authenticated;
