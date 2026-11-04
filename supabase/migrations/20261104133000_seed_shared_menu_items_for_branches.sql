-- The menu catalog is tenant-wide. Give every branch an assignment for each
-- menu item so storefronts can show the shared catalog and kitchen staff can
-- control availability independently per branch.

CREATE OR REPLACE FUNCTION private.seed_branch_menu_items_for_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.branch_menu_items(tenant_id, branch_id, item_id, is_available)
  SELECT NEW.tenant_id, NEW.id, item.id, false
  FROM public.menu_items AS item
  WHERE item.tenant_id = NEW.tenant_id
  ON CONFLICT (tenant_id, branch_id, item_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.seed_branch_menu_items_for_menu_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.branch_menu_items(tenant_id, branch_id, item_id, is_available)
  SELECT NEW.tenant_id, branch.id, NEW.id, false
  FROM public.branches AS branch
  WHERE branch.tenant_id = NEW.tenant_id
  ON CONFLICT (tenant_id, branch_id, item_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.seed_branch_menu_items_for_branch() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.seed_branch_menu_items_for_menu_item() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS branches_seed_menu_items ON public.branches;
CREATE TRIGGER branches_seed_menu_items
AFTER INSERT ON public.branches
FOR EACH ROW EXECUTE FUNCTION private.seed_branch_menu_items_for_branch();

DROP TRIGGER IF EXISTS menu_items_seed_branch_assignments ON public.menu_items;
CREATE TRIGGER menu_items_seed_branch_assignments
AFTER INSERT ON public.menu_items
FOR EACH ROW EXECUTE FUNCTION private.seed_branch_menu_items_for_menu_item();

INSERT INTO public.branch_menu_items(tenant_id, branch_id, item_id, is_available)
SELECT item.tenant_id, branch.id, item.id, false
FROM public.menu_items AS item
JOIN public.branches AS branch ON branch.tenant_id = item.tenant_id
ON CONFLICT (tenant_id, branch_id, item_id) DO NOTHING;
