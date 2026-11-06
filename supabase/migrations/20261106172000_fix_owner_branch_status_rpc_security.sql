-- The public RPC must execute as its owner so it can invoke the private
-- SECURITY DEFINER implementation. The private function still enforces
-- MFA-verified restaurant-owner membership and tenant/branch ownership.
BEGIN;
CREATE OR REPLACE FUNCTION public.update_owner_branch_accepting_orders(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_accepting_orders boolean
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.update_owner_branch_accepting_orders(
    p_tenant_id,
    p_branch_id,
    p_accepting_orders
  );
$function$;
REVOKE ALL ON FUNCTION public.update_owner_branch_accepting_orders(uuid,uuid,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_owner_branch_accepting_orders(uuid,uuid,boolean)
  TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
