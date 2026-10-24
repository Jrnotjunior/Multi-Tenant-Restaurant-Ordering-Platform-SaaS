-- W2T-005 follow-up: compare table-specific row identities without
-- referencing non-existent record fields in a shared PL/pgSQL trigger.
BEGIN;
CREATE OR REPLACE FUNCTION private.reject_catalog_identity_change()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  previous jsonb := to_jsonb(OLD);
  current jsonb := to_jsonb(NEW);
BEGIN
  IF previous->'tenant_id' IS DISTINCT FROM current->'tenant_id' THEN
    RAISE EXCEPTION 'Tenant identity is immutable' USING ERRCODE='42501';
  END IF;
  IF TG_TABLE_NAME IN ('menu_categories','menu_items')
     AND previous->'id' IS DISTINCT FROM current->'id' THEN
    RAISE EXCEPTION 'Catalog record identity is immutable' USING ERRCODE='42501';
  END IF;
  IF TG_TABLE_NAME = 'tenant_storefronts'
     AND previous->'default_branch_id' IS DISTINCT FROM current->'default_branch_id' THEN
    RAISE EXCEPTION 'Default branch cannot be reassigned here' USING ERRCODE='42501';
  END IF;
  IF TG_TABLE_NAME = 'branch_menu_items'
     AND (previous->'branch_id' IS DISTINCT FROM current->'branch_id'
       OR previous->'item_id' IS DISTINCT FROM current->'item_id') THEN
    RAISE EXCEPTION 'Branch product identity is immutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$fn$;
COMMIT;
