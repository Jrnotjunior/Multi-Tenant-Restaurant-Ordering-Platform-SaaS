-- Keep rider dispatch exclusive to delivery orders and remove dispatched work
-- from the dispatcher's active queue while it waits for the rider to start.
BEGIN;

ALTER TABLE public.delivery_assignments
  DROP CONSTRAINT IF EXISTS delivery_assignments_status_check;
ALTER TABLE public.delivery_assignments
  ADD CONSTRAINT delivery_assignments_status_check
  CHECK (status IN ('assigned', 'accepted', 'dispatched', 'out_for_delivery', 'delivered', 'cancelled'));

-- Before dispatched had its own status, the old dispatch action left the row
-- assigned but advanced updated_at beyond assigned_at. Preserve that handoff.
UPDATE public.delivery_assignments AS assignment
SET status = 'dispatched', updated_at = now()
FROM public.customer_orders AS order_row
WHERE assignment.tenant_id = order_row.tenant_id
  AND assignment.order_id = order_row.id
  AND order_row.order_type = 'delivery'
  AND order_row.order_status = 'ready_for_dispatch'
  AND assignment.status = 'assigned'
  AND assignment.updated_at > assignment.assigned_at;

-- Repair non-delivery orders that older transition logic incorrectly marked
-- ready for rider dispatch. Keep assignment history, but cancel those invalid
-- assignments instead of deleting rows.
UPDATE public.delivery_assignments AS assignment
SET status = 'cancelled', updated_at = now()
FROM public.customer_orders AS order_row
WHERE assignment.tenant_id = order_row.tenant_id
  AND assignment.order_id = order_row.id
  AND order_row.order_type <> 'delivery'
  AND assignment.status IN ('assigned', 'accepted', 'dispatched');

UPDATE public.customer_orders
SET order_status = 'ready_for_pickup', updated_at = now()
WHERE order_type <> 'delivery'
  AND order_status = 'ready_for_dispatch';

DO $migration$
DECLARE
  v_def text;
  v_anchor text;
  v_replacement text;
BEGIN
  SELECT pg_get_functiondef('public.transition_staff_order(uuid,uuid,text)'::regprocedure)
  INTO v_def;

  v_anchor := $anchor$WHEN 'mark_ready' THEN CASE WHEN v_order.order_status='preparing' THEN 'ready_for_dispatch' END$anchor$;
  IF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'Could not locate the kitchen ready-status rule; migration stopped safely';
  END IF;
  v_replacement := $replacement$WHEN 'mark_ready' THEN CASE WHEN v_order.order_status='preparing' THEN CASE WHEN v_order.order_type='delivery' THEN 'ready_for_dispatch' ELSE 'ready_for_pickup' END END$replacement$;
  v_def := replace(v_def, v_anchor, v_replacement);

  v_anchor := $anchor$ELSIF v_role IN ('restaurant_owner','dispatcher') AND p_action='dispatch' THEN$anchor$;
  IF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'Could not locate the dispatcher action; migration stopped safely';
  END IF;
  v_replacement := v_anchor || $guard$
   IF v_order.order_type <> 'delivery' THEN
     RAISE EXCEPTION 'Only delivery orders can be dispatched to a rider' USING ERRCODE='22023';
   END IF;
$guard$;
  v_def := replace(v_def, v_anchor, v_replacement);

  v_anchor := $anchor$UPDATE public.delivery_assignments SET status='assigned',updated_at=now() WHERE tenant_id=p_tenant_id AND order_id=p_order_id;$anchor$;
  IF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'Could not locate the dispatch status update; migration stopped safely';
  END IF;
  v_def := replace(v_def, v_anchor,
    $replacement$UPDATE public.delivery_assignments SET status='dispatched',updated_at=now() WHERE tenant_id=p_tenant_id AND order_id=p_order_id;$replacement$);

  v_anchor := $anchor$ELSIF v_role='rider' AND p_action='accept_delivery' THEN$anchor$;
  IF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'Could not locate the rider start action; migration stopped safely';
  END IF;
  v_replacement := v_anchor || $guard$
   IF v_order.order_type <> 'delivery' THEN
     RAISE EXCEPTION 'Riders can only start delivery orders' USING ERRCODE='22023';
   END IF;
$guard$;
  v_def := replace(v_def, v_anchor, v_replacement);
  v_anchor := $anchor$WHERE tenant_id=p_tenant_id AND order_id=p_order_id AND rider_user_id=v_user AND status='assigned';$anchor$;
  IF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'Could not locate the rider assignment status guard; migration stopped safely';
  END IF;
  v_def := replace(v_def, v_anchor,
    $replacement$WHERE tenant_id=p_tenant_id AND order_id=p_order_id AND rider_user_id=v_user AND status='dispatched';$replacement$);
  EXECUTE v_def;

  SELECT pg_get_functiondef('public.assign_order_rider(uuid,uuid,uuid)'::regprocedure)
  INTO v_def;
  v_anchor := $anchor$IF v_order.order_status <> 'ready_for_dispatch' THEN$anchor$;
  IF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'Could not locate the rider assignment status guard; migration stopped safely';
  END IF;
  v_replacement := $replacement$IF v_order.order_type <> 'delivery' THEN
    RAISE EXCEPTION 'Only delivery orders can be assigned to a rider' USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.delivery_assignments assignment
    WHERE assignment.tenant_id=p_tenant_id AND assignment.order_id=p_order_id
      AND assignment.status='dispatched'
  ) THEN
    RAISE EXCEPTION 'This order has already been dispatched to the rider' USING ERRCODE='22023';
  END IF;
  IF v_order.order_status <> 'ready_for_dispatch' THEN$replacement$;
  v_def := replace(v_def, v_anchor, v_replacement);
  EXECUTE v_def;

  SELECT pg_get_functiondef('public.list_staff_orders(uuid,text,integer)'::regprocedure)
  INTO v_def;
  v_anchor := $anchor$where o.tenant_id=p_tenant_id$anchor$;
  IF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'Could not locate the staff order list tenant filter; migration stopped safely';
  END IF;
  v_replacement := v_anchor || $guard$
      and (v_role <> 'rider' or o.order_type = 'delivery')
      and (v_role <> 'dispatcher' or (
        o.order_type = 'delivery'
        and o.order_status = 'ready_for_dispatch'
        and (da.status is null or da.status in ('assigned','accepted'))
      ))
$guard$;
  v_def := replace(v_def, v_anchor, v_replacement);

  v_anchor := $anchor$da.status in ('assigned','accepted','out_for_delivery')$anchor$;
  IF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'Could not locate the rider active-order status filter; migration stopped safely';
  END IF;
  v_def := replace(v_def, v_anchor, $replacement$da.status in ('assigned','accepted','dispatched','out_for_delivery')$replacement$);

  v_anchor := $anchor$da.status in ('assigned','accepted')$anchor$;
  IF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'Could not locate the rider work-queue status filter; migration stopped safely';
  END IF;
  v_def := replace(v_def, v_anchor, $replacement$da.status in ('assigned','accepted','dispatched')$replacement$);
  EXECUTE v_def;
END;
$migration$;

COMMIT;
