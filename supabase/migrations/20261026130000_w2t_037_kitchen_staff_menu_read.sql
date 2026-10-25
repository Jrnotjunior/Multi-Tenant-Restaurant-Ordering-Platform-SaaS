-- Allow active restaurant staff to read their tenant's menu in the kitchen workspace.
-- This is read-only; menu writes remain restricted to restaurant owners.
drop policy if exists menu_categories_active_staff_select on public.menu_categories;
create policy menu_categories_active_staff_select
  on public.menu_categories
  for select
  to authenticated
  using (private.is_active_member(tenant_id));

drop policy if exists menu_items_active_staff_select on public.menu_items;
create policy menu_items_active_staff_select
  on public.menu_items
  for select
  to authenticated
  using (private.is_active_member(tenant_id));
