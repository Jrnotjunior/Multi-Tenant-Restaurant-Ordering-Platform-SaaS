-- Keep PayMongo refund attempts safe to retry and distinguish each attempt.
BEGIN;

ALTER TABLE public.customer_order_payment_sessions
  ADD COLUMN IF NOT EXISTS refund_attempt_key text,
  ADD COLUMN IF NOT EXISTS refund_attempt_started_at timestamptz;

-- Preserve the idempotency key used by the previous endpoint for in-flight
-- refunds so a recovery attempt cannot create a second refund.
UPDATE public.customer_order_payment_sessions
SET refund_attempt_key = coalesce(refund_attempt_key, 'w2t-refund-' || id::text),
    refund_attempt_started_at = coalesce(refund_attempt_started_at, updated_at, now())
WHERE status = 'refund_pending';

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
  v_reason text := left(btrim(coalesce(p_reason, 'requested_by_customer')), 240);
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT private.is_active_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'Verified restaurant owner session required' USING ERRCODE='42501';
  END IF;
  IF v_reason NOT IN ('requested_by_customer', 'duplicate', 'fraudulent', 'others') THEN
    RAISE EXCEPTION 'Choose a supported refund reason' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_order FROM public.customer_orders
    WHERE tenant_id = p_tenant_id AND id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002'; END IF;
  IF v_order.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'Only paid orders can be refunded' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_session FROM public.customer_order_payment_sessions
    WHERE tenant_id = p_tenant_id AND order_id = p_order_id AND status IN ('paid', 'refund_pending')
    ORDER BY paid_at DESC NULLS LAST, created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paid payment session not found' USING ERRCODE='P0002'; END IF;
  IF coalesce(v_session.paymongo_payment_id, '') = '' THEN
    RAISE EXCEPTION 'The payment provider reference is missing; manual review is required' USING ERRCODE='22023';
  END IF;

  IF v_session.status = 'refund_pending' THEN
    v_reason := coalesce(nullif(v_session.refund_reason, ''), v_reason);
    IF coalesce(v_session.refund_attempt_key, '') = '' THEN
      UPDATE public.customer_order_payment_sessions
      SET refund_attempt_key = 'w2t-refund-' || gen_random_uuid()::text,
          refund_attempt_started_at = coalesce(refund_attempt_started_at, updated_at, now()),
          updated_at = now()
      WHERE id = v_session.id
      RETURNING * INTO v_session;
    END IF;
  ELSE
    UPDATE public.customer_order_payment_sessions
    SET status = 'refund_pending',
        refund_reason = v_reason,
        refund_id = NULL,
        refunded_amount_centavos = NULL,
        refunded_at = NULL,
        refund_attempt_key = 'w2t-refund-' || gen_random_uuid()::text,
        refund_attempt_started_at = now(),
        updated_at = now()
    WHERE id = v_session.id
    RETURNING * INTO v_session;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order.id,
    'payment_session_id', v_session.id,
    'tenant_id', v_session.tenant_id,
    'environment', v_session.environment,
    'paymongo_account_id', v_session.paymongo_account_id,
    'paymongo_payment_id', v_session.paymongo_payment_id,
    'amount_centavos', v_session.amount_centavos,
    'reason', v_reason,
    'refund_id', v_session.refund_id,
    'refund_attempt_key', v_session.refund_attempt_key,
    'refund_attempt_started_at', v_session.refund_attempt_started_at
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.request_customer_order_refund(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_customer_order_refund(uuid, uuid, text) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261102030000', 'durable_owner_paymongo_refunds');

COMMIT;
