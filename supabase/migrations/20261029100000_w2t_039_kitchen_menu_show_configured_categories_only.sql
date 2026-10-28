-- Kitchen category tabs should only show owner-published categories that
-- currently contain at least one published menu item for this tenant.
-- This prevents orphaned, unpublished, or empty category records from appearing
-- as selectable tabs in the kitchen workplace.
create or replace function public.list_kitchen_menu(p_tenant_id uuid, p_branch_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_role text;
  v_branch uuid;
  v_branches jsonb;
  v_categories jsonb;
  v_items jsonb;
begin
  if v_user is null or not private.privileged_session_verified() then
    raise exception 'Verified MFA session required' using errcode='42501';
  end if;

  select m.role into v_role
  from public.tenant_memberships m
  where m.tenant_id=p_tenant_id and m.user_id=v_user and m.status='active';

  if v_role is distinct from 'kitchen' then
    raise exception 'Kitchen staff access required' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'slug',b.slug) order by b.name,b.id),'[]'::jsonb)
  into v_branches
  from public.branches b
  join public.branch_memberships bm on bm.tenant_id=b.tenant_id and bm.branch_id=b.id and bm.user_id=v_user
  where b.tenant_id=p_tenant_id and b.is_active;

  if jsonb_array_length(v_branches)=0 then
    raise exception 'No active branch assigned to this kitchen account' using errcode='42501';
  end if;

  if p_branch_id is not null then
    if not exists (
      select 1 from public.branch_memberships bm join public.branches b
        on b.tenant_id=bm.tenant_id and b.id=bm.branch_id
      where bm.tenant_id=p_tenant_id and bm.branch_id=p_branch_id and bm.user_id=v_user and b.is_active
    ) then raise exception 'You do not have access to this branch' using errcode='42501'; end if;
    v_branch := p_branch_id;
  else
    select b.id into v_branch
    from public.branches b
    join public.branch_memberships bm on bm.tenant_id=b.tenant_id and bm.branch_id=b.id and bm.user_id=v_user
    where b.tenant_id=p_tenant_id and b.is_active
    order by b.name,b.id limit 1;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'tenant_id',c.tenant_id,'name',c.name,'is_published',c.is_published,'sort_order',c.sort_order) order by c.sort_order,c.name),'[]'::jsonb)
    into v_categories
  from public.menu_categories c
  where c.tenant_id=p_tenant_id
    and c.is_published
    and exists (
      select 1 from public.menu_items i
      where i.tenant_id=c.tenant_id
        and i.category_id=c.id
        and i.status='published'
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,'tenant_id',i.tenant_id,'category_id',i.category_id,'name',i.name,
    'description',i.description,'image_path',i.image_path,'price_centavos',coalesce(bmi.price_override_centavos,i.price_centavos),
    'status',i.status,'is_popular',i.is_popular,'sort_order',i.sort_order,
    'is_available',coalesce(bmi.is_available,false)
  ) order by c.sort_order,i.sort_order,i.name,i.id),'[]'::jsonb)
    into v_items
  from public.menu_items i
  join public.menu_categories c on c.tenant_id=i.tenant_id and c.id=i.category_id
  left join public.branch_menu_items bmi on bmi.tenant_id=i.tenant_id and bmi.item_id=i.id and bmi.branch_id=v_branch
  where i.tenant_id=p_tenant_id;

  return jsonb_build_object('branch_id',v_branch,'branches',v_branches,'categories',v_categories,'items',v_items);
end;
$function$;

revoke all on function public.list_kitchen_menu(uuid,uuid) from public, anon;
grant execute on function public.list_kitchen_menu(uuid,uuid) to authenticated;
