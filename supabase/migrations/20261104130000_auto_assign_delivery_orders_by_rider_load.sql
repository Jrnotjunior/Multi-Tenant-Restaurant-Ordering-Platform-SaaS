-- Assign delivery orders automatically when enabled, balancing active rider workloads per branch.
-- Assignment happens inside the staff order transition transaction so concurrent ready events serialize.
BEGIN;

DO $migration$
DECLARE
  v_definition text;
  v_updated text;
  v_declare_anchor text := 'v_next_status text;';
  v_declare_replacement text := 'v_next_status text; v_auto_assign_enabled boolean := false; v_auto_assigned_rider uuid;';
  v_action_anchor text := 'v_next_status:=CASE p_action WHEN ''start_preparing'' THEN CASE WHEN v_order.order_status=''confirmed'' THEN ''preparing'' END WHEN ''mark_ready'' THEN CASE WHEN v_order.order_status=''preparing'' THEN CASE WHEN v_order.order_type=''delivery'' THEN ''ready_for_dispatch'' ELSE ''ready_for_pickup'' END END END;';
  v_action_replacement text := v_action_anchor || E'
   IF p_action = ''mark_ready'' AND v_order.order_type = ''delivery'' THEN
     SELECT coalesce((s.rider_assignment->>''auto_assign'')::boolean, false)
       INTO v_auto_assign_enabled
     FROM public.tenant_storefronts s
     WHERE s.tenant_id = p_tenant_id;

     IF v_auto_assign_enabled THEN
       -- Serialize automatic allocations within a branch so concurrent orders
       -- cannot select a rider using the same stale workload count.
       PERFORM 1
       FROM public.branches b
       WHERE b.tenant_id = p_tenant_id AND b.id = v_order.branch_id
       FOR UPDATE;

       IF NOT EXISTS (
         SELECT 1 FROM public.delivery_assignments da
         WHERE da.tenant_id = p_tenant_id AND da.order_id = p_order_id
           AND da.status IN (''assigned'', ''accepted'', ''dispatched'', ''out_for_delivery'', ''arrived_at_customer'')
       ) THEN
         SELECT tm.user_id
           INTO v_auto_assigned_rider
         FROM public.tenant_memberships tm
         JOIN public.branch_memberships bm
           ON bm.tenant_id = tm.tenant_id AND bm.user_id = tm.user_id
          AND bm.branch_id = v_order.branch_id
         WHERE tm.tenant_id = p_tenant_id
           AND tm.role = ''rider''
           AND tm.status = ''active''
         ORDER BY
           (
             SELECT count(*)::integer
             FROM public.delivery_assignments active_da
             WHERE active_da.tenant_id = p_tenant_id
               AND active_da.branch_id = v_order.branch_id
               AND active_da.rider_user_id = tm.user_id
               AND active_da.status IN (''assigned'', ''accepted'', ''dispatched'', ''out_for_delivery'', ''arrived_at_customer'')
           ) ASC,
           (
             SELECT max(recent_da.assigned_at)
             FROM public.delivery_assignments recent_da
             WHERE recent_da.tenant_id = p_tenant_id
               AND recent_da.branch_id = v_order.branch_id
               AND recent_da.rider_user_id = tm.user_id
           ) ASC NULLS FIRST,
           tm.user_id ASC
         LIMIT 1;

         IF v_auto_assigned_rider IS NOT NULL THEN
           INSERT INTO public.delivery_assignments (
             tenant_id, branch_id, order_id, rider_user_id, assigned_by, status
           ) VALUES (
             p_tenant_id, v_order.branch_id, p_order_id,
             v_auto_assigned_rider, v_user, ''assigned''
           )
           ON CONFLICT (tenant_id, order_id) DO NOTHING;
         END IF;
       END IF;
     END IF;
   END IF;';
BEGIN
  SELECT pg_get_functiondef('public.transition_staff_order(uuid,uuid,text)'::regprocedure)
    INTO v_definition;

  IF position(v_declare_replacement IN v_definition) > 0
     OR position('v_auto_assigned_rider' IN v_definition) > 0 THEN
    RAISE EXCEPTION 'Automatic rider assignment migration already appears to be installed';
  END IF;

  IF position(v_declare_anchor IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate transition_staff_order declaration anchor';
  END IF;
  v_updated := replace(v_definition, v_declare_anchor, v_declare_replacement);

  IF position(v_action_anchor IN v_updated) = 0 THEN
    RAISE EXCEPTION 'Could not locate kitchen mark-ready transition anchor';
  END IF;
  v_updated := replace(v_updated, v_action_anchor, v_action_replacement);

  EXECUTE v_updated;
END;
$migration$;

CREATE INDEX IF NOT EXISTS delivery_assignments_active_branch_rider_idx
  ON public.delivery_assignments (tenant_id, branch_id, rider_user_id, assigned_at)
  WHERE status IN ('assigned', 'accepted', 'dispatched', 'out_for_delivery', 'arrived_at_customer');

NOTIFY pgrst, 'reload schema';
COMMIT;
