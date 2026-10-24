-- W2T-005: controlled initial restaurant provisioning and tenant-owner menu CRUD.
-- No owner/admin account bootstrap and no emails are sent by this migration.
BEGIN;

-- Permit platform admins to see tenant identities for provisioning only.
CREATE POLICY tenants_select_platform_admin ON public.tenants
FOR SELECT TO authenticated USING (private.is_platform_admin());

-- Existing public menus continue to be served by read-only get_published_storefront.
-- Owners may read and modify *only their tenant* after verified AAL2.
DROP POLICY IF EXISTS storefronts_no_direct_read ON public.tenant_storefronts;
DROP POLICY IF EXISTS menu_categories_no_direct_read ON public.menu_categories;
DROP POLICY IF EXISTS menu_items_no_direct_read ON public.menu_items;
DROP POLICY IF EXISTS branch_menu_items_no_direct_read ON public.branch_menu_items;

CREATE POLICY storefronts_owner_select ON public.tenant_storefronts
FOR SELECT TO authenticated USING (private.is_active_owner(tenant_id));
CREATE POLICY storefronts_owner_update ON public.tenant_storefronts
FOR UPDATE TO authenticated
USING (private.is_active_owner(tenant_id))
WITH CHECK (private.is_active_owner(tenant_id));

CREATE POLICY categories_owner_select ON public.menu_categories
FOR SELECT TO authenticated USING (private.is_active_owner(tenant_id));
CREATE POLICY categories_owner_insert ON public.menu_categories
FOR INSERT TO authenticated WITH CHECK (private.is_active_owner(tenant_id));
CREATE POLICY categories_owner_update ON public.menu_categories
FOR UPDATE TO authenticated
USING (private.is_active_owner(tenant_id))
WITH CHECK (private.is_active_owner(tenant_id));

CREATE POLICY items_owner_select ON public.menu_items
FOR SELECT TO authenticated USING (private.is_active_owner(tenant_id));
CREATE POLICY items_owner_insert ON public.menu_items
FOR INSERT TO authenticated WITH CHECK (private.is_active_owner(tenant_id));
CREATE POLICY items_owner_update ON public.menu_items
FOR UPDATE TO authenticated
USING (private.is_active_owner(tenant_id))
WITH CHECK (private.is_active_owner(tenant_id));

CREATE POLICY branch_items_owner_select ON public.branch_menu_items
FOR SELECT TO authenticated USING (private.is_active_owner(tenant_id));
CREATE POLICY branch_items_owner_insert ON public.branch_menu_items
FOR INSERT TO authenticated WITH CHECK (private.is_active_owner(tenant_id));
CREATE POLICY branch_items_owner_update ON public.branch_menu_items
FOR UPDATE TO authenticated
USING (private.is_active_owner(tenant_id))
WITH CHECK (private.is_active_owner(tenant_id));

GRANT SELECT, UPDATE ON TABLE public.tenant_storefronts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.menu_categories, public.menu_items,
  public.branch_menu_items TO authenticated;

-- Prevent changing tenant or identity of existing rows: even a multi-tenant owner
-- cannot silently move categories/items/branch associations between restaurants.
CREATE FUNCTION private.reject_catalog_identity_change()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
BEGIN
  IF TG_TABLE_NAME = 'tenant_storefronts' AND
    (OLD.tenant_id, OLD.default_branch_id) IS DISTINCT FROM (NEW.tenant_id, NEW.default_branch_id)
  THEN RAISE EXCEPTION 'Storefront identity is immutable' USING ERRCODE='42501';
  ELSIF TG_TABLE_NAME = 'menu_categories' AND
    (OLD.id, OLD.tenant_id) IS DISTINCT FROM (NEW.id, NEW.tenant_id)
  THEN RAISE EXCEPTION 'Category identity is immutable' USING ERRCODE='42501';
  ELSIF TG_TABLE_NAME = 'menu_items' AND
    (OLD.id,OLD.tenant_id) IS DISTINCT FROM (NEW.id,NEW.tenant_id)
  THEN RAISE EXCEPTION 'Menu item identity is immutable' USING ERRCODE='42501';
  ELSIF TG_TABLE_NAME = 'branch_menu_items' AND
    (OLD.tenant_id,OLD.branch_id,OLD.item_id) IS DISTINCT FROM (NEW.tenant_id,NEW.branch_id,NEW.item_id)
  THEN RAISE EXCEPTION 'Branch item identity is immutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.reject_catalog_identity_change() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER storefront_identity_guard BEFORE UPDATE ON public.tenant_storefronts
FOR EACH ROW EXECUTE FUNCTION private.reject_catalog_identity_change();
CREATE TRIGGER category_identity_guard BEFORE UPDATE ON public.menu_categories
FOR EACH ROW EXECUTE FUNCTION private.reject_catalog_identity_change();
CREATE TRIGGER item_identity_guard BEFORE UPDATE ON public.menu_items
FOR EACH ROW EXECUTE FUNCTION private.reject_catalog_identity_change();
CREATE TRIGGER branch_item_identity_guard BEFORE UPDATE ON public.branch_menu_items
FOR EACH ROW EXECUTE FUNCTION private.reject_catalog_identity_change();

-- Initial tenant creation is atomic, guarded by an active platform-admin and AAL2.
-- An owner must be invited through the separately protected invitation process.
CREATE FUNCTION private.admin_create_restaurant(
  p_slug text, p_name text, p_branch_slug text, p_branch_name text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_tenant_id uuid;
  v_branch_id uuid;
  v_slug text := lower(btrim(coalesce(p_slug,'')));
  v_name text := btrim(coalesce(p_name,''));
  v_branch_slug text := lower(btrim(coalesce(p_branch_slug,'')));
  v_branch_name text := btrim(coalesce(p_branch_name,''));
BEGIN
  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Verified platform administrator required' USING ERRCODE='42501';
  END IF;
  IF v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     OR length(v_slug) NOT BETWEEN 3 AND 64
     OR v_slug IN ('baryo-kitchen','admin','order','restaurant','api','www')
     OR v_branch_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     OR length(v_branch_slug) NOT BETWEEN 2 AND 64
     OR length(v_name) NOT BETWEEN 2 AND 160
     OR length(v_branch_name) NOT BETWEEN 2 AND 160 THEN
    RAISE EXCEPTION 'Invalid restaurant or branch details' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.tenants(slug,name,status)
    VALUES(v_slug,v_name,'active') RETURNING id INTO v_tenant_id;
  INSERT INTO public.branches(tenant_id,slug,name,is_active)
    VALUES(v_tenant_id,v_branch_slug,v_branch_name,true) RETURNING id INTO v_branch_id;
  INSERT INTO public.tenant_storefronts(tenant_id,default_branch_id,display_name,status)
    VALUES(v_tenant_id,v_branch_id,v_name,'draft');
  RETURN v_tenant_id;
END;
$fn$;

REVOKE ALL ON FUNCTION private.admin_create_restaurant(text,text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.admin_create_restaurant(text,text,text,text) TO authenticated;
CREATE FUNCTION public.admin_create_restaurant(
  p_slug text, p_name text, p_branch_slug text, p_branch_name text
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$
 SELECT private.admin_create_restaurant(p_slug,p_name,p_branch_slug,p_branch_name);
$fn$;
REVOKE ALL ON FUNCTION public.admin_create_restaurant(text,text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_restaurant(text,text,text,text) TO authenticated;

COMMIT;
