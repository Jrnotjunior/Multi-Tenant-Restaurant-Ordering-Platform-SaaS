BEGIN;

-- Allow a signed-in, active tenant owner/cashier to read only their own POS
-- entitlement so the normal cashier can conditionally show the POS entry point.
CREATE OR REPLACE FUNCTION public.get_my_pos_integration_status(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $fn$
DECLARE
  v_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships m
    WHERE m.tenant_id = p_tenant_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND m.role IN ('restaurant_owner', 'cashier')
  ) THEN
    RAISE EXCEPTION 'Active restaurant owner or cashier membership required'
      USING ERRCODE='42501';
  END IF;

  SELECT i.status INTO v_status
  FROM public.tenant_pos_integrations i
  JOIN public.tenants t ON t.id = i.tenant_id
  WHERE i.tenant_id = p_tenant_id
    AND t.status = 'active';

  RETURN jsonb_build_object(
    'tenant_id', p_tenant_id,
    'status', COALESCE(v_status, 'not_enabled')
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_my_pos_integration_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_pos_integration_status(uuid) TO authenticated;

COMMIT;
