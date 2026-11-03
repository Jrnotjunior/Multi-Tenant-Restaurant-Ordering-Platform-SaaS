-- Cashier confirmation of a cash take-out order records collection atomically
-- with the order transition. Kitchen access remains payment-gated.
DO $migration$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
  v_position integer;
BEGIN
  SELECT pg_get_functiondef('public.transition_staff_order(uuid,uuid,text)'::regprocedure)
    INTO v_definition;

  -- Extend only the cashier/owner confirmation gate. The kitchen gate remains
  -- unchanged, so a take-out order cannot enter preparation while still unpaid.
  v_old := 'AND v_order.order_type IN (''delivery'',''pickup'')';
  v_new := 'AND (v_order.order_type IN (''delivery'',''pickup'') OR v_order.order_type = ''take_out'')';
  v_position := strpos(v_definition, v_old);
  IF v_position = 0 THEN
    RAISE EXCEPTION 'Expected cashier payment gate was not found; migration aborted';
  END IF;
  v_definition := overlay(v_definition placing v_new from v_position for length(v_old));

  -- On cashier confirmation, record cash collection in the same transaction
  -- as the transition to preparing. This keeps payment and kitchen release atomic.
  v_old := 'UPDATE public.customer_orders SET order_status=v_next_status,updated_at=now() WHERE tenant_id=p_tenant_id AND id=p_order_id;';
  v_new := 'UPDATE public.customer_orders SET order_status=v_next_status, payment_status=CASE WHEN v_role IN (''restaurant_owner'',''cashier'') AND p_action=''confirm'' AND v_order.order_type=''take_out'' AND lower(v_order.payment_method)=''cash'' AND lower(v_order.payment_status) IN (''not_started'',''pending'') THEN ''paid'' ELSE payment_status END, payment_collected_at=CASE WHEN v_role IN (''restaurant_owner'',''cashier'') AND p_action=''confirm'' AND v_order.order_type=''take_out'' AND lower(v_order.payment_method)=''cash'' AND lower(v_order.payment_status) IN (''not_started'',''pending'') THEN now() ELSE payment_collected_at END, payment_collected_by=CASE WHEN v_role IN (''restaurant_owner'',''cashier'') AND p_action=''confirm'' AND v_order.order_type=''take_out'' AND lower(v_order.payment_method)=''cash'' AND lower(v_order.payment_status) IN (''not_started'',''pending'') THEN v_user ELSE payment_collected_by END, updated_at=now() WHERE tenant_id=p_tenant_id AND id=p_order_id RETURNING payment_status,payment_collected_at,payment_collected_by INTO v_order.payment_status,v_order.payment_collected_at,v_order.payment_collected_by;';
  IF strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Expected final order update was not found; migration aborted';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  EXECUTE v_definition;
END
$migration$;
