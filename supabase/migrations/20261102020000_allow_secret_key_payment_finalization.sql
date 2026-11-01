-- New Supabase secret API keys are authorized through the apikey header and are not JWTs.
-- Keep these RPCs restricted to service_role by grants; do not require a legacy JWT claim.
BEGIN;

CREATE OR REPLACE FUNCTION public.finalize_customer_order_payment(
  p_tenant_id uuid,
  p_environment text,
  p_checkout_session_id text,
  p_amount_centavos bigint
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_session public.customer_order_payment_sessions%rowtype;
  v_order public.customer_orders%rowtype;
BEGIN
  IF p_tenant_id IS NULL OR p_environment NOT IN ('test','live')
     OR coalesce(btrim(p_checkout_session_id),'')='' OR p_amount_centavos IS NULL OR p_amount_centavos<=0 THEN
    RAISE EXCEPTION 'Invalid payment confirmation' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_session FROM public.customer_order_payment_sessions s
   WHERE s.tenant_id=p_tenant_id AND s.environment=p_environment
     AND s.checkout_session_id=p_checkout_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment session not found' USING ERRCODE='P0002'; END IF;
  IF v_session.amount_centavos<>p_amount_centavos THEN RAISE EXCEPTION 'Payment amount does not match order total' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_order FROM public.customer_orders o
   WHERE o.tenant_id=v_session.tenant_id AND o.id=v_session.order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002'; END IF;
  IF v_order.total_centavos IS NULL OR v_order.total_centavos<>p_amount_centavos THEN
    RAISE EXCEPTION 'Payment amount does not match finalized order total' USING ERRCODE='22023';
  END IF;
  IF v_session.status='paid' AND v_order.payment_status='paid' THEN
    RETURN jsonb_build_object('success',true,'duplicate',true,'order_id',v_order.id);
  END IF;
  IF v_session.status<>'active' OR v_order.payment_status NOT IN ('pending','not_started','failed') THEN
    RAISE EXCEPTION 'Order or payment session is not payable' USING ERRCODE='22023';
  END IF;
  UPDATE public.customer_order_payment_sessions SET status='paid',paid_at=coalesce(paid_at,now()),updated_at=now() WHERE id=v_session.id;
  UPDATE public.customer_orders SET payment_status='paid',updated_at=now() WHERE tenant_id=v_order.tenant_id AND id=v_order.id;
  RETURN jsonb_build_object('success',true,'duplicate',false,'order_id',v_order.id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.finalize_customer_order_payment_failure(
  p_tenant_id uuid,
  p_environment text,
  p_checkout_session_id text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_session public.customer_order_payment_sessions%rowtype;
  v_order public.customer_orders%rowtype;
BEGIN
  SELECT * INTO v_session FROM public.customer_order_payment_sessions
  WHERE tenant_id=p_tenant_id AND environment=p_environment
    AND checkout_session_id=p_checkout_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment session not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_order FROM public.customer_orders
  WHERE tenant_id=v_session.tenant_id AND id=v_session.order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002'; END IF;

  -- Late failure events must never downgrade a paid or refunded order.
  IF v_session.status IN ('paid','refund_pending','refunded') OR v_order.payment_status IN ('paid','refunded') THEN
    RETURN jsonb_build_object('success',true,'ignored',true,'order_id',v_order.id);
  END IF;
  IF v_session.status='active' THEN
    UPDATE public.customer_order_payment_sessions SET status='failed',updated_at=now() WHERE id=v_session.id;
    UPDATE public.customer_orders SET payment_status='failed',updated_at=now()
      WHERE tenant_id=v_order.tenant_id AND id=v_order.id AND payment_status IN ('not_started','pending','failed');
  END IF;
  RETURN jsonb_build_object('success',true,'ignored',false,'order_id',v_order.id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.finalize_customer_order_refund(
  p_tenant_id uuid,
  p_payment_session_id uuid,
  p_refund_id text,
  p_refunded_amount_centavos bigint
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_session public.customer_order_payment_sessions%rowtype;
  v_order public.customer_orders%rowtype;
BEGIN
  IF coalesce(btrim(p_refund_id),'')='' OR p_refunded_amount_centavos IS NULL OR p_refunded_amount_centavos<=0 THEN
    RAISE EXCEPTION 'Invalid refund confirmation' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_session FROM public.customer_order_payment_sessions
    WHERE tenant_id=p_tenant_id AND id=p_payment_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment session not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_order FROM public.customer_orders
    WHERE tenant_id=v_session.tenant_id AND id=v_session.order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002'; END IF;
  IF v_session.status='refunded' AND v_session.refund_id=p_refund_id THEN
    RETURN jsonb_build_object('success',true,'duplicate',true,'order_id',v_order.id);
  END IF;
  IF v_session.status<>'refund_pending' OR p_refunded_amount_centavos<>v_session.amount_centavos THEN
    RAISE EXCEPTION 'Refund does not match the pending full refund' USING ERRCODE='22023';
  END IF;
  UPDATE public.customer_order_payment_sessions SET status='refunded',refund_id=p_refund_id,
    refunded_amount_centavos=p_refunded_amount_centavos,refunded_at=now(),updated_at=now()
    WHERE id=v_session.id;
  UPDATE public.customer_orders SET payment_status='refunded',updated_at=now()
    WHERE tenant_id=v_order.tenant_id AND id=v_order.id AND payment_status='paid';
  RETURN jsonb_build_object('success',true,'duplicate',false,'order_id',v_order.id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.finalize_customer_order_payment(uuid,text,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_customer_order_payment(uuid,text,text,bigint) TO service_role;
REVOKE ALL ON FUNCTION public.finalize_customer_order_payment_failure(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_customer_order_payment_failure(uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.finalize_customer_order_refund(uuid,uuid,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_customer_order_refund(uuid,uuid,text,bigint) TO service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261102020000', 'allow_secret_key_payment_finalization');
COMMIT;
