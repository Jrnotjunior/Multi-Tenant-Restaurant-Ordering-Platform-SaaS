-- W2T-029: only the trusted server webhook path may finalize payment, with exact amount/session matching.
BEGIN;

CREATE OR REPLACE FUNCTION public.finalize_customer_order_payment(
  p_tenant_id uuid,
  p_environment text,
  p_checkout_session_id text,
  p_amount_centavos bigint
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_session public.customer_order_payment_sessions%rowtype;
  v_order public.customer_orders%rowtype;
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Trusted payment processor access required' USING ERRCODE='42501';
  END IF;
  IF p_tenant_id IS NULL
     OR p_environment NOT IN ('test','live')
     OR p_checkout_session_id IS NULL
     OR length(btrim(p_checkout_session_id)) = 0
     OR p_amount_centavos IS NULL
     OR p_amount_centavos <= 0 THEN
    RAISE EXCEPTION 'Invalid payment confirmation' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_session
  FROM public.customer_order_payment_sessions s
  WHERE s.tenant_id=p_tenant_id
    AND s.environment=p_environment
    AND s.checkout_session_id=p_checkout_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment session not found' USING ERRCODE='P0002';
  END IF;
  IF v_session.amount_centavos <> p_amount_centavos THEN
    RAISE EXCEPTION 'Payment amount does not match order total' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_order
  FROM public.customer_orders o
  WHERE o.tenant_id=v_session.tenant_id AND o.id=v_session.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002';
  END IF;
  IF v_order.total_centavos IS NULL OR v_order.total_centavos <> p_amount_centavos THEN
    RAISE EXCEPTION 'Payment amount does not match finalized order total' USING ERRCODE='22023';
  END IF;

  IF v_session.status='paid' AND v_order.payment_status='paid' THEN
    RETURN jsonb_build_object('success',true,'duplicate',true,'order_id',v_order.id);
  END IF;
  IF v_session.status <> 'active' OR v_order.payment_status NOT IN ('pending','not_started') THEN
    RAISE EXCEPTION 'Order or payment session is not payable' USING ERRCODE='22023';
  END IF;

  UPDATE public.customer_order_payment_sessions
  SET status='paid',paid_at=coalesce(paid_at,now()),updated_at=now()
  WHERE id=v_session.id;

  UPDATE public.customer_orders
  SET payment_status='paid',updated_at=now()
  WHERE tenant_id=v_order.tenant_id AND id=v_order.id;

  RETURN jsonb_build_object('success',true,'duplicate',false,'order_id',v_order.id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.finalize_customer_order_payment(uuid,text,text,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_customer_order_payment(uuid,text,text,bigint) TO service_role;

COMMIT;
