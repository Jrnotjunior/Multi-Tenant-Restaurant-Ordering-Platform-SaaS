-- W2T-004 defense in depth: explicit deny policies and index for composite branch FK.
BEGIN;
CREATE POLICY storefronts_no_direct_read ON public.tenant_storefronts
  FOR SELECT TO anon,authenticated USING (false);
CREATE POLICY menu_categories_no_direct_read ON public.menu_categories
  FOR SELECT TO anon,authenticated USING (false);
CREATE POLICY menu_items_no_direct_read ON public.menu_items
  FOR SELECT TO anon,authenticated USING (false);
CREATE POLICY branch_menu_items_no_direct_read ON public.branch_menu_items
  FOR SELECT TO anon,authenticated USING (false);
CREATE INDEX tenant_storefronts_branch_fk_idx ON public.tenant_storefronts(tenant_id,default_branch_id);
COMMIT;
