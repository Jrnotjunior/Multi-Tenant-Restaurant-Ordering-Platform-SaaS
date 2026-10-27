-- The owner RLS policy limits rows to the authenticated owner's tenant.
-- Table privileges are separate from RLS; authenticated needs SELECT to query the table.
grant select on table public.customer_orders to authenticated;
