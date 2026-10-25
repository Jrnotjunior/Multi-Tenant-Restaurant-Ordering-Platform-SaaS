-- W2T-024: persist the fulfillment type and make delivery address conditional.
BEGIN;

ALTER TABLE public.customer_orders
  ADD COLUMN order_type text NOT NULL DEFAULT 'delivery'
  CHECK (order_type IN ('delivery','take_out','pickup','dine_in'));

ALTER TABLE public.customer_orders
  ALTER COLUMN delivery_address DROP NOT NULL;

ALTER TABLE public.customer_orders
  DROP CONSTRAINT IF EXISTS customer_orders_delivery_address_check;

ALTER TABLE public.customer_orders
  ADD CONSTRAINT customer_orders_delivery_address_by_type_check
  CHECK (
    (order_type = 'delivery' AND delivery_address IS NOT NULL
      AND char_length(btrim(delivery_address)) BETWEEN 8 AND 500)
    OR
    (order_type <> 'delivery' AND (delivery_address IS NULL OR btrim(delivery_address) = ''))
  );

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
      o.order_type, o.customer_name, o.customer_phone, o.delivery_address, o.delivery_notes,
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

REVOKE ALL ON FUNCTION public.list_customer_orders(uuid,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_customer_orders(uuid,text,integer) TO authenticated;

COMMIT;
