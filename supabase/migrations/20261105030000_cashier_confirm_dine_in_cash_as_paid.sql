-- Cashier physically receives dine-in cash, then one Confirm action atomically
-- marks it paid and releases it to preparation. No separate collection action.
BEGIN;

DO $migration$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
  v_start integer;
  v_end integer;
BEGIN
  SELECT pg_get_functiondef('public.transition_staff_order(uuid,uuid,text)'::regprocedure)
    INTO v_definition;

  v_old := '''confirm_cash_collected'',''collect_cash_payment''';
  v_new := '''confirm_cash_collected''';
  IF strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Expected temporary cash collection action was not found; migration aborted';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_start := strpos(v_definition, 'ELSIF v_role=''cashier'' AND p_action=''collect_cash_payment'' THEN');
  v_end := strpos(v_definition, 'ELSIF v_role IN (''restaurant_owner'',''cashier'') AND p_action=''complete_handoff'' THEN');
  IF v_start = 0 OR v_end = 0 OR v_end <= v_start THEN
    RAISE EXCEPTION 'Expected temporary cash collection branch was not found; migration aborted';
  END IF;
  v_definition := left(v_definition, v_start - 1) || substring(v_definition FROM v_end);

  v_old := 'v_order.order_type IN (''delivery'',''pickup'',''take_out'')';
  v_new := 'v_order.order_type IN (''delivery'',''pickup'',''take_out'',''dine_in'')';
  IF strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Expected unpaid cash confirmation guard was not found; migration aborted';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := 'v_order.order_type IN (''take_out'',''pickup'') AND lower(v_order.payment_method)=''cash''';
  v_new := 'v_order.order_type IN (''take_out'',''pickup'',''dine_in'') AND lower(v_order.payment_method)=''cash''';
  IF strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Expected automatic cashier cash payment update was not found; migration aborted';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  EXECUTE v_definition;
END
$migration$;

COMMIT;