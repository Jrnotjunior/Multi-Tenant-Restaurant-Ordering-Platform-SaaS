-- Ensure every successful payment path records the payment time used by cashier sales.
BEGIN;

CREATE OR REPLACE FUNCTION public.stamp_customer_order_payment_collection()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.payment_status = 'paid' AND (
    TG_OP = 'INSERT'
    OR OLD.payment_status IS DISTINCT FROM 'paid'
  ) THEN
    NEW.payment_collected_at := coalesce(NEW.payment_collected_at, now());
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS customer_orders_stamp_payment_collection ON public.customer_orders;
CREATE TRIGGER customer_orders_stamp_payment_collection
BEFORE INSERT OR UPDATE OF payment_status ON public.customer_orders
FOR EACH ROW EXECUTE FUNCTION public.stamp_customer_order_payment_collection();

-- Existing paid orders may predate the timestamp field being populated on all
-- payment paths. updated_at is the only available historical approximation.
UPDATE public.customer_orders
SET payment_collected_at = updated_at
WHERE payment_status = 'paid' AND payment_collected_at IS NULL;

COMMIT;
