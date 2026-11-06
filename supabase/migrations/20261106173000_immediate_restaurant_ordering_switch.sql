-- Persist the restaurant-wide emergency ordering switch immediately.
BEGIN;
CREATE OR REPLACE FUNCTION private.update_owner_storefront_accepting_orders(
  p_tenant_id uuid,
  p_accepting_orders boolean
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF NOT private.is_active_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'MFA-verified restaurant owner required' USING ERRCODE='42501';
  END IF;
  IF p_accepting_orders IS NULL THEN
    RAISE EXCEPTION 'A store status is required' USING ERRCODE='22023';
  END IF;
  UPDATE public.tenant_storefronts
  SET accepting_orders=p_accepting_orders,updated_at=now()
  WHERE tenant_id=p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restaurant storefront not found' USING ERRCODE='P0002'; END IF;
  RETURN true;
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_owner_storefront_accepting_orders(
  p_tenant_id uuid,p_accepting_orders boolean
)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT private.update_owner_storefront_accepting_orders(p_tenant_id,p_accepting_orders);
$function$;
REVOKE ALL ON FUNCTION private.update_owner_storefront_accepting_orders(uuid,boolean),
  public.update_owner_storefront_accepting_orders(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_owner_storefront_accepting_orders(uuid,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
