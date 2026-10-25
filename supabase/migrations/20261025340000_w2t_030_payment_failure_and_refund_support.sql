-- W2T-030: durable payment failure/refund state and owner-authorized refund requests.
BEGIN;

ALTER TABLE public.customer_order_payment_sessions
  ADD COLUMN IF NOT EXISTS paymongo_payment_id text,
  ADD COLUMN IF NOT EXISTS refund_id text,
  ADD COLUMN IF NOT EXISTS refunded_amount_centavos bigint,
  ADD COLUMN IF NOT EXISTS refund_reason text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

ALTER TABLE public.customer_order_payment_sessions
  DROP CONSTRAINT IF EXISTS customer_order_payment_sessions_status_check;
ALTER TABLE public.customer_order_payment_sessions
  ADD CONSTRAINT customer_order_payment_sessions_status_check
  CHECK (status IN ('creating','active','paid','failed','expired','refund_pending','refunded'));

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
  IF coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Trusted payment processor access required' USING ERRCODE='42501';
  END IF;
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

CREATE OR REPLACE FUNCTION public.request_customer_order_refund(
  p_tenant_id uuid,
  p_order_id uuid,
  p_reason text DEFAULT 'requested_by_customer'
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_order public.customer_orders%rowtype;
  v_session public.customer_order_payment_sessions%rowtype;
  v_reason text := left(btrim(coalesce(p_reason,'requested_by_customer')),240);
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT private.is_active_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'Verified restaurant owner session required' USING ERRCODE='42501';
  END IF;
  IF v_reason='' THEN RAISE EXCEPTION 'Refund reason is required' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_order FROM public.customer_orders
    WHERE tenant_id=p_tenant_id AND id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002'; END IF;
  IF v_order.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'Only paid orders can be refunded' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_session FROM public.customer_order_payment_sessions
    WHERE tenant_id=p_tenant_id AND order_id=p_order_id AND status='paid'
    ORDER BY paid_at DESC NULLS LAST LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paid payment session not found' USING ERRCODE='P0002'; END IF;
  IF v_session.paymongo_payment_id IS NULL OR v_session.paymongo_payment_id='' THEN
    RAISE EXCEPTION 'The payment provider reference is missing; manual review is required' USING ERRCODE='22023';
  END IF;
  UPDATE public.customer_order_payment_sessions
    SET status='refund_pending',refund_reason=v_reason,updated_at=now() WHERE id=v_session.id;
  RETURN jsonb_build_object(
    'success',true,'order_id',v_order.id,'payment_session_id',v_session.id,
    'tenant_id',v_session.tenant_id,'environment',v_session.environment,
    'paymongo_account_id',v_session.paymongo_account_id,
    'paymongo_payment_id',v_session.paymongo_payment_id,
    'amount_centavos',v_session.amount_centavos,'reason',v_reason
  );
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
  IF coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Trusted payment processor access required' USING ERRCODE='42501';
  END IF;
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

REVOKE ALL ON FUNCTION public.finalize_customer_order_payment_failure(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_customer_order_payment_failure(uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.request_customer_order_refund(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_customer_order_refund(uuid,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.finalize_customer_order_refund(uuid,uuid,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_customer_order_refund(uuid,uuid,text,bigint) TO service_role;

COMMIT;
