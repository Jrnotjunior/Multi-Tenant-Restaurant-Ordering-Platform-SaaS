-- POS cashier membership role; cashiers must be assigned to specific branches.
BEGIN;
ALTER TABLE public.tenant_memberships DROP CONSTRAINT IF EXISTS tenant_memberships_role_check;
ALTER TABLE public.tenant_memberships ADD CONSTRAINT tenant_memberships_role_check CHECK (role IN ('restaurant_owner','kitchen','dispatcher','rider','cashier'));
COMMIT;
