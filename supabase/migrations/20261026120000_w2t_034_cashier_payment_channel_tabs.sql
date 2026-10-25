-- Expose verified PayMongo payment origin to the cashier workspace payment tabs.
BEGIN;
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
      o.order_status,o.payment_status, case when exists (select 1 from public.customer_order_payment_sessions ps where ps.tenant_id=o.tenant_id and ps.order_id=o.id and ps.status='paid') then 'online' else 'other' end as payment_channel, o.created_at,o.updated_at,da.rider_user_id as assigned_rider_user_id,da.status as assignment_status,
      coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'line_number',i.line_number,'item_name',i.item_name_snapshot,
        'unit_price_centavos',i.unit_price_centavos,'quantity',i.quantity,'line_total_centavos',i.line_total_centavos,
        'options',i.options_snapshot) order by i.line_number) from public.customer_order_items i
        where i.tenant_id=o.tenant_id and i.order_id=o.id),'[]'::jsonb) as items
    from public.customer_orders o join public.branches b on b.tenant_id=o.tenant_id and b.id=o.branch_id
    left join public.delivery_assignments da on da.tenant_id=o.tenant_id and da.order_id=o.id
    where o.tenant_id=p_tenant_id
      and (p_filter='all' or o.order_status in ('pending_confirmation','confirmed','preparing','ready_for_dispatch','out_for_delivery'))
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
COMMIT;
