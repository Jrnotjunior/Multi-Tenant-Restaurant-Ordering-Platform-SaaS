-- W2T-009: read-only original System Admin dashboard adapter.
-- Data comes exclusively from Web2Table's live tenant and administrator model.
-- The order/customer metrics are zero until those systems are implemented.
BEGIN;
CREATE FUNCTION private.web2table_admin_dashboard_snapshot()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_total bigint;
 v_active bigint;
 v_admins bigint;
 v_monitoring jsonb;
BEGIN
 IF NOT private.is_platform_admin() THEN
  RAISE EXCEPTION 'Verified platform administrator MFA session required' USING ERRCODE='42501';
 END IF;

 SELECT count(*),count(*) FILTER(WHERE status='active')
 INTO v_total,v_active FROM public.tenants;
 SELECT count(*) INTO v_admins
 FROM public.platform_admins WHERE is_active=true;

 SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'restaurant_id',t.id,
      'restaurant_name',t.name,
      'is_active',(t.status='active'),
      'customer_accounts',0,
      'customers_ordered_today',0,
      'orders_today',0,
      'processing_orders',0,
      'last_activity',null,
      'logged_in_now',null
    ) ORDER BY t.created_at DESC
 ),'[]'::jsonb)
 INTO v_monitoring
 FROM (SELECT id,name,status,created_at FROM public.tenants
       ORDER BY created_at DESC LIMIT 100) t;

 RETURN jsonb_build_object(
   'summary',jsonb_build_object(
     'total_restaurants',v_total,
     'active_restaurants',v_active,
     'inactive_restaurants',v_total-v_active,
     'active_system_administrators',v_admins,
     'pending_system_administrators',0
   ),
   'monitoring',v_monitoring
 );
END;
$fn$;

CREATE FUNCTION public.web2table_admin_dashboard_snapshot()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
 SELECT private.web2table_admin_dashboard_snapshot();
$fn$;

REVOKE ALL ON FUNCTION private.web2table_admin_dashboard_snapshot(),
 public.web2table_admin_dashboard_snapshot()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.web2table_admin_dashboard_snapshot(),
 public.web2table_admin_dashboard_snapshot() TO authenticated;
COMMIT;
