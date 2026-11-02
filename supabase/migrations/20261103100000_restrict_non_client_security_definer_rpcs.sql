-- Prevent direct API calls to internal and obsolete SECURITY DEFINER functions.
-- These procedures are not client RPC entry points in the current application:
-- the fiscal audit writer is a trigger, and order creation uses the coordinate-
-- aware signature through the create-customer-order Edge Function.
DO $migration$
BEGIN
  IF to_regprocedure('public.capture_pos_fiscal_tax_policy_audit_event()') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON FUNCTION public.capture_pos_fiscal_tax_policy_audit_event()
      FROM PUBLIC, anon, authenticated, service_role;
  END IF;

  IF to_regprocedure('public.create_customer_order(text,text,text,text,text,text,uuid,text,jsonb)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.create_customer_order(text,text,text,text,text,text,uuid,text,jsonb)
      FROM PUBLIC, anon, authenticated;
  END IF;
END;
$migration$;
