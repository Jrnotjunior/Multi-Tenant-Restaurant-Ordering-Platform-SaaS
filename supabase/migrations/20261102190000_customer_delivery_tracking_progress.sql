-- Expose rider progress to customers and let riders record arrival before delivery.
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
  v_items jsonb;
  v_refund_status text;
  v_payment_session_status text;
  v_assignment_status text;
BEGIN
  IF p_tracking_token IS NULL THEN
    RAISE EXCEPTION 'Order tracking token is required' USING ERRCODE = '22023';
  END IF;

  SELECT order_row.* INTO v_order
  FROM public.customer_orders AS order_row
  WHERE order_row.idempotency_key = p_tracking_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT assignment.status INTO v_assignment_status
  FROM public.delivery_assignments AS assignment
  WHERE assignment.tenant_id = v_order.tenant_id
    AND assignment.order_id = v_order.id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', order_item.item_name_snapshot,
    'quantity', order_item.quantity,
    'total_centavos', order_item.line_total_centavos,
    'unit_price_centavos', order_item.unit_price_centavos,
    'options', order_item.options_snapshot
  ) ORDER BY order_item.line_number), '[]'::jsonb)
  INTO v_items
  FROM public.customer_order_items AS order_item
  WHERE order_item.order_id = v_order.id
    AND order_item.tenant_id = v_order.tenant_id;

  SELECT payment_session.status INTO v_payment_session_status
  FROM public.customer_order_payment_sessions AS payment_session
  WHERE payment_session.tenant_id = v_order.tenant_id
    AND payment_session.order_id = v_order.id
  ORDER BY payment_session.paid_at DESC NULLS LAST, payment_session.created_at DESC
  LIMIT 1;

  v_refund_status := CASE
    WHEN v_order.payment_status = 'refunded' OR v_payment_session_status = 'refunded' THEN 'refunded'
    WHEN v_payment_session_status = 'refund_pending' THEN 'pending'
    WHEN v_order.order_status = 'cancelled'
      AND v_order.payment_method = 'online'
      AND v_order.payment_status = 'paid' THEN 'failed'
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'found', true,
    'order_number', v_order.order_number,
    'order_status', v_order.order_status,
    'assignment_status', v_assignment_status,
    'payment_status', v_order.payment_status,
    'payment_method', v_order.payment_method,
    'refund_status', v_refund_status,
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

REVOKE ALL ON FUNCTION public.track_customer_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_customer_order(uuid) TO anon, authenticated, service_role;

DO $migration$
DECLARE
  v_def text;
  v_anchor text;
  v_replacement text;
BEGIN
  SELECT pg_get_functiondef('public.transition_staff_order(uuid,uuid,text)'::regprocedure)
  INTO v_def;

  v_anchor := $anchor$IF p_action IS NULL OR p_action NOT IN ('confirm','start_preparing','mark_ready','dispatch','accept_delivery','confirm_cash_collected','deliver','cancel','complete_handoff') THEN$anchor$;
  IF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'Could not locate the staff action allowlist; migration stopped safely';
  END IF;
  v_replacement := $replacement$IF p_action IS NULL OR p_action NOT IN ('confirm','start_preparing','mark_ready','dispatch','accept_delivery','confirm_cash_collected','deliver','cancel','complete_handoff','arrive_customer') THEN$replacement$;
  v_def := replace(v_def, v_anchor, v_replacement);

  v_anchor := $anchor$ELSIF v_role='rider' AND p_action='deliver' THEN$anchor$;
  IF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'Could not locate the rider delivery branch; migration stopped safely';
  END IF;
  v_replacement := $replacement$ELSIF v_role='rider' AND p_action='arrive_customer' THEN
   SELECT da.* INTO v_assignment FROM public.delivery_assignments da WHERE da.tenant_id=p_tenant_id AND da.order_id=p_order_id AND da.rider_user_id=v_user FOR UPDATE;
   IF NOT FOUND OR v_assignment.status<>'out_for_delivery' OR v_order.order_status<>'out_for_delivery' THEN RAISE EXCEPTION 'Only your active delivery can be marked as arrived' USING ERRCODE='42501'; END IF;
   UPDATE public.delivery_assignments SET status='arrived_at_customer',updated_at=now() WHERE tenant_id=p_tenant_id AND order_id=p_order_id AND rider_user_id=v_user;
   v_next_status:='out_for_delivery';
  $replacement$ || v_anchor;
  v_def := replace(v_def, v_anchor, v_replacement);

  v_anchor := $anchor$IF NOT FOUND OR v_assignment.status<>'out_for_delivery' OR v_order.order_status<>'out_for_delivery' THEN RAISE EXCEPTION 'Only your active delivery can be completed' USING ERRCODE='42501'; END IF;$anchor$;
  IF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'Could not locate rider completion validation; migration stopped safely';
  END IF;
  v_replacement := $replacement$IF NOT FOUND OR v_assignment.status NOT IN ('out_for_delivery','arrived_at_customer') OR v_order.order_status<>'out_for_delivery' THEN RAISE EXCEPTION 'Only your active delivery can be completed' USING ERRCODE='42501'; END IF;$replacement$;
  v_def := replace(v_def, v_anchor, v_replacement);

  EXECUTE v_def;
END;
$migration$;

COMMIT;
