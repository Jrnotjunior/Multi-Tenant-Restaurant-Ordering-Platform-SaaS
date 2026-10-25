-- W2T-027: prevent delivery-fee changes on pickup, take-out, and dine-in orders.
BEGIN;

CREATE OR REPLACE FUNCTION public.set_customer_order_delivery_fee(
  p_tenant_id uuid,
  p_order_id uuid,
  p_delivery_fee_centavos bigint
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_order public.customer_orders%rowtype;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT private.is_active_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'Verified restaurant owner session required' USING ERRCODE='42501';
  END IF;
  IF p_delivery_fee_centavos IS NULL OR p_delivery_fee_centavos < 0 OR p_delivery_fee_centavos > 1000000000 THEN
    RAISE EXCEPTION 'Delivery fee must be between 0 and 10000000 PHP' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_order
  FROM public.customer_orders
  WHERE tenant_id=p_tenant_id AND id=p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002';
  END IF;
  IF v_order.order_type <> 'delivery' THEN
    RAISE EXCEPTION 'Delivery fees can only be set for delivery orders' USING ERRCODE='22023';
  END IF;
  IF v_order.order_status <> 'pending_confirmation' OR v_order.payment_status <> 'not_started' THEN
    RAISE EXCEPTION 'Delivery fee can only be set before confirming the order or starting payment' USING ERRCODE='22023';
  END IF;

  UPDATE public.customer_orders
  SET delivery_fee_centavos=p_delivery_fee_centavos,
      total_centavos=subtotal_centavos+p_delivery_fee_centavos,
      updated_at=now()
  WHERE tenant_id=p_tenant_id AND id=p_order_id
  RETURNING * INTO v_order;

  RETURN jsonb_build_object(
    'success',true,'order_id',v_order.id,
    'subtotal_centavos',v_order.subtotal_centavos,
    'delivery_fee_centavos',v_order.delivery_fee_centavos,
    'total_centavos',v_order.total_centavos
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_customer_order_delivery_fee(uuid,uuid,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_customer_order_delivery_fee(uuid,uuid,bigint) TO authenticated;

COMMIT;
