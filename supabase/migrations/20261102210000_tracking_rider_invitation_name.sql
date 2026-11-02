-- Return the rider name from the accepted invitation when it is absent from auth metadata.
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
  v_rider_name text;
  v_rider_phone text;
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

  SELECT assignment.status,
    COALESCE(
      NULLIF(BTRIM(rider.raw_user_meta_data->>'preferred_name'), ''),
      NULLIF(BTRIM(rider.raw_user_meta_data->>'display_name'), ''),
      NULLIF(BTRIM(rider.raw_user_meta_data->>'full_name'), ''),
      NULLIF(BTRIM(rider.raw_user_meta_data->>'name'), ''),
      NULLIF(BTRIM(CONCAT_WS(' ',
        NULLIF(BTRIM(rider.raw_user_meta_data->>'first_name'), ''),
        NULLIF(BTRIM(rider.raw_user_meta_data->>'last_name'), '')
      )), ''),
      NULLIF(BTRIM(CONCAT_WS(' ',
        NULLIF(BTRIM(rider_invitation.first_name), ''),
        NULLIF(BTRIM(rider_invitation.last_name), '')
      )), ''),
      'Rider'
    ),
    COALESCE(
      NULLIF(BTRIM(rider.phone), ''),
      NULLIF(BTRIM(rider.raw_user_meta_data->>'phone'), ''),
      NULLIF(BTRIM(rider.raw_user_meta_data->>'phone_number'), '')
    )
  INTO v_assignment_status, v_rider_name, v_rider_phone
  FROM public.delivery_assignments AS assignment
  JOIN auth.users AS rider ON rider.id = assignment.rider_user_id
  LEFT JOIN LATERAL (
    SELECT invitation.first_name, invitation.last_name
    FROM public.privileged_invitations AS invitation
    WHERE invitation.tenant_id = assignment.tenant_id
      AND invitation.invited_user_id = assignment.rider_user_id
      AND invitation.role = 'rider'
      AND invitation.status = 'accepted'
    ORDER BY invitation.accepted_at DESC NULLS LAST, invitation.created_at DESC
    LIMIT 1
  ) AS rider_invitation ON true
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
    'rider_name', v_rider_name,
    'rider_phone', v_rider_phone,
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

COMMIT;
