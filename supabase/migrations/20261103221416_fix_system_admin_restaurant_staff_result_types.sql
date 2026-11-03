-- Fix the return-query types for the System Admin restaurant staff directory.
-- auth.users.email is varchar, while the RPC explicitly returns email as text.
-- PostgreSQL requires exact positional type matches for RETURN QUERY.

CREATE OR REPLACE FUNCTION public.system_admin_get_restaurant_staff(p_restaurant_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  mobile_number text,
  email text,
  role text,
  is_active boolean,
  auth_user_id uuid
)
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
    m.user_id AS id,
    COALESCE(
      NULLIF(BTRIM(CONCAT_WS(' ',
        COALESCE(NULLIF(BTRIM(m.staff_first_name),''), NULLIF(BTRIM(u.raw_user_meta_data->>'first_name'),''), NULLIF(BTRIM(u.raw_user_meta_data->>'preferred_name'),'')),
        COALESCE(NULLIF(BTRIM(m.staff_last_name),''), NULLIF(BTRIM(u.raw_user_meta_data->>'last_name'),'')) 
      )), ''),
      NULLIF(BTRIM(u.raw_user_meta_data->>'full_name'),''),
      NULLIF(BTRIM(u.raw_user_meta_data->>'name'),''),
      INITCAP(REPLACE(m.role,'_',' '))
    )::text AS name,
    COALESCE(NULLIF(BTRIM(m.staff_phone),''), NULLIF(BTRIM(u.phone),''), NULLIF(BTRIM(u.raw_user_meta_data->>'phone'),''), NULLIF(BTRIM(u.raw_user_meta_data->>'phone_number'),''), '')::text AS mobile_number,
    COALESCE(u.email::text,'')::text AS email,
    m.role::text AS role,
    (m.status = 'active')::boolean AS is_active,
    m.user_id::uuid AS auth_user_id
  FROM public.tenant_memberships m
  JOIN auth.users u ON u.id = m.user_id
  WHERE m.tenant_id = p_restaurant_id
    AND m.role IN ('cashier','kitchen','dispatcher','rider')
  ORDER BY m.created_at DESC, u.email;
END;
$function$;

REVOKE ALL ON FUNCTION public.system_admin_get_restaurant_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.system_admin_get_restaurant_staff(uuid) TO authenticated;
