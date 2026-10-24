-- W2T-019: safely delete tenant-owned menu items through an owner-checked RPC.
-- W2T-019: allow MFA-verified restaurant owners to delete only their own menu items.
-- Child records are deleted explicitly because the composite tenant keys intentionally RESTRICT cascades.
BEGIN;

CREATE OR REPLACE FUNCTION public.delete_owner_menu_item(
  p_tenant_id uuid,
  p_item_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF NOT private.is_active_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'MFA-verified restaurant owner required' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.menu_items
  WHERE tenant_id = p_tenant_id AND id = p_item_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Menu item was not found in this restaurant' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.menu_modifier_options
   WHERE tenant_id = p_tenant_id AND item_id = p_item_id;
  DELETE FROM public.menu_modifier_groups
   WHERE tenant_id = p_tenant_id AND item_id = p_item_id;
  DELETE FROM public.branch_menu_items
   WHERE tenant_id = p_tenant_id AND item_id = p_item_id;
  DELETE FROM public.menu_items
   WHERE tenant_id = p_tenant_id AND id = p_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Menu item could not be deleted' USING ERRCODE = '40001';
  END IF;
  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION public.delete_owner_menu_item(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_owner_menu_item(uuid,uuid) TO authenticated;

COMMIT;
