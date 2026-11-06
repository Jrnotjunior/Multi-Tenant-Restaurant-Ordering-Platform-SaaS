-- Expose only the operating-hours configuration needed by authenticated staff sales reporting.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_staff_sales_schedule(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_hours jsonb;
BEGIN
  IF v_user IS NULL OR NOT private.privileged_session_verified() THEN
    RAISE EXCEPTION 'Verified MFA session required' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships m
    WHERE m.tenant_id=p_tenant_id AND m.user_id=v_user
      AND m.status='active'
      AND m.role IN ('restaurant_owner','cashier')
  ) THEN
    RAISE EXCEPTION 'Active cashier or restaurant owner access required' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.branch_memberships bm
    WHERE bm.tenant_id=p_tenant_id AND bm.user_id=v_user
  ) AND NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships m
    WHERE m.tenant_id=p_tenant_id AND m.user_id=v_user
      AND m.role='restaurant_owner' AND m.status='active'
  ) THEN
    RAISE EXCEPTION 'Active branch assignment required' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(ts.opening_hours, '{}'::jsonb) INTO v_hours
  FROM public.tenant_storefronts ts WHERE ts.tenant_id=p_tenant_id;
  RETURN coalesce(v_hours, '{}'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public.get_staff_sales_schedule(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_staff_sales_schedule(uuid) TO authenticated;
COMMIT;
