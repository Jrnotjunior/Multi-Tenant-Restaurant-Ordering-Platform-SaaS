-- Resolve a tracked order's actual branch for pickup instructions. The tracking token
-- is the same unguessable authorization used by track_customer_order.
CREATE OR REPLACE FUNCTION public.get_customer_order_branch_location(p_tracking_token uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
 SELECT jsonb_build_object('branchName',b.name,'branchAddress',b.store_address)
 FROM public.customer_orders o
 JOIN public.branches b ON b.tenant_id=o.tenant_id AND b.id=o.branch_id
 WHERE o.idempotency_key=p_tracking_token AND p_tracking_token IS NOT NULL;
$fn$;
REVOKE ALL ON FUNCTION public.get_customer_order_branch_location(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_order_branch_location(uuid) TO anon,authenticated,service_role;