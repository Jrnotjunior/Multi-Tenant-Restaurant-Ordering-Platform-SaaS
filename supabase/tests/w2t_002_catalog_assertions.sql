-- W2T-002 read-only catalog assertions. Execute after the migration.
DO $test$
DECLARE failures text;
BEGIN
  SELECT string_agg(t.table_name, ', ') INTO failures
  FROM (VALUES ('tenants'),('branches'),('tenant_memberships'),('branch_memberships'),('tenant_domains')) t(table_name)
  LEFT JOIN pg_class c ON c.oid = to_regclass('public.' || t.table_name)
  WHERE c.oid IS NULL OR c.relrowsecurity IS DISTINCT FROM true;
  IF failures IS NOT NULL THEN RAISE EXCEPTION 'Missing tables or RLS: %', failures; END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES ('tenants'),('branches'),('tenant_memberships'),('branch_memberships'),('tenant_domains')) t(table_name)
    WHERE has_table_privilege('anon', 'public.' || t.table_name, 'SELECT')
       OR has_table_privilege('anon', 'public.' || t.table_name, 'INSERT')
       OR has_table_privilege('anon', 'public.' || t.table_name, 'UPDATE')
       OR has_table_privilege('anon', 'public.' || t.table_name, 'DELETE')
       OR has_table_privilege('authenticated', 'public.' || t.table_name, 'INSERT')
       OR has_table_privilege('authenticated', 'public.' || t.table_name, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || t.table_name, 'DELETE')
  ) THEN RAISE EXCEPTION 'Unexpected browser privileges'; END IF;
END;
$test$;
