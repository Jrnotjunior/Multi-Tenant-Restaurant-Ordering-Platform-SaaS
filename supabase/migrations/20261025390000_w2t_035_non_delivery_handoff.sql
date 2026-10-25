-- W2T-035: support pickup and dine-in handoff without rider dispatch.
begin;
alter table public.customer_orders drop constraint if exists customer_orders_order_status_check;
alter table public.customer_orders add constraint customer_orders_order_status_check
  check (order_status = any (array['pending_confirmation','confirmed','rejected','cancelled','preparing','ready_for_dispatch','ready_for_pickup','out_for_delivery','delivered','completed']));
create or replace function public.list_staff_orders(p_tenant_id uuid, p_filter text default 'active', p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare v_user uuid := (select auth.uid()); v_role text; v_orders jsonb;
begin
  if v_user is null or not private.privileged_session_verified() then raise exception 'Verified MFA session required' using errcode='42501'; end if;
  if p_filter not in ('active','all') or p_filter is null then raise exception 'Invalid order filter' using errcode='22023'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'Order limit must be between 1 and 100' using errcode='22023'; end if;
  select m.role into v_role from public.tenant_memberships m where m.tenant_id=p_tenant_id and m.user_id=v_user and m.status='active';
  if v_role is null or v_role not in ('restaurant_owner','cashier','kitchen','dispatcher','rider') then raise exception 'Active restaurant staff access required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc), '[]'::jsonb) into v_orders
  from (
    select o.id,o.order_number,o.tenant_id,o.branch_id,b.name as branch_name,o.order_type,o.customer_name,o.customer_phone,
      o.delivery_address,o.delivery_notes,o.currency,o.subtotal_centavos,o.delivery_fee_centavos,o.total_centavos,
      o.order_status,o.payment_status,o.created_at,o.updated_at,da.rider_user_id as assigned_rider_user_id,da.status as assignment_status,
      coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'line_number',i.line_number,'item_name',i.item_name_snapshot,
        'unit_price_centavos',i.unit_price_centavos,'quantity',i.quantity,'line_total_centavos',i.line_total_centavos,
        'options',i.options_snapshot) order by i.line_number) from public.customer_order_items i
        where i.tenant_id=o.tenant_id and i.order_id=o.id),'[]'::jsonb) as items
    from public.customer_orders o join public.branches b on b.tenant_id=o.tenant_id and b.id=o.branch_id
    left join public.delivery_assignments da on da.tenant_id=o.tenant_id and da.order_id=o.id
    where o.tenant_id=p_tenant_id
      and (p_filter='all' or o.order_status in ('pending_confirmation','confirmed','preparing','ready_for_dispatch','ready_for_pickup','out_for_delivery'))
      and (
        v_role='restaurant_owner'
        or (v_role='rider' and da.rider_user_id=v_user and (p_filter='all' or da.status in ('assigned','accepted','out_for_delivery')))
        or (v_role in ('cashier','kitchen','dispatcher') and exists(select 1 from public.branch_memberships bm
          where bm.tenant_id=o.tenant_id and bm.branch_id=o.branch_id and bm.user_id=v_user))
      )
      and (v_role<>'kitchen' or p_filter='all' or o.order_status in ('confirmed','preparing','ready_for_dispatch'))
      and (v_role<>'dispatcher' or p_filter='all' or o.order_status in ('ready_for_dispatch','out_for_delivery'))
      and (v_role<>'rider' or p_filter='all' or o.order_status='out_for_delivery' or da.status in ('assigned','accepted'))
    order by o.created_at desc limit p_limit
  ) q;
  return jsonb_build_object('orders',v_orders,'filter',p_filter,'limit',p_limit);
end;
$function$;

create or replace function public.transition_staff_order(p_tenant_id uuid,p_order_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_user uuid := (select auth.uid()); v_role text; v_order public.customer_orders%rowtype; v_assignment public.delivery_assignments%rowtype; v_next_status text;
begin
  if v_user is null or not private.privileged_session_verified() then raise exception 'Verified MFA session required' using errcode='42501'; end if;
  if p_action is null or p_action not in ('confirm','reject','start_preparing','mark_ready','dispatch','accept_delivery','deliver','cancel','complete_handoff') then
    raise exception 'Invalid order action' using errcode='22023'; end if;
  select m.role into v_role from public.tenant_memberships m where m.tenant_id=p_tenant_id and m.user_id=v_user and m.status='active';
  if v_role is null or v_role not in ('restaurant_owner','cashier','kitchen','dispatcher','rider') then raise exception 'Active restaurant staff access required' using errcode='42501'; end if;
  select o.* into v_order from public.customer_orders o where o.tenant_id=p_tenant_id and o.id=p_order_id for update;
  if not found then raise exception 'Order not found' using errcode='P0002'; end if;
  if v_role<>'restaurant_owner' and not exists(select 1 from public.branch_memberships bm
    where bm.tenant_id=p_tenant_id and bm.branch_id=v_order.branch_id and bm.user_id=v_user)
    then raise exception 'You do not have access to this branch' using errcode='42501'; end if;
  if v_role in ('restaurant_owner','cashier') and p_action in ('confirm','reject','cancel','complete_handoff') then
    v_next_status:=case p_action
      when 'confirm' then case when v_order.order_status='pending_confirmation' and v_order.total_centavos is not null then 'confirmed' end
      when 'reject' then case when v_order.order_status='pending_confirmation' then 'rejected' end
      when 'cancel' then case when v_order.order_status in ('pending_confirmation','confirmed') then 'cancelled' end
      when 'complete_handoff' then case when v_order.order_status='ready_for_pickup' then 'completed' end end;
  elsif v_role='kitchen' and p_action in ('start_preparing','mark_ready') then
    v_next_status:=case p_action when 'start_preparing' then case when v_order.order_status='confirmed' then 'preparing' end
      when 'mark_ready' then case when v_order.order_status='preparing' then case when v_order.order_type='delivery' then 'ready_for_dispatch' else 'ready_for_pickup' end end end;
  elsif v_role in ('restaurant_owner','dispatcher') and p_action='dispatch' then
    select da.* into v_assignment from public.delivery_assignments da where da.tenant_id=p_tenant_id and da.order_id=p_order_id for update;
    if not found or v_assignment.status not in ('assigned','accepted') then raise exception 'Assign an active rider before dispatching this order' using errcode='22023'; end if;
    if v_order.order_type<>'delivery' then raise exception 'Only delivery orders can be dispatched to a rider' using errcode='22023'; end if;
    if v_order.order_status='ready_for_dispatch' then v_next_status:='out_for_delivery';
      update public.delivery_assignments set status='out_for_delivery',updated_at=now() where tenant_id=p_tenant_id and order_id=p_order_id; end if;
  elsif v_role='rider' and p_action='accept_delivery' then
    update public.delivery_assignments set status='accepted',updated_at=now()
      where tenant_id=p_tenant_id and order_id=p_order_id and rider_user_id=v_user and status='assigned';
    if not found then raise exception 'This delivery is not assigned to your account' using errcode='42501'; end if;
    return jsonb_build_object('success',true,'order_id',p_order_id,'order_status',v_order.order_status,'assignment_status','accepted');
  elsif v_role='rider' and p_action='deliver' then
    select da.* into v_assignment from public.delivery_assignments da where da.tenant_id=p_tenant_id and da.order_id=p_order_id and da.rider_user_id=v_user for update;
    if not found or v_assignment.status<>'out_for_delivery' or v_order.order_status<>'out_for_delivery' then
      raise exception 'Only your active delivery can be completed' using errcode='42501'; end if;
    v_next_status:='delivered';
    update public.delivery_assignments set status='delivered',updated_at=now(),delivered_at=now()
      where tenant_id=p_tenant_id and order_id=p_order_id and rider_user_id=v_user;
  else raise exception 'This role cannot perform that action' using errcode='42501';
  end if;
  if v_next_status is null then raise exception 'This action is not allowed for the current order status' using errcode='22023'; end if;
  update public.customer_orders set order_status=v_next_status,updated_at=now() where tenant_id=p_tenant_id and id=p_order_id;
  return jsonb_build_object('success',true,'order_id',v_order.id,'order_number',v_order.order_number,
    'previous_status',v_order.order_status,'order_status',v_next_status,'payment_status',v_order.payment_status);
end;
$function$;
commit;
