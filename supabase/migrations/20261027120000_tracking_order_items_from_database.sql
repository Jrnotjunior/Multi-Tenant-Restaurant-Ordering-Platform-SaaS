-- Return persisted order line snapshots and totals to the dedicated customer tracking page.
CREATE OR REPLACE FUNCTION public.track_customer_order(p_tracking_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_order public.customer_orders%rowtype;
  v_items jsonb;
BEGIN
  IF p_tracking_token IS NULL THEN
    RAISE EXCEPTION 'Order tracking token is required' USING ERRCODE='22023';
  END IF;

  SELECT o.* INTO v_order
  FROM public.customer_orders AS o
  WHERE o.idempotency_key = p_tracking_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', oi.item_name_snapshot,
    'quantity', oi.quantity,
    'total_centavos', oi.line_total_centavos,
    'unit_price_centavos', oi.unit_price_centavos,
    'options', oi.options_snapshot
  ) ORDER BY oi.line_number), '[]'::jsonb)
  INTO v_items
  FROM public.customer_order_items AS oi
  WHERE oi.order_id = v_order.id
    AND oi.tenant_id = v_order.tenant_id;

  RETURN jsonb_build_object(
    'found', true,
    'order_number', v_order.order_number,
    'order_status', v_order.order_status,
    'payment_status', v_order.payment_status,
    'order_type', v_order.order_type,
    'created_at', v_order.created_at,
    'updated_at', v_order.updated_at,
    'items', v_items,
    'subtotal_centavos', v_order.subtotal_centavos,
    'delivery_fee_centavos', v_order.delivery_fee_centavos,
    'total_centavos', v_order.total_centavos
  );
END;
$function$;
