-- Allow authenticated restaurant owners to read customer orders within their own tenant.
-- Required by the owner-facing loyalty Customers tab; RLS remains tenant-scoped.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'customer_orders'
      and policyname = 'Restaurant owners can read tenant customer orders'
  ) then
    create policy "Restaurant owners can read tenant customer orders"
      on public.customer_orders
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.tenant_memberships m
          where m.tenant_id = customer_orders.tenant_id
            and m.user_id = (select auth.uid())
            and m.status = 'active'
            and m.role = 'restaurant_owner'
        )
      );
  end if;
end
$$;
