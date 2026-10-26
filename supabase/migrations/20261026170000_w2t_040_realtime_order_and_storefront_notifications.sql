-- W2T-040: secure tenant-scoped Realtime notifications for operational workspaces
-- Notifications contain metadata only. Clients always reload authorized RPC data.
BEGIN;

CREATE OR REPLACE FUNCTION private.broadcast_tenant_realtime_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tenant_id uuid;
  v_tenant_slug text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_tenant_id := OLD.tenant_id;
  ELSE
    v_tenant_id := NEW.tenant_id;
  END IF;

  IF v_tenant_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- Private tenant channel: only active, MFA-verified tenant members may subscribe.
  PERFORM realtime.send(
    jsonb_build_object('tenant_id', v_tenant_id, 'table', TG_TABLE_NAME, 'operation', TG_OP),
    'db_change',
    'tenant:' || v_tenant_id::text,
    true
  );

  -- Public storefront channel carries only a refresh signal, never order/customer data.
  IF TG_TABLE_NAME IN ('menu_items', 'branch_menu_items', 'tenant_storefronts') THEN
    SELECT t.slug INTO v_tenant_slug FROM public.tenants AS t WHERE t.id = v_tenant_id;
    IF v_tenant_slug IS NOT NULL THEN
      PERFORM realtime.send(
        jsonb_build_object('tenant_slug', v_tenant_slug, 'table', TG_TABLE_NAME, 'operation', TG_OP),
        'menu_changed',
        'storefront:' || v_tenant_slug,
        false
      );
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

REVOKE ALL ON FUNCTION private.broadcast_tenant_realtime_change() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Tenant members can receive tenant realtime notifications" ON realtime.messages;
CREATE POLICY "Tenant members can receive tenant realtime notifications"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  CASE
    WHEN realtime.topic() ~ '^tenant:[0-9a-fA-F-]{36}$'
    THEN private.is_active_member(split_part(realtime.topic(), ':', 2)::uuid)
    ELSE false
  END
);

DROP TRIGGER IF EXISTS customer_orders_realtime_notify ON public.customer_orders;
CREATE TRIGGER customer_orders_realtime_notify
AFTER INSERT OR UPDATE OR DELETE ON public.customer_orders
FOR EACH ROW EXECUTE FUNCTION private.broadcast_tenant_realtime_change();

DROP TRIGGER IF EXISTS delivery_assignments_realtime_notify ON public.delivery_assignments;
CREATE TRIGGER delivery_assignments_realtime_notify
AFTER INSERT OR UPDATE OR DELETE ON public.delivery_assignments
FOR EACH ROW EXECUTE FUNCTION private.broadcast_tenant_realtime_change();

DROP TRIGGER IF EXISTS menu_items_realtime_notify ON public.menu_items;
CREATE TRIGGER menu_items_realtime_notify
AFTER INSERT OR UPDATE OR DELETE ON public.menu_items
FOR EACH ROW EXECUTE FUNCTION private.broadcast_tenant_realtime_change();

DROP TRIGGER IF EXISTS branch_menu_items_realtime_notify ON public.branch_menu_items;
CREATE TRIGGER branch_menu_items_realtime_notify
AFTER INSERT OR UPDATE OR DELETE ON public.branch_menu_items
FOR EACH ROW EXECUTE FUNCTION private.broadcast_tenant_realtime_change();

DROP TRIGGER IF EXISTS tenant_storefronts_realtime_notify ON public.tenant_storefronts;
CREATE TRIGGER tenant_storefronts_realtime_notify
AFTER INSERT OR UPDATE OR DELETE ON public.tenant_storefronts
FOR EACH ROW EXECUTE FUNCTION private.broadcast_tenant_realtime_change();

COMMIT;
