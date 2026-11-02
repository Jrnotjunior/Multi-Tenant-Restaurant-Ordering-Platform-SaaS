-- Let dispatchers close ready pickup, take-out, and dine-in handoffs without a rider.
BEGIN;

DO $migration$
DECLARE
  v_def text;
  v_anchor text;
  v_replacement text;
BEGIN
  SELECT pg_get_functiondef('public.transition_staff_order(uuid,uuid,text)'::regprocedure)
  INTO v_def;

  v_anchor := $anchor$IF p_action IS NULL OR p_action NOT IN ('confirm','start_preparing','mark_ready','dispatch','accept_delivery','confirm_cash_collected','deliver','cancel') THEN$anchor$;
  IF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'Could not locate the staff action allowlist; migration stopped safely';
  END IF;
  v_replacement := $replacement$IF p_action IS NULL OR p_action NOT IN ('confirm','start_preparing','mark_ready','dispatch','accept_delivery','confirm_cash_collected','deliver','cancel','complete_handoff') THEN$replacement$;
  v_def := replace(v_def, v_anchor, v_replacement);

  v_anchor := $anchor$ELSIF v_role='kitchen' AND p_action IN ('start_preparing','mark_ready') THEN$anchor$;
  IF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'Could not locate the kitchen transition branch; migration stopped safely';
  END IF;
  v_replacement := $replacement$ELSIF v_role IN ('restaurant_owner','cashier') AND p_action='complete_handoff' THEN
    IF v_order.order_status <> 'ready_for_pickup' THEN
      RAISE EXCEPTION 'Only orders ready for handoff can be completed' USING ERRCODE='22023';
    END IF;
    v_next_status := 'completed';
  $replacement$ || v_anchor;
  v_def := replace(v_def, v_anchor, v_replacement);

  v_anchor := $anchor$ELSIF v_role IN ('restaurant_owner','dispatcher') AND p_action='dispatch' THEN$anchor$;
  IF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'Could not locate the dispatcher delivery action; migration stopped safely';
  END IF;
  v_replacement := $replacement$ELSIF v_role='dispatcher' AND p_action='complete_handoff' THEN
    IF v_order.order_type = 'delivery' THEN
      RAISE EXCEPTION 'Delivery orders must be dispatched to a rider' USING ERRCODE='22023';
    END IF;
    IF v_order.order_status <> 'ready_for_pickup' THEN
      RAISE EXCEPTION 'Only orders ready for handoff can be completed' USING ERRCODE='22023';
    END IF;
    v_next_status := 'completed';
  $replacement$ || v_anchor;
  v_def := replace(v_def, v_anchor, v_replacement);

  EXECUTE v_def;
END;
$migration$;

COMMIT;
