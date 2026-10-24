-- W2T-003 hardening: only eligible users should be asked to enroll/challenge MFA
-- on a privileged UI route. Does not itself grant any operational permission.
BEGIN;

CREATE FUNCTION private.privileged_route_eligible(p_workspace text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
  SELECT (SELECT auth.uid()) IS NOT NULL AND CASE p_workspace
    WHEN 'admin' THEN EXISTS (
      SELECT 1 FROM public.platform_admins a
      WHERE a.user_id = (SELECT auth.uid()) AND a.is_active
    )
    WHEN 'restaurant' THEN (
      EXISTS (
        SELECT 1
        FROM public.tenant_memberships m
        JOIN public.tenants t ON t.id=m.tenant_id
        WHERE m.user_id = (SELECT auth.uid()) AND m.status='active'
          AND t.status IN ('active','provisioning')
      )
      OR EXISTS (
        SELECT 1 FROM public.privileged_invitations i
        JOIN auth.users u ON u.id=i.invited_user_id
        JOIN public.tenants t ON t.id=i.tenant_id
        LEFT JOIN public.branches b ON b.id=i.branch_id AND b.tenant_id=i.tenant_id
        WHERE i.invited_user_id = (SELECT auth.uid())
          AND i.email=lower(btrim(u.email))
          AND u.email_confirmed_at IS NOT NULL
          AND i.status='sent'
          AND i.expires_at > now()
          AND t.status IN ('active','provisioning')
          AND (i.branch_id IS NULL OR (b.id IS NOT NULL AND b.is_active AND t.status='active'))
      )
    )
    ELSE false
  END;
$fn$;

REVOKE ALL ON FUNCTION private.privileged_route_eligible(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.privileged_route_eligible(text) TO authenticated;

CREATE FUNCTION public.privileged_route_eligible(p_workspace text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $fn$
  SELECT private.privileged_route_eligible(p_workspace);
$fn$;
REVOKE ALL ON FUNCTION public.privileged_route_eligible(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.privileged_route_eligible(text) TO authenticated;

COMMIT;

