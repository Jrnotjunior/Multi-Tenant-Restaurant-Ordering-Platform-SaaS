-- Enforce restaurant accepting_orders and weekly operating hours at the database boundary.
-- Existing idempotent retries remain readable even after a store closes.
BEGIN;

CREATE OR REPLACE FUNCTION private.enforce_storefront_order_availability()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_store record;
  v_timezone text;
  v_local timestamp without time zone;
  v_today_key text;
  v_previous_key text;
  v_schedule jsonb;
  v_today jsonb;
  v_previous jsonb;
  v_open time;
  v_close time;
  v_previous_open time;
  v_previous_close time;
  v_is_open boolean := false;
BEGIN
  -- Do not block a legitimate idempotent retry for an order already created.
  IF EXISTS (
    SELECT 1 FROM public.customer_orders existing
    WHERE existing.tenant_id = NEW.tenant_id
      AND existing.idempotency_key = NEW.idempotency_key
  ) THEN
    RETURN NEW;
  END IF;

  SELECT storefront.status, storefront.accepting_orders, storefront.opening_hours
    INTO v_store
  FROM public.tenant_storefronts storefront
  WHERE storefront.tenant_id = NEW.tenant_id
  FOR SHARE;

  IF NOT FOUND OR v_store.status <> 'published' OR v_store.accepting_orders IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'This restaurant is currently not accepting orders.'
      USING ERRCODE = 'P0001';
  END IF;

  v_timezone := COALESCE(v_store.opening_hours->>'timezone', 'Asia/Manila');
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v_timezone) THEN
    v_timezone := 'Asia/Manila';
  END IF;
  v_local := now() AT TIME ZONE v_timezone;

  v_today_key := CASE EXTRACT(ISODOW FROM v_local)::integer
    WHEN 1 THEN 'monday' WHEN 2 THEN 'tuesday' WHEN 3 THEN 'wednesday'
    WHEN 4 THEN 'thursday' WHEN 5 THEN 'friday' WHEN 6 THEN 'saturday'
    ELSE 'sunday' END;
  v_previous_key := CASE EXTRACT(ISODOW FROM (v_local - interval '1 day'))::integer
    WHEN 1 THEN 'monday' WHEN 2 THEN 'tuesday' WHEN 3 THEN 'wednesday'
    WHEN 4 THEN 'thursday' WHEN 5 THEN 'friday' WHEN 6 THEN 'saturday'
    ELSE 'sunday' END;

  v_schedule := v_store.opening_hours->'schedule';
  IF jsonb_typeof(v_schedule) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'The restaurant operating hours are not configured.'
      USING ERRCODE = 'P0001';
  END IF;

  v_today := v_schedule->v_today_key;
  v_previous := v_schedule->v_previous_key;

  -- Handle a normal same-day opening interval.
  IF COALESCE((v_today->>'isOpen')::boolean, false)
     AND COALESCE(v_today->>'open', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     AND COALESCE(v_today->>'close', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    v_open := (v_today->>'open')::time;
    v_close := (v_today->>'close')::time;
    IF v_open < v_close AND v_local::time >= v_open AND v_local::time < v_close THEN
      v_is_open := true;
    ELSIF v_open > v_close AND v_local::time >= v_open THEN
      -- Overnight interval beginning today.
      v_is_open := true;
    END IF;
  END IF;

  -- If today's interval did not open the store, check whether yesterday's
  -- overnight interval is still active after midnight.
  IF NOT v_is_open
     AND COALESCE((v_previous->>'isOpen')::boolean, false)
     AND COALESCE(v_previous->>'open', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     AND COALESCE(v_previous->>'close', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    v_previous_open := (v_previous->>'open')::time;
    v_previous_close := (v_previous->>'close')::time;
    IF v_previous_open > v_previous_close AND v_local::time < v_previous_close THEN
      v_is_open := true;
    END IF;
  END IF;

  IF NOT v_is_open THEN
    RAISE EXCEPTION 'This restaurant is currently closed. Please order during its operating hours.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS customer_orders_storefront_availability ON public.customer_orders;
CREATE TRIGGER customer_orders_storefront_availability
BEFORE INSERT ON public.customer_orders
FOR EACH ROW
EXECUTE FUNCTION private.enforce_storefront_order_availability();

REVOKE ALL ON FUNCTION private.enforce_storefront_order_availability() FROM PUBLIC, anon, authenticated;

COMMIT;
