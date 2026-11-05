-- Dine-in cash must be collected and recorded by the cashier before confirmation.
-- Keep COD's existing unpaid delivery path unchanged.
BEGIN;

DO $migration$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.transition_staff_order(uuid,uuid,text)'::regprocedure)
    INTO v_definition;

  v_old := 'p_action NOT IN (''confirm'',''start_preparing'',''mark_ready'',''dispatch'',''accept_delivery'',''deliver'',''cancel'',''complete_handoff'',''arrive_customer'',''confirm_cash_collected'')';
  v_new := 'p_action NOT IN (''confirm'',''start_preparing'',''mark_ready'',''dispatch'',''accept_delivery'',''deliver'',''cancel'',''complete_handoff'',''arrive_customer'',''confirm_cash_collected'',''collect_cash_payment'')';
  IF strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Expected staff order action allowlist was not found; migration aborted';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  -- Dine-in is deliberately excluded from unpaid cashier confirmation.
  v_old := 'v_order.order_type IN (''delivery'',''pickup'',''take_out'',''dine_in'')';
  v_new := 'v_order.order_type IN (''delivery'',''pickup'',''take_out'')';
  IF strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Expected cashier unpaid-order guard was not found; migration aborted';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  -- Do not mark dine-in cash paid as a side effect of confirming it.
  v_old := 'v_order.order_type IN (''take_out'',''pickup'',''dine_in'') AND lower(v_order.payment_method)=''cash''';
  v_new := 'v_order.order_type IN (''take_out'',''pickup'') AND lower(v_order.payment_method)=''cash''';
  IF strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Expected cashier automatic cash-collection clause was not found; migration aborted';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  -- Explicit cashier action: record cash received before the order can be confirmed.
  v_old := 'ELSIF v_role IN (''restaurant_owner'',''cashier'') AND p_action=''complete_handoff'' THEN';
  v_new := 'ELSIF v_role=''cashier'' AND p_action=''collect_cash_payment'' THEN
    IF v_order.order_type <> ''dine_in'' OR lower(v_order.payment_method) <> ''cash'' THEN
      RAISE EXCEPTION ''Cash payment collection from this action is only available for dine-in cash orders'' USING ERRCODE=''22023'';
    END IF;
    IF v_order.order_status <> ''pending_confirmation'' THEN
      RAISE EXCEPTION ''Cash can only be collected before the dine-in order is confirmed'' USING ERRCODE=''22023'';
    END IF;
    IF lower(v_order.payment_status) IN (''paid'',''succeeded'',''completed'') THEN
      RAISE EXCEPTION ''This order is already paid'' USING ERRCODE=''22023'';
    END IF;
    IF lower(v_order.payment_status) NOT IN (''not_started'',''pending'') THEN
      RAISE EXCEPTION ''This cash payment cannot be collected from its current status'' USING ERRCODE=''22023'';
    END IF;
    UPDATE public.customer_orders
    SET payment_status=''paid'', payment_collected_at=now(), payment_collected_by=v_user, updated_at=now()
    WHERE tenant_id=p_tenant_id AND id=p_order_id;
    RETURN jsonb_build_object(''success'',true,''order_id'',p_order_id,''payment_status'',''paid'',''payment_collected_at'',now(),''payment_collected_by'',v_user);
  ELSIF v_role IN (''restaurant_owner'',''cashier'') AND p_action=''complete_handoff'' THEN';
  if strpos(v_definition, v_old) = 0 then
    raise exception 'Expected cashier handoff branch was not found; migration aborted';
  end if;
  v_definition := replace(v_definition, v_old, v_new);

  EXECUTE v_definition;
END
$migration$;

COMMIT;
