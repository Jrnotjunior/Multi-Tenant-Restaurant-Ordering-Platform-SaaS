-- Secure System Admin activation/suspension for tenant-backed restaurants.
CREATE OR REPLACE FUNCTION public.system_admin_set_restaurant_status(
  p_restaurant_id uuid,
  p_is_active boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_previous_status text;
  v_next_status text := CASE WHEN p_is_active THEN 'active' ELSE 'suspended' END;
BEGIN
  IF v_actor IS NULL
    OR NOT private.privileged_session_verified()
    OR NOT private.is_platform_admin()
    OR NOT EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = v_actor
        AND pa.is_active = true
        AND pa.access_level IN ('owner','administrator')
    ) THEN
    RAISE EXCEPTION 'MFA-verified Owner or Administrator session required' USING ERRCODE='42501';
  END IF;

  IF p_restaurant_id IS NULL THEN
    RAISE EXCEPTION 'Restaurant ID is required' USING ERRCODE='22023';
  END IF;

  SELECT t.status INTO v_previous_status
  FROM public.tenants t
  WHERE t.id = p_restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurant not found' USING ERRCODE='P0002';
  END IF;

  UPDATE public.tenants
  SET status = v_next_status
  WHERE id = p_restaurant_id
    AND status IS DISTINCT FROM v_next_status;

  IF v_previous_status IS DISTINCT FROM v_next_status THEN
    PERFORM public.system_admin_write_audit_log(
      'restaurant_status',
      CASE WHEN p_is_active THEN 'Activated restaurant' ELSE 'Suspended restaurant' END,
      p_restaurant_id,
      'tenant',
      p_restaurant_id::text,
      jsonb_build_object('previous_status', v_previous_status, 'new_status', v_next_status)
    );
  END IF;

  RETURN v_next_status;
END;
$function$;

REVOKE ALL ON FUNCTION public.system_admin_set_restaurant_status(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.system_admin_set_restaurant_status(uuid,boolean) TO authenticated;
