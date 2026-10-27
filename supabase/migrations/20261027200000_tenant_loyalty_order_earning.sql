-- Award tenant-configured loyalty points once an authenticated customer's order is both
-- completed and paid. All balance changes happen in the database, not the browser.
BEGIN;

ALTER TABLE public.tenant_customer_loyalty_accounts
  ADD COLUMN IF NOT EXISTS eligible_spend_centavos bigint NOT NULL DEFAULT 0;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tenant_customer_loyalty_accounts'::regclass
      AND conname = 'tenant_customer_loyalty_accounts_eligible_spend_check'
  ) THEN
    ALTER TABLE public.tenant_customer_loyalty_accounts
      ADD CONSTRAINT tenant_customer_loyalty_accounts_eligible_spend_check
      CHECK (eligible_spend_centavos >= 0);
  END IF;
END
$constraints$;

ALTER TABLE public.customer_orders
  ADD COLUMN IF NOT EXISTS loyalty_processed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_customer_loyalty_order_transaction_unique
  ON public.tenant_customer_loyalty_transactions (tenant_id, order_id, transaction_type)
  WHERE order_id IS NOT NULL AND transaction_type IN ('earned', 'redeemed');

CREATE OR REPLACE FUNCTION private.apply_completed_order_loyalty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_threshold numeric;
  v_threshold_centavos bigint;
  v_points_awarded integer;
  v_enabled boolean := false;
  v_previous_spend bigint := 0;
  v_next_spend bigint := 0;
  v_points_delta bigint := 0;
BEGIN
  -- Only act on the transition into the eligible state. The marker protects against
  -- retries or later status/payment changes from awarding the same order twice.
  IF NOT (
    NEW.order_status IN ('delivered', 'completed')
    AND NEW.payment_status = 'paid'
  ) OR (
    OLD.order_status IN ('delivered', 'completed')
    AND OLD.payment_status = 'paid'
  ) OR NEW.loyalty_processed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Mark this order as evaluated even when loyalty is disabled or the customer
  -- checked out as a guest. This prevents retroactive rewards from later setting changes.
  UPDATE public.customer_orders
  SET loyalty_processed_at = now()
  WHERE id = NEW.id
    AND tenant_id = NEW.tenant_id
    AND loyalty_processed_at IS NULL;

  IF NOT FOUND OR NEW.customer_user_id IS NULL OR NEW.subtotal_centavos <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT s.enabled, s.amount_threshold, s.points_awarded
    INTO v_enabled, v_threshold, v_points_awarded
  FROM public.tenant_loyalty_settings s
  WHERE s.tenant_id = NEW.tenant_id;

  IF NOT FOUND OR NOT coalesce(v_enabled, false)
     OR v_threshold IS NULL OR v_threshold <= 0
     OR v_points_awarded IS NULL OR v_points_awarded <= 0 THEN
    RETURN NEW;
  END IF;

  v_threshold_centavos := round(v_threshold * 100)::bigint;
  IF v_threshold_centavos <= 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.tenant_customer_loyalty_accounts (
    tenant_id, customer_user_id, points_balance,
    lifetime_points_earned, lifetime_points_redeemed,
    eligible_spend_centavos, updated_at
  ) VALUES (
    NEW.tenant_id, NEW.customer_user_id, 0, 0, 0, 0, now()
  )
  ON CONFLICT (tenant_id, customer_user_id) DO NOTHING;

  -- Serialize concurrent orders for the same customer and tenant.
  SELECT a.eligible_spend_centavos
    INTO v_previous_spend
  FROM public.tenant_customer_loyalty_accounts a
  WHERE a.tenant_id = NEW.tenant_id
    AND a.customer_user_id = NEW.customer_user_id
  FOR UPDATE;

  v_previous_spend := coalesce(v_previous_spend, 0);
  v_next_spend := v_previous_spend + NEW.subtotal_centavos;
  v_points_delta :=
    ((v_next_spend / v_threshold_centavos) -
     (v_previous_spend / v_threshold_centavos)) * v_points_awarded;

  IF v_points_delta > 2147483647 THEN
    RAISE EXCEPTION 'Configured loyalty award exceeds the supported points limit'
      USING ERRCODE = '22003';
  END IF;

  UPDATE public.tenant_customer_loyalty_accounts
  SET eligible_spend_centavos = v_next_spend,
      points_balance = points_balance + v_points_delta::integer,
      lifetime_points_earned = lifetime_points_earned + v_points_delta::integer,
      updated_at = now()
  WHERE tenant_id = NEW.tenant_id
    AND customer_user_id = NEW.customer_user_id;

  IF v_points_delta > 0 THEN
    INSERT INTO public.tenant_customer_loyalty_transactions (
      tenant_id, customer_user_id, points_change, transaction_type,
      description, order_id
    ) VALUES (
      NEW.tenant_id, NEW.customer_user_id, v_points_delta::integer, 'earned',
      'Points awarded for completed and paid order #' || NEW.order_number::text,
      NEW.id
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.apply_completed_order_loyalty() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS customer_order_apply_loyalty ON public.customer_orders;
CREATE TRIGGER customer_order_apply_loyalty
AFTER UPDATE OF order_status, payment_status ON public.customer_orders
FOR EACH ROW
EXECUTE FUNCTION private.apply_completed_order_loyalty();

COMMIT;
