-- W2T-006 Multi-branch menu selection and owner branch management.
-- All new privileged implementations are private and MFA/tenant-owner guarded.
BEGIN;

CREATE INDEX IF NOT EXISTS branches_tenant_active_slug_idx
  ON public.branches(tenant_id, is_active, slug);

CREATE FUNCTION private.create_owner_branch(
 p_tenant_id uuid, p_slug text, p_name text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
 v_slug text := lower(btrim(coalesce(p_slug,'')));
 v_name text := btrim(coalesce(p_name,''));
 v_branch uuid;
BEGIN
 IF NOT private.is_active_owner(p_tenant_id) THEN
  RAISE EXCEPTION 'MFA-verified restaurant owner required' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.status='active') THEN
  RAISE EXCEPTION 'Restaurant is not active' USING ERRCODE='42501';
 END IF;
 IF v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(v_slug) NOT BETWEEN 2 AND 64
    OR length(v_name) NOT BETWEEN 2 AND 160 THEN
  RAISE EXCEPTION 'Invalid branch slug or name' USING ERRCODE='22023';
 END IF;
 -- Serialize branch additions for this restaurant so the count limit is reliable.
 PERFORM 1 FROM public.tenants t WHERE t.id=p_tenant_id FOR UPDATE;
 IF (SELECT count(*) FROM public.branches b WHERE b.tenant_id=p_tenant_id) >= 20 THEN
  RAISE EXCEPTION 'Maximum of 20 branches reached' USING ERRCODE='23514';
 END IF;
 INSERT INTO public.branches(tenant_id,slug,name,is_active)
 VALUES (p_tenant_id,v_slug,v_name,false) RETURNING id INTO v_branch;
 RETURN v_branch;
END;
$fn$;

CREATE FUNCTION private.update_owner_branch(
 p_tenant_id uuid, p_branch_id uuid, p_name text, p_active boolean
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
 v_name text := btrim(coalesce(p_name,''));
 v_is_default boolean;
BEGIN
 IF NOT private.is_active_owner(p_tenant_id) THEN
  RAISE EXCEPTION 'MFA-verified restaurant owner required' USING ERRCODE='42501';
 END IF;
 IF length(v_name) NOT BETWEEN 2 AND 160 OR p_active IS NULL THEN
  RAISE EXCEPTION 'Invalid branch details' USING ERRCODE='22023';
 END IF;
 SELECT (s.default_branch_id=p_branch_id) INTO v_is_default
 FROM public.tenant_storefronts s WHERE s.tenant_id=p_tenant_id FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Restaurant storefront unavailable' USING ERRCODE='42501';
 END IF;
 IF v_is_default AND NOT p_active THEN
  RAISE EXCEPTION 'Default branch cannot be disabled' USING ERRCODE='23514';
 END IF;
 UPDATE public.branches SET name=v_name,is_active=p_active
 WHERE tenant_id=p_tenant_id AND id=p_branch_id;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Branch not found in your restaurant' USING ERRCODE='42501';
 END IF;
 RETURN true;
END;
$fn$;

CREATE FUNCTION public.create_owner_branch(
 p_tenant_id uuid, p_slug text, p_name text
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$
 SELECT private.create_owner_branch(p_tenant_id,p_slug,p_name);
$fn$;

CREATE FUNCTION public.update_owner_branch(
 p_tenant_id uuid, p_branch_id uuid, p_name text, p_active boolean
) RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$
 SELECT private.update_owner_branch(p_tenant_id,p_branch_id,p_name,p_active);
$fn$;

-- Whitelist public fields. Return null for suspended/unpublished tenant or
-- invalid/inactive branch; never silently fall back to another branch.
CREATE FUNCTION private.get_branch_storefront(
 p_slug text, p_branch_slug text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_tenant uuid;
 v_branch uuid;
 v_base jsonb;
 v_items jsonb;
 v_branches jsonb;
 v_branch_name text;
 v_branch_slug text;
BEGIN
 IF p_slug IS NULL OR length(p_slug) NOT BETWEEN 3 AND 64
    OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    OR (p_branch_slug IS NOT NULL AND
      (length(p_branch_slug) NOT BETWEEN 2 AND 64
       OR p_branch_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$')) THEN
  RETURN NULL;
 END IF;
 -- Existing whitelisted RPC must succeed; it checks active tenant,
 -- published storefront and active default branch.
 v_base := private.get_published_storefront(p_slug);
 IF v_base IS NULL THEN RETURN NULL; END IF;

 SELECT t.id,b.id,b.name,b.slug INTO v_tenant,v_branch,v_branch_name,v_branch_slug
 FROM public.tenants t
 JOIN public.tenant_storefronts s ON s.tenant_id=t.id
 JOIN public.branches b ON b.tenant_id=t.id AND b.is_active
 WHERE t.slug=p_slug AND t.status='active' AND s.status='published'
 AND (p_branch_slug IS NULL AND b.id=s.default_branch_id
      OR p_branch_slug IS NOT NULL AND b.slug=p_branch_slug);
 IF v_branch IS NULL THEN RETURN NULL; END IF;

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'slug',listed.slug,'name',listed.name
 ) ORDER BY listed.name,listed.slug),'[]'::jsonb) INTO v_branches
 FROM (
  SELECT b.slug,b.name FROM public.branches b
  WHERE b.tenant_id=v_tenant AND b.is_active
  ORDER BY b.name,b.slug LIMIT 20
 ) listed;

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'id',i.id,'categoryId',i.category_id,'name',i.name,
   'description',i.description,
   'priceCentavos',coalesce(bm.price_override_centavos,i.price_centavos),
   'popular',i.is_popular
 ) ORDER BY c.sort_order,i.sort_order,i.name,i.id),'[]'::jsonb)
 INTO v_items
 FROM (
  SELECT mi.* FROM public.menu_items mi
  JOIN public.menu_categories mc ON mc.id=mi.category_id AND mc.tenant_id=mi.tenant_id
  JOIN public.branch_menu_items bi ON bi.item_id=mi.id AND bi.tenant_id=mi.tenant_id
     AND bi.branch_id=v_branch AND bi.is_available
  WHERE mi.tenant_id=v_tenant AND mi.status='published' AND mc.is_published
  ORDER BY mc.sort_order,mi.sort_order,mi.name,mi.id LIMIT 200
 ) i
 JOIN public.menu_categories c ON c.id=i.category_id AND c.tenant_id=i.tenant_id
 JOIN public.branch_menu_items bm ON bm.tenant_id=i.tenant_id
   AND bm.branch_id=v_branch AND bm.item_id=i.id;

 RETURN v_base || jsonb_build_object(
  'branchSlug',v_branch_slug,
  'branchName',v_branch_name,
  'branches',v_branches,
  'items',v_items
 );
END;
$fn$;

CREATE FUNCTION public.get_branch_storefront(
 p_slug text, p_branch_slug text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
 SELECT private.get_branch_storefront(p_slug,p_branch_slug);
$fn$;

REVOKE ALL ON FUNCTION private.create_owner_branch(uuid,text,text),
 private.update_owner_branch(uuid,uuid,text,boolean),
 private.get_branch_storefront(text,text),
 public.create_owner_branch(uuid,text,text),
 public.update_owner_branch(uuid,uuid,text,boolean),
 public.get_branch_storefront(text,text) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION private.create_owner_branch(uuid,text,text),
 private.update_owner_branch(uuid,uuid,text,boolean),
 public.create_owner_branch(uuid,text,text),
 public.update_owner_branch(uuid,uuid,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_branch_storefront(text,text),
 public.get_branch_storefront(text,text) TO anon,authenticated;

COMMIT;
