-- Branch provisioning and lifecycle are platform-admin responsibilities.
-- A verified domain resolves to a public restaurant slug; branch resolution
-- continues through the existing branch-aware published storefront RPC.
BEGIN;

CREATE FUNCTION private.system_admin_create_branch(
  p_tenant_id uuid, p_slug text, p_name text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_branch uuid;
BEGIN
  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'MFA-verified platform administrator required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id AND t.status = 'active') THEN
    RAISE EXCEPTION 'Active restaurant required' USING ERRCODE = '42501';
  END IF;
  IF v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(v_slug) NOT BETWEEN 2 AND 64
     OR length(v_name) NOT BETWEEN 2 AND 160 THEN
    RAISE EXCEPTION 'Invalid branch slug or name' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.tenants t WHERE t.id = p_tenant_id FOR UPDATE;
  IF (SELECT count(*) FROM public.branches b WHERE b.tenant_id = p_tenant_id) >= 20 THEN
    RAISE EXCEPTION 'Maximum of 20 branches reached' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.branches(tenant_id, slug, name, is_active)
  VALUES (p_tenant_id, v_slug, v_name, false) RETURNING id INTO v_branch;
  RETURN v_branch;
END;
$fn$;

CREATE FUNCTION private.system_admin_update_branch(
  p_tenant_id uuid, p_branch_id uuid, p_name text, p_active boolean
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
  v_is_default boolean;
BEGIN
  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'MFA-verified platform administrator required' USING ERRCODE = '42501';
  END IF;
  IF length(v_name) NOT BETWEEN 2 AND 160 OR p_active IS NULL THEN
    RAISE EXCEPTION 'Invalid branch details' USING ERRCODE = '22023';
  END IF;
  SELECT s.default_branch_id = p_branch_id INTO v_is_default
  FROM public.tenant_storefronts s WHERE s.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restaurant storefront unavailable' USING ERRCODE = '42501'; END IF;
  IF v_is_default AND NOT p_active THEN
    RAISE EXCEPTION 'Default branch cannot be disabled' USING ERRCODE = '23514';
  END IF;
  UPDATE public.branches SET name = v_name, is_active = p_active
  WHERE tenant_id = p_tenant_id AND id = p_branch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Branch not found' USING ERRCODE = '42501'; END IF;
  RETURN true;
END;
$fn$;

CREATE FUNCTION public.system_admin_create_branch(p_tenant_id uuid, p_slug text, p_name text)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$ SELECT private.system_admin_create_branch(p_tenant_id, p_slug, p_name); $fn$;
CREATE FUNCTION public.system_admin_update_branch(p_tenant_id uuid, p_branch_id uuid, p_name text, p_active boolean)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$ SELECT private.system_admin_update_branch(p_tenant_id, p_branch_id, p_name, p_active); $fn$;

REVOKE ALL ON FUNCTION private.system_admin_create_branch(uuid, text, text),
  private.system_admin_update_branch(uuid, uuid, text, boolean),
  public.system_admin_create_branch(uuid, text, text),
  public.system_admin_update_branch(uuid, uuid, text, boolean)
  FROM PUBLIC, anon, authenticated;
-- Disable the previously exposed owner mutation entry points. Keep the
-- functions for migration compatibility, but no authenticated client can call them.
REVOKE ALL ON FUNCTION private.create_owner_branch(uuid, text, text),
  private.update_owner_branch(uuid, uuid, text, boolean),
  public.create_owner_branch(uuid, text, text),
  public.update_owner_branch(uuid, uuid, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.system_admin_create_branch(uuid, text, text),
  private.system_admin_update_branch(uuid, uuid, text, boolean),
  public.system_admin_create_branch(uuid, text, text),
  public.system_admin_update_branch(uuid, uuid, text, boolean) TO authenticated;

CREATE FUNCTION private.resolve_public_storefront_domain(p_hostname text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
  SELECT coalesce((
    SELECT jsonb_build_object(
      'matched', true,
      'slug', CASE WHEN d.status = 'active' AND d.verified_at IS NOT NULL
        AND t.status = 'active' AND s.status = 'published' THEN t.slug ELSE NULL END
    )
    FROM public.tenant_domains d
    JOIN public.tenants t ON t.id = d.tenant_id
    LEFT JOIN public.tenant_storefronts s ON s.tenant_id = t.id
    WHERE d.hostname = lower(btrim(coalesce(p_hostname, '')))
    LIMIT 1
  ), jsonb_build_object('matched', false, 'slug', NULL));
$fn$;
CREATE FUNCTION public.resolve_public_storefront_domain(p_hostname text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $fn$ SELECT private.resolve_public_storefront_domain(p_hostname); $fn$;
REVOKE ALL ON FUNCTION private.resolve_public_storefront_domain(text),
  public.resolve_public_storefront_domain(text) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION private.resolve_public_storefront_domain(text),
  public.resolve_public_storefront_domain(text) TO anon, authenticated;

COMMIT;
