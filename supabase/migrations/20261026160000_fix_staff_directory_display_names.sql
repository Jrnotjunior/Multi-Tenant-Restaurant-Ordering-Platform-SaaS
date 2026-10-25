-- Fix staff directory names: use all supported auth metadata name fields and never email.
begin;

create or replace function public.list_tenant_staff(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $fn$
declare v_user uuid := auth.uid(); v_result jsonb;
begin
  if v_user is null or not private.privileged_session_verified() then
    raise exception 'Verified MFA session required' using errcode='42501';
  end if;
  if not private.is_active_owner(p_tenant_id) then
    raise exception 'Active restaurant owner access required' using errcode='42501';
  end if;
  select jsonb_build_object(
    'branches', coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'slug',b.slug,'is_active',b.is_active) order by b.name)
      from public.branches b where b.tenant_id=p_tenant_id),'[]'::jsonb),
    'staff', coalesce((select jsonb_agg(jsonb_build_object(
      'user_id',m.user_id,'email',u.email,
      'display_name',coalesce(
        nullif(btrim(u.raw_user_meta_data->>'preferred_name'),''),
        nullif(btrim(u.raw_user_meta_data->>'display_name'),''),
        nullif(btrim(u.raw_user_meta_data->>'full_name'),''),
        nullif(btrim(u.raw_user_meta_data->>'name'),''),
        nullif(btrim(concat_ws(' ',nullif(btrim(u.raw_user_meta_data->>'first_name'),''),nullif(btrim(u.raw_user_meta_data->>'last_name'),''))),''),
        initcap(replace(m.role,'_',' '))
      ),
      'role',m.role,'status',m.status,'branches',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) order by b.name)
        from public.branch_memberships bm join public.branches b on b.id=bm.branch_id and b.tenant_id=bm.tenant_id
        where bm.tenant_id=m.tenant_id and bm.user_id=m.user_id),'[]'::jsonb))
      order by m.created_at desc)
      from public.tenant_memberships m join auth.users u on u.id=m.user_id
      where m.tenant_id=p_tenant_id and m.role in ('cashier','kitchen','dispatcher','rider')),'[]'::jsonb),
    'invitations', coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'email',i.email,'role',i.role,'branch_id',i.branch_id,'branch_name',b.name,'status',i.status,
      'created_at',i.created_at,'sent_at',i.sent_at,'expires_at',i.expires_at)
      order by i.created_at desc)
      from public.privileged_invitations i left join public.branches b on b.tenant_id=i.tenant_id and b.id=i.branch_id
      where i.tenant_id=p_tenant_id and i.role in ('cashier','kitchen','dispatcher','rider') and i.status in ('pending','sent')),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$fn$;

revoke all on function public.list_tenant_staff(uuid) from public,anon;
grant execute on function public.list_tenant_staff(uuid) to authenticated;

commit;
