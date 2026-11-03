-- Allow MFA-verified restaurant owners to remove a choice or a whole choice group.
-- Group removal explicitly removes its choices because catalog foreign keys restrict deletes.
BEGIN;

CREATE OR REPLACE FUNCTION public.delete_owner_modifier_group(
  p_tenant_id uuid,
  p_group_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF NOT private.is_active_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'MFA-verified restaurant owner required' USING ERRCODE='42501';
  END IF;

  PERFORM 1 FROM public.menu_modifier_groups
   WHERE tenant_id=p_tenant_id AND id=p_group_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customization group was not found in this restaurant' USING ERRCODE='42501';
  END IF;

  DELETE FROM public.menu_modifier_options
   WHERE tenant_id=p_tenant_id AND group_id=p_group_id;
  DELETE FROM public.menu_modifier_groups
   WHERE tenant_id=p_tenant_id AND id=p_group_id;
  RETURN true;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.delete_owner_menu_modifier_option(
  p_tenant_id uuid,
  p_option_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF NOT private.is_active_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'MFA-verified restaurant owner required' USING ERRCODE='42501';
  END IF;

  DELETE FROM public.menu_modifier_options
   WHERE tenant_id=p_tenant_id AND id=p_option_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customization choice was not found in this restaurant' USING ERRCODE='42501';
  END IF;
  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION public.delete_owner_modifier_group(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_owner_menu_modifier_option(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_owner_modifier_group(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_owner_menu_modifier_option(uuid,uuid) TO authenticated;

COMMIT;
