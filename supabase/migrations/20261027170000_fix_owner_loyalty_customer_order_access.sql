-- Use the canonical active-owner authorization helper for customer order reads.
-- This keeps owner access scoped to the authenticated user's own tenant.
drop policy if exists "Restaurant owners can read tenant customer orders" on public.customer_orders;

create policy "Restaurant owners can read tenant customer orders"
  on public.customer_orders
  for select
  to authenticated
  using (private.is_active_owner(tenant_id));
