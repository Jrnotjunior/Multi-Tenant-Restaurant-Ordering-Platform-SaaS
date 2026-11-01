-- Only paid online orders may enter the kitchen. Unpaid cash orders are
-- allowed for delivery and pickup, where payment is collected later.
BEGIN;

DO $migration$
DECLARE
  v_def text;
  v_anchor text;
  v_replacement text;
BEGIN
  SELECT pg_get_functiondef('public.transition_customer_order(uuid,uuid,text)'::regprocedure)
  INTO v_def;
  v_anchor := $anchor$
  IF p_action = 'confirm' AND v_order.total_centavos IS NULL THEN
    RAISE EXCEPTION 'Set the final order total before confirming this order' USING ERRCODE='22023';
  END IF;
$anchor$;
  IF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'Could not locate customer order confirmation guard; migration stopped safely';
  END IF;
  v_replacement := v_anchor || $guard$
  IF p_action IN ('confirm','start_preparing','mark_ready','dispatch') AND NOT (
    lower(v_order.payment_status) IN ('paid','succeeded','completed')
    OR (
      lower(v_order.payment_method) = 'cash'
      AND v_order.order_type IN ('delivery','pickup')
      AND lower(v_order.payment_status) IN ('not_started','pending')
    )
  ) THEN
    RAISE EXCEPTION 'This order must be paid before it can go to the kitchen. Unpaid cash is allowed only for delivery and pickup.' USING ERRCODE='22023';
  END IF;
$guard$;
  v_def := replace(v_def, v_anchor, v_replacement);
  EXECUTE v_def;

  SELECT pg_get_functiondef('public.transition_staff_order(uuid,uuid,text)'::regprocedure)
  INTO v_def;
  v_anchor := $anchor$IF v_role IN ('restaurant_owner','cashier') AND p_action IN ('confirm','cancel') THEN$anchor$;
  IF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'Could not locate staff order confirmation guard; migration stopped safely';
  END IF;
  v_replacement := v_anchor || $guard$
   IF p_action = 'confirm' AND NOT (
     lower(v_order.payment_status) IN ('paid','succeeded','completed')
     OR (
       lower(v_order.payment_method) = 'cash'
       AND v_order.order_type IN ('delivery','pickup')
       AND lower(v_order.payment_status) IN ('not_started','pending')
     )
   ) THEN
     RAISE EXCEPTION 'This order must be paid before it can go to the kitchen. Unpaid cash is allowed only for delivery and pickup.' USING ERRCODE='22023';
   END IF;
$guard$;
  v_def := replace(v_def, v_anchor, v_replacement);

  v_anchor := $anchor$ELSIF v_role='kitchen' AND p_action IN ('start_preparing','mark_ready') THEN$anchor$;
  IF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'Could not locate kitchen transition guard; migration stopped safely';
  END IF;
  v_replacement := v_anchor || $guard$
   IF NOT (
     lower(v_order.payment_status) IN ('paid','succeeded','completed')
     OR (
       lower(v_order.payment_method) = 'cash'
       AND v_order.order_type IN ('delivery','pickup')
       AND lower(v_order.payment_status) IN ('not_started','pending')
     )
   ) THEN
     RAISE EXCEPTION 'This order must be paid before it can go to the kitchen. Unpaid cash is allowed only for delivery and pickup.' USING ERRCODE='22023';
   END IF;
$guard$;
  v_def := replace(v_def, v_anchor, v_replacement);

  v_anchor := $anchor$ELSIF v_role IN ('restaurant_owner','dispatcher') AND p_action='dispatch' THEN$anchor$;
  IF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'Could not locate dispatch transition guard; migration stopped safely';
  END IF;
  v_replacement := v_anchor || $guard$
   IF NOT (
     lower(v_order.payment_status) IN ('paid','succeeded','completed')
     OR (
       lower(v_order.payment_method) = 'cash'
       AND v_order.order_type IN ('delivery','pickup')
       AND lower(v_order.payment_status) IN ('not_started','pending')
     )
   ) THEN
     RAISE EXCEPTION 'Online payment must be confirmed before this order can be dispatched.' USING ERRCODE='22023';
   END IF;
$guard$;
  v_def := replace(v_def, v_anchor, v_replacement);

  v_anchor := $anchor$ELSIF v_role='rider' AND p_action='accept_delivery' THEN$anchor$;
  IF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'Could not locate rider acceptance guard; migration stopped safely';
  END IF;
  v_replacement := v_anchor || $guard$
   IF NOT (
     lower(v_order.payment_status) IN ('paid','succeeded','completed')
     OR (
       lower(v_order.payment_method) = 'cash'
       AND v_order.order_type = 'delivery'
       AND lower(v_order.payment_status) IN ('not_started','pending')
     )
   ) THEN
     RAISE EXCEPTION 'Online payment must be confirmed before this delivery can be accepted.' USING ERRCODE='22023';
   END IF;
$guard$;
  v_def := replace(v_def, v_anchor, v_replacement);

  EXECUTE v_def;

  SELECT pg_get_functiondef('public.list_staff_orders(uuid,text,integer)'::regprocedure)
  INTO v_def;
  v_anchor := $anchor$and (v_role<>'kitchen' or o.order_status in ('confirmed','preparing'))$anchor$;
  IF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'Could not locate kitchen order-list guard; migration stopped safely';
  END IF;
  v_replacement := $replacement$and (v_role<>'kitchen' or (
        o.order_status in ('confirmed','preparing')
        and (
          lower(o.payment_status) in ('paid','succeeded','completed')
          or (
            lower(o.payment_method) = 'cash'
            and o.order_type in ('delivery','pickup')
            and lower(o.payment_status) in ('not_started','pending')
          )
        )
      ))$replacement$;
  v_def := replace(v_def, v_anchor, v_replacement);
  v_anchor := $anchor$and (v_role<>'dispatcher' or p_filter='all' or o.order_status in ('ready_for_dispatch','out_for_delivery'))$anchor$;
  IF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'Could not locate dispatcher order-list guard; migration stopped safely';
  END IF;
  v_replacement := v_anchor || $guard$
      and (v_role<>'dispatcher' or o.order_status <> 'ready_for_dispatch' or (
        lower(o.payment_status) in ('paid','succeeded','completed')
        or (
          lower(o.payment_method) = 'cash'
          and o.order_type in ('delivery','pickup')
          and lower(o.payment_status) in ('not_started','pending')
        )
      ))
$guard$;
  v_def := replace(v_def, v_anchor, v_replacement);
  EXECUTE v_def;
END;
$migration$;

COMMIT;
