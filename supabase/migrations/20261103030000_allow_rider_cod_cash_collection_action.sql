-- Allow the rider cash-collection action already implemented below.
-- Keep the action guarded by the rider's active assignment and delivery state.
DO $migration$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.transition_staff_order(uuid,uuid,text)'::regprocedure)
    INTO v_definition;

  v_old := 'p_action NOT IN (''confirm'',''start_preparing'',''mark_ready'',''dispatch'',''accept_delivery'',''deliver'',''cancel'',''complete_handoff'',''arrive_customer'')';
  v_new := 'p_action NOT IN (''confirm'',''start_preparing'',''mark_ready'',''dispatch'',''accept_delivery'',''deliver'',''cancel'',''complete_handoff'',''arrive_customer'',''confirm_cash_collected'')';

  IF strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Expected transition_staff_order action allowlist not found; migration aborted';
  END IF;

  v_definition := replace(v_definition, v_old, v_new);
  EXECUTE v_definition;
END
$migration$;
