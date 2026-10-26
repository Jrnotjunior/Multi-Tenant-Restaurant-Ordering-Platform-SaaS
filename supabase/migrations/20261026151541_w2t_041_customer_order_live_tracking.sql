-- W2T-041: customer order live tracking.
-- Tracking links are bearer capabilities: only a random UUID token is used in the public
-- channel topic and the broadcast payload contains no customer/order details. The client
-- must refetch status through track_customer_order; never trust broadcast payloads.
BEGIN;

CREATE OR REPLACE FUNCTION public.track_customer_order(p_tracking_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_order public.customer_orders%rowtype;
BEGIN
  IF p_tracking_token IS NULL THEN
    RAISE EXCEPTION 'Order tracking token is required' USING ERRCODE = '22023';
  END IF;

  SELECT o.* INTO v_order
  FROM public.customer_orders AS o
  WHERE o.idempotency_key = p_tracking_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'order_number', v_order.order_number,
    'order_status', v_order.order_status,
    'payment_status', v_order.payment_status,
    'order_type', v_order.order_type,
    'created_at', v_order.created_at,
    'updated_at', v_order.updated_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.track_customer_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_customer_order(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.broadcast_customer_order_tracking_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_order public.customer_orders%rowtype;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_order := OLD;
  ELSE
    v_order := NEW;
  END IF;

  -- Public/private mode must match the anonymous customer tracking client.
  -- The token is a high-entropy UUID; event payload deliberately reveals no order data.
  PERFORM realtime.send(
    jsonb_build_object('changed', true),
    'order_changed',
    'order-tracking:' || v_order.idempotency_key::text,
    false
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

REVOKE ALL ON FUNCTION private.broadcast_customer_order_tracking_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS customer_order_tracking_notify ON public.customer_orders;
CREATE TRIGGER customer_order_tracking_notify
AFTER INSERT OR UPDATE ON public.customer_orders
FOR EACH ROW
EXECUTE FUNCTION private.broadcast_customer_order_tracking_change();

COMMIT;
