-- W2T-007B: tenant/branch-scoped restaurant order inbox and guarded transitions.
-- Every operational read/write requires an authenticated MFA (aal2) session.
BEGIN;

CREATE INDEX IF NOT EXISTS customer_orders_tenant_status_created_idx
  ON public.customer_orders(tenant_id, order_status, created_at DESC);

CREATE OR REPLACE FUNCTION public.list_customer_orders(
  p_tenant_id uuid,
  p_filter text DEFAULT 'active',
  p_limit integer DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_role text;
  v_orders jsonb;
BEGIN
  IF v_user IS NULL OR NOT private.privileged_session_verified() THEN
    RAISE EXCEPTION 'Verified MFA session required' USING ERRCODE='42501';
  END IF;
  IF p_filter NOT IN ('active','all') OR p_filter IS NULL THEN
    RAISE EXCEPTION 'Invalid order filter' USING ERRCODE='22023';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Order limit must be between 1 and 100' USING ERRCODE='22023';
  END IF;

  SELECT m.role INTO v_role
  FROM public.tenant_memberships m
  WHERE m.tenant_id=p_tenant_id AND m.user_id=v_user AND m.status='active';

  IF v_role IS NULL OR v_role NOT IN ('restaurant_owner','cashier') THEN
    RAISE EXCEPTION 'Restaurant owner or cashier access required' USING ERRCODE='42501';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC), '[]'::jsonb)
  INTO v_orders
  FROM (
    SELECT o.id, o.order_number, o.tenant_id, o.branch_id, b.name AS branch_name,
      o.customer_name, o.customer_phone, o.delivery_address, o.delivery_notes,
      o.currency, o.subtotal_centavos, o.delivery_fee_centavos, o.total_centavos,
      o.order_status, o.payment_status, o.created_at, o.updated_at,
      coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id',i.id,'line_number',i.line_number,'item_name',i.item_name_snapshot,
          'unit_price_centavos',i.unit_price_centavos,'quantity',i.quantity,
          'line_total_centavos',i.line_total_centavos,'options',i.options_snapshot
        ) ORDER BY i.line_number)
        FROM public.customer_order_items i
        WHERE i.tenant_id=o.tenant_id AND i.order_id=o.id
      ), '[]'::jsonb) AS items
    FROM public.customer_orders o
    JOIN public.branches b ON b.tenant_id=o.tenant_id AND b.id=o.branch_id
    WHERE o.tenant_id=p_tenant_id
      AND (p_filter='all' OR o.order_status IN ('pending_confirmation','confirmed','preparing','ready_for_dispatch','out_for_delivery'))
      AND (
        v_role='restaurant_owner'
        OR EXISTS (
          SELECT 1 FROM public.branch_memberships bm
          WHERE bm.tenant_id=o.tenant_id AND bm.branch_id=o.branch_id AND bm.user_id=v_user
        )
      )
    ORDER BY o.created_at DESC
    LIMIT p_limit
  ) q;

  RETURN jsonb_build_object('orders',v_orders,'filter',p_filter,'limit',p_limit);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.transition_customer_order(
  p_tenant_id uuid,
  p_order_id uuid,
  p_action text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_role text;
  v_order public.customer_orders%rowtype;
  v_next_status text;
BEGIN
  IF v_user IS NULL OR NOT private.privileged_session_verified() THEN
    RAISE EXCEPTION 'Verified MFA session required' USING ERRCODE='42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('confirm','reject','start_preparing','mark_ready','dispatch','deliver','cancel') THEN
    RAISE EXCEPTION 'Invalid order action' USING ERRCODE='22023';
  END IF;

  SELECT m.role INTO v_role
  FROM public.tenant_memberships m
  WHERE m.tenant_id=p_tenant_id AND m.user_id=v_user AND m.status='active';
  IF v_role IS NULL OR v_role NOT IN ('restaurant_owner','cashier') THEN
    RAISE EXCEPTION 'Restaurant owner or cashier access required' USING ERRCODE='42501';
  END IF;

  SELECT o.* INTO v_order
  FROM public.customer_orders o
  WHERE o.tenant_id=p_tenant_id AND o.id=p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002';
  END IF;
  IF v_role <> 'restaurant_owner' AND NOT EXISTS (
    SELECT 1 FROM public.branch_memberships bm
    WHERE bm.tenant_id=v_order.tenant_id AND bm.branch_id=v_order.branch_id AND bm.user_id=v_user
  ) THEN
    RAISE EXCEPTION 'You do not have access to this branch' USING ERRCODE='42501';
  END IF;

  v_next_status := CASE p_action
    WHEN 'confirm' THEN CASE WHEN v_order.order_status='pending_confirmation' THEN 'confirmed' END
    WHEN 'reject' THEN CASE WHEN v_order.order_status='pending_confirmation' THEN 'rejected' END
    WHEN 'start_preparing' THEN CASE WHEN v_order.order_status='confirmed' THEN 'preparing' END
    WHEN 'mark_ready' THEN CASE WHEN v_order.order_status='preparing' THEN 'ready_for_dispatch' END
    WHEN 'dispatch' THEN CASE WHEN v_order.order_status='ready_for_dispatch' THEN 'out_for_delivery' END
    WHEN 'deliver' THEN CASE WHEN v_order.order_status='out_for_delivery' THEN 'delivered' END
    WHEN 'cancel' THEN CASE WHEN v_order.order_status IN ('pending_confirmation','confirmed') THEN 'cancelled' END
  END;
  IF v_next_status IS NULL THEN
    RAISE EXCEPTION 'This action is not allowed for the current order status' USING ERRCODE='22023';
  END IF;

  UPDATE public.customer_orders
  SET order_status=v_next_status, updated_at=now()
  WHERE id=v_order.id AND tenant_id=v_order.tenant_id;

  RETURN jsonb_build_object('success',true,'order_id',v_order.id,
    'order_number',v_order.order_number,'previous_status',v_order.order_status,
    'order_status',v_next_status,'payment_status',v_order.payment_status);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.set_tenant_order_acceptance(
  p_tenant_id uuid,
  p_accepting boolean
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_store public.tenant_storefronts%rowtype;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT private.is_active_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'Verified restaurant owner session required' USING ERRCODE='42501';
  END IF;
  IF p_accepting IS NULL THEN
    RAISE EXCEPTION 'Acceptance setting is required' USING ERRCODE='22023';
  END IF;

  UPDATE public.tenant_storefronts
  SET accepting_orders=p_accepting, updated_at=now()
  WHERE tenant_id=p_tenant_id
  RETURNING * INTO v_store;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurant storefront not found' USING ERRCODE='P0002';
  END IF;

  RETURN jsonb_build_object('tenant_id',p_tenant_id,'accepting_orders',v_store.accepting_orders);
END;
$fn$;

REVOKE ALL ON FUNCTION public.list_customer_orders(uuid,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transition_customer_order(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_tenant_order_acceptance(uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_customer_orders(uuid,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_customer_order(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_tenant_order_acceptance(uuid,boolean) TO authenticated;

COMMIT;
