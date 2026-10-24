-- W2T-002 performance advisor: index the tenant/user composite foreign key.
CREATE INDEX branch_memberships_tenant_user_fk_idx
  ON public.branch_memberships (tenant_id, user_id);
