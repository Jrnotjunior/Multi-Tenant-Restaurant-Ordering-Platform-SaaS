-- W2T-026: expose order creation only through the public validation wrapper.
-- The private implementation remains callable by the wrapper owner, not API roles.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_customer_order(
  p_restaurant_slug text,
  p_branch_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address text,
  p_delivery_notes text,
  p_idempotency_key uuid,
  p_order_type text,
  p_items jsonb
) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = ''
AS $fn$
  SELECT private.create_customer_order(
    p_restaurant_slug,p_branch_slug,p_customer_name,p_customer_phone,
    p_delivery_address,p_delivery_notes,p_idempotency_key,p_order_type,p_items
  );
$fn$;

REVOKE ALL ON FUNCTION private.create_customer_order(text,text,text,text,text,text,uuid,text,jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_customer_order(text,text,text,text,text,text,uuid,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_order(text,text,text,text,text,text,uuid,text,jsonb)
  TO anon, authenticated;

COMMIT;
