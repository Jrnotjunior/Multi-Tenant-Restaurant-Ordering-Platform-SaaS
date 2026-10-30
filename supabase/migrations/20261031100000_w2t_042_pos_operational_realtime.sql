-- W2T-042: notify tenant POS clients when sales or cashier shifts change.
-- Broadcasts are metadata-only; POS clients reload through the authorized POS API.
BEGIN;

DROP TRIGGER IF EXISTS pos_sales_realtime_notify ON public.pos_sales;
CREATE TRIGGER pos_sales_realtime_notify
AFTER INSERT OR UPDATE OR DELETE ON public.pos_sales
FOR EACH ROW EXECUTE FUNCTION private.broadcast_tenant_realtime_change();

DROP TRIGGER IF EXISTS pos_cashier_shifts_realtime_notify ON public.pos_cashier_shifts;
CREATE TRIGGER pos_cashier_shifts_realtime_notify
AFTER INSERT OR UPDATE OR DELETE ON public.pos_cashier_shifts
FOR EACH ROW EXECUTE FUNCTION private.broadcast_tenant_realtime_change();

COMMIT;
