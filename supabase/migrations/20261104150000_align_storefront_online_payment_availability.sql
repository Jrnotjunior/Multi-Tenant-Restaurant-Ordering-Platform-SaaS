DO $migration$
DECLARE
  v_definition text;
  v_old text := $old$coalesce((s.online_payments->>'enabled')::boolean,false)
      AND EXISTS ($old$;
  v_new text := $new$coalesce((s.online_payments->>'enabled')::boolean,false)
      AND coalesce((s.online_payments->>'provider_configured')::boolean,false)
      AND EXISTS (
        SELECT 1
        FROM public.tenant_paymongo_accounts account
        WHERE account.tenant_id = t.id
          AND account.environment = 'live'
          AND account.connection_status = 'active'
          AND account.paymongo_account_id IS NOT NULL
      )
      AND EXISTS ($new$;
BEGIN
  v_definition := pg_get_functiondef('private.get_published_storefront(text)'::regprocedure);
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected online-payment availability expression was not found; refusing to change the storefront function.';
  END IF;
  IF position(v_new IN v_definition) > 0 THEN
    RAISE NOTICE 'Published storefront payment availability is already aligned.';
    RETURN;
  END IF;
  v_definition := replace(v_definition, v_old, v_new);
  EXECUTE v_definition;
END
$migration$;

NOTIFY pgrst, 'reload schema';