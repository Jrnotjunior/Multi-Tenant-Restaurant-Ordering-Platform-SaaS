CREATE OR REPLACE FUNCTION public.system_admin_list_online_payment_entitlements()
RETURNS TABLE(tenant_id uuid, enabled boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF NOT private.is_platform_admin() OR NOT EXISTS (
    SELECT 1 FROM public.platform_admins pa
    WHERE pa.user_id = (SELECT auth.uid()) AND pa.is_active = true
      AND pa.access_level IN ('owner', 'administrator')
  ) THEN
    RAISE EXCEPTION 'Verified platform administrator with management access required' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT s.tenant_id, coalesce((s.online_payments->>'enabled')::boolean, false)
    FROM public.tenant_storefronts s;
END;
$function$;

CREATE OR REPLACE FUNCTION public.system_admin_set_online_payments(p_tenant_id uuid, p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_previous boolean;
BEGIN
  IF NOT private.is_platform_admin() OR NOT EXISTS (
    SELECT 1 FROM public.platform_admins pa
    WHERE pa.user_id = (SELECT auth.uid()) AND pa.is_active = true
      AND pa.access_level IN ('owner', 'administrator')
  ) THEN
    RAISE EXCEPTION 'Verified platform administrator with management access required' USING ERRCODE='42501';
  END IF;
  IF p_tenant_id IS NULL OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'Restaurant and entitlement state are required' USING ERRCODE='22023';
  END IF;
  SELECT coalesce((online_payments->>'enabled')::boolean, false) INTO v_previous
    FROM public.tenant_storefronts WHERE tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restaurant storefront not found' USING ERRCODE='P0002'; END IF;

  UPDATE public.tenant_storefronts
  SET online_payments = CASE
    WHEN p_enabled THEN jsonb_set(coalesce(online_payments, '{}'::jsonb), '{enabled}', 'true'::jsonb, true)
    ELSE jsonb_set(jsonb_set(coalesce(online_payments, '{}'::jsonb), '{enabled}', 'false'::jsonb, true),
      '{methods}', '{"card":false,"gcash":false,"qrph":false,"grab_pay":false,"paymaya":false,"dob":false,"billease":false}'::jsonb, true)
    END,
    updated_at=now()
  WHERE tenant_id=p_tenant_id;

  PERFORM public.system_admin_write_audit_log(
    'ONLINE_PAYMENT_ENTITLEMENT_UPDATED',
    CASE WHEN p_enabled THEN 'Enabled online payments for restaurant' ELSE 'Disabled online payments for restaurant' END,
    p_tenant_id, 'online_payments', p_tenant_id::text,
    jsonb_build_object('previous_enabled',v_previous,'enabled',p_enabled,'payment_methods_reset',NOT p_enabled)
  );
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.system_admin_list_online_payment_entitlements() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.system_admin_set_online_payments(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.system_admin_list_online_payment_entitlements() TO authenticated;
GRANT EXECUTE ON FUNCTION public.system_admin_set_online_payments(uuid, boolean) TO authenticated;
