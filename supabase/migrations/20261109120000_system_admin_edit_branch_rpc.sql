-- Allow verified System Administrators to correct a branch name or customer-facing slug.
-- Updating the branch row in place preserves its ID, activation state, and branch settings.
BEGIN;

CREATE OR REPLACE FUNCTION private.system_admin_edit_branch(
  p_tenant_id uuid, p_branch_id uuid, p_slug text, p_name text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_name text := btrim(coalesce(p_name, ''));
BEGIN
  IF NOT private.can_manage_platform_branches() THEN
    RAISE EXCEPTION 'MFA-verified System Administrator with branch-management access required' USING ERRCODE = '42501';
  END IF;
  IF p_tenant_id IS NULL OR p_branch_id IS NULL
     OR length(v_slug) NOT BETWEEN 2 AND 64
     OR v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     OR length(v_name) NOT BETWEEN 2 AND 160 THEN
    RAISE EXCEPTION 'Invalid branch slug or name' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.tenant_storefronts s
  WHERE s.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurant storefront unavailable' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.branches b
  WHERE b.tenant_id = p_tenant_id AND b.id = p_branch_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Branch not found' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.tenant_id = p_tenant_id AND b.slug = v_slug AND b.id <> p_branch_id
  ) THEN
    RAISE EXCEPTION 'That URL slug is already used by another branch in this restaurant.' USING ERRCODE = '23505';
  END IF;

  UPDATE public.branches
  SET slug = v_slug, name = v_name
  WHERE tenant_id = p_tenant_id AND id = p_branch_id;
  RETURN true;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.system_admin_edit_branch(
  p_tenant_id uuid, p_branch_id uuid, p_slug text, p_name text
) RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $fn$
  SELECT private.system_admin_edit_branch(p_tenant_id, p_branch_id, p_slug, p_name);
$fn$;

REVOKE ALL ON FUNCTION private.system_admin_edit_branch(uuid, uuid, text, text),
  public.system_admin_edit_branch(uuid, uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.system_admin_edit_branch(uuid, uuid, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.system_admin_edit_branch(uuid, uuid, text, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

