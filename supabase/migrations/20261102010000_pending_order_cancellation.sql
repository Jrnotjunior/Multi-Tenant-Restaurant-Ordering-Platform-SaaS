-- Cancellation is only available before cashier confirmation sends an order to the kitchen.
BEGIN;

CREATE OR REPLACE FUNCTION private.enforce_pending_customer_order_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.order_status = 'cancelled' AND OLD.order_status IS DISTINCT FROM 'cancelled' THEN
    IF OLD.order_status <> 'pending_confirmation' THEN
      RAISE EXCEPTION 'Orders can only be cancelled before cashier confirmation.' USING ERRCODE = '22023';
    END IF;

    IF OLD.payment_status = 'paid'
      OR NEW.payment_status = 'paid'
      OR EXISTS (
        SELECT 1
        FROM public.customer_order_payment_sessions AS payment_session
        WHERE payment_session.tenant_id = OLD.tenant_id
          AND payment_session.order_id = OLD.id
          AND (
            payment_session.status IN ('creating', 'active', 'paid')
            OR (payment_session.status = 'failed' AND payment_session.checkout_session_id IS NOT NULL)
          )
      ) THEN
      RAISE EXCEPTION 'Resolve the online payment before cancelling this order.' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.enforce_pending_customer_order_cancellation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS customer_order_pending_cancellation_guard ON public.customer_orders;
CREATE TRIGGER customer_order_pending_cancellation_guard
BEFORE UPDATE OF order_status ON public.customer_orders
FOR EACH ROW
EXECUTE FUNCTION private.enforce_pending_customer_order_cancellation();

CREATE OR REPLACE FUNCTION public.authorize_staff_order_cancellation(
  p_tenant_id uuid,
  p_order_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_role text;
  v_order public.customer_orders%rowtype;
BEGIN
  IF v_user IS NULL OR NOT private.privileged_session_verified() THEN
    RAISE EXCEPTION 'Verified MFA session required' USING ERRCODE = '42501';
  END IF;

  SELECT membership.role INTO v_role
  FROM public.tenant_memberships AS membership
  WHERE membership.tenant_id = p_tenant_id
    AND membership.user_id = v_user
    AND membership.status = 'active';

  IF v_role IS NULL OR v_role NOT IN ('restaurant_owner', 'cashier') THEN
    RAISE EXCEPTION 'Active cashier or restaurant owner access required' USING ERRCODE = '42501';
  END IF;

  SELECT order_row.* INTO v_order
  FROM public.customer_orders AS order_row
  WHERE order_row.tenant_id = p_tenant_id
    AND order_row.id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_role <> 'restaurant_owner' AND NOT EXISTS (
    SELECT 1
    FROM public.branch_memberships AS branch_membership
    WHERE branch_membership.tenant_id = p_tenant_id
      AND branch_membership.branch_id = v_order.branch_id
      AND branch_membership.user_id = v_user
  ) THEN
    RAISE EXCEPTION 'You do not have access to this branch' USING ERRCODE = '42501';
  END IF;

  IF v_order.order_status <> 'pending_confirmation' THEN
    RAISE EXCEPTION 'Orders can only be cancelled before cashier confirmation.' USING ERRCODE = '22023';
  END IF;

  IF v_order.payment_status = 'paid' OR EXISTS (
    SELECT 1
    FROM public.customer_order_payment_sessions AS payment_session
    WHERE payment_session.tenant_id = p_tenant_id
      AND payment_session.order_id = p_order_id
      AND payment_session.status = 'paid'
  ) THEN
    RAISE EXCEPTION 'Paid orders must be refunded through the payment workflow.' USING ERRCODE = '22023';
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.authorize_staff_order_cancellation(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_staff_order_cancellation(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_customer_order(p_tracking_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_order public.customer_orders%rowtype;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Order cancellation must be requested through the secure cancellation service.' USING ERRCODE = '42501';
  END IF;

  IF p_tracking_token IS NULL THEN
    RAISE EXCEPTION 'Order tracking token is required' USING ERRCODE = '22023';
  END IF;

  SELECT order_row.* INTO v_order
  FROM public.customer_orders AS order_row
  WHERE order_row.idempotency_key = p_tracking_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.order_status <> 'pending_confirmation' THEN
    RAISE EXCEPTION 'Orders can only be cancelled before cashier confirmation.' USING ERRCODE = '22023';
  END IF;

  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'Paid orders must be refunded through the payment workflow.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.customer_orders
  SET order_status = 'cancelled', updated_at = now()
  WHERE tenant_id = v_order.tenant_id AND id = v_order.id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'order_status', 'cancelled'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_customer_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_customer_order(uuid) TO service_role;

-- Authenticated customers need the same opaque tracking capability on their own
-- account orders so they can cancel from order history as well as live tracking.
CREATE OR REPLACE FUNCTION public.customer_order_history()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_orders jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sign in to view your order history.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'order_id', order_row.id,
      'tracking_token', order_row.idempotency_key,
      'order_number', order_row.order_number,
      'restaurant_name', tenant.name,
      'restaurant_slug', tenant.slug,
      'order_type', order_row.order_type,
      'order_status', order_row.order_status,
      'payment_status', order_row.payment_status,
      'created_at', order_row.created_at,
      'updated_at', order_row.updated_at,
      'subtotal_centavos', order_row.subtotal_centavos,
      'delivery_fee_centavos', order_row.delivery_fee_centavos,
      'total_centavos', order_row.total_centavos,
      'items', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'name', item.item_name_snapshot,
          'quantity', item.quantity,
          'unit_price_centavos', item.unit_price_centavos,
          'total_centavos', item.line_total_centavos,
          'options', item.options_snapshot
        ) ORDER BY item.line_number), '[]'::jsonb)
        FROM public.customer_order_items AS item
        WHERE item.order_id = order_row.id AND item.tenant_id = order_row.tenant_id
      )
    ) ORDER BY order_row.created_at DESC
  ), '[]'::jsonb)
  INTO v_orders
  FROM public.customer_orders AS order_row
  JOIN public.tenants AS tenant ON tenant.id = order_row.tenant_id
  WHERE order_row.customer_user_id = v_user_id;

  RETURN v_orders;
END;
$function$;

REVOKE ALL ON FUNCTION public.customer_order_history() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_order_history() TO authenticated, service_role;

COMMIT;
