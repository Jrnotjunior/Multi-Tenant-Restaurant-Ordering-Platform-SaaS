-- The rider's final delivery swipe confirms COD payment and delivery together.
BEGIN;

CREATE OR REPLACE FUNCTION public.rider_complete_cod_delivery(
  p_tenant_id uuid,
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_role text;
  v_order public.customer_orders%rowtype;
  v_assignment public.delivery_assignments%rowtype;
  v_completed_at timestamptz := now();
BEGIN
  IF v_user IS NULL OR NOT private.privileged_session_verified() THEN
    RAISE EXCEPTION 'Verified MFA session required' USING ERRCODE='42501';
  END IF;

  SELECT m.role INTO v_role
  FROM public.tenant_memberships m
  WHERE m.tenant_id=p_tenant_id AND m.user_id=v_user AND m.status='active';
  IF v_role IS DISTINCT FROM 'rider' THEN
    RAISE EXCEPTION 'Active rider access required' USING ERRCODE='42501';
  END IF;

  SELECT o.* INTO v_order
  FROM public.customer_orders o
  WHERE o.tenant_id=p_tenant_id AND o.id=p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.branch_memberships bm
    WHERE bm.tenant_id=p_tenant_id AND bm.branch_id=v_order.branch_id AND bm.user_id=v_user
  ) THEN
    RAISE EXCEPTION 'You do not have access to this branch' USING ERRCODE='42501';
  END IF;

  SELECT da.* INTO v_assignment
  FROM public.delivery_assignments da
  WHERE da.tenant_id=p_tenant_id AND da.order_id=p_order_id AND da.rider_user_id=v_user
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This delivery is not assigned to your account' USING ERRCODE='42501';
  END IF;

  IF v_order.order_type <> 'delivery' OR v_order.payment_method <> 'cash' THEN
    RAISE EXCEPTION 'This action is only for cash-on-delivery orders' USING ERRCODE='22023';
  END IF;

  IF v_assignment.status='delivered' AND v_order.order_status='delivered'
     AND v_order.payment_status='paid' AND v_order.payment_collected_by=v_user THEN
    RETURN jsonb_build_object('success',true,'order_id',p_order_id,'order_status','delivered','payment_status','paid');
  END IF;

  IF v_assignment.status <> 'arrived_at_customer' OR v_order.order_status <> 'out_for_delivery' THEN
    RAISE EXCEPTION 'Mark the delivery as arrived before collecting cash and completing it' USING ERRCODE='22023';
  END IF;

  IF lower(v_order.payment_status) NOT IN ('not_started','pending') THEN
    RAISE EXCEPTION 'This cash payment cannot be confirmed from its current status' USING ERRCODE='22023';
  END IF;

  UPDATE public.customer_orders
  SET order_status='delivered', payment_status='paid',
      payment_collected_at=v_completed_at, payment_collected_by=v_user, updated_at=v_completed_at
  WHERE tenant_id=p_tenant_id AND id=p_order_id;

  UPDATE public.delivery_assignments
  SET status='delivered', updated_at=v_completed_at, delivered_at=v_completed_at
  WHERE tenant_id=p_tenant_id AND order_id=p_order_id AND rider_user_id=v_user;

  RETURN jsonb_build_object(
    'success',true,'order_id',p_order_id,'order_status','delivered',
    'assignment_status','delivered','payment_status','paid',
    'payment_collected_at',v_completed_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rider_complete_cod_delivery(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rider_complete_cod_delivery(uuid,uuid) TO authenticated;

COMMIT;
