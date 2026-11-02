-- Keep arrived deliveries in the rider's active queue so the rider can finish them.
BEGIN;

DO $migration$
DECLARE
  v_def text;
  v_anchor text;
BEGIN
  SELECT pg_get_functiondef('public.list_staff_orders(uuid,text,integer)'::regprocedure)
  INTO v_def;

  v_anchor := $anchor$da.status in ('assigned','accepted','dispatched','out_for_delivery')$anchor$;
  IF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'Could not locate the rider active-order status filter; migration stopped safely';
  END IF;
  v_def := replace(v_def, v_anchor,
    $replacement$da.status in ('assigned','accepted','dispatched','out_for_delivery','arrived_at_customer')$replacement$);

  v_anchor := $anchor$da.status in ('assigned','accepted','dispatched')$anchor$;
  IF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'Could not locate the rider work-queue status filter; migration stopped safely';
  END IF;
  v_def := replace(v_def, v_anchor,
    $replacement$da.status in ('assigned','accepted','dispatched','arrived_at_customer')$replacement$);

  EXECUTE v_def;
END;
$migration$;

COMMIT;
