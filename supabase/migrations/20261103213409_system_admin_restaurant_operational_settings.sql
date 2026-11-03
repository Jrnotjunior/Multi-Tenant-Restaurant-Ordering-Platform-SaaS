-- System Admin operational controls must be backed by the current multi-tenant schema.
-- The legacy System Admin UI calls these RPCs; install them in the shared Web2Table database.
BEGIN;

ALTER TABLE public.tenant_storefronts
  ADD COLUMN IF NOT EXISTS tax_settings jsonb NOT NULL
  DEFAULT '{"vat_registered":false,"prices_vat_inclusive":false,"vat_rate":12}'::jsonb;

UPDATE public.tenant_storefronts
SET cash_payment_options = jsonb_set(
      coalesce(cash_payment_options, '{}'::jsonb),
      '{cash_on_take_out_enabled}',
      coalesce(cash_payment_options->'cash_on_take_out_enabled', 'true'::jsonb),
      true
    ),
    tax_settings = '{"vat_registered":false,"prices_vat_inclusive":false,"vat_rate":12}'::jsonb
      || coalesce(tax_settings, '{}'::jsonb);

CREATE OR REPLACE FUNCTION public.system_admin_get_restaurant_settings(p_restaurant_id uuid)
RETURNS TABLE (
  cash_on_delivery_enabled boolean,
  cash_on_pickup_enabled boolean,
  cash_on_take_out_enabled boolean,
  automatic_rider_assignment_enabled boolean,
  tax_vat_registered boolean,
  tax_prices_vat_inclusive boolean,
  tax_vat_rate numeric
)
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
  RETURN QUERY
  SELECT
    coalesce((s.cash_payment_options->>'cash_on_delivery_enabled')::boolean, true),
    coalesce((s.cash_payment_options->>'cash_on_pickup_enabled')::boolean, true),
    coalesce((s.cash_payment_options->>'cash_on_take_out_enabled')::boolean, true),
    coalesce((s.rider_assignment->>'auto_assign')::boolean, false),
    coalesce((s.tax_settings->>'vat_registered')::boolean, false),
    coalesce((s.tax_settings->>'prices_vat_inclusive')::boolean, false),
    coalesce((s.tax_settings->>'vat_rate')::numeric, 12)
  FROM public.tenant_storefronts s WHERE s.tenant_id = p_restaurant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restaurant settings not found' USING ERRCODE='P0002'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.system_admin_update_restaurant_settings(
  p_restaurant_id uuid,
  p_cash_on_delivery_enabled boolean,
  p_cash_on_pickup_enabled boolean,
  p_cash_on_take_out_enabled boolean,
  p_automatic_rider_assignment_enabled boolean,
  p_tax_vat_registered boolean,
  p_tax_prices_vat_inclusive boolean,
  p_tax_vat_rate numeric
)
RETURNS TABLE (
  cash_on_delivery_enabled boolean,
  cash_on_pickup_enabled boolean,
  cash_on_take_out_enabled boolean,
  automatic_rider_assignment_enabled boolean,
  tax_vat_registered boolean,
  tax_prices_vat_inclusive boolean,
  tax_vat_rate numeric
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_email text;
  v_old jsonb;
BEGIN
  IF NOT private.is_platform_admin() OR NOT EXISTS (
    SELECT 1 FROM public.platform_admins pa
    WHERE pa.user_id = v_actor AND pa.is_active = true
      AND pa.access_level IN ('owner', 'administrator')
  ) THEN
    RAISE EXCEPTION 'Verified platform administrator with management access required' USING ERRCODE='42501';
  END IF;
  IF p_restaurant_id IS NULL OR p_cash_on_delivery_enabled IS NULL
    OR p_cash_on_pickup_enabled IS NULL OR p_cash_on_take_out_enabled IS NULL
    OR p_automatic_rider_assignment_enabled IS NULL OR p_tax_vat_registered IS NULL
    OR p_tax_prices_vat_inclusive IS NULL OR p_tax_vat_rate IS NULL
    OR p_tax_vat_rate < 0 OR p_tax_vat_rate > 100 THEN
    RAISE EXCEPTION 'Valid restaurant settings are required' USING ERRCODE='22023';
  END IF;

  SELECT jsonb_build_object(
    'cash_payment_options', s.cash_payment_options,
    'rider_assignment', s.rider_assignment,
    'tax_settings', s.tax_settings
  ) INTO v_old
  FROM public.tenant_storefronts s WHERE s.tenant_id = p_restaurant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restaurant settings not found' USING ERRCODE='P0002'; END IF;

  UPDATE public.tenant_storefronts s
  SET cash_payment_options = jsonb_set(
        jsonb_set(
          jsonb_set(coalesce(s.cash_payment_options, '{}'::jsonb), '{cash_on_delivery_enabled}', to_jsonb(p_cash_on_delivery_enabled), true),
          '{cash_on_pickup_enabled}', to_jsonb(p_cash_on_pickup_enabled), true
        ),
        '{cash_on_take_out_enabled}', to_jsonb(p_cash_on_take_out_enabled), true
      ),
      rider_assignment = jsonb_set(coalesce(s.rider_assignment, '{}'::jsonb), '{auto_assign}', to_jsonb(p_automatic_rider_assignment_enabled), true),
      tax_settings = jsonb_build_object(
        'vat_registered', p_tax_vat_registered,
        'prices_vat_inclusive', p_tax_prices_vat_inclusive,
        'vat_rate', p_tax_vat_rate
      ),
      updated_at = now()
  WHERE s.tenant_id = p_restaurant_id;

  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = v_actor;
  INSERT INTO public.system_admin_audit_logs (
    admin_user_id, admin_email, restaurant_id, event_type, action,
    entity_type, entity_id, details
  ) VALUES (
    v_actor, v_email, p_restaurant_id, 'operational_settings',
    'Updated restaurant operational controls', 'tenant_storefront',
    p_restaurant_id::text,
    jsonb_build_object(
      'previous', v_old,
      'cash_on_delivery_enabled', p_cash_on_delivery_enabled,
      'cash_on_pickup_enabled', p_cash_on_pickup_enabled,
      'cash_on_take_out_enabled', p_cash_on_take_out_enabled,
      'automatic_rider_assignment_enabled', p_automatic_rider_assignment_enabled,
      'tax_vat_registered', p_tax_vat_registered,
      'tax_prices_vat_inclusive', p_tax_prices_vat_inclusive,
      'tax_vat_rate', p_tax_vat_rate
    )
  );

  RETURN QUERY SELECT p_cash_on_delivery_enabled, p_cash_on_pickup_enabled,
    p_cash_on_take_out_enabled, p_automatic_rider_assignment_enabled,
    p_tax_vat_registered, p_tax_prices_vat_inclusive, p_tax_vat_rate;
END;
$function$;

CREATE OR REPLACE FUNCTION public.system_admin_get_online_payments_enabled(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_enabled boolean;
BEGIN
  IF NOT private.is_platform_admin() OR NOT EXISTS (
    SELECT 1 FROM public.platform_admins pa
    WHERE pa.user_id = (SELECT auth.uid()) AND pa.is_active = true
      AND pa.access_level IN ('owner', 'administrator')
  ) THEN
    RAISE EXCEPTION 'Verified platform administrator with management access required' USING ERRCODE='42501';
  END IF;
  SELECT coalesce((s.online_payments->>'enabled')::boolean, false) INTO v_enabled
  FROM public.tenant_storefronts s WHERE s.tenant_id = p_restaurant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restaurant settings not found' USING ERRCODE='P0002'; END IF;
  RETURN v_enabled;
END;
$function$;

CREATE OR REPLACE FUNCTION public.system_admin_set_online_payments_enabled(p_restaurant_id uuid, p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF NOT private.is_platform_admin() OR NOT EXISTS (
    SELECT 1 FROM public.platform_admins pa
    WHERE pa.user_id = (SELECT auth.uid()) AND pa.is_active = true
      AND pa.access_level IN ('owner', 'administrator')
  ) THEN
    RAISE EXCEPTION 'Verified platform administrator with management access required' USING ERRCODE='42501';
  END IF;
  IF p_restaurant_id IS NULL OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'Restaurant and online-payment state are required' USING ERRCODE='22023';
  END IF;
  RETURN public.system_admin_set_online_payments(p_restaurant_id, p_enabled);
END;
$function$;

REVOKE ALL ON FUNCTION public.system_admin_get_restaurant_settings(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.system_admin_update_restaurant_settings(uuid,boolean,boolean,boolean,boolean,boolean,boolean,numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.system_admin_get_online_payments_enabled(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.system_admin_set_online_payments_enabled(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.system_admin_get_restaurant_settings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.system_admin_update_restaurant_settings(uuid,boolean,boolean,boolean,boolean,boolean,boolean,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.system_admin_get_online_payments_enabled(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.system_admin_set_online_payments_enabled(uuid,boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
