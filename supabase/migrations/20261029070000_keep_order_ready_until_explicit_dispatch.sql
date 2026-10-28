-- Assignment must not transition an order into the out-for-delivery state.
-- Only the explicit dispatcher "Dispatch order" action may do that.
CREATE OR REPLACE FUNCTION public.assign_order_rider(p_tenant_id uuid, p_order_id uuid, p_rider_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := (select auth.uid());
  v_role text;
  v_order public.customer_orders%rowtype;
BEGIN
  IF v_user IS NULL OR NOT private.privileged_session_verified() THEN
    RAISE EXCEPTION 'Verified MFA session required' USING errcode='42501';
  END IF;
  SELECT m.role INTO v_role FROM public.tenant_memberships m
  WHERE m.tenant_id=p_tenant_id AND m.user_id=v_user AND m.status='active';
  IF v_role NOT IN ('restaurant_owner','dispatcher') OR v_role IS NULL THEN
    RAISE EXCEPTION 'Dispatcher access required' USING errcode='42501';
  END IF;
  SELECT o.* INTO v_order FROM public.customer_orders o
  WHERE o.tenant_id=p_tenant_id AND o.id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING errcode='P0002'; END IF;
  IF v_order.order_status <> 'ready_for_dispatch' THEN
    RAISE EXCEPTION 'Only orders ready for dispatch can be assigned' USING errcode='22023';
  END IF;
  IF v_role <> 'restaurant_owner' AND NOT EXISTS (
    SELECT 1 FROM public.branch_memberships bm
    WHERE bm.tenant_id=p_tenant_id AND bm.branch_id=v_order.branch_id AND bm.user_id=v_user
  ) THEN RAISE EXCEPTION 'You do not have access to this branch' USING errcode='42501'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships m
    JOIN public.branch_memberships bm ON bm.tenant_id=m.tenant_id AND bm.user_id=m.user_id
    WHERE m.tenant_id=p_tenant_id AND m.user_id=p_rider_user_id
      AND m.role='rider' AND m.status='active' AND bm.branch_id=v_order.branch_id
  ) THEN RAISE EXCEPTION 'Select an active rider assigned to this branch' USING errcode='42501'; END IF;
  INSERT INTO public.delivery_assignments(tenant_id,branch_id,order_id,rider_user_id,assigned_by,status)
  VALUES(p_tenant_id,v_order.branch_id,v_order.id,p_rider_user_id,v_user,'assigned')
  ON CONFLICT (tenant_id,order_id) DO UPDATE SET
    rider_user_id=excluded.rider_user_id, assigned_by=excluded.assigned_by,
    status='assigned', assigned_at=now(), updated_at=now(), delivered_at=null;
  UPDATE public.customer_orders SET order_status='ready_for_dispatch',updated_at=now()
  WHERE tenant_id=p_tenant_id AND id=p_order_id;
  RETURN jsonb_build_object('success',true,'order_id',v_order.id,'rider_user_id',p_rider_user_id,
    'order_status','ready_for_dispatch','assignment_status','assigned');
END;
$function$;
