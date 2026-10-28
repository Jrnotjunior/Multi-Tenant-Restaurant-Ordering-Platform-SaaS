-- After kitchen marks an order ready, remove it from the kitchen queue
-- (including the All filter); it now belongs to dispatch operations.
DO $do$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.list_staff_orders(uuid,text,integer)'::regprocedure) INTO v_def;
  IF position('and (v_role<>''kitchen'' or p_filter=''all'' or o.order_status in (''confirmed'',''preparing'',''ready_for_dispatch''))' in v_def) = 0 THEN
    RAISE EXCEPTION 'Expected kitchen order filter was not found; migration stopped safely';
  END IF;
  v_def := replace(v_def,
    'and (v_role<>''kitchen'' or p_filter=''all'' or o.order_status in (''confirmed'',''preparing'',''ready_for_dispatch''))',
    'and (v_role<>''kitchen'' or o.order_status in (''confirmed'',''preparing''))');
  EXECUTE v_def;
END
$do$;
