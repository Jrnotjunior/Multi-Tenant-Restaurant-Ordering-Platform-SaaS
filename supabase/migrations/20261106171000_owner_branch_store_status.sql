-- Secure owner-controlled per-branch ordering switch.
BEGIN;
CREATE OR REPLACE FUNCTION private.update_owner_branch_accepting_orders(p_tenant_id uuid,p_branch_id uuid,p_accepting_orders boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
BEGIN
  IF NOT private.is_active_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'MFA-verified restaurant owner required' USING ERRCODE='42501';
  END IF;
  IF p_branch_id IS NULL OR p_accepting_orders IS NULL THEN
    RAISE EXCEPTION 'A branch and store status are required' USING ERRCODE='22023';
  END IF;
  UPDATE public.branches SET accepting_orders=p_accepting_orders
  WHERE tenant_id=p_tenant_id AND id=p_branch_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active branch not found in your restaurant' USING ERRCODE='42501'; END IF;
  RETURN true;
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_owner_branch_accepting_orders(p_tenant_id uuid,p_branch_id uuid,p_accepting_orders boolean)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $function$ SELECT private.update_owner_branch_accepting_orders(p_tenant_id,p_branch_id,p_accepting_orders); $function$;
REVOKE ALL ON FUNCTION private.update_owner_branch_accepting_orders(uuid,uuid,boolean),
  public.update_owner_branch_accepting_orders(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_owner_branch_accepting_orders(uuid,uuid,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;