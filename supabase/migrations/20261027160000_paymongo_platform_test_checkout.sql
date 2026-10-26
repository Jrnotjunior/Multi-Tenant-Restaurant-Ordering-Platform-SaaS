-- Allow tenant-scoped test checkout sessions to use the platform's PayMongo test account.
-- Live payments continue to require a connected tenant PayMongo account.
BEGIN;
ALTER TABLE public.customer_order_payment_sessions
  DROP CONSTRAINT IF EXISTS customer_order_payment_sessions_paymongo_account_id_check;
ALTER TABLE public.customer_order_payment_sessions
  ADD CONSTRAINT customer_order_payment_sessions_paymongo_account_id_check
  CHECK (paymongo_account_id ~ '^org_[A-Za-z0-9]+$' OR (environment='test' AND paymongo_account_id='platform_test'));
ALTER TABLE public.tenant_paymongo_accounts
  DROP CONSTRAINT IF EXISTS tenant_paymongo_accounts_paymongo_account_id_check;
ALTER TABLE public.tenant_paymongo_accounts
  ADD CONSTRAINT tenant_paymongo_accounts_paymongo_account_id_check
  CHECK (paymongo_account_id IS NULL OR paymongo_account_id ~ '^org_[A-Za-z0-9]+$' OR (environment='test' AND paymongo_account_id='platform_test'));
COMMIT;
