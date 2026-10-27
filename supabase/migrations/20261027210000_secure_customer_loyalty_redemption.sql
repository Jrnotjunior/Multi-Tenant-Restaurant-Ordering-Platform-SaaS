-- Server-authoritative loyalty redemption at order placement.
BEGIN;

ALTER TABLE public.customer_orders
  ADD COLUMN IF NOT EXISTS loyalty_discount_centavos bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_points_redeemed integer NOT NULL DEFAULT 0;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.customer_orders'::regclass
      AND conname='customer_orders_loyalty_discount_nonnegative'
  ) THEN
    ALTER TABLE public.customer_orders ADD CONSTRAINT customer_orders_loyalty_discount_nonnegative
      CHECK (loyalty_discount_centavos >= 0 AND loyalty_points_redeemed >= 0);
  END IF;
END
$constraints$;

CREATE OR REPLACE FUNCTION public.apply_customer_loyalty_redemption(
  p_order_id uuid,
  p_tracking_token uuid,
  p_customer_user_id uuid,
  p_points_to_redeem integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_order public.customer_orders%rowtype;
  v_settings public.tenant_loyalty_settings%rowtype;
  v_account public.tenant_customer_loyalty_accounts%rowtype;
  v_discount_blocks integer;
  v_discount_centavos bigint;
BEGIN
  IF coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Trusted ordering service required' USING ERRCODE='42501';
  END IF;
  IF p_order_id IS NULL OR p_tracking_token IS NULL OR p_customer_user_id IS NULL
     OR p_points_to_redeem IS NULL OR p_points_to_redeem < 0 THEN
    RAISE EXCEPTION 'Invalid loyalty redemption request' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_order FROM public.customer_orders
  WHERE id=p_order_id AND idempotency_key=p_tracking_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order tracking reference does not match' USING ERRCODE='42501'; END IF;

  IF v_order.customer_user_id IS NOT NULL AND v_order.customer_user_id <> p_customer_user_id THEN
    RAISE EXCEPTION 'Order belongs to another customer' USING ERRCODE='42501';
  END IF;

  IF v_order.loyalty_points_redeemed > 0 THEN
    IF v_order.customer_user_id=p_customer_user_id AND v_order.loyalty_points_redeemed=p_points_to_redeem THEN
      RETURN jsonb_build_object('success',true,'duplicate',true,
        'points_redeemed',v_order.loyalty_points_redeemed,
        'discount_centavos',v_order.loyalty_discount_centavos,
        'total_centavos',v_order.total_centavos);
    END IF;
    RAISE EXCEPTION 'Loyalty redemption was already applied to this order' USING ERRCODE='22023';
  END IF;

  IF p_points_to_redeem = 0 THEN
    UPDATE public.customer_orders SET customer_user_id=p_customer_user_id
    WHERE id=v_order.id AND tenant_id=v_order.tenant_id AND customer_user_id IS NULL;
    RETURN jsonb_build_object('success',true,'points_redeemed',0,'discount_centavos',0,
      'total_centavos',v_order.total_centavos);
  END IF;

  IF v_order.order_status <> 'pending_confirmation'
     OR v_order.payment_status NOT IN ('not_started','pending','failed') THEN
    RAISE EXCEPTION 'Loyalty can only be redeemed before payment and order confirmation' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_settings FROM public.tenant_loyalty_settings
  WHERE tenant_id=v_order.tenant_id;
  IF NOT FOUND OR NOT v_settings.redemption_enabled
     OR v_settings.redemption_points <= 0 OR v_settings.redemption_amount <= 0 THEN
    RAISE EXCEPTION 'This restaurant has not enabled loyalty redemption' USING ERRCODE='22023';
  END IF;

  IF p_points_to_redeem % v_settings.redemption_points <> 0 THEN
    RAISE EXCEPTION 'Redeem points in multiples of the restaurant reward increment (% points)', v_settings.redemption_points
      USING ERRCODE='22023';
  END IF;

  v_discount_blocks := p_points_to_redeem / v_settings.redemption_points;
  v_discount_centavos := round(v_settings.redemption_amount * 100)::bigint * v_discount_blocks;
  IF v_discount_centavos <= 0 OR v_discount_centavos > v_order.subtotal_centavos THEN
    RAISE EXCEPTION 'The configured reward exceeds this order subtotal' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.tenant_customer_loyalty_accounts (
    tenant_id,customer_user_id,points_balance,lifetime_points_earned,lifetime_points_redeemed
  ) VALUES (v_order.tenant_id,p_customer_user_id,0,0,0)
  ON CONFLICT (tenant_id,customer_user_id) DO NOTHING;

  SELECT * INTO v_account FROM public.tenant_customer_loyalty_accounts
  WHERE tenant_id=v_order.tenant_id AND customer_user_id=p_customer_user_id FOR UPDATE;
  IF NOT FOUND OR v_account.points_balance < p_points_to_redeem THEN
    RAISE EXCEPTION 'Not enough loyalty points for this reward' USING ERRCODE='22023';
  END IF;

  UPDATE public.tenant_customer_loyalty_accounts
  SET points_balance=points_balance-p_points_to_redeem,
      lifetime_points_redeemed=lifetime_points_redeemed+p_points_to_redeem,
      updated_at=now()
  WHERE tenant_id=v_order.tenant_id AND customer_user_id=p_customer_user_id;

  UPDATE public.customer_orders
  SET customer_user_id=p_customer_user_id,
      loyalty_points_redeemed=p_points_to_redeem,
      loyalty_discount_centavos=v_discount_centavos,
      total_centavos=greatest(0,coalesce(total_centavos,subtotal_centavos+coalesce(delivery_fee_centavos,0))-v_discount_centavos),
      updated_at=now()
  WHERE id=v_order.id AND tenant_id=v_order.tenant_id;

  INSERT INTO public.tenant_customer_loyalty_transactions (
    tenant_id,customer_user_id,points_change,transaction_type,description,order_id
  ) VALUES (
    v_order.tenant_id,p_customer_user_id,-p_points_to_redeem,'redeemed',
    'Points redeemed for order #' || v_order.order_number::text,v_order.id
  );

  RETURN jsonb_build_object('success',true,'duplicate',false,
    'points_redeemed',p_points_to_redeem,'discount_centavos',v_discount_centavos,
    'total_centavos',greatest(0,coalesce(v_order.total_centavos,v_order.subtotal_centavos+coalesce(v_order.delivery_fee_centavos,0))-v_discount_centavos));
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_customer_loyalty_redemption(uuid,uuid,uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_customer_loyalty_redemption(uuid,uuid,uuid,integer) TO service_role;

COMMIT;
