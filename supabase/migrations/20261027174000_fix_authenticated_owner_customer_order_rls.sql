-- Allow an authenticated restaurant owner to read customer orders for their own tenant.
-- This helper deliberately avoids private.is_active_owner(), which requires a privileged
-- session and is therefore unsuitable for evaluating a normal browser user's RLS policy.
create or replace function private.is_authenticated_restaurant_owner(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.tenant_memberships as m
      where m.tenant_id = p_tenant_id
        and m.user_id = (select auth.uid())
        and m.role = 'restaurant_owner'
        and m.status = 'active'
    );
$function$;

revoke all on function private.is_authenticated_restaurant_owner(uuid) from public;
revoke all on function private.is_authenticated_restaurant_owner(uuid) from anon;
grant execute on function private.is_authenticated_restaurant_owner(uuid) to authenticated;

drop policy if exists "Restaurant owners can read tenant customer orders" on public.customer_orders;
create policy "Restaurant owners can read tenant customer orders"
  on public.customer_orders
  for select
  to authenticated
  using (private.is_authenticated_restaurant_owner(tenant_id));
