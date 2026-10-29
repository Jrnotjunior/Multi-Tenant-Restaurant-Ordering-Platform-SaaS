-- Dispatcher assignment must not start a delivery. The rider starts it via the swipe action.
CREATE OR REPLACE FUNCTION public.transition_staff_order(p_tenant_id uuid, p_order_id uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_user uuid := auth.uid(); v_role text; v_order public.customer_orders%rowtype; v_assignment public.delivery_assignments%rowtype; v_next_status text;
BEGIN
 IF v_user IS NULL OR NOT private.privileged_session_verified() THEN RAISE EXCEPTION 'Verified MFA session required' USING ERRCODE='42501'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('confirm','reject','start_preparing','mark_ready','dispatch','accept_delivery','confirm_cash_collected','deliver','cancel') THEN RAISE EXCEPTION 'Invalid order action' USING ERRCODE='22023'; END IF;
 SELECT m.role INTO v_role FROM public.tenant_memberships m WHERE m.tenant_id=p_tenant_id AND m.user_id=v_user AND m.status='active';
 IF v_role IS NULL OR v_role NOT IN ('restaurant_owner','cashier','kitchen','dispatcher','rider') THEN RAISE EXCEPTION 'Active restaurant staff access required' USING ERRCODE='42501'; END IF;
 SELECT o.* INTO v_order FROM public.customer_orders o WHERE o.tenant_id=p_tenant_id AND o.id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002'; END IF;
 IF v_role<>'restaurant_owner' AND NOT EXISTS(SELECT 1 FROM public.branch_memberships bm WHERE bm.tenant_id=p_tenant_id AND bm.branch_id=v_order.branch_id AND bm.user_id=v_user) THEN RAISE EXCEPTION 'You do not have access to this branch' USING ERRCODE='42501'; END IF;
 IF v_role IN ('restaurant_owner','cashier') AND p_action IN ('confirm','reject','cancel') THEN
   v_next_status:=CASE p_action WHEN 'confirm' THEN CASE WHEN v_order.order_status='pending_confirmation' AND v_order.total_centavos IS NOT NULL THEN 'preparing' END WHEN 'reject' THEN CASE WHEN v_order.order_status='pending_confirmation' THEN 'rejected' END WHEN 'cancel' THEN CASE WHEN v_order.order_status IN ('pending_confirmation','confirmed') THEN 'cancelled' END END;
 ELSIF v_role='kitchen' AND p_action IN ('start_preparing','mark_ready') THEN
   v_next_status:=CASE p_action WHEN 'start_preparing' THEN CASE WHEN v_order.order_status='confirmed' THEN 'preparing' END WHEN 'mark_ready' THEN CASE WHEN v_order.order_status='preparing' THEN 'ready_for_dispatch' END END;
 ELSIF v_role IN ('restaurant_owner','dispatcher') AND p_action='dispatch' THEN
   SELECT da.* INTO v_assignment FROM public.delivery_assignments da WHERE da.tenant_id=p_tenant_id AND da.order_id=p_order_id FOR UPDATE;
   IF NOT FOUND OR v_assignment.status NOT IN ('assigned','accepted') THEN RAISE EXCEPTION 'Assign an active rider before dispatching this order' USING ERRCODE='22023'; END IF;
   IF v_order.order_status <> 'ready_for_dispatch' THEN RAISE EXCEPTION 'Only ready orders can be assigned for delivery' USING ERRCODE='22023'; END IF;
   v_next_status:='ready_for_dispatch';
   UPDATE public.delivery_assignments SET status='assigned',updated_at=now() WHERE tenant_id=p_tenant_id AND order_id=p_order_id;
 ELSIF v_role='rider' AND p_action='accept_delivery' THEN
   UPDATE public.delivery_assignments SET status='out_for_delivery',updated_at=now() WHERE tenant_id=p_tenant_id AND order_id=p_order_id AND rider_user_id=v_user AND status='assigned';
   IF NOT FOUND THEN RAISE EXCEPTION 'This delivery is not assigned to your account' USING ERRCODE='42501'; END IF;
   UPDATE public.customer_orders SET order_status='out_for_delivery',updated_at=now() WHERE tenant_id=p_tenant_id AND id=p_order_id;
   RETURN jsonb_build_object('success',true,'order_id',p_order_id,'order_status','out_for_delivery','assignment_status','out_for_delivery');
 ELSIF v_role='rider' AND p_action='confirm_cash_collected' THEN
   SELECT da.* INTO v_assignment FROM public.delivery_assignments da WHERE da.tenant_id=p_tenant_id AND da.order_id=p_order_id AND da.rider_user_id=v_user FOR UPDATE;
   IF NOT FOUND OR v_assignment.status<>'out_for_delivery' OR v_order.order_status<>'out_for_delivery' THEN RAISE EXCEPTION 'Only your active delivery can collect payment' USING ERRCODE='42501'; END IF;
   IF v_order.order_type<>'delivery' OR v_order.payment_method<>'cash' THEN RAISE EXCEPTION 'Cash collection confirmation is only for cash-on-delivery orders' USING ERRCODE='22023'; END IF;
   IF v_order.payment_status='paid' THEN RAISE EXCEPTION 'Payment is already confirmed' USING ERRCODE='22023'; END IF;
   UPDATE public.customer_orders SET payment_status='paid',payment_collected_at=now(),payment_collected_by=v_user,updated_at=now() WHERE tenant_id=p_tenant_id AND id=p_order_id;
   RETURN jsonb_build_object('success',true,'order_id',p_order_id,'payment_status','paid','payment_collected_at',now());
 ELSIF v_role='rider' AND p_action='deliver' THEN
   SELECT da.* INTO v_assignment FROM public.delivery_assignments da WHERE da.tenant_id=p_tenant_id AND da.order_id=p_order_id AND da.rider_user_id=v_user FOR UPDATE;
   IF NOT FOUND OR v_assignment.status<>'out_for_delivery' OR v_order.order_status<>'out_for_delivery' THEN RAISE EXCEPTION 'Only your active delivery can be completed' USING ERRCODE='42501'; END IF;
   IF v_order.order_type='delivery' AND v_order.payment_method='cash' AND (v_order.payment_status<>'paid' OR v_order.payment_collected_by IS DISTINCT FROM v_user OR v_order.payment_collected_at IS NULL) THEN RAISE EXCEPTION 'Confirm cash collection before completing this delivery' USING ERRCODE='22023'; END IF;
   v_next_status:='delivered';
   UPDATE public.delivery_assignments SET status='delivered',updated_at=now(),delivered_at=now() WHERE tenant_id=p_tenant_id AND order_id=p_order_id AND rider_user_id=v_user;
 ELSE RAISE EXCEPTION 'This role cannot perform that action' USING ERRCODE='42501';
 END IF;
 IF v_next_status IS NULL THEN RAISE EXCEPTION 'This action is not allowed for the current order status' USING ERRCODE='22023'; END IF;
 UPDATE public.customer_orders SET order_status=v_next_status,updated_at=now() WHERE tenant_id=p_tenant_id AND id=p_order_id;
 RETURN jsonb_build_object('success',true,'order_id',v_order.id,'order_number',v_order.order_number,'previous_status',v_order.order_status,'order_status',v_next_status,'payment_status',v_order.payment_status);
END;
$function$;
