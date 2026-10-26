-- W2T-041: deliver tenant-safe customer order tracking notifications.
-- Broadcasts carry no order/customer details; clients refetch through track_customer_order.
BEGIN;

CREATE OR REPLACE FUNCTION private.can_subscribe_order_tracking(p_tracking_token uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.customer_orders AS o
    WHERE o.idempotency_key = p_tracking_token
  );
$function$;

REVOKE ALL ON FUNCTION private.can_subscribe_order_tracking(uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon;
GRANT EXECUTE ON FUNCTION private.can_subscribe_order_tracking(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "Customers can receive order tracking notifications" ON realtime.messages;
CREATE POLICY "Customers can receive order tracking notifications"
ON realtime.messages
FOR SELECT
TO anon, authenticated
USING (
  realtime.topic() ~ '^order-tracking:[0-9a-fA-F-]{36}$'
  AND private.can_subscribe_order_tracking(split_part(realtime.topic(), ':', 2)::uuid)
);

CREATE OR REPLACE FUNCTION private.broadcast_customer_order_tracking_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tracking_token uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_tracking_token := OLD.idempotency_key;
  ELSE
    v_tracking_token := NEW.idempotency_key;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.order_status IS NOT DISTINCT FROM NEW.order_status
     AND OLD.payment_status IS NOT DISTINCT FROM NEW.payment_status
     AND OLD.order_type IS NOT DISTINCT FROM NEW.order_type THEN
    RETURN NEW;
  END IF;

  IF v_tracking_token IS NOT NULL THEN
    PERFORM realtime.send(
      jsonb_build_object('changed', true),
      'order_changed',
      'order-tracking:' || v_tracking_token::text,
      true
    );
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

REVOKE ALL ON FUNCTION private.broadcast_customer_order_tracking_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS customer_order_tracking_realtime_notify ON public.customer_orders;
CREATE TRIGGER customer_order_tracking_realtime_notify
AFTER INSERT OR UPDATE ON public.customer_orders
FOR EACH ROW
EXECUTE FUNCTION private.broadcast_customer_order_tracking_change();

COMMIT;
