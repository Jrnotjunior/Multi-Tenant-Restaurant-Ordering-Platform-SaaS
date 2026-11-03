-- Keep the online-payments master entitlement under platform-admin control.
ALTER TABLE public.tenant_storefronts
  ALTER COLUMN online_payments SET DEFAULT
  '{"enabled":false,"methods":{"card":false,"gcash":false,"qrph":false,"grab_pay":false,"paymaya":false,"dob":false,"billease":false},"provider_configured":false}'::jsonb;

UPDATE public.tenant_storefronts
SET online_payments = jsonb_set(
  jsonb_set(
    coalesce(online_payments, '{}'::jsonb),
    '{methods}',
    '{"card":false,"gcash":false,"qrph":false,"grab_pay":false,"paymaya":false,"dob":false,"billease":false}'::jsonb,
    true
  ),
  '{enabled}',
  'false'::jsonb,
  true
)
WHERE coalesce((online_payments->>'enabled')::boolean, false) IS DISTINCT FROM true;

CREATE OR REPLACE FUNCTION private.guard_owner_online_payment_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_old jsonb := coalesce(OLD.online_payments, '{}'::jsonb);
  v_new jsonb := coalesce(NEW.online_payments, '{}'::jsonb);
BEGIN
  IF private.is_active_owner(NEW.tenant_id) AND NOT private.is_platform_admin() THEN
    v_new := jsonb_set(v_new, '{enabled}', coalesce(v_old->'enabled', 'false'::jsonb), true);
    v_new := jsonb_set(v_new, '{provider_configured}', coalesce(v_old->'provider_configured', 'false'::jsonb), true);
    IF coalesce((v_old->>'enabled')::boolean, false) IS NOT TRUE THEN
      v_new := jsonb_set(
        v_new,
        '{methods}',
        coalesce(v_old->'methods', '{"card":false,"gcash":false,"qrph":false,"grab_pay":false,"paymaya":false,"dob":false,"billease":false}'::jsonb),
        true
      );
    END IF;
    NEW.online_payments := v_new;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.guard_owner_online_payment_settings() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_owner_online_payment_settings ON public.tenant_storefronts;
CREATE TRIGGER guard_owner_online_payment_settings
BEFORE UPDATE OF online_payments ON public.tenant_storefronts
FOR EACH ROW EXECUTE FUNCTION private.guard_owner_online_payment_settings();

CREATE OR REPLACE FUNCTION public.system_admin_list_online_payment_entitlements()
RETURNS TABLE(tenant_id uuid, enabled boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Verified platform administrator MFA session required' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT s.tenant_id, coalesce((s.online_payments->>'enabled')::boolean, false)
  FROM public.tenant_storefronts s;
END;
$function$;

CREATE OR REPLACE FUNCTION public.system_admin_set_online_payments(p_tenant_id uuid, p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Verified platform administrator MFA session required' USING ERRCODE='42501';
  END IF;
  IF p_tenant_id IS NULL OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'Restaurant and entitlement state are required' USING ERRCODE='22023';
  END IF;
  UPDATE public.tenant_storefronts
  SET online_payments = CASE
    WHEN p_enabled THEN jsonb_set(coalesce(online_payments, '{}'::jsonb), '{enabled}', 'true'::jsonb, true)
    ELSE jsonb_set(
      jsonb_set(coalesce(online_payments, '{}'::jsonb), '{enabled}', 'false'::jsonb, true),
      '{methods}',
      '{"card":false,"gcash":false,"qrph":false,"grab_pay":false,"paymaya":false,"dob":false,"billease":false}'::jsonb,
      true
    )
  END,
  updated_at = now()
  WHERE tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restaurant storefront not found' USING ERRCODE='P0002'; END IF;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.system_admin_list_online_payment_entitlements() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.system_admin_set_online_payments(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.system_admin_list_online_payment_entitlements() TO authenticated;
GRANT EXECUTE ON FUNCTION public.system_admin_set_online_payments(uuid, boolean) TO authenticated;
