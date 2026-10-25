-- W2T-034: owner-managed staff directory and invitation support.
begin;

create or replace function private.request_privileged_invitation(
  p_tenant_id uuid, p_email text, p_role text, p_branch_id uuid default null
)
returns uuid language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email,'')));
  v_invite uuid;
begin
  if v_user is null or not private.privileged_session_verified() then
    raise exception 'Verified privileged session required' using errcode='42501';
  end if;
  if p_role not in ('restaurant_owner','cashier','kitchen','dispatcher','rider') or p_role is null then
    raise exception 'Invalid invitation role' using errcode='22023';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
     or char_length(v_email) not between 5 and 254 then
    raise exception 'Invalid invitation email' using errcode='22023';
  end if;
  if p_role = 'restaurant_owner' then
    if not private.is_platform_admin() or p_branch_id is not null then
      raise exception 'Platform admin required to invite restaurant owners' using errcode='42501';
    end if;
    if not exists(select 1 from public.tenants t where t.id=p_tenant_id and t.status in ('provisioning','active')) then
      raise exception 'Tenant unavailable' using errcode='42501';
    end if;
  else
    if not private.is_active_owner(p_tenant_id) then
      raise exception 'Restaurant owner required to invite staff' using errcode='42501';
    end if;
    if p_branch_id is null or not exists(
      select 1 from public.branches b join public.tenants t on t.id=b.tenant_id
      where b.id=p_branch_id and b.tenant_id=p_tenant_id and b.is_active=true and t.status='active'
    ) then raise exception 'Active branch in own tenant required' using errcode='42501'; end if;
  end if;
  if (select count(*) from public.privileged_invitations where invited_by=v_user and created_at>now()-interval '1 hour')>=20 then
    raise exception 'Invitation limit reached' using errcode='42501';
  end if;
  insert into public.privileged_invitations(tenant_id,email,role,branch_id,invited_by)
  values(p_tenant_id,v_email,p_role,p_branch_id,v_user) returning id into v_invite;
  return v_invite;
exception when unique_violation then
  raise exception 'A pending invitation already exists for this recipient and tenant' using errcode='23505';
end;
$fn$;

create or replace function public.request_privileged_invitation(
  p_tenant_id uuid, p_email text, p_role text, p_branch_id uuid default null
)
returns uuid language sql security definer set search_path = ''
as $fn$ select private.request_privileged_invitation(p_tenant_id,p_email,p_role,p_branch_id); $fn$;

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
      'user_id',m.user_id,'email',u.email,'display_name',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.raw_user_meta_data->>'name',''),u.email),
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
revoke all on function public.request_privileged_invitation(uuid,text,text,uuid) from public,anon;
grant execute on function public.request_privileged_invitation(uuid,text,text,uuid) to authenticated;

commit;
