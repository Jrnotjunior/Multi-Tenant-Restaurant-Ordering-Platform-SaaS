-- Cashier confirmation collects dine-in cash before releasing the order
-- to preparation, matching the existing cash pickup and take-out workflow.
BEGIN;

DO $migration$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.transition_staff_order(uuid,uuid,text)'::regprocedure)
    INTO v_definition;

  -- Permit a cashier to confirm a pending dine-in cash order. The payment
  -- collection is recorded atomically below, so kitchen never sees it unpaid.
  v_old := 'AND (v_order.order_type IN (''delivery'',''pickup'') OR v_order.order_type = ''take_out'')';
  v_new := 'AND (v_order.order_type IN (''delivery'',''pickup'',''take_out'',''dine_in''))';
  IF strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Expected cashier cash-order eligibility guard was not found; migration aborted';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  -- Record cash as collected by the confirming cashier in the same transaction
  -- that moves the order into preparation. Never modify online payments.
  v_old := 'v_order.order_type IN (''take_out'',''pickup'') AND lower(v_order.payment_method)=''cash''';
  v_new := 'v_order.order_type IN (''take_out'',''pickup'',''dine_in'') AND lower(v_order.payment_method)=''cash''';
  IF strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Expected cashier cash-collection update was not found; migration aborted';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  EXECUTE v_definition;
END
$migration$;

COMMIT;
