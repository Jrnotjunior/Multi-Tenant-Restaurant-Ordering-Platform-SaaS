CREATE OR REPLACE FUNCTION public.customer_order_history()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_orders jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sign in to view your order history.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'order_id', o.id,
      'order_number', o.order_number,
      'restaurant_name', t.name,
      'restaurant_slug', t.slug,
      'order_type', o.order_type,
      'order_status', o.order_status,
      'payment_status', o.payment_status,
      'created_at', o.created_at,
      'updated_at', o.updated_at,
      'subtotal_centavos', o.subtotal_centavos,
      'delivery_fee_centavos', o.delivery_fee_centavos,
      'total_centavos', o.total_centavos,
      'items', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'name', i.item_name_snapshot,
          'quantity', i.quantity,
          'unit_price_centavos', i.unit_price_centavos,
          'total_centavos', i.line_total_centavos,
          'options', i.options_snapshot
        ) ORDER BY i.line_number), '[]'::jsonb)
        FROM public.customer_order_items i
        WHERE i.order_id = o.id AND i.tenant_id = o.tenant_id
      )
    ) ORDER BY o.created_at DESC
  ), '[]'::jsonb)
  INTO v_orders
  FROM public.customer_orders o
  JOIN public.tenants t ON t.id = o.tenant_id
  WHERE o.customer_user_id = v_user_id;

  RETURN v_orders;
END;
$function$;

REVOKE ALL ON FUNCTION public.customer_order_history() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_order_history() TO authenticated, service_role;