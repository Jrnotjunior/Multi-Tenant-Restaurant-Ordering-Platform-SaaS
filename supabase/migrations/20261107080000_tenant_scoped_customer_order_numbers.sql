-- Make customer-facing order numbers tenant-scoped.
-- Existing orders are renumbered chronologically within each tenant so each
-- restaurant's history starts at 00001. Order UUIDs and audit references remain unchanged.
LOCK TABLE public.customer_orders IN ACCESS EXCLUSIVE MODE;
ALTER TABLE public.customer_orders DROP CONSTRAINT IF EXISTS customer_orders_order_number_key;
ALTER TABLE public.customer_orders ALTER COLUMN order_number DROP IDENTITY IF EXISTS;
WITH ranked_orders AS (
  SELECT id, row_number() OVER (PARTITION BY tenant_id ORDER BY created_at ASC, id ASC)::bigint AS tenant_order_number
  FROM public.customer_orders
)
UPDATE public.customer_orders AS orders
SET order_number = ranked_orders.tenant_order_number
FROM ranked_orders
WHERE orders.id = ranked_orders.id
  AND orders.order_number IS DISTINCT FROM ranked_orders.tenant_order_number;
ALTER TABLE public.customer_orders ADD CONSTRAINT customer_orders_tenant_order_number_key UNIQUE (tenant_id, order_number);
CREATE TABLE IF NOT EXISTS private.tenant_order_number_counters (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  last_order_number bigint NOT NULL DEFAULT 0 CHECK (last_order_number >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO private.tenant_order_number_counters (tenant_id, last_order_number)
SELECT tenant_id, coalesce(max(order_number), 0)
FROM public.customer_orders
GROUP BY tenant_id
ON CONFLICT (tenant_id) DO UPDATE
SET last_order_number = EXCLUDED.last_order_number, updated_at = now();
CREATE OR REPLACE FUNCTION private.assign_tenant_order_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO private.tenant_order_number_counters (tenant_id,last_order_number,updated_at)
  VALUES (NEW.tenant_id,1,now())
  ON CONFLICT (tenant_id) DO UPDATE
  SET last_order_number = private.tenant_order_number_counters.last_order_number + 1,
      updated_at = now()
  RETURNING last_order_number INTO NEW.order_number;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.assign_tenant_order_number() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS customer_orders_assign_tenant_order_number ON public.customer_orders;
CREATE TRIGGER customer_orders_assign_tenant_order_number
BEFORE INSERT ON public.customer_orders
FOR EACH ROW EXECUTE FUNCTION private.assign_tenant_order_number();
COMMENT ON TABLE private.tenant_order_number_counters IS 'Atomic per-tenant counter for customer-facing restaurant order numbers.';
