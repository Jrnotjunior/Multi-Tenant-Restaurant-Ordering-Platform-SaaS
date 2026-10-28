-- Never expose rider email addresses in the dispatcher assignment selector.
-- Use the user's full name; fall back to a role label when profile metadata is absent.
CREATE OR REPLACE FUNCTION public.list_branch_riders(p_tenant_id uuid, p_branch_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_role text;
  v_riders jsonb;
begin
  if v_user is null or not private.privileged_session_verified() then
    raise exception 'Verified MFA session required' using errcode='42501';
  end if;
  select m.role into v_role from public.tenant_memberships m
  where m.tenant_id=p_tenant_id and m.user_id=v_user and m.status='active';
  if v_role not in ('restaurant_owner','dispatcher') or v_role is null then
    raise exception 'Dispatcher access required' using errcode='42501';
  end if;
  if v_role <> 'restaurant_owner' and not exists (
    select 1 from public.branch_memberships bm
    where bm.tenant_id=p_tenant_id and bm.branch_id=p_branch_id and bm.user_id=v_user
  ) then
    raise exception 'You do not have access to this branch' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',m.user_id,
    'display_name',coalesce(
      nullif(btrim(u.raw_user_meta_data->>'full_name'),''),
      nullif(btrim(concat_ws(' ', u.raw_user_meta_data->>'first_name', u.raw_user_meta_data->>'last_name')),''),
      'Rider'
    )
  ) order by coalesce(
      nullif(btrim(u.raw_user_meta_data->>'full_name'),''),
      nullif(btrim(concat_ws(' ', u.raw_user_meta_data->>'first_name', u.raw_user_meta_data->>'last_name')),''),
      'Rider'
  )), '[]'::jsonb)
  into v_riders
  from public.tenant_memberships m
  join public.branch_memberships bm on bm.tenant_id=m.tenant_id and bm.user_id=m.user_id and bm.branch_id=p_branch_id
  join auth.users u on u.id=m.user_id
  where m.tenant_id=p_tenant_id and m.role='rider' and m.status='active';
  return v_riders;
end;
$function$;
