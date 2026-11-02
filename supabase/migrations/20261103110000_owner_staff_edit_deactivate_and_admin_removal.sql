-- Owner-controlled staff access; system administrators may remove disabled
-- staff memberships without deleting the shared auth user or historic records.
BEGIN;

ALTER TABLE public.tenant_memberships
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz;

CREATE TABLE IF NOT EXISTS public.tenant_staff_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('access_updated','deactivated','reactivated','membership_removed')),
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tenant_staff_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_staff_audit_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_staff_audit_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.tenant_staff_audit_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.tenant_staff_audit_events_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.owner_update_tenant_staff(
  p_tenant_id uuid,
  p_user_id uuid,
  p_role text,
  p_branch_ids uuid[]
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_member public.tenant_memberships%rowtype;
  v_old_branches uuid[];
  v_next_branches uuid[];
BEGIN
  IF v_actor IS NULL OR NOT private.is_active_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'Verified restaurant owner access required' USING ERRCODE='42501';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('cashier','kitchen','dispatcher','rider') THEN
    RAISE EXCEPTION 'Choose a valid staff role' USING ERRCODE='22023';
  END IF;
  IF p_branch_ids IS NULL OR cardinality(p_branch_ids) < 1 OR cardinality(p_branch_ids) > 50 THEN
    RAISE EXCEPTION 'Select at least one and no more than 50 branches' USING ERRCODE='22023';
  END IF;
  IF cardinality(p_branch_ids) <> (SELECT count(DISTINCT selected.branch_id) FROM unnest(p_branch_ids) AS selected(branch_id)) THEN
    RAISE EXCEPTION 'Duplicate branch selection is not allowed' USING ERRCODE='22023';
  END IF;
  IF cardinality(p_branch_ids) <> (
    SELECT count(*) FROM public.branches b
    WHERE b.tenant_id=p_tenant_id AND b.id=ANY(p_branch_ids) AND b.is_active=true
  ) THEN
    RAISE EXCEPTION 'Every assigned branch must be active and belong to this restaurant' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_member FROM public.tenant_memberships m
  WHERE m.tenant_id=p_tenant_id AND m.user_id=p_user_id
    AND m.role IN ('cashier','kitchen','dispatcher','rider')
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Staff account not found' USING ERRCODE='P0002'; END IF;

  SELECT coalesce(array_agg(bm.branch_id ORDER BY bm.branch_id),'{}'::uuid[])
  INTO v_old_branches FROM public.branch_memberships bm
  WHERE bm.tenant_id=p_tenant_id AND bm.user_id=p_user_id;
  SELECT array_agg(branch_id ORDER BY branch_id) INTO v_next_branches
  FROM (SELECT DISTINCT selected.branch_id FROM unnest(p_branch_ids) AS selected(branch_id)) chosen;

  UPDATE public.tenant_memberships SET role=p_role WHERE tenant_id=p_tenant_id AND user_id=p_user_id;
  DELETE FROM public.branch_memberships WHERE tenant_id=p_tenant_id AND user_id=p_user_id;
  INSERT INTO public.branch_memberships(tenant_id,branch_id,user_id)
  SELECT p_tenant_id,selected.branch_id,p_user_id FROM unnest(v_next_branches) AS selected(branch_id);

  INSERT INTO public.tenant_staff_audit_events(tenant_id,target_user_id,actor_user_id,event_type,before_state,after_state)
  VALUES(p_tenant_id,p_user_id,v_actor,'access_updated',
    jsonb_build_object('role',v_member.role,'branch_ids',to_jsonb(v_old_branches)),
    jsonb_build_object('role',p_role,'branch_ids',to_jsonb(v_next_branches)));
  RETURN jsonb_build_object('success',true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.owner_set_tenant_staff_status(
  p_tenant_id uuid,
  p_user_id uuid,
  p_status text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_member public.tenant_memberships%rowtype;
BEGIN
  IF v_actor IS NULL OR NOT private.is_active_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'Verified restaurant owner access required' USING ERRCODE='42501';
  END IF;
  IF p_status NOT IN ('active','disabled') OR p_status IS NULL THEN
    RAISE EXCEPTION 'Invalid staff status' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_member FROM public.tenant_memberships m
  WHERE m.tenant_id=p_tenant_id AND m.user_id=p_user_id
    AND m.role IN ('cashier','kitchen','dispatcher','rider')
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Staff account not found' USING ERRCODE='P0002'; END IF;
  IF p_status='disabled' AND v_member.role='rider' AND EXISTS (
    SELECT 1 FROM public.delivery_assignments da
    WHERE da.tenant_id=p_tenant_id AND da.rider_user_id=p_user_id
      AND da.status IN ('assigned','accepted','out_for_delivery','arrived_at_customer')
  ) THEN
    RAISE EXCEPTION 'Reassign or complete this rider’s active deliveries before deactivation' USING ERRCODE='23514';
  END IF;

  UPDATE public.tenant_memberships
  SET status=p_status, disabled_at=CASE WHEN p_status='disabled' THEN now() ELSE NULL END
  WHERE tenant_id=p_tenant_id AND user_id=p_user_id;
  INSERT INTO public.tenant_staff_audit_events(tenant_id,target_user_id,actor_user_id,event_type,before_state,after_state)
  VALUES(p_tenant_id,p_user_id,v_actor,
    CASE WHEN p_status='disabled' THEN 'deactivated' ELSE 'reactivated' END,
    jsonb_build_object('status',v_member.status),
    jsonb_build_object('status',p_status));
  RETURN jsonb_build_object('success',true,'status',p_status);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.system_admin_list_deactivated_staff()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_staff jsonb;
BEGIN
  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Verified platform administrator access required' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'tenant_id',m.tenant_id,'tenant_name',t.name,'user_id',m.user_id,
    'email',u.email,'display_name',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.raw_user_meta_data->>'name',''),u.email),
    'role',m.role,'disabled_at',m.disabled_at,
    'branches',coalesce((SELECT jsonb_agg(b.name ORDER BY b.name)
      FROM public.branch_memberships bm JOIN public.branches b
        ON b.tenant_id=bm.tenant_id AND b.id=bm.branch_id
      WHERE bm.tenant_id=m.tenant_id AND bm.user_id=m.user_id),'[]'::jsonb)
  ) ORDER BY m.disabled_at NULLS LAST,t.name,u.email),'[]'::jsonb)
  INTO v_staff
  FROM public.tenant_memberships m
  JOIN public.tenants t ON t.id=m.tenant_id
  JOIN auth.users u ON u.id=m.user_id
  WHERE m.role IN ('cashier','kitchen','dispatcher','rider') AND m.status='disabled';
  RETURN jsonb_build_object('staff',v_staff);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.system_admin_delete_deactivated_staff(
  p_tenant_id uuid,
  p_user_id uuid
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_member public.tenant_memberships%rowtype;
  v_branches uuid[];
BEGIN
  IF v_actor IS NULL OR NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Verified platform administrator access required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_member FROM public.tenant_memberships m
  WHERE m.tenant_id=p_tenant_id AND m.user_id=p_user_id
    AND m.role IN ('cashier','kitchen','dispatcher','rider') AND m.status='disabled'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only deactivated restaurant staff can be removed' USING ERRCODE='42501'; END IF;
  SELECT coalesce(array_agg(branch_id ORDER BY branch_id),'{}'::uuid[])
  INTO v_branches FROM public.branch_memberships
  WHERE tenant_id=p_tenant_id AND user_id=p_user_id;
  INSERT INTO public.tenant_staff_audit_events(tenant_id,target_user_id,actor_user_id,event_type,before_state,after_state)
  VALUES(p_tenant_id,p_user_id,v_actor,'membership_removed',
    jsonb_build_object('role',v_member.role,'status',v_member.status,'branch_ids',to_jsonb(v_branches)),
    jsonb_build_object('membership_removed',true));
  DELETE FROM public.tenant_memberships WHERE tenant_id=p_tenant_id AND user_id=p_user_id;
  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION public.owner_update_tenant_staff(uuid,uuid,text,uuid[]),
  public.owner_set_tenant_staff_status(uuid,uuid,text),
  public.system_admin_list_deactivated_staff(),
  public.system_admin_delete_deactivated_staff(uuid,uuid)
FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.owner_update_tenant_staff(uuid,uuid,text,uuid[]),
  public.owner_set_tenant_staff_status(uuid,uuid,text),
  public.system_admin_list_deactivated_staff(),
  public.system_admin_delete_deactivated_staff(uuid,uuid)
FROM authenticated;
GRANT EXECUTE ON FUNCTION public.owner_update_tenant_staff(uuid,uuid,text,uuid[]),
  public.owner_set_tenant_staff_status(uuid,uuid,text),
  public.system_admin_list_deactivated_staff(),
  public.system_admin_delete_deactivated_staff(uuid,uuid)
TO authenticated;

COMMIT;
