-- Cancel eligible pending online orders atomically with the start of a full PayMongo refund.
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

    IF OLD.payment_status IN ('paid', 'refunded') OR NEW.payment_status IN ('paid', 'refunded') THEN
      IF OLD.payment_method IS DISTINCT FROM 'online' OR NOT EXISTS (
        SELECT 1
        FROM public.customer_order_payment_sessions AS payment_session
        WHERE payment_session.tenant_id = OLD.tenant_id
          AND payment_session.order_id = OLD.id
          AND payment_session.status IN ('refund_pending', 'refunded')
          AND payment_session.paymongo_payment_id IS NOT NULL
          AND payment_session.paymongo_payment_id <> ''
          AND payment_session.amount_centavos = OLD.total_centavos
      ) THEN
        RAISE EXCEPTION 'A paid online order must have a verified PayMongo refund in progress before cancellation.' USING ERRCODE = '22023';
      END IF;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.customer_order_payment_sessions AS payment_session
      WHERE payment_session.tenant_id = OLD.tenant_id
        AND payment_session.order_id = OLD.id
        AND (
          payment_session.status IN ('creating', 'active')
          OR (payment_session.status = 'failed' AND payment_session.checkout_session_id IS NOT NULL)
        )
    ) THEN
      RAISE EXCEPTION 'Resolve the online checkout before cancelling this order.' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

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

  IF v_order.payment_status IN ('paid', 'refunded') AND (
    v_order.payment_method IS DISTINCT FROM 'online' OR NOT EXISTS (
      SELECT 1
      FROM public.customer_order_payment_sessions AS payment_session
      WHERE payment_session.tenant_id = p_tenant_id
        AND payment_session.order_id = p_order_id
        AND payment_session.status IN ('paid', 'refund_pending', 'refunded')
        AND payment_session.paymongo_payment_id IS NOT NULL
        AND payment_session.paymongo_payment_id <> ''
        AND payment_session.amount_centavos = v_order.total_centavos
    )
  ) THEN
    RAISE EXCEPTION 'The paid order does not have a matching PayMongo payment that can be refunded automatically.' USING ERRCODE = '22023';
  END IF;

  RETURN true;
END;
$function$;

-- The service-role RPC is the only path that can mark a paid online order cancelled.
-- It locks the order and payment session, creates/reuses an idempotency key, and
-- puts the session into refund_pending before the cancellation trigger runs.
CREATE OR REPLACE FUNCTION public.prepare_customer_order_cancellation(
  p_tracking_token uuid DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL,
  p_order_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_order public.customer_orders%rowtype;
  v_session public.customer_order_payment_sessions%rowtype;
BEGIN
  IF (p_tracking_token IS NULL AND (p_tenant_id IS NULL OR p_order_id IS NULL))
    OR (p_tracking_token IS NOT NULL AND (p_tenant_id IS NOT NULL OR p_order_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Provide either the order tracking token or the staff order identifiers.' USING ERRCODE = '22023';
  END IF;

  IF p_tracking_token IS NOT NULL THEN
    SELECT order_row.* INTO v_order
    FROM public.customer_orders AS order_row
    WHERE order_row.idempotency_key = p_tracking_token
    FOR UPDATE;
  ELSE
    SELECT order_row.* INTO v_order
    FROM public.customer_orders AS order_row
    WHERE order_row.tenant_id = p_tenant_id
      AND order_row.id = p_order_id
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.order_status NOT IN ('pending_confirmation', 'cancelled') THEN
    RAISE EXCEPTION 'Orders can only be cancelled before cashier confirmation.' USING ERRCODE = '22023';
  END IF;
  IF v_order.payment_method IS DISTINCT FROM 'online' OR v_order.payment_status NOT IN ('paid', 'refunded') THEN
    RAISE EXCEPTION 'This order does not have a paid online payment for automatic refund.' USING ERRCODE = '22023';
  END IF;

  SELECT payment_session.* INTO v_session
  FROM public.customer_order_payment_sessions AS payment_session
  WHERE payment_session.tenant_id = v_order.tenant_id
    AND payment_session.order_id = v_order.id
    AND payment_session.status IN ('paid', 'refund_pending', 'refunded')
  ORDER BY payment_session.paid_at DESC NULLS LAST, payment_session.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR v_session.paymongo_payment_id IS NULL OR v_session.paymongo_payment_id = '' THEN
    RAISE EXCEPTION 'The PayMongo payment reference is missing; the order was not cancelled.' USING ERRCODE = '22023';
  END IF;
  IF v_order.total_centavos IS NULL OR v_session.amount_centavos <> v_order.total_centavos THEN
    RAISE EXCEPTION 'The PayMongo payment amount does not match the order total; the order was not cancelled.' USING ERRCODE = '22023';
  END IF;

  IF v_session.status = 'paid' THEN
    UPDATE public.customer_order_payment_sessions
    SET status = 'refund_pending',
        refund_reason = 'requested_by_customer',
        refund_id = NULL,
        refunded_amount_centavos = NULL,
        refunded_at = NULL,
        refund_attempt_key = 'w2t-cancel-' || gen_random_uuid()::text,
        refund_attempt_started_at = now(),
        updated_at = now()
    WHERE id = v_session.id
    RETURNING * INTO v_session;
  ELSIF v_session.status = 'refund_pending' THEN
    UPDATE public.customer_order_payment_sessions
    SET refund_reason = coalesce(nullif(refund_reason, ''), 'requested_by_customer'),
        refund_attempt_key = coalesce(nullif(refund_attempt_key, ''), 'w2t-cancel-' || gen_random_uuid()::text),
        refund_attempt_started_at = coalesce(refund_attempt_started_at, now()),
        updated_at = now()
    WHERE id = v_session.id
    RETURNING * INTO v_session;
  END IF;

  IF v_order.order_status = 'pending_confirmation' THEN
    UPDATE public.customer_orders
    SET order_status = 'cancelled', updated_at = now()
    WHERE tenant_id = v_order.tenant_id AND id = v_order.id
    RETURNING * INTO v_order;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order.id,
    'tenant_id', v_order.tenant_id,
    'order_status', v_order.order_status,
    'payment_status', v_order.payment_status,
    'payment_session_id', v_session.id,
    'environment', v_session.environment,
    'paymongo_account_id', v_session.paymongo_account_id,
    'paymongo_payment_id', v_session.paymongo_payment_id,
    'amount_centavos', v_session.amount_centavos,
    'reason', coalesce(v_session.refund_reason, 'requested_by_customer'),
    'refund_id', v_session.refund_id,
    'refund_attempt_key', v_session.refund_attempt_key,
    'refund_attempt_started_at', v_session.refund_attempt_started_at,
    'refund_status', CASE WHEN v_session.status = 'refunded' THEN 'refunded' ELSE 'pending' END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fail_customer_order_cancellation_refund(
  p_tenant_id uuid,
  p_payment_session_id uuid,
  p_refund_attempt_key text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_order public.customer_orders%rowtype;
  v_session public.customer_order_payment_sessions%rowtype;
BEGIN
  SELECT order_row.* INTO v_order
  FROM public.customer_orders AS order_row
  WHERE order_row.tenant_id = p_tenant_id
    AND order_row.id = (
      SELECT payment_session.order_id
      FROM public.customer_order_payment_sessions AS payment_session
      WHERE payment_session.tenant_id = p_tenant_id
        AND payment_session.id = p_payment_session_id
    )
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT payment_session.* INTO v_session
  FROM public.customer_order_payment_sessions AS payment_session
  WHERE payment_session.tenant_id = p_tenant_id
    AND payment_session.id = p_payment_session_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment session not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.order_status = 'cancelled'
    AND v_order.payment_status = 'paid'
    AND v_session.status = 'refund_pending'
    AND v_session.refund_attempt_key = p_refund_attempt_key THEN
    UPDATE public.customer_order_payment_sessions
    SET status = 'paid',
        refund_id = NULL,
        refund_attempt_key = NULL,
        refund_attempt_started_at = NULL,
        updated_at = now()
    WHERE tenant_id = p_tenant_id AND id = p_payment_session_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- Match the order-then-session lock order used by automatic cancellation and
-- owner refund requests to avoid payment/refund callback deadlocks.
CREATE OR REPLACE FUNCTION public.finalize_customer_order_refund(
  p_tenant_id uuid,
  p_payment_session_id uuid,
  p_refund_id text,
  p_refunded_amount_centavos bigint
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_session public.customer_order_payment_sessions%rowtype;
  v_order public.customer_orders%rowtype;
BEGIN
  IF coalesce(btrim(p_refund_id), '') = '' OR p_refunded_amount_centavos IS NULL OR p_refunded_amount_centavos <= 0 THEN
    RAISE EXCEPTION 'Invalid refund confirmation' USING ERRCODE = '22023';
  END IF;

  SELECT payment_session.* INTO v_session
  FROM public.customer_order_payment_sessions AS payment_session
  WHERE payment_session.tenant_id = p_tenant_id AND payment_session.id = p_payment_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment session not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT order_row.* INTO v_order
  FROM public.customer_orders AS order_row
  WHERE order_row.tenant_id = p_tenant_id AND order_row.id = v_session.order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT payment_session.* INTO v_session
  FROM public.customer_order_payment_sessions AS payment_session
  WHERE payment_session.tenant_id = p_tenant_id AND payment_session.id = p_payment_session_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment session not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.status = 'refunded' AND v_session.refund_id = p_refund_id THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'order_id', v_order.id);
  END IF;
  IF v_session.status <> 'refund_pending' OR p_refunded_amount_centavos <> v_session.amount_centavos THEN
    RAISE EXCEPTION 'Refund does not match the pending full refund' USING ERRCODE = '22023';
  END IF;

  UPDATE public.customer_order_payment_sessions
  SET status = 'refunded',
      refund_id = p_refund_id,
      refunded_amount_centavos = p_refunded_amount_centavos,
      refunded_at = now(),
      updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = p_payment_session_id;
  UPDATE public.customer_orders
  SET payment_status = 'refunded', updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = v_order.id AND payment_status = 'paid';

  RETURN jsonb_build_object('success', true, 'duplicate', false, 'order_id', v_order.id);
END;
$function$;

REVOKE ALL ON FUNCTION public.prepare_customer_order_cancellation(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_customer_order_cancellation(uuid, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.fail_customer_order_cancellation_refund(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_customer_order_cancellation_refund(uuid, uuid, text) TO service_role;

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
      'payment_method', order_row.payment_method,
      'refund_status', CASE
        WHEN order_row.payment_status = 'refunded' OR EXISTS (
          SELECT 1 FROM public.customer_order_payment_sessions AS payment_session
          WHERE payment_session.tenant_id = order_row.tenant_id AND payment_session.order_id = order_row.id
            AND payment_session.status = 'refunded'
        ) THEN 'refunded'
        WHEN EXISTS (
          SELECT 1 FROM public.customer_order_payment_sessions AS payment_session
          WHERE payment_session.tenant_id = order_row.tenant_id AND payment_session.order_id = order_row.id
            AND payment_session.status = 'refund_pending'
        ) THEN 'pending'
        WHEN order_row.order_status = 'cancelled' AND order_row.payment_method = 'online'
          AND order_row.payment_status = 'paid' THEN 'failed'
        ELSE NULL
      END,
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

COMMIT;
