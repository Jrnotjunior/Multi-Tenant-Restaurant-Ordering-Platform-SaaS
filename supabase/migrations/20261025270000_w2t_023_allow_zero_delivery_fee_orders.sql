-- W2T-023: confirmation requires a finalized total, not a positive delivery fee.
-- Pickup, take-out, and dine-in orders can use a zero delivery fee.
BEGIN;

CREATE OR REPLACE FUNCTION public.transition_customer_order(
  p_tenant_id uuid,
  p_order_id uuid,
  p_action text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_role text;
  v_order public.customer_orders%rowtype;
  v_next_status text;
BEGIN
  IF v_user IS NULL OR NOT private.privileged_session_verified() THEN
    RAISE EXCEPTION 'Verified MFA session required' USING ERRCODE='42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('confirm','reject','start_preparing','mark_ready','dispatch','deliver','cancel') THEN
    RAISE EXCEPTION 'Invalid order action' USING ERRCODE='22023';
  END IF;

  SELECT m.role INTO v_role
  FROM public.tenant_memberships m
  WHERE m.tenant_id=p_tenant_id AND m.user_id=v_user AND m.status='active';
  IF v_role IS NULL OR v_role NOT IN ('restaurant_owner','cashier') THEN
    RAISE EXCEPTION 'Restaurant owner or cashier access required' USING ERRCODE='42501';
  END IF;

  SELECT o.* INTO v_order
  FROM public.customer_orders o
  WHERE o.tenant_id=p_tenant_id AND o.id=p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002';
  END IF;
  IF v_role <> 'restaurant_owner' AND NOT EXISTS (
    SELECT 1 FROM public.branch_memberships bm
    WHERE bm.tenant_id=v_order.tenant_id AND bm.branch_id=v_order.branch_id AND bm.user_id=v_user
  ) THEN
    RAISE EXCEPTION 'You do not have access to this branch' USING ERRCODE='42501';
  END IF;

  IF p_action = 'confirm' AND v_order.total_centavos IS NULL THEN
    RAISE EXCEPTION 'Set the final order total before confirming this order' USING ERRCODE='22023';
  END IF;

  v_next_status := CASE p_action
    WHEN 'confirm' THEN CASE WHEN v_order.order_status='pending_confirmation' THEN 'confirmed' END
    WHEN 'reject' THEN CASE WHEN v_order.order_status='pending_confirmation' THEN 'rejected' END
    WHEN 'start_preparing' THEN CASE WHEN v_order.order_status='confirmed' THEN 'preparing' END
    WHEN 'mark_ready' THEN CASE WHEN v_order.order_status='preparing' THEN 'ready_for_dispatch' END
    WHEN 'dispatch' THEN CASE WHEN v_order.order_status='ready_for_dispatch' THEN 'out_for_delivery' END
    WHEN 'deliver' THEN CASE WHEN v_order.order_status='out_for_delivery' THEN 'delivered' END
    WHEN 'cancel' THEN CASE WHEN v_order.order_status IN ('pending_confirmation','confirmed') THEN 'cancelled' END
  END;
  IF v_next_status IS NULL THEN
    RAISE EXCEPTION 'This action is not allowed for the current order status' USING ERRCODE='22023';
  END IF;

  UPDATE public.customer_orders
  SET order_status=v_next_status, updated_at=now()
  WHERE id=v_order.id AND tenant_id=v_order.tenant_id;

  RETURN jsonb_build_object('success',true,'order_id',v_order.id,
    'order_number',v_order.order_number,'previous_status',v_order.order_status,
    'order_status',v_next_status,'payment_status',v_order.payment_status);
END;
$fn$;

COMMIT;
