-- Restore every dispatcher order-type tab while keeping rider dispatch delivery-only.
BEGIN;

DO $migration$
DECLARE
  v_def text;
  v_anchor text;
  v_replacement text;
BEGIN
  SELECT pg_get_functiondef('public.list_staff_orders(uuid,text,integer)'::regprocedure)
  INTO v_def;

  v_anchor := $anchor$and (v_role <> 'dispatcher' or (
        o.order_type = 'delivery'
        and o.order_status = 'ready_for_dispatch'
        and (da.status is null or da.status in ('assigned','accepted','dispatched'))
      ))$anchor$;
  IF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'Could not locate the dispatcher active-order filter; migration stopped safely';
  END IF;
  v_replacement := $replacement$and (v_role <> 'dispatcher' or (
        ((
          o.order_type = 'delivery'
          and o.order_status = 'ready_for_dispatch'
          and (da.status is null or da.status in ('assigned','accepted'))
        ) or (
          o.order_type <> 'delivery'
          and o.order_status = 'ready_for_pickup'
        ))
      ))$replacement$;
  v_def := replace(v_def, v_anchor, v_replacement);

  v_anchor := $anchor$and (v_role<>'dispatcher' or p_filter='all' or o.order_status in ('ready_for_dispatch','out_for_delivery'))$anchor$;
  IF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'Could not locate the dispatcher active-filter guard; migration stopped safely';
  END IF;
  v_replacement := $replacement$and (v_role<>'dispatcher' or p_filter='all' or o.order_status in ('ready_for_dispatch','ready_for_pickup'))$replacement$;
  v_def := replace(v_def, v_anchor, v_replacement);

  EXECUTE v_def;
END;
$migration$;

COMMIT;
