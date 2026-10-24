-- W2T-009: Synthetic dashboard data security checks; no data remains.
BEGIN;
DO $test$
DECLARE
  v_admin uuid;
  v_result jsonb;
  v_denied boolean;
  v_fixture uuid:=gen_random_uuid();
BEGIN
  SELECT user_id INTO v_admin FROM public.platform_admins
  WHERE is_active=true ORDER BY created_at LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'No active admin for acceptance test';END IF;
  IF has_function_privilege('anon','public.web2table_admin_dashboard_snapshot()','EXECUTE')
  THEN RAISE EXCEPTION 'Dashboard callable by guests'; END IF;
  PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',v_admin::text,'role','authenticated','aal','aal1')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_denied:=false;
  BEGIN PERFORM public.web2table_admin_dashboard_snapshot();
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'AAL1 admin could view dashboard';END IF;
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',v_admin::text,'role','authenticated','aal','aal2')::text,true);
  v_result:=public.web2table_admin_dashboard_snapshot();
  IF jsonb_typeof(v_result->'monitoring')<>'array'
  OR jsonb_typeof(v_result->'summary')<>'object'
  OR (v_result->'summary'->>'active_system_administrators')::int<1
  THEN RAISE EXCEPTION 'Invalid secure dashboard response';END IF;
  EXECUTE 'RESET ROLE';
  INSERT INTO public.tenants(id,slug,name,status)
  VALUES(v_fixture,'w2t-test-admin-dashboard-fixture','Synthetic Fixture Restaurant','active');
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_result:=public.web2table_admin_dashboard_snapshot();
  IF NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_result->'monitoring') AS x
    WHERE x->>'restaurant_name'='Synthetic Fixture Restaurant' AND x->>'orders_today'='0'
  ) OR (v_result->'summary'->>'active_restaurants')::int<1
  THEN RAISE EXCEPTION 'Dashboard tenant mismatch';END IF;
  EXECUTE 'RESET ROLE';
END;
$test$;
ROLLBACK;
SELECT 'W2T-009 secure dashboard tests passed; synthetic data rolled back' AS result;
